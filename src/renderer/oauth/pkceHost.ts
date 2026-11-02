/**
 * `pkce.mamori` の薄い壁 (2026-11-02 · MG-025)。
 *
 * ブラウザの口 (`btoa` / `crypto.getRandomValues` / `crypto.subtle` / `Date` / `fetch` / `URLSearchParams` / 打ち切りの `AbortController`) は
 * Mamori の `extern pure global` にできない (宣言した名前が副作用の判断を持つ口に届くため) ので、ここへ閉じ込める。
 * 判断は持たない —— 値を渡して結果を返すだけ。判断 (state の定時間比較・転送への非追随・応答サイズの上限・失敗本文の伏字) は
 * `pkce.mamori` が持つ。
 */
import { DEFAULT_HTTP_TIMEOUT_MS, withTimeout } from '../../shared/httpLimits';

/** `btoa` —— バイナリ文字列を base64 にする。 */
export function hostBtoa(bin: string): string {
  return btoa(bin);
}

/** OS の乱数で n byte。 */
export function hostRandomBytes(n: number): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(n));
}

/** 文字列の SHA-256。 */
export async function hostSha256(text: string): Promise<Uint8Array> {
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return new Uint8Array(hash);
}

/** 今の時刻 (epoch ms)。 */
export function hostNow(): number {
  return Date.now();
}

/**
 * 呼ぶ時点の `fetch` を呼ぶ (差し込まれなかったときの既定)。
 * **`fetch` を値として束縛しない** —— 呼ぶ時点の globalThis.fetch を読むので、後から差し替えた物 (検査の代役) にも追随する。
 */
export const hostFetch: typeof fetch = (input, init) => fetch(input, init);

/** `URLSearchParams` を作る。 */
export function hostSearchParams(init: string | Record<string, string>): URLSearchParams {
  return new URLSearchParams(init);
}

/** 通常の HTTP の締切 (本文を読み終えるまで) の中で走らせる。 */
export function hostWithTimeout(run: (signal: AbortSignal) => Promise<string>): Promise<string> {
  return withTimeout(DEFAULT_HTTP_TIMEOUT_MS, null, run);
}
