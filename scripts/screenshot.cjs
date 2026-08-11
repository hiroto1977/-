// Headless smoke-test: launches Electron under xvfb-run, clicks each
// service tab, and writes a PNG to tmp-screenshots/<id>.png.
//
// Usage: xvfb-run -a npx electron --no-sandbox scripts/screenshot.cjs
//
// This is a renderer-only smoke test. It registers stub IPC handlers
// so the React app boots without errors, but does not call the live
// REST clients in src/main/clients/.

const { app, BrowserWindow, ipcMain } = require('electron');
const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const fsSync = require('node:fs');
const path = require('node:path');

// 撮影対象は src/renderer/services.ts（サイドバーの真実源）から導出する。
// 手書きの固定リストだった頃は 22 件しか対象にしておらず、新規サービスを
// scaffold しても smoke の網に入らなかった。
//
// SERVICE_IDS（73 件）ではなく services.ts（71 件）を使うのは、
// uber-eats / demae-can のように **サイドバー項目を持たない** サービスが
// あるため。この 2 つは BusinessPage が内部で消費する snapshot 専用で、
// 独立したページが無い（＝スクリーンショットの対象になりえない）。
function loadSidebarServiceIds() {
  const file = path.join(__dirname, '..', 'src', 'renderer', 'services.ts');
  const text = fsSync.readFileSync(file, 'utf8');
  // `page:` を持つエントリ = サイドバーに出る = 撮影対象。
  const ids = [...text.matchAll(/^\s*id: '([a-z0-9-]+)',$/gm)].map((m) => m[1]);
  if (ids.length === 0) throw new Error('services.ts からサービス id を取り出せない');
  return ids;
}

const SERVICES = loadSidebarServiceIds();

const OUT_DIR = path.join(__dirname, '..', 'tmp-screenshots');

/*
 * スタブは **main.ts が登録する全チャンネル** を覆う必要がある。
 *
 * 覆えていないチャンネルを renderer が呼ぶと Electron が
 * "No handler registered for 'x'" を stderr に出すだけで、この smoke は
 * exit 0 のまま通ってしまう。つまり **main.ts 側で本当に登録を忘れた場合と
 * 見分けがつかない**。実際 oauth:isSupported / secrets:protection は
 * スタブ漏れでこのノイズを出し続けていた。
 *
 * そこで main.ts からチャンネル一覧を抜き出し、スタブ集合と突き合わせて
 * ズレたら落とす。新しい IPC を足したらここも足すことが強制される。
 */
const STUBS = {
  'app:getVersion': () => '0.1.0-smoke',
  'app:openExternal': () => undefined,
  'app:revealInFolder': () => undefined,
  'app:openPath': () => undefined,
  'secrets:list': () => [],
  'secrets:set': () => undefined,
  'secrets:clear': () => undefined,
  'secrets:protection': () => ({ encrypted: true, plainCount: 0, file: 'smoke' }),
  'fetch:snapshot': (_e, id) => ({
    ok: false,
    code: 'not_configured',
    message: `smoke test does not call ${id}`,
  }),
  'action:invoke': (_e, id, action) => ({
    ok: false,
    code: 'action_not_found',
    message: `smoke test does not invoke ${id}/${action}`,
  }),
  'oauth:isSupported': () => false,
  'oauth:authorize': () => ({ ok: false, code: 'not_supported', message: 'smoke test' }),
};

