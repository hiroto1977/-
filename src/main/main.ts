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
import { isServiceId } from '../shared/serviceId';
import { redactSecrets } from './clients/types';

/** All IPC handlers feed user-supplied strings as map keys. Use this
 *  before indexing to defeat prototype-pollution lookups like
 *  __proto__ / constructor. */
function safeErrorMessage(err: unknown): string {
  return redactSecrets(err instanceof Error ? err.message : String(err));
}

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

ipcMain.handle('app:revealInFolder', (_e, filePath: unknown) => {
  // Reveal a saved file in the OS file manager (Finder / Explorer / Nautilus).
  // Only accept paths under the user's home directory — the renderer should
  // only ever pass paths it just wrote via an export action, which already
  // path-traversal-guard to ~/.local/business-hub/**, but we re-check here
  // as defense-in-depth.
  if (typeof filePath !== 'string' || filePath.length === 0 || filePath.length > 1024) return;
  if (/[\0\r\n]/.test(filePath)) return;
  const resolved = require('node:path').resolve(filePath);
  const home = require('node:path').resolve(require('node:os').homedir());
  if (!resolved.startsWith(home + require('node:path').sep)) return;
  shell.showItemInFolder(resolved);
});

ipcMain.handle('app:openPath', async (_e, filePath: unknown) => {
  // Open a file with the OS default application (SVG → image viewer,
  // HTML → browser, MD → text editor, etc.). Same path-traversal guard
  // as revealInFolder above. Returns empty string on success or an error
  // string on failure (Electron's shell.openPath contract).
  if (typeof filePath !== 'string' || filePath.length === 0 || filePath.length > 1024) return;
  if (/[\0\r\n]/.test(filePath)) return;
  const resolved = require('node:path').resolve(filePath);
  const home = require('node:path').resolve(require('node:os').homedir());
  if (!resolved.startsWith(home + require('node:path').sep)) return;
  await shell.openPath(resolved);
});

ipcMain.handle('secrets:set', async (_e, serviceId: unknown, token: unknown) => {
  if (!isServiceId(serviceId) || typeof token !== 'string') return;
  const trimmed = token.trim();
  if (trimmed.length === 0 || trimmed.length > 65536) return;
  await setToken(serviceId, trimmed);
});
ipcMain.handle('secrets:clear', async (_e, serviceId: unknown) => {
  if (!isServiceId(serviceId)) return;
  await clearToken(serviceId);
});
ipcMain.handle('secrets:list', () => listConfiguredServices());

ipcMain.handle('fetch:snapshot', async (_e, serviceId: unknown) => {
  if (!isServiceId(serviceId)) {
    return { ok: false, code: 'not_implemented', message: 'unknown service id' };
  }
  // Object.hasOwn() avoids prototype-chain lookups even though the
  // serviceId guard above already covers this.
  const fetcher = Object.hasOwn(LIVE_FETCHERS, serviceId)
    ? LIVE_FETCHERS[serviceId as ServiceId]
    : undefined;
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
    return { ok: false, code: 'fetch_failed', message: safeErrorMessage(err) };
  }
});

ipcMain.handle(
  'action:invoke',
  async (_e, serviceId: unknown, action: unknown, payload: unknown) => {
    if (!isServiceId(serviceId)) {
      return { ok: false, code: 'action_not_found', message: 'unknown service id' };
    }
    if (typeof action !== 'string' || action.length === 0 || action.length > 64) {
      return { ok: false, code: 'action_not_found', message: 'invalid action name' };
    }
    const actions = Object.hasOwn(LIVE_ACTIONS, serviceId)
      ? LIVE_ACTIONS[serviceId as ServiceId]
      : undefined;
    const fn = actions && Object.hasOwn(actions, action) ? actions[action] : undefined;
    if (!fn) {
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
    // Validate payload is a plain object, not an array / primitive / null
    const safePayload =
      payload && typeof payload === 'object' && !Array.isArray(payload)
        ? (payload as Record<string, unknown>)
        : {};
    try {
      const data = await fn({ token, payload: safePayload });
      return { ok: true, data };
    } catch (err) {
      return { ok: false, code: 'action_failed', message: safeErrorMessage(err) };
    }
  },
);

ipcMain.handle('oauth:isSupported', (_e, serviceId: unknown) =>
  isServiceId(serviceId) ? isOAuthSupported(serviceId) : false,
);

// ランタイム クライアント ID の妥当性 (英数・ドット・ハイフン・アンダースコア、8〜200 文字)。
// Entra の GUID / Google の *.apps.googleusercontent.com の双方を許容しつつ、
// 制御文字・空白などの混入を IPC 境界で拒否する。
const CLIENT_ID_RE = /^[A-Za-z0-9._-]{8,200}$/;

ipcMain.handle('oauth:authorize', async (_e, serviceId: unknown, clientIdOverride?: unknown) => {
  if (!isServiceId(serviceId)) {
    return { ok: false, code: 'not_supported', message: 'unknown service id' };
  }
  const baseConfig = Object.hasOwn(OAUTH_CONFIGS, serviceId)
    ? OAUTH_CONFIGS[serviceId as ServiceId]
    : undefined;
  // 環境変数未設定でも、UI から渡されたクライアント ID で実行できる (アプリ内かんたん接続)。
  const override =
    typeof clientIdOverride === 'string' && CLIENT_ID_RE.test(clientIdOverride.trim())
      ? clientIdOverride.trim()
      : '';
  const config = baseConfig
    ? { ...baseConfig, clientId: override || baseConfig.clientId }
    : undefined;
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
    return { ok: false, code: 'authorize_failed', message: safeErrorMessage(err) };
  }
});
