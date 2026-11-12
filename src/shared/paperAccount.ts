/**
 * ペーパー口座の読み方 —— **1 度も取引していない口座は「損益 ±0」ではない。**
 * (2026-09-12 · パス 189)
 *
 * ## 実測した欠陥
 *
 * 株式の画面は「ペーパー口座」という節に 5 つのタイルを並べる ——
 * 現在資産 / 現金残高 / **損益** / 初期入金 / 取引履歴。同じ 5 つが
 * 書き出す HTML の帯と Markdown の表にも出る (`main/clients/stocks.ts`)。
 *
 * 実測 (2026-09-12 · `fetchStocksSnapshotImpl` に既定の差し替え口):
 *
 * ```
 *   watchlist   7203.T:hold 9984.T:hold 6758.T:hold AAPL:hold MSFT:hold
 *   positions   {}
 *   history     0 entries
 *   cash        1000000   initialCash 1000000   equity 1000000
 *   pnl         0         pnlPct      0
 * ```
 *
 * つまり 3 面が揃って **「損益 +￥0 (+0.00%)」を緑で** 刷る ——
 * 1 度も約定していない口座について。緑は「損をしていない」と読める。
 *
 * しかも 0 は偶然ではない。理由は 3 つ重なっている:
 *
 * 1. **口座は取得のたびに組み直される。** `fetchStocksSnapshotImpl` は
 *    `createPaperPortfolio(1_000_000)` から始め、銘柄ごとに**最新の 1 本**の
 *    シグナルを適用して返す。前回の取得で建てた玉も履歴も残らない ——
 *    実測で 2 度目の取得も `history 0`。「取引履歴 N paper trades」は
 *    蓄積した記録ではない。
 * 2. **約定値と評価値が同じ終値である。** `applySignal` は `last.close` で買い、
 *    画面と `portfolioEquity` は同じ `latestClose` で評価する。だから買いが
 *    起きても `equity === initialCash` で、**損益は構造上 ±0** になる
 *    (`Math.floor` で余った現金もそのまま現金に残る)。
 * 3. **同梱のデータではシグナルが 1 度も出ない。** `SMA_CROSSOVER_STRATEGY` は
 *    最終足での**交差**だけを見る。同梱のモック生成器は正のドリフトを持つ
 *    滑らかな系列なので、最終足で交差しない。実測: 内蔵 5 銘柄と、
 *    到達可能な種すべて —— `createMockStocksDataSource` の種は
 *    `(symbol.charCodeAt(0) || 1) * 1000` で**先頭 1 文字しか効かない**ため、
 *    `isSafeSymbol` が通す 39 文字ぶんが母集団の全体 —— の **39/39 が hold**。
 *    だから `positions` も `history` も常に空で、「取引履歴」の節
 *    (`history.length > 0` の枝) は 1 度も描かれない。
 *
 * ブラウザ版はさらに単純で、`buildStocksSnapshot` が
 * `{ cash: 1_000_000, initialCash: 1_000_000, positions: {}, history: [] }`
 * という**固定のリテラル**を返す —— ペーパートレードを一切行わない。
 * それでも帯は「過去データでの分析・シグナル生成・**ペーパートレードのみ稼働中**で、
 * 表示される売買は仮想資金です」と名乗っていた。
 *
 * リポジトリはこの形を既に何度も直している —— パス 92 (1 度も決済していない
 * 戦略の勝率を「0%」と刷る → `winRate: number | null`)、パス 39 (構造上定数の軸が
 * 評点を薄める)、パス 64 (中立のつもりの 1.0 が満点だった)。ここは同じ規準
 * (**算定不能は「—」で、緑にしない**) がまだ届いていなかった最後の 1 面である。
 *
 * ## 置き方
 *
 * 時価評価の規則は `portfolioEquity` が 1 つだけ持つ —— と
 * `main/clients/stocks.ts` の注記が 2026-08 に書いたのに、**画面はその後も
 * 自分で書いた 4 つ目の写しを使っていた** (`StocksPage.tsx` の `equity` の
 * `useMemo`)。main のものは renderer から輸入できない (`lint:imports`) ので、
 * 規則をここ (shared) へ移し、main はここを再輸出し、画面はここを読む。
 *
 * 値段が分からない銘柄は **0 円として数えず、数えなかったことを返す**
 * (`unpricedPositions`)。今日の取得経路では `positions ⊆ watchlist` なので
 * 到達しない —— **床**である (`isoDate.ts` の `isoDaysAgo` と同じ姿勢)。
 * 純粋関数なので検査は直接組んで当てる。
 */

