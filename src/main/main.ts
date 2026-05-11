import { app, BrowserWindow, ipcMain, shell } from 'electron';
import path from 'node:path';
import { clearToken, getToken, listConfiguredServices, setToken } from './secrets';
import { LIVE_FETCHERS, type ServiceId } from './clients';

const isDev = !app.isPackaged;

function createWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 960,
    minHeight: 600,
    title: 'Service Hub',
    backgroundColor: '#0f1117',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  if (isDev && process.env.VITE_DEV_SERVER_URL) {
    win.loadURL(process.env.VITE_DEV_SERVER_URL);
    win.webContents.openDevTools({ mode: 'detach' });
  } else {
    win.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  return win;
}

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

ipcMain.handle('app:getVersion', () => app.getVersion());
ipcMain.handle('app:openExternal', async (_e, url: string) => {
  await shell.openExternal(url);
});

ipcMain.handle('secrets:set', async (_e, serviceId: ServiceId, token: string) => {
  await setToken(serviceId, token);
});
ipcMain.handle('secrets:clear', async (_e, serviceId: ServiceId) => {
  await clearToken(serviceId);
});
ipcMain.handle('secrets:list', () => listConfiguredServices());

ipcMain.handle('fetch:snapshot', async (_e, serviceId: ServiceId) => {
  const fetcher = LIVE_FETCHERS[serviceId];
  if (!fetcher) {
    return { ok: false, code: 'not_implemented', message: `${serviceId} はライブフェッチ未対応` };
  }
  const token = await getToken(serviceId);
  if (!token) {
    return { ok: false, code: 'not_configured', message: 'トークン未設定' };
  }
  try {
    const data = await fetcher({ token });
    return { ok: true, data };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, code: 'fetch_failed', message };
  }
});
