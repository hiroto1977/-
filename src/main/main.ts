import { app, BrowserWindow, ipcMain, shell } from 'electron';
import path from 'node:path';
import {
  clearToken,
  getValidToken,
  listConfiguredServices,
  setOAuthTokens,
  setToken,
} from './secrets';
import { LIVE_ACTIONS, LIVE_FETCHERS, LOCAL_SERVICES, type ServiceId } from './clients';
import { authorize, isOAuthSupported, OAUTH_CONFIGS } from './oauth';

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
    // Same http(s) allowlist as the IPC handler. Anything else (file:,
    // javascript:, OS schemes) is silently dropped.
    try {
      const u = new URL(url);
      if (u.protocol === 'http:' || u.protocol === 'https:') {
        shell.openExternal(u.toString());
      }
    } catch {
      // ignore non-URL strings
    }
    return { action: 'deny' };
  });

  // Block all in-app navigation away from the loaded renderer; this
  // includes the renderer trying to navigate via window.location.
  win.webContents.on('will-navigate', (event, navigationUrl) => {
    try {
      const u = new URL(navigationUrl);
      // Allow Vite HMR navigation only.
      if (u.host === 'localhost:5173' || u.host === '127.0.0.1:5173') return;
    } catch {
      // fall through
    }
    event.preventDefault();
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
  // Defense-in-depth: the renderer is sandboxed and contextIsolated,
  // but the IPC channel accepts any string. Restrict to http(s) to
  // block javascript:, data:, file:, and custom-scheme URI handlers
  // that could escalate (e.g. ssh:// on macOS, ms-windows-store://
  // on Windows).
  if (typeof url !== 'string') return;
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return;
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return;
  await shell.openExternal(parsed.toString());
});

ipcMain.handle('secrets:set', async (_e, serviceId: ServiceId, token: string) => {
  // Basic input hygiene — anything else gets silently dropped so a
  // confused renderer / compromised preload can't corrupt the store.
  if (typeof serviceId !== 'string' || typeof token !== 'string') return;
  const trimmed = token.trim();
  if (trimmed.length === 0 || trimmed.length > 65536) return;
  await setToken(serviceId, trimmed);
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
  // LOCAL_SERVICES (e.g. 'skills', 'security') read primarily from disk
  // and must work without a saved token. We still pass any saved token
  // through — security uses it for opt-in HIBP/VT enrichment.
  let token = '';
  if (LOCAL_SERVICES.has(serviceId)) {
    token = (await getValidToken(serviceId)) ?? '';
  } else {
    const t = await getValidToken(serviceId);
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
    const token = await getValidToken(serviceId);
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

ipcMain.handle('oauth:isSupported', (_e, serviceId: ServiceId) => isOAuthSupported(serviceId));

ipcMain.handle('oauth:authorize', async (_e, serviceId: ServiceId) => {
  const config = OAUTH_CONFIGS[serviceId];
  if (!config || !config.clientId) {
    return {
      ok: false,
      code: 'not_supported',
      message: 'このサービスは OAuth 未対応、または OAuth クライアント ID 未設定',
    };
  }
  try {
    const tokens = await authorize(config);
    await setOAuthTokens(serviceId, tokens);
    return { ok: true, data: { scope: tokens.scope, expiresAt: tokens.expiresAt } };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, code: 'authorize_failed', message };
  }
});
