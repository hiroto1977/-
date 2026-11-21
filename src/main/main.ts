// 生成物 —— src/main/main.mamori から Mamori のコンパイラが組んだ。手で編集しない (`npm run mamori:build`)。
// 言語の仕様は docs/MAMORI.md。生成物が元と食い違えば src/shared/mamori/__tests__/mamoriGenerated.test.ts が落ちる。
/**
 * main — **主プロセスの入口** (窓の隔離設定と、レンダラーが main へ触れる IPC の 15 本の口) (2026-11-10 · MG-059 · Mamori 0.28)。
 *
 * ここが決めること:
 * - 窓の隔離設定 (`contextIsolation` / `nodeIntegration` / `sandbox` / `spellcheck`)・ブラウザ権限の許可表 (クリップボードの書き込みだけ)・
 *   `file://` 読み取りの閉じ込め・新窓の扱い (常に拒否して同じ関門と本人確認の門を通す)・遷移の番人 (開発サーバの origin だけ)。
 * - IPC の口の判断: 本人確認と速度の上限 (`requirePresence`)・資格情報の入口の検め (`checkTokenInput`)・知らない id の拒否・
 *   端の出力インターセプター (`outboundContentRefusal`)・OS へ渡す物は関門の印つきだけ・認可は同時に 1 つだけ・
 *   更新確認は取得もインストールもしない。**どの口も reject せず、失敗を戻り値で表す** (lint:ipc-handlers)。
 * - 起動時の自己検算の扱い (梱包版は 1 byte でも違えば起動しない)・単一インスタンス・窓の再作成。
 *
 * Mamori で書くので: `electron` / `process` / `__dirname` / `console` / `setTimeout` / `fetch` は直接触れない。触れるのは
 * 判断を持たない薄い壁 `mainHost.ts` (electron の物の再輸出と、環境・パス・時計・`fetch`・表の添字引き) だけで、能力の台帳に載る。
 * 表の添字引き (`LIVE_FETCHERS[id]` ほか) は、計算した鍵の結果が inert (呼べない) になるので壁に置いた —— 自分の鍵だけを引く点は元のまま。
 *
 * 元は TypeScript (835 行)。書き直したのは `as` / `as const` / `!` / template 文字列 / 配列の分割代入 / `void` / 分割代入の引数で、
 * 組み上がる文字列・条件・順序は 1 字も変えていない。
 */

import type { WindowPrefs } from './windowPrefs';
import { evaluateUpdate, parseLatestRelease } from '../shared/updateCheck';
import { externalUrlOrNull } from '../shared/externalUrlGate';
import { outboundContentRefusal } from '../shared/outboundContentGate';
import { checkTokenInput } from '../shared/tokenInput';
import { DEFAULT_HTTP_TIMEOUT_MS, egressInit, isRedirectResponse, MAX_HTTP_RESPONSE_BYTES, readBodyWithCap } from '../shared/httpLimits';
import { shellTargetOrNull } from './shellOpenGate';
import { openExternalVetted, openPathVetted, showItemInFolderVetted } from './osSinks';
import { ensurePrivateExportRoot, repairExportPermissions } from './clients/exportPaths';
import { authorize, isOAuthSupported } from './oauth';
import { describeCredentialWrite, describePayload, isPlainPayload, payloadTooWide, weightOfAction } from './userPresence';
import { tierOfAction } from '../shared/actionTier';
import type { VettedExternalUrl } from '../shared/vetted';
import type { PresenceDecision } from './userPresence';
import { isServiceId } from '../shared/serviceId';
import { safeErrorMessage } from './clients/types';
import { attestationMessage } from './selfAttestation';
import { clearToken, getStorageProtection, getValidToken, listConfiguredServices, setOAuthTokens, setToken } from './secrets';
import { LOCAL_SERVICES, readsSavedToken } from './clients';
import { installFileRequestGate } from './fileRequestGate';
import { reportThreatSignal, requirePresence, requirePresenceFromUrl } from './presenceWiring';
import { openFromWindow } from './windowOpen';
import { eraseDesktopData } from './eraseAll';
import { DEFAULT_WINDOW_PREFS, isBackgroundColor, isWindowScheme, readWindowPrefs, writeWindowPrefs } from './windowPrefs';
import { app, BrowserWindow, dialog, ipcMain, hostEnv, hostIconPath, hostPreloadPath, hostDistRoot, hostIndexHtml, hostVerifyShipped, hostConsoleError, hostSetTimeout, hostPlatform, hostApplyNativeTheme, hostTimeoutSignal, hostFetch, hostParseJson, lookupFetcher, lookupAction, lookupOAuthConfig, hostAsRecord } from './mainHost';
import type { IpcEvent, TokenRead } from './mainHost';

