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
  // 呼び出しは全て hi>lo (例 0..10 / -10..20)。hi<=lo はゼロ除算回避の防御で到達不能。
  // Stryker disable next-line ConditionalExpression,EqualityOperator
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

// ────────────────────────────────────────────────────────────────────────────
// 加算的な精緻化 (round 72) — 既存の overallScore / verdict / カテゴリ採点は変えず、
// 別関数として「加重総合」「業種ベンチマーク比較」「スコアのトレンド」「弱点優先度」
// を提供する。すべて純粋関数で IO を持たず、概算の経営診断にすぎない (財務助言ではない)。
// ────────────────────────────────────────────────────────────────────────────

/** カテゴリ識別子 (CategoryScore.category と同一)。 */
export type ScorecardCategory = CategoryScore['category'];

/** カテゴリ別の重み (任意指定)。未指定カテゴリは既定の均等重み 1 として扱う。 */
export type CategoryWeights = Partial<Record<ScorecardCategory, number>>;

/** 加重総合スコアの結果。 */
export interface WeightedOverall {
  /** 加重平均した総合スコア (0..100)。算定可能なカテゴリが無い場合は null。 */
  readonly score: number | null;
  /** 判定 (overallScore と同じ 80/60/40 境界)。score が null の場合は null。 */
  readonly verdict: ManagementScorecard['verdict'] | null;
  /** 実際に採点へ寄与したカテゴリ (score が非 null かつ重み>0)。 */
  readonly contributing: readonly ScorecardCategory[];
  /** 重みの合計 (有効カテゴリ分のみ)。0 のとき score は null。 */
  readonly weightSum: number;
}

/**
 * カテゴリ別の重みで総合スコアを再計算する (既存 overallScore は均等平均のまま不変)。
 *
 * - 重み未指定のカテゴリは 1 (既定の均等)。`{}` を渡すと既存 overallScore と一致する。
 * - 重みが負・非有限のカテゴリは無効 (重み 0 扱い) としてスキップ。
 * - score が null のカテゴリ、および重み 0 のカテゴリは分母に入れない。
 * - 有効カテゴリが無い (全 null / 全重み 0) 場合は score=null, verdict=null。
 *
 * 概算注記: 重みは利用者の経営方針 (例: 安全性重視) を反映するための主観値であり、
 * 業種・規模で適正な配分は異なります。
 */
export function weightedOverallScore(
  scorecard: ManagementScorecard,
  weights: CategoryWeights = {},
): WeightedOverall {
  let weightSum = 0;
  let acc = 0;
  const contributing: ScorecardCategory[] = [];
  for (const c of scorecard.categories) {
    if (c.score === null) continue;
    const raw = weights[c.category];
    const w = raw === undefined ? 1 : raw;
    // 負・非有限・0 の重みは寄与しない。
    if (!Number.isFinite(w) || w <= 0) continue;
    weightSum += w;
    acc += c.score * w;
    contributing.push(c.category);
  }
  if (weightSum <= 0) {
    return { score: null, verdict: null, contributing, weightSum: 0 };
  }
  const score = Math.round(acc / weightSum);
  const verdict: ManagementScorecard['verdict'] =
    score >= 80 ? 'excellent' : score >= 60 ? 'good' : score >= 40 ? 'caution' : 'poor';
  return { score, verdict, contributing, weightSum };
}

/** 業種標準値: 各指標の平均 (mean) と標準偏差 (sd, >0)。 */
export interface IndustryBenchmark {
  readonly metric: keyof ManagementMetricsInput;
  /** 業種平均値。 */
  readonly mean: number;
  /** 標準偏差 (>0)。0・負・非有限なら z スコアは算定不能 (null)。 */
  readonly sd: number;
  /** 大きいほど良い指標か (既定 true)。CCC のように小さいほど良い指標は false。 */
  readonly higherIsBetter?: boolean;
}

