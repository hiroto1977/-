/**
 * 家計・貯蓄計画 (savings planning) — 概算試算。
 *
 * 目標達成に必要な毎月積立額・72 の法則 (資産倍増年数)・緊急予備資金を求める
 * 純粋関数群。毎月末積立・年率一定を仮定した概算で、IO は持たない。
 *
 * **重要 — 概算試算であり投資助言ではありません。** 実際の運用成績は変動し、
 * 元本割れの可能性があります。
 */

/** 月利 r = (1 + 年率)^(1/12) − 1。年率は % 値 (5 → 0.05)。 */
function monthlyRate(annualRatePct: number): number {
  return Math.pow(1 + annualRatePct / 100, 1 / 12) - 1;
}

const yen = (n: number): number => Math.round(n);

/**
 * 目標額に到達するために必要な毎月積立額 (年金終価の逆算)。
 *
 * FV = PMT × ((1 + r)^n − 1) / r  を PMT について解く。r≈0 のときは PMT = FV / n。
 * 目標額・年数が 0 以下なら 0。
 *
 * @param targetFutureValue 目標額 (円)
 * @param annualRatePct 想定年率 (%)
 * @param years 積立年数
 */
export function requiredMonthlyContribution(
  targetFutureValue: number,
  annualRatePct: number,
  years: number,
): number {
  // years <= 0 は下の n <= 0 (= round(years*12)) で捕捉されるため、ここでは
  // targetFutureValue のみ判定する。targetFutureValue===0 は計算経路でも 0 に
  // なり <= → < は equivalent のため EqualityOperator を無効化。
  // Stryker disable next-line EqualityOperator
  if (targetFutureValue <= 0) return 0;
  const n = Math.round(years * 12);
  if (n <= 0) return 0;
  const r = monthlyRate(annualRatePct);
  // r がほぼ 0 のとき元本均等割。1e-9 ちょうどは浮動小数で到達不能 → < / <= は equivalent。
  // Stryker disable next-line EqualityOperator
  if (Math.abs(r) < 1e-9) return yen(targetFutureValue / n);
  const factor = (Math.pow(1 + r, n) - 1) / r;
  // 防御分岐: 有効な年率では r≠0 のとき factor>0 が常に成立し、この分岐には到達しない
  // (異常な負率に対する除算保護)。到達不能のため各 mutator を無効化する。
  // Stryker disable next-line ConditionalExpression,EqualityOperator,ArithmeticOperator
  if (factor <= 0) return yen(targetFutureValue / n);
  return yen(targetFutureValue / factor);
}

/**
 * 72 の法則 — 資産が倍になるおおよその年数 = 72 ÷ 年率(%)。
 * 年率が 0 以下なら null (倍増しない / 算定不能)。
 */
export function yearsToDouble(annualRatePct: number): number | null {
  if (annualRatePct <= 0) return null;
  return Math.round((72 / annualRatePct) * 10) / 10;
}

/**
 * 緊急予備資金 = 毎月の生活費 (支出) × 月数。
 * 月数の既定は 6 (一般的な目安: 会社員 3〜6 / 自営 6〜12 か月)。
 */
export function emergencyFund(monthlyExpense: number, months = 6): number {
  const e = Math.max(0, monthlyExpense);
  const m = Math.max(0, months);
  return yen(e * m);
}
