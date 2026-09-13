/**
 * 非有限な入力を入口に当てて、**出てくる物が有限か・明示的に断るか**を測る (パス 203)。
 *
 * ## なぜ走査ではなく振る舞いを測るか
 *
 * パス 201 / 202 は走査 (`sanitizerCensus`) で「消毒の書き方」を留めた。それは
 * 綴りの規律には効くが、**到達可能性を見られない** —— 数行上で守っている形も、
 * 上流で消毒済みの局所値も、区別するには読むしかなかった。パス 202 は
 * 「比較だけの関門」49 件 (46 関数) を母集団として数え、**そのうち 1 件だけ**を
 * 実測で直して「残り 48 件を安全とは言わない」と書いた。
 *
 * **パス 203 でその 48 件を測ったら、機械的に呼べる 14 件のうち 14 件が
 * 非有限を返すか投げた。** 「分母のほとんどは無害だろう」という私の見立ては
 * 外れていた —— パス 198 の教訓 (「測る前に書いた severity は外れる」) が
 * そのまま当てはまる。
 *
 * 実測 (直す前・2026-09-13):
 *
 * | 入口 | 直す前 |
 * | --- | --- |
 * | `calcBaseIncomeTax(NaN)` | **TypeError で落ちる** (`bracket!.rate`) |
 * | `marginalIncomeTaxRate(NaN)` | **TypeError で落ちる** |
 * | `straightLineSchedule(NaN, 10)` | 10 年分すべて `NaN` の償却表 |
 * | `calcEarthquakeInsuranceDeduction(NaN)` | `{incomeTax: NaN, residentTax: NaN}` |
 * | `computeRunwayMonths(1e6, NaN)` | `NaN` か月 |
 * | `noBreakEvenNote(NaN, 10)` | 「10 期のうち **NaN 期**は…」という**文章** |
 * | `unrunnableSkillsNote(NaN)` | 「このうち **NaN 件**は実行できません」 |
 * | ほか 7 件 | `NaN` / `Infinity` |
 *
 * `calcBaseIncomeTax` の落ちる理由は残しておく価値がある: 速算表の `find` に
 * 「Infinity 上限ブラケットが必ず最後に在るので `bracket` は常に定義される」と
 * **コメントで書かれていた**。それは**有限な入力についてだけ成り立つ** ——
 * `NaN <= Infinity` は false なので `find` は `undefined` を返し、`!` が
 * 型検査器の異議を消していた。**前提を書いたコメントと、前提を消す `!` が
 * 並んでいるときは疑う。**
 *
 * ## 直し方は戻り値の契約で決まる
 *
 * | 契約 | 非有限のとき | 理由 |
 * | --- | --- | --- |
 * | `number` (金額・税額) | `0` (`nonNeg`) | 既に `<= 0` の枝が在り、そこへ届ける |
 * | `number \\| null` | **`null`** (`finiteOrNull`) | 「算定不能」の道が既に在る。0 は「0 である」という主張になる |
 * | 文 (`string \\| null` ほか) | 文を出さない | **NaN を文章に埋めない** |
 *
 * ## 走査が挙げなかった側も見る
 *
 * `noBreakEvenNote(missing, total)` は `if (missing <= 0)` しか持たないので
 * 走査は `missing` だけを挙げた。だが `total` も**文章に埋め込まれる** ——
 * `noBreakEvenNote(3, NaN)` は「NaN 期のうち 3 期は…」になる。
 * **だからこの検査は、各入口の数値の位置を 1 つずつ全部置き換える。**
 *
 * ## 守りが重なっている所がある (対照が鳴らなかった記録)
 *
 * `calcBaseIncomeTax` の入口の消毒**だけ**を外しても、この検査は落ちない ——
 * 下流の `floorTaxableThousand` が既に 0 に倒すため。つまりあの経路で
 * **荷重を持っているのは `floorTaxableThousand` 側の消毒**で、
 * `calcBaseIncomeTax` 自身のものは重ね着である。
 *
 * **鳴らない対照は「合格」ではなく、その対照についての報せ。** 両方を外すと
 * `TypeError` が戻り、`marginalIncomeTaxRate` (下流に守りが無い経路) は
 * 単独で外しても投げるようになる —— そこまで測って初めて「守られている」と言える。
 */

import { describe, expect, it } from 'vitest';

import { computeRunwayMonths } from '../../renderer/data/accounting';
import { noBreakEvenNote } from '../../renderer/data/kpiActuals';
import { acceptRateOf } from '../api/cursor';
import { straightLineAnnual, straightLineSchedule, proratedDepreciation } from '../depreciation';
import { monthlyPayment } from '../funding';
import { yearsToDouble } from '../savingsPlanning';
import { unrunnableSkillsNote } from '../skillIdentity';
import {
  calcBaseIncomeTax,
  calcConsumptionTax,
  calcResidentAdjustmentCredit,
  floorTaxableThousand,
  marginalIncomeTaxRate,
} from '../taxCalc';
import { roundRefund } from '../taxConsumptionSchedule';
import { calcEarthquakeInsuranceDeduction } from '../taxDeductions';

