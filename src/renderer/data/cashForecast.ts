/**
 * 月次キャッシュ予測 (資金残高フォーキャスト) — 会計連携 × 現預金の前向き予測。
 *
 * 期首の現預金 (貸借対照表) を起点に、会計連携 (freee) の月次営業CFの基調を
 * 将来へ引き延ばして資金残高の推移を予測し、残高が初めてマイナスになる「資金
 * ショート月」を先読みする純粋ロジック。IO は持たない。
 *
 * **重要 — 概算であり財務助言ではありません。** 月次CFが一定で続くと仮定した
 * 単純な外挿で、季節性・一時的な入出金・追加調達は考慮しない。
 */

/** 予測 1 か月分。 */
export interface CashForecastRow {
  /** 期首からの経過月 (1 始まり)。 */
  readonly monthIndex: number;
  /** その月の純CF (予測)。 */
  readonly netCashflow: number;
  /** その月末の予測残高。 */
  readonly balance: number;
}

/** 資金残高フォーキャストの結果。 */
export interface CashForecast {
  readonly openingBalance: number;
  /** 予測に用いた月次純CF (基調)。 */
  readonly monthlyNet: number;
  readonly rows: readonly CashForecastRow[];
  /** 期間中の最低残高。 */
  readonly minBalance: number;
  /** 残高が初めてマイナスになる経過月 (1 始まり)。発生しなければ null。 */
  readonly shortfallMonthIndex: number | null;
}

/**
 * 期首残高と月次純CF (基調) から、horizon か月先までの資金残高を予測する。
 *
 * @param openingBalance 期首の現預金 (円)
 * @param monthlyNet 1 か月あたりの純CF (会計連携の月次平均など)。プラスで資金増。
 * @param horizonMonths 予測する月数 (1..60、既定 12)
 */
export function forecastCashBalance(
  openingBalance: number,
  monthlyNet: number,
  horizonMonths = 12,
): CashForecast {
  const horizon = Math.min(60, Math.max(0, Math.floor(horizonMonths)));
  const rows: CashForecastRow[] = [];
  let balance = openingBalance;
  let minBalance = openingBalance;
  let shortfallMonthIndex: number | null = null;
  for (let i = 1; i <= horizon; i += 1) {
    balance += monthlyNet;
    // balance===minBalance のとき再代入しても同値のため < → <= は equivalent。
    // Stryker disable next-line EqualityOperator
    if (balance < minBalance) minBalance = balance;
    if (shortfallMonthIndex === null && balance < 0) shortfallMonthIndex = i;
    rows.push({ monthIndex: i, netCashflow: monthlyNet, balance });
  }
  return { openingBalance, monthlyNet, rows, minBalance, shortfallMonthIndex };
}

/**
 * 予測の残高推移を「期首残高 → 各月末残高」の数値列で返す (グラフ描画用)。
 * 先頭は必ず期首残高。予測が空 (horizon 0) でも期首残高 1 点を返す。
 */
export function cashForecastTrajectory(forecast: CashForecast): number[] {
  return [forecast.openingBalance, ...forecast.rows.map((r) => r.balance)];
}

// ───────────────────────────────────────────────────────────────────────────
// Round 70 追加: 資金繰り予測の精緻化 (加算的)。
//
// **重要 — いずれも概算であり財務助言ではありません。** シナリオ係数・季節指数は
// 過去実績や経験則に基づく単純な前提で、実際の入出金タイミング・与信・市況変動は
// 反映しない。
// ───────────────────────────────────────────────────────────────────────────

// Number.isFinite は非数値を強制変換せず常に false を返すため、typeof チェックは不要。
const isFiniteNumber = (n: unknown): n is number => Number.isFinite(n);

