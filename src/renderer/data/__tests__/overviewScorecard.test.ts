/**
 * **スコアカードの軸は、最悪の値でも採点されること。** (2026-09-07)
 *
 * 直す前は `OverviewPage.tsx` の中で総資産回転率をこう作っていた:
 *
 * ```tsx
 * assetTurnover: financialPosition && financialPosition.totalAssets > 0 && kpi.revenue > 0
 *   ? Math.round((kpi.revenue / financialPosition.totalAssets) * 100) / 100
 *   : undefined,
 * ```
 *
 * 総資産回転率の分母は**総資産**なので、売上 0 でも値は定まる —— **0 倍**、
 * つまり最悪の値。ところが `revenue > 0` で切っていたので、
 * 貸借対照表が在って売上 0 の会社は「効率性: 総資産回転率」を**採点されず**、
 * 効率性は残りの軸だけの平均になっていた。**売上 0 → 1 円で点数が下がる**形。
 *
 * ここでは事実の側から留める:
 *
 *   - 売上 0 + 貸借対照表 → 軸が**在る**・値は 0
 *   - 売上 1 円 → 軸が在る (0 → 1 円で軸が消えたり現れたりしない = 単調)
 *   - 貸借対照表なし / 総資産 0 → 算定不能なので軸は**無い**
 *   - 分母が売上の 3 指標 (営業利益率・粗利率・限界利益率) は売上 0 で軸が無い
 *     (こちらは 0 除算で本当に定まらない —— 残すのが正しい)
 *
 * 対照: 旧実装の条件 (`revenue > 0` を足す) を再現すると、最初の 2 件が落ちる。
 */
import { describe, expect, it } from 'vitest';
import { buildBusinessOverview, type OverviewInput } from '../overview';
import { scorecardMetrics } from '../overviewScorecard';
import { buildManagementScorecard } from '../../../shared/managementScorecard';
import { assetTurnoverRatio } from '../financialRatios';
import type { KpiActual } from '../kpiActuals';
import type { BalanceSheet } from '../balanceSheet';

const kpi = (revenue: number): KpiActual => ({
  period: '2026-03',
  unit: '全社',
  revenue,
  cogs: 0,
  advertising: 0,
  sga: 300_000,
  depreciation: 0,
});

/** 総資産 500 万・純資産 300 万の素直な貸借対照表。 */
const BS: BalanceSheet = {
  asOf: '2026-03-31',
  currentAssets: 2_000_000,
  cash: 1_000_000,
  inventory: 500_000,
  accountsReceivable: 500_000,
  fixedAssets: 3_000_000,
  currentLiabilities: 1_000_000,
  accountsPayable: 400_000,
  fixedLiabilities: 1_000_000,
  // 当期純利益は回転率に効かない (分子は売上) ので 0 で固定する。
  netIncome: 0,
};

function overviewOf(revenue: number, balanceSheet: BalanceSheet | null): ReturnType<typeof buildBusinessOverview> {
  const input: OverviewInput = {
    plan: 'free',
    sales: [],
    kpiActuals: [kpi(revenue)],
    balanceSheet,
    members: [],
  } as unknown as OverviewInput;
  return buildBusinessOverview(input);
}

/** 効率性カテゴリの軸ラベル。 */
function efficiencyLabels(revenue: number, bs: BalanceSheet | null): string[] {
  const card = buildManagementScorecard(scorecardMetrics(overviewOf(revenue, bs)));
  const eff = card.categories.find((c) => c.category === 'efficiency');
  return (eff?.components ?? []).map((c) => c.label);
}

describe('scorecardMetrics — 総資産回転率', () => {
  it('対照: 売上が在れば軸は在る (以降の検査が意味を持つ前提)', () => {
    expect(efficiencyLabels(5_000_000, BS)).toContain('総資産回転率');
  });

  it('★ 売上 0 でも軸は在り、値は 0 (最悪の値を隠さない)', () => {
    const m = scorecardMetrics(overviewOf(0, BS));
    expect(m.assetTurnover).toBe(0);
    expect(efficiencyLabels(0, BS)).toContain('総資産回転率');
  });

  it('★ 売上 0 と 1 円で軸の有無が変わらない (単調)', () => {
    expect(efficiencyLabels(0, BS)).toEqual(efficiencyLabels(1, BS));
  });

  it('★ 売上 0 でも「効率性」は採点される (カテゴリごと落ちない)', () => {
    const card = buildManagementScorecard(scorecardMetrics(overviewOf(0, BS)));
    const eff = card.categories.find((c) => c.category === 'efficiency');
    expect(eff?.score).not.toBeNull();
    expect(eff?.score).toBe(0);
  });

  it('貸借対照表が無ければ算定不能 (軸は無い)', () => {
    const m = scorecardMetrics(overviewOf(5_000_000, null));
    expect(m.assetTurnover).toBeUndefined();
    expect(efficiencyLabels(5_000_000, null)).not.toContain('総資産回転率');
  });

  it('総資産 0 なら算定不能 (0 除算)', () => {
    const zero: BalanceSheet = { ...BS, currentAssets: 0, cash: 0, inventory: 0, accountsReceivable: 0, fixedAssets: 0 };
    expect(scorecardMetrics(overviewOf(5_000_000, zero)).assetTurnover).toBeUndefined();
  });

  it('財務指標の総資産回転率と同じ 1 つの算術を使う', () => {
    const m = scorecardMetrics(overviewOf(7_500_000, BS));
    expect(m.assetTurnover).toBe(assetTurnoverRatio(7_500_000, 5_000_000));
    expect(m.assetTurnover).toBe(1.5);
  });

  it('★ 対照: 旧実装の条件を再現すると、売上 0 で軸が消える', () => {
    const ov = overviewOf(0, BS);
    const position = ov.financialPosition;
    // 旧実装そのまま (`revenue > 0` を足す)。
    const old =
      position && position.totalAssets > 0 && ov.kpi.revenue > 0
        ? Math.round((ov.kpi.revenue / position.totalAssets) * 100) / 100
        : undefined;
    expect(old).toBeUndefined();
    // 直した側は 0 を返す。**この差が今回の直し**。
    expect(scorecardMetrics(ov).assetTurnover).toBe(0);
  });
});

