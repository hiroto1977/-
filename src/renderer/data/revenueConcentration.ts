/**
 * 売上集中度 (チャネル依存リスク) — 販売チャネルの構成から集中度を測る純粋ロジック。
 *
 * 資金調達の多様化スコア (fundingDiversification) の売上版。特定のチャネルへの
 * 依存が高いほど、そのチャネルの不調が経営に直撃する構造リスクとなる。
 * 売上集計の `byChannel` (シェア付き) を入力に取り、IO は持たない。
 *
 * **重要 — 概算の経営診断であり財務助言ではありません。**
 */

/** チャネル別の売上シェア (集計済み)。`summarizeSales` の byChannel と同形。 */
export interface ChannelShare {
  readonly label: string;
  readonly amount: number;
}

/** 売上集中度の指標。 */
export interface RevenueConcentration {
  /** 売上が 0 超のチャネル数。 */
  readonly channelsPresent: number;
  /** ハーフィンダール指数 (Σ シェア², 0..1; 1 = 1 チャネルに集中)。 */
  readonly hhi: number;
  /** 実効的なチャネル数 = 1 ÷ HHI (分散の目安)。 */
  readonly effectiveChannels: number;
  /** 最大シェアのチャネル。チャネルが無ければ null。 */
  readonly topChannel: string | null;
  /** 最大シェアの比率 (%)。 */
  readonly topSharePct: number;
  /** 分散スコア (0..100, 高いほど分散) = (1 − HHI) × 100。 */
  readonly diversityScore: number;
  /** 単一チャネル依存 (最大シェア > 60%) か。 */
  readonly singleChannelRisk: boolean;
}

/**
 * チャネル別売上から集中度 (HHI) を計算する。
 * 1 チャネルに偏るほど集中 (HHI→1, スコア→0)、均等に分散するほど多様
 * (HHI→0, スコア→100)。売上合計が 0 のときは算定不能 (null)。
 */
export function computeRevenueConcentration(
  channels: readonly ChannelShare[],
): RevenueConcentration | null {
  // amount===0 のチャネルを含めても合計/HHI/トップシェアに影響しないため、
  // > → >= の EqualityOperator は equivalent (負値除外は filter 本体で検証)。
  // Stryker disable next-line EqualityOperator
  const present = channels.filter((c) => c.amount > 0);
  const total = present.reduce((s, c) => s + c.amount, 0);
  if (total <= 0) return null;
  let hhi = 0;
  let topChannel: string | null = null;
  let topShare = 0;
  for (const c of present) {
    const share = c.amount / total;
    hhi += share * share;
    if (share > topShare) {
      topShare = share;
      topChannel = c.label;
    }
  }
  return {
    channelsPresent: present.length,
    hhi: Math.round(hhi * 1000) / 1000,
    effectiveChannels: Math.round((1 / hhi) * 10) / 10,
    topChannel,
    topSharePct: Math.round(topShare * 1000) / 10,
    diversityScore: Math.round((1 - hhi) * 100),
    singleChannelRisk: topShare > 0.6,
  };
}

// ---------------------------------------------------------------------------
// Round 73 — 取引先 (顧客) 集中度の精緻化 (加算的)
//
// 上記 computeRevenueConcentration はチャネル依存の 0..1 スケール HHI を返すが、
// 取引先 (顧客) 分析では公正取引委員会・反トラスト実務で標準の **0〜10000 スケール
// HHI** とそれに紐づく指標 (上位 N 集中度 CRn / パレート / 実効取引先数 / 喪失影響)
// が現場で使われる。既存関数とは別に、これらを純粋関数として追加する。
//
// **重要 — いずれも概算の経営診断であり財務・法務助言ではありません。**
// ---------------------------------------------------------------------------

/** 取引先 (顧客) 別の売上。`ChannelShare` と同形だが意味が「取引先」。 */
export type CustomerShare = ChannelShare;

/** 集中度の判定区分 (反トラスト実務の慣行的な閾値に準拠)。 */
export type ConcentrationLevel = 'low' | 'moderate' | 'high';

/** 標準スケール (0〜10000) の取引先集中度分析。 */
export interface CustomerConcentration {
  /** 売上が 0 超の取引先数。 */
  readonly customersPresent: number;
  /**
   * ハーフィンダール・ハーシュマン指数 = Σ(各取引先シェア%)²。
   * 0〜10000。単一取引先で 10000、均等 N 社で 10000/N。
   */
  readonly hhi: number;
  /** 集中度区分: 低 (<1500) / 中 (1500〜2500) / 高 (>2500)。 */
  readonly level: ConcentrationLevel;
  /** 実効取引先数 = 10000 ÷ HHI (有効な分散度の目安)。 */
  readonly effectiveCustomers: number;
  /** 最大シェアの取引先。取引先が無ければ null。 */
  readonly topCustomer: string | null;
  /** 最大シェアの比率 (%)。 */
  readonly topSharePct: number;
}

/** CRn (上位 N 集中度) の結果。 */
export interface TopNConcentration {
  /** 要求された N。 */
  readonly n: number;
  /** 集計対象になった実際の取引先数 (N と present 数の小さい方)。 */
  readonly countedCustomers: number;
  /** 上位 N 社の合計シェア (%)。 */
  readonly sharePct: number;
}

