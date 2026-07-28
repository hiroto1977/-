// Headless smoke-test: launches Electron under xvfb-run, clicks each
// service tab, and writes a PNG to tmp-screenshots/<id>.png.
//
// Usage: xvfb-run -a npx electron --no-sandbox scripts/screenshot.cjs
//
// This is a renderer-only smoke test. It registers stub IPC handlers
// so the React app boots without errors, but does not call the live
// REST clients in src/main/clients/.

const { app, BrowserWindow, ipcMain } = require('electron');
const fs = require('node:fs/promises');
const fsSync = require('node:fs');
const path = require('node:path');

const SERVICES = [
  'home',
  'github',
  'wordpress',
  'atlassian',
  'notion',
  'drive',
  'calendar',
  'gmail',
  'slack',
  'canva',
  'skills',
  'security',
  'cloudflare',
  'emotions',
  'ollama',
  'kpi',
  'stocks',
  'business',
  'teamradar',
  'templates',
  'library',
  'settings',
];

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

  for (const id of SERVICES) {
    await win.webContents.executeJavaScript(`
      (() => {
        const target = document.querySelector('.sidebar-item[data-service-id=' + ${JSON.stringify(JSON.stringify(id))} + ']');
        if (target) target.click();
        // Reset scroll so each page is captured from the top.
        const content = document.querySelector('.content');
        if (content) content.scrollTop = 0;
      })();
    `);
    await new Promise((r) => setTimeout(r, 250));
    const image = await win.webContents.capturePage();
    await fs.writeFile(path.join(OUT_DIR, `${id}.png`), image.toPNG());
    process.stdout.write(`captured ${id}\n`);
  }

  app.quit();
}

app.whenReady().then(run).catch((err) => {
  console.error('screenshot failed:', err);
  app.exit(1);
});