/** 非有限の 3 形。`-Infinity` も入れる —— `Math.max(0, -Infinity)` は 0 に落ちるので見逃しやすい。 */
const NON_FINITE: readonly number[] = [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY];

/**
 * 入口の台帳。`args` は正常な引数で、検査はその**各位置**を順に非有限へ置き換える。
 *
 * 新しい「比較だけで測れるかを決める」入口を足したら、ここにも足す
 * (下の ★ が走査と突き合わせる)。
 */
interface EntryPoint {
  readonly label: string;
  readonly args: readonly number[];
  readonly call: (...a: readonly number[]) => unknown;
}

const ENTRY_POINTS: readonly EntryPoint[] = [
  { label: 'computeRunwayMonths', args: [1_000_000, -100_000], call: (a, b) => computeRunwayMonths(a!, b!) },
  { label: 'noBreakEvenNote', args: [3, 10], call: (a, b) => noBreakEvenNote(a!, b!) },
  { label: 'acceptRateOf', args: [5, 20], call: (a, b) => acceptRateOf(a!, b!) },
  { label: 'straightLineAnnual', args: [1_000_000, 10], call: (a, b) => straightLineAnnual(a!, b!) },
  { label: 'straightLineSchedule', args: [1_000_000, 10], call: (a, b) => straightLineSchedule(a!, b!) },
  { label: 'proratedDepreciation', args: [120_000, 6], call: (a, b) => proratedDepreciation(a!, b!) },
  { label: 'monthlyPayment', args: [10_000_000, 0.02, 360], call: (a, b, c) => monthlyPayment(a!, b!, c!) },
  { label: 'yearsToDouble', args: [5], call: (a) => yearsToDouble(a!) },
  { label: 'unrunnableSkillsNote', args: [3], call: (a) => unrunnableSkillsNote(a!) },
  { label: 'floorTaxableThousand', args: [1_234_567], call: (a) => floorTaxableThousand(a!) },
  { label: 'calcBaseIncomeTax', args: [5_000_000], call: (a) => calcBaseIncomeTax(a!) },
  { label: 'marginalIncomeTaxRate', args: [5_000_000], call: (a) => marginalIncomeTaxRate(a!) },
  { label: 'calcConsumptionTax', args: [1_000_000, 0.1], call: (a, b) => calcConsumptionTax(a!, b!) },
  { label: 'calcResidentAdjustmentCredit', args: [1_500_000, 50_000], call: (a, b) => calcResidentAdjustmentCredit(a!, b!) },
  { label: 'roundRefund', args: [1_234.56], call: (a) => roundRefund(a!) },
  { label: 'calcEarthquakeInsuranceDeduction', args: [40_000], call: (a) => calcEarthquakeInsuranceDeduction(a!) },
];

/** 値の中に非有限な数、または "NaN" / "Infinity" を含む文が在れば、その説明を返す。 */
export function describeNonFinite(v: unknown, path = ''): string | null {
  if (typeof v === 'number') {
    return Number.isFinite(v) ? null : `${path || '戻り値'} = ${String(v)}`;
  }
  if (typeof v === 'string') {
    // **文章に NaN / Infinity が埋まっていないか。** 数として有限でも、
    // 文に書かれていれば利用者はそれを読む。
    const m = /NaN|Infinity/.exec(v);
    return m === null ? null : `${path || '戻り値'} の文に "${m[0]}" が入っている`;
  }
  if (Array.isArray(v)) {
    for (const [i, x] of v.entries()) {
      const r = describeNonFinite(x, `${path}[${i}]`);
      if (r !== null) return r;
    }
    return null;
  }
  if (v !== null && typeof v === 'object') {
    for (const [k, x] of Object.entries(v as Record<string, unknown>)) {
      const r = describeNonFinite(x, path === '' ? k : `${path}.${k}`);
      if (r !== null) return r;
    }
    return null;
  }
  return null;
}

