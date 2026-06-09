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

// ---------------------------------------------------------------------------
// 追加指標 (round63) — いずれも純粋関数・概算試算であり投資助言ではありません。
// 既存関数の挙動は変更していません (加算的)。
// ---------------------------------------------------------------------------

/** 複利頻度。月複利 (monthly) と年複利 (annual) を区別する。 */
export type CompoundingFrequency = 'monthly' | 'annual';

/**
 * 複利頻度を選べる将来価値 (毎月末積立)。
 *
 * - `monthly`: 月利 r = (1 + 年率)^(1/12) − 1 を用い毎月複利。
 * - `annual` : 年 1 回複利。その年に積み立てた 12 × PMT は年内は無利息で、年末に
 *   既存残高 (前年までの繰越) にのみ年率を乗じてから当年積立を加える近似
 *   (利息付与は年 1 回・当年積立は翌年から運用)。同じ名目年率なら monthly より低くなる。
 *
 * 毎月積立額・年数が 0 以下、または非有限なら 0。
 *
 * @param monthlyContribution 毎月積立額 (円)
 * @param annualRatePct 想定年率 (%)
 * @param years 積立年数
 * @param frequency 複利頻度 (既定 'monthly')
 */
export function futureValueWithFrequency(
  monthlyContribution: number,
  annualRatePct: number,
  years: number,
  // 既定は月複利。分岐は frequency==='annual' のみを判定するため、'monthly' を
  // 他の文字列に変えても monthly 経路に落ち結果は不変 (equivalent) → StringLiteral 無効化。
  // Stryker disable next-line StringLiteral
  frequency: CompoundingFrequency = 'monthly',
): number {
  if (!Number.isFinite(monthlyContribution) || !Number.isFinite(annualRatePct) || !Number.isFinite(years)) {
    return 0;
  }
  // 負の積立額・年数は 0 にクランプ。これ以降 pmt>=0・yrs>=0 が保証され、
  // 年数 0 (= periods/n が 0) のときは各計算経路がそのまま 0 を返すため、
  // 追加の <=0 早期 return ガードは冗長 (equivalent) として置かない。
  const pmt = Math.max(0, monthlyContribution);
  const yrs = Math.max(0, years);

  if (frequency === 'annual') {
    const annual = annualRatePct / 100;
    const yearlyContribution = pmt * 12;
    const periods = Math.round(yrs);
    let balance = 0;
    for (let i = 0; i < periods; i += 1) {
      // 既存残高にのみ利息を付与し、当年積立を年末に無利息で加える。
      balance = balance * (1 + annual) + yearlyContribution;
    }
    return yen(balance);
  }

  const n = Math.round(yrs * 12);
  const r = monthlyRate(annualRatePct);
  // r がほぼ 0 のとき元本そのまま。1e-9 ちょうどは浮動小数で到達不能 → < / <= は equivalent。
  // Stryker disable next-line EqualityOperator
  if (Math.abs(r) < 1e-9) return yen(pmt * n);
  return yen(pmt * ((Math.pow(1 + r, n) - 1) / r));
}

/**
 * インフレ調整後の実質価値。将来の名目額を、実質購買力 (現在価値) に割り引く。
 *
 *   実質値 = 名目額 / (1 + インフレ率)^年数
 *
 * 年数が 0 以下なら割引なし (= 名目額をそのまま丸めて返す)。名目額・インフレ率・
 * 年数が非有限なら 0。インフレ率が −100% 以下 (= 1 + i <= 0) は実質値が定義できない
 * ため 0 を返す。
 *
 * @param nominalAmount 将来の名目額 (円)
 * @param annualInflationPct 年率インフレ率 (%)
 * @param years 経過年数
 */
export function inflationAdjustedValue(
  nominalAmount: number,
  annualInflationPct: number,
  years: number,
): number {
  if (!Number.isFinite(nominalAmount) || !Number.isFinite(annualInflationPct) || !Number.isFinite(years)) {
    return 0;
  }
  // years<0 は割引でなく増価になってしまうため早期 return が必要。years===0 ちょうどは
  // 下の式でも pow(1+i,0)=1 → nominal と一致するため <= → < は equivalent。
  // Stryker disable next-line EqualityOperator
  if (years <= 0) return yen(nominalAmount);
  const i = annualInflationPct / 100;
  // 1 + i <= 0 は割引係数が 0 以下/負になり実質値を定義できない。
  if (1 + i <= 0) return 0;
  return yen(nominalAmount / Math.pow(1 + i, years));
}

