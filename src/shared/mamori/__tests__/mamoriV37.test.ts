import { describe, expect, it } from 'vitest';
import { compileProject, formatDiagnostic } from '../compile';

/*
 * **Mamori 0.37 —— 関数の結果を置いたモジュール直下の const は、Mamori の中で読めない**
 * (2026-11-16 · MG-075 · 言語の穴探し · threat: T-274)。
 *
 * 0.36 まで「共有の状態は書き換えさせない」規則 (T-258 = 配列 / T-264 = Map・Set / T-267 = Date・URL) は、どれも**直下に書いた入れ物**を見ていた。
 * 関数が返した物は見ていない —— 関数の中の配列・let・Map は、返した arrow が閉じ込めて、呼び出しをまたいで持てる:
 *
 *   fn make() -> (x: string) => readonly string[] {
 *     const xs = ["https://ok/"];
 *     return (x: string) => { xs.push(x); return xs; };
 *   }
 *   const ADD = make();              // const と名乗る名前の後ろに、書き換えられる許可リストが在る
 *   … 関門: for (const p of ADD("https://ok2/")) …   別の関数: ADD("javascript:");
 *
 * 0.34 は「型を書いていない直下の const は `.set` / `.add` の受け手にできない」と**メソッドの名前**で見ていたので、直に呼ぶ形・名前を変えたメソッド・
 * 型を書いた const は通った。Mamori は型を解かないので、返した物が状態を持つかは見分けられない —— 0.37 は、初期値が**その場で走らせた関数の結果**を
 * 含む直下の const の名前を、Mamori の中で読めなくする (状態を持つ物は let に置く —— 状態と名乗る)。
 *
 * 標本はどれも、直す前は Mamori と `tsc` (strict) の両方を通った形である (手元の足場で実測)。
 */

function diagnostics(...sources: string[]): string[] {
  const r = compileProject(sources.map((source, i) => ({ path: `src/x/m${i}.mamori`, source })));
  return r.ok ? [] : r.diagnostics.map(formatDiagnostic);
}

const LOAD = (name: string): string => `[M6] ${name} は、関数の呼び出しの結果を置いたモジュール直下の const なので、Mamori の中では読めません`;
/** 断りの位置つき (m0 の `行:桁`)。 */
const at = (line: number, col: number, name: string): unknown => expect.stringMatching(new RegExp(`^src/x/m0\\.mamori:${line}:${col}: ${LOAD(name).replace(/[[\]().]/g, '\\$&')}`));
/** 名前を 1 度だけ値として読む関数。 */
const READ = (name: string): string => `export fn go(x: string) -> unknown {\n  return ${name};\n}\n`;
/** `decl` の後ろで `name` を読めるか (断りが 0 件か、その名前の断りちょうど 1 件か)。 */
const reads = (decl: string, name = 'X'): string[] => diagnostics(decl + READ(name));
const refused = (name = 'X'): unknown[] => [expect.stringContaining(LOAD(name))];

/** 配列を閉じ込めて返す工場 (直す前の穴の形)。 */
const ADDER = 'fn make() -> (x: string) => readonly string[] {\n  const xs = ["https://ok/"];\n  return (x: string) => {\n    xs.push(x);\n    return xs;\n  };\n}\n';
/** 置いただけの関数・arrow を持つ表・host の関数・外から引いた名前 (どれも「データ」ではない)。 */
const HELPERS =
  'use { IMPORTED } from "./host";\nextern pure { h, ns } from "./pure";\n' +
  'fn helper(x: string) -> number {\n  return x.length;\n}\n' +
  'const STORED = { f: (x: string) => x };\nconst LIST = ["a", "b"];\nconst LIMIT = 3;\nconst N: number = IMPORTED;\n';

