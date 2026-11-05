/**
 * 施錠の配り (lockWorkspace.mamori) が使う host の口。`extern pure { … } from "./lockWorkspaceHost"` で読む。
 *
 * Mamori にはモジュール直下の `let` も `Set` の書き換えも `new BroadcastChannel(…)` も `channel.onmessage = …` も無いので、
 * **状態と据え付けだけ**をここへ置く。判断 (鍵を落とす → 知らせる・自分を施錠する → 配る) は持たない。
 */

/** 施錠を知りたい人たち (実際には `App.tsx` の 1 件)。同じ物は 1 度しか入らない。 */
const listeners = new Set<() => void>();

export function hostSubscribe(cb: () => void): void {
  listeners.add(cb);
}

export function hostUnsubscribe(cb: () => void): void {
  listeners.delete(cb);
}

/** 通知の最中に購読が増減しても回り方が変わらないよう、写しを返す。 */
export function hostListeners(): Array<() => void> {
  return [...listeners];
}

export function hostResetListeners(): void {
  listeners.clear();
}

/**
 * 送受で**共有する 1 本の道**。`BroadcastChannel` は自分が送った物を自分では受け取らないが、同じ文脈の別の channel には届く
 * (実 Chromium で測った)。送信ごとに新しい channel を作ると、このタブの中継が自分の合図を拾って自分を施錠する
 * (ハードリセットで実際に起きた) ので、送るのも受けるのも同じ 1 本にする。
 */
let shared: BroadcastChannel | null = null;

export function hostSharedChannel(name: string): BroadcastChannel | null {
  if (shared !== null) return shared;
  try {
    shared = new BroadcastChannel(name);
  } catch {
    // BroadcastChannel が無い / 使えない環境。他のタブは自分の自動施錠で落ちる。
    // (`shared` は成功時にしか代入しないので、ここで null へ戻す必要は無い。)
  }
  return shared;
}

/** 閉じてから捨てる。閉じずに捨てると、`onmessage` を付けたままの受け口が残り、次の検査の合図で前の検査の保管庫を施錠しに来る。 */
export function hostResetChannel(): void {
  if (shared !== null) shared.close();
  shared = null;
}

/** 受けた合図の中身だけを渡す (`MessageEvent` そのものは渡さない)。`null` で解除。 */
export function hostOnMessage(channel: BroadcastChannel, handler: ((data: unknown) => void) | null): void {
  channel.onmessage = handler === null ? null : (event: MessageEvent) => handler(event.data);
}
