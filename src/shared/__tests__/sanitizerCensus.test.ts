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
 * **パス 202 で判定を関数本体へ広げた。** それまでは「同じ行で有限を見ているか」
 * しか判定しておらず、数行上で確かめてから下で使う形を偽陽性として挙げていた
 * (`freee.ts:111` はパス 153 の `Number.isFinite(d.amount)` が 6 行上・
 * `depreciation.ts:229` は 2 行上)。
 *
 * 広げた後の実測 (2026-09-13):
 *
 * | | 件数 |
 * | --- | ---: |
 * | 裸の `Math.max(0, 参照)` (コメント除く) | 49 |
 * | うち関数本体でも有限を確かめていない | 31 |
 * | **そのうち仮引数** | **0** |
 * | アローの仮引数 (走査が見られない) | 7 |
 * | `const` / `let` で束縛済みの局所値 | 23 |
 *
 * **仮引数の残りは 0 件。** 残る 31 件はアローの仮引数 7 件
 * (`FinancialAnalysis` の円グラフ ×2・`villageData`・`BusinessPage`・`KpiPage`・
 * `invoiceTax`) と局所値 23 件で、いずれも消毒済みの値から導いた物・作図の座標・
 * 同梱の静的表だが、**「構造上あり得ない」ことを示したわけではなく分類しただけ**
 * である。アローを見られる走査にするか、境界で消毒する形 (`saneFundamentals` の
 * ような) へ寄せるかは次のパスの仕事。
 *
 * **走査を直したら、その走査で出した数も測り直す** —— パス 201 の散文は
 * 「27 件 / うちアロー 10 件」と書いており、どちらも外れていた。
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

/**
 * `name` の有限性を `body` の中で確かめているか。
 *
 * **同じ行ではなく関数本体を見る。** パス 201 の初版は同じ行だけを見ており、
 * 数行上で `!Number.isFinite(x)` を確かめてから下で `Math.max(0, x)` と書く形
 * (`freee.ts` の取引金額・`depreciation.ts` の月数) を**偽陽性として挙げていた**。
 * 名前を指定して探すので「別の欄を確かめている」では通らない。
 */
export function establishesFinite(body: string, name: string): boolean {
  const n = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(
    `(?:Number\\.isFinite\\(\\s*${n}\\b|isFiniteNumber\\(\\s*${n}\\b`
    + `|nonNeg\\(\\s*${n}\\b|finiteOr\\w*\\(\\s*${n}\\b)`,
  ).test(body);
}

/** `openParen` の位置から関数本体 (`{ … }`) を切り出す。 */
export function functionBody(src: string, openParen: number): string {
  let i = openParen;
  let depth = 0;
  for (; i < src.length; i++) {
    const c = src[i];
    if (c === '(') depth++;
    else if (c === ')') {
      depth--;
      if (depth === 0) {
        i++;
        break;
      }
    }
  }
  while (i < src.length && src[i] !== '{') i++;
  const start = i;
  depth = 0;
  for (; i < src.length; i++) {
    const c = src[i];
    if (c === '{') depth++;
    else if (c === '}') {
      depth--;
      if (depth === 0) {
        i++;
        break;
      }
    }
  }
  return src.slice(start, i);
}