/** 1 指標のベンチマーク比較結果。 */
export interface BenchmarkComparison {
  readonly metric: keyof ManagementMetricsInput;
  /** 自社の実測値。 */
  readonly actual: number;
  /** 業種平均。 */
  readonly mean: number;
  /** 偏差 = 実測 − 平均 (符号付き)。 */
  readonly delta: number;
  /** 平均比 (%): delta ÷ |mean| × 100。mean=0 のときは null。 */
  readonly pctOfMean: number | null;
  /** z スコア = (実測 − 平均) ÷ sd。sd<=0・非有限のときは null。 */
  readonly zScore: number | null;
  /** 優劣判定。higherIsBetter を加味した「業種比で優れているか」。 */
  readonly standing: 'above' | 'below' | 'inline';
}

/**
 * 各指標を業種標準値と比較し、偏差 (delta) / 平均比 (%) / z スコア / 優劣を返す。
 *
 * - 入力 metrics に値が無い指標、ベンチマーク mean が非有限の指標はスキップ。
 * - sd<=0・非有限のとき zScore は null (= 標準化不能)。mean=0 のとき pctOfMean は null。
 * - standing: |delta| が sd の 0.25 倍以下なら 'inline'。それ以外は higherIsBetter に
 *   応じて、良い側なら 'above'、悪い側なら 'below'。sd が無効な場合は許容帯 0 = delta の符号で判定。
 *
 * 概算注記: 業種標準値そのものは利用者が与える前提値であり、本関数はその妥当性を
 * 検証しません。z スコアは正規分布を仮定した目安です。
 */
export function compareToIndustry(
  metrics: ManagementMetricsInput,
  benchmarks: readonly IndustryBenchmark[],
): readonly BenchmarkComparison[] {
  const out: BenchmarkComparison[] = [];
  for (const b of benchmarks) {
    const raw = metrics[b.metric];
    // raw: number | undefined。undefined / 非有限 / 非有限 mean をまとめて弾く。
    // Number.isFinite は undefined にも false を返すので、これが型ガードを兼ねる。
    if (!Number.isFinite(raw) || !Number.isFinite(b.mean)) continue;
    const actual = raw as number;
    const higherIsBetter = b.higherIsBetter ?? true;
    const delta = actual - b.mean;
    const pctOfMean = b.mean === 0 ? null : (delta / Math.abs(b.mean)) * 100;
    const sdValid = Number.isFinite(b.sd) && b.sd > 0;
    const zScore = sdValid ? delta / b.sd : null;
    // 「平均並み」の判定幅: sd が有効ならその 0.25 倍を許容帯とする。
    const tolerance = sdValid ? b.sd * 0.25 : 0;
    let standing: BenchmarkComparison['standing'];
    if (Math.abs(delta) <= tolerance) {
      standing = 'inline';
    } else {
      // この else は |delta| > tolerance のときだけ到達する。tolerance>=0 なので delta は
      // 必ず非 0 (delta===0 は上の inline 分岐)。よって `> 0`→`>= 0` / `< 0`→`<= 0` の
      // 等価変異は到達不能で観測差を生まない (equivalent)。
      // Stryker disable next-line EqualityOperator
      const betterSide = higherIsBetter ? delta > 0 : delta < 0;
      standing = betterSide ? 'above' : 'below';
    }
    out.push({ metric: b.metric, actual, mean: b.mean, delta, pctOfMean, zScore, standing });
  }
  return out;
}

/** スコアのトレンド分析結果。 */
export interface ScoreTrend {
  /** 系列の傾き (1 期間あたりの平均変化、最小二乗法)。算定不能なら null。 */
  readonly slope: number | null;
  /** 直近変化 = 末尾 − その 1 つ前。要素 2 未満なら null。 */
  readonly latestChange: number | null;
  /** 系列の起点→終点の総変化。要素 2 未満なら null。 */
  readonly totalChange: number | null;
  /** 方向判定 (傾きベース)。算定不能なら 'flat'。 */
  readonly direction: 'improving' | 'declining' | 'flat';
  /** 有効に使用したデータ点数。 */
  readonly points: number;
}

