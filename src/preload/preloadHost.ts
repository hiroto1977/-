/**
 * preload.mamori が使う host の口。`extern pure { … } from "./preloadHost"` で読む。
 *
 * - `electron` は Mamori の能力モジュール (`CAPABILITY_MODULE`) なので、`use` では読めず、`extern sink` は
 *   「第 1 引数が印を持つ値」を要求する。橋の `ipcRenderer.invoke(チャンネル, …引数)` は行き先が**固定の文字列**で
 *   印の型には乗らないため、判断を持たない 2 つの薄い口だけをここに置く。
 * - チャンネル名は preload.mamori の中に字面で並ぶ (呼び出し側には選ばせない)。ここは名前を選ばない。
 */
import { contextBridge, ipcRenderer } from 'electron';

/** main へ 1 回だけ問い合わせる (`ipcRenderer.invoke` の薄い包み)。 */
export function invokeIpc<T>(channel: string, ...args: unknown[]): Promise<T> {
  return ipcRenderer.invoke(channel, ...args) as Promise<T>;
}

/** 橋を 1 つの名前で露出する (`contextBridge.exposeInMainWorld`)。読み込んだ瞬間に 1 度だけ呼ばれる。 */
export function exposeBridge(name: string, api: object): true {
  contextBridge.exposeInMainWorld(name, api);
  return true;
}
