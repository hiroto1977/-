/**
 * preload.mamori が使う host の口。`extern pure { … } from "./preloadHost"` で読む。
 *
 * - `electron` は Mamori の能力モジュール (`CAPABILITY_MODULE`) なので、`use` では読めず、`extern sink` は
 *   「第 1 引数が印を持つ値」を要求する。橋の `ipcRenderer.invoke(チャンネル, …引数)` は行き先が**固定の文字列**で
 *   印の型には乗らないため、判断を持たない 2 つの薄い口だけをここに置く。
 * - チャンネル名は preload.mamori の中に字面で並び、ここの閉じた表 `CALLS` にも字面で並ぶ。表に無い名前は拒む。
 */
import { contextBridge, ipcRenderer } from 'electron';

/**
 * 呼んでよいチャンネルの閉じた表。**どの行も `ipcRenderer.invoke` の第 1 引数が字面**で、
 * 変数で受ける呼び出しはここに 1 つも無い (`lint:ipc-handlers` が preload の全 `ipcRenderer.*` 呼び出しに要求する)。
 * 表に無い名前は main へ届く前に拒む —— 呼び出し側 (preload.mamori) が名前を取り違えても合鍵にならない。
 */
const CALLS: Readonly<Record<string, (...args: unknown[]) => Promise<unknown>>> = {
  'app:getVersion': (...a) => ipcRenderer.invoke('app:getVersion', ...a),
  'app:checkUpdate': (...a) => ipcRenderer.invoke('app:checkUpdate', ...a),
  'app:openExternal': (...a) => ipcRenderer.invoke('app:openExternal', ...a),
  'app:revealInFolder': (...a) => ipcRenderer.invoke('app:revealInFolder', ...a),
  'app:openPath': (...a) => ipcRenderer.invoke('app:openPath', ...a),
  'app:setColorScheme': (...a) => ipcRenderer.invoke('app:setColorScheme', ...a),
  'secrets:set': (...a) => ipcRenderer.invoke('secrets:set', ...a),
  'secrets:clear': (...a) => ipcRenderer.invoke('secrets:clear', ...a),
  'secrets:list': (...a) => ipcRenderer.invoke('secrets:list', ...a),
  'secrets:protection': (...a) => ipcRenderer.invoke('secrets:protection', ...a),
  'app:eraseAll': (...a) => ipcRenderer.invoke('app:eraseAll', ...a),
  'fetch:snapshot': (...a) => ipcRenderer.invoke('fetch:snapshot', ...a),
  'action:invoke': (...a) => ipcRenderer.invoke('action:invoke', ...a),
  'oauth:isSupported': (...a) => ipcRenderer.invoke('oauth:isSupported', ...a),
  'oauth:authorize': (...a) => ipcRenderer.invoke('oauth:authorize', ...a),
};

/** 表のチャンネル名 (検査が preload.mamori の字面と突き合わせる)。 */
export const IPC_CHANNELS: readonly string[] = Object.keys(CALLS);

/** main へ 1 回だけ問い合わせる。表に無いチャンネルは main へ送らず拒む。 */
export function invokeIpc<T>(channel: string, ...args: unknown[]): Promise<T> {
  if (!Object.hasOwn(CALLS, channel)) {
    return Promise.reject(new Error('unknown ipc channel'));
  }
  return CALLS[channel]!(...args) as Promise<T>;
}

/** 橋を 1 つの名前で露出する (`contextBridge.exposeInMainWorld`)。読み込んだ瞬間に 1 度だけ呼ばれる。 */
export function exposeBridge(name: string, api: object): true {
  contextBridge.exposeInMainWorld(name, api);
  return true;
}
