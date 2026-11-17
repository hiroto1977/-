import { describe, expect, it } from 'vitest';
import { compileProject, formatDiagnostic } from '../compile';
import { emittedShape, mamoriShape, shapeMismatch } from './mamoriShape';

/*
 * **Mamori 0.39 —— 検めた木と、生成物を TypeScript が読む木を揃える 3 つの直し** (2026-11-17 · MG-077 · 言語の穴探し · threat: T-276)。
 *
 * 0.38 のコンパイラへ、種つきで作った式・文・型の綴り (約 14 万本) を当て、受け入れた物について「Mamori の木」と
 * 「生成物を TypeScript が読んだ木」を同じ形へ畳んで比べた。構文の誤りで止まらずに**別の木になる**形が 3 つ在った:
 *
 *  1. 型引数の綴りに、TypeScript が型として読めない語の並び (型の語 + `<型>`・`null` / `true` / `false` / `this` + `.名前`・頭の
 *     `infer` / `super`) —— Mamori は「型引数つきの呼び出し」、TypeScript は誤りにせず「比べの並び」と読み直す。検めた呼び出しは走らず、
 *     型の綴りは式として走る。
 *  2. 数の字面のメンバ `1.e3` —— Mamori は「数 1 の欄 e3」、TypeScript は指数つきの数 1000。
 *  3. 文の頭のオブジェクトの字面 `({ k: x })(y);` —— 生成物は括弧を落とし、TypeScript はブロックと式の文に読む。
 *
 * 直し: 型の語は単独の型としてだけ書け、予約語と `infer` / `unique` は型の頭に置けない (構文の段)。数の字面のメンバと、
 * 文の頭の `{` は括って出す (変換の段)。木の形の突き合わせ (`mamoriShape.ts`) はメンバ・数の字面・オブジェクトの字面も数える。
 *
 * 印の無い値が危ない口へ届く形までは確かめていない (比べの結果は真偽値で、印の型には `tsc` が通さない)。害は
 * 「検めた呼び出しが走らない」「型の綴りに書いた名前が、検めを受けずに値として読まれる」ことである。
 */

function compile(source: string): { ok: boolean; diagnostics: string[]; emitted: string } {
  const r = compileProject([{ path: 'src/x/m0.mamori', source }]);
  return r.ok ? { ok: true, diagnostics: [], emitted: [...r.outputs][0]![1] } : { ok: false, diagnostics: r.diagnostics.map(formatDiagnostic), emitted: '' };
}

const FN = (body: string, sig = 'a: number'): string => `export fn t(${sig}) -> unknown {\n${body}}\n`;
const SHAPE = (why: string): string => `[M0] 型の綴りが 1 つの型として読めません (${why}) —— 型の綴りは生成物へそのまま写るので、型として読めない並びは TypeScript が式や別の宣言として読みます (T-260)`;
const only = (line: number, col: number, message: string): unknown[] => [`src/x/m0.mamori:${line}:${col}: ${message}`];

/** 型の語 (TypeScript が型の位置で語として読む名前)。構文の段の表を写さず、ここに並べる (表が減れば落ちる)。 */
const TYPE_KEYWORDS = ['unknown', 'never', 'number', 'bigint', 'boolean', 'string', 'symbol', 'void', 'object', 'undefined', 'null', 'true', 'false', 'this'];
/** 型の頭に置けない語。 */
const REFUSED_HEADS = [
  'break', 'case', 'catch', 'class', 'const', 'continue', 'debugger', 'default', 'delete', 'do', 'else', 'enum', 'export', 'extends', 'finally', 'for',
  'function', 'if', 'in', 'instanceof', 'new', 'return', 'super', 'switch', 'throw', 'try', 'var', 'while', 'with', 'yield', 'let', 'static', 'implements',
  'interface', 'package', 'private', 'protected', 'public', 'await', 'infer', 'unique',
];

