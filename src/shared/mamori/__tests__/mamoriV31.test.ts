import { describe, expect, it } from 'vitest';
import { compileProject, formatDiagnostic } from '../compile';
import { parse } from '../parser';
import { inspectEmitted } from './mamoriInspect';
import { shapeMismatch } from './mamoriShape';

/*
 * **Mamori 0.31 —— `satisfies` (MG-065)。** 足す前に破った (その途中で T-260 —— 型の綴りに式を隠す穴 —— が見つかり、先に塞いだ)。
 *
 * TypeScript の `式 satisfies 型` は「式の型を絞らずに、型を満たすことだけを検める」演算子で、実行時には何も残らない。
 * 足し方は、要る所 (表の定数 `const TABLE = { … } satisfies Record<string, Rule>;`) だけに狭めた:
 *   ① **const の初期値の末尾にだけ**付けられる。式の途中の演算子ではない —— 値を包む新しい種類の式を作ると、その包みが
 *      inert (計算した鍵の添字の結果)・危ない口の名前・印の判定を覆う道になる (検査器は式の種類ごとに運び方を決めている)
 *   ② 束縛の印・inert・数・「この関数で作った入れ物」の判定は**初期値の式だけ**から決まる (`satisfies` の型は触れない)
 *   ③ 型に印は置けない (M4) —— 印を綴れる場所を増やさない
 *   ④ `let` には付けられない (後から別の値を入れられる)
 *   ⑤ 型は宣言の位置の型で、型の文法 (T-260) をそのまま通る
 *   ⑥ 生成物では初期値を関係演算子より強い物まで括ってから付ける (TypeScript の `satisfies` は関係演算子の強さ)
 */
const PRE = 'export vetted VU = "u";\nextern sink global shell;\nexport gate fn okUrl(raw: string) -> VU | null {\n  if (raw.length > 0) { return mint VU(raw); }\n  return null;\n}\n'
  + 'export sink fn go(u: VU) -> void {\n  shell.openExternal(u);\n}\n';
const SIG = 'n: number, m: number, raw: string, xs: number[], k: string';
const f = (body: string): string => `${PRE}export fn f(${SIG}) -> unknown {\n${body}\n}\n`;
const PATH = 'src/x/m0.mamori';
const EXTERNS = new Set(['shell']);

function diag(source: string): string[] {
  const r = compileProject([{ path: PATH, source }]);
  return r.ok ? [] : r.diagnostics.map(formatDiagnostic);
}
function ts(source: string): string {
  const r = compileProject([{ path: PATH, source }]);
  if (!r.ok) throw new Error(r.diagnostics.map(formatDiagnostic).join('\n'));
  return [...r.outputs.values()][0]!;
}

