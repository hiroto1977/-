import { describe, expect, it } from 'vitest';
import { compileProject, formatDiagnostic } from '../compile';
import { FORBIDDEN_MEMBERS } from '../parser';
import { OBJECT_MEMBERS, PURE_GLOBALS } from '../checker';
import { topLevelUnion } from '../emit';

/** `FORBIDDEN_MEMBERS.constructor` と書くと TypeScript は Object の `constructor` (Function) を見るので、鍵は変数で引く。 */
const reasonOf = (k: string): string => {
  const r = Object.hasOwn(FORBIDDEN_MEMBERS, k) ? FORBIDDEN_MEMBERS[k] : undefined;
  if (r === undefined) throw new Error(`FORBIDDEN_MEMBERS に ${k} が無い`);
  return r;
};

/*
 * **Mamori 0.2 —— 足した構文と、0.1 の穴** (2026-10-30 · パス 563 · threat: T-224)。
 *
 * ## 0.1 の穴 (T-224)
 *
 * 0.1 は `eval` を禁じていたのに、**メンバの連鎖で同じことができた** ——
 * `String.constructor(code)()` と `''.constructor.constructor(code)()` は関数の constructor (`Function`) に届き、
 * Mamori のコンパイラも変換後の `tsc` も通し、node で実行すると文字列がコードとして走った
 * (実測: `String.constructor('return 6*7')()` は 42)。`Function` という名前は M6 が断るが、メンバの連鎖は
 * どの名前も経由しない。もう 1 つ、宣言なしで使える組み込み `Object` は「副作用の判断を持たない」と
 * 名乗りながら `Object.setPrototypeOf(Object.getPrototypeOf(''), null)` (文字列の組み込みメソッドを
 * アプリ全体で消す) が書けた。どちらも規則を破るプログラムで確かめ、狙った規則の番号と文で断ることを見る。
 *
 * ## 0.2 で足した構文
 *
 * オブジェクトの字面・条件演算子・`switch`・`throw`・`for … of` / `break` / `continue`・`type` / `interface`・
 * `field x.k` (型の分からない値から欄を読む)。変換の全形は下の CORPUS を 1 byte で留める
 * (出力を目で読み、`tsc --strict` が生成物に誤りを 1 つも出さないことを確かめてから固定した)。
 * 足した構文が来歴の規則を外す道にならないこと (オブジェクトの中の危ない口・印の混ざる条件演算子・
 * 回す変数の印) も規則の番号で留める。
 */

function compile(...sources: string[]) {
  return compileProject(sources.map((source, i) => ({ path: `src/x/m${i}.mamori`, source })));
}
function diags(...sources: string[]): string[] {
  const r = compile(...sources);
  return r.ok ? [] : r.diagnostics.map(formatDiagnostic);
}
function rulesOf(...sources: string[]): string[] {
  const r = compile(...sources);
  return r.ok ? [] : r.diagnostics.map((d) => d.rule);
}
const FN = (body: string, sig = 'export fn f(x: unknown, code: string) -> unknown'): string => `${sig} {\n${body}\n}\n`;
const VETTED = 'export vetted VettedU = "u";\n';
const SINK = 'extern sink { shell } from "electron";\nexport sink fn openU(u: VettedU) -> Promise<void> {\n  return shell.openExternal(u);\n}\n';
const GATE = 'export gate fn uOrNull(x: unknown) -> VettedU | null {\n  if (typeof x !== \'string\') {\n    return null;\n  }\n  return mint VettedU(x);\n}\n';

