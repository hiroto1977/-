// Headless screenshot of the exported dashboard HTML.
// Usage: xvfb-run -a npx electron --no-sandbox scripts/screenshot-dashboard.cjs

const { app, BrowserWindow } = require('electron');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');

async function run() {
  await app.whenReady();
  const filePath = path.join(
    os.homedir(),
    '.local',
    'business-hub',
    'data',
    'dashboard.html',
  );
  const win = new BrowserWindow({
    width: 1280,
    height: 1100,
    show: false,
    backgroundColor: '#0f1117',
    webPreferences: { sandbox: false },
  });
  await win.loadURL('file://' + filePath);
  await new Promise((r) => setTimeout(r, 1200));
  const img = await win.webContents.capturePage();
  const outDir = path.join(__dirname, '..', 'tmp-screenshots');
  await fs.mkdir(outDir, { recursive: true });
  const outPath = path.join(outDir, 'dashboard-rendered.png');
  await fs.writeFile(outPath, img.toPNG());
  console.log('screenshot:', outPath);
  app.quit();
}

app.whenReady().then(run).catch((e) => {
  console.error(e);
  app.exit(1);
});
