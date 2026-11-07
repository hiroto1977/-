import { describe, expect, it } from 'vitest';
import { compileProject, formatDiagnostic } from '../compile';

/*
 * **Mamori 0.7 —— 組み込みの構築子・名前空間を値として持ち出せない** (2026-11-01 · MG-006 · threat: T-243)。
 *
 * 言語の穴探しの周 (手探り 50 本余り) で、`Object.freeze(Array)` が通ることを見つけた。`Object.freeze` は自前の表を凍らせるために
 * 許してあるが、`Array` / `Math` / `JSON` / `Promise` / `String` / `Map` ほかの**名前を値として**渡せば、凍らせる相手を選べた。
 * 実行すると `Promise.x = …` を足す後続のコード (差し替え・polyfill) が strict mode で投げる —— 「副作用の判断を持たない」と
 * 名乗る組み込みを、守りの層のモジュールが全体に効く形で変えられた。
 *
 * 直し: 組み込み (Object / RegExp / Error / URL は 0.4 までに断り済み) の残り 9 つも、**メンバを直に使う・呼ぶ・構築する**形でだけ名前で使える。
 * 既知の残り (正直に): `Object.freeze(Math.floor)` のように**組み込みの関数**を凍らせる形は残る —— 関数に後から欄を足す物は無く、
 * 構築子 (`Promise.withResolvers = …` のように静的な欄を足される側) ではないので、全体への効き目が無い。
 */

function compile(source: string): { diagnostics: string[]; output: string } {
  const r = compileProject([{ path: 'src/x/m0.mamori', source }]);
  return r.ok ? { diagnostics: [], output: [...r.outputs.values()][0]! } : { diagnostics: r.diagnostics.map(formatDiagnostic), output: '' };
}
const go = (body: string): string => `export fn go(u: string, o: unknown) -> unknown {\n${body}\n}\n`;
const PLAIN = ['Array', 'String', 'Number', 'Boolean', 'Math', 'JSON', 'Promise', 'Map', 'Set'] as const;
const msg = (n: string): string => `組み込みの ${n} は値として持ち出せません`;

describe('0.7: 組み込みの名前を値として持ち出せない (T-243)', () => {
  it('★ 組み込み 9 つの名前を Object.freeze に渡す形は断る —— アプリ全体の組み込みを凍らせる相手を選べる (threat: T-243)', () => {
    for (const n of PLAIN) {
      const d = compile(go(`  return Object.freeze(${n});`)).diagnostics;
      expect(d, n).toHaveLength(1);
      expect(d[0], n).toContain('[M6]');
      expect(d[0], n).toContain(msg(n));
    }
  });
  it('★ 別名・条件演算子・配列・引数・typeof 越しの持ち出しも断る (threat: T-243)', () => {
    for (const body of ['  const a = Array; return Object.freeze(a);', '  return Object.freeze(u === "" ? Array : JSON);', '  return Object.freeze([Array, JSON]);', '  return [1].filter(Boolean);', '  return typeof Array;']) {
      const d = compile(go(body)).diagnostics;
      expect(d.length, body).toBeGreaterThan(0);
      expect(d.every((x) => x.includes('[M6]')), body).toBe(true);
    }
  });
  it('メンバを直に使う・呼ぶ・構築する形は今までどおり通る', () => {
    for (const body of [
      '  return Math.floor(1.5) + Math.PI;',
      '  return JSON.stringify(JSON.parse(u));',
      '  return new Map([[1, 2]]).size + new Set([1]).size;',
      '  return String(1) + Number("2") + Boolean(1);',
      '  return Array.isArray(o) ? Array.from([1]) : [];',
      '  return Promise.resolve(1);',
    ]) {
      expect(compile(go(body)).diagnostics, body).toEqual([]);
    }
  });
  it('このモジュールの名前で隠れていれば、その名前は組み込みではない (自前の値は凍らせてよい)', () => {
    expect(compile(go('  const Array = [1]; return Object.freeze(Array);')).diagnostics).toEqual([]);
  });
  it('0.4 までに断った Object / RegExp / URL は、今までの文面のまま断る', () => {
    expect(compile(go('  return Object.freeze(Object);')).diagnostics[0]).toContain('組み込みの Object は値として持ち出せません');
    expect(compile(go('  return Object.freeze(URL);')).diagnostics[0]).toContain('組み込みの URL は値として持ち出せません');
  });
});