describe('T-224: 0.1 で書けた「文字列をコードとして走らせる道」と「組み込みの原型の書き換え」', () => {
  it('★ 標本: 直す前の形は本当にコードを走らせる (node が 42 を返す) —— だから断る意味がある', () => {
    // 同じ形を素の JavaScript で走らせる (Mamori を通さない) —— 欠陥が想像ではないことの標本。
    const run = (code: string): unknown => (String.constructor as (c: string) => () => unknown)(code)();
    expect(run('return 6*7')).toBe(42);
  });

  const CASES: readonly [string, string, string][] = [
    ['String.constructor(code)()', FN('  return String.constructor(code)();'), reasonOf('constructor')],
    ["''.constructor.constructor(code)()", FN("  return ''.constructor.constructor(code)();"), reasonOf('constructor')],
    ['配列の constructor', FN('  return [].constructor;'), reasonOf('constructor')],
    ['String.prototype', FN('  return String.prototype;'), reasonOf('prototype')],
    ['x.__proto__', FN('  return code.__proto__;'), reasonOf('__proto__')],
    ['new の呼ぶ側の連鎖', FN('  return new URL.prototype(code);'), reasonOf('prototype')],
    ['field の欄', FN('  return field x.constructor;'), reasonOf('constructor')],
  ];
  it('★ String.constructor(code)() は M0 で断る (threat: T-224)', () => {
    const r = compile(FN('  return String.constructor(code)();'));
    expect(r.ok).toBe(false);
    expect(r.ok ? [] : r.diagnostics.map((d) => [d.rule, d.message])).toEqual([['M0', reasonOf('constructor')]]);
  });
  for (const [name, src, reason] of CASES) {
    it(`★ ${name} は M0 で断る (何も出さない)`, () => {
      const d = diags(src);
      expect(d).toHaveLength(1);
      expect(d[0]).toMatch(/^src\/x\/m0\.mamori:2:\d+: \[M0\] /);
      expect(d[0]!.endsWith(reason)).toBe(true);
    });
  }

  it('★ 断る文は場所を名乗る (`.constructor` の名前の位置)', () => {
    expect(diags(FN('  return String.constructor(code)();'))).toEqual([`src/x/m0.mamori:2:17: [M0] ${reasonOf('constructor')}`]);
  });

  it('対照: 同じ綴りでも `.` の後ろでなければ断らない (局所の名前・オブジェクトの鍵・文字列)', () => {
    expect(rulesOf(FN("  const constructor = 'c';\n  const o = { constructor, prototype: 1 };\n  return [o, 'constructor'];"))).toEqual([]);
  });

  it('対照: prototype の鍵 (toString / hasOwnProperty) は断らない (表を自分の鍵だけで引く)', () => {
    expect(rulesOf(FN('  return code.toString() + code.hasOwnProperty.name;'))).toEqual([]);
    expect(Object.hasOwn(FORBIDDEN_MEMBERS, 'toString')).toBe(false);
  });

  it('★ 組み込みの Object は許したメンバだけ (setPrototypeOf / getPrototypeOf / defineProperty / assign を断る)', () => {
    for (const m of ['setPrototypeOf', 'getPrototypeOf', 'defineProperty', 'defineProperties', 'assign', 'getOwnPropertyDescriptor', 'create']) {
      const d = diags(FN(`  return Object.${m};`));
      expect(d, m).toEqual([`src/x/m0.mamori:2:16: [M6] Object.${m} は使えません —— 組み込みの Object で使えるのは hasOwn / keys / values / entries / fromEntries / freeze / isFrozen だけです (原型や既にある値を書き換えるメンバは、他のモジュールの関門の判定まで変える)`]);
    }
  });

  it('★ 0.1 で書けた原型の書き換えそのもの (文字列の組み込みメソッドをアプリ全体で消す) を断る', () => {
    expect(rulesOf(FN("  return Object.setPrototypeOf(Object.getPrototypeOf(''), null);"))).toEqual(['M6', 'M6']);
  });

  it('★ Object を値として持ち出す形 (別名で表を迂回する) を断る', () => {
    expect(diags(FN('  const o = Object;\n  return o.keys(x);'))).toEqual([
      'src/x/m0.mamori:2:13: [M6] 組み込みの Object は値として持ち出せません —— `Object.hasOwn(…)` のように許したメンバを直に呼びます (持ち出すと、使ってよいメンバの表を別名で迂回できる)',
    ]);
    expect(rulesOf(FN('  return new Object();'))).toEqual(['M6']);
  });

  it('対照: 許したメンバは使える・このモジュールが Object という名前を持つなら組み込みではない', () => {
    expect(rulesOf(FN("  return Object.hasOwn({ a: 1 }, 'a') && Object.keys({}).length === 0 && Object.isFrozen(Object.freeze([]));"))).toEqual([]);
    expect(rulesOf('const Object = { assign: 1 };\n' + FN('  return Object.assign;'))).toEqual([]);
    expect([...OBJECT_MEMBERS]).toEqual(['hasOwn', 'keys', 'values', 'entries', 'fromEntries', 'freeze', 'isFrozen']);
    expect(PURE_GLOBALS.has('Object')).toBe(true);
  });
});

