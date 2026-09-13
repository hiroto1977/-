/**
 * **宣言した数の天井は、計算側が強制しなければ天井ではない。** (2026-09-13 · パス 198)
 *
 * `GuardedNumber` は `spec.max` を宣言し、`guardNumber` は超過に ⛔ (fatal) を出す。
 * だが **`GuardedNumber` は入力を書き換えない** (黙って丸めないための意図的な設計 ——
 * `components/GuardedNumber.tsx` と `RealEstatePage.tsx:441` の注記)。つまり
 * **上限の強制は計算側の責任**で、それを最初に文章にしたのが `depreciation.ts` の
 * `MAX_SCHEDULE_YEARS` / `isSchedulableLife` (2026-08 監査) である。
 *
 * ## パス 198 で実測した 3 経路 (直す前)
 *
 * | 欄 (画面の宣言) | 入力 | 画面が刷っていた物 |
 * | --- | --- | --- |
 * | 積立年数 (80 年以下) | 100,000 | 将来評価額 **`¥∞`** · 累計拠出額 `¥∞` · 運用益率 `Infinity%` |
 * | 達成年数 (80 年以下) | 100,000 | 到達見込み **`¥∞` (達成)** · 必要な毎月積立額 **`¥0`** |
 * | 保有年数 (100 年以下) | 100,000 | `100000年累計の蝕み効果` **`¥NaN`** |
 *
 * `¥∞` は `¥NaN` より危ない —— **∞ は「無限に豊か」「無限に安全」と読める**のに、
 * 実際の意味は「入力が範囲外で計算が成り立たない」である。とくに達成年数の枝は
 * **`onTrack: true` を作っていた**ので、画面は利用者に *目標は達成済み* と告げていた。
 *
 * `annual` 複利の枝は `for (i < Math.round(years))` を回すので年数が反復回数になる ——
 * **実測 1 億年で 243 ms** (答えは `Infinity`)。`useMemo` の中なので 1 文字打つたびに走る。
 * 天井を置いた後は **0.003 ms** (断って即戻る)。
 *
 * ## だから何を要求するか
 *
 * 1. **金額の funnel に床** —— `jpy` は非有限を `—` にする (227 か所を 1 か所で覆う)。
 * 2. **年数の天井は共有定数 1 つ** —— 画面の `spec.max` はその定数を読む
 *    (数を 2 か所に書くと必ず食い違う)。
 * 3. **天井を超えた入力から数字を作らない** —— `null` (算定不能) を返し、画面は
 *    「—」+ 理由。**黙って丸めない**(丸めると「100,000 年の計画が 80 年で成り立つ」
 *    という別の誤りになる)。
 *
 * ## この検査が覆っていない範囲 (走査の限界を書いておく)
 *
 * パス 198 では `src/shared/*.ts` の輸出関数 189 本を極端な数値で総当たりして
 * 非有限を返す物を探した。**その走査には 2 つの盲点が在り、どちらも実測した**:
 *
 * - **偽陽性** —— 引数が object の関数を数値で呼ぶと `NaN` が出る (28 件のうち 24 件)。
 * - **偽陰性** —— **既定値つき引数は `fn.length` に数えられない**ので、走査は
 *   その引数を 1 度も動かさない。`calcRealCost(…, years = 1)` の `years` が
 *   まさにそれで、**手で見つけた本物の欠陥を走査は見落としていた**。
 *
 * だからゲートは走査ではなく**呼び経路ごとの総当たり**にしてある (下の `CEILINGS`)。
 */
import { describe, expect, it } from 'vitest';
import path from 'node:path';
import { readOriginalSource } from '../../shared/__tests__/originalSource';
import { DASH, jpy } from '../../shared/formatters';
import { finiteOrNull } from '../../shared/num';
import {
  MAX_PLAN_YEARS,
  futureValueWithFrequency,
  goalProjection,
  inflationAdjustedValue,
  isPlannableYears,
  requiredMonthlyContribution,
} from '../../shared/savingsPlanning';
import {
  MAX_HOLDING_YEARS,
  calcCompoundingFutureValue,
  calcRealCost,
  isMeasurableHoldingYears,
} from '../../shared/mutualFundsMetrics';

const RENDERER = path.resolve(__dirname, '..');

