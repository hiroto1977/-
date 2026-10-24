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
import { scorecardMetrics, turnoverAxis } from '../overviewScorecard';
import { buildManagementScorecard } from '../../../shared/managementScorecard';
import { assetTurnoverRatio } from '../financialRatios';
import type { KpiActual } from '../kpiActuals';
import type { BalanceSheet } from '../balanceSheet';

/** 1 か月分の実績。期は `2026-MM`。 */
const kpi = (revenue: number, monthIndex = 2): KpiActual => ({
  period: `2026-${String(monthIndex + 1).padStart(2, '0')}`,
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

/**
 * **月商**と貸借対照表から経営サマリーを作る。既定は 12 か月分。
 *
 * 月数を引数にしてあるのは、**年換算が効いていること**を月数を振って確かめるため
 * (直す前は入力した月数に比例して回転率が動いた)。
 */
function overviewOf(
  monthlyRevenue: number,
  balanceSheet: BalanceSheet | null,
  months = 12,
): ReturnType<typeof buildBusinessOverview> {
  const input: OverviewInput = {
    plan: 'free',
    sales: [],
    kpiActuals: Array.from({ length: months }, (_, i) => kpi(monthlyRevenue, i)),
    balanceSheet,
    members: [],
  } as unknown as OverviewInput;
  return buildBusinessOverview(input);
}

/** 効率性カテゴリの軸ラベル。 */
function efficiencyLabels(monthlyRevenue: number, bs: BalanceSheet | null, months = 12): string[] {
  const card = buildManagementScorecard(scorecardMetrics(overviewOf(monthlyRevenue, bs, months)));
  const eff = card.categories.find((c) => c.category === 'efficiency');
  return (eff?.components ?? []).map((c) => c.label);
}

/** 効率性カテゴリの点数。 */
function efficiencyScore(monthlyRevenue: number, bs: BalanceSheet | null, months = 12): number | null {
  const card = buildManagementScorecard(scorecardMetrics(overviewOf(monthlyRevenue, bs, months)));
  return card.categories.find((c) => c.category === 'efficiency')?.score ?? null;
}

describe('scorecardMetrics — 総資産回転率', () => {
  it('対照: 売上が在れば軸は在る (以降の検査が意味を持つ前提)', () => {
    expect(efficiencyLabels(625_000, BS)).toContain('総資産回転率');
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
    const m = scorecardMetrics(overviewOf(625_000, null));
    expect(m.assetTurnover).toBeUndefined();
    expect(efficiencyLabels(625_000, null)).not.toContain('総資産回転率');
  });

  it('総資産 0 なら算定不能 (0 除算)', () => {
    const zero: BalanceSheet = { ...BS, currentAssets: 0, cash: 0, inventory: 0, accountsReceivable: 0, fixedAssets: 0 };
    expect(scorecardMetrics(overviewOf(625_000, zero)).assetTurnover).toBeUndefined();
  });

  it('財務指標の総資産回転率と同じ 1 つの算術を使う (分子は年換算した売上)', () => {
    // 月商 62.5 万 × 12 = 年商 750 万。総資産 500 万で 1.5 倍。
    const m = scorecardMetrics(overviewOf(625_000, BS));
    expect(m.assetTurnover).toBe(assetTurnoverRatio(7_500_000, 5_000_000));
    expect(m.assetTurnover).toBe(1.5);
  });

  it('★ 対照: 旧実装の条件を再現すると、売上 0 で軸が消える', () => {
    const ov = overviewOf(0, BS, 12);
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
    const m = scorecardMetrics(overviewOf(625_000, BS));
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
    const ov = overviewOf(625_000, BS);
    expect(scorecardMetrics(ov, { overallDscr: 1.8 }).dscr).toBe(1.8);
    expect(scorecardMetrics(ov, { overallDscr: null }).dscr).toBeUndefined();
    expect(scorecardMetrics(ov).dscr).toBeUndefined();
  });

  it('自己資本比率は貸借対照表から採点され、無ければ採点しない', () => {
    expect(scorecardMetrics(overviewOf(625_000, BS)).equityRatioPct).not.toBeUndefined();
    expect(scorecardMetrics(overviewOf(625_000, null)).equityRatioPct).toBeUndefined();
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
  const noRunway = overviewOf(625_000, BS); // 会計連携が無いので runwayMonths は null

  it('ランウェイが無ければ undefined (null を渡さない)', () => {
    expect(noRunway.runwayMonths).toBeNull(); // 標本: 素の値は null
    expect(scorecardMetrics(noRunway).runwayMonths).toBeUndefined();
  });

  it('前期比成長率が無ければ undefined (期が 1 つだけ)', () => {
    const oneMonth = overviewOf(625_000, BS, 1);
    expect(oneMonth.kpi.revenueGrowthPct).toBeNull(); // 標本: 素の値は null
    expect(scorecardMetrics(oneMonth).revenueGrowthPct).toBeUndefined();
  });

  it('対照: 期が 2 つ以上あれば成長率は採点される (畳み込みが何でも undefined にしない)', () => {
    expect(noRunway.kpi.revenueGrowthPct).not.toBeNull(); // 標本
    expect(scorecardMetrics(noRunway).revenueGrowthPct).not.toBeUndefined();
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

/*
 * **入力した月数で点数が動かないこと。** (2026-09-07)
 *
 * 総資産回転率は**流れ ÷ 溜まり**なので、分子を年に揃えないと比率の意味が定まらない。
 * 直す前の分子は `overview.kpi.revenue` (= 入力済みの全期の合計) だったため、
 * 同じ経営でも打ち込んだ月数に比例して回転率が上がった。実測:
 *
 *   1 か月 0.2 倍 (効率性 7) / 3 か月 0.6 倍 (20) / 6 か月 1.2 倍 (65) / 12 か月 2.4 倍 (88)
 *
 * 総合の格付けも 69 (good) → 80 (excellent) へ動いた。年換算は
 * `revenueLanding.runRateForecast` (実績 ÷ 経過月 × 12) が既に持っていて、
 * 上の実測ではどの月数でも 1,200 万だった —— 正しい数字が同じ `overview` の中に
 * 在るのに、回転率だけが素の合計を見ていた。
 */
describe('scorecardMetrics — 月数で点数が動かない (年換算)', () => {
  const MONTHLY = 1_000_000; // 月商 100 万・総資産 500 万 → 年商 1,200 万 → 2.4 倍

  it('★ 1 / 3 / 6 / 12 か月で回転率が同じ', () => {
    const seen = [1, 3, 6, 12].map((m) => scorecardMetrics(overviewOf(MONTHLY, BS, m)).assetTurnover);
    expect(seen).toEqual([2.4, 2.4, 2.4, 2.4]);
  });

  it('★ 効率性の点数も月数で動かない', () => {
    const seen = [1, 3, 6, 12].map((m) => efficiencyScore(MONTHLY, BS, m));
    expect(new Set(seen).size).toBe(1);
  });

  it('★ 対照: 素の合計を分子にすると月数で動く (直す前の姿)', () => {
    const raw = [1, 3, 6, 12].map((m) => {
      const ov = overviewOf(MONTHLY, BS, m);
      return assetTurnoverRatio(ov.kpi.revenue, ov.financialPosition!.totalAssets);
    });
    expect(raw).toEqual([0.2, 0.6, 1.2, 2.4]);
  });

  it('年換算した売上を分子に使っている (同じ overview の中の値)', () => {
    const ov = overviewOf(MONTHLY, BS, 3);
    expect(ov.kpi.revenueLanding?.runRateForecast).toBe(12_000_000);
    expect(scorecardMetrics(ov).assetTurnover).toBe(
      assetTurnoverRatio(12_000_000, ov.financialPosition!.totalAssets),
    );
  });

  it('売上 0 が 12 か月続いても 0 倍で採点される (年換算しても 0 は 0)', () => {
    expect(scorecardMetrics(overviewOf(0, BS, 12)).assetTurnover).toBe(0);
    expect(efficiencyLabels(0, BS, 12)).toContain('総資産回転率');
  });
});

/*
 * **`turnoverAxis` の「算定不能」3 条件と、それを支える不変条件。** (2026-09-07)
 *
 * `annualRevenue` が無い枝は production では到達しない (`hasData` が真なら
 * `revenueLanding` は必ず在る) が、**その不変条件は型では表せない**ので、
 * ここで両方留める —— 枝は関数を直接叩いて、不変条件は経営サマリーの側から。
 * `groupRevenueByPeriod` が期を選別するようになったら、不変条件の検査が先に鳴る。
 */
describe('turnoverAxis — 算定不能の 3 条件', () => {
  it('貸借対照表なし → undefined', () => {
    expect(turnoverAxis(null, 12_000_000)).toBeUndefined();
  });

  it('★ 年換算できない → undefined (素の合計へ倒さない)', () => {
    expect(turnoverAxis({ totalAssets: 5_000_000 }, undefined)).toBeUndefined();
  });

  it('総資産 0 → undefined', () => {
    expect(turnoverAxis({ totalAssets: 0 }, 12_000_000)).toBeUndefined();
  });

  it('揃っていれば倍率を返す', () => {
    expect(turnoverAxis({ totalAssets: 5_000_000 }, 12_000_000)).toBe(2.4);
  });

  it('★ 不変条件: KPI 実績が 1 件でもあれば年換算の基礎が在る', () => {
    for (const months of [1, 2, 12]) {
      const ov = overviewOf(1_000_000, BS, months);
      expect(ov.kpi.hasData).toBe(true);
      expect(ov.kpi.revenueLanding).not.toBeNull();
    }
    // 標本: 実績が無ければ両方とも「無い」側に倒れる。
    const empty = { plan: 'free', sales: [], kpiActuals: [], members: [] } as unknown as OverviewInput;
    const none = buildBusinessOverview(empty);
    expect(none.kpi.hasData).toBe(false);
    expect(none.kpi.revenueLanding).toBeNull();
  });

  it('★ KPI 実績が 1 件も無ければ、どの軸も採点しない (空を返す)', () => {
    const empty = { plan: 'free', sales: [], kpiActuals: [], members: [] } as unknown as OverviewInput;
    // 上の検査は `hasData === false` までしか見ていなかったので、`scorecardMetrics` の
    // 早期 return を消す変異体が生き残っていた (2026-09-07 実測)。**返り値まで見る。**
    //
    // **`toEqual({})` では足りない** —— vitest の `toEqual` は値が `undefined` の欄を
    // 無い欄として扱うので、早期 return を消しても「全部 undefined の物」が {} と等しく
    // 通ってしまう (これも実測で残った)。欄が**在るかどうか**を数える。
    expect(Object.keys(scorecardMetrics(buildBusinessOverview(empty)))).toEqual([]);
    // 対照: 実績が在れば空ではない。
    expect(Object.keys(scorecardMetrics(overviewOf(1_000_000, BS)))).not.toHaveLength(0);
  });
});

/**
 * **安全余裕率の軸 —— 算定不能 (`null`) は採点しない。** (2026-09-07)
 *
 * 安全余裕率は損益分岐点が存在しない (限界利益 ≤ 0) とき `null` になる。
 * `?? undefined` で軸を落とすのは、**0 に倒すと「損益分岐点上に居る」= 最も安全な
 * 読みで採点してしまう**ため (パス 28 の総資産回転率と逆向きの、同じ誤り)。
 * 畳み込みは両方向で留める —— 片側だけだと `??` の変異体が生き残る。
 */
describe('安全余裕率の軸', () => {
  const withSafetyMargin = (sm: number | null) => {
    const ov = overviewOf(1_000_000, BS);
    return scorecardMetrics({ ...ov, kpi: { ...ov.kpi, safetyMargin: sm } });
  };

  it('★ 算定不能 (null) は軸を落とす (0 として採点しない)', () => {
    expect(withSafetyMargin(null).safetyMarginPct).toBeUndefined();
  });

  it('★ 対照: 値が在ればそのまま渡す —— 負も 0 も落とさない', () => {
    expect(withSafetyMargin(-50).safetyMarginPct).toBe(-50);
    expect(withSafetyMargin(0).safetyMarginPct).toBe(0);
    expect(withSafetyMargin(35).safetyMarginPct).toBe(35);
  });

  it('負の安全余裕率は最低点として採点される (軸が消えない)', () => {
    const card = buildManagementScorecard(withSafetyMargin(-50));
    const safety = card.categories.find((c) => c.category === 'safety');
    const axis = (safety?.components ?? []).find((c) => c.label === '安全余裕率');
    expect(axis).toBeDefined();
    expect(axis?.score).toBe(0);
  });
});
