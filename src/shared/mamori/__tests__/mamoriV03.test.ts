import { describe, expect, it } from 'vitest';
import { compileProject, formatDiagnostic } from '../compile';

/*
 * **Mamori 0.3 —— 16 進の数と、0.2 の穴 (T-225)** (2026-10-30 · パス 564 · threat: T-225)。
 *
 * ## 0.2 の穴 (T-225)
 *
 * 0.2 の M4 (印を受ける引数へ印の無い値を渡さない) は**名前を直に呼ぶ形** (`openUrl(raw)`) しか見ていなかった。
 * 印を受ける関数を値として持ち出すと —— `openUrl.call(null, raw)` / `.apply` / `.bind`・`const f = openUrl; f(raw)`・
 * `{ g: openUrl }.g(raw)`・`[openUrl].map(…)`・`(c ? openUrl : openUrl)(raw)`・`for (const f of [openUrl])` ——
 * コンパイラは素の値を渡すのを通した (この 8 形は変換後の `tsc --strict` が型で断るので、Mamori の規則としての穴)。
 * **より重いのは sink 関数の中**で、行き先 (第 1 引数) を印の型で受けていても、本体は危ない口へ**別の素の引数**を
 * 流せた (`shell.openExternal(raw)`)・危ない口そのものを返せた (`return shell;` / `return { s: shell };`) ——
 * こちらは `tsc` も通す。どちらも規則を破るプログラムをコンパイルして確かめ、狙った規則の番号と文で断ることを見る。
 *
 * ## 0.3 で足した構文
 *
 * 16 進の数 (`0x20` / `0X1F`)。制御文字やビットの境目は 16 進で書くほうが読み手が確かめやすく、
 * `shared/controlChars.ts` (`c < 0x20 || c === 0x7f`) を移すのに要った。
 */

const VETTED = 'export vetted VettedUrl = "url";\n';
const EXTERN = 'extern sink { shell } from "electron";\n';
const SINK = 'export sink fn openUrl(u: VettedUrl) -> Promise<void> {\n  return shell.openExternal(u);\n}\n';
const GO = (body: string, sig = 'export fn go(raw: string, c: boolean) -> unknown'): string => `${VETTED}${EXTERN}${SINK}${sig} {\n${body}\n}\n`;

function diags(...sources: string[]): string[] {
  const r = compileProject(sources.map((source, i) => ({ path: `src/x/m${i}.mamori`, source })));
  return r.ok ? [] : r.diagnostics.map(formatDiagnostic);
}
const at = (line: number, col: number, rule: string, message: string): string => `src/x/m0.mamori:${line}:${col}: [${rule}] ${message}`;
const AS_VALUE = 'openUrl は印を受ける関数なので、直に呼ぶことしかできません —— 値として持ち出すと (.call / .apply / .bind・別名・オブジェクトや配列・条件演算子)、引数の印の検めを迂回できる';
const SHELL_AS_VALUE = '危ない口 shell は sink 関数の中でも呼ぶ形 (shell(…) / shell.m(…)) でしか使えません —— 値として持ち出す・返すと、関門の外から素の値で呼べてしまう';
const SHELL_OTHER_ARG = '危ない口 shell へ渡す第 1 引数は、行き先 (印 VettedUrl を持つ値) だけです —— 行き先以外の値を流すと、sink 関数の印の型が意味を失う';

