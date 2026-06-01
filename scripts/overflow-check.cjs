// 横はみ出し (見切れ) 検査: Electron で全サービスを複数の画面幅で開き、
// ページ全体がビューポート幅を超えていないか (= .app の overflow:hidden で
// 見切れていないか) を測定する。
//
// 合格条件: 各サービス・各幅で document.documentElement.scrollWidth が
// window.innerWidth を超えないこと。.content 内部での横スクロールは許容
// (見出しは固定で中身だけスクロールでき、画面外には消えないため)。
//
// Usage: xvfb-run -a electron --no-sandbox scripts/overflow-check.cjs

const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('node:path');

// 検査する画面幅 (狭い順)。ユーザーのブラウザ窓が広くない場合を想定。
const WIDTHS = [480, 640, 900, 1280];

ipcMain.handle('app:getVersion', () => '0.1.0-smoke');
ipcMain.handle('app:openExternal', () => undefined);
ipcMain.handle('secrets:list', () => []);
ipcMain.handle('secrets:set', () => undefined);
ipcMain.handle('secrets:clear', () => undefined);
ipcMain.handle('fetch:snapshot', (_e, id) => ({
  ok: false,
  code: 'not_configured',
  message: `overflow-check does not call ${id}`,
}));
// teamradar 等の invoke を無害化
ipcMain.handle('action:invoke', () => ({ ok: false, message: 'noop' }));
ipcMain.handle('oauth:isSupported', () => false);
ipcMain.handle('oauth:authorize', () => ({ ok: false, message: 'noop' }));

async function run() {
  const win = new BrowserWindow({
    width: WIDTHS[WIDTHS.length - 1],
    height: 1000,
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
  await new Promise((r) => setTimeout(r, 1200));

  // 全カテゴリを展開する (state 更新 → 再レンダリングを待ってから ID を収集)。
  await win.webContents.executeJavaScript(`
    (() => {
      document.querySelectorAll('.sidebar-nav button[aria-expanded="false"]').forEach((b) => b.click());
    })();
  `);
  await new Promise((r) => setTimeout(r, 400));
  const ids = await win.webContents.executeJavaScript(`
    Array.from(document.querySelectorAll('.sidebar-item[data-service-id]'))
      .map((el) => el.getAttribute('data-service-id'));
  `);

  const failures = [];
  let checks = 0;

  for (const width of WIDTHS) {
    // 高さは低め (700px) にして、背の高いページの縦クリップを検出する。
    win.setContentSize(width, 700);
    await new Promise((r) => setTimeout(r, 120));
    for (const id of ids) {
      await win.webContents.executeJavaScript(`
        (() => {
          const t = document.querySelector('.sidebar-item[data-service-id=' + ${JSON.stringify(JSON.stringify(id))} + ']');
          if (t) t.click();
        })();
      `);
      await new Promise((r) => setTimeout(r, 90));
      const m = await win.webContents.executeJavaScript(`
        (() => {
          const content = document.querySelector('.content');
          return {
            innerH: window.innerHeight,
            contentScrollW: content ? content.scrollWidth : 0,
            contentClientW: content ? content.clientWidth : 0,
            contentScrollH: content ? content.scrollHeight : 0,
            contentClientH: content ? content.clientHeight : 0,
          };
        })();
      `);
      checks++;
      // (横) .content の中身が表示領域より広い = はみ出し。
      // .app は overflow:hidden なので、横スクロールが効かなければ画面外に切れる。
      if (m.contentScrollW > m.contentClientW + 2) {
        failures.push({
          id, width, axis: '横',
          over: m.contentScrollW, box: m.contentClientW,
          overBy: m.contentScrollW - m.contentClientW,
        });
      }
      // (縦) .content の表示領域がウィンドウ高を超える = 高さが制約されておらず
      // 中身の高さまで広がっている → .app の overflow:hidden で下端が切れ、
      // スクロールもできない (「下が見れない」状態)。正常時は content は
      // ウィンドウ内に収まり、はみ出しは overflow-y:auto でスクロールされる。
      if (m.contentClientH > m.innerH + 2) {
        failures.push({
          id, width, axis: '縦',
          over: m.contentClientH, box: m.innerH,
          overBy: m.contentClientH - m.innerH,
        });
      }
    }
  }

  process.stdout.write(`\n${ids.length} サービス × ${WIDTHS.length} 幅 = ${checks} 件を検査\n`);
  if (failures.length === 0) {
    process.stdout.write('✅ 全サービス・全幅でページがビューポート内に収まっています (見切れなし)\n');
    app.quit();
  } else {
    process.stdout.write(`❌ ${failures.length} 件で横はみ出しを検出:\n`);
    for (const f of failures) {
      process.stdout.write(`  - ${f.id} @${f.width}px [${f.axis}]: ${f.over} > 表示 ${f.box} (超過 ${f.overBy}px)\n`);
    }
    app.exit(1);
  }
}

app.whenReady().then(run).catch((err) => {
  console.error('overflow-check failed:', err);
  app.exit(1);
});