/** 引数が全部数値の呼び経路。`max` を超えた入力で非有限が出ないことを見る。 */
interface Ceiling {
  readonly label: string;
  /** 画面が宣言している上限 (共有定数から読む — ここで数を書き写さない)。 */
  readonly max: number;
  /** 年数を変えて呼び、返り値の中の数値をすべて取り出す。 */
  readonly call: (years: number) => readonly (number | null)[];
}

const CEILINGS: readonly Ceiling[] = [
  {
    label: '積立年数 → calcCompoundingFutureValue',
    max: MAX_PLAN_YEARS,
    call: (y) => {
      const s = calcCompoundingFutureValue(30_000, 5, y);
      return [s.futureValue, s.totalContributed, s.totalGain, s.gainPct];
    },
  },
  {
    label: '積立年数 → futureValueWithFrequency (monthly)',
    max: MAX_PLAN_YEARS,
    call: (y) => [futureValueWithFrequency(30_000, 5, y, 'monthly')],
  },
  {
    label: '積立年数 → futureValueWithFrequency (annual · 年数が反復回数になる枝)',
    max: MAX_PLAN_YEARS,
    call: (y) => [futureValueWithFrequency(30_000, 5, y, 'annual')],
  },
  {
    label: '達成年数 → requiredMonthlyContribution',
    max: MAX_PLAN_YEARS,
    call: (y) => [requiredMonthlyContribution(10_000_000, 5, y)],
  },
  {
    label: '達成年数 → goalProjection',
    max: MAX_PLAN_YEARS,
    call: (y) => {
      const p = goalProjection(30_000, 10_000_000, 5, y);
      return [p.projected, p.shortfall, p.requiredMonthly, p.additionalMonthly];
    },
  },
  {
    label: '達成年数 → inflationAdjustedValue',
    max: MAX_PLAN_YEARS,
    call: (y) => [inflationAdjustedValue(10_000_000, 2, y)],
  },
  {
    label: '保有年数 → calcRealCost (既定値つき引数・走査の盲点だった欄)',
    max: MAX_HOLDING_YEARS,
    call: (y) => {
      const r = calcRealCost(7_000_000, 1.5, 0.3, 5, y);
      return [r.annualCostPct, r.annualCostYen, r.cumulativeCostYen];
    },
  },
];

/** 天井を超えた入力の標本。`max + 1` (境界のすぐ外) を必ず含める。 */
const OVER = (max: number) => [max + 1, max + 10, 1_000, 100_000, 99_999_999, 1e21];