describe('T-225: 印を受ける関数は値として持ち出せない (M4)', () => {
  const CASES: readonly [string, string, string[]][] = [
    ['.call', GO('  return openUrl.call(null, raw);'), [at(7, 10, 'M4', AS_VALUE)]],
    ['.apply', GO('  return openUrl.apply(null, [raw]);'), [at(7, 10, 'M4', AS_VALUE)]],
    ['.bind', GO('  return openUrl.bind(null, raw)();'), [at(7, 10, 'M4', AS_VALUE)]],
    ['別名', GO('  const f = openUrl;\n  return f(raw);'), [at(7, 13, 'M4', AS_VALUE)]],
    ['オブジェクトに包む', GO('  return { g: openUrl }.g(raw);'), [at(7, 15, 'M4', AS_VALUE)]],
    ['配列に包む', GO('  return [openUrl].map((f) => f(raw));'), [at(7, 11, 'M4', AS_VALUE)]],
    ['条件演算子', GO('  return (c ? openUrl : openUrl)(raw);'), [at(7, 15, 'M4', AS_VALUE), at(7, 25, 'M4', AS_VALUE)]],
    ['for で回す', GO('  for (const f of [openUrl]) {\n    return f(raw);\n  }\n  return null;'), [at(7, 20, 'M4', AS_VALUE)]],
  ];
  for (const [name, src, want] of CASES) {
    it(`★ ${name} で持ち出すと断る (threat: T-225)`, () => expect(diags(src)).toEqual(want));
  }
  it('★ 印を受ける関数の .call で素の値を渡す形は断る (threat: T-225)', () => {
    expect(diags(GO('  return openUrl.call(null, raw);'))).toEqual([at(7, 10, 'M4', AS_VALUE)]);
  });
  it('対照: 直に呼ぶ・arrow の中で直に呼ぶのは通る (印を持つ値を渡すなら)', () => {
    expect(diags(GO('  return openUrl(u);', 'export fn go(u: VettedUrl) -> unknown'))).toEqual([]);
    expect(diags(GO('  return us.map((u: VettedUrl) => openUrl(u));', 'export fn go(us: readonly VettedUrl[]) -> unknown'))).toEqual([]);
  });
  it('対照: 印を受けない関数は値として持ち出せる (規則は印を受ける関数にだけ掛かる)', () => {
    expect(diags('fn twice(n: number) -> number {\n  return n * 2;\n}\nexport fn go(xs: readonly number[]) -> unknown {\n  return xs.map(twice);\n}\n')).toEqual([]);
  });
  it('対照: 同じ名前の引数はその関数ではない (内側の名前が勝つ)', () => {
    expect(diags(GO('  return openUrl;', 'export fn go(openUrl: string) -> unknown'))).toEqual([]);
  });
  it('★ 別のモジュールから use で引いた印を受ける関数も同じ', () => {
    const a = `${VETTED}${EXTERN}${SINK}`;
    const b = 'use { openUrl } from "./m0";\nexport fn go(raw: string) -> unknown {\n  return openUrl.call(null, raw);\n}\n';
    expect(diags(a, b)).toEqual([`src/x/m1.mamori:3:10: [M4] ${AS_VALUE}`]);
  });
});

