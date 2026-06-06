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

function pct2(n: number): number {
  return Math.round(n * 100) / 100;
}

function isFiniteNumber(n: number): boolean {
  // 引数は型で number 保証済み。NaN / ±Infinity のみを弾く。
  return Number.isFinite(n);
}

export interface TotalReturn {
  /** トータルリターン (分配金再投資ベース, %)。算出不能時は null。 */
  readonly totalReturnPct: number | null;
  /** 年率換算リターン (CAGR, %)。算出不能時は null。 */
  readonly cagrPct: number | null;
  /** 評価損益 + 分配金 (円)。 */
  readonly totalGain: number;
}

/**
 * トータルリターン (分配金再投資ベース) と年率換算 (CAGR) を計算する。
 *
 *   トータルリターン = (期末評価額 + 累計分配金) / 元本 − 1
 *   CAGR = (1 + トータルリターン)^(1/年数) − 1
 *
 * 分配金は再投資された前提で元本に対する総合収益として扱う。
 *
 * @param principal 元本 (取得原価, 円)。0 以下なら算出不能 (null)。
 * @param endingValue 期末評価額 (円)。
 * @param totalDividends 累計分配金 (円)。負値は0にクランプ。既定 0。
 * @param years 保有年数。CAGR は 0 以下なら算出不能 (null, totalReturnPct は計算)。既定 0。
 */
export function calcTotalReturn(
  principal: number,
  endingValue: number,
  totalDividends = 0,
  years = 0,
): TotalReturn {
  if (!isFiniteNumber(principal) || !isFiniteNumber(endingValue) || principal <= 0) {
    return { totalReturnPct: null, cagrPct: null, totalGain: 0 };
  }
  const dividends = isFiniteNumber(totalDividends) ? Math.max(0, totalDividends) : 0;
  const finalValue = endingValue + dividends;
  const totalGain = yen(finalValue - principal);
  const totalReturn = finalValue / principal - 1;
  const totalReturnPct = pct2(totalReturn * 100);

  // CAGR は finalValue<=0 (元本全損超) では実数解を持たないため null。
  let cagrPct: number | null = null;
  if (isFiniteNumber(years) && years > 0 && finalValue > 0) {
    const cagr = Math.pow(finalValue / principal, 1 / years) - 1;
    cagrPct = pct2(cagr * 100);
  }
  return { totalReturnPct, cagrPct, totalGain };
}

export interface RealCost {
  /** 実質コスト率 (年率, %)。 */
  readonly annualCostPct: number;
  /** 1年あたりの概算コスト額 (円)。 */
  readonly annualCostYen: number;
  /** 期間累計の概算コスト額 (複利でリターンを蝕む効果込み, 円)。 */
  readonly cumulativeCostYen: number;
}

/**
 * 実質コスト (信託報酬 + 隠れコスト) と複利でリターンを蝕む効果を概算する。
 *
 *   実質コスト率 = 信託報酬率 + 売買委託手数料等
 *   累計コスト効果 = コスト無し将来価値 − コスト控除後将来価値
 *
 * コストはリターンから差し引かれるため、年数が長いほど複利で差が拡大する。
 *
 * @param investedAmount 投資元本 (円)。0 以下なら全0。
 * @param expenseRatioPct 信託報酬率 (運用管理費用, 年率%)。負値は0にクランプ。
 * @param hiddenCostPct 売買委託手数料等の隠れコスト (年率%)。既定 0。負値は0にクランプ。
 * @param grossReturnPct コスト控除前の想定年率リターン (%)。既定 0。
 * @param years 保有年数。0 以下なら累計効果0。既定 1。
 */
export function calcRealCost(
  investedAmount: number,
  expenseRatioPct: number,
  hiddenCostPct = 0,
  grossReturnPct = 0,
  years = 1,
): RealCost {
  const amount = isFiniteNumber(investedAmount) ? Math.max(0, investedAmount) : 0;
  const expense = isFiniteNumber(expenseRatioPct) ? Math.max(0, expenseRatioPct) : 0;
  const hidden = isFiniteNumber(hiddenCostPct) ? Math.max(0, hiddenCostPct) : 0;
  const gross = isFiniteNumber(grossReturnPct) ? grossReturnPct : 0;
  const yrs = isFiniteNumber(years) ? Math.max(0, years) : 0;

  const annualCostPct = pct2(expense + hidden);
  const annualCostYen = yen(amount * (annualCostPct / 100));

  // コスト無し vs コスト控除後の将来価値差 (複利での蝕み効果)。
  const grossRate = gross / 100;
  const netRate = (gross - annualCostPct) / 100;
  const fvGross = amount * Math.pow(1 + grossRate, yrs);
  const fvNet = amount * Math.pow(1 + netRate, yrs);
  const cumulativeCostYen = yen(fvGross - fvNet);
  return { annualCostPct, annualCostYen, cumulativeCostYen };
}

