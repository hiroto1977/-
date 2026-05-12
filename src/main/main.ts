import { app, BrowserWindow, ipcMain, shell } from 'electron';
import path from 'node:path';
import { clearToken, getToken, listConfiguredServices, setToken } from './secrets';
import { LIVE_ACTIONS, LIVE_FETCHERS, LOCAL_SERVICES, type ServiceId } from './clients';

const isDev = !app.isPackaged;

// In dev: build/icon.png at repo root. In production: shipped at app
// resource root via electron-builder.files (… actually we ship through
// asar; safer to load from the source path which is relative to __dirname).
function iconPath(): string {
  // dist-electron/main.js → ../build/icon.png in dev,
  // <appdir>/resources/app.asar/build/icon.png in prod.
  return path.join(__dirname, '..', 'build', 'icon.png');
}

function createWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 960,
    minHeight: 600,
    title: 'Service Hub',
    backgroundColor: '#0f1117',
    icon: iconPath(),
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
  // LOCAL_SERVICES (e.g. 'skills') read from disk and don't need a saved
  // token; everyone else must have one before we hit the network.
  let token = '';
  if (!LOCAL_SERVICES.has(serviceId)) {
    const t = await getToken(serviceId);
    if (!t) {
      return { ok: false, code: 'not_configured', message: 'トークン未設定' };
    }
    token = t;
  }
  try {
    const data = await fetcher({ token });
    return { ok: true, data };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, code: 'fetch_failed', message };
  }
});

ipcMain.handle(
  'action:invoke',
  async (_e, serviceId: ServiceId, action: string, payload: Record<string, unknown>) => {
    const actions = LIVE_ACTIONS[serviceId];
    if (!actions || !actions[action]) {
      return {
        ok: false,
        code: 'action_not_found',
        message: `${serviceId} に action "${action}" は登録されていません`,
      };
    }
    const token = await getToken(serviceId);
    if (!token) {
      return { ok: false, code: 'not_configured', message: 'トークン未設定' };
    }
    try {
      const data = await actions[action]({ token, payload: payload ?? {} });
      return { ok: true, data };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { ok: false, code: 'action_failed', message };
    }
  },
);