const SRC = [
  "export vetted VettedU = \"u\";",
  "/// 失敗の理由",
  "export type Reason =",
  "  | 'a'",
  "  | 'b-c'",
  "  | { readonly k: 'x' | 'y'; v: number };",
  "type Pair = [string, number];",
  "/// 形",
  "export interface Shape {",
  "  /// 名前",
  "  readonly name: string;",
  "  size?: number;",
  "  /// 1 行目",
  "  ///",
  "  /// 3 行目",
  "  readonly tags?: readonly string[];",
  "}",
  "interface Empty {",
  "}",
  "export fn obj(a: number, value: string) -> unknown {",
  "  const e = {};",
  "  const o = { a, 'x-y': value, n: a > 1 ? 'big' : 'small', nested: { deep: [1, 2] } };",
  "  const f = (x: number) => ({ x });",
  "  const g = (x: number) => x > 0 ? x : -x;",
  "  const h = (a ?? 1) ? 'n' : 'z';",
  "  const i = (a > 0 ? 1 : 2) + 3;",
  "  const j = a > 0 ? a > 1 ? 'x' : 'y' : 'z';",
  "  const k = (a > 0 ? 'p' : 'q').length;",
  "  return [e, o, f, g, h, i, j, k];",
  "}",
  "export fn loops(xs: readonly number[], raw: unknown) -> number {",
  "  let total = 0;",
  "  for (const x of xs) {",
  "    if (x < 0) {",
  "      continue;",
  "    }",
  "    if (x > 100) {",
  "      break;",
  "    }",
  "    // 足す",
  "    total = total + x;",
  "  }",
  "  const len = field raw.length;",
  "  const nested = field (field raw.inner).value;",
  "  if (len === undefined) {",
  "    throw new Error('長さが無い');",
  "  }",
  "  return total;",
  "}",
  "export fn pick(r: Reason) -> string {",
  "  switch (r) {",
  "    // 最初の群れ",
  "    case 'a':",
  "      return 'A';",
  "    case 'b-c':",
  "    default:",
  "      // 残り",
  "      throw new Error('未知');",
  "  }",
  "}",
  "export fn sw2(n: number) -> number {",
  "  let out = 0;",
  "  switch (n) {",
  "    case 1:",
  "      out = 10;",
  "      break;",
  "    case 2:",
  "      for (const k of [1, 2]) {",
  "        out = out + k;",
  "      }",
  "      break;",
  "  }",
  "  return out;",
  "}",
  "export fn q(a: number | null) -> unknown {",
  "  const l = a ?? (() => 1);",
  "  const m = a === null ? (() => 1) : (() => 2);",
  "  return [l, m];",
  "}",
  "export fn d(n: number) -> string {",
  "  switch (n) {",
  "    case 1:",
  "      return 'a';",
  "    default:",
  "      return 'b';",
  "  }",
  "}",
  "",
].join('\n');