describe('scorecardMetrics — 分母が売上の指標は、売上 0 では採点しない', () => {
  it('売上 0 では利益率 3 つが undefined (0 除算で本当に定まらない)', () => {
    const m = scorecardMetrics(overviewOf(0, BS));
    expect(m.operatingMarginPct).toBeUndefined();
    expect(m.grossMarginPct).toBeUndefined();
    expect(m.contributionRatioPct).toBeUndefined();
  });

  it('対照: 売上が在れば 3 つとも採点される', () => {
    const m = scorecardMetrics(overviewOf(5_000_000, BS));
    expect(m.operatingMarginPct).not.toBeUndefined();
    expect(m.grossMarginPct).not.toBeUndefined();
    expect(m.contributionRatioPct).not.toBeUndefined();
  });
});

describe('scorecardMetrics — その他の軸', () => {
  it('KPI 実績が無ければ空を返す (どの軸も採点しない)', () => {
    const input = { plan: 'free', sales: [], kpiActuals: [], members: [] } as unknown as OverviewInput;
    expect(scorecardMetrics(buildBusinessOverview(input))).toEqual({});
  });

  it('DSCR は渡された値を採点し、null は採点しない (畳み込みはこのモジュールの仕事)', () => {
    const ov = overviewOf(5_000_000, BS);
    expect(scorecardMetrics(ov, { overallDscr: 1.8 }).dscr).toBe(1.8);
    expect(scorecardMetrics(ov, { overallDscr: null }).dscr).toBeUndefined();
    expect(scorecardMetrics(ov).dscr).toBeUndefined();
  });

  it('自己資本比率は貸借対照表から採点され、無ければ採点しない', () => {
    expect(scorecardMetrics(overviewOf(5_000_000, BS)).equityRatioPct).not.toBeUndefined();
    expect(scorecardMetrics(overviewOf(5_000_000, null)).equityRatioPct).toBeUndefined();
  });
});

/*
 * **`null` を `undefined` へ畳む所は、畳めていることを確かめる。** (2026-09-07)
 *
 * `buildManagementScorecard` の軸は `!== undefined` で採点を決めるので、
 * `null` が漏れると `band(null, …)` が **NaN** を返し、点数が NaN になる
 * (「採点しない」でも「0 点」でもない第 3 の状態)。畳み込みはこのモジュールの
 * 仕事なので、ここで留める。変異検査の生存 2 件がこの 2 か所だった。
 */
describe('scorecardMetrics — null は undefined へ畳む (NaN の点数を作らない)', () => {
  const noRunway = overviewOf(5_000_000, BS); // 会計連携が無いので runwayMonths は null

  it('ランウェイが無ければ undefined (null を渡さない)', () => {
    expect(noRunway.runwayMonths).toBeNull(); // 標本: 素の値は null
    expect(scorecardMetrics(noRunway).runwayMonths).toBeUndefined();
  });

  it('前期比成長率が無ければ undefined (期が 1 つだけ)', () => {
    expect(noRunway.kpi.revenueGrowthPct).toBeNull(); // 標本
    expect(scorecardMetrics(noRunway).revenueGrowthPct).toBeUndefined();
  });

  it('★ どの軸の点数も NaN にならない', () => {
    const card = buildManagementScorecard(scorecardMetrics(noRunway));
    for (const c of card.categories) {
      expect(Number.isNaN(c.score)).toBe(false);
      for (const comp of c.components) expect(Number.isNaN(comp.score)).toBe(false);
    }
    expect(Number.isNaN(card.overallScore)).toBe(false);
  });
});