describe('0.37: 関数の結果を置いた直下の const は読めない (threat: T-274)', () => {
  it('★ 工場関数が返した閉包を直下の const に置くと、直に呼ぶ形も・値として読む形も断る (threat: T-274)', () => {
    // 直す前: 関門が `ADD("https://ok2/")` の配列を読み、別の関数が `ADD("javascript:")` で同じ配列へ足せた
    expect(diagnostics(ADDER + 'const ADD = make();\nexport fn go(x: string) -> unknown {\n  return ADD(x);\n}\n')).toEqual([at(10, 10, 'ADD')]);
    expect(diagnostics(ADDER + 'const ADD = make();\nexport fn go(x: string) -> unknown {\n  const f = ADD;\n  return f(x);\n}\n')).toEqual([at(10, 13, 'ADD')]);
    // 断りは、状態の置き場 (let) と、決まった値の組み方を名指しする
    const d = reads(ADDER + 'const X = make();\n');
    expect(d).toHaveLength(1);
    expect(d[0]).toContain('状態を持つ物は型つきの `let` に置き (状態と名乗る)、決まった値は字面と組み込み (`new Map(…)` / `Object.entries(…)` ほか) だけで組みます');
  });

  it('★ 型を書いても・メソッドの名前を変えても・引数で渡しても・別名で受けても読めない (threat: T-274)', () => {
    const STATE =
      'interface State {\n  readonly xs: readonly string[];\n  readonly plus: (x: string) => void;\n}\n' +
      'fn make() -> State {\n  const xs = ["https://ok/"];\n  return { xs, plus: (x: string) => {\n    xs.push(x);\n  } };\n}\nconst STATE: State = make();\n';
    // 0.34 の規則はメソッドの名前 (`set` / `add` …) で見ていたので、`plus` と名付けた口は通った
    expect(diagnostics(STATE + 'export fn go(x: string) -> unknown {\n  STATE.plus(x);\n  return STATE.xs;\n}\n')).toEqual([at(13, 3, 'STATE'), at(14, 10, 'STATE')]);
    expect(diagnostics(STATE + 'fn run(s: State, x: string) -> void {\n  s.plus(x);\n}\nexport fn go(x: string) -> unknown {\n  run(STATE, x);\n  return 1;\n}\n')).toEqual([at(16, 7, 'STATE')]);
    // 直下の別名・入れ物に包む形も、名前を読む所で断る
    expect(diagnostics(ADDER + 'const ADD = make();\nconst ADD2 = ADD;\n')).toEqual([at(9, 14, 'ADD')]);
    expect(diagnostics(ADDER + 'const ADD = make();\nexport fn go(x: string) -> unknown {\n  return { ADD };\n}\n')).toEqual([at(10, 12, 'ADD')]);
    expect(diagnostics(ADDER + 'const ADD = make();\nexport fn go(x: string) -> unknown {\n  return new ADD(x);\n}\n')).toEqual([expect.stringContaining(LOAD('ADD'))]);
  });

  it('★ 初期値のどこに関数の結果を置いても同じ —— 入れ物・条件・演算・欄・添字・展開 (threat: T-274)', () => {
    const MANY = 'fn many() -> string[] {\n  return [];\n}\nfn pick() -> string {\n  return "0";\n}\n';
    const shapes: readonly string[] = [
      'const X = { add: make() };',
      'const X = [make()];',
      'const X = LIMIT > 0 ? make() : null;',
      'const X = LIMIT > 0 ? null : make();',
      'const X = many().length > 0 ? 1 : 2;',
      'const X = make() ?? null;',
      'const X = null ?? make();',
      'const X = await make();',
      'const X = make().length;',
      'const X = field (make()).k;',
      'const X = -many().length;',
      'const X = many()[0];',
      'const X = [...many()];',
    ];
    for (const decl of shapes) expect(reads(`const LIMIT = 3;\nconst LIST = ["a"];\n${ADDER}${MANY}${decl}\n`), decl).toEqual(refused());
    // 添字の鍵の側 (計算した鍵の結果は戻り値に置けないので、比較の中で読む)
    const COMPARE = 'export fn go(x: string) -> unknown {\n  return X === x;\n}\n';
    expect(diagnostics(`const LIST = ["a"];\n${MANY}const X = LIST[Number(pick())];\n${COMPARE}`)).toEqual(refused());
    expect(diagnostics(`const LIST = ["a"];\nconst I = 0;\nconst X = LIST[I];\n${COMPARE}`)).toEqual([]);
  });

  it('★ その場で呼ぶ arrow・組み込みが呼び戻す arrow と関数の名前・arrow を持つ表のメソッドも、関数の結果である (threat: T-274)', () => {
    const CLOSURE = '() => {\n  const xs = ["https://ok/"];\n  return (x: string) => {\n    xs.push(x);\n    return xs;\n  };\n}';
    expect(reads(`const X = (${CLOSURE})();\n`)).toEqual(refused());
    expect(reads(`const X = [0].map(${CLOSURE});\n`)).toEqual(refused());
    expect(reads(ADDER + 'const X = [0].map(make);\n')).toEqual(refused());
    expect(reads(`const F = { mk: ${CLOSURE} };\nconst X = F.mk();\n`)).toEqual(refused());
    // 呼び戻す組み込み: Promise の実行役・JSON.parse の reviver・Array.from の写す関数
    expect(reads('const X = new Promise((res) => {\n  res(1);\n});\n')).toEqual(refused());
    expect(reads('const X = JSON.parse("1", (k, v) => v);\n')).toEqual(refused());
    expect(reads('const X = Array.from([0], (v) => v);\n')).toEqual(refused());
    // この module のクラスの構築も、組み込みではない
    expect(reads('class Oops extends Error {\n  constructor(m: string) {\n    super(m);\n  }\n}\nconst X = new Oops("x");\n')).toEqual(refused());
    // 対照: arrow そのもの・arrow を持つ表は「置いただけ」(本体は呼ぶまで走らない) —— 読めて、呼べる
    expect(diagnostics(`${ADDER}const mk = () => make();\nconst F = { mk: ${CLOSURE} };\nexport fn go(x: string) -> unknown {\n  return [mk()(x), F.mk()(x)];\n}\n`)).toEqual([]);
  });

  it('★ 引数を呼び戻さない組み込みは、引数に置いた arrow・関数の名前・引いた名前を「置くだけ」—— 中の関数の結果だけを見る (threat: T-274)', () => {
    // 表の 1 行ずつ: 組み込みを表から外すと、引いた名前 (データではない) を渡した const が読めなくなる
    const stored: readonly string[] = [
      'const X = new RegExp(IMPORTED);',
      'const X = new Error(IMPORTED);',
      'const X = new TypeError(IMPORTED);',
      'const X = new RangeError(IMPORTED);',
      'const X = Number(IMPORTED);',
      'const X = String(IMPORTED);',
      'const X = Boolean(IMPORTED);',
      'const X = Object.freeze({ f: (x: string) => x });',
      'const X = Object.entries(IMPORTED);',
      'const X = Math.max(IMPORTED, 1);',
      'const X = Number.parseInt(IMPORTED, 10);',
      'const X = String.fromCharCode(IMPORTED);',
    ];
    for (const decl of stored) expect(reads(`${HELPERS}${decl}\n`), decl).toEqual([]);
    // Map / Set は型つきの読むだけの表として置く (型なしの `new Map(…)` は 0.34 が別に断る) —— 読む位置 (`.size`) で読む
    const SIZE = 'export fn go(x: string) -> unknown {\n  return X.size;\n}\n';
    const tables: readonly string[] = [
      'const X: ReadonlyMap<string, (x: string) => string> = new Map([["a", (x: string) => x]]);',
      'const X: ReadonlySet<(x: string) => number> = new Set([helper]);',
    ];
    for (const decl of tables) expect(diagnostics(`${HELPERS}${decl}\n${SIZE}`), decl).toEqual([]);
    const nestedTables: readonly string[] = [
      'const X: ReadonlyMap<string, unknown> = new Map([["a", make()]]);',
      'const X: ReadonlySet<unknown> = new Set([make()]);',
    ];
    for (const decl of nestedTables) expect(diagnostics(`${HELPERS}${ADDER}${decl}\n${SIZE}`), decl).toEqual(refused());
    // 同じ組み込みでも、引数の中に関数の結果が在れば読めない
    const nested: readonly string[] = [
      'const X = new RegExp(String(make()));',
      'const X = new Error(String(make()));',
      'const X = Object.freeze(make());',
      'const X = String(make());',
      'const X = Math.max(make().length, 1);',
    ];
    for (const decl of nested) expect(reads(`${HELPERS}${ADDER}${decl}\n`), decl).toEqual(refused());
    // 構築子と関数は別の表: `new Number(…)` / `Map(…)` は「呼び戻さない組み込み」ではない (引数はデータだけ)
    expect(reads(`${HELPERS}const X = new Number(IMPORTED);\n`)).toEqual(refused());
    expect(reads(`${HELPERS}const X = Map(IMPORTED);\n`)).toEqual(refused());
    // 呼び戻す名前空間 (`JSON` / `Array` / `Promise`) はデータだけの引数なら読める・データでない引数なら読めない
    expect(reads(`${HELPERS}const X = JSON.parse("[1]");\n`)).toEqual([]);
    expect(reads(`${HELPERS}const X = JSON.stringify(IMPORTED);\n`)).toEqual(refused());
    expect(reads(`${HELPERS}const X = Array.of(IMPORTED);\n`)).toEqual(refused());
    expect(reads(`${HELPERS}const X = Promise.resolve(IMPORTED);\n`)).toEqual(refused());
  });

  it('★ 「データだけの呼び出し」は、受け手も引数もデータ —— 式のどの位置にデータでない物を置いても関数の結果になる (threat: T-274)', () => {
    // h は `extern pure` の関数 (引数を呼び戻すかもしれない)。引数がデータだけなら結果もデータとして読める。
    const data: readonly string[] = [
      'h("a", 1, true, null, /x/)',
      'h(LIST, LIMIT)',
      'h([LIMIT, "a"], { k: LIST })',
      'h(LIST.length, field LIST.k, LIST[0], LIST[LIMIT] + 1)',
      'h(-LIMIT, !LIMIT, [...LIST])',
      'h(LIMIT + 1, 1 + LIMIT, LIMIT > 0 ? "a" : "b")',
      'h(h(LIMIT), new RegExp("a"), new Error(LIST[0]), Object.keys(LIST))',
      'LIST.join(",")',
      '["a", "b"].join("|")',
      '"a,b".split(",")',
      '[1].concat([2]).join(",")',
      'JSON.parse("[1]")',
      'ns.make("a")',
      'ns.inner.make(LIMIT)',
    ];
    for (const init of data) expect(reads(`${HELPERS}const X = ${init};\n`), init).toEqual([]);
    const notData: readonly string[] = [
      // 名前: 関数・arrow を持つ表・引いた名前
      'h(helper)', 'h(STORED)', 'h(IMPORTED)',
      // 配列・オブジェクトの中
      'h([1, helper])', 'h({ a: helper })',
      // 欄・field・添字 (相手と鍵)
      'h(STORED.f)', 'h(field STORED.f)', 'h([helper][0])', 'h(LIST[N] + 1)',
      // 単項・展開
      'h(-N)', 'h([...IMPORTED])',
      // 2 項 (左・右)・条件 (試し・真の枝・偽の枝)
      'h(N + 1)', 'h(1 + N)', 'h(N > 0 ? 1 : 2)', 'h(LIMIT > 0 ? N : 1)', 'h(LIMIT > 0 ? 1 : N)',
      // 中の呼び出し・構築がデータだけでない
      'h(h(helper))', 'h(new Error(IMPORTED))', 'h(Object.keys(IMPORTED))',
      // arrow
      'h((x: string) => x)', 'h(() => {\n  return 1;\n})',
      // 受け手: 引いた名前・arrow を持つ表・その欄・データでない式
      'IMPORTED.join(",")', 'STORED.f("a")', 'STORED.inner.f("a")', '[helper].join(",")', 'LIST.map((x) => x)',
      // 呼ぶ相手: この module の関数・arrow の const・呼び出しの結果
      'helper("a")', 'h("a")("b")',
    ];
    for (const init of notData) expect(reads(`${HELPERS}const X = ${init};\n`), init).toEqual(refused());
    // データの const は宣言の順に増える —— 先に宣言したデータの const だけが、後ろの初期値で「データ」として読める
    expect(reads(`${HELPERS}const A = [LIMIT, "x"];\nconst B = { a: A };\nconst X = h(B);\n`)).toEqual([]);
    expect(reads(`${HELPERS}const A = [helper];\nconst X = h(A);\n`)).toEqual(refused());
    expect(reads(`${HELPERS}const X = h(LATER);\nconst LATER = 1;\n`)).toEqual(refused());
  });

  it('★ 組み込みと同じ綴りをこの module が宣言していれば、組み込みとは読まない (threat: T-274)', () => {
    const HOST = 'use { IMPORTED } from "./host";\n';
    // 宣言の形ごと: fn・const・let・class・extern・use・use default・use の別名
    expect(reads(HOST + 'fn Map(x: string) -> (y: string) => string {\n  return (y: string) => x + y;\n}\nconst X = Map(IMPORTED);\n')).toEqual(refused());
    expect(reads(HOST + 'const Number = (x: string) => x;\nconst X = Number(IMPORTED);\n')).toEqual(refused());
    expect(reads(HOST + 'let String: (x: string) => string = (x: string) => x;\nconst X = String(IMPORTED);\n')).toEqual(refused());
    expect(reads(HOST + 'class RangeError extends Error {\n  constructor(m: string) {\n    super(m);\n  }\n}\nconst X = new RangeError(IMPORTED);\n')).toEqual(refused());
    expect(reads(HOST + 'extern pure { Boolean } from "./pure";\nconst X = Boolean(IMPORTED);\n')).toEqual(refused());
    expect(reads(HOST + 'use { TypeError } from "./other";\nconst X = new TypeError(IMPORTED);\n')).toEqual(refused());
    expect(reads(HOST + 'use default Error from "./other";\nconst X = new Error(IMPORTED);\n')).toEqual(refused());
    expect(reads(HOST + 'use { mk alias Math } from "./other";\nconst X = Math.max(IMPORTED, 1);\n')).toEqual(refused());
    // データだけの呼び出しの側 (受け手の名前空間・呼ぶ相手) でも同じ
    expect(reads('use { mk alias JSON } from "./other";\nconst X = JSON.parse("[1]");\n')).toEqual(refused());
    expect(reads('use { mk alias Promise } from "./other";\nconst X = new Promise(1);\n')).toEqual(refused());
    // 対照: 別名の元の名前 (`mk`) は宣言した名前ではない —— 組み込みを隠すのは、引いた先の名前 (`alias` の右) だけ
    expect(reads(HOST + 'use { Math alias mk } from "./other";\nconst X = Math.max(IMPORTED, 1);\n')).toEqual([]);
  });

  it('★ 印を返す関門の結果は置いて読める —— 返すのは印の付いた文字列か null だけ (threat: T-274)', () => {
    const REAL = 'export vetted VU = "u";\nexport gate fn g(x: string) -> VU | null {\n  if (x.startsWith("https://")) {\n    return mint VU(x);\n  }\n  return null;\n}\n';
    const NULLISH = 'export fn go(x: string) -> unknown {\n  return START === null;\n}\n';
    // この module の関門・引いた関門・別名で引いた関門
    expect(diagnostics(REAL + 'const START: VU | null = g("https://a");\n' + NULLISH)).toEqual([]);
    expect(diagnostics('use { g } from "./m1";\nuse type { VU } from "./m1";\nconst START: VU | null = g("https://a");\n' + NULLISH, REAL)).toEqual([]);
    expect(diagnostics('use { g alias gate2 } from "./m1";\nuse type { VU } from "./m1";\nconst START: VU | null = gate2("https://a");\n' + NULLISH, REAL)).toEqual([]);
    // 引数がデータでなくても関門の結果は読める (引数を呼び戻しても、返すのは印か null)
    expect(diagnostics('use { IMPORTED } from "./host";\n' + REAL + 'const START: VU | null = g(IMPORTED);\n' + NULLISH)).toEqual([]);
    // 関門の結果は「データ」でもある —— データだけの呼び出しの引数に置ける
    expect(diagnostics('extern pure { h } from "./pure";\n' + REAL + 'const START: VU | null = g("https://a");\nconst X = h(START === null);\n' + READ('X'))).toEqual([]);
    // 関門の引数の中の関数の結果は見る
    expect(diagnostics(REAL + 'fn pick() -> string {\n  return "https://a";\n}\nconst START: VU | null = g(pick());\n' + NULLISH)).toEqual([expect.stringContaining(LOAD('START'))]);
    // 印を返さない gate 関数は、閉包を返せる —— 関門の結果とは数えない
    const PLAIN_GATE = 'gate fn make() -> (x: string) => string {\n  return (x: string) => x;\n}\n';
    expect(reads(PLAIN_GATE + 'const X = make();\n')).toEqual(refused());
    // 引いた先が関門でない同名の関数・Mamori の外の module の同名の関数も、関門の結果とは数えない
    expect(diagnostics('use { g } from "./m1";\nconst X = g("https://a");\n' + READ('X'), 'export fn g(x: string) -> string {\n  return x;\n}\n')).toEqual(refused());
    expect(reads('use { g } from "./host";\nconst X = g("https://a");\n')).toEqual(refused());
  });

  it('★ `use` で引いた先でも読めない・型つきの表と名乗っても同じ (threat: T-274)', () => {
    const M1 = ADDER + 'export const ADD = make();\nexport const LIST = ["a"];\nfn table() -> Map<string, number> {\n  return new Map<string, number>();\n}\nexport const T: ReadonlyMap<string, number> = table();\n';
    expect(diagnostics('use { ADD } from "./m1";\nexport fn go(x: string) -> unknown {\n  return ADD(x);\n}\n', M1)).toEqual([at(3, 10, 'ADD')]);
    expect(diagnostics('use { ADD alias A2 } from "./m1";\nexport fn go(x: string) -> unknown {\n  return A2(x);\n}\n', M1)).toEqual([at(3, 10, 'A2')]);
    // 読むだけの表と名乗っても、関数が返した表は読む位置 (`.get`) でも読めない —— 引いた先でも、宣言した module でも断りは 1 件
    expect(diagnostics('use { T } from "./m1";\nexport fn go(x: string) -> unknown {\n  return T.get(x);\n}\n', M1)).toEqual([at(3, 10, 'T')]);
    expect(diagnostics('fn table() -> Map<string, number> {\n  return new Map<string, number>();\n}\nconst T: ReadonlyMap<string, number> = table();\nexport fn go(x: string) -> unknown {\n  const t = T;\n  return 1;\n}\n')).toEqual([at(6, 13, 'T')]);
    // 型で「書き換えられる」と名乗った Map でも、関数が返した物は読めない (0.34 までは書けた形)
    expect(reads('fn table() -> Map<string, number> {\n  return new Map<string, number>();\n}\nconst X: Map<string, number> = table();\n')).toEqual(refused());
    // 対照: 引いた先のデータの const は読める・再輸出は名前を読まない
    expect(diagnostics('use { LIST } from "./m1";\nexport fn go(x: string) -> unknown {\n  return LIST.length;\n}\n', M1)).toEqual([]);
    expect(diagnostics('export { ADD } from "./m1";\n', M1)).toEqual([]);
  });

  it('対照: 状態と名乗る let・export するだけの旗・関数の中の束縛・型の位置の typeof は今までどおり書ける', () => {
    const STATE =
      'interface State {\n  readonly xs: readonly string[];\n  readonly plus: (x: string) => void;\n}\n' +
      'fn make() -> State {\n  const xs = ["https://ok/"];\n  return { xs, plus: (x: string) => {\n    xs.push(x);\n  } };\n}\n';
    // 直下の let は「入れ直せる状態」と名乗っているので、工場の結果を持てる
    expect(diagnostics(STATE + 'let state: State = make();\nexport fn go(x: string) -> unknown {\n  state.plus(x);\n  return state.xs;\n}\n')).toEqual([]);
    // 起動の副作用のために置き、export するだけの旗 (実物の `mainBooted` がこの形)
    expect(diagnostics('fn boot() -> boolean {\n  return true;\n}\nexport const booted = boot();\n')).toEqual([]);
    // 関数の中で受ける形は、その呼び出しの物
    expect(diagnostics(STATE + 'export fn go(x: string) -> unknown {\n  const s = make();\n  s.plus(x);\n  return s.xs;\n}\n')).toEqual([]);
    // 型の位置の `typeof 名前` は値を読まない
    expect(diagnostics(STATE + 'const STATE: State = make();\nexport fn peek(s: typeof STATE) -> number {\n  return s.xs.length;\n}\n')).toEqual([]);
    // 字面と組み込みだけで組んだ表・正規表現は、今までどおり読める
    const TABLES =
      'const LIM = { a: 1, b: 2 };\nconst T: ReadonlyMap<string, number> = new Map<string, number>(Object.entries(LIM));\n' +
      'const RE = new RegExp(["a", "b"].join("|"));\nconst API = Object.freeze({ f: (x: string) => x });\n';
    expect(diagnostics(TABLES + 'export fn go(x: string) -> unknown {\n  return [T.get(x), RE.test(x), API.f(x)];\n}\n')).toEqual([]);
  });
});
