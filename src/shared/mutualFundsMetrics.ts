/**
 * 投資信託の積立シミュレーション・リスク指標 (概算試算)。
 *
 * **重要 — これは概算試算であり、投資助言ではありません。**
 * 将来価値は一定の年率リターンを仮定した試算で、実際の運用成績は変動し
 * 元本割れの可能性があります。過去の実績は将来を保証しません。
 */

function yen(n: number): number {
  return Math.round(n);
}

export interface CompoundingSimulation {
  /** 期間終了時の評価額 (円)。 */
  readonly futureValue: number;
  /** 累計拠出額 (円)。 */
  readonly totalContributed: number;
  /** 運用益 (評価額 − 拠出額)。 */
  readonly totalGain: number;
  /** 運用益率 (%)。 */
  readonly gainPct: number;
}

/**
 * 毎月一定額を積み立てた場合の将来価値を複利で試算する。
 *
 * 月利 r = (1 + 年率)^(1/12) − 1 として、毎月末積立の年金終価:
 *   FV = PMT × ((1+r)^n − 1) / r   (r>0)
 *   FV = PMT × n                    (r=0)
 *
 * @param monthlyContribution 月額積立額 (円)。負値は0。
 * @param annualReturnPct 期待年率リターン (%)。
 * @param years 積立年数。0 以下なら全0。
 */
export function calcCompoundingFutureValue(
  monthlyContribution: number,
  annualReturnPct: number,
  years: number,
): CompoundingSimulation {
  const pmt = Math.max(0, monthlyContribution);
  const yrs = Math.max(0, years);
  const n = Math.round(yrs * 12);
  // n=0 または pmt=0 のときは totalContributed=0・fvRaw=0・gainPct=0 と計算経路でも
  // すべて 0 に畳まれるため、早期 return ガードは冗長 (equivalent) として置かない。
  const totalContributed = pmt * n;
  // 月利 (年率を複利で月換算)。
  const r = Math.pow(1 + annualReturnPct / 100, 1 / 12) - 1;
  // r がほぼ 0 (年率0%等) のときは 0/0 を避けて元本そのまま。1e-12 ちょうどは
  // 浮動小数で到達不能のため < を <= にする EqualityOperator は equivalent。
  // Stryker disable next-line EqualityOperator
  const fvRaw = Math.abs(r) < 1e-12 ? pmt * n : pmt * ((Math.pow(1 + r, n) - 1) / r);
  const futureValue = yen(fvRaw);
  const totalGain = futureValue - totalContributed;
  const gainPct = totalContributed > 0 ? Math.round((totalGain / totalContributed) * 100 * 100) / 100 : 0;
  return { futureValue, totalContributed, totalGain, gainPct };
}

/**
 * シャープレシオ (リスク調整後リターン) を計算する。
 *   SR = (年率リターン − 無リスク金利) / 年率標準偏差
 *
 * 標準偏差が 0 以下のときは指標として定義できないため 0 を返す。
 *
 * @param annualReturnPct 年率リターン (%)
 * @param annualVolatilityPct 年率標準偏差 (%)
 * @param riskFreeRatePct 無リスク金利 (%)。既定 0.5%。
 */
export function calcSharpeRatio(
  annualReturnPct: number,
  annualVolatilityPct: number,
  riskFreeRatePct = 0.5,
): number {
  if (annualVolatilityPct <= 0) return 0;
  const sr = (annualReturnPct - riskFreeRatePct) / annualVolatilityPct;
  return Math.round(sr * 100) / 100;
}
