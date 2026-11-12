import { describe, expect, it } from 'vitest';
import { compileProject, formatDiagnostic } from '../compile';
import { IN_FORBIDDEN_KEYS } from '../parser';
import { inspectEmitted } from './mamoriInspect';

/*
 * **Mamori 0.29 —— `'k' in x` (MG-060)。** 足す前に破った。
 *
 * `in` は**原型の鎖をたどる** —— `'toString' in {}` も `'constructor' in {}` も真で、「自分の鍵か」を問うつもりのコードが
 * どの物にも真と答える。足し方は「自分の鍵を問う `Object.hasOwn` を先に選ぶ」を残したまま、`in` が要る所
 * (判別付きの和 `'tooLarge' in r` の絞り込み) のためだけに許す:
 *   ① 左辺は**字面の文字列だけ** —— 計算した鍵 (`k in x` に `'constructor'` を入れて原型を探る) を断つ
 *   ② 字面でも、`Object.prototype` の名前と `.` の後ろに置けない名前 (`FORBIDDEN_MEMBERS`) は断る
 *      (`\u` で綴りを変えても解いてから見る)
 *   ③ 右辺の inert (計算した鍵の添字の結果) は断る・右辺も他の式と同じ検めを通る (宣言していない名前 M6・危ない口 M2)
 *   ④ 結果は真偽で、印を運ばない
 *   ⑤ `in` は予約語 (名前に使えない)
 * 破って 5 通りすべて断られた (足す前の 0.28 は `in` そのものを M0 で断る)。
 */
function diag(source: string): string[] {
  const r = compileProject([{ path: 'src/x/m0.mamori', source }]);
  return r.ok ? [] : r.diagnostics.map(formatDiagnostic);
}
function ts(source: string): string {
  const r = compileProject([{ path: 'src/x/m0.mamori', source }]);
  if (!r.ok) throw new Error(r.diagnostics.map(formatDiagnostic).join('\n'));
  return [...r.outputs.values()][0]!;
}
const fn = (body: string): string => `export fn f(x: unknown, k: string) -> boolean {\n${body}\n}\n`;

/** 原型の鎖に在る名前 (`'k' in x` の左辺に置けない) —— 独立に書いた一覧 (実装は `Object.getOwnPropertyNames(Object.prototype)` から導く)。 */
const PROTOTYPE_NAMES = [
  'constructor', 'toString', 'valueOf', 'hasOwnProperty', 'isPrototypeOf', 'propertyIsEnumerable', 'toLocaleString',
  '__proto__', '__defineGetter__', '__defineSetter__', '__lookupGetter__', '__lookupSetter__', 'prototype',
];

