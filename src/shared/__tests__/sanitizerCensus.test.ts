/**
 * 消毒の綴りを 1 つに保つ (パス 201)。
 *
 * ## 測った事実
 *
 * `Math.max` は消毒ではない:
 *
 * | 式 | 結果 |
 * | --- | --- |
 * | `Math.max(0, NaN)` | **`NaN`** |
 * | `Math.max(0, Infinity)` | `Infinity` |
 * | `Math.min(1, NaN)` | **`NaN`** |
 * | `Math.max(0, -Infinity)` | `0` |
 *
 * そして NaN は**比較のどちら側にも落ちない**:
 *
 * | 式 | 結果 |
 * | --- | --- |
 * | `NaN <= 0` | `false` |
 * | `NaN > 0` | `false` |
 * | `NaN === 0` | `false` |
 *
 * この 2 つが噛み合うと、**関門を 2 つ通り抜ける**。リポジトリ全体が
 * 「算定できないか」を `if (x <= 0) return { …: null }` で表しており
 * (パス 52 / 54 / 84 / 90 / 91 / 122 で確立した `null` の道)、
 * `x` が NaN だとその枝も**通らない** —— つまり「算定不能」でもなく
 * 「算定できた」でもない第 3 の状態が、`null` ではなく NaN として
 * 画面まで出る。実測 (2026-09-13):
 *
 * ```
 * calcRealEstateYield(monthlyRent=10万, purchasePrice=NaN)
 *   直す前: { grossYieldPct: NaN, … }   ← パス 54 の null の道を素通り
 *   直した後: { grossYieldPct: null, … } ← 「算定不能」として画面に届く
 * ```
 *
 * ## 直した形
 *
 * 消毒は `src/shared/num.ts` の {@link nonNeg} **1 つだけ**。
 * 仮引数をそのまま消毒していた 110 箇所 (23 ファイル) をそこへ寄せた。
 * 入口で NaN を 0 に倒せば、**既に書かれている `<= 0` の枝がそのまま正しく鳴る** ——
 * 関門を新しく足すのではなく、既存の関門に値を届ける形にしてある。
 *
 * ## この検査が留めるもの
 *
 * 1. 仮引数を素の `Math.max(0, …)` で消毒し直す箇所が増えないこと
 * 2. `nonNeg` という名前の**局所定義**が増えないこと
 *    (2026-09-13 まで 3 つ在り、`funding.ts` の 1 つだけが有限を見ていなかった)
 * 3. 規則そのものが生きていること (標本に当てて鳴ることを確かめる)
 *
 * ## この走査が**見られない**もの (2026-09-13 実測)
 *
 * 仮引数の判定は直前の `function NAME(` から採る。**アロー関数の仮引数は
 * 見られない** —— リポジトリに AST パーサが無いので、`(s) => … Math.max(0, s.value)`
 * のような形では「s が仮引数である」ことを導けない (パス 200 の
 * `timestampPrintCensus` と同じ限界)。
 *
 * 走査後に残る裸の `Math.max(0, 参照)` は **27 件**で、うち **10 件**が
 * アローの仮引数と名前が一致する。中身を見た限りいずれも
 *
 * - 同じ関数の**数行上**で有限を見ている (`freee.ts:111` はパス 153 の
 *   `Number.isFinite(d.amount)` が 6 行上に在る —— 同じ行しか見ない走査の**偽陽性側の取り逃し**)
 * - すでに消毒済みの値から導いた局所値 (`taxDeductions` / `taxCalc` / `invoiceTax` ほか)
 * - 作図の座標 (`charts.ts` の `t`・`KpiPage` の棒の高さ)・同梱の静的表 (`villageData`)
 *
 * のいずれかだが、**「構造上あり得ない」ことを示したわけではなく、目で見て
 * 分類しただけである。** アローを見られる走査にするか、境界で消毒する形
 * (`saneFundamentals` のような) へ寄せるかは次のパスの仕事。
 */

import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { nonNeg } from '../num';
import { readOriginalDirEntries, readOriginalSource } from './originalSource';

const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');
const SRC = path.join(REPO_ROOT, 'src');

/** 消毒の正典。ここ以外に同名の定義を置かない。 */
const CANONICAL = path.join('src', 'shared', 'num.ts');

/**
 * 素の `Math.max(0, 仮引数)` を許す箇所。**理由つきで登録する。**
 *
 * 空で出発する —— 免除を足すときは「なぜ有限を見なくてよいか」を
 * ここに書かせるため。`Math.max(0, a - b)` のような**式**の床は
 * 走査の対象外 (仮引数そのものの消毒ではないので、有限性は上流の責務)。
 */
const BARE_MAX_ALLOWED: Readonly<Record<string, string>> = {};

