import { contextBridge, ipcRenderer } from 'electron';
import type { ServiceId } from '../shared/serviceId';

export type { ServiceId };

export type FetchResult<T = unknown> =
  | { ok: true; data: T }
  | { ok: false; code: 'not_implemented' | 'not_configured' | 'fetch_failed'; message: string };

export type ActionResult<T = unknown> =
  | { ok: true; data: T }
  | { ok: false; code: 'action_not_found' | 'not_configured' | 'action_failed'; message: string };

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
  revealInFolder: (filePath: string): Promise<void> =>
    ipcRenderer.invoke('app:revealInFolder', filePath),
  openPath: (filePath: string): Promise<void> =>
    ipcRenderer.invoke('app:openPath', filePath),

  setToken: (serviceId: ServiceId, token: string): Promise<void> =>
    ipcRenderer.invoke('secrets:set', serviceId, token),
  clearToken: (serviceId: ServiceId): Promise<void> =>
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