/**
 * 過去スコア系列 (古い→新しい) から傾き・直近変化・総変化を算出する。
 *
 * - 非有限値は除外。除外後 0 点なら全 null・direction 'flat'・points 0。
 * - 1 点のみなら slope は 0 (変化なし)、latestChange/totalChange は null、points 1。
 * - slope は等間隔 (t=0,1,2,…) を仮定した最小二乗回帰。|slope|<=epsilon は 'flat'。
 *
 * 概算注記: 等間隔・線形トレンドの仮定に基づく目安であり、季節性や外れ値は考慮しません。
 */
export function scoreTrend(history: readonly number[], epsilon = 0.5): ScoreTrend {
  const xs = history.filter((v) => Number.isFinite(v));
  const n = xs.length;
  if (n === 0) {
    return { slope: null, latestChange: null, totalChange: null, direction: 'flat', points: 0 };
  }
  if (n === 1) {
    return { slope: 0, latestChange: null, totalChange: null, direction: 'flat', points: 1 };
  }
  // 最小二乗回帰の傾き: t = 0..n-1 (等間隔)。分母 = Σ(t−t̄)² は n>=2 で必ず >0。
  // 数学的に Σ dt = 0 なので numerator から平均 ȳ 項は相殺される (Σ dt*(y−ȳ) = Σ dt*y)。
  // ゆえに ȳ を計算せず Σ dt*y を直接使う。
  const meanT = (n - 1) / 2;
  let num = 0;
  let den = 0;
  for (let t = 0; t < n; t += 1) {
    const dt = t - meanT;
    num += dt * xs[t]!;
    den += dt * dt;
  }
  const slope = num / den;
  const latestChange = xs[n - 1]! - xs[n - 2]!;
  const totalChange = xs[n - 1]! - xs[0]!;
  const direction: ScoreTrend['direction'] =
    slope > epsilon ? 'improving' : slope < -epsilon ? 'declining' : 'flat';
  return { slope, latestChange, totalChange, direction, points: n };
}

/** 弱点 (改善優先) カテゴリの 1 件。 */
export interface WeaknessPriority {
  readonly category: ScorecardCategory;
  readonly label: string;
  /** 現在スコア (0..100)。 */
  readonly score: number;
  /** 重要度 (重み)。weights 未指定なら 1。 */
  readonly importance: number;
  /** 伸びしろ = 100 − score (0..100)。 */
  readonly headroom: number;
  /** 優先度 = importance × headroom。降順に並ぶ。 */
  readonly priority: number;
}

/**
 * 低スコアカテゴリを「重要度 × 伸びしろ」で優先順位付けする。
 *
 * - score が null のカテゴリは対象外。
 * - 重み (importance) は weights 指定 (未指定 1)。負・非有限・0 の重みは無効として除外。
 * - threshold 未満の score のみを弱点候補とする (既定 100 = 満点未満は全て候補)。
 * - priority 降順。同点は元の categories 順を維持 (安定ソート)。
 *
 * 概算注記: 伸びしろ (100−score) は満点を理想とした単純な距離であり、現実の改善容易性や
 * 投資対効果は反映しません。
 */
export function prioritizeWeaknesses(
  scorecard: ManagementScorecard,
  weights: CategoryWeights = {},
  threshold = 100,
): readonly WeaknessPriority[] {
  const out: WeaknessPriority[] = [];
  for (const c of scorecard.categories) {
    if (c.score === null) continue;
    if (!(c.score < threshold)) continue;
    const raw = weights[c.category];
    const importance = raw === undefined ? 1 : raw;
    if (!Number.isFinite(importance) || importance <= 0) continue;
    const headroom = 100 - c.score;
    out.push({
      category: c.category,
      label: c.label,
      score: c.score,
      importance,
      headroom,
      priority: importance * headroom,
    });
  }
  // priority 降順。Array.prototype.sort は ES2019 以降で安定なので、同点は
  // push した元の categories 順 (= 入力順) がそのまま保たれる。
  return out.sort((a, b) => b.priority - a.priority);
}
