/**
 * `userPresence.mamori` の host 壁 (2026-11-10 · MG-054)。
 *
 * Mamori では書けない 4 つの読みだけを、**判断を持たない**小さな関数として置く:
 * - `hostNow`: 時計 (`Date` は Mamori の組み込みに無い)。
 * - `hostField`: 外から来た値 (`unknown`) の欄を 1 つ読む。`as` で型を書き換えずに済む。
 * - `hostPrototypeKind`: 物の原型が `Object.prototype` / `null` / それ以外のどれか。`Object.getPrototypeOf` は
 *   Mamori が値として扱わない `Object` のメンバなので、事実だけを返し「素の物として受けるか」の判断は呼び手が持つ。
 * - `hostResolvePath`: `path.resolve` (Node の口)。file:// の許可の判断は `fileRequestGate` が持つ。
 *
 * どれも引数だけから答えを出し、書き込みも通信もしない。
 */
import path from 'node:path';

export function hostNow(): number {
  return Date.now();
}

export function hostField(value: unknown, key: string): unknown {
  if (value === null || typeof value !== 'object') return undefined;
  return (value as Record<string, unknown>)[key];
}

export function hostPrototypeKind(value: object): 'object' | 'null' | 'other' {
  const proto = Object.getPrototypeOf(value);
  if (proto === null) return 'null';
  return proto === Object.prototype ? 'object' : 'other';
}

export function hostResolvePath(p: string): string {
  return path.resolve(p);
}
