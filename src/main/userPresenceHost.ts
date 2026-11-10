/**
 * `userPresence.mamori` の host 壁 (2026-11-10 · MG-054)。
 *
 * Mamori では書けない 4 つの読みだけを、**判断を持たない**小さな関数として置く:
 * - `hostNow`: 時計 (`Date` は Mamori の組み込みに無い)。
 * - `hostField`: 外から来た値 (`unknown`) の欄を 1 つ読む。`as` で型を書き換えずに済む。
 * - `hostHasPlainPrototype`: 物の原型が `Object.prototype` か `null` か。`Object.getPrototypeOf` は
 *   Mamori が値として扱わない `Object` のメンバなので、事実だけを返し「素の物として受けるか」の判断は呼び手が持つ。`hostField` は物の欄の読みだけ。
 * - `hostResolvePath`: `path.resolve` (Node の口)。file:// の許可の判断は `fileRequestGate` が持つ。
 *
 * どれも引数だけから答えを出し、書き込みも通信もしない。
 */
import path from 'node:path';

export function hostNow(): number {
  return Date.now();
}

/** 物の欄を 1 つ読む (呼び手は物であることを先に確かめている —— 型が `object` なので物でない値は渡せない)。 */
export function hostField(value: object, key: string): unknown {
  return (value as Record<string, unknown>)[key];
}

/** 原型が `Object.prototype` か `null` か (事実だけ。「素の物として受けるか」は呼び手が決める)。 */
export function hostHasPlainPrototype(value: object): boolean {
  const proto = Object.getPrototypeOf(value);
  return proto === null || proto === Object.prototype;
}

export function hostResolvePath(p: string): string {
  return path.resolve(p);
}