describe('数の天井は計算側が強制する (パス 198)', () => {
  it('走査が実物に届いている (空撃ちでない)', () => {
    expect(CEILINGS.length, '呼び経路の台帳が空になっている').toBeGreaterThanOrEqual(7);
    expect(MAX_PLAN_YEARS).toBeGreaterThan(0);
    expect(MAX_HOLDING_YEARS).toBeGreaterThan(0);
  });

  it('★ 天井のちょうど内側では算定できる (断りすぎていない)', () => {
    for (const c of CEILINGS) {
      for (const v of c.call(c.max)) {
        // gainPct などは正当に null になり得るので「非有限でない」ことだけ見る。
        if (v !== null) {
          expect(Number.isFinite(v), `${c.label}: max=${c.max} で非有限 (${v}) が出た`).toBe(true);
        }
      }
      const atMax = c.call(c.max);
      expect(atMax.some((v) => v !== null), `${c.label}: max=${c.max} で全欄が null —— 断りすぎ`).toBe(true);
    }
  });

  it('★ 天井を超えた入力から非有限を作らない (¥∞ / ¥NaN の出所を閉じる)', () => {
    for (const c of CEILINGS) {
      for (const y of OVER(c.max)) {
        for (const v of c.call(y)) {
          expect(
            v === null || Number.isFinite(v),
            `${c.label}: years=${y} (上限 ${c.max}) が ${String(v)} を返した —— 画面は ¥∞ / ¥NaN を刷る`,
          ).toBe(true);
        }
      }
    }
  });

  it('★ 天井を超えた年数から「達成」という判定を作らない', () => {
    for (const y of OVER(MAX_PLAN_YEARS)) {
      const p = goalProjection(30_000, 10_000_000, 5, y);
      expect(p.projected, `years=${y}: 到達見込みが算定されている`).toBeNull();
      expect(
        p.onTrack,
        `years=${y}: 到達見込みが無いのに onTrack=${String(p.onTrack)} —— false も「未達」という断定`,
      ).toBeNull();
    }
    // 対照: 範囲内なら判定が出る (この検査が常に通る空の検査でないこと)
    const inRange = goalProjection(1_000_000, 10_000_000, 5, 10);
    expect(inRange.onTrack, '範囲内で onTrack が出ない —— 断りすぎ').not.toBeNull();
  });

  it('★ 範囲外でも「年数に依らない欄」は測り続ける (隣の数字まで隠さない)', () => {
    const over = calcRealCost(7_000_000, 1.5, 0.3, 5, MAX_HOLDING_YEARS + 1);
    expect(over.cumulativeCostYen, '累計の蝕み効果は算定不能のはず').toBeNull();
    expect(over.annualCostPct, '年率のコストは年数に依らない').toBe(1.8);
    expect(over.annualCostYen, '年間コストは年数に依らない').toBe(126_000);
  });

  it('★ 金額の funnel が非有限を刷らない (床)', () => {
    for (const bad of [Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, Number.NaN]) {
      expect(jpy(bad), `jpy(${bad}) が金額の形で出ている`).toBe(DASH);
    }
    // 対照: 本物の金額は素通りする (負の額も、0 も)
    expect(jpy(1_234_567)).toBe('¥1,234,567');
    expect(jpy(0)).toBe('¥0');
    expect(jpy(-5_000)).toBe('¥-5,000');
  });

  it('★ `finiteOrNull` は 0 に倒さない (nonNeg との違い)', () => {
    expect(finiteOrNull(0)).toBe(0);
    expect(finiteOrNull(-5)).toBe(-5);
    expect(finiteOrNull(Number.NaN)).toBeNull();
    expect(finiteOrNull(Number.POSITIVE_INFINITY)).toBeNull();
  });

  it('★ 画面の `spec.max` は共有定数を読む (数を 2 か所に書かない)', () => {
    const page = readOriginalSource(path.join(RENDERER, 'pages/MutualFundsPage.tsx'));
    for (const [label, constName] of [
      ['積立年数', 'MAX_PLAN_YEARS'],
      ['達成年数', 'MAX_PLAN_YEARS'],
      ['保有年数', 'MAX_HOLDING_YEARS'],
    ] as const) {
      const re = new RegExp(`label: '${label}'[^}]*max: ${constName}`);
      expect(page, `「${label}」の max が ${constName} を読んでいない (literal の写し)`).toMatch(re);
    }
    // 対照: 走査が当たる綴りであること (規則が実物へ届いているかを同じ検査で示す)
    expect(page).toMatch(/label: '積立年数'/);
    expect(page).not.toMatch(/label: '積立年数'[^}]*max: 80\b/);
  });

  it('★ 「—」の理由を画面が述べる (値だけ消して黙らない)', () => {
    const page = readOriginalSource(path.join(RENDERER, 'pages/MutualFundsPage.tsx'));
    expect(page, '積立年数が範囲外のときの断りが無い').toMatch(/isPlannableYears\(readNumberOr0\(simYears\)\)/);
    expect(page, '達成年数が範囲外のときの断りが無い').toMatch(/isPlannableYears\(readNumberOr0\(goalYears\)\)/);
    expect(page, '保有年数が範囲外のときの断りが無い').toMatch(
      /isMeasurableHoldingYears\(readNumberOr0\(holdYears\)\)/,
    );
    // 述語そのものが生きていること (画面が呼んでいる関数が常に true を返さない)
    expect(isPlannableYears(MAX_PLAN_YEARS)).toBe(true);
    expect(isPlannableYears(MAX_PLAN_YEARS + 1)).toBe(false);
    expect(isMeasurableHoldingYears(MAX_HOLDING_YEARS)).toBe(true);
    expect(isMeasurableHoldingYears(MAX_HOLDING_YEARS + 1)).toBe(false);
  });

  it('★ 「—」の綴りは 1 つ (Stat の UNDETERMINED と formatters の DASH)', () => {
    const stat = readOriginalSource(path.join(RENDERER, 'components/Stat.tsx'));
    expect(stat, 'UNDETERMINED が独自の literal を持っている').toMatch(/export const UNDETERMINED = DASH;/);
    const overview = readOriginalSource(path.join(RENDERER, 'pages/OverviewPage.tsx'));
    expect(overview, "safeYen が '∞' を刷る形に戻っている").not.toMatch(/Number\.isFinite\(n\)[^\n]*:\s*'∞'/);
  });
});