const isDev: boolean = !app.isPackaged;

/**
 * 窓の下地色と配色 (パス 318)。起動時に userData から読み、renderer が `app:setColorScheme` で伝えてくるたびに
 * 更新する。`createWindow` はこれを読むので、`activate` で作り直す窓も同じ色になる。
 */
let windowPrefs: WindowPrefs = DEFAULT_WINDOW_PREFS;

/**
 * レンダラーへ許すブラウザ権限。**Electron の既定は「全部承認」である** (security checklist #5)。
 * 許すのはクリップボードへの**書き込み**だけ (パス 543 · threat: T-137)。`clipboard-read` は外した ——
 * デスクトップ版に正当な読み手が無いのに許していたので、乗っ取られたレンダラーが利用者のクリップボードを
 * ジェスチャ無しで黙って読めた。それ以外 (media / geolocation / notifications / midi / display-capture /
 * hid / serial / usb / idle-detection / window-management …) は全部拒否する。
 * 「使っていない」は `permissionJustification.test.ts` が走査で測る。
 */
const ALLOWED_PERMISSIONS: ReadonlySet<string> = new Set(['clipboard-sanitized-write']);

/**
 * 判定は**ここ 1 つ**。要求側 (`setPermissionRequestHandler`) と問い合わせ側 (`setPermissionCheckHandler`) の
 * 2 つの口が同じ答えを返さないと、`navigator.permissions.query()` が「granted」と言った権限を実際の要求が拒否する。
 */
function permissionAllowed(permission: string): boolean {
  return ALLOWED_PERMISSIONS.has(permission);
}

/** 解析できなかった URL を**空文字**にする。`origin` は絶対に空文字にならないので、「読めた」と「読めなかった」が値の上で混ざらない。 */
function originOrEmpty(url: string): string {
  try {
    return new URL(url).origin;
  } catch {
    return '';
  }
}

/**
 * 実際に読み込んだ開発サーバの **origin** (scheme + host + port) とだけ突き合わせる。
 * `host` にスキームは入らないので `https://localhost:5173/` も `ftp://localhost:5173/` も同じ host になる —— origin で見る。
 * 開発サーバの URL 自体が壊れていると、同じく壊れた遷移先が「同じ origin」に見えて通ってしまうので、空文字どうしは一致と読まない。
 */
function allowNavigation(navigationUrl: string): boolean {
  const devServer = hostEnv('VITE_DEV_SERVER_URL');
  if (!isDev || !devServer) return false;
  const target = originOrEmpty(navigationUrl);
  return target !== '' && target === originOrEmpty(devServer);
}

function guardNavigation(event: { preventDefault: () => void }, navigationUrl: string): void {
  if (allowNavigation(navigationUrl)) return;
  event.preventDefault();
  reportThreatSignal('navigation-denied', 'will-navigate');
}

function createWindow(): BrowserWindow {
  const win = new BrowserWindow({ width: 1280, height: 800, minWidth: 960, minHeight: 600, title: 'Service Hub', backgroundColor: windowPrefs.background, icon: hostIconPath(), webPreferences: { preload: hostPreloadPath(), contextIsolation: true, nodeIntegration: false, sandbox: true, spellcheck: false } });
  win.webContents.session.setSpellCheckerEnabled(false);
  const distRoot = hostDistRoot();
  installFileRequestGate(win.webContents.session, distRoot, (where) => reportThreatSignal('file-denied', where));
  win.webContents.session.setPermissionRequestHandler((_wc, permission, callback) => {
  callback(permissionAllowed(permission));
});
  win.webContents.session.setPermissionCheckHandler((_wc, permission) => permissionAllowed(permission));
  win.webContents.setWindowOpenHandler((details) => {
  openFromWindow(details.url, { senderUrl: () => win.webContents.getURL(), guard: requirePresenceFromUrl, open: (target: VettedExternalUrl) => openExternalVetted(target), log: (message) => hostConsoleError(message) });
  return { action: 'deny' };
});
  win.webContents.on('will-navigate', guardNavigation);
  win.webContents.on('will-redirect', guardNavigation);
  const devServerUrl = hostEnv('VITE_DEV_SERVER_URL');
  if (isDev && devServerUrl) {
    win.loadURL(devServerUrl);
    win.webContents.openDevTools({ mode: 'detach' });
  } else {
    win.loadFile(hostIndexHtml());
  }
  return win;
}

