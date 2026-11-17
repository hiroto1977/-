import { describe, expect, it } from 'vitest';
import { compileProject, formatDiagnostic } from '../compile';
import { shapeMismatch } from './mamoriShape';

/*
 * **Mamori 0.41 —— Mamori 自身の語は、束縛・宣言の名前にできない** (2026-11-17 · MG-081 · 穴ではなく、読み手を迷わせる形を閉じる周)。
 *
 * 0.40 は JavaScript の予約語を束縛の名前から外した。残っていたのは Mamori 自身の語 (`fn` / `gate` / `mint` / `use` ほか 12 語) で、
 * `const mint = 1;` は受け取られていた。その名前は式の位置では読めない (構文の段が「ここに置けません」と断る) ので、
 * 束縛しても値を取り出せない —— 生成物は TypeScript として正しいが、読み手に「この名前は使える」と思わせるだけの束縛だった。
 *
 * 不変条件は 1 つ: **式の位置で読めない語は、束縛の名前にもできない**。語の表は写さず、構文の段の同じ表 (`RESERVED`) を引く。
 * メンバ (`x.type`) と鍵 (`{ type: 1 }`)・型の中の引数の名前 (`(type: string) => void`) は今までどおり書ける。
 */

function compile(source: string): { ok: boolean; diagnostics: string[]; emitted: string } {
  const r = compileProject([{ path: 'src/x/m0.mamori', source }]);
  return r.ok ? { ok: true, diagnostics: [], emitted: [...r.outputs][0]![1] } : { ok: false, diagnostics: r.diagnostics.map(formatDiagnostic), emitted: '' };
}

const FN = (body: string, sig = 'a: number, b: number'): string => `export fn t(${sig}) -> unknown {\n${body}}\n`;
const only = (line: number, col: number, message: string): unknown[] => [`src/x/m0.mamori:${line}:${col}: ${message}`];
const OWN = (w: string): string => `[M0] \`${w}\` は束縛・宣言の名前にできません —— Mamori の語です (式の位置では読めないので、束縛しても使えません)。メンバ (\`x.${w}\`) と鍵 (\`{ ${w}: … }\`) には書けます`;

/** Mamori 自身の語のうち、JavaScript の予約語でない物 (JavaScript の予約語は 0.40 の断りが先に答える)。表を写さず、ここに並べる (表が減れば落ちる)。 */
const WORDS = ['use', 'extern', 'vetted', 'fn', 'gate', 'sink', 'mint', 'from', 'alias', 'of', 'field', 'type'];

/** 値の束縛の位置 (12)。 */
const VALUE_POSITIONS: Readonly<Record<string, (w: string) => string>> = {
  引数: (w) => `export fn t(${w}: number) -> number {\n  return 1;\n}\n`,
  'const (関数の中)': (w) => FN(`  const ${w} = a;\n  return 1;\n`),
  'let (関数の中)': (w) => FN(`  let ${w} = a;\n  return 1;\n`),
  '分割代入の省略形': (w) => FN(`  const { ${w} } = o;\n  return 1;\n`, 'o: { readonly k: number }'),
  '分割代入の付け替え': (w) => FN(`  const { k: ${w} } = o;\n  return 1;\n`, 'o: { readonly k: number }'),
  'for-of': (w) => FN(`  for (const ${w} of xs) {\n  }\n  return 1;\n`, 'xs: readonly number[]'),
  catch: (w) => FN(`  try {\n    return 1;\n  } catch (${w}) {\n    return 2;\n  }\n`),
  '矢印関数 (括弧なし)': (w) => FN(`  const g = ${w} => 1;\n  return g;\n`),
  '矢印関数 (括弧つき)': (w) => FN(`  const g = (${w}: number) => 1;\n  return g;\n`),
  'const (直下)': (w) => `const ${w} = 1;\n`,
  'let (直下)': (w) => `let ${w}: number = 1;\n`,
  関数の名前: (w) => `fn ${w}() -> number {\n  return 1;\n}\n`,
};
/** 型・import の名前の位置 (4)。 */
const TYPE_POSITIONS: Readonly<Record<string, (w: string) => string>> = {
  型の別名: (w) => `type ${w} = string;\n`,
  型引数の名前: (w) => `export fn f<${w}>(x: number) -> number {\n  return x;\n}\n`,
  'use の名前': (w) => `use { ${w} } from "./host";\n`,
  interface: (w) => `interface ${w} {\n  readonly a: string;\n}\n`,
};