/**
 * `nonNeg` という名前の局所定義を許す箇所。**理由つきで登録する。**
 *
 * `balanceSheet.ts` の「断る」検証子は 2026-09-13 に `requireNonNegative` へ
 * 改名した —— 同じ名前で**契約が違う** (消毒は 0 に倒す / あちらは投げる) のは
 * 読み手が取り違えるため。
 */
const LOCAL_NONNEG_ALLOWED: Readonly<Record<string, string>> = {};

function walk(dir: string, out: string[] = []): string[] {
  for (const e of readOriginalDirEntries(dir)) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === '__tests__' || e.name === 'node_modules') continue;
      walk(p, out);
    } else if (/\.tsx?$/.test(e.name)) out.push(p);
  }
  return out;
}

/** `Math.max(0,` の直後から、括弧の釣り合いで引数を切り出す。 */
export function splitArgs(src: string, from: number): { readonly parts: readonly string[]; readonly end: number } {
  let depth = 0;
  const parts: string[] = [];
  let cur = '';
  let end = from;
  for (let i = from; i < src.length; i++) {
    const c = src[i] ?? '';
    if ('([{'.includes(c)) depth++;
    if (')]}'.includes(c)) {
      if (depth === 0) {
        end = i;
        break;
      }
      depth--;
    }
    if (c === ',' && depth === 0) {
      parts.push(cur);
      cur = '';
      continue;
    }
    cur += c;
  }
  parts.push(cur);
  return { parts: parts.map((s) => s.trim()), end };
}

/** 識別子 / ドット連結のみ (演算子を含まない) か。 */
const BARE = /^[A-Za-z_$][\w$]*(?:\??\.[A-Za-z_$][\w$]*)*$/;
/** 同じ行で有限を見ているか。 */
const SAME_LINE_GUARD = /Number\.isFinite|isFiniteNumber|\bisFinite\(|nonNeg\(|finiteOr/;

/** `idx` を含む関数の仮引数名。直前の `function NAME(` から採る。 */
export function enclosingParams(src: string, idx: number): ReadonlySet<string> {
  const heads = [...src.slice(0, idx).matchAll(/(?:export\s+)?function\s+[A-Za-z_$][\w$]*\s*\(/g)];
  const head = heads[heads.length - 1];
  if (head === undefined) return new Set<string>();
  const { parts } = splitArgs(src, head.index + head[0].length);
  const names = new Set<string>();
  for (const p of parts) {
    const id = p.replace(/^readonly\s+/, '').match(/^([A-Za-z_$][\w$]*)/);
    if (id?.[1] !== undefined) names.add(id[1]);
  }
  return names;
}

export interface BareMaxHit {
  readonly file: string;
  readonly line: number;
  readonly arg: string;
}

/** 素の `Math.max(0, 仮引数)` を数える。 */
export function findBareMaxSanitizers(source: string, file: string): readonly BareMaxHit[] {
  const hits: BareMaxHit[] = [];
  const lines = source.split('\n');
  const re = /Math\.max\(\s*0\s*,/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(source)) !== null) {
    const { parts } = splitArgs(source, m.index + m[0].length);
    if (parts.length !== 1) continue; // Math.max(0, a, b) は床ではなく最大値
    const arg = parts[0] ?? '';
    if (!BARE.test(arg)) continue; // 式の床 (a - b) は上流の責務
    const line = source.slice(0, m.index).split('\n').length;
    const text = lines[line - 1] ?? '';
    if (/^\s*(\/\/|\*|\/\*)/.test(text)) continue; // 散文の中の引用
    if (SAME_LINE_GUARD.test(text)) continue; // 同じ行で有限を見ている
    const root = (arg.split(/\??\./)[0] ?? '');
    if (!enclosingParams(source, m.index).has(root)) continue; // 局所値は対象外
    hits.push({ file, line, arg });
  }
  return hits;
}

/** `nonNeg` という名前の局所定義を数える。 */
export function findLocalNonNeg(source: string): readonly number[] {
  const out: number[] = [];
  const re = /(?:function|const)\s+nonNeg\b/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(source)) !== null) out.push(source.slice(0, m.index).split('\n').length);
  return out;
}