const WANT = [
  "// 生成物 —— src/x/g.mamori から Mamori のコンパイラが組んだ。手で編集しない (`npm run mamori:build`)。",
  "// 言語の仕様は docs/MAMORI.md。生成物が元と食い違えば src/shared/mamori/__tests__/mamoriGenerated.test.ts が落ちる。",
  "",
  "declare const VETTED: unique symbol;",
  "",
  "/** 関門の種類。印の種類ごとに別の型になるので、ある印を別の種類の口へは渡せない。 */",
  "export type VettedKind = 'u';",
  "",
  "/** 関門 `K` を通った文字列。作れるのは gate 関数の `mint` だけ (変換後は gate の `return` の 1 か所)。 */",
  "export type Vetted<K extends VettedKind> = string & { readonly [VETTED]: K };",
  "",
  "export type VettedU = Vetted<'u'>;",
  "",
  "/** 失敗の理由 */",
  "export type Reason =",
  "  | 'a'",
  "  | 'b-c'",
  "  | { readonly k: 'x' | 'y'; v: number };",
  "",
  "type Pair = [string, number];",
  "",
  "/** 形 */",
  "export interface Shape {",
  "  /** 名前 */",
  "  readonly name: string;",
  "  size?: number;",
  "  /**",
  "   * 1 行目",
  "   *",
  "   * 3 行目",
  "   */",
  "  readonly tags?: readonly string[];",
  "}",
  "",
  "interface Empty {",
  "}",
  "",
  "export function obj(a: number, value: string): unknown {",
  "  const e = {};",
  "  const o = { a, 'x-y': value, n: a > 1 ? 'big' : 'small', nested: { deep: [1, 2] } };",
  "  const f = (x: number) => ({ x });",
  "  const g = (x: number) => (x > 0 ? x : -x);",
  "  const h = a ?? 1 ? 'n' : 'z';",
  "  const i = (a > 0 ? 1 : 2) + 3;",
  "  const j = a > 0 ? a > 1 ? 'x' : 'y' : 'z';",
  "  const k = (a > 0 ? 'p' : 'q').length;",
  "  return [e, o, f, g, h, i, j, k];",
  "}",
  "",
  "export function loops(xs: readonly number[], raw: unknown): number {",
  "  let total = 0;",
  "  for (const x of xs) {",
  "    if (x < 0) {",
  "      continue;",
  "    }",
  "    if (x > 100) {",
  "      break;",
  "    }",
  "    // 足す",
  "    total = total + x;",
  "  }",
  "  const len = (raw as { length?: unknown }).length;",
  "  const nested = ((raw as { inner?: unknown }).inner as { value?: unknown }).value;",
  "  if (len === undefined) {",
  "    throw new Error('長さが無い');",
  "  }",
  "  return total;",
  "}",
  "",
  "export function pick(r: Reason): string {",
  "  switch (r) {",
  "    // 最初の群れ",
  "    case 'a':",
  "      return 'A';",
  "    case 'b-c':",
  "    default:",
  "      // 残り",
  "      throw new Error('未知');",
  "  }",
  "}",
  "",
  "export function sw2(n: number): number {",
  "  let out = 0;",
  "  switch (n) {",
  "    case 1:",
  "      out = 10;",
  "      break;",
  "    case 2:",
  "      for (const k of [1, 2]) {",
  "        out = out + k;",
  "      }",
  "      break;",
  "  }",
  "  return out;",
  "}",
  "",
  "export function q(a: number | null): unknown {",
  "  const l = a ?? (() => 1);",
  "  const m = a === null ? (() => 1) : (() => 2);",
  "  return [l, m];",
  "}",
  "",
  "export function d(n: number): string {",
  "  switch (n) {",
  "    case 1:",
  "      return 'a';",
  "    default:",
  "      return 'b';",
  "  }",
  "}",
].join('\n') + '\n';

