import { describe, expect, it } from 'vitest';
import { compileProject, formatDiagnostic } from '../compile';
import { inspectEmitted } from './mamoriInspect';
import { emittedShape, shapeMismatch } from './mamoriShape';

/*
 * **T-260 —— Mamori が検めた木と、TypeScript が走らせる木が食い違う穴** (2026-11-10 · `satisfies` を足す前に破って見つけた)。
 *
 * 型の綴りは生成物へ**そのまま写る**。0.30 まで型は「許した記号の並び」として写しており、並びが 1 つの型かは見ていなかった。
 * 3 つの形で、検査器 (M0〜M7) が見た木と、生成した TypeScript の木が別物になった:
 *
 *  D1 型引数に式を隠す —— `n<m ? shell.openExternal(raw) : k>(x)`
 *       Mamori: 型引数つきの呼び出し 1 つ (型引数の中身は「型」なので検めない)
 *       TypeScript: 条件式 `(n < m) ? shell.openExternal(raw) : (k > x)` —— plain の関数から危ない口を、印の無い値で呼ぶ (tsc も通る)
 *  D3 束縛の型に 2 つ目の束縛を隠す —— `let a: number, okUrl = (s: string) => JSON.parse(s);`
 *       Mamori: 束縛 1 つ (型が `number, okUrl`)
 *       TypeScript: 束縛 2 つ。隠れた `okUrl` が module の関門を覆い、以後の `okUrl(raw)` は関門でないのに印つきと数えられた
 *  D2 括弧を落として呼び出しに化ける —— `f((n < n), n > (raw ?? raw))`
 *       Mamori: 比べ 2 つ。生成物は `f(n < n, n > (raw ?? raw))` で、TypeScript は `n<n, n>(raw ?? raw)` (型引数つきの呼び出し) と読む
 *
 * 塞ぎ方: ① 型の綴りは**1 つの型として読める並び**だけ (構文の段の `checkTypeShape` —— TypeScript の型の文法の部分集合)
 *         ② 式の中の `<` の比べは**必ず括って出す** (変換の `nested`)
 *         ③ 独立の判定に**木の形の突き合わせ** (`mamoriShape.ts`) と「1 文に束縛 2 つ」「`,` の式」を足す
 */
const PRE = 'export vetted VU = "u";\nextern sink global shell;\nexport gate fn okUrl(raw: string) -> VU | null {\n  if (raw.length > 0) { return mint VU(raw); }\n  return null;\n}\n'
  + 'export sink fn go(u: VU) -> void {\n  shell.openExternal(u);\n}\nfn pick<T>(v: T) -> T {\n  return v;\n}\n';
const SIG = 'n: number, m: number, k: number, x: number, raw: string, xs: number[]';
const f = (body: string): string => `${PRE}export fn f(${SIG}) -> unknown {\n${body}\n}\n`;
const PATH = 'src/x/m0.mamori';

function diag(source: string): string[] {
  const r = compileProject([{ path: PATH, source }]);
  return r.ok ? [] : r.diagnostics.map(formatDiagnostic);
}
function ts(source: string): string {
  const r = compileProject([{ path: PATH, source }]);
  if (!r.ok) throw new Error(r.diagnostics.map(formatDiagnostic).join('\n'));
  return [...r.outputs.values()][0]!;
}
const NOT_A_TYPE = /M0.*型の綴りが 1 つの型として読めません/;
const EXTERNS = new Set(['shell']);