/**
 * **速度の上限と記録だけを掛ける** (確認は出さない · T-159)。断られた理由を返す (通れば null)。
 * 門が投げたら**呼び手の `try` が受ける** (lint:ipc-handlers —— reject させない・呼び手が必ず `try` の中で `await` する)。
 */
async function throttleMessage(e: IpcEvent, channel: string, tier: 'read' | 'local-write', detail?: unknown): Promise<string | null> {
  const summary = detail === undefined ? channel : typeof detail === 'string' ? detail : '(文字列ではない)';
  const presence = await requirePresence(e, { channel: channel, tier: tier, summary: summary });
  return presence.ok ? null : presence.message;
}

/** 開く側の関門は `shellOpenGate.ts` に 1 つだけ置く (書き出し側の `exportPaths.ts` と対になる)。 */
const REJECTED_PATH_MESSAGE = '指定されたパスは開けません。書き出し先の外にあるか、対応していない拡張子です。';

/** デスクトップ版の「すべてのデータを削除」(パス 137)。全部消えた時だけ再起動する。再起動は返してから —— 画面が「再起動します」を出せる。 */
const RELAUNCH_DELAY_MS = 300;

function scheduleRelaunch(): void {
  hostSetTimeout(() => {
  app.relaunch();
  app.exit(0);
}, RELAUNCH_DELAY_MS);
}

/** ランタイム クライアント ID の妥当性 (英数・ドット・ハイフン・アンダースコア、8〜200 文字)。制御文字・空白などの混入を IPC 境界で拒否する。 */
const CLIENT_ID_RE = /^[A-Za-z0-9._-]{8,200}$/;

/**
 * 認可は**同時に 1 つだけ** (パス 543 · threat: T-139)。呼ぶたびに 127.0.0.1 の待受 socket とブラウザのタブが 1 つ増え、
 * 完了しない認可は 5 分生き残る。正当な利用者は 1 度に 1 つのサービスしか認可しない。
 */
let authorizeInFlight: boolean = false;

/**
 * 起動 (単一インスタンス・自己検算・窓・再作成)。単一インスタンス (パス 526 · T-104): 同じ userData を 2 つのプロセスが
 * 同時に開くと保管ファイルと窓の設定の「読んで → 書く」が互いに上書きし合うので、ロックが取れない 2 つ目は窓を作らず終了する。
 * **2 つ目の argv / cwd は読まない** (開く先を外から決められる口にしない)。
 */
function bootMain(): void {
  const gotInstanceLock = app.requestSingleInstanceLock();
  if (!gotInstanceLock) {
    app.quit();
  } else {
    app.on('second-instance', () => {
  const existing = BrowserWindow.getAllWindows()[0];
  if (existing === undefined) return;
  if (existing.isMinimized()) {
    existing.restore();
  }
  existing.focus();
});
  }
  if (gotInstanceLock) {
    app.whenReady().then(async () => {
  if (app.isPackaged) {
    const verdict = await hostVerifyShipped();
    if (!verdict.ok) {
      const message = attestationMessage(verdict);
      hostConsoleError('[self-attestation] ' + verdict.reason + ': ' + verdict.detail);
      dialog.showErrorBox('Service Hub を起動できません', message);
      app.exit(1);
      return;
    }
  }
  windowPrefs = await readWindowPrefs();
  hostApplyNativeTheme(windowPrefs.scheme);
  createWindow();
  ensurePrivateExportRoot().then(() => repairExportPermissions()).catch(() => undefined);
  app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
});
  }
  app.on('window-all-closed', () => {
  if (hostPlatform() !== 'darwin') {
    app.quit();
  }
});
}