/**
 * 実質利回り (フィッシャー方程式) = (1 + 名目) / (1 + インフレ) − 1。% 値で返す。
 *
 * 名目・インフレ率が非有限なら null。1 + インフレ率 <= 0 (−100% 以下) は定義不能で null。
 *
 * @param nominalRatePct 名目年率 (%)
 * @param annualInflationPct 年率インフレ率 (%)
 */
export function realRateOfReturn(
  nominalRatePct: number,
  annualInflationPct: number,
): number | null {
  if (!Number.isFinite(nominalRatePct) || !Number.isFinite(annualInflationPct)) return null;
  const nominal = nominalRatePct / 100;
  const inflation = annualInflationPct / 100;
  if (1 + inflation <= 0) return null;
  const real = (1 + nominal) / (1 + inflation) - 1;
  return Math.round(real * 100 * 100) / 100;
}

/** 緊急予備資金の充足状況。 */
export interface EmergencyFundCoverage {
  /** 目標とする緊急予備資金 (円)。 */
  readonly target: number;
  /** 充足率 (%)。target が 0 のときは現預金があれば 100、なければ 0。 */
  readonly coveragePct: number;
  /** 目標に対する不足額 (円)。充足済みなら 0。 */
  readonly shortfall: number;
  /** 現預金でまかなえる月数 (小数第 1 位)。月支出が 0 以下なら null。 */
  readonly monthsCovered: number | null;
}

/**
 * 緊急予備資金の充足率。現預金が「月支出 × 月数」の目標をどれだけ満たすか。
 *
 * @param cashOnHand 現預金 (円)
 * @param monthlyExpense 毎月の生活費 (円)
 * @param months 目標月数 (既定 6)
 */
export function emergencyFundCoverage(
  cashOnHand: number,
  monthlyExpense: number,
  months = 6,
): EmergencyFundCoverage {
  const cash = Number.isFinite(cashOnHand) ? Math.max(0, cashOnHand) : 0;
  const expense = Number.isFinite(monthlyExpense) ? Math.max(0, monthlyExpense) : 0;
  const m = Number.isFinite(months) ? Math.max(0, months) : 0;
  const target = yen(expense * m);

  let coveragePct: number;
  if (target <= 0) {
    coveragePct = cash > 0 ? 100 : 0;
  } else {
    coveragePct = Math.round((cash / target) * 100 * 10) / 10;
  }

  const shortfall = Math.max(0, target - cash);
  const monthsCovered = expense > 0 ? Math.round((cash / expense) * 10) / 10 : null;

  return { target, coveragePct, shortfall, monthsCovered };
}

/** 目標達成見込みの判定結果。 */
export interface GoalProjection {
  /** 現行積立で到達する将来価値 (円)。 */
  readonly projected: number;
  /** 目標額に届くか。 */
  readonly onTrack: boolean;
  /** 目標に対する不足額 (円)。届くなら 0。 */
  readonly shortfall: number;
  /** 目標達成に必要な毎月積立額 (円)。 */
  readonly requiredMonthly: number;
  /** 目標達成に必要な追加積立額 = 必要額 − 現行 (円)。既に十分なら 0。 */
  readonly additionalMonthly: number;
}

/**
 * 現行の毎月積立で目標期日に目標額へ届くかを判定し、不足額・必要追加額を求める。
 *
 * 将来価値は月複利 (年金終価) で概算。目標額・年数が 0 以下なら不足 0・必要額 0 を返す。
 *
 * @param currentMonthly 現行の毎月積立額 (円)
 * @param targetFutureValue 目標額 (円)
 * @param annualRatePct 想定年率 (%)
 * @param years 積立年数
 */
export function goalProjection(
  currentMonthly: number,
  targetFutureValue: number,
  annualRatePct: number,
  years: number,
): GoalProjection {
  const current = Number.isFinite(currentMonthly) ? Math.max(0, currentMonthly) : 0;
  // requiredMonthlyContribution が月複利前提のため、見込み額も 'monthly' で整合させる。
  // 'annual' 以外の文字列は monthly 経路に落ち結果不変 (equivalent) → StringLiteral 無効化。
  // Stryker disable next-line StringLiteral
  const projected = futureValueWithFrequency(current, annualRatePct, years, 'monthly');
  const requiredMonthly = requiredMonthlyContribution(targetFutureValue, annualRatePct, years);
  const target = Number.isFinite(targetFutureValue) ? Math.max(0, targetFutureValue) : 0;

  const onTrack = projected >= target;
  const shortfall = Math.max(0, target - projected);
  const additionalMonthly = Math.max(0, requiredMonthly - current);

  return { projected, onTrack, shortfall, requiredMonthly, additionalMonthly };
}
