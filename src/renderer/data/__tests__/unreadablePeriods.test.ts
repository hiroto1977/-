/**
 * **期 (YYYY-MM) が読めない行を、期間からは除き金額からは除かない** —— パス 225。
 *
 * パス 224 で「復元は型だけ見る」と裁定した 6 鍵のうち `kpi-actuals:period` /
 * `kpi-budgets:period` を読む側から測った。裁定そのものは正しい (形の検査が書式まで
 * 見ると、正しいバックアップの復元でレコードが黙って消える) が、**読む側が
 * 片側だけ選別していた**:
 *
 *   `overview.ts:302`  validKpiPeriods = …filter(isValidPeriod)   ← 期間・月数は選別
 *   `overview.ts:311`  summarizeFundamentals(input.kpiActuals)    ← 金額は全行
 *
 * 実測 (2026-09-14・期が `'全社'` の 1 行を売上 900 万で混ぜる):
 *
 * | | 素の 4 期 | + 読めない 1 行 |
 * | --- | ---: | ---: |
 * | 刷られる対象期間 | 2026-01〜2026-04・4 か月 | **同じ** |
 * | 合計売上 | ¥4,600,000 | **¥13,600,000** |
 * | 着地見込み 対象年 | 2026 | **「全社」** |
 * | 年換算 | ¥13,800,000 | **¥108,000,000** |
 * | 前月比 / CAGR | 8.3% / 9.1% | **592.3% / 73.2%** |
 *
 * 月数 4 に対し分子が 5 行ぶんなので月商が ¥3,400,000 になる (実際は ¥1,150,000)。
 * 回転日数・借入金月商倍率・スコアカードの効率性がこの月商で決まる —— パス 48 の家系。
 *
 * ここで留めるのは 3 つ:
 *   1. 漏斗 (`readablePeriodRows`) と 2 つの断り文。
 *   2. **両側が同じ母集団**になったこと (集計・期間・成長率・着地見込み)。
 *   3. **落としたことを言う** —— 画面・書面 §1・経営レポートの 3 面 (黙って落とすと、
 *      合計が説明できない数字になる)。
 */
import { describe, expect, it } from 'vitest';
import {
  computeRevenueCagrPct,
  computeRevenueGrowthPct,
  computeRevenueLandingForecast,
  computeRevenueTrend,
  groupOperatingProfitByPeriod,
  groupRevenueByPeriod,
  periodWindow,
  readablePeriodRows,
  unreadablePeriodNote,
  unreadablePeriodOverviewNote,
  unreadablePeriodSheetNote,
  type KpiActual,
} from '../kpiActuals';
import { buildBusinessOverview } from '../overview';
import { buildBankSubmissionSheet, type BankSubmissionSettings } from '../bankSubmission';
import { buildManagementReport } from '../managementReport';
import { buildManagementScorecard } from '../../../shared/managementScorecard';
import { buildManagementHighlights } from '../managementHighlights';
import { NO_MANUAL_OVERRIDES } from '../overviewOverrides';
import { BANK_FORMAT_DEFAULT } from '../../../shared/bankFormat';

const row = (period: string, revenue: number): KpiActual => ({
  period,
  unit: '全社',
  revenue,
  cogs: 0,
  advertising: 0,
  sga: 0,
  depreciation: 0,
});

/** 4 期ぶんの素の控え。 */
const CLEAN: readonly KpiActual[] = [
  row('2026-01', 1_000_000),
  row('2026-02', 1_100_000),
  row('2026-03', 1_200_000),
  row('2026-04', 1_300_000),
];
/** 復元が通す「型は文字列だが書式が壊れた期」を 1 件混ぜた控え。 */
const DIRTY: readonly KpiActual[] = [...CLEAN, row('全社', 9_000_000)];

describe('readablePeriodRows — 期が読める行だけの漏斗', () => {
  it('読める行だけを返し、落とした件数を添える', () => {
    const r = readablePeriodRows(DIRTY);
    expect(r.rows).toHaveLength(4);
    expect(r.dropped).toBe(1);
    expect(r.rows.map((x) => x.period)).toEqual(['2026-01', '2026-02', '2026-03', '2026-04']);
  });

  it('全部読めれば 0 件落とす (対照)', () => {
    expect(readablePeriodRows(CLEAN).dropped).toBe(0);
  });

  it('全部読めなければ空を返す (「実績が無い」と同じ扱いになる)', () => {
    const r = readablePeriodRows([row('全社', 1), row('2026', 2), row('2026-13', 3)]);
    expect(r.rows).toEqual([]);
    expect(r.dropped).toBe(3);
  });

  it('空の一覧は 0 件 / 0 件', () => {
    const r = readablePeriodRows([]);
    expect(r.rows).toEqual([]);
    expect(r.dropped).toBe(0);
  });

  it('綴りの判定は `isValidPeriod` と同じ (暦に無い月は落ちる)', () => {
    expect(readablePeriodRows([row('2026-00', 1), row('2026-12', 2)]).rows.map((r) => r.period)).toEqual(['2026-12']);
  });
});