describe('0.39: 型の語は単独の型としてだけ書ける (threat: T-276)', () => {
  it('★ 型の語の後ろに `.名前` / `<型>` を続けた型を断る —— TypeScript の型の文法に無く、型引数の位置では比べ 2 つに読み直される (threat: T-276)', () => {
    for (const w of TYPE_KEYWORDS) {
      // 束縛の型: `const v: 語.x = a;` (2 行目・型は 12 桁目から。断る場所は語の次の字句)
      expect(compile(FN(`  const v: ${w}.x = a;\n  return v;\n`)).diagnostics, w).toEqual(only(2, 12 + w.length, SHAPE(`型の語 \`${w}\` の後ろに \`.\` は続きません`)));
      expect(compile(FN(`  const v: ${w}<number> = a;\n  return v;\n`)).diagnostics, w).toEqual(only(2, 12 + w.length, SHAPE(`型の語 \`${w}\` の後ろに \`<\` は続きません`)));
    }
    // 引数の型・戻り値の型でも同じ
    expect(compile('export fn t(a: string.x) -> unknown {\n  return a;\n}\n').diagnostics).toEqual(only(1, 22, SHAPE('型の語 `string` の後ろに `.` は続きません')));
    expect(compile('export fn t(a: number) -> unknown.x {\n  return a;\n}\n').diagnostics).toEqual(only(1, 34, SHAPE('型の語 `unknown` の後ろに `.` は続きません')));
  });

  it('★ 型引数の位置では、Mamori も TypeScript と同じく比べの並びと読む —— 型の綴りだった名前は式として検めを受ける (threat: T-276)', () => {
    // 直す前: Mamori は `f<infer.x>(a)` を「型引数つきの呼び出し」と読み、`infer.x` を検めなかった (TypeScript は比べ 2 つと読む)
    const undeclared = compile(FN('  return f<infer.x>(a);\n', 'a: number, f: (n: number) => number'));
    expect(undeclared.diagnostics).toEqual([expect.stringContaining('src/x/m0.mamori:2:12: [M6] 宣言していない名前 infer')]);
    // 式として読める綴りは受け入れるが、検めた木も生成物も「比べ 2 つ」で揃う (呼び出しは 0)
    const src = FN('  return f<null.x>(a);\n', 'a: number, f: (n: number) => number');
    const r = compile(src);
    expect(r.ok).toBe(true);
    expect(r.emitted).toContain('  return (f < null.x) > a;\n');
    const m = mamoriShape('src/x/m0.mamori', src);
    expect({ calls: m.calls, generics: m.generics, lt: m.binary['<'], gt: m.binary['>'], members: m.members }).toEqual({ calls: 0, generics: 0, lt: 1, gt: 1, members: 1 });
    expect(shapeMismatch('src/x/m0.mamori', src, r.emitted)).toEqual([]);
    // 型の語 + `<型>` も同じ (TypeScript は `f < string < number >> a` と読む。Mamori も同じ並びと読み、名前を検める)
    expect(compile(FN('  return f<string<number>>(a);\n', 'a: number, f: (n: number) => number')).diagnostics).toEqual([expect.stringContaining('[M6] 宣言していない名前 string'), expect.stringContaining('[M6] 宣言していない名前 number')]);
  });

  it('★ 対照: TypeScript はその綴りを型引数として読まない (だから Mamori が型引数と読んではいけない)', () => {
    // 直す前の生成物の形を手で書く。TypeScript の木に、型引数つきの呼び出しは無い (構文の誤りにもならない)
    const read = (type: string): { calls: number; generics: number; compares: number } => {
      const t = emittedShape('m0.ts', `declare const f: (n: number) => number, a: number;\nexport const v = f<${type}>(a);\n`);
      return { calls: t.calls, generics: t.generics, compares: (t.binary['<'] ?? 0) + (t.binary['>'] ?? 0) + (t.binary['>>'] ?? 0) };
    };
    for (const type of ['null.x', 'true.x', 'false.x', 'this.x', 'infer.x', 'super.x']) expect(read(type), type).toEqual({ calls: 0, generics: 0, compares: 2 });
    for (const w of TYPE_KEYWORDS.filter((k) => k !== 'void')) expect(read(`${w}<number>`), w).toEqual({ calls: 0, generics: 0, compares: 3 });
    // 型として読める綴りは、型引数つきの呼び出しと読む (針が上の並びに当たっている)。`string.x` は型の参照として読まれる
    for (const type of ['string', 'Rec.x', 'Array<number>', 'string.x']) expect(read(type), type).toEqual({ calls: 1, generics: 1, compares: 0 });
  });

  it('★ 予約語と `infer` / `unique` は型の頭に置けない (`typeof` の直後でも) (threat: T-276)', () => {
    for (const w of REFUSED_HEADS) {
      const d = compile(FN(`  const v: ${w} = a;\n  return v;\n`)).diagnostics;
      expect(d, w).toHaveLength(1);
      // 語によっては字句・文の段が先に断る (`export` ほか)。型の段まで届いた語は、この文で断る
      if (d[0]!.includes('型の綴りが')) expect(d[0], w).toBe(`src/x/m0.mamori:2:12: ${SHAPE(`\`${w}\` は型の名前にできません`)}`);
    }
    // 型の段まで届く語が在る (上の if が全部の語を素通りしていない)
    expect(compile(FN('  const v: infer = a;\n  return v;\n')).diagnostics).toEqual(only(2, 12, SHAPE('`infer` は型の名前にできません')));
    expect(compile(FN('  const v: unique.x = a;\n  return v;\n')).diagnostics).toEqual(only(2, 12, SHAPE('`unique` は型の名前にできません')));
    expect(compile(FN('  const v: new.target = a;\n  return v;\n')).diagnostics).toEqual(only(2, 12, SHAPE('`new` は型の名前にできません')));
    expect(compile(FN('  const v: typeof new.target = a;\n  return v;\n')).diagnostics).toEqual(only(2, 19, SHAPE('`new` は型の名前にできません')));
  });

  it('対照: 単独の型の語・`.` の後ろの名前・普通の名前の型は今までどおり書ける', () => {
    const src =
      'type Rec = { x: number };\n' +
      FN('  const p: Promise<void> | null = null;\n  const q: Array<string> = [];\n  const r: typeof a = a;\n  const s: Rec.x | undefined = undefined;\n  const u: Rec.class = a;\n  return [p, q, r, s, u];\n');
    const r = compile(src);
    expect(r.diagnostics).toEqual([]);
    // 型の綴りはそのまま生成物へ写る
    expect(r.emitted).toContain('  const p: Promise<void> | null = null;\n');
    expect(r.emitted).toContain('  const u: Rec.class = a;\n');
  });
});

describe('0.39: 数の字面のメンバと、文の頭のオブジェクトの字面は括って出す (threat: T-276)', () => {
  it('★ 数の字面のメンバは括る —— `1.e3` と並べると TypeScript は指数つきの数と読む (threat: T-276)', () => {
    const src = FN('  return [1.e3, 1 .toFixed(), 1.5.toFixed(), 0x1f.toString(), 1?.e3];\n');
    const r = compile(src);
    expect(r.ok).toBe(true);
    expect(r.emitted).toContain('  return [(1).e3, (1).toFixed(), (1.5).toFixed(), (0x1f).toString(), (1)?.e3];\n');
    expect(shapeMismatch('src/x/m0.mamori', src, r.emitted)).toEqual([]);
  });

  it('★ 対照: 括らない生成物 (直す前の形) は、木の形の突き合わせが食い違いを挙げる', () => {
    const src = FN('  return 1.e3;\n');
    const before = 'export function t(a: number): unknown {\n  return 1.e3;\n}\n';
    expect(shapeMismatch('src/x/m0.mamori', src, before)).toEqual(['members: Mamori 1 / TypeScript 0']);
    // 数の字面でない物のメンバは括らない (括るのは数の字面だけ)
    expect(compile(FN('  return [a.toFixed(), "s".length, [1].length];\n')).emitted).toContain('  return [a.toFixed(), "s".length, [1].length];\n');
  });

  it('★ 文の頭の `{` は括る —— 括らないと TypeScript はブロックと読み、検めた呼び出しが無くなる (threat: T-276)', () => {
    const src = FN('  ({ k: a })(a);\n  ({ k: a });\n  return a;\n');
    const r = compile(src);
    expect(r.ok).toBe(true);
    expect(r.emitted).toContain('  ({ k: a }(a));\n  ({ k: a });\n  return a;\n');
    expect(shapeMismatch('src/x/m0.mamori', src, r.emitted)).toEqual([]);
    // 対照: 括らない生成物 (直す前の形) は、呼び出しとオブジェクトの字面が TypeScript の木から消える
    const before = 'export function t(a: number): unknown {\n  { k: a }(a);\n  { k: a };\n  return a;\n}\n';
    expect(shapeMismatch('src/x/m0.mamori', src, before)).toEqual(['calls: Mamori 1 / TypeScript 0', 'objects: Mamori 2 / TypeScript 0']);
  });

  it('対照: `{` で始まらない式の文と、矢印関数の本体のオブジェクトの字面は今までどおり', () => {
    const r = compile(FN('  [a].length;\n  const h = () => ({ k: a });\n  return h;\n'));
    expect(r.emitted).toContain('  [a].length;\n  const h = () => ({ k: a });\n  return h;\n');
  });
});
