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
    if (balance < minBalance) minBalance = balance;
    if (shortfallMonthIndex === null && balance < 0) shortfallMonthIndex = i;
    rows.push({ monthIndex: i, netCashflow: monthlyNet, balance });
  }
  return { openingBalance, monthlyNet, rows, minBalance, shortfallMonthIndex };
}