describe('断りの文 — 落としたことを言う', () => {
  it('0 件なら null (言うことが無い)', () => {
    expect(unreadablePeriodNote('実績', 0)).toBeNull();
    expect(unreadablePeriodSheetNote(0)).toBeNull();
    expect(unreadablePeriodNote('実績', -1)).toBeNull();
  });

  it('件数と、なぜ起きたか・どう消すかを述べる (画面)', () => {
    const note = unreadablePeriodNote('実績', 2);
    expect(note).not.toBeNull();
    expect(note).toContain('2 件');
    expect(note).toContain('実績');
    expect(note).toContain('YYYY-MM');
    // 出所と出口の両方を言う (パス 70 の「復元」・一覧の ×)。
    expect(note).toContain('復元');
    expect(note).toContain('一覧の ×');
  });

  /**
   * **この検査は 2026-09-23 (パス 425) まで逆を主張していた。**
   *
   * `expect(note).toContain('形式の合わない記録')` と書いてあり、つまり
   * **偽の案内を仕様として凍結していた** (法則 `no-weakness-as-spec`)。実測では
   * `KPI_SHAPE.period` は `str` なので `period: 'bad'` の行は形として正しく、
   * 点検パネルは `malformed = 0` —— 行った先が「ありません」と答える。
   */
  it('★ 設定の点検パネルは名指ししない (そこからは消せないため)', () => {
    expect(unreadablePeriodNote('実績', 2)).not.toContain('形式の合わない記録');
    expect(unreadablePeriodOverviewNote(2)).not.toContain('形式の合わない記録');
  });

  it('★ 経営サマリーは一覧が無いので KPI の画面を名指しする (実在するラベルで)', () => {
    const note = unreadablePeriodOverviewNote(3);
    expect(note).not.toBeNull();
    expect(note).toContain('3 件');
    // **サイドバーの綴りで指さす** —— 「KPI 実績」という画面は存在しない (パス 425)。
    // 実在するかどうかは `namedEscapeHatchReachable.test.ts` が SERVICES と突き合わせる。
    expect(note).toContain('「KPI / BEP」の画面');
    expect(note).not.toContain('「KPI 実績」の画面');
    expect(note).toContain('一覧の ×');
    expect(unreadablePeriodOverviewNote(0)).toBeNull();
    expect(unreadablePeriodOverviewNote(Number.NaN)).toBeNull();
  });

  it('★ 画面ごとに逃げ口の名指しが違う (KPI は「下の一覧」・経営サマリーは別画面)', () => {
    expect(unreadablePeriodNote('実績', 1)).toContain('下の一覧');
    expect(unreadablePeriodOverviewNote(1)).not.toContain('下の一覧');
  });

  it('予算にも同じ規則で使える (種別を引数で受ける)', () => {
    expect(unreadablePeriodNote('予算', 1)).toContain('予算');
  });

  it('相手に渡る面の文は短く、件数を必ず含む', () => {
    const note = unreadablePeriodSheetNote(3);
    expect(note).toBe('期 (YYYY-MM) が読めない 3 件は集計から除いています。');
  });
});

describe('両側が同じ母集団になる — 期間も金額も成長率も', () => {
  it('グループ化が読めない期を系列に入れない (売上)', () => {
    expect(groupRevenueByPeriod(DIRTY)).toEqual(groupRevenueByPeriod(CLEAN));
    expect(groupRevenueByPeriod(DIRTY).map((s) => s.period)).not.toContain('全社');
  });

  it('グループ化が読めない期を系列に入れない (営業利益)', () => {
    expect(groupOperatingProfitByPeriod(DIRTY)).toEqual(groupOperatingProfitByPeriod(CLEAN));
  });

  it('着地見込みの対象年が「全社」にならない (実測 —— 年換算 1 億 800 万 → 1,380 万)', () => {
    const dirty = computeRevenueLandingForecast(DIRTY);
    const clean = computeRevenueLandingForecast(CLEAN);
    expect(dirty).toEqual(clean);
    expect(dirty?.year).toBe('2026');
    expect(dirty?.monthsElapsed).toBe(4);
    expect(dirty?.runRateForecast).toBe(13_800_000);
  });

  it('前月比・CAGR・トレンドが読めない行に動かされない (592.3% → 8.3%)', () => {
    expect(computeRevenueGrowthPct(DIRTY)).toBe(computeRevenueGrowthPct(CLEAN));
    expect(computeRevenueGrowthPct(DIRTY)).toBe(8.3);
    expect(computeRevenueCagrPct(DIRTY)).toBe(computeRevenueCagrPct(CLEAN));
    expect(computeRevenueTrend(DIRTY)).toBe(computeRevenueTrend(CLEAN));
  });

  it('期の窓は前から選別していた (対照 —— こちら側は変わっていない)', () => {
    expect(periodWindow(DIRTY.map((r) => r.period))).toEqual({ from: '2026-01', to: '2026-04', months: 4 });
  });
});