import type { BuildKind } from './buildDestinations';

/** 建玉 1 つ (main の `PaperPosition` / 画面の `Position` と構造的に同じ)。 */
export interface PaperPositionLike {
  readonly shares: number;
  readonly avgCost: number;
}

/** ペーパー口座 (main の `PaperPortfolio` / 画面の `Portfolio` と構造的に同じ)。 */
export interface PaperPortfolioLike {
  readonly cash: number;
  readonly initialCash: number;
  readonly positions: Readonly<Record<string, PaperPositionLike>>;
  readonly history: readonly unknown[];
}

/** 「銘柄 → 値段」。ウォッチリストの最終値から作る (`watchlistPrices`)。 */
export type PriceTable = Readonly<Record<string, number>>;

/** ウォッチリストの 1 行のうち、時価評価に要る 2 欄だけ。 */
export interface PricedWatchlistItem {
  readonly symbol: string;
  readonly latestClose: number;
}

/** ウォッチリストの最終値を「銘柄 → 値段」の表にする。**時価評価はこの表だけを見る。** */
export function watchlistPrices(watchlist: readonly PricedWatchlistItem[]): PriceTable {
  const prices: Record<string, number> = {};
  for (const w of watchlist) prices[w.symbol] = w.latestClose;
  return prices;
}

/**
 * 時価評価 (現金 + 保有の時価)。**値段が分からない銘柄は数えない。**
 *
 * `backtest` が 1 足ごとに呼ぶので、戻り値は数値のまま置く (組を返すと
 * 熱いループに無駄な割り付けが入る)。数えなかった銘柄まで要るときは
 * `paperAccountView` を使う。
 */
export function portfolioEquity(port: PaperPortfolioLike, prices: PriceTable): number {
  let equity = port.cash;
  for (const [ticker, pos] of Object.entries(port.positions)) {
    const price = prices[ticker];
    if (price != null) equity += pos.shares * price;
  }
  return equity;
}

/** 画面・書き出しが読む形。**損益は取引が 0 件なら `null` (算定不能)。** */
export interface PaperAccountView {
  readonly equity: number;
  readonly cash: number;
  readonly initialCash: number;
  /** 取引が 1 件も無ければ `null` —— 「±0 の成績」ではなく「まだ何も起きていない」。 */
  readonly pnl: number | null;
  /** 同上。初期入金が 0 でも `null` (割れない)。 */
  readonly pnlPct: number | null;
  readonly tradeCount: number;
  readonly positionCount: number;
  /** 値段が分からず時価評価に入れられなかった銘柄 (= 現在資産は実際より小さい)。 */
  readonly unpricedPositions: readonly string[];
}

export function paperAccountView(port: PaperPortfolioLike, prices: PriceTable): PaperAccountView {
  const equity = portfolioEquity(port, prices);
  const unpriced = Object.keys(port.positions).filter((t) => prices[t] == null);
  const tradeCount = port.history.length;
  const traded = tradeCount > 0;
  const pnl = traded ? equity - port.initialCash : null;
  const pnlPct = pnl !== null && port.initialCash > 0 ? (pnl / port.initialCash) * 100 : null;
  return {
    equity,
    cash: port.cash,
    initialCash: port.initialCash,
    pnl,
    pnlPct,
    tradeCount,
    positionCount: Object.keys(port.positions).length,
    unpricedPositions: unpriced,
  };
}

/** 損益タイルの文字列。取引が無ければ「—」(符号も色も付けない)。 */
export function pnlLabel(v: PaperAccountView, yen: (n: number) => string): string {
  if (v.pnl === null) return '—';
  return (v.pnl >= 0 ? '+' : '') + yen(v.pnl);
}

/** 損益タイルの副文。取引が無ければ「なぜ算定できないか」を言う。 */
export function pnlSubLabel(v: PaperAccountView): string {
  if (v.pnl === null) return '取引 0 件 — 損益は算定できません';
  const pct = v.pnlPct;
  if (pct === null) return '初期入金 0 円 — 率は算定できません';
  return (pct >= 0 ? '+' : '') + pct.toFixed(2) + '%';
}

