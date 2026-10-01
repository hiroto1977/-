/**
 * Stocks の action が返す形 —— **main・ブラウザ版・画面が 1 つの型を読む。** (2026-09-09 · パス 117)
 *
 * それまで同じ形が 3 か所に手書きされていた:
 *
 * | 形 | main (`clients/stocks.ts`) | ブラウザ版 (`data/stocksAnalysisWeb.ts` / `stocksWatchlistWeb.ts`) | 画面 (`StocksPage`) |
 * | --- | --- | --- | --- |
 * | 登録 / 解除 | 戻り値の型をその場で書く (名前なし) | `RegisterResult` / `UnregisterResult` | `RegisterResult` を**解除にも**付けていた (解除は `removed` を返し `added` は無い) |
 * | 戦略比較 | `StrategyComparisonRow` / `Result` | 同名の写し | ブラウザ版の型を読む |
 * | 助言 | `AdvisorRecommendation` / `AdvisorResponse` | 同名の写し | 手写し (パス 105 で `notForRealMoney` が `boolean` に広がっていた所) |
 * | バックテスト | `BacktestResult` (取引と資産曲線つき) | 5 欄だけの `BacktestResult` | — |
 *
 * `shared/actionData.ts` の台帳がここを読み、`ActionData<'stocks/…'>` として画面へ届く。
 * `readonly` はここで付ける —— 可変の配列は readonly へ代入できるので、ブラウザ版が
 * `push` で組み立てた値もそのまま返せる。
 */

/** 登録の答え (`stocks/register-ticker`)。 */
export interface RegisterResult {
  readonly symbol: string;
  readonly added: boolean;
  readonly watchlist: readonly string[];
  readonly message: string;
}

/** 解除の答え (`stocks/unregister-ticker`)。`added` ではなく `removed` —— 登録の型を使い回すと嘘になる。 */
export interface UnregisterResult {
  readonly symbol: string;
  readonly removed: boolean;
  readonly watchlist: readonly string[];
  readonly message: string;
}

/**
 * バックテストの要約 —— **両ビルドが約束する共通部分。**
 * デスクトップ版の `backtest` はこれに取引の一覧と資産曲線を足した上位集合を返す
 * (`clients/stocks.ts` の `BacktestResult`)。台帳はここまでを約束する。
 */
export interface BacktestSummary {
  readonly finalEquity: number;
  readonly totalReturnPct: number;
  readonly maxDrawdownPct: number;
  /** 勝率 (0..1)。**決済済みが 0 件なら null (算定不能)** (パス 92)。 */
  readonly winRate: number | null;
  readonly tradeCount: number;
}

/** 戦略比較の 1 行。 */
export interface StrategyComparisonRow extends BacktestSummary {
  readonly strategy: string;
}

export interface StrategyComparisonResult {
  readonly symbol: string;
  readonly initialCash: number;
  readonly rows: readonly StrategyComparisonRow[];
  /** 総リターンが最大の戦略。全部 0 以下なら null (画面は「差なし」と刷る)。 */
  readonly bestByReturn: string | null;
}

/** モデルからの推奨 1 件。形は JSON の検証 (両ビルド) が保証する。 */
export interface AdvisorRecommendation {
  readonly symbol: string;
  readonly rank: number; // 1 = top
  readonly rationale: string;
  readonly riskFactors: readonly string[];
}

export interface AdvisorResponse {
  readonly recommendations: readonly AdvisorRecommendation[];
  readonly disclaimer: string;
  /** 常に true。呼び出し側がこの出力を実弾発注の許可と取り違えないよう型で留める。 */
  readonly notForRealMoney: true;
  /** 実際に助言の対象にした銘柄 —— 答えと一緒に運ぶ (パス 105)。 */
  readonly universeConsidered: readonly string[];
  /** 上限のために対象から外した件数 (0 なら全部見ている)。 */
  readonly universeOmitted: number;
}