/** 経営サマリーの入力 (KPI 以外は空)。 */
const overviewOf = (actuals: readonly KpiActual[], budgets: readonly KpiActual[] = []) =>
  buildBusinessOverview({
    plan: 'business',
    sales: [],
    kpiActuals: actuals,
    kpiBudgets: budgets,
    members: [],
    balanceSheet: null,
  });

describe('経営サマリー — 金額も選別され、件数が伝わる', () => {
  it('合計売上が読めない行を含まない (¥13,600,000 → ¥4,600,000)', () => {
    expect(overviewOf(DIRTY).kpi.revenue).toBe(4_600_000);
    expect(overviewOf(DIRTY).kpi.revenue).toBe(overviewOf(CLEAN).kpi.revenue);
  });

  it('除いた件数を持つ (実績 + 予算)', () => {
    expect(overviewOf(CLEAN).kpi.unreadablePeriods).toBe(0);
    expect(overviewOf(DIRTY).kpi.unreadablePeriods).toBe(1);
    expect(overviewOf(DIRTY, [row('全社', 1), row('2026-01', 2)]).kpi.unreadablePeriods).toBe(2);
  });

  it('月数と金額が同じ母集団を指す (月商が ¥3,400,000 にならない)', () => {
    const o = overviewOf(DIRTY);
    expect(o.kpi.periodWindow?.months).toBe(4);
    expect(o.kpi.revenue / (o.kpi.periodWindow?.months ?? 1)).toBe(1_150_000);
  });

  it('全部読めない控えは「実績が無い」— 不変条件 (hasData ⇒ revenueLanding) が保たれる', () => {
    const o = overviewOf([row('全社', 9_000_000)]);
    expect(o.kpi.hasData).toBe(false);
    expect(o.kpi.unreadablePeriods).toBe(1);
    // `overviewScorecard.ts` が依っている不変条件: hasData が真なら着地見込みは在る。
    expect(overviewOf(CLEAN).kpi.hasData).toBe(true);
    expect(overviewOf(CLEAN).kpi.revenueLanding).not.toBeNull();
  });
});

const SETTINGS: BankSubmissionSettings = {
  profile: { companyName: '株式会社X', representative: '山田', address: '東京', fiscalYearEnd: '2026-12' },
  format: BANK_FORMAT_DEFAULT,
};

describe('相手に渡る 2 面が、除いた件数を述べる', () => {
  const sheetText = (actuals: readonly KpiActual[]): string => {
    const overview = overviewOf(actuals);
    return JSON.stringify(buildBankSubmissionSheet({
      overview,
      scorecard: buildManagementScorecard({}),
      debtService: null,
      balanceSheetAsOf: null,
      today: '2026-09-14',
      settings: SETTINGS,
      manual: NO_MANUAL_OVERRIDES,
    }));
  };
  const reportText = (actuals: readonly KpiActual[]): string => {
    const overview = overviewOf(actuals);
    return buildManagementReport(overview, buildManagementScorecard({}), buildManagementHighlights(overview), '2026-09-14', NO_MANUAL_OVERRIDES);
  };

  it('書面 §1 の断り書きに件数が出る', () => {
    expect(sheetText(DIRTY)).toContain('期 (YYYY-MM) が読めない 1 件は集計から除いています。');
  });

  it('素の控えでは出ない (対照 —— 断りが常に出るわけではない)', () => {
    expect(sheetText(CLEAN)).not.toContain('読めない');
  });

  it('経営レポートにも同じ文が出る', () => {
    expect(reportText(DIRTY)).toContain('期 (YYYY-MM) が読めない 1 件は集計から除いています。');
    expect(reportText(CLEAN)).not.toContain('読めない');
  });
});

/**
 * **肯定形で書く。** `dropped <= 0` では `undefined <= 0` が false なので `undefined` が
 * 通り、「読めない undefined 件」を刷る。2026-09-14 に実際にやり、
 * `managementReport` の golden 検査 (全文一致) が突き返した —— 手で組んだ overview に
 * 新しい欄が無かったため。**手で写した payload は、新しい欄を持っていない** (パス 62 / 80)。
 */
describe('断りは非有限・未定義を言わない (肯定形の関門)', () => {
  const cases: readonly unknown[] = [undefined, null, Number.NaN, Number.POSITIVE_INFINITY * 0, '2'];
  for (const v of cases) {
    it(`${String(v)} は言わない`, () => {
      expect(unreadablePeriodNote('実績', v as number)).toBeNull();
      expect(unreadablePeriodSheetNote(v as number)).toBeNull();
    });
  }

  it('対照: 正の有限値は言う', () => {
    expect(unreadablePeriodNote('実績', 1)).not.toBeNull();
    expect(unreadablePeriodSheetNote(1)).not.toBeNull();
  });

  it('Infinity は言わない (件数として意味が無い)', () => {
    expect(unreadablePeriodSheetNote(Number.POSITIVE_INFINITY)).toBeNull();
  });
});