describe('非有限な入力を入口に当てる (出てくる物は有限か、明示的に断るか)', () => {
  it('★ 実物: どの入口も、どの位置に非有限を入れても、非有限を返さず投げない', () => {
    const found: string[] = [];
    for (const ep of ENTRY_POINTS) {
      for (const [pos] of ep.args.entries()) {
        for (const bad of NON_FINITE) {
          const args = ep.args.map((a, i) => (i === pos ? bad : a));
          let out: unknown;
          try {
            out = ep.call(...args);
          } catch (e) {
            found.push(`${ep.label}(第${pos + 1}引数=${String(bad)}) が投げる: ${e instanceof Error ? e.message : String(e)}`);
            continue;
          }
          const why = describeNonFinite(out);
          if (why !== null) found.push(`${ep.label}(第${pos + 1}引数=${String(bad)}) → ${why}`);
        }
      }
    }
    expect(found).toEqual([]);
  });

  it('★ 正常な引数では答えが変わっていない (消毒は有限の値を素通りさせるだけ)', () => {
    // 直す前後で動いてはいけない値を明示的に留める。消毒が「ついでに何かを
    // 変えていない」ことの対照 —— これが無いと「全部 0 にした」でも ★ が通る。
    expect(floorTaxableThousand(1_234_567)).toBe(1_234_000);
    expect(marginalIncomeTaxRate(5_000_000)).toBe(0.2);
    expect(calcConsumptionTax(1_000_000, 0.1)).toBe(100_000);
    expect(straightLineAnnual(1_000_000, 10)).toBe(100_000);
    expect(monthlyPayment(10_000_000, 0.02, 360)).toBe(36_962);
    expect(yearsToDouble(5)).toBe(14.4);
    expect(acceptRateOf(5, 20)).toBe(25);
    expect(computeRunwayMonths(1_000_000, -100_000)).toBe(10);
    expect(roundRefund(1_234.56)).toBe(1_234);
    expect(calcEarthquakeInsuranceDeduction(40_000)).toEqual({ incomeTax: 40_000, residentTax: 20_000 });
    expect(unrunnableSkillsNote(3)).toContain('3 件');
    expect(noBreakEvenNote(3, 10)).toContain('10 期のうち 3 期');
  });

  it('契約ごとの倒し方 — 金額は 0・算定不能は null・文は出さない', () => {
    // number (金額・税額) → 0
    expect(floorTaxableThousand(Number.NaN)).toBe(0);
    expect(calcBaseIncomeTax(Number.NaN)).toBe(0);
    expect(calcConsumptionTax(Number.NaN)).toBe(0);
    // number | null → null (「0 である」と言わない)
    expect(computeRunwayMonths(Number.NaN, -100_000)).toBeNull();
    expect(computeRunwayMonths(1_000_000, Number.NaN)).toBeNull();
    expect(acceptRateOf(5, Number.NaN)).toBeNull();
    expect(yearsToDouble(Number.NaN)).toBeNull();
    // 文 → 出さない
    expect(noBreakEvenNote(Number.NaN, 10)).toBeNull();
    expect(noBreakEvenNote(3, Number.NaN)).toBeNull();
    expect(unrunnableSkillsNote(Number.NaN)).toBeUndefined();
  });

  // ── describeNonFinite そのものが鳴ること (鳴らない検査は報せでしかない) ──

  it('対照: 非有限な数を見つける', () => {
    expect(describeNonFinite(Number.NaN)).toBe('戻り値 = NaN');
    expect(describeNonFinite(Number.POSITIVE_INFINITY)).toBe('戻り値 = Infinity');
    expect(describeNonFinite(Number.NEGATIVE_INFINITY)).toBe('戻り値 = -Infinity');
    expect(describeNonFinite(0)).toBeNull();
    expect(describeNonFinite(-1.5)).toBeNull();
  });

  it('対照: 入れ子の中の非有限も見つける', () => {
    expect(describeNonFinite({ a: { b: Number.NaN } })).toBe('a.b = NaN');
    expect(describeNonFinite([1, 2, Number.NaN])).toBe('[2] = NaN');
    expect(describeNonFinite([{ x: 1 }, { x: Number.POSITIVE_INFINITY }])).toBe('[1].x = Infinity');
    expect(describeNonFinite({ a: 1, b: [2, 3] })).toBeNull();
  });

  it('対照: 文に埋まった NaN / Infinity も見つける', () => {
    expect(describeNonFinite('このうち NaN 件')).toBe('戻り値 の文に "NaN" が入っている');
    expect(describeNonFinite('Infinity 円')).toBe('戻り値 の文に "Infinity" が入っている');
    expect(describeNonFinite({ note: '10 期のうち NaN 期' })).toBe('note の文に "NaN" が入っている');
    expect(describeNonFinite('3 件')).toBeNull();
  });

  it('対照: null / undefined / 真偽値は非有限ではない (断りは通す)', () => {
    expect(describeNonFinite(null)).toBeNull();
    expect(describeNonFinite(undefined)).toBeNull();
    expect(describeNonFinite(false)).toBeNull();
  });

  it('台帳は空でない (入口を 1 つも測っていない検査は合格ではない)', () => {
    expect(ENTRY_POINTS.length).toBeGreaterThanOrEqual(16);
    // 各入口が少なくとも 1 つの数値の位置を持つ (置き換える先が無ければ何も測らない)
    for (const ep of ENTRY_POINTS) expect(ep.args.length).toBeGreaterThan(0);
  });
});
