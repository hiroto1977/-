/**
 * `main.mamori` の薄い壁 (2026-11-10 · MG-059)。
 *
 * 主プロセスの入口 (`main.ts`) は Mamori で書いてあり、**判断は全部そちらに残した**: 窓の隔離設定 (contextIsolation /
 * sandbox / nodeIntegration / spellcheck / 権限の許可表 / 遷移の番人)・IPC の 15 本の口の判断 (本人確認・速度・払い出し・
 * 同時 1 つの認可・形の検め)・起動時の自己検算の扱い。
 *
 * ここへ閉じ込めたのは、Mamori の `extern pure global` にできない口 (`process.env` / `__dirname` / `console` / `setTimeout` /
 * `fetch` / `AbortSignal` / 表の添字引き) と、electron の物を**そのまま**出す再輸出だけ。**判断は持たない** ——
 * 値を渡して結果を返すか、渡された物に触るだけである。表の添字引き (`LIVE_FETCHERS[id]` ほか) は、計算した鍵の結果が
 * Mamori では inert (関数として呼べない) になるのでここに置く。`Object.hasOwn` で自分の鍵だけを引く点は元のままである。
 */
import path from 'node:path';
import { promises as fsPromises } from 'node:fs';
import { app, nativeTheme, type IpcMainInvokeEvent } from 'electron';
import { verifyShippedFiles, type AttestationVerdict } from './selfAttestation';
import { getValidToken } from './secrets';
import { LIVE_ACTIONS, LIVE_FETCHERS, type ServiceId } from './clients';
import { OAUTH_CONFIGS } from './oauth';
import type { FetchContext, ServiceAction } from './clients/types';
import type { WindowPrefs } from './windowPrefs';

export { app, BrowserWindow, dialog, ipcMain } from 'electron';

/** `requirePresence` が受ける呼び出し元の型 (IPC の最初の引数)。 */
export type IpcEvent = IpcMainInvokeEvent;
/** `getValidToken` の返り値の型 (読めた / 読めなかった理由つき)。 */
export type TokenRead = Awaited<ReturnType<typeof getValidToken>>;
/** 取得の関数。 */
export type Fetcher = (ctx: FetchContext) => Promise<unknown>;
/** OAuth の設定 (環境変数 clientId を含む)。 */
export type OAuthConfig = (typeof OAUTH_CONFIGS)[ServiceId];

/** 環境変数を読む。無ければ空文字 (呼び手の `?? ''` と同じ)。 */
export function hostEnv(name: string): string {
  return process.env[name] ?? '';
}

/** `dist-electron/main.js` から見た `build/icon.png` (開発では repo 直下・梱包では asar 内)。 */
export function hostIconPath(): string {
  return path.join(__dirname, '..', 'build', 'icon.png');
}

/** preload の絶対パス。 */
export function hostPreloadPath(): string {
  return path.join(__dirname, 'preload.js');
}

/** レンダラーの `file://` 読み取りを閉じ込める同梱の `dist/`。 */
export function hostDistRoot(): string {
  return path.join(__dirname, '..', 'dist');
}

/** 梱包した画面の入口。 */
export function hostIndexHtml(): string {
  return path.join(__dirname, '../dist/index.html');
}

/** 梱包版の同梱物を検算する (根はこの main.js の 1 つ上)。 */
export function hostVerifyShipped(): Promise<AttestationVerdict> {
  return verifyShippedFiles(path.join(__dirname, '..'), fsPromises);
}

/** 記録先 (stderr)。 */
export function hostConsoleError(message: string): void {
  console.error(message);
}

/** 遅延実行。 */
export function hostSetTimeout(run: () => void, ms: number): void {
  setTimeout(run, ms);
}

/** プロセスの種別 (macOS だけ窓が全部閉じても終了しない)。 */
export function hostPlatform(): string {
  return process.platform;
}

/** Electron 自身の配色。mock が nativeTheme を持たない検査では飛ばす。 */
export function hostApplyNativeTheme(scheme: WindowPrefs['scheme']): void {
  if (nativeTheme) nativeTheme.themeSource = scheme;
}

/** 締切つきの信号 (更新確認の fetch に渡す)。 */
export function hostTimeoutSignal(ms: number): AbortSignal {
  return AbortSignal.timeout(ms);
}

/** 呼ぶ時点の `fetch` を呼ぶ (差し替えた物にも追随する)。転送に追随しない規則 (`egressInit`) は呼び手 (main.mamori) が掛ける。 */
export function hostFetch(input: string, init: RequestInit): Promise<Response> {
  return fetch(input, init);
}

/** 本文を JSON として読む (呼び手が上限つきで読んだ文字列を渡す)。 */
export function hostParseJson(text: string): unknown {
  return JSON.parse(text);
}

/** 自分の鍵だけを引く (prototype の鍵を引かない)。無ければ undefined。 */
export function lookupFetcher(serviceId: ServiceId): Fetcher | undefined {
  return Object.hasOwn(LIVE_FETCHERS, serviceId) ? LIVE_FETCHERS[serviceId] : undefined;
}

/** `serviceId` の action 関数。自分の鍵だけを引く (prototype の鍵を引かない)。無ければ undefined。 */
export function lookupAction(serviceId: ServiceId, action: string): ServiceAction | undefined {
  const actions = Object.hasOwn(LIVE_ACTIONS, serviceId) ? LIVE_ACTIONS[serviceId] : undefined;
  return actions && Object.hasOwn(actions, action) ? actions[action] : undefined;
}

/** OAuth の設定。自分の鍵だけを引く。無ければ undefined。 */
export function lookupOAuthConfig(serviceId: ServiceId): OAuthConfig | undefined {
  return Object.hasOwn(OAUTH_CONFIGS, serviceId) ? OAUTH_CONFIGS[serviceId] : undefined;
}

/** 型だけの読み替え (判定は呼び手が済ませた: 配列でも null でもない物)。 */
export function hostAsRecord(value: unknown): Record<string, unknown> {
  return value as Record<string, unknown>;
}
