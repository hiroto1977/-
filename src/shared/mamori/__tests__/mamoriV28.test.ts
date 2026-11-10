import { describe, expect, it } from 'vitest';
import { compileProject } from '../compile';

/*
 * **Mamori 0.28 —— モジュール直下の `let 名前: 型 = 初期値;` を足す** (2026-11-10 · MG-058)。
 *
 * 0.27 までは状態を持つ変数が書けず、`secrets.ts` (書き込みの鎖・消去中の旗・最後の読みの劣化)・`main.ts` (窓の設定・認可の最中の旗)・
 * `vault.ts` (保管庫の唯一の入れ物) の壁は移せなかった。足す前に破った (台帳 risk: モジュールの状態は呼ばれた順で変わる —— 共有の入れ物へ inert や印の無い値を入れて
 * 別の関数が読む道 (T-259 のモジュール版)):
 *   ① `export let` ② 型の宣言が無い ③ 印の型 (`let u: VU | null = null;`) ④ 初期値が計算した鍵の添字の結果 (inert)
 *   ⑤ 関数の中から inert を代入して別の関数に読ませる ⑥ 欄・添字への代入と配列を書き換えるメソッドで共有の入れ物を書き換える
 *   ⑦ 別の module から `use` で引いて書き換える ⑧ 局所の名前で隠す ⑨ 初期値に隠した宣言なしの名前・危ない口 ⑩ `Error` を隠して例外のクラスの基底を差し替える
 *   ⑪ const・引数・関数の名前への代入は今までどおり断る。
 * 0.28 の規則: 書けるのは自分のモジュールの `let` だけで、export せず、型の宣言が要り、印の型にできない。代入は関数の中から (inert を入れる形は断つ)。
 */

function build(files: [string, string][]): { rules: string[]; output: string[] } {
  const r = compileProject(files.map(([path, source]) => ({ path, source })));
  if (r.ok) return { rules: [], output: [...r.outputs.values()] };
  return { rules: r.diagnostics.map((d) => `${d.rule} ${d.message}`), output: [] };
}
const one = (src: string): { rules: string[]; output: string } => {
  const r = build([['src/x/a.mamori', src]]);
  return { rules: r.rules, output: r.output[0] ?? '' };
};
const text = (src: string): string => one(src).rules.join('\n');

const COUNTER =
  '/// 数えた回数\nlet count: number = 0;\n' +
  'export fn bump() -> number {\n  count = count + 1;\n  return count;\n}\n';
const TABLE = 'const T: string[] = ["a", "b"];\nconst IDX: number = 0;\n';
const VU = 'export vetted VU = "u";\n';

describe('0.28: モジュール直下の let', () => {
  it('let 名前: 型 = 初期値; が通り、関数の中から代入でき、生成物は let のまま出る', () => {
    const r = one(COUNTER);
    expect(r.rules).toEqual([]);
    expect(r.output).toContain('/** 数えた回数 */');
    expect(r.output).toContain('let count: number = 0;');
    expect(r.output).toContain('count = count + 1;');
  });

  it('型は複雑でもよい (Promise<void> / string | null)・初期値は式 (関数の呼び出しも通る)', () => {
    const r = one(
      'let chain: Promise<void> = Promise.resolve();\nlet last: string | null = null;\n' +
        'export fn run(m: string) -> Promise<void> {\n  last = m;\n  chain = chain.then(() => undefined);\n  return chain;\n}\n',
    );
    expect(r.rules).toEqual([]);
    expect(r.output).toContain('let chain: Promise<void> = Promise.resolve();');
    expect(r.output).toContain('let last: string | null = null;');
  });

  it('数の let は添字の鍵にできる (型の宣言が number)・number でない let は鍵にできない', () => {
    expect(one(TABLE + 'let at: number = 1;\nexport fn f() -> boolean {\n  return T[at] === "b";\n}\n').rules).toEqual([]);
    const bad = text(TABLE + 'let at: string = "x";\nexport fn f() -> boolean {\n  return T[at] === "b";\n}\n');
    expect(bad).toContain('添字の鍵は');
  });
});

