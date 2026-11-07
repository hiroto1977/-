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
import { readOriginalDirEntries, readOriginalSource } from '../../shared/__tests__/originalSource';
import { stripComments } from '../../shared/__tests__/stripNonCode';
import { MAX_DEPENDENTS_PER_KIND, dependentsFromCounts } from '../../shared/taxDeductions';
import { dependentCountSpec, guardNumber } from '../data/inputGuards';
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
  MAX_FISCAL_YEAR,
  MIN_FISCAL_YEAR,
  finalDueDate,
  isRepresentableFiscalPeriod,
  planInterim,
  settle,
  calcAnnualTax,
  type ScheduleInput,
} from '../../shared/taxConsumptionSchedule';
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

/**
 * **範囲外の課税期間から、もっともらしい「日付」を作らない。** (2026-09-13 · パス 199)
 *
 * パス 198 は非有限の**数**を閉じた。日付は `Number.isFinite` も `jpy` の床も
 * 通らないので、同じ形が別の出口で開いていた。実測 (`TaxPage` の `csInput` の式を
 * そのまま写して):
 *
 * | 打った文字列 | 刷られていた確定申告期限 |
 * | --- | --- |
 * | `26` (2026 の打ち間違い) | **`1926-05-31`** |
 * | `1` / `50` / `99` | `1901-05-31` / `1950-05-31` / `1999-05-31` |
 * | `275760` | **`+275760-05`** (`YYYY-MM-DD` ですらない) |
 * | 決算月 `99` / `0` | 画面が黙って 12 に丸めていた |
 *
 * **2 桁で打つのは自然な打ち間違い**で、出てくるのは「明らかに変な値」ではなく
 * もっともらしい日付である。申告期限は利用者が行動する日付なので、外すと
 * 加算税・延滞税が付く。`Date.UTC` が年 0〜99 を 1900 年代へ写すのは黙って起きる。
 */
