/**
 * 自動ロックが使う host (タイマー・DOM) の口。autoLock.mamori が `extern pure { … } from "./autoLockHost"` で読む。
 *
 * - `setTimeout` が返す物 (Node の `Timeout` / ブラウザの数) は `unknown` の取っ手として運び、返すときに型へ戻す。
 *   この型の戻しは Mamori に `as` が無いのでこのファイルに閉じ込める。
 * - `window` / `document` は網・記憶・移動・DOM の口をメンバに持つので、Mamori では `extern pure global` にできない (T-249)。
 *   自動ロックが要るのは「在るか」と「隠れているか」と、リスナーを付ける相手 (`EventTarget`) だけなので、その 4 つだけをここから渡す。
 */
export function hostSetTimeout(cb: () => void, ms: number): unknown {
  return setTimeout(cb, ms);
}

export function hostClearTimeout(handle: unknown): void {
  clearTimeout(handle as ReturnType<typeof setTimeout>);
}

export function hostHasDocument(): boolean {
  return typeof document !== 'undefined';
}

export function hostHasWindow(): boolean {
  return typeof window !== 'undefined';
}

export function hostDocumentHidden(): boolean {
  return typeof document !== 'undefined' && document.hidden;
}

/** リスナーを付ける相手 (`document` / `window`)。無い環境では呼ばれない (`hostHas*` の門が先に在る)。 */
export function hostDocumentTarget(): EventTarget {
  return document;
}

export function hostWindowTarget(): EventTarget {
  return window;
}