describe('0.41: Mamori 自身の語は束縛・宣言の名前にできない (MG-081)', () => {
  it('前提: その 12 語は、式の位置では読めない (だから束縛しても使えない)', () => {
    expect(WORDS).toHaveLength(12);
    for (const w of WORDS) {
      const d = compile(FN(`  return ${w};\n`)).diagnostics;
      expect(d.length, w).toBeGreaterThan(0);
      expect(d.every((m) => m.includes('[M0]')), `${w}: ${d.join(' / ')}`).toBe(true);
    }
  });

  it('★ 12 語 × 値の束縛の 12 の位置で断る', () => {
    expect(Object.keys(VALUE_POSITIONS)).toHaveLength(12);
    for (const [where, form] of Object.entries(VALUE_POSITIONS)) {
      for (const w of WORDS) {
        const d = compile(form(w)).diagnostics;
        expect(d, `${w} / ${where}`).toHaveLength(1);
        expect(d[0], `${w} / ${where}`).toContain(OWN(w));
      }
    }
    // 断る場所は、その名前の字句
    expect(compile('export fn t(mint: number) -> number {\n  return 1;\n}\n').diagnostics).toEqual(only(1, 13, OWN('mint')));
    expect(compile(FN('  const gate = a;\n  return 1;\n')).diagnostics).toEqual(only(2, 9, OWN('gate')));
    expect(compile(FN('  const { type } = o;\n  return 1;\n', 'o: { readonly type: number }')).diagnostics).toEqual(only(2, 11, OWN('type')));
    expect(compile(FN('  const { k: from } = o;\n  return 1;\n', 'o: { readonly k: number }')).diagnostics).toEqual(only(2, 14, OWN('from')));
    expect(compile('fn fn() -> number {\n  return 1;\n}\n').diagnostics).toEqual(only(1, 4, OWN('fn')));
  });

  it('★ 型・import の名前の 4 つの位置でも断る', () => {
    for (const [where, form] of Object.entries(TYPE_POSITIONS)) {
      for (const w of WORDS) {
        const d = compile(form(w)).diagnostics;
        expect(d.length, `${w} / ${where}`).toBeGreaterThan(0);
        // `use { type 名前 }` は型だけの import の綴りなので、`use { type }` は「名前が要ります」が先に答える
        if (where === 'use の名前' && w === 'type') expect(d[0], `${w} / ${where}`).toContain('[M0] 名前が要ります');
        else expect(d[0], `${w} / ${where}`).toContain(OWN(w));
      }
    }
    // 型だけの import の名前の位置でも断る
    expect(compile('use { type mint } from "./host";\n').diagnostics).toEqual(only(1, 12, OWN('mint')));
  });

  it('対照: メンバ・鍵・型の中の引数の名前には、その語を書ける (生成物へそのまま写る)', () => {
    const cases: readonly (readonly [string, string])[] = [
      [FN('  return o.type;\n', 'o: { readonly type: number }'), '  return o.type;\n'],
      [FN('  const v = { type: 1, from: 2, of: 3, field: 4 };\n  return v.type + v.from;\n'), '  return v.type + v.from;\n'],
      [FN('  const { type: kind } = o;\n  return kind;\n', 'o: { readonly type: number }'), '  return kind;\n'],
      ['interface I {\n  readonly type: string;\n  readonly from: number;\n}\nexport fn t(i: I) -> string {\n  return i.type;\n}\n', '  return i.type;\n'],
      ['interface L {\n  readonly add: (target: string, type: string) => void;\n}\nexport fn t(l: L) -> L {\n  return l;\n}\n', '  return l;\n'],
    ];
    for (const [src, want] of cases) {
      const r = compile(src);
      expect(r.diagnostics, src).toEqual([]);
      expect(r.emitted, src).toContain(want);
      expect(shapeMismatch('src/x/m0.mamori', src, r.emitted), src).toEqual([]);
    }
  });

  it('対照: その語を含むだけの名前・JavaScript の予約語 (0.40 の文で断る) は、この断りではない', () => {
    for (const name of ['types', 'fromValue', 'minted', 'gateway', 'useful', 'fnName', 'field1']) {
      expect(compile(FN(`  const ${name} = a;\n  return ${name};\n`)).diagnostics, name).toEqual([]);
    }
    const d = compile(FN('  const return = a;\n  return 1;\n')).diagnostics;
    expect(d).toHaveLength(1);
    expect(d[0]).toContain('JavaScript の予約語');
    expect(d[0]).not.toContain('Mamori の語です');
  });
});