describe('0.2 の構文: 変換の全形を 1 byte で留める', () => {
  it('★ オブジェクトの字面・条件演算子・switch・throw・for / break / continue・type / interface・field', () => {
    const r = compileProject([{ path: 'src/x/g.mamori', source: SRC }]);
    if (!r.ok) throw new Error(r.diagnostics.map(formatDiagnostic).join('\n'));
    expect(r.outputs.get('src/x/g.ts')).toBe(WANT);
  });

  it('★ field が書き出す as は型を広げる向きだけ (印へは書き換えない) —— 生成物の as は field の 3 つと印の宣言だけ', () => {
    const r = compileProject([{ path: 'src/x/g.mamori', source: SRC }]);
    if (!r.ok) throw new Error('compile');
    const ts = r.outputs.get('src/x/g.ts')!;
    expect(ts.match(/ as \{ \w+\?: unknown \}/g)).toHaveLength(3);
    expect(ts.match(/\bas\s+Vetted/g)).toBeNull();
  });

  it('和の型は深さ 0 の | だけで分ける (括弧・文字列の中の | では分けない)', () => {
    expect(topLevelUnion("'a' | { k: 'x' | 'y' } | Array<1 | 2> | 'q|r' | (a | b) | [1 | 2] | \"s\\\"|t\"")).toEqual([
      "'a'", "{ k: 'x' | 'y' }", 'Array<1 | 2>', "'q|r'", '(a | b)', '[1 | 2]', '"s\\"|t"',
    ]);
    // 逃がしの後ろでも分け続ける (逃がした字を 1 つだけ飛ばす —— 2 つ目以降を飛ばし続けない)。
    expect(topLevelUnion("'a\\'b' | 'c' | 'x\\\\' | 'y'")).toEqual(["'a\\'b'", "'c'", "'x\\\\'", "'y'"]);
    expect(topLevelUnion('string')).toEqual(['string']);
  });
});

describe('0.2 の構文の誤りは文と場所を名乗る', () => {
  const at = (line: number, col: number, reason: string): string => `src/x/m0.mamori:${line}:${col}: [M0] ${reason}`;
  const CASES: readonly [string, string, string][] = [
    ['展開', FN('  return { ...x };'), at(2, 12, '`...` (展開) は在りません —— 欄を 1 つずつ書きます (何が入るかを字面で見えるようにする)')],
    ['計算した鍵', FN('  return { [code]: 1 };'), at(2, 12, '計算した鍵 (`[k]: v`) は在りません —— 鍵は名前か文字列で書きます')],
    ['__proto__ の鍵', FN('  return { __proto__: x };'), at(2, 12, '鍵 `__proto__` は在りません —— オブジェクトの字面では欄ではなく原型を差し替えます')],
    ['文字列で書いた __proto__ の鍵', FN("  return { '__proto__': x };"), at(2, 12, '鍵 `__proto__` は在りません —— オブジェクトの字面では欄ではなく原型を差し替えます')],
    ['文字列の鍵の省略形', FN("  return { 'a' };"), at(2, 16, '文字列の鍵 "a" には `:` と値が要ります')],
    ['予約語の省略形', FN('  return { mint };'), at(2, 12, '`mint` は省略形の欄 (`{ 名前 }`) にできません')],
    ['組み込みの語の省略形', FN('  return { true };'), at(2, 12, '`true` は省略形の欄 (`{ 名前 }`) にできません')],
    ['文の頭の {', FN('  { a: 1 };'), at(2, 3, '文の頭に `{` は置けません (オブジェクトの字面だけの文は何もしないので書かない)')],
    ['for の外の break', FN('  break;'), at(2, 3, '`break` は for か switch の中にだけ置けます')],
    ['for の外の continue', FN('  continue;'), at(2, 3, '`continue` は for の中にだけ置けます')],
    ['switch の中の continue', FN('  switch (code) {\n    case \'a\':\n      continue;\n  }'), at(4, 7, '`continue` は for の中にだけ置けます')],
    ['for の後ろの break', FN('  for (const k of [1]) {\n    break;\n  }\n  break;'), at(5, 3, '`break` は for か switch の中にだけ置けます')],
    ['for の後ろの continue', FN('  for (const k of [1]) {\n    continue;\n  }\n  continue;'), at(5, 3, '`continue` は for の中にだけ置けます')],
    ['switch の後ろの break', FN("  switch (code) {\n    case 'a':\n      break;\n  }\n  break;"), at(6, 3, '`break` は for か switch の中にだけ置けます')],
    ['let で回す', FN('  for (let k of [1]) {\n  }'), at(2, 8, '`const` が要ります (在ったのは `let`)')],
    ['of が無い', FN('  for (const k in x) {\n  }'), at(2, 16, '`of` が要ります (在ったのは `in`)')],
    ['落ちる case', FN("  switch (code) {\n    case 'a':\n      code.trim();\n    case 'b':\n      return 1;\n  }"), at(3, 5, 'case の本体は return / throw / break で終えます (次の case へ落ちる形は書けません)')],
    ['空の case', FN("  switch (code) {\n    case 'a':\n  }"), at(3, 5, 'case の本体は return / throw / break で終えます (次の case へ落ちる形は書けません)')],
    ['label の無い文', FN('  switch (code) {\n    return 1;\n  }'), at(3, 5, '`case` か `default` が要ります (在ったのは `return`)')],
    ['積んだ label の間の注記', FN("  switch (code) {\n    case 'a':\n    // 間\n    case 'b':\n      return 1;\n  }"), at(4, 5, '積んだ label の間に注記は置けません (注記は最初の label の前へ)')],
    ['積んだ default の前の注記', FN("  switch (code) {\n    case 'a':\n    // 間\n    default:\n      return 1;\n  }"), at(4, 5, '積んだ label の間に注記は置けません (注記は最初の label の前へ)')],
    ['switch の終わりの注記', FN("  switch (code) {\n    case 'a':\n      return 1;\n    // 終わり\n  }"), at(6, 3, 'switch の終わりの前に注記は置けません')],
    ['interface の // 注記', 'interface I {\n  // x\n  a: string;\n}\n', at(2, 3, 'interface の中は `///` の説明だけ置けます (`//` は置けません)')],
    ['interface の欄の無い ///', 'interface I {\n  /// x\n}\n', at(3, 1, '`///` の後に欄がありません')],
    ['interface の欄の : が無い', 'interface I {\n  a string;\n}\n', at(2, 5, '`:` が要ります (在ったのは `string`)')],
    ['type の = が無い', 'type T string;\n', at(1, 8, '`=` が要ります (在ったのは `string`)')],
    ['条件演算子の : が無い', FN('  return code ? 1;'), at(2, 18, '`:` が要ります (在ったのは `;`)')],
    ['field の . が無い', FN('  return field x;'), at(2, 17, '`.` が要ります (在ったのは `;`)')],
  ];
  for (const [name, src, want] of CASES) {
    it(`★ ${name}`, () => expect(diags(src)).toEqual([want]));
  }
});