describe('0.31 satisfies (const の初期値の末尾だけ)', () => {
  it('★ 印の型は satisfies で名乗れない (M4)・名乗っても束縛は印を持たない', () => {
    const d = diag(f('  const u = raw satisfies VU;\n  go(u);\n  return u;')).join('\n');
    expect(d).toMatch(/M4.*`satisfies` の型に印 VU は置けません/);
    // 印の無い値は、satisfies が何と言っても印つきの口へ渡せない
    expect(d).toMatch(/M4.*go の引数 1 は印 VU を持つ値だけ/);
    // 印を含む綴り (和・型引数の中) も同じ
    expect(diag(f('  const u = okUrl(raw) satisfies VU | null;\n  return u;')).join('\n')).toMatch(/M4.*印 VU/);
    expect(diag(f('  const us = [raw] satisfies Array<VU>;\n  return us;')).join('\n')).toMatch(/M4.*印 VU/);
    expect(diag(`${PRE}const U = "x" satisfies VU;\n`).join('\n')).toMatch(/M4.*印 VU/);
  });

  it('★ 束縛の印は初期値の式だけから決まる (satisfies の型は印を足しも消しもしない)', () => {
    // 印を持たない値 + 何を名乗っても → 印なし
    expect(diag(f('  const u = raw satisfies string;\n  go(u);\n  return u;')).join('\n')).toMatch(/M4.*go の引数 1/);
    // gate の戻り値は、satisfies を付けても印を運ぶ (null を除いてから口へ渡せる)
    expect(diag(f('  const u = okUrl(raw) satisfies unknown;\n  if (u === null) { return null; }\n  go(u);\n  return 1;'))).toEqual([]);
  });

  it('★ inert (計算した鍵の添字の結果) は satisfies を付けても inert のまま (呼べない・包めない)', () => {
    expect(diag(f('  const g = xs[k] satisfies unknown;\n  return g();')).join('\n')).toMatch(/M6.*計算した鍵の添字の結果は呼び出せません/);
    expect(diag(f('  const g = xs[k] satisfies unknown;\n  return [g];')).join('\n')).toMatch(/M6.*計算した鍵の添字の結果/);
    expect(diag(f('  const g = xs[k] satisfies unknown;\n  return g.length;')).join('\n')).toMatch(/M6/);
  });

  it('★ 危ない口・宣言していない名前は satisfies を付けても初期値に置けない (初期値は他の式と同じ検めを通る)', () => {
    expect(diag(f('  const s = shell satisfies unknown;\n  return s;')).join('\n')).toMatch(/M2/);
    expect(diag(f('  const s = shell.openExternal(raw) satisfies unknown;\n  return s;')).join('\n')).toMatch(/M2/);
    expect(diag(f('  const s = evil satisfies unknown;\n  return s;')).join('\n')).toMatch(/M6.*evil/);
    expect(diag(`${PRE}const S = shell satisfies unknown;\n`).join('\n')).toMatch(/M2/);
  });

  it('★ 式の途中には置けない (値を包む演算子ではない)', () => {
    expect(diag(f('  return raw satisfies string;'))).not.toEqual([]);
    expect(diag(f('  return (raw satisfies string).length;'))).not.toEqual([]);
    expect(diag(f('  go(raw satisfies VU);\n  return 1;'))).not.toEqual([]);
    expect(diag(f('  const a = (raw satisfies string).length;\n  return a;'))).not.toEqual([]);
    expect(diag(f('  const a = [raw satisfies string];\n  return a;'))).not.toEqual([]);
    expect(diag(f('  const a = raw satisfies string satisfies unknown;\n  return a;'))).not.toEqual([]);
    expect(diag(f('  let a = 1;\n  a = 2 satisfies number;\n  return a;'))).not.toEqual([]);
    expect(diag(f('  const { length } = raw satisfies string;\n  return length;'))).not.toEqual([]);
  });

  it('★ let には付けられない (後から別の値を入れられる)', () => {
    expect(diag(f('  let a = 1 satisfies number;\n  return a;')).join('\n')).toMatch(/M0.*`satisfies` は const の初期値の末尾にだけ付けられます/);
    expect(diag(`${PRE}let a: number = 1 satisfies number;\n`)).not.toEqual([]);
  });

  it('★ 型は型の文法を通る (式・2 つ目の束縛を隠せない · T-260)', () => {
    const NOT_A_TYPE = /M0.*型の綴りが 1 つの型として読めません/;
    expect(diag(f('  const a = 1 satisfies number, okUrl = 1;\n  return a;'))).not.toEqual([]);
    expect(diag(f('  const a = 1 satisfies number, b;\n  return a;')).join('\n')).toMatch(NOT_A_TYPE);
    expect(diag(f('  const a = 1 satisfies m ? shell.openExternal(raw) : n;\n  return a;'))).not.toEqual([]);
    expect(diag(f('  const a = 1 satisfies number && go(raw);\n  return a;'))).not.toEqual([]);
    expect(diag(f('  const a = 1 satisfies;\n  return a;'))).not.toEqual([]);
  });

  it('許す形: 表の定数・関数の型・typeof・宣言した型と併せる・名前としての satisfies', () => {
    expect(diag(`${PRE}type Rule = { max: number };\nexport const TABLE = { a: { max: 1 }, b: { max: 2 } } satisfies Record<string, Rule>;\n`)).toEqual([]);
    expect(diag(`${PRE}const FNS = { a: (p: string) => p } satisfies Record<string, (p: string) => string>;\n`)).toEqual([]);
    expect(diag(f('  const a = [1, 2] satisfies readonly number[];\n  return a;'))).toEqual([]);
    expect(diag(f('  const a = n satisfies typeof m;\n  return a;'))).toEqual([]);
    expect(diag(f('  const a: number = n satisfies number;\n  return a;'))).toEqual([]);
    // 式の直後に名前は続かないので、`satisfies` は予約語ではない (名前として使える)
    expect(diag(f('  const satisfies = 1;\n  const b = satisfies satisfies number;\n  return b;'))).toEqual([]);
  });

  it('数・「この関数で作った入れ物」の判定も初期値の式から (satisfies を付けても変わらない)', () => {
    // 数と分かる初期値は添字の鍵に使える
    expect(diag(f('  const i = 1 satisfies number;\n  return xs[i] + 1;'))).toEqual([]);
    // 文字列の初期値は、number を満たすと書いても数にならない (添字の鍵に使えない)
    expect(diag(f('  const i = k satisfies number;\n  return xs[i] + 1;')).join('\n')).toMatch(/M6.*添字/);
    // この関数で作った配列は書き換えられる
    expect(diag(f('  const a = [] satisfies number[];\n  a.push(1);\n  return a;'))).toEqual([]);
  });
});