/** 読み込んだ瞬間に 1 度だけ呼ばれる (IPC の口を据える前に起動を仕掛ける —— 元の順序のまま)。 */
export const mainBooted = bootMain();

/** IPC の口を据える。**どの口も reject しない** —— 失敗は戻り値で表す (lint:ipc-handlers)。 */
function registerIpcHandlers(): void {
  ipcMain.handle('app:getVersion', () => app.getVersion());
  ipcMain.handle('app:checkUpdate', async (e) => {
  const current = app.getVersion();
  try {
    if (await throttleMessage(e, 'app:checkUpdate', 'read') !== null) return evaluateUpdate(current, null);
    const res = await hostFetch('https://api.github.com/repos/hiroto1977/-/releases/latest', egressInit({ headers: { accept: 'application/vnd.github+json' }, signal: hostTimeoutSignal(DEFAULT_HTTP_TIMEOUT_MS) }));
    if (isRedirectResponse(res) || !res.ok) return evaluateUpdate(current, null);
    // Stryker disable next-line StringLiteral: この標識はエラー本文にしか現れず、上限超過も含めてすべての失敗を下の catch が「判定不能」へ寄せる (等価変異)
    return evaluateUpdate(current, parseLatestRelease(hostParseJson(await readBodyWithCap(res, MAX_HTTP_RESPONSE_BYTES, 'update'))));
  } catch {
    return evaluateUpdate(current, null);
  }
});
  ipcMain.handle('app:openExternal', async (e, url: unknown) => {
  const target = externalUrlOrNull(url);
  if (target === null) return;
  let presence: PresenceDecision;
  try {
    presence = await requirePresence(e, { channel: 'app:openExternal', tier: 'egress', summary: target });
  } catch {
    return;
  }
  if (!presence.ok) return;
  try {
    await openExternalVetted(target);
  } catch (err) {
    hostConsoleError('[openExternal] OS が URL を開けませんでした: ' + safeErrorMessage(err));
  }
});
  ipcMain.handle('app:revealInFolder', async (e, filePath: unknown) => {
  try {
    const refused = await throttleMessage(e, 'app:revealInFolder', 'local-write', filePath ?? null);
    if (refused !== null) return { ok: false, message: refused };
    const target = await shellTargetOrNull(filePath);
    if (target === null) return { ok: false, message: REJECTED_PATH_MESSAGE };
    showItemInFolderVetted(target);
    return { ok: true };
  } catch (err) {
    return { ok: false, message: safeErrorMessage(err) };
  }
});
  ipcMain.handle('app:openPath', async (e, filePath: unknown) => {
  try {
    const refused = await throttleMessage(e, 'app:openPath', 'local-write', filePath ?? null);
    if (refused !== null) return { ok: false, message: refused };
    const target = await shellTargetOrNull(filePath);
    if (target === null) return { ok: false, message: REJECTED_PATH_MESSAGE };
    const failure = await openPathVetted(target);
    return failure === '' ? { ok: true } : { ok: false, message: failure };
  } catch (err) {
    return { ok: false, message: safeErrorMessage(err) };
  }
});
  ipcMain.handle('secrets:set', async (e, serviceId: unknown, token: unknown) => {
  if (!isServiceId(serviceId)) return { ok: false, code: 'invalid_service', message: 'unknown service id' };
  const checked = checkTokenInput(token);
  if (!checked.ok) return { ok: false, code: 'invalid_token', message: checked.message };
  let presence: PresenceDecision;
  try {
    presence = await requirePresence(e, { channel: 'secrets:set', tier: 'credential-write', summary: describeCredentialWrite(serviceId, checked.value) });
  } catch (err) {
    presence = { ok: false, message: safeErrorMessage(err) };
  }
  if (!presence.ok) return { ok: false, code: 'write_failed', message: presence.message };
  try {
    await setToken(serviceId, checked.value);
  } catch (err) {
    return { ok: false, code: 'write_failed', message: safeErrorMessage(err) };
  }
  return { ok: true };
});
  ipcMain.handle('secrets:clear', async (e, serviceId: unknown) => {
  if (!isServiceId(serviceId)) return { ok: false, message: 'unknown service id' };
  let presence: PresenceDecision;
  try {
    presence = await requirePresence(e, { channel: 'secrets:clear', tier: 'destructive', summary: serviceId + ' の保存済み資格情報を削除します。' });
  } catch (err) {
    presence = { ok: false, message: safeErrorMessage(err) };
  }
  if (!presence.ok) return { ok: false, message: presence.message };
  try {
    await clearToken(serviceId);
    return { ok: true };
  } catch (err) {
    return { ok: false, message: safeErrorMessage(err) };
  }
});
  ipcMain.handle('secrets:list', () => listConfiguredServices());
  ipcMain.handle('secrets:protection', () => getStorageProtection());
  ipcMain.handle('app:eraseAll', async (e) => {
  let presence: PresenceDecision;
  try {
    presence = await requirePresence(e, { channel: 'app:eraseAll', tier: 'destructive', summary: 'このアプリの資格情報・記録・設定をすべて削除して再起動します。元に戻せません。' });
  } catch (err) {
    presence = { ok: false, message: safeErrorMessage(err) };
  }
  if (!presence.ok) return { kind: 'desktop', files: {}, renderer: 'failed', allDeleted: false, error: presence.message };
  try {
    const report = await eraseDesktopData();
    if (report.allDeleted) {
      scheduleRelaunch();
    }
    return report;
  } catch (err) {
    return { kind: 'desktop', files: {}, renderer: 'failed', allDeleted: false, error: safeErrorMessage(err) };
  }
});
  ipcMain.handle('app:setColorScheme', async (e, scheme: unknown, background: unknown) => {
  try {
    const refused = await throttleMessage(e, 'app:setColorScheme', 'read');
    if (refused !== null) return { ok: false, message: refused };
    if (!isWindowScheme(scheme) || !isBackgroundColor(background)) return { ok: false, message: '配色の値が不正です (light / dark と #rrggbb だけを受け取ります)' };
    const prefs: WindowPrefs = { scheme: scheme, background: background.toLowerCase() };
    windowPrefs = prefs;
    hostApplyNativeTheme(prefs.scheme);
    for (const win of BrowserWindow.getAllWindows()) {
      win.setBackgroundColor(prefs.background);
    }
    await writeWindowPrefs(prefs);
    return { ok: true };
  } catch (err) {
    return { ok: false, message: safeErrorMessage(err) };
  }
});
  ipcMain.handle('fetch:snapshot', async (e, serviceId: unknown) => {
  try {
    const refused = await throttleMessage(e, 'fetch:snapshot', 'read');
    if (refused !== null) return { ok: false, code: 'fetch_failed', message: refused };
  } catch (err) {
    return { ok: false, code: 'fetch_failed', message: safeErrorMessage(err) };
  }
  if (!isServiceId(serviceId)) return { ok: false, code: 'not_implemented', message: 'unknown service id' };
  const fetcher = lookupFetcher(serviceId);
  if (!fetcher) return { ok: false, code: 'not_implemented', message: serviceId + ' はライブフェッチ未対応' };
  let token = '';
  try {
    const read: TokenRead = readsSavedToken(serviceId) ? await getValidToken(serviceId) : { ok: true, token: '' };
    if (!read.ok) {
      if (read.reason !== 'absent') return { ok: false, code: 'not_configured', message: read.message };
      if (!LOCAL_SERVICES.has(serviceId)) return { ok: false, code: 'not_configured', message: 'トークン未設定' };
    } else {
      token = read.token;
    }
  } catch (err) {
    return { ok: false, code: 'fetch_failed', message: safeErrorMessage(err) };
  }
  try {
    const data = await fetcher({ token: token });
    return { ok: true, data: data };
  } catch (err) {
    return { ok: false, code: 'fetch_failed', message: safeErrorMessage(err) };
  }
});
  ipcMain.handle('action:invoke', async (e, serviceId: unknown, action: unknown, payload: unknown) => {
  if (!isServiceId(serviceId)) return { ok: false, code: 'action_not_found', message: 'unknown service id' };
  if (typeof action !== 'string' || action.length === 0 || action.length > 64) return { ok: false, code: 'action_not_found', message: 'invalid action name' };
  const runAction = lookupAction(serviceId, action);
  if (!runAction) return { ok: false, code: 'action_not_found', message: serviceId + ' に action "' + action + '" は登録されていません' };
  const tier = tierOfAction(serviceId, action);
  if (!isPlainPayload(payload)) return { ok: false, code: 'action_failed', message: '送る内容の形が正しくないため断りました。' };
  if (tier !== 'read' && payloadTooWide(payload)) return { ok: false, code: 'action_failed', message: '送る欄が多すぎるため断りました (通常の操作は 24 欄以内です)。' };
  const outbound = outboundContentRefusal(serviceId, action, payload);
  if (outbound !== null) return { ok: false, code: 'action_failed', message: outbound };
  let presence: PresenceDecision;
  try {
    presence = await requirePresence(e, { channel: serviceId + '/' + action, tier: tier, summary: describePayload(payload), weight: weightOfAction(serviceId, action) });
  } catch (err) {
    presence = { ok: false, message: safeErrorMessage(err) };
  }
  if (!presence.ok) return { ok: false, code: 'action_failed', message: presence.message };
  let token = '';
  try {
    const read: TokenRead = readsSavedToken(serviceId) ? await getValidToken(serviceId) : { ok: true, token: '' };
    if (!read.ok) {
      if (read.reason !== 'absent') return { ok: false, code: 'not_configured', message: read.message };
      if (!LOCAL_SERVICES.has(serviceId)) return { ok: false, code: 'not_configured', message: 'トークン未設定' };
    } else {
      token = read.token;
    }
  } catch (err) {
    return { ok: false, code: 'action_failed', message: safeErrorMessage(err) };
  }
  const safePayload: Record<string, unknown> = payload && typeof payload === 'object' && !Array.isArray(payload) ? hostAsRecord(payload) : {};
  try {
    const data = await runAction({ token: token, payload: safePayload });
    return { ok: true, data: data };
  } catch (err) {
    return { ok: false, code: 'action_failed', message: safeErrorMessage(err) };
  }
});
  ipcMain.handle('oauth:isSupported', (_e, serviceId: unknown) => (isServiceId(serviceId) ? isOAuthSupported(serviceId) : false));
  ipcMain.handle('oauth:authorize', async (e, serviceId: unknown, clientIdOverride?: unknown) => {
  if (!isServiceId(serviceId)) return { ok: false, code: 'not_supported', message: 'unknown service id' };
  const baseConfig = lookupOAuthConfig(serviceId);
  const override = typeof clientIdOverride === 'string' && CLIENT_ID_RE.test(clientIdOverride.trim()) ? clientIdOverride.trim() : '';
  const config = baseConfig ? { ...baseConfig, clientId: override || baseConfig.clientId } : undefined;
  if (!config || !config.clientId) return { ok: false, code: 'not_supported', message: 'このサービスは OAuth 未対応、または OAuth クライアント ID 未設定' };
  if (authorizeInFlight) return { ok: false, code: 'authorize_busy', message: '別の認可が進行中です。開いたブラウザでの手続きを終えるか、5 分ほど待ってからやり直してください' };
  let presence: PresenceDecision;
  try {
    presence = await requirePresence(e, override !== '' ? { channel: 'oauth:authorize', tier: 'credential-write', summary: serviceId + ' を、クライアント ID「' + override + '」で認可します。心当たりが無ければ「実行しない」を選んでください。' } : { channel: 'oauth:authorize', tier: 'egress', summary: serviceId + ' の認可ページをブラウザで開きます' });
  } catch (err) {
    presence = { ok: false, message: safeErrorMessage(err) };
  }
  if (!presence.ok) return { ok: false, code: 'authorize_failed', message: presence.message };
  authorizeInFlight = true;
  try {
    const tokens = await authorize(config);
    await setOAuthTokens(serviceId, tokens);
    return { ok: true, data: { scope: tokens.scope, expiresAt: tokens.expiresAt } };
  } catch (err) {
    return { ok: false, code: 'authorize_failed', message: safeErrorMessage(err) };
  } finally {
    authorizeInFlight = false;
  }
});
}

/** IPC の口を据える (読み込んだ瞬間に 1 度だけ)。 */
export const ipcHandlersRegistered = registerIpcHandlers();