/** パレート分析 (累積シェアが threshold% に達するまでの取引先数)。 */
export interface ParetoAnalysis {
  /** 累積しきい値 (%) — 既定 80。 */
  readonly thresholdPct: number;
  /** 累積シェアが threshold% 以上に達するまでに要した取引先数 (主要顧客数)。 */
  readonly vitalFewCount: number;
  /** vitalFewCount が全取引先に占める割合 (%)。少ないほどパレート的 (偏り大)。 */
  readonly vitalFewPct: number;
  /** vitalFew が占める累積シェア (%) — 通常 threshold をやや超える。 */
  readonly coveredSharePct: number;
}

/** 集中リスク (最大依存先の喪失影響) 判定。 */
export interface ConcentrationRisk {
  /** 最大依存先。取引先が無ければ null。 */
  readonly topCustomer: string | null;
  /** 最大依存先のシェア (%)。 */
  readonly topSharePct: number;
  /** 最大依存先を失った場合に残る売上比率 (%) = 100 − topSharePct。 */
  readonly retainedSharePctIfLost: number;
  /** 単一取引先依存リスク (最大シェア > 30%) か。 */
  readonly singleCustomerRisk: boolean;
}

/** 正・有限のシェアだけを残し、降順ソートした配列を返す内部ヘルパ。 */
function positiveSharesDesc(
  customers: readonly CustomerShare[],
): { label: string; amount: number }[] {
  return customers
    .filter((c) => Number.isFinite(c.amount) && c.amount > 0)
    .map((c) => ({ label: c.label, amount: c.amount }))
    .sort((a, b) => b.amount - a.amount);
}

/**
 * 標準スケール (0〜10000) の取引先集中度を計算する。
 * 売上合計が 0 / 全て非正 / 非有限のときは算定不能 (null)。
 */
export function computeCustomerConcentration(
  customers: readonly CustomerShare[],
): CustomerConcentration | null {
  const present = positiveSharesDesc(customers);
  const total = present.reduce((s, c) => s + c.amount, 0);
  if (total <= 0) return null;
  let hhi = 0;
  let topShare = 0;
  let topCustomer: string | null = null;
  for (const c of present) {
    const sharePct = (c.amount / total) * 100;
    hhi += sharePct * sharePct;
    if (sharePct > topShare) {
      topShare = sharePct;
      topCustomer = c.label;
    }
  }
  const roundedHhi = Math.round(hhi);
  return {
    customersPresent: present.length,
    hhi: roundedHhi,
    level: classifyConcentration(roundedHhi),
    effectiveCustomers: Math.round((10000 / hhi) * 10) / 10,
    topCustomer,
    topSharePct: Math.round(topShare * 10) / 10,
  };
}

/**
 * HHI (0〜10000) を集中度区分に分類する。
 * 反トラスト実務: 低集中 <1500 / 中集中 1500〜2500 / 高集中 >2500。
 */
export function classifyConcentration(hhi: number): ConcentrationLevel {
  if (hhi > 2500) return 'high';
  if (hhi >= 1500) return 'moderate';
  return 'low';
}

/**
 * 上位 N 集中度 (CRn) — 上位 N 社の合計売上シェア (%)。
 * N <= 0 / 非整数 / 売上合計 0 のときは null。
 */
export function computeTopNConcentration(
  customers: readonly CustomerShare[],
  n: number,
): TopNConcentration | null {
  if (!Number.isInteger(n) || n <= 0) return null;
  const present = positiveSharesDesc(customers);
  const total = present.reduce((s, c) => s + c.amount, 0);
  if (total <= 0) return null;
  const counted = Math.min(n, present.length);
  let topSum = 0;
  for (let i = 0; i < counted; i++) {
    topSum += present[i]!.amount;
  }
  return {
    n,
    countedCustomers: counted,
    sharePct: Math.round((topSum / total) * 1000) / 10,
  };
}

/**
 * パレート分析 — 累積シェアが threshold% に達するまでの取引先数 (主要顧客数)。
 * threshold は 0 超 100 以下。売上合計 0 のときは null。
 */
export function computePareto(
  customers: readonly CustomerShare[],
  thresholdPct = 80,
): ParetoAnalysis | null {
  if (!Number.isFinite(thresholdPct) || thresholdPct <= 0 || thresholdPct > 100) return null;
  const present = positiveSharesDesc(customers);
  const total = present.reduce((s, c) => s + c.amount, 0);
  if (total <= 0) return null;
  let cumulative = 0;
  let count = 0;
  for (const c of present) {
    cumulative += c.amount;
    count++;
    if ((cumulative / total) * 100 >= thresholdPct) break;
  }
  return {
    thresholdPct,
    vitalFewCount: count,
    vitalFewPct: Math.round((count / present.length) * 1000) / 10,
    coveredSharePct: Math.round((cumulative / total) * 1000) / 10,
  };
}

/**
 * 集中リスク — 最大依存先のシェアと、その喪失時に残る売上比率。
 * 売上合計 0 のときは null。
 */
export function assessConcentrationRisk(
  customers: readonly CustomerShare[],
): ConcentrationRisk | null {
  const present = positiveSharesDesc(customers);
  const total = present.reduce((s, c) => s + c.amount, 0);
  if (total <= 0) return null;
  // 降順ソート済みなので先頭が最大。total > 0 より present は非空。
  const top = present[0]!;
  const topSharePct = (top.amount / total) * 100;
  const roundedTop = Math.round(topSharePct * 10) / 10;
  return {
    topCustomer: top.label,
    topSharePct: roundedTop,
    retainedSharePctIfLost: Math.round((100 - topSharePct) * 10) / 10,
    singleCustomerRisk: topSharePct > 30,
  };
}
