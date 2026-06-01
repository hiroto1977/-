/**
 * 経営スコアカード — 各領域で算出した経営指標を 1 つの健全性スコアに集約する。
 *
 * **重要 — これは概算の経営診断であり、財務助言ではありません。**
 * 収益性・安全性・資金繰り・効率の各カテゴリを 0..100 で採点し、加重平均で
 * 総合経営スコアを出します。入力は各純粋関数 (computeKpi / debtServiceMetrics /
 * fundingQualityScore 等) が算出済みの値で、本モジュールは IO を持ちません。
 * しきい値は中小企業の一般的な目安であり、業種・規模で適正値は異なります。
 */

/** スコアカードに渡す経営指標 (各領域の算出済み値)。すべて任意。 */
export interface ManagementMetricsInput {
  /** 営業利益率 (%) = 営業利益 ÷ 売上 × 100。 */
  readonly operatingMarginPct?: number;
  /** 売上総利益率 (粗利率, %) = 売上総利益 ÷ 売上 × 100。 */
  readonly grossMarginPct?: number;
  /** 限界利益率 (%)。 */
  readonly contributionRatioPct?: number;
  /** 安全余裕率 (%) = 100 − 損益分岐点比率。 */
  readonly safetyMarginPct?: number;
  /** 自己資本比率 (%) = 自己資本 ÷ 総資本 × 100。 */
  readonly equityRatioPct?: number;
  /** 返済余力 DSCR (営業CF ÷ 返済額)。 */
  readonly dscr?: number;
  /** キャッシュ・ランウェイ (月数)。資金が尽きるまでの月数。 */
  readonly runwayMonths?: number;
  /** 売上高成長率 (%, 前年比)。 */
  readonly revenueGrowthPct?: number;
  /** キャッシュ・コンバージョン・サイクル (日)。短いほど良い。 */
  readonly cashConversionDays?: number;
  /** 総資産回転率 (回/年) = 売上 ÷ 総資産。 */
  readonly assetTurnover?: number;
}

/** カテゴリ別スコア。 */
export interface CategoryScore {
  readonly category: 'profitability' | 'safety' | 'liquidity' | 'growth' | 'efficiency';
  readonly label: string;
  /** 0..100。指標が無い場合は null。 */
  readonly score: number | null;
  /** 採点に使った指標の内訳 (ラベル → 0..100)。 */
  readonly components: ReadonlyArray<{ readonly label: string; readonly score: number }>;
}

/** 総合スコアカード。 */
export interface ManagementScorecard {
  readonly categories: readonly CategoryScore[];
  /** 総合経営スコア (0..100)。算定可能なカテゴリの平均。 */
  readonly overallScore: number;
  /** 判定 (要改善 / 注意 / 良好 / 優良)。 */
  readonly verdict: 'poor' | 'caution' | 'good' | 'excellent';
  /** 改善のヒント (低スコアのカテゴリ)。 */
  readonly alerts: readonly string[];
}

/** 値を [lo, hi] で 0..100 に線形マップし、範囲外はクランプ。 */
function band(value: number, lo: number, hi: number): number {
  if (hi <= lo) return 0;
  const t = (value - lo) / (hi - lo);
  return Math.round(Math.min(1, Math.max(0, t)) * 100);
}

/** 指標群を平均して 0..100 のカテゴリスコアにする (空なら null)。 */
function avg(components: ReadonlyArray<{ label: string; score: number }>): number | null {
  if (components.length === 0) return null;
  return Math.round(components.reduce((s, c) => s + c.score, 0) / components.length);
}

/**
 * 経営指標を集約して健全性スコアカードを作る。
 *
 * カテゴリと採点の目安 (中小企業の一般的水準):
 * - 収益性: 営業利益率 0%→10%、粗利率 0%→40%、限界利益率 0%→60% を各 0→100
 * - 安全性: 安全余裕率 0%→40% を 0→100、自己資本比率 0%→50% を 0→100
 * - 資金繰り: DSCR 0→2.0 を 0→100、ランウェイ 0→12か月 を 0→100
 * - 成長: 売上成長率 −10%→+20% を 0→100
 */
export function buildManagementScorecard(m: ManagementMetricsInput): ManagementScorecard {
  const profitability: { label: string; score: number }[] = [];
  if (m.operatingMarginPct !== undefined) profitability.push({ label: '営業利益率', score: band(m.operatingMarginPct, 0, 10) });
  if (m.grossMarginPct !== undefined) profitability.push({ label: '粗利率', score: band(m.grossMarginPct, 0, 40) });
  if (m.contributionRatioPct !== undefined) profitability.push({ label: '限界利益率', score: band(m.contributionRatioPct, 0, 60) });

  const safety: { label: string; score: number }[] = [];
  if (m.safetyMarginPct !== undefined) safety.push({ label: '安全余裕率', score: band(m.safetyMarginPct, 0, 40) });
  if (m.equityRatioPct !== undefined) safety.push({ label: '自己資本比率', score: band(m.equityRatioPct, 0, 50) });

  const liquidity: { label: string; score: number }[] = [];
  if (m.dscr !== undefined) liquidity.push({ label: 'DSCR', score: band(m.dscr, 0, 2) });
  if (m.runwayMonths !== undefined) liquidity.push({ label: 'ランウェイ', score: band(m.runwayMonths, 0, 12) });

  const growth: { label: string; score: number }[] = [];
  if (m.revenueGrowthPct !== undefined) growth.push({ label: '売上成長率', score: band(m.revenueGrowthPct, -10, 20) });

  const efficiency: { label: string; score: number }[] = [];
  // CCC は短いほど良い (反転): 0日→100, 90日→0。マイナス(調達超過)は 100 にクランプ。
  if (m.cashConversionDays !== undefined) efficiency.push({ label: 'CCC', score: band(90 - m.cashConversionDays, 0, 90) });
  if (m.assetTurnover !== undefined) efficiency.push({ label: '総資産回転率', score: band(m.assetTurnover, 0, 1.5) });

  const categories: CategoryScore[] = [
    { category: 'profitability', label: '収益性', score: avg(profitability), components: profitability },
    { category: 'safety', label: '安全性', score: avg(safety), components: safety },
    { category: 'liquidity', label: '資金繰り', score: avg(liquidity), components: liquidity },
    { category: 'efficiency', label: '効率性', score: avg(efficiency), components: efficiency },
    { category: 'growth', label: '成長性', score: avg(growth), components: growth },
  ];

  const scored = categories.filter((c) => c.score !== null) as Array<CategoryScore & { score: number }>;
  const overallScore = scored.length > 0
    ? Math.round(scored.reduce((s, c) => s + c.score, 0) / scored.length)
    : 0;
  const verdict: ManagementScorecard['verdict'] =
    overallScore >= 80 ? 'excellent' : overallScore >= 60 ? 'good' : overallScore >= 40 ? 'caution' : 'poor';

  const alerts: string[] = [];
  for (const c of scored) {
    if (c.score < 40) alerts.push(`${c.label}が低水準 (${c.score}/100) — 改善を検討`);
  }

  return { categories, overallScore, verdict, alerts };
}
