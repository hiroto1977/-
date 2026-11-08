/**
 * `httpLimits.mamori` の host 壁 —— Mamori の組み込みに無い物 (`Response` / `Uint8Array` /
 * `TextDecoder` / 時計と中断の部品) だけを、判断を持たない小さな関数として置く (MG-047)。
 *
 * どれも引数だけから答えを出すか、渡された部品に 1 つの操作を足すだけで、**上限も締切の長さも
 * ここでは決めない** (数を決めて断るのは `httpLimits.mamori` の側)。
 */

/** 応答 (`Response`) か。 */
export function hostIsResponse(value: unknown): boolean {
  return value instanceof Response;
}

/** 応答の本文を読む部品。無い (テストの素朴なモック) なら null。 */
export function hostBodyReader(res: Response): ReadableStreamDefaultReader<Uint8Array> | null {
  return res.body ? res.body.getReader() : null;
}

/** 本文の塊を 1 つ読む。 */
export function hostReadChunk(
  reader: ReadableStreamDefaultReader<Uint8Array>,
): Promise<{ readonly done: boolean; readonly value?: Uint8Array }> {
  return reader.read();
}

/** 読むのをやめる (失敗しても無視する)。 */
export function hostCancelReader(reader: ReadableStreamDefaultReader<Uint8Array>): void {
  reader.cancel().catch(() => {});
}

/** 塊をつないで文字列にする (`total` は塊の長さの合計)。 */
export function hostDecodeChunks(chunks: readonly Uint8Array[], total: number): string {
  const buf = new Uint8Array(total);
  let off = 0;
  for (const c of chunks) {
    buf.set(c, off);
    off += c.byteLength;
  }
  return new TextDecoder().decode(buf);
}

/** 塊の長さ。 */
export function hostChunkLength(chunk: Uint8Array): number {
  return chunk.byteLength;
}

/** 締切の部品: 中断の信号と、後で落とす timer。 */
export interface HostDeadline {
  readonly signal: AbortSignal;
  readonly timer: unknown;
}

/**
 * `timeoutMs` で中断する信号を作る。呼び出し側の signal が在れば合成する
 * (`AbortSignal.any` が無い古い環境では自前の中断だけ)。`unref` が真なら timer が
 * プロセスを起こし続けない (Node)。
 */
export function hostDeadline(
  timeoutMs: number,
  caller: AbortSignal | null | undefined,
  unref: boolean,
): HostDeadline {
  const controller = new AbortController();
  const timer: unknown = setTimeout(() => controller.abort(), timeoutMs);
  if (unref) (timer as { unref?: () => void }).unref?.();
  const signal =
    caller && typeof AbortSignal.any === 'function'
      ? AbortSignal.any([caller, controller.signal])
      : controller.signal;
  return { signal, timer };
}

/** timer を落とす。 */
export function hostClearTimer(timer: unknown): void {
  clearTimeout(timer as ReturnType<typeof setTimeout>);
}

/** `mode: 'no-cors'` の初期化か。 */
export function hostIsNoCors(init: unknown): boolean {
  // null / undefined / 数・文字列は欄を持たない —— 任意連鎖で読めば条件分岐を置かずに全部 false になる。
  return (init as { mode?: unknown } | null | undefined)?.mode === 'no-cors';
}

/**
 * ヘッダを 1 つ読む。`headers` や `get` が無い素朴なモック (テスト) では null —— 例外にしない
 * (大きさの先手の門は「読めなければ byte 単位の門へ委ねる」)。
 */
export function hostHeader(res: Response, name: string): string | null {
  return res.headers?.get?.(name) ?? null;
}
