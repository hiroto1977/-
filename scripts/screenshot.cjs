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
const path = require('node:path');

const SERVICES = [
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
];

const OUT_DIR = path.join(__dirname, '..', 'tmp-screenshots');

ipcMain.handle('app:getVersion', () => '0.1.0-smoke');
ipcMain.handle('app:openExternal', () => undefined);
ipcMain.handle('secrets:list', () => []);
ipcMain.handle('secrets:set', () => undefined);
ipcMain.handle('secrets:clear', () => undefined);
ipcMain.handle('fetch:snapshot', (_e, id) => ({
  ok: false,
  code: 'not_configured',
  message: `smoke test does not call ${id}`,
}));

async function run() {
  await fs.mkdir(OUT_DIR, { recursive: true });

  const win = new BrowserWindow({
    width: 1280,
    height: 800,
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
        const items = Array.from(document.querySelectorAll('.sidebar-item'));
        const target = items.find(b => b.textContent.trim().toLowerCase().includes(${JSON.stringify(id)}));
        if (target) target.click();
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