describe('T-260: 型の綴りは 1 つの型として読める並びだけ', () => {
  it('★ 型引数の綴りに式を隠せない (Mamori は型引数つきの呼び出しと読み、TypeScript は条件式として危ない口を呼ぶ) (threat: T-260)', () => {
    // 型引数として読めない並びは比べ・条件式として読み直す (TypeScript と同じ読み) ので、中の呼び出しは検査器が検める
    expect(diag(f('  return n<m ? shell.openExternal(raw) : k>(x);')).join('\n')).toMatch(/M2.*危ない口 shell/);
    expect(diag(f('  return n<m ? go(raw) : k>(x);')).join('\n')).toMatch(/M4.*go の引数 1 は印 VU を持つ値だけ/);
    // new の型引数は試し読みではない (必ず型) ので、型として読めないと言って断る
    expect(diag(f('  return new Map<m ? shell.openExternal(raw) : k>(x);')).join('\n')).toMatch(NOT_A_TYPE);
    // `,` でつないだ式・括弧で囲んだ式を型引数に置く形
    expect(diag(f('  return n<shell.openExternal (raw), k>(x);'))).not.toEqual([]);
    expect(diag(f('  return n<(shell.openExternal (raw)), k>(x);'))).not.toEqual([]);
    expect(diag(f('  return pick<m ? go(raw) : k>(x);')).join('\n')).toMatch(/M4/);
  });

  it('TypeScript はその並びを条件式と読む (だから Mamori も型引数と読んではいけない)', () => {
    const s = emittedShape('x.ts', 'export function f(n: number, m: number, k: number, x: number, raw: string) {\n  return n<m ? shell.openExternal(raw) : k>(x);\n}\n');
    expect({ conds: s.conds, calls: s.calls, generics: s.generics }).toEqual({ conds: 1, calls: 1, generics: 0 });
    // 対照: 型として読める並びなら TypeScript も型引数つきの呼び出しと読む
    const g = emittedShape('x.ts', 'export function f(n: number, x: number) {\n  return pick<number | string>(x);\n}\n');
    expect({ conds: g.conds, calls: g.calls, generics: g.generics }).toEqual({ conds: 0, calls: 1, generics: 1 });
  });

  it('★ 束縛の型の綴りに 2 つ目の束縛を隠せない (隠れた束縛が module の関門を覆う) (threat: T-260)', () => {
    expect(diag(f('  let a: number, okUrl = (s: string) => JSON.parse(s);\n  go(okUrl(raw));\n  return a;')).join('\n')).toMatch(NOT_A_TYPE);
    expect(diag(f('  const a: number, okUrl = 1;\n  return a;')).join('\n')).toMatch(NOT_A_TYPE);
    expect(diag(`${PRE}let a: number, okUrl2 = 1;\n`).join('\n')).toMatch(NOT_A_TYPE);
    expect(diag(`${PRE}const a: number, okUrl2 = 1;\n`).join('\n')).toMatch(NOT_A_TYPE);
    // 引数・戻り値・型の別名・interface の欄でも同じ
    expect(diag(`${PRE}export fn g(a: [number, okUrl: number]) -> void {\n}\n`).join('\n')).toMatch(NOT_A_TYPE);
    expect(diag(`${PRE}export fn g(a: number) -> void, x {\n}\n`).join('\n')).toMatch(NOT_A_TYPE);
    expect(diag(`${PRE}type T = number, U;\n`).join('\n')).toMatch(NOT_A_TYPE);
    // `=` を含む並びは、式の記号を断る T-250 の検めが先に断る
    expect(diag(`${PRE}type T = number, U = string;\n`).join('\n')).toMatch(/M0.*型の中に `=` は置けません/);
    expect(diag(`${PRE}interface I {\n  a: number, b;\n}\n`)).not.toEqual([]);
  });

  it('★ 独立の判定は「1 文に束縛 2 つ」「`,` でつないだ式」の生成物を落とす (手で書いた穴の生成物)', () => {
    const hole = (src: string): string => inspectEmitted('x.ts', src, EXTERNS).filter((h) => h.kind === 'hole').map((h) => h.reason).join('|');
    expect(hole('export function f(raw: string) {\n  let a: number, okUrl = (s: string) => JSON.parse(s);\n  return okUrl(raw);\n}\n')).toMatch(/1 つの文に束縛が 2 つある.*a, okUrl/);
    expect(hole('export function f(n: number, raw: string) {\n  return (n, raw);\n}\n')).toMatch(/`,` でつないだ式がある/);
    // 対照: 束縛 1 つずつ・`,` の無い式は落とさない
    expect(hole('export function f(raw: string) {\n  const a = 1;\n  const b = [a, raw];\n  return b;\n}\n')).toBe('');
  });
});