describe('消毒の綴りは 1 つ (Math.max(0, NaN) は NaN)', () => {
  const files = walk(SRC);

  it('★ 実物: 仮引数を素の Math.max(0, …) で消毒し直す箇所は台帳の外に無い', () => {
    const found: string[] = [];
    for (const f of files) {
      const rel = path.relative(REPO_ROOT, f);
      if (rel === CANONICAL) continue; // nonNeg 自身の実装
      for (const h of findBareMaxSanitizers(readOriginalSource(f), rel)) {
        if (BARE_MAX_ALLOWED[`${rel}:${h.arg}`] !== undefined) continue;
        found.push(`${rel}:${h.line}  Math.max(0, ${h.arg}) → nonNeg(${h.arg})`);
      }
    }
    expect(found).toEqual([]);
  });

  it('★ 実物: nonNeg という名前の定義は shared/num.ts だけ', () => {
    const found: string[] = [];
    for (const f of files) {
      const rel = path.relative(REPO_ROOT, f);
      if (rel === CANONICAL) continue;
      if (LOCAL_NONNEG_ALLOWED[rel] !== undefined) continue;
      for (const line of findLocalNonNeg(readOriginalSource(f))) found.push(`${rel}:${line}`);
    }
    expect(found).toEqual([]);
  });

  it('台帳は空で出発する (免除を足すときは理由を書く)', () => {
    expect(Object.keys(BARE_MAX_ALLOWED)).toEqual([]);
    expect(Object.keys(LOCAL_NONNEG_ALLOWED)).toEqual([]);
  });

  // ── 規則が生きていること (鳴らない検査は「合格」ではない) ──────────────

  it('対照: 仮引数の素の Math.max(0, …) は検出される', () => {
    const sample = [
      'export function f(rate: number): number {',
      '  const r = Math.max(0, rate);',
      '  return r;',
      '}',
    ].join('\n');
    expect(findBareMaxSanitizers(sample, 'sample.ts').map((h) => h.arg)).toEqual(['rate']);
  });

  it('対照: input.field の形も検出される', () => {
    const sample = 'export function f(input: I): number {\n  return Math.max(0, input.dutyRate);\n}';
    expect(findBareMaxSanitizers(sample, 'sample.ts').map((h) => h.arg)).toEqual(['input.dutyRate']);
  });

  it('対照: 式の床 (a - b) は検出されない (有限性は上流の責務)', () => {
    const sample = 'export function f(a: number, b: number): number {\n  return Math.max(0, a - b);\n}';
    expect(findBareMaxSanitizers(sample, 'sample.ts')).toEqual([]);
  });

  it('対照: 同じ行で有限を見ていれば検出されない', () => {
    const sample = 'export function f(x: number): number {\n  return Number.isFinite(x) ? Math.max(0, x) : 0;\n}';
    expect(findBareMaxSanitizers(sample, 'sample.ts')).toEqual([]);
  });

  it('対照: 局所値は検出されない (仮引数だけを見る)', () => {
    const sample = 'export function f(a: number): number {\n  const local = a * 2;\n  return Math.max(0, local);\n}';
    expect(findBareMaxSanitizers(sample, 'sample.ts')).toEqual([]);
  });

  it('対照: 3 引数の Math.max は床ではないので検出されない', () => {
    const sample = 'export function f(a: number, b: number): number {\n  return Math.max(0, a, b);\n}';
    expect(findBareMaxSanitizers(sample, 'sample.ts')).toEqual([]);
  });

  it('対照: 局所 nonNeg の定義は 2 つの綴りとも検出される', () => {
    expect(findLocalNonNeg('function nonNeg(n: number) { return n; }')).toEqual([1]);
    expect(findLocalNonNeg('const nonNeg = (n: number) => n;')).toEqual([1]);
  });

  // ── Math.max / 比較の実際の振る舞いを事実として留める ──────────────────

  it('Math.max は消毒ではない (NaN はそのまま通る)', () => {
    expect(Math.max(0, NaN)).toBeNaN();
    expect(Math.min(1, NaN)).toBeNaN();
    expect(Math.max(0, Infinity)).toBe(Infinity);
    // 負の無限だけは 0 に落ちる —— だから「負値の床」としては動いて見える
    expect(Math.max(0, -Infinity)).toBe(0);
  });

  it('NaN は比較のどちら側にも落ちない (関門を素通りする理由)', () => {
    // **リテラルで書かない。** `NaN <= 0` と直に書くと tsc (TS2845) と
    // eslint (use-isnan) が畳んでしまい、検査が「定数の話」になる。
    // 変数に入れて**実行時**に比べることで、実際の関門が素通りされる
    // ことを測る (関門は変数で書かれているので、こちらが実物に近い)。
    const x: number = Number.NaN;
    expect(x <= 0).toBe(false);
    expect(x > 0).toBe(false);
    expect(x === 0).toBe(false);
    // 「どちらでもない」= 0 以下でも 0 超でもない、という言い方もできる
    expect(x <= 0 || x > 0).toBe(false);
  });

  it('nonNeg は非有限も負値も 0 に倒す (両方を見る)', () => {
    expect(nonNeg(NaN)).toBe(0);
    expect(nonNeg(Infinity)).toBe(0);
    expect(nonNeg(-Infinity)).toBe(0);
    expect(nonNeg(-1)).toBe(0);
    expect(nonNeg(undefined)).toBe(0);
    expect(nonNeg(0)).toBe(0);
    expect(nonNeg(1.5)).toBe(1.5);
  });
});