function mainProcessChannels() {
  const src = fsSync.readFileSync(
    path.join(__dirname, '..', 'src', 'main', 'main.ts'),
    'utf8',
  );
  // ipcMain.handle('チャンネル' … — 引数が次行に折り返される呼び出しもあるので
  // 改行を許す。
  return [...src.matchAll(/ipcMain\.handle\(\s*'([^']+)'/g)].map((m) => m[1]);
}

const missing = mainProcessChannels().filter((c) => !(c in STUBS));
const extra = Object.keys(STUBS).filter((c) => !mainProcessChannels().includes(c));
if (missing.length > 0 || extra.length > 0) {
  console.error('smoke: IPC スタブが main.ts とズレています');
  if (missing.length > 0) console.error(`  スタブ不足: ${missing.join(', ')}`);
  if (extra.length > 0) console.error(`  main.ts に無い: ${extra.join(', ')}`);
  process.exit(1);
}

for (const [channel, handler] of Object.entries(STUBS)) ipcMain.handle(channel, handler);

// クリック後、React が選択を反映し **描画されるまで** 待つ。
// 固定 sleep だけだった頃は重いページで前ページの残像を撮ることがあり、
// 実際にサイドバー隣接の tiktok→tax / linux→compliance がバイト一致していた。
async function waitForActivePaint(win, id, timeoutMs = 5000) {
  const deadline = Date.now() + timeoutMs;
  let switched = false;
  while (Date.now() < deadline) {
    switched = await win.webContents.executeJavaScript(`
      (() => {
        // 注: ここは **等値比較** なので stringify は 1 回。CSS 属性セレクタ側
        // (下のクリック処理) は引用符ごと埋める必要があるため 2 回。取り違えると
        // '\"slack\"' と比較して常に false になり、全件 STUCK に見える。
        const active = document.querySelector('.sidebar-item.active');
        return !!active && active.getAttribute('data-service-id') === ${JSON.stringify(id)};
      })();
    `);
    if (switched) break;
    await new Promise((r) => setTimeout(r, 50));
  }
  if (!switched) return false;
  // state 反映 != 描画完了。2 フレーム待って実際にペイントさせる。
  await win.webContents.executeJavaScript(
    'new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r(true))))',
  );
  return true;
}

async function run() {
  await fs.mkdir(OUT_DIR, { recursive: true });

  const win = new BrowserWindow({
    width: 1440,
    height: 1800,
    show: false,
    backgroundColor: '#0f1117',
    webPreferences: {
      preload: path.join(__dirname, '..', 'dist-electron', 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  await win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  await new Promise((r) => setTimeout(r, 1500));

  // サイドバーの 'tools' / 'integrations' は既定で畳まれており
  // (App.tsx の COLLAPSED_BY_DEFAULT)、畳まれたカテゴリの項目は
  // そもそも DOM に無い。全カテゴリを開いてからでないとクリックできない。
  const expanded = await win.webContents.executeJavaScript(`
    (() => {
      const buttons = [...document.querySelectorAll('button[aria-expanded="false"]')];
      buttons.forEach((b) => b.click());
      return buttons.length;
    })();
  `);
  process.stdout.write(`expanded ${expanded} collapsed categorie(s)\n`);
  await new Promise((r) => setTimeout(r, 250));

  const missing = [];
  const stuck = [];
  // md5 → 最初にその画で撮れたサービス id。別サービスが同じ画になるのは
  // 「そのページを撮れていない」証拠なので、最後にまとめて落とす。
  const digests = new Map();
  const duplicates = [];

  for (const id of SERVICES) {
    // クリック対象が無いことを **黙って見逃さない**。以前は
    // `if (target) target.click();` で握り潰しており、畳まれたカテゴリの
    // 16 件がホーム画面のまま撮られて「smoke green」になっていた。
    const clicked = await win.webContents.executeJavaScript(`
      (() => {
        const target = document.querySelector('.sidebar-item[data-service-id=' + ${JSON.stringify(JSON.stringify(id))} + ']');
        if (!target) return false;
        target.click();
        // Reset scroll so each page is captured from the top.
        const content = document.querySelector('.content');
        if (content) content.scrollTop = 0;
        return true;
      })();
    `);
    if (!clicked) {
      missing.push(id);
      process.stdout.write(`MISSING ${id} — サイドバーに項目が無い\n`);
      continue;
    }

    if (!(await waitForActivePaint(win, id))) {
      stuck.push(id);
      process.stdout.write(`STUCK ${id} — クリックしても選択が切り替わらない\n`);
      continue;
    }

    let png = (await win.webContents.capturePage()).toPNG();
    let digest = crypto.createHash('md5').update(png).digest('hex');
    // 同じ画が二度出る最有力の原因は「切り替わる前のフレームを撮った」。
    // 一度だけ間を置いて撮り直し、それでも一致するなら本物の重複として扱う。
    if (digests.has(digest)) {
      await new Promise((r) => setTimeout(r, 750));
      png = (await win.webContents.capturePage()).toPNG();
      digest = crypto.createHash('md5').update(png).digest('hex');
    }
    if (digests.has(digest)) duplicates.push([id, digests.get(digest)]);
    else digests.set(digest, id);

    await fs.writeFile(path.join(OUT_DIR, `${id}.png`), png);
    process.stdout.write(`captured ${id}\n`);
  }

  const problems = [];
  if (missing.length > 0) {
    problems.push(
      `${missing.length} 件のサービスをクリックできなかった: ${missing.join(', ')}\n` +
        '  サイドバーに項目が出ていないか、data-service-id が変わっている。',
    );
  }
  if (stuck.length > 0) {
    problems.push(
      `${stuck.length} 件が選択状態にならなかった: ${stuck.join(', ')}\n` +
        '  クリックは届いたが .sidebar-item.active が切り替わっていない。',
    );
  }
  if (duplicates.length > 0) {
    problems.push(
      `${duplicates.length} 件が別サービスとバイト単位で同一の画だった:\n` +
        duplicates.map(([id, first]) => `  ${id} == ${first}`).join('\n') +
        '\n  そのページを撮れていない (描画待ちが足りないか、ページが中身を出していない)。',
    );
  }
  if (problems.length > 0) {
    process.stderr.write(`\n${problems.join('\n\n')}\n`);
    app.exit(1);
    return;
  }

  process.stdout.write(`\n${digests.size} 件をすべて別画像として撮影した\n`);

  app.quit();
}

app.whenReady().then(run).catch((err) => {
  console.error('screenshot failed:', err);
  app.exit(1);
});
