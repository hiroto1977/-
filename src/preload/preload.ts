import { contextBridge, ipcRenderer } from 'electron';

const api = {
  getVersion: (): Promise<string> => ipcRenderer.invoke('app:getVersion'),
  openExternal: (url: string): Promise<void> => ipcRenderer.invoke('app:openExternal', url),
};

contextBridge.exposeInMainWorld('serviceHub', api);

export type ServiceHubBridge = typeof api;