describe('0.2 の構文は来歴の規則を外す道にならない', () => {
  it('★ オブジェクトの字面の中の危ない口も M2 (省略形 `{ shell }` を含む)', () => {
    const ext = 'extern sink { shell } from "electron";\n';
    expect(rulesOf(ext + FN('  return { s: shell };'))).toEqual(['M2']);
    expect(rulesOf(ext + FN('  return { shell };'))).toEqual(['M2']);
  });
  it('★ 足した文と式の中の危ない口も M2 (条件演算子・field・throw・for・switch)', () => {
    const ext = 'extern sink { shell } from "electron";\n';
    for (const body of [
      '  return code === \'a\' ? shell : 1;',
      '  return code === \'a\' ? 1 : shell;',
      '  return shell ? 1 : 2;',
      '  return field shell.openExternal;',
      '  throw shell;',
      '  for (const k of shell) {\n  }\n  return 1;',
      '  for (const k of [1]) {\n    shell.beep();\n  }\n  return 1;',
      '  switch (shell) {\n    default:\n      return 1;\n  }',
      "  switch (code) {\n    case shell:\n      return 1;\n  }",
      "  switch (code) {\n    case 'a':\n      return shell;\n  }",
    ]) {
      expect(rulesOf(ext + FN(body)), body).toEqual(['M2']);
    }
  });
  it('★ 足した構文の中の宣言していない名前も M6 (window / fetch)', () => {
    for (const body of ['  return { w: window };', '  return field window.x;', '  for (const k of fetch) {\n  }\n  return 1;', '  throw fetch;']) {
      expect(rulesOf(FN(body)), body).toEqual(['M6']);
    }
  });
  it('★ 条件演算子が印を運ぶのは両方の枝が同じ印のときだけ (片方が素の値なら M4)', () => {
    const go = (expr: string): string[] => rulesOf(VETTED + GATE + SINK + FN(`  return openU(${expr});`));
    expect(go("code === 'a' ? uOrNull(x)! : uOrNull(code)!")).toEqual(['M0']); // `!` 後置は無い (0.2 でも足さない)
    expect(rulesOf(VETTED + GATE + SINK + FN("  const a = uOrNull(x);\n  const b = uOrNull(code);\n  if (a === null || b === null) {\n    return null;\n  }\n  return openU(code === 'a' ? a : b);"))).toEqual([]);
    expect(rulesOf(VETTED + GATE + SINK + FN("  const a = uOrNull(x);\n  if (a === null) {\n    return null;\n  }\n  return openU(code === 'a' ? a : code);"))).toEqual(['M4']);
    expect(rulesOf(VETTED + GATE + SINK + FN("  const a = uOrNull(x);\n  if (a === null) {\n    return null;\n  }\n  return openU(code === 'a' ? code : a);"))).toEqual(['M4']);
  });
  it('★ 回す変数は印を運ばない (印の配列から取り出しても、sink へは渡せない —— 失敗は閉じる向き)', () => {
    expect(rulesOf(VETTED + SINK + FN('  for (const u of us) {\n    openU(u);\n  }\n  return 1;', 'export fn f(us: readonly VettedU[]) -> unknown'))).toEqual(['M4']);
  });
  it('★ 回す変数は外の同じ名前を隠す (for の中の shell は危ない口ではない)', () => {
    expect(rulesOf('extern sink { shell } from "electron";\n' + FN('  for (const shell of [1]) {\n    code.trim();\n  }\n  return 1;'))).toEqual([]);
  });
  it('★ field で読んだ値は印を運ばない (印の欄を読んでも素の値)', () => {
    expect(rulesOf(VETTED + SINK + FN('  return openU(field x.url);'))).toEqual(['M4']);
  });
  it('★ オブジェクトの字面の中の mint も gate だけ (M1)', () => {
    expect(rulesOf(VETTED + FN('  return { u: mint VettedU(code) };'))).toEqual(['M1']);
  });
});