describe('0.29 in 演算子 (原型の鎖をたどる・左辺は字面の文字列だけ)', () => {
  it('★ 左辺が字面の文字列でなければ断る (計算した鍵で原型の名前を探らせない)', () => {
    const LEFT = /M0.*`in` の左辺は字面の文字列だけです/;
    expect(diag(fn('  return k in x;')).join('\n')).toMatch(LEFT);
    expect(diag(fn('  return (k + "a") in x;')).join('\n')).toMatch(LEFT);
    expect(diag(fn('  return 1 in x;')).join('\n')).toMatch(LEFT);
    expect(diag(fn('  return x.a in x;')).join('\n')).toMatch(LEFT);
    expect(diag(fn('  return f(x, k) in x;')).join('\n')).toMatch(LEFT);
    expect(diag(fn('  return ("a" in x) in x;')).join('\n')).toMatch(LEFT);
  });

  it('★ 原型の鎖に在る名前・禁じた名前は字面でも断る (どの物にも真と答える)', () => {
    for (const name of PROTOTYPE_NAMES) {
      expect(diag(fn(`  return '${name}' in x;`)).join('\n'), name).toMatch(/M0.*は在りません —— `in` は原型の鎖をたどる/);
      expect(diag(fn(`  return "${name}" in x;`)).join('\n'), name).toMatch(/M0.*は在りません —— `in` は原型の鎖をたどる/);
    }
    // 綴りを変えても解いてから見る
    expect(diag(fn('  return "cons\\u0074ructor" in x;')).join('\n')).toMatch(/M0.*'constructor' in x/);
    expect(diag(fn('  return "\\u005f\\u005fproto__" in x;')).join('\n')).toMatch(/M0.*'__proto__' in x/);
    // 断りの文は自分の鍵を問う道 (Object.hasOwn) を名指しする
    expect(diag(fn("  return 'toString' in x;")).join('\n')).toMatch(/Object\.hasOwn\(x, 'toString'\)/);
  });

  it('★ 禁じる鍵の一覧は Object.prototype の名前を全部含む (実行系が足した名前も落とさない)', () => {
    for (const name of Object.getOwnPropertyNames(Object.prototype)) expect(IN_FORBIDDEN_KEYS.has(name), name).toBe(true);
    for (const name of PROTOTYPE_NAMES) expect(IN_FORBIDDEN_KEYS.has(name), name).toBe(true);
    // 普通の鍵は入っていない (一覧が広すぎて `'tooLarge' in r` まで断らない)
    for (const name of ['tooLarge', 'ok', 'a', 'content-type', '']) expect(IN_FORBIDDEN_KEYS.has(name), name).toBe(false);
  });

  it('★ 右辺の inert (計算した鍵の添字の結果) は断る', () => {
    const d = diag('export fn f(xs: unknown[], i: number) -> boolean {\n  const v = xs[i];\n  return "a" in v;\n}\n');
    expect(d.join('\n')).toMatch(/M6.*`in` の右辺に入れられません/);
  });

  it('右辺の inert を断るのは in だけ (比較・算術の右辺に inert を置く形は今までどおり通る)', () => {
    const pre = (e: string): string => `export fn f(xs: unknown[], i: number, x: unknown) -> boolean {\n  const v = xs[i];\n  return ${e};\n}\n`;
    expect(diag(pre('x === v'))).toEqual([]);
    expect(diag(pre('x !== v'))).toEqual([]);
    expect(diag(pre('x instanceof Error || x === v'))).toEqual([]);
    expect(diag(pre("'a' in x && x === v"))).toEqual([]);
  });

  it('★ 右辺も他の式と同じ検めを通る (宣言していない名前 M6・危ない口 M2・禁じたメンバ)', () => {
    expect(diag(fn("  return 'a' in evil;")).join('\n')).toMatch(/M6.*evil/);
    expect(diag('extern sink global shellx;\n' + fn("  return 'a' in shellx;")).join('\n')).toMatch(/M2/);
    expect(diag(fn("  return 'a' in x.constructor;")).join('\n')).toMatch(/Mamori に在りません/);
    expect(diag(fn("  return 'a' in Object;")).join('\n')).toMatch(/M6.*Object/);
    expect(diag(fn("  return 'a' in Function;")).join('\n')).toMatch(/M6.*Function/);
  });

  it('★ 結果は印を運ばない (印の値の `in` を印つきの口へ渡せない)', () => {
    const pre = 'export vetted VU = "u";\nextern sink global sinkx;\nexport gate fn okUrl(raw: string) -> VU | null {\n  if (raw.length > 0) { return mint VU(raw); }\n  return null;\n}\n'
      + 'export sink fn go(u: VU) -> void {\n  sinkx.open(u);\n}\n';
    const d = diag(`${pre}export fn g(raw: string) -> void {\n  const u = okUrl(raw);\n  if (u === null) { return; }\n  const b = "a" in u;\n  go(b);\n}\n`);
    expect(d.join('\n')).toMatch(/M4/);
  });

  it('★ in は予約語 (名前・欄の省略形・引数に置けない)', () => {
    // 束縛の名前に予約語を置ける (`const throw = 1;` も同じ) のは 0.28 以前からの挙動で、生成物の TS が構文エラーになり tsc が断つ (docs/REMAINING_WORK.md に記録)。
    expect(diag(fn('  return { in };')).join('\n')).toMatch(/省略形/);
    expect(diag('export fn g(in: number) -> number {\n  return in;\n}\n').join('\n')).not.toEqual('');
    expect(diag(fn("  return 'a' in;")).join('\n')).not.toEqual('');
    expect(diag(fn('  return in x;')).join('\n')).not.toEqual('');
  });

  it('許す形: 判別付きの和の絞り込み・&& / || / ! との組み合わせ・字面の鍵 (ハイフンや空文字も)', () => {
    expect(diag(fn("  return 'tooLarge' in x;"))).toEqual([]);
    expect(diag(fn("  return typeof x === 'object' && 'tooLarge' in x;"))).toEqual([]);
    expect(diag(fn("  return !('a' in x) || 'b' in x;"))).toEqual([]);
    expect(diag(fn("  return 'content-type' in x;"))).toEqual([]);
    expect(diag(fn("  return '' in x;"))).toEqual([]);
    expect(diag(fn("  if ('tooLarge' in x) { return true; }\n  return false;"))).toEqual([]);
    expect(diag(fn("  const has = 'a' in x;\n  return has;"))).toEqual([]);
  });
});

describe('0.29 in の変換', () => {
  it('関係演算子としてそのまま出る', () => {
    expect(ts(fn("  return 'tooLarge' in x;"))).toContain("return 'tooLarge' in x;");
  });

  it('強さは関係演算子と同じ (= 比較と && / || の間・加減乗除より弱い)', () => {
    expect(ts(fn("  return 'a' in x && 'b' in x;"))).toContain("'a' in x && 'b' in x");
    expect(ts(fn("  return !('a' in x);"))).toContain("!('a' in x)");
    expect(ts(fn("  return ('a' in x) === true;"))).toContain("'a' in x === true");
    expect(ts(fn("  return 'a' in x ? true : false;"))).toContain("'a' in x ? true : false");
    // 加減乗除は in より強い (括弧が要らない)
    expect(ts(fn("  return 'a' in 1 + 2 ? true : false;"))).toContain("'a' in 1 + 2");
    // 関係演算子と同じ段 (左結び) なので、より強い物は括弧なしで右辺に入り、同じ段は括弧が付く
    expect(ts(fn("  return 'a' in (x instanceof Error);"))).toContain("'a' in (x instanceof Error)");
  });

  it('生成物に穴が無い (独立の判定: 左辺が字面の文字列で、原型の名前でない)', () => {
    const out = ts(fn("  return 'tooLarge' in x && 'ok' in x;"));
    expect(inspectEmitted('x.ts', out, new Set())).toEqual([]);
  });

  it('★ 独立の判定は手で書いた穴の生成物を落とす (左辺が計算した鍵・原型の名前)', () => {
    const hole = (src: string): string[] => inspectEmitted('x.ts', src, new Set()).map((h) => h.reason);
    expect(hole('export function f(x: unknown, k: string): boolean {\n  return k in (x as object);\n}\n').join('|')).toMatch(/in の左辺/);
    expect(hole("export function f(x: object): boolean {\n  return 'constructor' in x;\n}\n").join('|')).toMatch(/原型の名前/);
    expect(hole("export function f(x: object): boolean {\n  return 'toString' in x;\n}\n").join('|')).toMatch(/原型の名前/);
    expect(hole("export function f(x: object): boolean {\n  return 'tooLarge' in x;\n}\n")).toEqual([]);
  });
});
