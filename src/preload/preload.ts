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

const api = {
  getVersion: (): Promise<string> => ipcRenderer.invoke('app:getVersion'),
  openExternal: (url: string): Promise<void> => ipcRenderer.invoke('app:openExternal', url),

  setToken: (serviceId: ServiceId, token: string): Promise<void> =>
    ipcRenderer.invoke('secrets:set', serviceId, token),
  clearToken: (serviceId: ServiceId): Promise<void> =>
    ipcRenderer.invoke('secrets:clear', serviceId),
  listConfigured: (): Promise<ServiceId[]> => ipcRenderer.invoke('secrets:list'),

  fetchSnapshot: <T = unknown>(serviceId: ServiceId): Promise<FetchResult<T>> =>
    ipcRenderer.invoke('fetch:snapshot', serviceId),

  invoke: <T = unknown>(
    serviceId: ServiceId,
    action: string,
    payload: Record<string, unknown>,
  ): Promise<ActionResult<T>> => ipcRenderer.invoke('action:invoke', serviceId, action, payload),

  oauthSupported: (serviceId: ServiceId): Promise<boolean> =>
    ipcRenderer.invoke('oauth:isSupported', serviceId),
  authorize: (serviceId: ServiceId): Promise<OAuthResult> =>
    ipcRenderer.invoke('oauth:authorize', serviceId),
};

contextBridge.exposeInMainWorld('serviceHub', api);

export type ServiceHubBridge = typeof api;