describe('0.28: 先に破った形', () => {
  it('① export let は書けない (理由に「他のモジュールから書き換えられる」を言う)', () => {
    const t = text('export let count: number = 0;\n');
    expect(t).toContain('`export let` は書けません');
    expect(t).toContain('書き換えられる');
  });

  it('② 型の宣言が無い let は断る', () => {
    const t = text('let count = 0;\n');
    expect(t).toContain('型の宣言が要ります');
    expect(t).toContain('let count: 型 = 初期値;');
  });

  it('③ 印の型の let は断る: 直書き・null 付き・配列の中', () => {
    for (const ty of ['VU', 'VU | null']) {
      const t = text(VU + `let held: ${ty} = null;\n`);
      expect(t, ty).toContain('M4 モジュール直下の let held は印 VU の型にできません');
    }
  });

  it('④ 初期値が計算した鍵の添字の結果 (inert) なら断る', () => {
    const t = text(TABLE + 'let pick: string = T[IDX];\n');
    expect(t).toContain('M6 計算した鍵の添字の結果は');
    expect(t).toContain('モジュール直下の let の初期値');
  });

  it('⑤ 関数の中から inert を代入して別の関数に読ませる道は、入れる段で断つ', () => {
    const t = text(
      TABLE +
        'let cur: string = "";\n' +
        'export fn put(k: number) -> void {\n  cur = T[k];\n}\n' +
        'export fn get() -> string {\n  return cur;\n}\n',
    );
    expect(t).toContain('M6 モジュール直下の cur へ、計算した鍵の添字の結果を代入できません');
  });

  it('⑤b 通常の値 (inert でない) の代入は通る・ループの中の代入も通る', () => {
    const r = one('let n: number = 0;\nexport fn f(xs: string[]) -> number {\n  for (const x of xs) {\n    n = n + x.length;\n  }\n  return n;\n}\n');
    expect(r.rules).toEqual([]);
  });

  it('⑥ 入れ物の中身は書き換えられない: 欄への代入・添字への代入・push', () => {
    const o = text('interface O {\n  a: number;\n}\nlet o: O = { a: 1 };\nexport fn f() -> void {\n  o.a = 2;\n}\n');
    expect(o).toContain('の欄へは代入できません');
    const i = text('let xs: number[] = [1];\nexport fn f() -> void {\n  xs[0] = 2;\n}\n');
    expect(i).toContain('M6');
    expect(i).toContain('添字への代入');
    const p = text('let xs: string[] = [];\nexport fn f() -> void {\n  xs.push("x");\n}\n');
    expect(p).toContain('M6');
    expect(p).toContain('`.push(…)`');
  });

  it('⑦ 別の module から use で引けない (export されない)', () => {
    const r = build([
      ['src/x/a.mamori', 'let count: number = 0;\nexport fn bump() -> number {\n  count = count + 1;\n  return count;\n}\n'],
      ['src/x/b.mamori', 'use { count } from "./a";\nexport fn f() -> number {\n  return count;\n}\n'],
    ]);
    expect(r.rules.length).toBeGreaterThan(0);
    expect(r.rules.join('\n')).toContain('count');
  });

  it('⑧ 同じ名前を 2 度宣言できない・局所の名前で隠せない・引数や const への代入は今までどおり断る', () => {
    const dup = text(COUNTER + 'export fn count() -> number {\n  return 1;\n}\n');
    expect(dup).toContain('2 度');
    const shadow = text(COUNTER + 'export fn f() -> number {\n  const count = 1;\n  return count;\n}\n');
    expect(shadow).toContain('隠します');
    const c = text('const K: number = 1;\nexport fn f() -> void {\n  K = 2;\n}\n');
    expect(c).toContain('K は let ではないので代入できません');
    const p = text('export fn f(a: number) -> void {\n  a = 2;\n}\n');
    expect(p).toContain('a は let ではないので代入できません');
  });

  it('⑨ 初期値に隠した宣言なしの名前・危ない口は断る', () => {
    expect(text('let x: Promise<unknown> = fetch("x");\n')).toContain('宣言していない名前 fetch');
    const sink = text('extern sink { shell } from "electron";\nlet x: Promise<void> = shell.openExternal("https://example.com");\n');
    expect(sink).toContain('M2');
  });

  it('⑩ Error という名前の let で例外のクラスの基底を差し替えられない', () => {
    const t = text('let Error: number = 0;\nclass K extends Error {\n  constructor() {\n    super("x");\n  }\n}\n');
    expect(t).toContain('M6 クラス K の基底');
    expect(t).toContain('隠れています');
  });

  it('⑪ let を値として読む・別の let へ写すのは通る (中身は値のコピー)', () => {
    const r = one('let a: number = 1;\nlet b: number = 2;\nexport fn swap() -> number {\n  const t = a;\n  a = b;\n  b = t;\n  return a;\n}\n');
    expect(r.rules).toEqual([]);
  });
});