describe('課税期間の範囲は計算側が強制する (パス 199)', () => {
  const input = (year: number, month: number): ScheduleInput => ({
    filer: 'corporate', fiscalEndMonth: month, fiscalEndYear: year,
    extendedDeadline: false, method: 'standard',
    taxableSales: 50_000_000, taxablePurchases: 20_000_000,
    deemedPurchaseRate: 0.8, priorNationalTax: 800_000, eTax: true,
  });

  /** 画面から届き得る値。2 桁の打ち間違いを必ず含める。 */
  const OUT_OF_RANGE: readonly (readonly [number, number])[] = [
    [26, 3], [1, 3], [50, 3], [99, 3], [1999, 3],
    [MIN_FISCAL_YEAR - 1, 3], [MAX_FISCAL_YEAR + 1, 3],
    [9999, 3], [275_760, 3], [0, 3], [-1, 3], [2026.5, 3],
    [2026, 0], [2026, 13], [2026, 99], [2026, -1], [2026, 3.5],
  ];

  it('★ 範囲内なら日付が出る (断りすぎていない)', () => {
    for (const [y, m] of [[MIN_FISCAL_YEAR, 1], [2026, 3], [MAX_FISCAL_YEAR, 12]] as const) {
      const due = finalDueDate(input(y, m));
      expect(due, `year=${y} month=${m} で期限が出ない`).not.toBeNull();
      expect(due, `year=${y} month=${m} の期限が YYYY-MM-DD でない: ${String(due)}`).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });

  it('★ 範囲外から期限を作らない (もっともらしい誤った日付を刷らない)', () => {
    for (const [y, m] of OUT_OF_RANGE) {
      expect(isRepresentableFiscalPeriod(input(y, m)), `year=${y} month=${m} が範囲内と判定された`).toBe(false);
      expect(
        finalDueDate(input(y, m)),
        `year=${y} month=${m} が期限を返した —— 画面はそれを申告期限として刷る`,
      ).toBeNull();
    }
  });

  it('★ 範囲外では中間納付の日程も 1 件も作らない', () => {
    for (const [y, m] of OUT_OF_RANGE) {
      const plan = planInterim(input(y, m));
      expect(plan.payments, `year=${y} month=${m} で中間納付の日程が作られた`).toEqual([]);
      expect(plan.total, `year=${y} month=${m} で中間納付の合計が 0 でない`).toBe(0);
    }
    // 対照: 範囲内なら日程が出る (この検査が常に通る空の検査でないこと)
    expect(planInterim(input(2026, 3)).payments.length).toBeGreaterThan(0);
  });

  /**
   * **この検査は 1 度書き直した。** 最初は `planInterim` の結果をそのまま渡していたが、
   * 範囲外では中間納付が空 (`total: 0`) になるので `amount > 0` = 納付になり、
   * **還付の枝に 1 度も入っていなかった** —— `settle` のガードを外す対照 (D7) が
   * **鳴らなかった**ことで判明した。`settle` は計画を引数で受けるので、
   * 中間納付が年税額を上回る計画を渡して還付の枝を実際に通す。
   *
   * (鳴らない対照は「合格」ではなく、その検査についての報せである。)
   */
  it('★ 期限が出ていなければ還付の入金時期も出さない (Invalid Date を刷らない)', () => {
    const annual = calcAnnualTax(input(2026, 3), 0.1);
    /** 年税額を上回る中間納付 = 確定申告は還付になる。 */
    const overpaid = {
      count: 1 as const,
      priorNationalTax: 0,
      band: '(検査用)',
      payments: [],
      total: annual.total + 1_000_000,
      totalNational: annual.total + 1_000_000,
    };
    let refunds = 0;
    for (const [y, m] of OUT_OF_RANGE) {
      const st = settle(input(y, m), annual, overpaid);
      expect(st.due, `year=${y} month=${m} で期限が出ている`).toBeNull();
      expect(st.kind, `year=${y} month=${m} が還付の枝に入っていない`).toBe('refund');
      refunds += 1;
      expect(
        st.refundWindow,
        `year=${y} month=${m}: 期限が無いのに入金時期が出た (${JSON.stringify(st.refundWindow)})`,
      ).toBeUndefined();
    }
    expect(refunds, '還付の枝を 1 度も通っていない (空の検査)').toBe(OUT_OF_RANGE.length);
    // 対照: 範囲内なら還付の入金時期が出る (断りすぎていない)
    const ok = settle(input(2026, 3), annual, overpaid);
    expect(ok.kind).toBe('refund');
    expect(ok.refundWindow, '範囲内で入金時期が出ない').toBeDefined();
    expect(ok.refundWindow?.from).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('★ 画面は黙って丸めない (範囲外は断って理由を述べる)', () => {
    const page = readOriginalSource(path.join(RENDERER, 'pages/TaxPage.tsx'));
    // 以前の「黙って丸める」式が戻っていないこと (綴りが当たることは下の肯定形で示す)
    expect(page, '決算月を Math.min/Math.max で黙って丸める式が戻っている').not.toMatch(
      /fiscalEndMonth:[^\n]*Math\.min\(12/,
    );
    expect(page, '終了年を `|| 2026` で既定に倒す式が戻っている').not.toMatch(/fiscalEndYear:[^\n]*\|\| 2026/);
    // 肯定形 (無ければ必ず鳴る): 断りと理由が在ること
    expect(page, '範囲外のときの断りが無い').toMatch(/!isRepresentableFiscalPeriod\(csInput\)/);
    expect(page, '断りの中で範囲を共有定数から刷っていない').toMatch(/\{MIN_FISCAL_YEAR\}〜\{MAX_FISCAL_YEAR\}/);
    expect(page, '期限の欄が null のとき「—」に落ちない').toMatch(/settlement\.due \?\? DASH/);
  });

  it('★ 述語そのものが生きている (境界の両側で答えが変わる)', () => {
    expect(isRepresentableFiscalPeriod({ fiscalEndYear: MIN_FISCAL_YEAR, fiscalEndMonth: 1 })).toBe(true);
    expect(isRepresentableFiscalPeriod({ fiscalEndYear: MIN_FISCAL_YEAR - 1, fiscalEndMonth: 1 })).toBe(false);
    expect(isRepresentableFiscalPeriod({ fiscalEndYear: MAX_FISCAL_YEAR, fiscalEndMonth: 12 })).toBe(true);
    expect(isRepresentableFiscalPeriod({ fiscalEndYear: MAX_FISCAL_YEAR + 1, fiscalEndMonth: 12 })).toBe(false);
    expect(isRepresentableFiscalPeriod({ fiscalEndYear: 2026, fiscalEndMonth: 13 })).toBe(false);
    expect(isRepresentableFiscalPeriod({ fiscalEndYear: 2026, fiscalEndMonth: 0 })).toBe(false);
  });
});

/**
 * **扶養親族の人数分の並びは、共有の 1 つでしか作らない** (2026-09-27 · パス 493k)。
 *
 * 画面は人数分の並び (`DependentKind[]`) を作ってから控除を数えるので、天井が無いと
 * **打った数だけ配列が伸びる**。実測 (直す前・福利厚生カード): 1 億人で 1 回の描画が
 * 28 秒・4,089 MB、50 億人で `RangeError: Invalid array length` (税金ページごと落ちる)。
 * 税金ページは 20 で止めていたが、その 20 は画面の字面 4 か所だった ——
 * **天井は並びを作る側 (`dependentsFromCounts`) と関門 (`dependentCountSpec`) の 2 つが同じ定数を読む**。
 *
 * 母集団は走査で導く: 並びを作る綴り (`Array<DependentKind>(` と区分の `.fill('…')`) が
 * 共有の 1 か所の外に現れたら落ちる (3 つ目の画面が自前で作った日に鳴る)。
 */
describe('扶養親族の並びは共有の 1 つで作る (パス 493k)', () => {
  const SRC = path.resolve(__dirname, '..', '..');
  const HOME = 'shared/taxDeductions.ts';
  const BUILD = /Array<DependentKind>\s*\(|\.fill\(\s*'(?:under16|general|specific|elderly-livein|elderly)'\s*\)/;

  function sources(dir: string): string[] {
    const out: string[] = [];
    for (const e of readOriginalDirEntries(dir)) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) {
        if (e.name === '__tests__' || e.name === '__audits__') continue;
        out.push(...sources(full));
      } else if (/\.tsx?$/.test(e.name) && !e.name.endsWith('.d.ts')) {
        out.push(full);
      }
    }
    return out;
  }

  it('★ 並びを作る綴りは共有の 1 か所にしか無い (注記の中の言及は数えない)', () => {
    const files = sources(SRC);
    expect(files.length, '走査が src の木を歩いていない').toBeGreaterThan(300);
    // 注記を落とすのは綴りの候補が在る本だけ (落とすだけなので、元の本に無い綴りは落とした後にも無い) ——
    // 全件を落とすと、全件実行の負荷の下で 1 本 18 秒かかった (対照の実測)。
    const hits = files
      .filter((f) => {
        const raw = readOriginalSource(f);
        return (raw.includes('DependentKind') || raw.includes('.fill(')) && BUILD.test(stripComments(raw));
      })
      .map((f) => path.relative(SRC, f).split(path.sep).join('/'));
    expect(hits).toEqual([HOME]);
    // 標本が的に当たる: 直す前の福利厚生カードの形は針に当たり、注記の中の言及は当たらない
    expect(BUILD.test(`const d = [...Array<DependentKind>(g).fill('general')];`)).toBe(true);
    expect(BUILD.test(`x.fill('specific')`)).toBe(true);
    expect(BUILD.test(stripComments(`// 直す前は Array<DependentKind>(g).fill('general') だった\nconst y = 1;`))).toBe(false);
  });

  /** 扶養の人数の欄の spec を手で書いた形 (直す前の税金ページは `kind: 'count' … max: 20` の字面だった)。 */
  const HAND_WRITTEN_DEPENDENT_SPEC = /label: '[^']*扶養親族の人数'[^}]*kind:/;

  it('★ 両画面は共有の並びと共有の関門を読む (人数の欄の spec を手で書かない)', () => {
    for (const rel of ['pages/TaxPage.tsx', 'components/WelfareSchemeCard.tsx']) {
      const code = stripComments(readOriginalSource(path.join(RENDERER, rel)));
      expect(code, `${rel} が dependentsFromCounts を呼んでいない`).toMatch(/dependentsFromCounts\(/);
      expect(code, `${rel} が dependentCountSpec を呼んでいない`).toMatch(/dependentCountSpec\('/);
      expect(code, `${rel} が扶養の人数の spec を手で書いている`).not.toMatch(HAND_WRITTEN_DEPENDENT_SPEC);
    }
    // 標本が的に当たる: 直す前の税金ページの 1 行は針に当たる
    expect(
      `[generalDeps, { label: '一般扶養親族の人数', kind: 'count', allowEmpty: true, allowZero: true, max: 20 }],`,
    ).toMatch(HAND_WRITTEN_DEPENDENT_SPEC);
  });

  it('★ 関門と並びは同じ天井を読み、関門の単位は「人」', () => {
    const spec = dependentCountSpec('X');
    expect(spec.max).toBe(MAX_DEPENDENTS_PER_KIND);
    expect(spec.kind).toBe('people');
    expect(dependentsFromCounts({ general: spec.max! + 1 })).toHaveLength(spec.max!);
    // 空欄と 0 は「扶養なし」で正当 —— 断らない (断ると既定の画面に確認欄が出る)
    expect(guardNumber('', spec)).toBeNull();
    expect(guardNumber('0', spec)).toBeNull();
    expect(guardNumber(String(spec.max), spec)).toBeNull();
    expect(guardNumber(String(spec.max! + 1), spec)?.message).toBe(
      `${MAX_DEPENDENTS_PER_KIND} 人 以下で入力してください（現在 ${MAX_DEPENDENTS_PER_KIND + 1}）。`,
    );
  });
});