describe('let ではない名前へは代入できない (0.1 は tsc に任せていた —— Mamori の規則として断る)', () => {
  const REASON = 'は let ではないので代入できません (const・引数・回す変数・関数の名前は書き換えない)';
  const CASES: readonly [string, string, string][] = [
    ['引数', FN('  code = "x";\n  return code;'), 'code'],
    ['const の名前', FN('  const c = 1;\n  c = 2;\n  return c;'), 'c'],
    ['回す変数', FN('  for (const k of [1, 2]) {\n    k = 3;\n  }\n  return x;'), 'k'],
    ['このモジュールの const', 'const C = 1;\n' + FN('  C = 2;\n  return C;'), 'C'],
    ['このモジュールの関数', 'fn g() -> number {\n  return 1;\n}\n' + FN('  g = 2;\n  return g;'), 'g'],
  ];
  for (const [name, src, target] of CASES) {
    it(`★ ${name} へは代入できない (M6)`, () => {
      const ds = compile(src);
      expect(ds.ok).toBe(false);
      expect(ds.ok ? [] : ds.diagnostics.map((d) => [d.rule, d.message])).toEqual([['M6', `${target} ${REASON}`]]);
    });
  }
  it('対照: let の名前へは代入できる (回す変数を足しても let はそのまま)', () => {
    expect(diags(FN('  let n = 0;\n  for (const k of [1, 2]) {\n    n = n + k;\n  }\n  n = n + 1;\n  return n;'))).toEqual([]);
  });
});