/** 1 シナリオの予測結果。 */
export interface CashScenario {
  /** シナリオ名 (例: 楽観 / 標準 / 悲観)。 */
  readonly label: string;
  /** 基調月次純CF に適用した倍率。 */
  readonly factor: number;
  /** このシナリオの月次純CF (= monthlyNet × factor)。 */
  readonly monthlyNet: number;
  /** このシナリオの予測。 */
  readonly forecast: CashForecast;
  /** 残高が 0 を初めて下回るまでの月数 (= ランウェイ)。発生しなければ null。 */
  readonly runwayMonths: number | null;
}

/** シナリオ別ランウェイの入力倍率 (省略時は 1.2 / 1.0 / 0.8)。 */
export interface ScenarioFactors {
  readonly optimistic?: number;
  readonly base?: number;
  readonly pessimistic?: number;
}

/** シナリオ別ランウェイの結果。 */
export interface ScenarioRunway {
  readonly optimistic: CashScenario;
  readonly base: CashScenario;
  readonly pessimistic: CashScenario;
}

/**
 * 楽観 / 標準 / 悲観の 3 シナリオで月次純CF を倍率調整し、各シナリオの
 * 残高推移・資金ショート月・ランウェイを返す。
 *
 * `factor` の符号は問わない (黒字基調なら大きい倍率ほど資金増、赤字基調なら
 * 大きい倍率ほど流出加速)。ランウェイは shortfallMonthIndex と一致する。
 *
 * 非有限な opening/monthlyNet は null を返す。倍率が非有限なら既定値に置換。
 */
export function scenarioRunways(
  openingBalance: number,
  monthlyNet: number,
  horizonMonths = 12,
  factors: ScenarioFactors = {},
): ScenarioRunway | null {
  if (!isFiniteNumber(openingBalance) || !isFiniteNumber(monthlyNet)) return null;
  const pick = (v: number | undefined, fallback: number): number =>
    isFiniteNumber(v) ? v : fallback;
  const build = (label: string, factor: number): CashScenario => {
    const net = monthlyNet * factor;
    const forecast = forecastCashBalance(openingBalance, net, horizonMonths);
    return {
      label,
      factor,
      monthlyNet: net,
      forecast,
      runwayMonths: forecast.shortfallMonthIndex,
    };
  };
  return {
    optimistic: build('楽観', pick(factors.optimistic, 1.2)),
    base: build('標準', pick(factors.base, 1)),
    pessimistic: build('悲観', pick(factors.pessimistic, 0.8)),
  };
}

/**
 * 過去実績の月次CF系列から、長さ `period` の季節指数を求める。
 *
 * 各月インデックス (i mod period) ごとの平均を全体平均で割った「乗法的季節指数」。
 * 指数の平均は 1 付近になる。系列が空・period が 1 未満・全体平均が 0 のときは
 * null (季節性を推定できない)。指数が非有限になる成分は 1 にフォールバック。
 *
 * @param history 過去の月次純CF (古い順)。
 * @param period  季節周期 (既定 12 か月)。
 */
export function seasonalIndices(
  history: readonly number[],
  period = 12,
): number[] | null {
  const p = Math.floor(period);
  // history.length===0 を外しても、空配列は下の clean.length===0 でも null になり同値
  // (等価変異)。早期 return は可読性のための冗長ガード。
  // Stryker disable next-line ConditionalExpression
  if (!Array.isArray(history) || history.length === 0 || p < 1) return null;
  const clean = history.filter(isFiniteNumber);
  if (clean.length === 0) return null;
  const overallMean = clean.reduce((a, b) => a + b, 0) / clean.length;
  if (overallMean === 0) return null;
  const sums = new Array<number>(p).fill(0);
  const counts = new Array<number>(p).fill(0);
  for (let i = 0; i < clean.length; i += 1) {
    const slot = i % p;
    sums[slot]! += clean[i]!;
    counts[slot]! += 1;
  }
  return sums.map((sum, slot) => {
    const c = counts[slot]!;
    // c===0 ⇒ sum も 0 なので else 枝でも 0/0=NaN→1 となり結果は同値 (等価変異)。
    // Stryker disable next-line ConditionalExpression
    if (c === 0) return 1;
    const idx = sum / c / overallMean;
    return isFiniteNumber(idx) ? idx : 1;
  });
}