describe('T-225: sink 関数の中でも、危ない口は行き先だけを渡して呼ぶ (M2)', () => {
  const SINK_WITH = (body: string, params = 'u: VettedUrl, raw: string'): string => `${VETTED}${EXTERN}export sink fn openUrl(${params}) -> unknown {\n${body}\n}\n`;
  const CASES: readonly [string, string, string[]][] = [
    ['行き先以外の素の引数を流す', SINK_WITH('  return shell.openExternal(raw);'), [at(4, 10, 'M2', SHELL_OTHER_ARG)]],
    ['引数なしで呼ぶ', SINK_WITH('  return shell.beep();'), [at(4, 10, 'M2', SHELL_OTHER_ARG)]],
    ['arrow の中で素の引数を流す', SINK_WITH('  return [1].map((x) => shell.openExternal(raw));'), [at(4, 25, 'M2', SHELL_OTHER_ARG)]],
    ['危ない口を返す', SINK_WITH('  return shell;'), [at(4, 10, 'M2', SHELL_AS_VALUE)]],
    ['危ない口をオブジェクトに入れて返す', SINK_WITH('  return { s: shell };'), [at(4, 15, 'M2', SHELL_AS_VALUE)]],
    ['危ない口のメンバを呼ばずに返す', SINK_WITH('  return shell.openExternal;'), [at(4, 10, 'M2', SHELL_AS_VALUE)]],
  ];
  for (const [name, src, want] of CASES) {
    it(`★ ${name} は断る (threat: T-225)`, () => expect(diags(src)).toEqual(want));
  }
  it('★ sink 関数の中で危ない口へ行き先以外を流す形は断る (threat: T-225)', () => {
    expect(diags(SINK_WITH('  return shell.openExternal(raw);'))).toEqual([at(4, 10, 'M2', SHELL_OTHER_ARG)]);
  });
  it('対照: 行き先を渡して呼ぶのは通る (メンバでも、名前を直に呼んでも)', () => {
    expect(diags(SINK_WITH('  return shell.openExternal(u);'))).toEqual([]);
    expect(diags(`${VETTED}extern sink { writeFile } from "node:fs/promises";\nexport sink fn put(p: VettedUrl, body: string) -> unknown {\n  return writeFile(p, body);\n}\n`)).toEqual([]);
  });
  it('★ 名前を直に呼ぶ危ない口も、行き先以外を流せば断る', () => {
    expect(diags(`${VETTED}extern sink { writeFile } from "node:fs/promises";\nexport sink fn put(p: VettedUrl, body: string) -> unknown {\n  return writeFile(body, p);\n}\n`))
      .toEqual([at(4, 10, 'M2', '危ない口 writeFile へ渡す第 1 引数は、行き先 (印 VettedUrl を持つ値) だけです —— 行き先以外の値を流すと、sink 関数の印の型が意味を失う')]);
  });
  it('対照: sink 関数の外では今までどおりの文 (sink 関数の中でだけ使えます)', () => {
    expect(diags(`${EXTERN}export fn f() -> unknown {\n  return shell.openExternal('x');\n}\n`))
      .toEqual(['src/x/m0.mamori:3:10: [M2] 危ない口 shell (extern sink) は sink 関数の中でだけ使えます']);
  });
  it('対照: 行き先の型が印でない sink 関数は M3 だけを出す (危ない口の呼び出しで重ねて断らない)', () => {
    const r = compileProject([{ path: 'src/x/m0.mamori', source: `${EXTERN}export sink fn s(u: string) -> unknown {\n  return shell.openExternal(u);\n}\n` }]);
    expect(r.ok ? [] : r.diagnostics.map((d) => d.rule)).toEqual(['M3']);
  });
});

describe('0.3 の構文: 16 進の数', () => {
  it('★ 16 進の数は綴りのまま書き出す (0x20 / 0X1F / 0xdead)', () => {
    const r = compileProject([{ path: 'src/x/g.mamori', source: 'export fn f(c: number) -> boolean {\n  return c < 0x20 || c === 0X1F || c === 0xdead;\n}\n' }]);
    if (!r.ok) throw new Error(r.diagnostics.map(formatDiagnostic).join('\n'));
    expect(r.outputs.get('src/x/g.ts')).toContain('  return c < 0x20 || c === 0X1F || c === 0xdead;\n');
  });
  it('★ 数字の無い 0x / 0X は断る', () => {
    expect(diags('export fn f() -> unknown {\n  return 0x;\n}\n')).toEqual([at(2, 10, 'M0', '`0x` の後に 16 進の数字 (0-9 / a-f) が要ります')]);
    expect(diags('export fn f() -> unknown {\n  return 0X;\n}\n')).toEqual([at(2, 10, 'M0', '`0X` の後に 16 進の数字 (0-9 / a-f) が要ります')]);
  });
  it('★ 16 進の数のメンバから原型へは届かない (0x1.constructor は M0)', () => {
    const ds = diags('export fn f() -> unknown {\n  return 0x1.constructor;\n}\n');
    expect(ds).toHaveLength(1);
    expect(ds[0]).toContain('[M0] `.constructor` は Mamori に在りません');
  });
  it('対照: 10 進の数は今までどおり (0 / 10 / 1_000 / 0.5)', () => {
    const r = compileProject([{ path: 'src/x/g.mamori', source: 'export fn f() -> unknown {\n  return [0, 10, 1_000, 0.5];\n}\n' }]);
    if (!r.ok) throw new Error('compile');
    expect(r.outputs.get('src/x/g.ts')).toContain('  return [0, 10, 1_000, 0.5];\n');
  });
});
