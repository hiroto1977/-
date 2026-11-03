import { describe, expect, it } from 'vitest';
import { compileProject, formatDiagnostic } from '../compile';

/*
 * **Mamori 0.16 —— `x instanceof Y` (MG-028)。** 足す前に破った。
 *
 * 関係演算子の段に `instanceof` を 1 語足す。右辺は**名前そのものだけ**で、その名前は次のどちらかでなければならない:
 *   ① このモジュールの名前で隠れていない組み込み (`Error` / `TypeError` / `URL` ほか PURE_GLOBALS)
 *   ② `use` / `extern pure` で宣言した名前
 * 塞いだ道は 6 つ:
 *   ① 右辺が宣言していない名前 (`Function` ほか) —— 値として読むのと同じ M6 が断る
 *   ② 右辺がメンバ・呼び出し・条件・添字 —— 実行時に計算した値を右辺にできると、`x instanceof (計算した物)` が `Symbol.hasInstance` を辿る
 *   ③ 右辺が局所の名前 (const / fn / 引数 / catch の束縛) —— 計算した値かもしれない
 *   ④ 右辺が危ない口 —— M2
 *   ⑤ 左辺も他の式と同じ検めを通る (宣言していない名前 M6・危ない口 M2)
 *   ⑥ 結果は印を運ばない —— 印の値の `instanceof` を印つきの口へ渡せない
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
const fn = (body: string): string => `export fn f(x: unknown) -> boolean {\n${body}\n}\n`;

describe('0.16 instanceof (threat: T-224 の続き・M6 の右辺の検め)', () => {
  it('★ 右辺が宣言していない名前は断る (Function ほか —— 値として読むのと同じ M6)', () => {
    expect(diag(fn('  return x instanceof Function;')).join('\n')).toMatch(/M6.*宣言していない名前 Function/);
    expect(diag(fn('  return x instanceof Foo;')).join('\n')).toMatch(/M6.*宣言していない名前 Foo/);
    expect(diag(fn('  return x instanceof window;')).join('\n')).toMatch(/M6/);
  });

  it('★ 右辺は名前だけ —— メンバ・呼び出し・条件・添字・括弧つきの計算は断る (計算した値の Symbol.hasInstance を辿らせない)', () => {
    expect(diag(fn('  return x instanceof Error.prototype;')).join('\n')).toMatch(/Mamori に在りません/);
    expect(diag(fn('  return x instanceof Error.constructor;')).join('\n')).toMatch(/Mamori に在りません/);
    expect(diag(fn('  return x instanceof URL.parse;')).join('\n')).toMatch(/M6.*instanceof の右辺は名前だけです/);
    expect(diag(fn('  return x instanceof Math.max(1);')).join('\n')).toMatch(/M6.*instanceof の右辺は名前だけです/);
    expect(diag(fn('  return x instanceof (x ? Error : TypeError);')).join('\n')).toMatch(/M6.*instanceof の右辺は名前だけです/);
    expect(diag(fn('  return x instanceof [Error][0];')).join('\n')).toMatch(/M6.*instanceof の右辺は名前だけです/);
    expect(diag(fn('  return x instanceof new Error("a");')).join('\n')).toMatch(/M6.*instanceof の右辺は名前だけです/);
    expect(diag(fn('  return x instanceof "str";')).join('\n')).toMatch(/M6.*instanceof の右辺は名前だけです/);
    expect(diag(fn('  return x instanceof 1;')).join('\n')).toMatch(/M6.*instanceof の右辺は名前だけです/);
  });

  it('★ 右辺が局所の名前 (const / fn / 引数 / 組み込みを隠す名前 / catch の束縛) は断る', () => {
    const LOCAL = /M6.*instanceof の右辺は組み込みか宣言した外の名前だけです/;
    expect(diag('const K = x0();\nfn x0() -> number { return 1; }\n' + fn('  return x instanceof K;')).join('\n')).toMatch(LOCAL);
    expect(diag(fn('  const K = x;\n  return x instanceof K;')).join('\n')).toMatch(LOCAL);
    expect(diag('fn mk() -> number { return 1; }\n' + fn('  return x instanceof mk;')).join('\n')).toMatch(LOCAL);
    expect(diag('export fn g(x: unknown, C: unknown) -> boolean {\n  return x instanceof C;\n}\n').join('\n')).toMatch(LOCAL);
    // 組み込みの名前を局所の名前で隠すと、もう組み込みではない (隠された名前を右辺にできない)
    expect(diag(fn('  const Error = 1;\n  return x instanceof Error;')).join('\n')).toMatch(LOCAL);
    expect(diag(fn('  try { return false; } catch (e) { return x instanceof e; }')).join('\n')).toMatch(LOCAL);
  });

  it('★ 右辺が危ない口なら M2 (sink 関数の外・中のどちらでも名前の持ち出しは断る)', () => {
    expect(diag('extern sink global shellx;\n' + fn('  return x instanceof shellx;')).join('\n')).toMatch(/M2.*危ない口 shellx.*instanceof の右辺に置けません/);
    const pre = 'export vetted VU = "u";\nextern sink global sinkx;\nexport sink fn go(u: VU) -> boolean {\n  return u instanceof sinkx;\n}\n';
    expect(diag(pre).join('\n')).toMatch(/M2.*危ない口 sinkx.*instanceof の右辺に置けません/);
  });

  it('★ 左辺も他の式と同じ検めを通る (宣言していない名前・危ない口)', () => {
    expect(diag(fn('  return evil instanceof Error;')).join('\n')).toMatch(/M6.*evil/);
    expect(diag('extern sink global shellx;\n' + fn('  return shellx instanceof Error;')).join('\n')).toMatch(/M2/);
    expect(diag(fn('  return x.constructor instanceof Error;')).join('\n')).toMatch(/Mamori に在りません/);
    expect(diag(fn('  return Object instanceof Error;')).join('\n')).toMatch(/M6.*Object/);
  });

  it('★ 結果は印を運ばない (印の値の instanceof を印つきの口へ渡せない)', () => {
    const pre = 'export vetted VU = "u";\nextern sink global sinkx;\nexport gate fn okUrl(raw: string) -> VU | null {\n  if (raw.length > 0) { return mint VU(raw); }\n  return null;\n}\n'
      + 'export sink fn go(u: VU) -> void {\n  sinkx.open(u);\n}\n';
    const d = diag(`${pre}export fn g(raw: string) -> void {\n  const u = okUrl(raw);\n  if (u === null) { return; }\n  const b = u instanceof Error;\n  go(b);\n}\n`);
    expect(d.join('\n')).toMatch(/M4/);
  });

  it('★ instanceof は式の中で名前として読めない (予約語 —— 名前のつもりで書いた右辺・欄の省略形も断る)', () => {
    expect(diag(fn('  return instanceof;')).join('\n')).toMatch(/instanceof.*ここに置けません/);
    expect(diag(fn('  return { instanceof };')).join('\n')).toMatch(/省略形/);
    expect(diag(fn('  return [instanceof];')).join('\n')).toMatch(/ここに置けません/);
    expect(diag(fn('  return xs(instanceof);')).join('\n')).not.toEqual('');
  });

  it('★ 左辺が無い・右辺が無い形は断る', () => {
    expect(diag(fn('  return instanceof Error;')).join('\n')).not.toEqual('');
    expect(diag(fn('  return x instanceof;')).join('\n')).not.toEqual('');
  });

  it('許す形: 組み込みの例外・URL・配列・宣言した名前 (use)', () => {
    expect(diag(fn('  return x instanceof Error;'))).toEqual([]);
    expect(diag(fn('  return x instanceof TypeError || x instanceof RangeError;'))).toEqual([]);
    expect(diag(fn('  return x instanceof URL;'))).toEqual([]);
    expect(diag(fn('  return x instanceof Array;'))).toEqual([]);
    expect(diag(fn('  return x instanceof Object;'))).toEqual([]);
    expect(diag(fn('  try { return false; } catch (e) { return e instanceof Error; }'))).toEqual([]);
    expect(diag('extern pure global Date;\n' + fn('  return x instanceof Date;'))).toEqual([]);
    expect(diag('use { Klass } from "./other";\n' + fn('  return x instanceof Klass;')).join('\n')).not.toMatch(/instanceof の右辺は/);
  });
});

describe('0.16 instanceof の変換', () => {
  it('関係演算子としてそのまま出る', () => {
    expect(ts(fn('  return x instanceof Error;'))).toContain('return x instanceof Error;');
  });

  it('強さは関係演算子と同じ (= 比較と && / || の間・加減乗除より弱い)', () => {
    expect(ts(fn('  return x instanceof Error && x instanceof TypeError;'))).toContain('x instanceof Error && x instanceof TypeError');
    expect(ts(fn('  return !(x instanceof Error);'))).toContain('!(x instanceof Error)');
    expect(ts(fn('  return typeof x === "object" && x instanceof URL;'))).toContain('typeof x === "object" && x instanceof URL');
    expect(ts(fn('  return (x instanceof Error) === true;'))).toContain('x instanceof Error === true');
    expect(ts(fn('  return (x === 1) instanceof Error;'))).toContain('(x === 1) instanceof Error');
    expect(ts(fn('  return x instanceof Error ? true : false;'))).toContain('x instanceof Error ? true : false');
  });

  it('関係演算子と同じ段なので左結びに並ぶ', () => {
    expect(ts(fn('  return x instanceof Error instanceof Error;'))).toContain('x instanceof Error instanceof Error');
  });
});
