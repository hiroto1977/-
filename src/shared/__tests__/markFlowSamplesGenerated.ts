/**
 * 標本: Mamori の生成物として走査する形。**どの関数も呼ばれない。**
 *
 * Mamori には型の言い換え (`as`) が無いので、生成物の中で型引数 `T` の位置へ値を作れるのは
 * 型の無い値 (`JSON.parse(…)` ほか) だけである。その形を定義の側で数える
 * (2026-11-16 · MG-074 · 台帳の T-272)。行末の印の読み方は `markFlowSamples.ts` と同じ。
 */

export function launder<T>(x: string): T {
  return JSON.parse(x); // !! any-to-type-param
}
export function viaLocal<T>(x: string): T {
  const v: T = JSON.parse(x); // !! any-to-type-param
  return v;
}
export function viaArray<T>(x: string): T[] {
  return JSON.parse(x); // !! any-to-type-param
}
export function viaPromise<T>(x: string): Promise<T> {
  return Promise.resolve(JSON.parse(x)); // !! any-to-type-param
}
export function viaChecked<T>(x: string, check: (v: unknown) => T | null): T | null {
  const v: unknown = JSON.parse(x); // ok
  return check(v); // ok
}
export function same<T>(x: T): T {
  return x; // ok
}
export function plain(x: string): unknown {
  return JSON.parse(x); // ok
}