/** 損益タイルの色。算定できないものは緑にしない (パス 91 と同じ規準)。 */
export const PNL_UNKNOWN_COLOR = 'var(--text-mute)';
export const PNL_UP_COLOR = '#22c55e';
export const PNL_DOWN_COLOR = '#ef4444';

export function pnlColor(v: PaperAccountView): string {
  if (v.pnl === null) return PNL_UNKNOWN_COLOR;
  return v.pnl >= 0 ? PNL_UP_COLOR : PNL_DOWN_COLOR;
}

/** 取引履歴タイルの副文。0 件のときは「0」を成績に見せない。 */
export function tradeCountSubLabel(v: PaperAccountView): string {
  return v.tradeCount === 0 ? 'まだ 1 件もありません' : 'paper trades';
}

/**
 * この口座は何なのか —— **実行形態ごとに違う**ので 1 文で述べる。
 * 上の注記の 1〜3 とブラウザ版のリテラルが、そのままこの文になる。
 */
export function paperAccountNote(kind: BuildKind | null): string {
  if (kind === 'browser') {
    return 'ブラウザ版はペーパートレードを行いません。この口座は初期入金のまま固定で、'
      + '保有・取引履歴は常に 0 件です（分析・シグナル・戦略比較は動きます）。';
  }
  if (kind === 'desktop') {
    return 'この口座は取得しなおすたびに初期入金から組み直します（取引履歴は蓄積されません）。'
      + '適用するのは銘柄ごとに最新 1 本ぶんのシグナルだけで、約定値と評価値が同じ終値なので、'
      + '買いが起きても損益は ±0 になります。同梱のモックデータでは交差が起きないため、'
      + '取引は 1 件も発生しません。';
  }
  // 実行形態が分かるまでは、両方で必ず成り立つことだけを言う (パス 161)。
  return 'この口座は取得のたびに初期入金から組み直す仮想の口座で、取引履歴は蓄積されません。';
}

/** 帯が名乗る「いま何が動いているか」。ブラウザ版はペーパートレードを含まない。 */
export function simulationScopeNote(kind: BuildKind | null): string {
  if (kind === 'browser') {
    return '過去データでの分析・シグナル生成・戦略比較のみ稼働中です（ペーパートレードは行いません）。';
  }
  if (kind === 'desktop') {
    return '過去データでの分析・シグナル生成・ペーパートレードのみ稼働中で、表示される売買は仮想資金です。';
  }
  return '過去データでの分析・シグナル生成のみ稼働中で、表示される売買は仮想資金です。';
}

/** ウォッチリストの絞り込みが空になったときに、**なぜ空か**を言う。 */
export function signalFilterEmptyNote(
  filter: 'all' | 'buy' | 'sell' | 'hold',
  counts: Readonly<Record<'buy' | 'sell' | 'hold', number>>,
  labels: Readonly<Record<'buy' | 'sell' | 'hold', string>>,
): string {
  const total = counts.buy + counts.sell + counts.hold;
  if (total === 0) return '登録されている銘柄はありません';
  if (filter === 'all') return '登録されている銘柄はありません';
  const present = (['buy', 'sell', 'hold'] as const)
    .filter((a) => counts[a] > 0)
    .map((a) => `${labels[a]} ${counts[a]} 件`)
    .join(' / ');
  return `「${labels[filter]}」の銘柄はありません（登録 ${total} 件の内訳: ${present}）`;
}

/**
 * 書き出し (HTML / Markdown) に載せる注記 —— **画面と同じことを言う。**
 * 断りが画面にだけ在って渡す物に乗らない形は、パス 41 で 1 度直している。
 */
export function paperAccountExportNote(v: PaperAccountView): string {
  const head = v.tradeCount === 0
    ? '※ ペーパー口座はこの取得時点で組み直した仮想の口座です。取引が 1 件も発生していないため、'
      + '損益は算定できません（「—」と表示しています）。'
    : '※ ペーパー口座は取得のたびに初期入金から組み直す仮想の口座で、取引履歴は蓄積されません。'
      + '約定値と評価値が同じ終値のため、損益は約定だけでは動きません。';
  if (v.unpricedPositions.length === 0) return head;
  return head
    + `なお値段の分からない ${v.unpricedPositions.length} 銘柄（${v.unpricedPositions.join(' / ')}）は`
    + '時価評価に入れていないため、現在資産は実際より小さく出ています。';
}
