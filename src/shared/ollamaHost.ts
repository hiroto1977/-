/**
 * `ollama.mamori` の host 壁 —— Mamori では書けない 3 つの読みだけを、副作用の無い小さな関数として置く (MG-035)。
 *
 * - `hostNewDate` / `hostParseUtc`: `Date` は Mamori の組み込みに無い (時計を読む物なので `extern pure` で名指しする)。
 * - `hostField`: 外から来た JSON (`unknown`) の欄を 1 つ読む。物でなければ `undefined` —— `as` で型を書き換えずに済む。
 *
 * どれも引数だけから答えを出し、書き込みも通信もしない。
 */

export function hostNewDate(): Date {
  return new Date();
}

export function hostParseUtc(text: string): number {
  return Date.parse(text);
}

export function hostField(value: unknown, key: string): unknown {
  if (value === null || typeof value !== 'object') return undefined;
  return (value as Record<string, unknown>)[key];
}