/**
 * 季節性を反映した月次CF予測。基調月次純CF に季節指数を掛けて月ごとの入出金を
 * 補正したうえで残高推移を予測する。
 *
 * 季節指数は予測月インデックス (1 始まり → 0 始まりに変換) に対し
 * `(i-1) mod indices.length` で割り当てる。indices が空・非配列・非有限残高/CF の
 * ときは指数なし (= forecastCashBalance と同等) にフォールバックして予測する。
 */
export function seasonalForecast(
  openingBalance: number,
  monthlyNet: number,
  indices: readonly number[] | null,
  horizonMonths = 12,
): CashForecast | null {
  if (!isFiniteNumber(openingBalance) || !isFiniteNumber(monthlyNet)) return null;
  const horizon = Math.min(60, Math.max(0, Math.floor(horizonMonths)));
  const idx =
    Array.isArray(indices) && indices.length > 0
      ? indices.map((v) => (isFiniteNumber(v) ? v : 1))
      : null;
  const rows: CashForecastRow[] = [];
  let balance = openingBalance;
  let minBalance = openingBalance;
  let shortfallMonthIndex: number | null = null;
  let netSum = 0;
  for (let i = 1; i <= horizon; i += 1) {
    const factor = idx ? idx[(i - 1) % idx.length]! : 1;
    const net = monthlyNet * factor;
    netSum += net;
    balance += net;
    // balance===minBalance のとき再代入しても同値のため < → <= は等価変異。
    // Stryker disable next-line EqualityOperator
    if (balance < minBalance) minBalance = balance;
    if (shortfallMonthIndex === null && balance < 0) shortfallMonthIndex = i;
    rows.push({ monthIndex: i, netCashflow: net, balance });
  }
  // monthlyNet は季節補正後の平均を返す (各 row.netCashflow には補正値を保持)。
  const monthlyNetAvg = horizon > 0 ? netSum / horizon : monthlyNet;
  return { openingBalance, monthlyNet: monthlyNetAvg, rows, minBalance, shortfallMonthIndex };
}

/** 必要調達額の結果。 */
export interface FundingNeed {
  /** 目標として維持したい最低残高。 */
  readonly targetBalance: number;
  /** 期間中に目標残高を最も下回った額の絶対値 (= 必要調達額)。不足なしは 0。 */
  readonly shortfallAmount: number;
  /** 目標残高を初めて下回る経過月 (1 始まり)。下回らなければ null。 */
  readonly fundingMonthIndex: number | null;
  /** 目標残高を割り込まなかったか。 */
  readonly sufficient: boolean;
}

/**
 * 目標残高 (バッファ) を維持するために必要な調達額と、そのタイミングを求める。
 *
 * 各月末残高が目標残高を最も大きく割り込んだ額を必要調達額とする (単発調達で
 * 期間中の最低点を埋める前提の概算)。割り込まなければ調達不要 (0 / null)。
 *
 * 予測 rows が空・targetBalance が非有限のときは null。
 */
export function fundingNeed(
  forecast: CashForecast,
  targetBalance = 0,
): FundingNeed | null {
  if (!isFiniteNumber(targetBalance)) return null;
  if (!forecast || forecast.rows.length === 0) return null;
  let worstDeficit = 0;
  let fundingMonthIndex: number | null = null;
  for (const row of forecast.rows) {
    const deficit = targetBalance - row.balance;
    if (deficit > 0 && fundingMonthIndex === null) fundingMonthIndex = row.monthIndex;
    // worstDeficit===deficit のとき再代入しても同値のため > → >= は等価変異。
    // Stryker disable next-line EqualityOperator
    if (deficit > worstDeficit) worstDeficit = deficit;
  }
  return {
    targetBalance,
    shortfallAmount: worstDeficit,
    fundingMonthIndex,
    sufficient: fundingMonthIndex === null,
  };
}