/**
 * リターン系列から標準偏差 (リスク) を算出する。
 *
 *   母標準偏差 (population):  σ = √(Σ(xᵢ − μ)² / n)
 *   標本標準偏差 (sample):    s = √(Σ(xᵢ − μ)² / (n−1))
 *
 * 標本標準偏差は自由度 n−1 を要するため n>=2。母標準偏差は n>=1。
 * 空配列・非有限値を含む場合は null。
 *
 * @param returns リターン系列 (%)。
 * @param sample true で標本標準偏差 (n−1), false で母標準偏差 (n)。既定 false。
 */
export function calcStdDev(returns: readonly number[], sample = false): number | null {
  if (!Array.isArray(returns) || returns.length === 0) return null;
  for (const x of returns) {
    if (!isFiniteNumber(x)) return null;
  }
  const n = returns.length;
  // 標本標準偏差は自由度 n−1 が必要 (単一要素では 0 除算)。
  if (sample && n < 2) return null;
  const mean = returns.reduce((acc, x) => acc + x, 0) / n;
  const sumSq = returns.reduce((acc, x) => {
    const dev = x - mean;
    return acc + dev * dev;
  }, 0);
  const divisor = sample ? n - 1 : n;
  return pct2(Math.sqrt(sumSq / divisor));
}

export interface DcaSimulation {
  /** 取得口数の合計。 */
  readonly totalUnits: number;
  /** 累計投資額 (円)。 */
  readonly totalInvested: number;
  /** 平均取得単価 (口あたり円)。算出不能時は null。 */
  readonly averageCost: number | null;
  /** 期末の評価額 (円, 最終価格 × 取得口数)。 */
  readonly finalValuation: number;
  /** 評価損益 (円)。 */
  readonly gain: number;
}

/**
 * ドルコスト平均法 (毎月一定額積立) を価格系列から概算する。
 *
 * 各期に monthlyAmount を投じ、その時点の基準価額で口数を購入する。
 *   取得口数 = Σ (monthlyAmount / priceᵢ)
 *   平均取得単価 = 累計投資額 / 取得口数
 *   評価額 = 最終価格 × 取得口数
 *
 * 価格が下がった期ほど多くの口数を取得でき、平均取得単価が下がる効果がある。
 *
 * @param monthlyAmount 毎月の積立額 (円)。0 以下なら全0。
 * @param prices 各期の基準価額系列 (口あたり円)。0 以下/非有限の価格はその期をスキップ。
 */
export function calcDcaSimulation(
  monthlyAmount: number,
  prices: readonly number[],
): DcaSimulation {
  const amount = isFiniteNumber(monthlyAmount) ? Math.max(0, monthlyAmount) : 0;
  const empty: DcaSimulation = {
    totalUnits: 0,
    totalInvested: 0,
    averageCost: null,
    finalValuation: 0,
    gain: 0,
  };

  let totalUnits = 0;
  let totalInvested = 0;
  let lastValidPrice = 0;
  // 空配列・全期スキップ・amount=0 はいずれもループ後 totalUnits=0 に畳まれ、
  // 単一の totalUnits<=0 ガードで empty を返す (前段の重複ガードは置かない)。
  for (const price of prices) {
    // 非有限・0以下の価格はその期を購入不能としてスキップ。
    if (!isFiniteNumber(price) || price <= 0) continue;
    totalUnits += amount / price;
    totalInvested += amount;
    lastValidPrice = price;
  }
  // amount=0 のとき totalUnits は常に 0 (0/price=0) で <= も < も同結果のため、
  // EqualityOperator (<= → <) は equivalent。
  // Stryker disable next-line EqualityOperator
  if (totalUnits <= 0) return empty;

  const averageCost = pct2(totalInvested / totalUnits);
  const finalValuation = yen(lastValidPrice * totalUnits);
  const gain = finalValuation - totalInvested;
  return {
    totalUnits: Math.round(totalUnits * 10000) / 10000,
    totalInvested: yen(totalInvested),
    averageCost,
    finalValuation,
    gain,
  };
}