describe('T-260: 式の中の < の比べは括って出す', () => {
  const CASES: readonly (readonly [string, string, string])[] = [
    ['引数の並び', '  return JSON.stringify((n < n), n > (raw ?? raw));', 'JSON.stringify((n < n), n > (raw ?? raw))'],
    ['配列', '  return [(n < n), n > (raw ?? raw)];', '[(n < n), n > (raw ?? raw)]'],
    ['ビット演算の両辺', '  return (n < n) & (n > (raw ?? raw));', '(n < n) & n > (raw ?? raw)'],
    ['比べの連なり', '  return (n < (n)) > (raw ?? raw);', '(n < n) > (raw ?? raw)'],
    ['&& の両辺', '  return n < m && k > (m === 1);', '(n < m) && k > (m === 1)'],
    ['条件式', '  return n < m ? k : x > (m === 1);', '(n < m) ? k : x > (m === 1)'],
    ['オブジェクトの欄', '  return { a: n < m, b: k > (m === 1) };', '{ a: (n < m), b: k > (m === 1) }'],
    ['展開', '  return [...xs, (n < m), k > (m === 1)];', '[...xs, (n < m), k > (m === 1)]'],
    ['添字つきの左辺', '  return xs[0] < n > (m === 1);', '(xs[0] < n) > (m === 1)'],
    ['引数の既定値', '  const g = (a: boolean = n < m, b: boolean = k > (m === 1)) => a;\n  return g;', '(a: boolean = (n < m), b: boolean = k > (m === 1)) => a'],
  ];

  it('★ 引数の並び・配列・演算子の両辺・条件式・欄の中の `<` は括る (TypeScript が型引数つきの呼び出しと読まない) (threat: T-260)', () => {
    for (const [name, body, want] of CASES) {
      const out = ts(f(body));
      expect(out, name).toContain(want);
      expect({ name, mismatch: shapeMismatch(PATH, f(body), out) }).toEqual({ name, mismatch: [] });
      expect({ name, found: inspectEmitted('x.ts', out, EXTERNS).map((h) => h.reason) }).toEqual({ name, found: [] });
    }
  });

  it('★ 対照: 括らない生成物 (直す前の形) は、木の形の突き合わせが食い違いを挙げる', () => {
    // 直す前の変換が出していた綴り。TypeScript は `n<n, n>(…)` / `xs[0]<n>(…)` を型引数つきの呼び出しと読む。
    const OLD: readonly (readonly [string, string])[] = [
      ['  return JSON.stringify((n < n), n > (raw ?? raw));', 'JSON.stringify(n < n, n > (raw ?? raw))'],
      ['  return [(n < n), n > (raw ?? raw)];', '[n < n, n > (raw ?? raw)]'],
      ['  return xs[0] < n > (m === 1);', 'xs[0] < n > (m === 1)'],
      ['  return n < m && k > (m === 1);', 'n < m && k > (m === 1)'].slice(0, 2) as [string, string],
    ];
    const wrap = (e: string): string => `export function f(n: number, m: number, k: number, x: number, raw: string, xs: number[]): unknown {\n  return ${e};\n}\n`;
    const body = (src: string): string => src.slice(src.indexOf('export fn f('));
    const mis = (i: number): string => shapeMismatch(PATH, body(f(OLD[i]![0])), wrap(OLD[i]![1])).join(' | ');
    expect(mis(0)).toMatch(/generics: Mamori 0 \/ TypeScript 1/);
    expect(mis(1)).toMatch(/generics: Mamori 0 \/ TypeScript 1/);
    expect(mis(2)).toMatch(/generics: Mamori 0 \/ TypeScript 1/);
    // `&&` をまたぐ形は型引数の並びにならない (`&&` は型の並びを切る) —— 括弧が無くても食い違わないことの対照
    expect(mis(3)).toBe('');
    // 同じ道具で、今の生成物は食い違わない
    for (const [src] of OLD) expect(shapeMismatch(PATH, f(src), ts(f(src)))).toEqual([]);
  });

  it('文の根の `<` は括らない (直後が `;` `)` で、TypeScript の型引数の試し読みはそこで止まる)', () => {
    expect(ts(f('  return n < m;'))).toContain('  return n < m;');
    expect(ts(f('  if (n < m) { return 1; }\n  return 0;'))).toContain('if (n < m) return 1;');
    expect(ts(f('  const b = n < m;\n  return b;'))).toContain('const b = n < m;');
    expect(ts(f('  let i = 0;\n  while (i < n) {\n    i = i + 1;\n  }\n  return i;'))).toContain('while (i < n) {');
  });

  it('`<` 以外の比べ (`>` `<=` `>=`) は今までどおり括らない (TypeScript が型引数を試すのは `<` だけ)', () => {
    expect(ts(f('  return n > m && k <= x || n >= k;'))).toContain('n > m && k <= x || n >= k');
  });

  it('矢印関数の本体の `<` も括る (本体の先は引数の並びの続きである)', () => {
    const src = f('  return [(y: number) => (n < y), k > (m === 1)];');
    const out = ts(src);
    expect(out).toContain('[(y: number) => (n < y), k > (m === 1)]');
    expect(shapeMismatch(PATH, src, out)).toEqual([]);
  });

  it('型引数として読める並びは Mamori も TypeScript も型引数つきの呼び出しと読む (読みが揃う)', () => {
    const src = f('  return [(y: number) => pick<number>(y), pick<string | number>(raw)];');
    const out = ts(src);
    expect(out).toContain('pick<number>(y), pick<string | number>(raw)');
    expect(shapeMismatch(PATH, src, out)).toEqual([]);
  });
});