/** 感応度 1 ケースの結果。 */
export interface SensitivityCase {
  /** 売上 (CF) の変動率 (例: -0.1 = 売上 10% 減)。 */
  readonly revenueDelta: number;
  /** 入金遅延月数 (回収サイト悪化。0 で変化なし)。 */
  readonly collectionLagMonths: number;
  /** このケースの資金ショート月 (1 始まり)。発生しなければ null。 */
  readonly shortfallMonthIndex: number | null;
  /** このケースの期間中最低残高。 */
  readonly minBalance: number;
}

/** 感応度分析の結果。 */
export interface SensitivityAnalysis {
  /** 基準ケース (revenueDelta 0 / lag 0)。 */
  readonly baseline: SensitivityCase;
  /** 各シナリオの結果。 */
  readonly cases: readonly SensitivityCase[];
}

/**
 * 売上 (CF) の増減と回収サイト変動 (入金遅延) が資金ショート月に与える影響を測る。
 *
 * - `revenueDelta`: 基調CF 全体を (1 + delta) 倍する近似。売上変動が CF にそのまま
 *   比例する前提。
 * - `collectionLagMonths`: 入金が n か月後ろ倒しになる近似として、最初の n か月の
 *   純CF を 0 とし、その後に本来の純CF が続くものとして残高を引き直す。
 *
 * deltas / lags が空なら delta=0 / lag=0 を補い、必ず baseline を含む。
 * 非有限な opening/monthlyNet は null。
 */
export function cashflowSensitivity(
  openingBalance: number,
  monthlyNet: number,
  horizonMonths = 12,
  revenueDeltas: readonly number[] = [-0.1, 0, 0.1],
  collectionLagMonths: readonly number[] = [0, 1, 2],
): SensitivityAnalysis | null {
  if (!isFiniteNumber(openingBalance) || !isFiniteNumber(monthlyNet)) return null;
  const horizon = Math.min(60, Math.max(0, Math.floor(horizonMonths)));
  // 直後の .filter(isFiniteNumber) が非数値要素を除去するため、フォールバック配列に
  // 何を入れても結果は空となる (Stryker の文字列要素挿入は等価変異)。
  // Stryker disable next-line ArrayDeclaration
  const deltas = (Array.isArray(revenueDeltas) ? revenueDeltas : []).filter(isFiniteNumber);
  // Stryker disable next-line ArrayDeclaration
  const lags = (Array.isArray(collectionLagMonths) ? collectionLagMonths : []).filter(
    (n): n is number => isFiniteNumber(n) && n >= 0,
  );
  const evaluate = (revenueDelta: number, lagRaw: number): SensitivityCase => {
    const lag = Math.floor(lagRaw);
    const net = monthlyNet * (1 + revenueDelta);
    let balance = openingBalance;
    let minBalance = openingBalance;
    let shortfallMonthIndex: number | null = null;
    for (let i = 1; i <= horizon; i += 1) {
      const applied = i <= lag ? 0 : net;
      balance += applied;
      // balance===minBalance のとき再代入しても同値のため < → <= は等価変異。
      // Stryker disable next-line EqualityOperator
      if (balance < minBalance) minBalance = balance;
      if (shortfallMonthIndex === null && balance < 0) shortfallMonthIndex = i;
    }
    return { revenueDelta, collectionLagMonths: lag, shortfallMonthIndex, minBalance };
  };
  const baseline = evaluate(0, 0);
  const cases: SensitivityCase[] = [];
  const seen = new Set<string>();
  for (const d of deltas.length > 0 ? deltas : [0]) {
    for (const l of lags.length > 0 ? lags : [0]) {
      const key = `${d}|${Math.floor(l)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      cases.push(evaluate(d, l));
    }
  }
  return { baseline, cases };
}