describe('0.31 satisfies の構文木と変換', () => {
  it('構文木: 束縛が satisfies の型を持つ (無ければ null)', () => {
    const m = parse(PATH, 'const A = 1 satisfies number;\nconst B = 2;\nfn g() -> number {\n  const c = 3 satisfies number;\n  const d = 4;\n  return c + d;\n}\n');
    const [a, b, g] = m.items;
    expect(a!.kind === 'const' && a.satisfies?.text).toBe('number');
    expect(b!.kind === 'const' && b.satisfies).toBe(null);
    if (g!.kind !== 'fn') throw new Error('fn でない');
    const [c, d] = g.body;
    expect(c!.kind === 'let' && c.satisfies?.text).toBe('number');
    expect(d!.kind === 'let' && d.satisfies).toBe(null);
  });

  it('そのまま出る (字面・呼び出し・名前は括らない)', () => {
    expect(ts(`${PRE}export const T = { a: 1 } satisfies Record<string, number>;\n`)).toContain('export const T = { a: 1 } satisfies Record<string, number>;');
    expect(ts(f('  const a = [1, 2] satisfies readonly number[];\n  return a;'))).toContain('const a = [1, 2] satisfies readonly number[];');
    expect(ts(f('  const a = okUrl(raw) satisfies unknown;\n  return a;'))).toContain('const a = okUrl(raw) satisfies unknown;');
    expect(ts(f('  const a: number = n + m satisfies number;\n  return a;'))).toContain('const a: number = n + m satisfies number;');
    expect(ts(f('  const a = -n satisfies number;\n  return a;'))).toContain('const a = -n satisfies number;');
  });

  it('★ 関係演算子以下の初期値は括ってから付ける (TypeScript の satisfies は関係演算子の強さ)', () => {
    expect(ts(f('  const a = n || m satisfies number;\n  return a;'))).toContain('const a = (n || m) satisfies number;');
    expect(ts(f('  const a = n < m satisfies boolean;\n  return a;'))).toContain('const a = (n < m) satisfies boolean;');
    expect(ts(f('  const a = n === m satisfies boolean;\n  return a;'))).toContain('const a = (n === m) satisfies boolean;');
    expect(ts(f('  const a = n > 0 ? n : m satisfies number;\n  return a;'))).toContain('const a = (n > 0 ? n : m) satisfies number;');
    expect(ts(f('  const a = (x: number) => x satisfies (x: number) => number;\n  return a;'))).toContain('const a = ((x: number) => x) satisfies (x: number) => number;');
    expect(ts(f('  const a = "k" in xs satisfies boolean;\n  return a;'))).toContain(`const a = ('k' in xs) satisfies boolean;`.replace(/'/g, '"'));
  });

  it('satisfies の無い束縛の生成物は 0.30 までと変わらない', () => {
    const out = ts(f('  const a = n || m;\n  const b = [1];\n  return [a, b];'));
    expect(out).toContain('const a = n || m;');
    expect(out).toContain('const b = [1];');
    expect(out).not.toContain('satisfies');
  });

  it('生成物に穴が無い・木の形も一致する (独立の判定)', () => {
    const src = f('  const t = { a: n < m, b: [raw] } satisfies { a: boolean; b: string[] };\n  const c = n < m satisfies boolean;\n  return [t, c];');
    const out = ts(src);
    expect(inspectEmitted('x.ts', out, EXTERNS)).toEqual([]);
    expect(shapeMismatch(PATH, src, out)).toEqual([]);
  });

  it('★ 独立の判定は、const の初期値の末尾でない satisfies の生成物を落とす (手で書いた穴の生成物)', () => {
    const hole = (src: string): string => inspectEmitted('x.ts', src, EXTERNS).filter((h) => h.kind === 'hole').map((h) => h.reason).join('|');
    const NOT_ROOT = /`satisfies` が const の初期値の末尾でない所に在る/;
    expect(hole('export function f(raw: string) {\n  return (raw satisfies string).length;\n}\n')).toMatch(NOT_ROOT);
    expect(hole('export function f(raw: string) {\n  let a = raw satisfies string;\n  return a;\n}\n')).toMatch(NOT_ROOT);
    expect(hole('export function f(raw: string) {\n  const a = [raw satisfies string];\n  return a;\n}\n')).toMatch(NOT_ROOT);
    // 対照: const の初期値の末尾は落とさない
    expect(hole('export function f(raw: string) {\n  const a = raw satisfies string;\n  return a;\n}\n')).toBe('');
    expect(hole('export const T = { a: 1 } satisfies Record<string, number>;\n')).toBe('');
  });
});