/** `idx` を含む関数の仮引数名と本体。直前の `function NAME(` から採る。 */
export function enclosingFunction(src: string, idx: number): { readonly params: ReadonlySet<string>; readonly body: string } {
  const heads = [...src.slice(0, idx).matchAll(/(?:export\s+)?function\s+[A-Za-z_$][\w$]*\s*\(/g)];
  const head = heads[heads.length - 1];
  if (head === undefined) return { params: new Set<string>(), body: '' };
  const open = head.index + head[0].length - 1;
  const { parts } = splitArgs(src, open + 1);
  const names = new Set<string>();
  for (const p of parts) {
    const id = p.replace(/^readonly\s+/, '').match(/^([A-Za-z_$][\w$]*)/);
    if (id?.[1] !== undefined) names.add(id[1]);
  }
  return { params: names, body: functionBody(src, open) };
}

export interface BareMaxHit {
  readonly file: string;
  readonly line: number;
  readonly arg: string;
}

/** 素の `Math.max(0, 仮引数)` を数える (床の側)。 */
export function findBareMaxSanitizers(source: string, file: string): readonly BareMaxHit[] {
  return findBareClamps(source, file, /Math\.max\(\s*0\s*,/g, (parts) => (parts.length === 1 ? (parts[0] ?? '') : null));
}

/**
 * 素の `Math.min(<リテラル/定数>, 仮引数)` を数える (天井の側)。
 *
 * **第 1 引数がリテラルか全部大文字の定数のときだけ見る。** そうでない
 * `Math.min(<計算した値>, r.<上限>)` は**裸の参照のほうが上限**で、
 * その上限は `parameters.ts` の台帳が `Number.isFinite` と min/max の両方で
 * 検証している (`parameterIssue` → `sanitizeParameterOverrides` →
 * `resolveParameters`)。台帳経由の上限は非有限になり得ないので、
 * 免除を並べるのではなく**規則の側で見ない**ことにしてある (パス 202 で実測)。
 */
export function findBareMinSanitizers(source: string, file: string): readonly BareMaxHit[] {
  const CAP = /^(?:\d[\d_]*(?:\.\d+)?|[A-Z][A-Z0-9_]*)$/;
  return findBareClamps(source, file, /Math\.min\(/g, (parts) => {
    if (parts.length !== 2) return null;
    if (!CAP.test(parts[0] ?? '')) return null;
    return parts[1] ?? '';
  });
}

/** 床と天井で共有する走査。`pick` が「消毒される値」を選ぶ。 */
function findBareClamps(
  source: string,
  file: string,
  re: RegExp,
  pick: (parts: readonly string[]) => string | null,
): readonly BareMaxHit[] {
  const hits: BareMaxHit[] = [];
  const lines = source.split('\n');
  let m: RegExpExecArray | null;
  while ((m = re.exec(source)) !== null) {
    const { parts } = splitArgs(source, m.index + m[0].length);
    const arg = pick(parts);
    if (arg === null) continue;
    if (!BARE.test(arg)) continue; // 式の床 (a - b) は上流の責務
    const line = source.slice(0, m.index).split('\n').length;
    const text = lines[line - 1] ?? '';
    if (/^\s*(\/\/|\*|\/\*)/.test(text)) continue; // 散文の中の引用
    const { params, body } = enclosingFunction(source, m.index);
    const root = (arg.split(/\??\./)[0] ?? '');
    if (!params.has(root)) continue; // 局所値は対象外
    if (establishesFinite(body, arg)) continue; // 同じ関数で有限を確かめている
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

  it('★ 実物: 仮引数を素の Math.min(<定数>, …) で天井に当てる箇所は台帳の外に無い', () => {
    const found: string[] = [];
    for (const f of files) {
      const rel = path.relative(REPO_ROOT, f);
      if (rel === CANONICAL) continue;
      for (const h of findBareMinSanitizers(readOriginalSource(f), rel)) {
        if (BARE_MAX_ALLOWED[`${rel}:${h.arg}`] !== undefined) continue;
        found.push(`${rel}:${h.line}  Math.min(…, ${h.arg}) の ${h.arg} が有限か誰も見ていない`);
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

  it('対照: 数行上で有限を確かめていれば検出されない (同じ行だけ見ない)', () => {
    const sample = [
      'export function f(months: number): number {',
      '  if (!Number.isFinite(months) || months <= 0) return 0;',
      '  const capped = Math.min(12, months);',
      '  return capped;',
      '}',
    ].join('\n');
    expect(findBareMinSanitizers(sample, 'sample.ts')).toEqual([]);
    expect(findBareMaxSanitizers(sample.replace('Math.min(12, months)', 'Math.max(0, months)'), 'sample.ts')).toEqual([]);
  });

  it('対照: **別の欄**の有限を確かめても、その欄は検出される (名前で照合する)', () => {
    const sample = [
      'export function f(a: number, b: number): number {',
      '  if (!Number.isFinite(a)) return 0;',
      '  return Math.max(0, b);',
      '}',
    ].join('\n');
    expect(findBareMaxSanitizers(sample, 'sample.ts').map((h) => h.arg)).toEqual(['b']);
  });

  it('対照: Math.min の天井が定数なら、消毒されない値は検出される', () => {
    const sample = 'export function f(months: number): number {\n  return Math.min(12, months);\n}';
    expect(findBareMinSanitizers(sample, 'sample.ts').map((h) => h.arg)).toEqual(['months']);
    const withConst = 'export function f(m: number): number {\n  return Math.min(MAX_MONTHS, m);\n}';
    expect(findBareMinSanitizers(withConst, 'sample.ts').map((h) => h.arg)).toEqual(['m']);
  });

  it('対照: Math.min の第 1 引数が計算した値なら見ない (裸の参照は上限の側)', () => {
    // `Math.min(<計算した値>, r.<上限>)` —— 上限は台帳が有限を保証している
    const sample = 'export function f(bonus: number, r: R): number {\n  return Math.min(bonus * 2, r.cap);\n}';
    expect(findBareMinSanitizers(sample, 'sample.ts')).toEqual([]);
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
