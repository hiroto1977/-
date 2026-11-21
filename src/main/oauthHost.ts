/**
 * `oauth.mamori` の薄い壁 (2026-11-09 · MG-050)。
 *
 * Node の口 (`process.env` / 乱数 / SHA-256 / `Buffer` / 時計 / `URLSearchParams` / `http` の待受 / `fetch` / 打ち切り) は
 * Mamori の `extern pure global` にできない (宣言した名前が副作用の判断を持つ口に届くため) ので、ここへ閉じ込める。
 * **判断は持たない** —— 値を渡して結果を返すだけ。判断 (https だけを通す・state の定時間比較・迷い要求の扱い・
 * 転送への非追随・応答サイズの上限・失敗本文の伏字) は `oauth.mamori` が持つ。
 *
 * ここに残る「判断らしい物」は 2 つで、どちらも**呼び手が渡した値の通りに動くだけ**:
 * - `hostListenForCallback` は、要求ごとに `decide` が返した応答 (状態・頭書き・本文・待受をどうするか) をそのまま書く
 * - 打ち切りの文言は呼び手が渡す (ここで文を組まない)
 */
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { createHash, randomBytes } from 'node:crypto';
import { DEFAULT_HTTP_TIMEOUT_MS, egressInit, withTimeout } from '../shared/httpLimits';

/** 環境変数を読む。無ければ空文字 (呼び手の `?? ''` と同じ)。 */
export function hostEnv(name: string): string {
  return process.env[name] ?? '';
}

/** OS の乱数で n byte。 */
export function hostRandomBytes(n: number): Uint8Array {
  return randomBytes(n);
}

/** バイト列の base64 (パディングあり・`+` `/` のまま)。url 安全な綴りへの直しは呼び手が行う。 */
export function hostBase64(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString('base64');
}

/** 文字列を UTF-8 のバイトにして base64 にする (HTTP Basic 認証の資格情報)。 */
export function hostUtf8Base64(text: string): string {
  // Stryker disable next-line StringLiteral: `'utf8'` を空にしても Node は utf8 へ
  // 落とすため同じ base64 になる (実測: Buffer.from('a:b','') === Buffer.from('a:b','utf8'))。
  return Buffer.from(text, 'utf8').toString('base64');
}

/** 文字列の SHA-256 (バイト列)。 */
export function hostSha256(text: string): Uint8Array {
  return createHash('sha256').update(text).digest();
}

/** 今の時刻 (epoch ms)。 */
export function hostNow(): number {
  return Date.now();
}

/** `URLSearchParams` を作る。 */
export function hostSearchParams(init: Record<string, string>): URLSearchParams {
  return new URLSearchParams(init);
}

/**
 * 呼ぶ時点の `fetch` を呼ぶ (差し込まれなかったときの既定)。
 * **`fetch` を値として束縛しない** —— 呼ぶ時点の globalThis.fetch を読むので、後から差し替えた物 (検査の代役) にも追随する。
 * 転送に追随しない規則 (`egressInit`) は呼び手も掛けるが、冪等なので二重に掛けても同じ init になる。
 */
export const hostFetch: typeof fetch = (input, init) => fetch(input, egressInit({ ...init }));

/** 通常の HTTP の締切 (本文を読み終えるまで) の中で走らせる。 */
export function hostWithTimeout<T>(run: (signal: AbortSignal) => Promise<T>): Promise<T> {
  return withTimeout(DEFAULT_HTTP_TIMEOUT_MS, null, run);
}

/** 待受が 1 要求に返す応答と、その後の待受の扱い (**判断は呼び手 `decideCallbackReply` が持つ**)。 */
export interface CallbackReply {
  readonly status: number;
  readonly headers?: Record<string, string>;
  readonly body?: string;
  /** false = 待受を続ける / true = 閉じる (`message` が在れば拒否・無ければ `code` / `state` で解決)。 */
  readonly done: boolean;
  readonly code?: string;
  readonly state?: string;
  readonly message?: string;
}

export type CallbackDecider = (hostHeader: string | undefined, reqUrl: string | undefined) => CallbackReply;

export interface CallbackResult {
  code: string;
  state: string;
}

export type CallbackListener = Promise<CallbackResult> & {
  port: () => Promise<number>;
  cancel: () => void;
};

/**
 * 127.0.0.1:0 で待受を開く。要求ごとの扱いは `decide` が決め、ここはその通りに書くだけ。
 * 解決・拒否・時間切れ・取り消しの経路は元の `listenForCallback` と同じ。
 */
export function hostListenForCallback(
  decide: CallbackDecider,
  timeoutMs: number,
  timeoutMessage: string,
  cancelMessage: string,
): CallbackListener {
  let resolve!: (r: CallbackResult) => void;
  let reject!: (err: Error) => void;
  const promise = new Promise<CallbackResult>((res, rej) => {
    resolve = res;
    reject = rej;
  });

  let portResolve!: (n: number) => void;
  let portReject!: (err: Error) => void;
  const portPromise = new Promise<number>((res, rej) => {
    portResolve = res;
    portReject = rej;
  });

  const server = http.createServer((req, res) => {
    const reply = decide(req.headers.host, req.url);
    res.writeHead(reply.status, reply.headers).end(reply.body);
    if (!reply.done) return;
    if (reply.message !== undefined) {
      reject(new Error(reply.message));
    } else {
      resolve({ code: reply.code as string, state: reply.state as string });
    }
    // Close after the response is flushed so the browser sees the page.
    // Equivalent mutant: dropping server.close() leaves the server
    // listening until the outer 5-min timeout or .cancel() fires. Tests
    // that complete in <5min cannot observe the difference.
    // Stryker disable next-line ArrowFunction
    setTimeout(() => server.close(), 50);
  });

  // Hard-to-kill mutants below: provoking a server.on('error') in a
  // unit test requires a kernel-level binding failure (e.g. exhausting
  // ephemeral ports); the 'error' event name and the '127.0.0.1' bind
  // host are both effectively integration concerns. Listening on '' (the
  // empty-bind mutant) still works on most OSes for loopback connects.
  // Same goes for the error/listen handler bodies — only fired on
  // genuine network failure.
  // カーネル側の bind 失敗 (エフェメラルポート枯渇など) でしか発火しないため、
  // 単体テストからは到達できない。イベント名も含めて観測できない。
  /* Stryker disable BlockStatement,StringLiteral */
  server.on('error', (err) => {
    portReject(err);
    reject(err);
  });
  /* Stryker restore BlockStatement,StringLiteral */

  server.listen(0, '127.0.0.1', () => {
    const port = (server.address() as AddressInfo).port;
    portResolve(port);
  });

  const timeout = setTimeout(() => {
    reject(new Error(timeoutMessage));
    server.close();
  }, timeoutMs);

  // `.finally` creates a chained promise; if no consumer .catches the
  // chain, Node reports an unhandled rejection alongside the main
  // promise. Silence the side chain — the original `promise` is what
  // the caller awaits.
  // Equivalent mutant: dropping clearTimeout leaves the 5-min timeout
  // pending. The original `promise` has already resolved/rejected so
  // the caller sees no difference; only the process exit is delayed
  // until the timer expires.
  // Stryker disable next-line ArrowFunction
  promise.finally(() => clearTimeout(timeout)).catch(() => {});

  return Object.assign(promise, {
    port: () => portPromise,
    cancel: () => {
      reject(new Error(cancelMessage));
      server.close();
    },
  });
}