describe('T-260: 型の文法 (TypeScript の型の文法の部分集合)', () => {
  const decl = (t: string): string[] => diag(`${PRE}type T0 = ${t};\n`);
  const param = (t: string): string[] => diag(`${PRE}export fn g(a: ${t}) -> void {\n}\n`);
  const ret = (t: string): string[] => diag(`${PRE}export fn g(a: unknown) -> ${t} {\n  return null;\n}\n`);

  it('読める型: 名前・型引数・配列・和・交差・オブジェクト・組・関数・typeof・readonly / keyof・字面', () => {
    const OK = [
      'string', 'a.b.C', 'Map<string, number>', 'Array<readonly string[]>', 'string[][]', 'string | null', '| "a" | "b"', 'A & B', 'A & (B | C)',
      '{ a: string; b?: number }', '{ readonly a: string, "b-c": number, }', '{}', '[string, number]', '[string,]', '[]', '(A | B)[]',
      '(a: string) => void', '() => Promise<void>', '(a: string, b?: number) => (c: string) => boolean', '(x: unknown) => x is string',
      'typeof raw0', 'typeof a.b', 'readonly string[]', 'keyof T1', 'keyof typeof raw0', '1', '-1', '"lit"', 'Record<string, (a: string) => void>',
    ];
    for (const t of OK) expect({ t, d: decl(t).filter((x) => /型の綴りが/.test(x)) }).toEqual({ t, d: [] });
    // 引数の型・戻り値の型でも同じ文法
    expect(param('Map<string, { a: number }[]>')).toEqual([]);
    expect(ret('string | null')).toEqual([]);
    // 先頭の `|` はどの位置でも書ける (type 宣言の外でも)・typeof の後ろの `[]`・省ける引数を持つ関数の型
    expect(param('| "a" | "b"')).toEqual([]);
    expect(param('Array<| "a" | "b">')).toEqual([]);
    expect(param('typeof raw0[]')).toEqual([]);
    expect(param('(a?: number) => void')).toEqual([]);
    // 欄の名前としての readonly・文字列の欄に付く readonly
    expect(param('{ readonly: string }')).toEqual([]);
    expect(param('{ readonly "k": number }')).toEqual([]);
    expect(param('{ readonly readonly: string }')).toEqual([]);
  });

  it('★ 断りは、どこで型として読めなくなったかを言う (理由の文を 1 つずつ留める)', () => {
    const why = (t: string): string => param(t).join('\n');
    const CASES: readonly (readonly [string, RegExp])[] = [
      // 並びの残り
      ['number string', /`string` から先が型に続きません/],
      ['"x" is string', /`is` から先が型に続きません/],
      // 記号が足りない
      ['(a: number) x number', /`=>` が要ります/],
      ['(a.b: number) => void', /`\)` が要ります/],
      ['(a ? b) => void', /`\)` が要ります/],
      ['("a": number) => void', /`\)` が要ります/],
      ['{ a b: number }', /`:` が要ります/],
      ['number[string]', /`\]` が要ります/],
      // 名前が要る所
      ['A."b"', /名前が要ります/],
      ['(a: number, 1: number) => void', /名前が要ります/],
      ['typeof', /名前が要ります/],
      ['typeof 1', /名前が要ります/],
      // 欄・組
      ['{ 1: number }', /欄の名前が要ります/],
      ['{ readonly }', /`:` が要ります/],
      ['{ a: number b: string }', /欄の区切り `;` が要ります/],
      ['[number string]', /組の区切り `,` が要ります/],
      // 型が要る所
      ['Array<>', /型が要ります/],
      ['number |', /型が要ります/],
      ['readonly', /型が要ります/],
      ['keyof', /型が要ります/],
      ['keyof |', /型が要ります/],
    ];
    for (const [t, re] of CASES) {
      expect({ t, d: why(t) }).toEqual({ t, d: expect.stringMatching(NOT_A_TYPE) });
      expect({ t, d: why(t) }).toEqual({ t, d: expect.stringMatching(re) });
    }
  });

  it('★ 読めない並びは断る (式・2 つ目の束縛・TypeScript だけの型の形)', () => {
    const NG = [
      'number, x', 'A B', 'm ? a : b', 'A extends B ? C : D', '(a, b) => c', '(a) => b', 'new () => T', 'm[0]', 'T[K]', 'import("x").T',
      'infer X', 'Map<>', 'Map<string,>', '-x', '{ [k: string]: T }', '{ a: string b: number }', '[a b]', '() => ', 'a |', '| ', 'A &', 'f(x)',
      'a.', '(A', 'A)', '{ a }', '{ a: }', 'x is string', '(x: unknown) => x is', 'a = b',
    ];
    for (const t of NG) expect({ t, refused: decl(t).length > 0 }).toEqual({ t, refused: true });
    // 断りの文は「型として読めない」と言う (式の記号を断る T-250 の文とは別に、並びを見る)
    for (const t of ['number, x', 'A B', 'm[0]', '(a) => b', 'Map<string,>', '{ a: string b: number }', '[a b]', 'x is string']) {
      expect({ t, d: decl(t).join('\n') }).toEqual({ t, d: expect.stringMatching(NOT_A_TYPE) });
    }
  });

  it('型の述語 `x is T` / `asserts x` は関数の戻り値の型 (と関数の型の戻り) にだけ置ける', () => {
    expect(ret('a is string').filter((x) => /型の綴りが/.test(x))).toEqual([]);
    expect(ret('asserts a is string').filter((x) => /型の綴りが/.test(x))).toEqual([]);
    expect(ret('asserts a').filter((x) => /型の綴りが/.test(x))).toEqual([]);
    expect(param('a is string').join('\n')).toMatch(NOT_A_TYPE);
    expect(decl('asserts a is string').join('\n')).toMatch(NOT_A_TYPE);
    expect(ret('string | a is string').join('\n')).toMatch(NOT_A_TYPE);
    // 述語の対象は名前だけ (字面を置くと、型の残りとして断る)
    expect(ret('"x" is string').join('\n')).toMatch(/`is` から先が型に続きません/);
    expect(ret('1 is string').join('\n')).toMatch(/`is` から先が型に続きません/);
    // `asserts` という名前の型は型である (次が名前でなければ前置の語と読まない)
    expect(ret('asserts | null').filter((x) => /型の綴りが/.test(x))).toEqual([]);
  });

  it('★ 式の位置 (型引数) には `(` で始まる型を置けない —— 関数の型は名前を付けて引く', () => {
    const REFUSE = /式の位置 \(型引数・satisfies\) には `\(` で始まる型を置けません/;
    expect(diag(f('  return new Map<string, (a: string) => void>();')).join('\n')).toMatch(REFUSE);
    expect(diag(f('  return new Set<(string | number)[]>();')).join('\n')).toMatch(REFUSE);
    // 名前を付ければ通る
    expect(diag(`${PRE}type Fn = (a: string) => void;\nexport fn g() -> unknown {\n  return new Map<string, Fn>();\n}\n`)).toEqual([]);
    // 宣言の位置 (束縛・引数・別名) では関数の型をそのまま書ける
    expect(diag(f('  const m0: Map<string, (a: string) => void> = new Map();\n  return m0;'))).toEqual([]);
    // 呼び出しの型引数は試し読み: `(` で始まれば型引数と読まず、比べとして読み直す (TypeScript と同じ木になる)
    const src = f('  return pick<(n)>(x);');
    expect(shapeMismatch(PATH, src, ts(src))).toEqual([]);
    expect(ts(src)).toContain('(pick < n) > x');
  });
});

