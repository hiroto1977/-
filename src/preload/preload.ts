import { contextBridge, ipcRenderer } from 'electron';
import type { ServiceId } from '../shared/serviceId';

export type { ServiceId };

export type FetchResult<T = unknown> =
  | { ok: true; data: T }
  | { ok: false; code: 'not_implemented' | 'not_configured' | 'fetch_failed'; message: string };

export type ActionResult<T = unknown> =
  | { ok: true; data: T }
  | { ok: false; code: 'action_not_found' | 'not_configured' | 'action_failed'; message: string };

/**
 * OS へ渡す操作 (ファイルを開く / フォルダで表示 / 資格情報の削除) の結果。
 *
 * 2026-08 監査で見つけた形: これらは `Promise<void>` で、
 * - パスが封じ込めゲートに弾かれた場合は `return;` で黙る
 * - `shell.openPath` は **失敗時にエラー文字列を返す** 契約なのに、その戻り値を
 *   捨てていた (ハンドラのコメントには契約が書いてあった)
 * ため、呼び出し側は `catch {}` で握り潰すしかなく、**書き出した決算書類を
 * 「開く」で開けなくても、画面には何も出なかった**。
 */
export type OsOpResult = { ok: true } | { ok: false; message: string };

/** 資格情報の保存結果。`void` だと「弾いた」と「保存した」が区別できず、
 *  renderer が保存できたように振る舞ってしまう (2026-08 監査)。 */
export type TokenSaveResult =
  | { ok: true }
  | { ok: false; code: 'invalid_service' | 'invalid_token' | 'write_failed'; message: string };

export type OAuthResult =
  | { ok: true; data: { scope?: string; expiresAt?: number } }
  | { ok: false; code: 'not_supported' | 'authorize_failed'; message: string };

/** `secrets:protection` の戻り値。src/main/secrets.ts の StorageProtection と同形
 *  (preload は main を import できないため構造だけを再宣言する)。 */
export interface StorageProtection {
  readonly encrypted: boolean;
  readonly plainCount: number;
  readonly file: string;
}

const api = {
  getVersion: (): Promise<string> => ipcRenderer.invoke('app:getVersion'),
  /** 更新の有無を調べる。取得もインストールもしない（知らせるだけ）。 */
  checkUpdate: (): Promise<import('../shared/updateCheck').UpdateVerdict> =>
    ipcRenderer.invoke('app:checkUpdate'),
  openExternal: (url: string): Promise<void> => ipcRenderer.invoke('app:openExternal', url),
  revealInFolder: (filePath: string): Promise<OsOpResult> =>
    ipcRenderer.invoke('app:revealInFolder', filePath),
  openPath: (filePath: string): Promise<OsOpResult> =>
    ipcRenderer.invoke('app:openPath', filePath),

  setToken: (serviceId: ServiceId, token: string): Promise<TokenSaveResult> =>
    ipcRenderer.invoke('secrets:set', serviceId, token),
  clearToken: (serviceId: ServiceId): Promise<OsOpResult> =>
    ipcRenderer.invoke('secrets:clear', serviceId),
  listConfigured: (): Promise<ServiceId[]> => ipcRenderer.invoke('secrets:list'),
  /** 保存時の保護状態 (OS キーチェーンが使えるか / 平文のまま残っている件数)。
   *  秘密そのものは返さない。 */
  storageProtection: (): Promise<StorageProtection> =>
    ipcRenderer.invoke('secrets:protection'),

  fetchSnapshot: <T = unknown>(serviceId: ServiceId): Promise<FetchResult<T>> =>
    ipcRenderer.invoke('fetch:snapshot', serviceId),

  invoke: <T = unknown>(
    serviceId: ServiceId,
    action: string,
    payload: Record<string, unknown>,
  ): Promise<ActionResult<T>> => ipcRenderer.invoke('action:invoke', serviceId, action, payload),

  oauthSupported: (serviceId: ServiceId): Promise<boolean> =>
    ipcRenderer.invoke('oauth:isSupported', serviceId),
  // clientId はアプリ内かんたん接続用の任意指定 (環境変数未設定でも OAuth を実行できる)。
  authorize: (serviceId: ServiceId, clientId?: string): Promise<OAuthResult> =>
    ipcRenderer.invoke('oauth:authorize', serviceId, clientId),
};

contextBridge.exposeInMainWorld('serviceHub', api);

export type ServiceHubBridge = typeof api;