/** 種から決まる乱数 (mulberry32)。 */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe('T-260: 受け入れたプログラムは、Mamori の木と TypeScript の木の形が一致する (種つきの総当たり)', () => {
  const ATOMS = ['n', 'm', 'k', 'x', '1', 'xs.length', 'xs[0]', 'raw.length', 'pick(n)', 'pick<number>(m)', 'JSON.stringify(raw)'];
  const gen = (r: () => number, depth: number): string => {
    const pickOf = <T,>(xs: readonly T[]): T => xs[Math.floor(r() * xs.length)]!;
    if (depth <= 0 || r() < 0.18) return pickOf(ATOMS);
    const a = (): string => gen(r, depth - 1);
    const forms: readonly (() => string)[] = [
      () => `${a()} < ${a()}`, () => `${a()} < ${a()}`, () => `${a()} > ${a()}`, () => `${a()} > (${a()})`, () => `(${a()} < ${a()})`,
      () => `${a()} <= ${a()}`, () => `${a()} >= ${a()}`, () => `${a()} === ${a()}`, () => `${a()} && ${a()}`, () => `${a()} || ${a()}`,
      () => `${a()} ?? ${a()}`, () => `${a()} + ${a()}`, () => `(${a()})`, () => `[${a()}, ${a()}]`, () => `[${a()}, ${a()}, ${a()}]`,
      () => `{ a: ${a()}, b: ${a()} }`, () => `${a()} ? ${a()} : ${a()}`, () => `(y: number) => ${a()}`, () => `pick<number>(${a()})`,
      () => `pick(${a()}, ${a()})`, () => `!${a()}`, () => `${a()} & ${a()}`, () => `JSON.stringify(${a()}, ${a()})`,
      // 型引数と比べの境目を突く並び
      () => `${pickOf(['n', 'pick', 'xs.length', 'xs[0]'])}<${pickOf(['m', 'number', 'k | x', 'm, k', 'string[]', '{ a: n }', '[m, k]'])}>(${a()})`,
      () => `${a()} < ${pickOf(['m', 'k'])} > (${a()})`, () => `${a()} < ${a()}, ${a()} > (${a()})`,
      () => `new Map<${pickOf(['string', 'm', 'number, k', 'n ? m : k'])}, number>()`,
    ];
    return pickOf(forms)();
  };
  const STMTS: readonly ((e: string, e2: string) => string)[] = [
    (e) => `  return ${e};`,
    (e) => `  const v = ${e};\n  return v;`,
    (e) => `  if (${e}) { return 1; }\n  return 0;`,
    (e, e2) => `  return [${e}, ${e2}];`,
    (e, e2) => `  return JSON.stringify(${e}, ${e2});`,
    (e, e2) => `  const g = (a: unknown = ${e}, b: unknown = ${e2}) => a;\n  return g;`,
  ];

  it('★ 3 つの種 × 1500 本: 受け入れた物は木の形が一致するか、生成物が TypeScript の構文の誤りで止まる (黙って別の木にならない) (threat: T-260)', () => {
    const tally = { accepted: 0, refused: 0, lenient: 0, checked: 0 };
    const bad: string[] = [];
    for (const seed of [1, 2, 3]) {
      const r = rng(seed);
      for (let i = 0; i < 1500; i++) {
        const body = STMTS[Math.floor(r() * STMTS.length)]!(gen(r, 3), gen(r, 2));
        const src = f(body);
        const res = compileProject([{ path: PATH, source: src }]);
        if (!res.ok) {
          tally.refused++;
          continue;
        }
        tally.accepted++;
        const out = [...res.outputs.values()][0]!;
        const found = inspectEmitted('x.ts', out, EXTERNS);
        if (found.some((h) => h.kind === 'lenient')) {
          tally.lenient++;
          continue;
        }
        tally.checked++;
        const holes = found.filter((h) => h.kind === 'hole').map((h) => h.reason);
        const mis = shapeMismatch(PATH, src, out);
        if (holes.length > 0 || mis.length > 0) bad.push(`seed=${seed} #${i} ${JSON.stringify(body)} → ${[...holes, ...mis].join(' | ')}`);
      }
    }
    expect(bad.slice(0, 5)).toEqual([]);
    // 走査が空虚でない床: 受け入れて突き合わせた本数と、断った本数の両方が十分に在る
    expect(tally.checked).toBeGreaterThanOrEqual(1500);
    expect(tally.refused).toBeGreaterThanOrEqual(300);
    // 構文の誤りで止まる生成物 (tsc が断つ側) は少数に留まる —— 増えたら変換が TypeScript の読みから離れた報せ
    expect(tally.lenient).toBeLessThanOrEqual(tally.accepted * 0.05);
  });
});
