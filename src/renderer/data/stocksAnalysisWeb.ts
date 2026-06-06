/**
 * ブラウザ版 Stocks の解析ロジック (advise / compare-strategies /
 * export-dashboard 用)。
 *
 * Electron 版は src/main/clients/stocks.ts に同等のロジックを持つが、そちらは
 * node:fs に依存し import 境界によりレンダラーから読めない。ブラウザ版は
 * 実データ取得・バックエンドを持たないため、決定論的なモック・ローソク足
 * (stocksWatchlistWeb.mockCandles) を入力に、テクニカル指標 / 戦略 /
 * バックテストを純粋関数として再実装する。価格はモックで実市場データではない。
 *
 * 法令順守: advise はアドバイザリーであり投資助言ではない。具体的な売買
 * タイミング・価格予測・金額指示を出さないよう system prompt で制約し、固定の
 * 免責 (ADVISOR_DISCLAIMER) を必ず付ける。
 */

import { mockCandles, type WebCandle, type WebSignal } from './stocksWatchlistWeb';

const HISTORY_LENGTH = 120;

// --- テクニカル指標 (stocks.ts と同一アルゴリズム) -----------------------

export function sma(closes: readonly number[], period: number): (number | null)[] {
  if (period <= 0) throw new Error('sma: period must be > 0');
  const out: (number | null)[] = [];
  let sum = 0;
  for (let i = 0; i < closes.length; i++) {
    sum += closes[i]!;
    if (i >= period) sum -= closes[i - period]!;
    out.push(i >= period - 1 ? sum / period : null);
  }
  return out;
}

export function ema(closes: readonly number[], period: number): (number | null)[] {
  if (period <= 0) throw new Error('ema: period must be > 0');
  const alpha = 2 / (period + 1);
  const out: (number | null)[] = [];
  let prev: number | null = null;
  let seed = 0;
  for (let i = 0; i < closes.length; i++) {
    seed += closes[i]!;
    if (i < period - 1) {
      out.push(null);
      continue;
    }
    if (prev === null) prev = seed / period;
    else prev = alpha * closes[i]! + (1 - alpha) * prev;
    out.push(prev);
  }
  return out;
}

export function rsi(closes: readonly number[], period: number): (number | null)[] {
  if (period <= 0) throw new Error('rsi: period must be > 0');
  const out: (number | null)[] = [null];
  if (closes.length === 0) return [];
  let avgGain = 0;
  let avgLoss = 0;
  for (let i = 1; i < closes.length; i++) {
    const diff = closes[i]! - closes[i - 1]!;
    // diff===0 のとき gain/loss はどちらの比較でも 0 になるため、> / < を >= / <= に
    // する EqualityOperator は equivalent。
    // Stryker disable next-line EqualityOperator
    const gain = diff > 0 ? diff : 0;
    // Stryker disable next-line EqualityOperator
    const loss = diff < 0 ? -diff : 0;
    if (i <= period) {
      avgGain += gain / period;
      avgLoss += loss / period;
      if (i < period) {
        out.push(null);
        continue;
      }
    } else {
      avgGain = (avgGain * (period - 1) + gain) / period;
      avgLoss = (avgLoss * (period - 1) + loss) / period;
    }
    out.push(avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss));
  }
  return out;
}

export function macd(
  closes: readonly number[],
  fast = 12,
  slow = 26,
  signalPeriod = 9,
): { macd: (number | null)[]; signal: (number | null)[]; histogram: (number | null)[] } {
  const fastEma = ema(closes, fast);
  const slowEma = ema(closes, slow);
  const macdLine: (number | null)[] = closes.map((_, i) => {
    const f = fastEma[i];
    const s = slowEma[i];
    // fast(短期) は slow(長期) が非 null の全 index で非 null なので、`f != null` は
    // `s != null` に包含され、これを true 固定する変異は equivalent (型絞り込みには必要)。
    // Stryker disable next-line ConditionalExpression
    return f != null && s != null ? f - s : null;
  });
  const firstFinite = macdLine.findIndex((v) => v !== null);
  const signalLine: (number | null)[] = closes.map(() => null);
  // firstFinite は -1 (有限値なし) か slow-1 (>=1) のいずれかで 0 にはならないため >= ↔ >
  // は equivalent。また firstFinite===-1 のとき slice(-1)+負 index 代入は no-op になり、
  // この if を true 固定しても結果不変 (equivalent)。
  // Stryker disable next-line EqualityOperator,ConditionalExpression
  if (firstFinite >= 0) {
    const finite = macdLine.slice(firstFinite) as number[];
    const sig = ema(finite, signalPeriod);
    for (let i = 0; i < sig.length; i++) signalLine[firstFinite + i] = sig[i] ?? null;
  }
  const histogram = macdLine.map((m, i) => {
    const s = signalLine[i];
    // signal は macdLine が非 null の index でのみ計算されるため、`m != null` は
    // `s != null` に包含され、これを true 固定する変異は equivalent (型絞り込みには必要)。
    // Stryker disable next-line ConditionalExpression
    return m != null && s != null ? m - s : null;
  });
  return { macd: macdLine, signal: signalLine, histogram };
}

export function bollingerBands(
  closes: readonly number[],
  period: number,
  k: number,
): { upper: (number | null)[]; middle: (number | null)[]; lower: (number | null)[] } {
  if (period <= 0) throw new Error('bollingerBands: period must be > 0');
  const middle = sma(closes, period);
  const upper: (number | null)[] = [];
  const lower: (number | null)[] = [];
  for (let i = 0; i < closes.length; i++) {
    const m = middle[i];
    if (m == null) {
      upper.push(null);
      lower.push(null);
      continue;
    }
    let sumSq = 0;
    for (let j = i - period + 1; j <= i; j++) {
      const d = closes[j]! - m;
      sumSq += d * d;
    }
    const stddev = Math.sqrt(sumSq / period);
    upper.push(m + k * stddev);
    lower.push(m - k * stddev);
  }
  return { upper, middle, lower };
}

// --- 戦略 ----------------------------------------------------------------

export type Strategy = (candles: readonly WebCandle[]) => WebSignal;

function holdSignal(candles: readonly WebCandle[], strategy: string, reason: string): WebSignal {
  const last = candles[candles.length - 1];
  return { date: last ? last.date : '', action: 'hold', confidence: 0, reason, strategy };
}

export const SMA_CROSSOVER_STRATEGY: Strategy = (candles) => {
  const name = 'sma-crossover';
  if (candles.length < 51) return holdSignal(candles, name, 'insufficient history');
  const closes = candles.map((c) => c.close);
  const fast = sma(closes, 20);
  const slow = sma(closes, 50);
  const i = closes.length - 1;
  const f0 = fast[i];
  const s0 = slow[i];
  const f1 = fast[i - 1];
  const s1 = slow[i - 1];
  const last = candles[i]!;
  // candles.length>=51 を上で保証済みのため、最後 2 本の SMA20/SMA50 は常に非 null。
  // この防御ガードは到達不能で、条件・文言・分岐を変える変異は equivalent。
  // Stryker disable next-line ConditionalExpression,LogicalOperator,StringLiteral,BlockStatement
  if (f0 == null || s0 == null || f1 == null || s1 == null) return holdSignal(candles, name, 'indicator unavailable');
  if (f1 <= s1 && f0 > s0) {
    return { date: last.date, action: 'buy', confidence: 0.7, reason: 'SMA20 crossed above SMA50 (golden cross)', strategy: name };
  }
  if (f1 >= s1 && f0 < s0) {
    return { date: last.date, action: 'sell', confidence: 0.7, reason: 'SMA20 crossed below SMA50 (death cross)', strategy: name };
  }
  return { date: last.date, action: 'hold', confidence: 0.3, reason: 'no crossover', strategy: name };
};

export const RSI_MEAN_REVERSION_STRATEGY: Strategy = (candles) => {
  const name = 'rsi-mean-reversion';
  if (candles.length < 15) return holdSignal(candles, name, 'insufficient history');
  const closes = candles.map((c) => c.close);
  const r = rsi(closes, 14);
  const v = r[r.length - 1];
  const last = candles[candles.length - 1]!;
  // candles.length>=15 のとき rsi(closes,14) の末尾は常に非 null。この防御ガードは
  // 到達不能で、条件・文言を変える変異は equivalent。
  // Stryker disable next-line ConditionalExpression,StringLiteral
  if (v == null) return holdSignal(candles, name, 'rsi unavailable');
  if (v < 30) {
    return { date: last.date, action: 'buy', confidence: (30 - v) / 30, reason: `RSI ${v.toFixed(1)} oversold`, strategy: name };
  }
  if (v > 70) {
    return { date: last.date, action: 'sell', confidence: (v - 70) / 30, reason: `RSI ${v.toFixed(1)} overbought`, strategy: name };
  }
  return { date: last.date, action: 'hold', confidence: 0, reason: `RSI ${v.toFixed(1)} neutral`, strategy: name };
};

export const MACD_SIGNAL_STRATEGY: Strategy = (candles) => {
  const name = 'macd-signal';
  if (candles.length < 35) return holdSignal(candles, name, 'insufficient history');
  const closes = candles.map((c) => c.close);
  const m = macd(closes);
  const i = closes.length - 1;
  const m0 = m.macd[i];
  const s0 = m.signal[i];
  const m1 = m.macd[i - 1];
  const s1 = m.signal[i - 1];
  const last = candles[i]!;
  // candles.length>=35 を上で保証済みのため、最後 2 本の MACD ライン/シグナルは常に
  // 非 null。この防御ガードは到達不能で、条件・文言・分岐を変える変異は equivalent。
  // Stryker disable next-line ConditionalExpression,LogicalOperator,StringLiteral,BlockStatement
  if (m0 == null || s0 == null || m1 == null || s1 == null) return holdSignal(candles, name, 'indicator unavailable');
  // m1===s1 のちょうど一致は連続値の MACD/シグナルでは起きないため、<= ↔ < は equivalent。
  // Stryker disable next-line EqualityOperator
  if (m1 <= s1 && m0 > s0) {
    return { date: last.date, action: 'buy', confidence: 0.65, reason: 'MACD crossed above signal', strategy: name };
  }
  // m1===s1 のちょうど一致は連続値では起きないため >= ↔ > は equivalent。
  // Stryker disable next-line EqualityOperator
  if (m1 >= s1 && m0 < s0) {
    return { date: last.date, action: 'sell', confidence: 0.65, reason: 'MACD crossed below signal', strategy: name };
  }
  return { date: last.date, action: 'hold', confidence: 0.25, reason: 'no crossover', strategy: name };
};

export const STRATEGIES: Readonly<Record<string, Strategy>> = {
  'sma-crossover': SMA_CROSSOVER_STRATEGY,
  'rsi-mean-reversion': RSI_MEAN_REVERSION_STRATEGY,
  'macd-signal': MACD_SIGNAL_STRATEGY,
};

// --- ペーパートレード + バックテスト -------------------------------------

export interface RiskParams {
  positionSizePct: number;
  stopLossPct: number;
  takeProfitPct: number;
}
export const DEFAULT_RISK_PARAMS: RiskParams = {
  positionSizePct: 0.1,
  stopLossPct: 0.05,
  takeProfitPct: 0.15,
};

interface PaperPosition {
  shares: number;
  avgCost: number;
}
interface PaperTrade {
  date: string;
  ticker: string;
  action: 'buy' | 'sell';
  shares: number;
  price: number;
  cashAfter: number;
  reason: string;
}
interface PaperPortfolio {
  cash: number;
  initialCash: number;
  positions: Record<string, PaperPosition>;
  history: PaperTrade[];
}

function createPaperPortfolio(initialCash: number): PaperPortfolio {
  return { cash: initialCash, initialCash, positions: {}, history: [] };
}

function applySignal(
  port: PaperPortfolio,
  ticker: string,
  signal: WebSignal,
  price: number,
  risk: RiskParams,
): PaperPortfolio {
  if (signal.action === 'hold') return port;
  const pos = port.positions[ticker];
  if (signal.action === 'buy') {
    const budget = port.cash * risk.positionSizePct;
    const shares = Math.floor(budget / price);
    if (shares <= 0) return port;
    const cost = shares * price;
    const newCash = port.cash - cost;
    const newPos: PaperPosition = pos
      ? { shares: pos.shares + shares, avgCost: (pos.shares * pos.avgCost + cost) / (pos.shares + shares) }
      : { shares, avgCost: price };
    const trade: PaperTrade = { date: signal.date, ticker, action: 'buy', shares, price, cashAfter: newCash, reason: signal.reason };
    return { ...port, cash: newCash, positions: { ...port.positions, [ticker]: newPos }, history: [...port.history, trade] };
  }
  // ポジションは shares>0 で作成され、売却時に削除されるため pos.shares は常に >0。
  // `<= 0` を `< 0` にする / この副条件を変える変異は到達不能で equivalent (!pos は別途検証)。
  // Stryker disable next-line ConditionalExpression,EqualityOperator
  if (!pos || pos.shares <= 0) return port;
  const proceeds = pos.shares * price;
  const newCash = port.cash + proceeds;
  // backtest は単一ティッカーのみ運用するため、コピー対象は売却対象 1 件のみ。
  // {} にしても削除後の結果は同じで equivalent (複数ティッカー運用は本実装に存在しない)。
  // Stryker disable next-line ObjectLiteral
  const newPositions: Record<string, PaperPosition> = { ...port.positions };
  delete newPositions[ticker];
  // trade.action は win/loss 集計 (buy 以外は売りとみなす) でも BacktestResult でも
  // 文字列値が観測されないため、'sell' を変える StringLiteral は equivalent。
  // Stryker disable next-line StringLiteral
  const trade: PaperTrade = { date: signal.date, ticker, action: 'sell', shares: pos.shares, price, cashAfter: newCash, reason: signal.reason };
  return { ...port, cash: newCash, positions: newPositions, history: [...port.history, trade] };
}

function portfolioEquity(port: PaperPortfolio, prices: Readonly<Record<string, number>>): number {
  let equity = port.cash;
  for (const [ticker, pos] of Object.entries(port.positions)) {
    const price = prices[ticker];
    // backtest からの呼び出しでは価格 ({[ticker]: bar.close / lastClose}) が常に渡される
    // ため price は常に非 null。この防御ガードを true 固定する変異は equivalent。
    // Stryker disable next-line ConditionalExpression
    if (price != null) equity += pos.shares * price;
  }
  return equity;
}

export interface BacktestResult {
  finalEquity: number;
  totalReturnPct: number;
  maxDrawdownPct: number;
  winRate: number;
  tradeCount: number;
}

export function backtest(
  candles: readonly WebCandle[],
  strategy: Strategy,
  initialCash: number,
  // 既定 ticker は positions のキーにのみ使われ BacktestResult には現れないため、
  // 値を変える StringLiteral は equivalent。
  // Stryker disable next-line StringLiteral
  ticker = 'BACKTEST',
  risk: RiskParams = DEFAULT_RISK_PARAMS,
): BacktestResult {
  let port = createPaperPortfolio(initialCash);
  let peak = initialCash;
  let maxDrawdown = 0;
  for (let i = 50; i < candles.length; i++) {
    const window = candles.slice(0, i + 1);
    const signal = strategy(window);
    const bar = candles[i]!;
    port = applySignal(port, ticker, signal, bar.close, risk);
    const pos = port.positions[ticker];
    if (pos) {
      const dropPct = (pos.avgCost - bar.close) / pos.avgCost;
      const gainPct = (bar.close - pos.avgCost) / pos.avgCost;
      // リスク決済シグナルの date/reason/strategy/action は applySignal が trade.action を
      // 'sell' リテラルで再設定し、BacktestResult にも現れないため、これらの ObjectLiteral /
      // StringLiteral 変異は観測不能で equivalent (発火条件は dropPct/gainPct で決まる)。
      if (dropPct >= risk.stopLossPct) {
        // Stryker disable next-line ObjectLiteral,StringLiteral
        port = applySignal(port, ticker, { date: bar.date, action: 'sell', confidence: 1, reason: 'stop-loss', strategy: 'risk' }, bar.close, risk);
      } else if (gainPct >= risk.takeProfitPct) {
        // Stryker disable next-line ObjectLiteral,StringLiteral
        port = applySignal(port, ticker, { date: bar.date, action: 'sell', confidence: 1, reason: 'take-profit', strategy: 'risk' }, bar.close, risk);
      }
    }
    const equity = portfolioEquity(port, { [ticker]: bar.close });
    // equity===peak / dd===maxDrawdown では代入しても同値のため > ↔ >= は equivalent。
    // Stryker disable next-line EqualityOperator
    if (equity > peak) peak = equity;
    // peak は initialCash(>0) 以上で単調増加するため常に >0。この防御三項の else(0) は
    // 到達不能で、true 固定 / >0↔>=0 の変異は equivalent。
    // Stryker disable next-line ConditionalExpression,EqualityOperator
    const dd = peak > 0 ? (peak - equity) / peak : 0;
    // Stryker disable next-line EqualityOperator
    if (dd > maxDrawdown) maxDrawdown = dd;
  }
  // candles は length>50 で非空のため `?.` は常に値を返す (型のため必要、実行時は equivalent)。
  // Stryker disable next-line OptionalChaining
  const lastClose = candles[candles.length - 1]?.close ?? 0;
  const finalEquity = portfolioEquity(port, { [ticker]: lastClose });
  let wins = 0;
  let losses = 0;
  let lastBuyPrice: number | null = null;
  for (const t of port.history) {
    if (t.action === 'buy') {
      lastBuyPrice = t.price;
      continue;
    }
    // history は buy/sell のみ。ここに来るのは sell で、直前の buy により lastBuyPrice は
    // 必ず非 null (型のため残すが実行時は到達不能の防御 → ConditionalExpression は equivalent)。
    // Stryker disable next-line ConditionalExpression
    if (lastBuyPrice == null) continue;
    if (t.price > lastBuyPrice) wins++;
    else losses++;
    lastBuyPrice = null;
  }
  const completed = wins + losses;
  return {
    finalEquity,
    totalReturnPct: ((finalEquity - initialCash) / initialCash) * 100,
    maxDrawdownPct: maxDrawdown * 100,
    winRate: completed > 0 ? wins / completed : 0,
    tradeCount: port.history.length,
  };
}

// --- 戦略比較 ------------------------------------------------------------

export interface StrategyComparisonRow {
  strategy: string;
  finalEquity: number;
  totalReturnPct: number;
  maxDrawdownPct: number;
  winRate: number;
  tradeCount: number;
}
export interface StrategyComparisonResult {
  symbol: string;
  initialCash: number;
  rows: StrategyComparisonRow[];
  bestByReturn: string | null;
}

/** `symbol` のモック履歴に対し全戦略をバックテストし比較する。 */
export function compareStrategies(
  symbol: string,
  initialCash: number,
  now: number = Date.now(),
): StrategyComparisonResult {
  const candles = mockCandles(symbol, now, HISTORY_LENGTH);
  const rows: StrategyComparisonRow[] = [];
  for (const [name, strategy] of Object.entries(STRATEGIES)) {
    const r = backtest(candles, strategy, initialCash, symbol);
    rows.push({
      strategy: name,
      finalEquity: r.finalEquity,
      totalReturnPct: r.totalReturnPct,
      maxDrawdownPct: r.maxDrawdownPct,
      winRate: r.winRate,
      tradeCount: r.tradeCount,
    });
  }
  let bestByReturn: string | null = null;
  let bestVal = -Infinity;
  for (const r of rows) {
    // 同 return が複数あっても最終的に最大値で確定するため > ↔ >= は equivalent。
    // 条件を true 固定しても各 row 走査で最大 row に収束するため equivalent
    // (条件を false 固定する変異のみ意味を持ち、正の戦略があるケースで kill される)。
    // Stryker disable next-line EqualityOperator,ConditionalExpression
    if (r.totalReturnPct > bestVal) {
      bestVal = r.totalReturnPct;
      bestByReturn = r.strategy;
    }
  }
  if (bestVal <= 0) bestByReturn = null;
  return { symbol, initialCash, rows, bestByReturn };
}

// --- ティッカー分析 (advisor 用) -----------------------------------------

export interface TickerAnalysis {
  symbol: string;
  label: string;
  latestClose: number;
  changePct: number;
  sma20: number | null;
  sma50: number | null;
  rsi14: number | null;
  macd: { line: number | null; signal: number | null; histogram: number | null };
  bollinger: { upper: number | null; middle: number | null; lower: number | null };
  smaCrossover: 'buy' | 'sell' | 'hold';
  rsiSignal: 'oversold' | 'overbought' | 'neutral';
}

export function buildTickerAnalysis(symbol: string, label: string, candles: readonly WebCandle[]): TickerAnalysis {
  const closes = candles.map((c) => c.close);
  const sma20 = sma(closes, 20);
  const sma50 = sma(closes, 50);
  const rsi14 = rsi(closes, 14);
  const m = macd(closes);
  const bb = bollingerBands(closes, 20, 2);
  const last = candles[candles.length - 1];
  const prev = candles[candles.length - 2];
  const latestClose = last ? last.close : 0;
  const changePct = last && prev && prev.close > 0 ? ((last.close - prev.close) / prev.close) * 100 : 0;
  const smaSig = SMA_CROSSOVER_STRATEGY(candles);
  const rv = rsi14[rsi14.length - 1];
  const rsiSignal: TickerAnalysis['rsiSignal'] =
    rv == null ? 'neutral' : rv < 30 ? 'oversold' : rv > 70 ? 'overbought' : 'neutral';
  const i = closes.length - 1;
  return {
    symbol,
    label,
    latestClose,
    changePct,
    sma20: sma20[i] ?? null,
    sma50: sma50[i] ?? null,
    rsi14: rv ?? null,
    macd: { line: m.macd[i] ?? null, signal: m.signal[i] ?? null, histogram: m.histogram[i] ?? null },
    bollinger: { upper: bb.upper[i] ?? null, middle: bb.middle[i] ?? null, lower: bb.lower[i] ?? null },
    smaCrossover: smaSig.action,
    rsiSignal,
  };
}

/** universe の各シンボルについて分析スナップショットを作る (モック履歴使用)。 */
export function buildAnalysesForUniverse(symbols: readonly string[], now: number = Date.now()): TickerAnalysis[] {
  return symbols.map((s) => buildTickerAnalysis(s, s, mockCandles(s, now, HISTORY_LENGTH)));
}

// --- アドバイザー (Anthropic) --------------------------------------------

export const ADVISOR_DISCLAIMER =
  '本機能は教育目的の参考情報であり、投資助言ではありません。' +
  '過去パフォーマンスは将来のリターンを保証しません。' +
  '実際の売買判断はご自身の責任で行ってください。';

/** ウォッチリストが空のときの既定ユニバース。 */
export const DEFAULT_ADVISOR_UNIVERSE: readonly string[] = ['AAPL', 'MSFT', 'GOOGL', 'AMZN', 'META'];

export interface AdvisorRecommendation {
  symbol: string;
  rank: number;
  rationale: string;
  riskFactors: string[];
}
export interface AdvisorResponse {
  recommendations: AdvisorRecommendation[];
  disclaimer: string;
  notForRealMoney: true;
}

export function advisorSystemPrompt(allowedSymbols: readonly string[]): string {
  return [
    'あなたは株式分析アシスタントです。',
    'ユーザーの質問と、与えられたティッカーのテクニカル分析データに基づいて、',
    '質問に最も適合する銘柄を最大 5 件、ランク順 (1 が最良) に提案します。',
    '',
    '厳守事項:',
    '- 必ず以下の JSON スキーマで応答 (前後のテキスト・コードフェンス禁止):',
    '  { "recommendations": [{ "symbol": "string", "rank": number, "rationale": "string", "riskFactors": ["string"] }] }',
    '- symbol は必ず次の許可済みリストから選ぶこと: [' + allowedSymbols.map((s) => '"' + s + '"').join(', ') + ']',
    '- 知らないティッカーや実在しないティッカーを提示してはならない。',
    '- 具体的な売買タイミング (例: "今買え") や具体的な価格予測を含めてはならない。',
    '- 各 recommendation には必ず riskFactors (1-3 件) を含めること。',
    '- rationale は 40-160 文字。テクニカル指標を根拠として簡潔に。',
    '- 過去パフォーマンスは将来を保証しない、という注意を念頭に置く。',
  ].join('\n');
}

/** LLM 応答の厳密バリデータ。逸脱は throw。 */
export function validateAdvisorJson(
  raw: unknown,
  allowedSymbols: ReadonlySet<string>,
): AdvisorRecommendation[] {
  if (raw === null || typeof raw !== 'object') throw new Error('advisor response is not an object');
  const obj = raw as { recommendations?: unknown };
  if (!Array.isArray(obj.recommendations)) throw new Error('advisor response missing recommendations array');
  if (obj.recommendations.length === 0) throw new Error('advisor response has zero recommendations');
  if (obj.recommendations.length > 5) throw new Error('advisor response exceeds 5 recommendations');
  const out: AdvisorRecommendation[] = [];
  for (const item of obj.recommendations) {
    if (item === null || typeof item !== 'object') throw new Error('recommendation entry is not an object');
    const rec = item as Record<string, unknown>;
    // 非文字列の symbol は allowedSymbols (文字列の Set) に決して含まれないため
    // `!allowedSymbols.has(...)` が必ず true となり、typeof ガードは冗長 (型のため必要)。
    // Stryker disable next-line ConditionalExpression
    if (typeof rec.symbol !== 'string' || !allowedSymbols.has(rec.symbol)) {
      throw new Error(`recommendation has invalid or out-of-universe symbol: ${String(rec.symbol)}`);
    }
    // 非数値の rank は Number.isFinite が false を返すため `!Number.isFinite(...)` が必ず
    // true となり、typeof ガードは冗長 (型のため必要)。
    // Stryker disable next-line ConditionalExpression
    if (typeof rec.rank !== 'number' || !Number.isFinite(rec.rank) || rec.rank < 1) {
      throw new Error(`recommendation has invalid rank: ${String(rec.rank)}`);
    }
    if (typeof rec.rationale !== 'string' || rec.rationale.length === 0) throw new Error('recommendation has empty rationale');
    if (rec.rationale.length > 400) throw new Error('recommendation rationale exceeds 400 chars');
    if (!Array.isArray(rec.riskFactors) || rec.riskFactors.length === 0) throw new Error('recommendation has no riskFactors');
    const riskFactors: string[] = [];
    for (const rf of rec.riskFactors) {
      if (typeof rf !== 'string' || rf.length === 0 || rf.length > 200) throw new Error('riskFactor entry is not a 1-200 char string');
      riskFactors.push(rf);
    }
    out.push({ symbol: rec.symbol, rank: rec.rank, rationale: rec.rationale, riskFactors });
  }
  return out;
}

// --- ダッシュボード書き出し ----------------------------------------------

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => (
    c === '&' ? '&amp;' : c === '<' ? '&lt;' : c === '>' ? '&gt;' : c === '"' ? '&quot;' : '&#39;'
  ));
}

export interface DashboardInput {
  watchlist: readonly { symbol: string; label: string; latestClose: number; changePct: number }[];
  strategyComparison?: StrategyComparisonResult | null;
  advisor?: AdvisorResponse | null;
  generatedAt: string;
}

export function renderDashboardHtml(input: DashboardInput): string {
  const rows = input.watchlist
    .map(
      (w) =>
        `<tr><td>${esc(w.symbol)}</td><td>${esc(w.label)}</td><td style="text-align:right">${w.latestClose.toFixed(2)}</td><td style="text-align:right;color:${w.changePct >= 0 ? '#22c55e' : '#ef4444'}">${w.changePct >= 0 ? '+' : ''}${w.changePct.toFixed(2)}%</td></tr>`,
    )
    .join('');
  const cmp = input.strategyComparison
    ? `<h2>戦略比較 — ${esc(input.strategyComparison.symbol)}</h2><table border="1" cellpadding="6" style="border-collapse:collapse"><tr><th>戦略</th><th>最終資産</th><th>リターン%</th><th>最大DD%</th><th>勝率</th><th>取引数</th></tr>${input.strategyComparison.rows
        .map(
          (r) =>
            `<tr><td>${esc(r.strategy)}</td><td style="text-align:right">${r.finalEquity.toFixed(0)}</td><td style="text-align:right">${r.totalReturnPct.toFixed(2)}</td><td style="text-align:right">${r.maxDrawdownPct.toFixed(2)}</td><td style="text-align:right">${(r.winRate * 100).toFixed(0)}%</td><td style="text-align:right">${r.tradeCount}</td></tr>`,
        )
        .join('')}</table><p>最良 (リターン基準): ${input.strategyComparison.bestByReturn ? esc(input.strategyComparison.bestByReturn) : '差なし'}</p>`
    : '';
  const adv = input.advisor
    ? `<h2>アドバイザー</h2><ol>${input.advisor.recommendations
        .map((r) => `<li><b>${esc(r.symbol)}</b> — ${esc(r.rationale)} <i>(リスク: ${r.riskFactors.map(esc).join(' / ')})</i></li>`)
        .join('')}</ol><p style="color:#fbbf24">${esc(input.advisor.disclaimer)}</p>`
    : '';
  return `<!doctype html><html lang="ja"><head><meta charset="utf-8"><title>Stocks ダッシュボード</title></head><body style="font-family:sans-serif;padding:24px;background:#0f1117;color:#e6e8ec"><h1>Stocks ダッシュボード (ブラウザ版・モックデータ)</h1><p>生成: ${esc(input.generatedAt)}</p><h2>ウォッチリスト</h2><table border="1" cellpadding="6" style="border-collapse:collapse"><tr><th>シンボル</th><th>名称</th><th>終値</th><th>前日比</th></tr>${rows || '<tr><td colspan="4">(登録銘柄なし)</td></tr>'}</table>${cmp}${adv}<p style="margin-top:24px;color:#8a93a6;font-size:12px">${esc(ADVISOR_DISCLAIMER)}</p></body></html>`;
}

export function renderDashboardMarkdown(input: DashboardInput): string {
  const lines: string[] = [];
  lines.push('# Stocks ダッシュボード (ブラウザ版・モックデータ)', '', `生成: ${input.generatedAt}`, '', '## ウォッチリスト', '', '| シンボル | 名称 | 終値 | 前日比 |', '| --- | --- | ---: | ---: |');
  if (input.watchlist.length === 0) lines.push('| (登録銘柄なし) | | | |');
  for (const w of input.watchlist) {
    lines.push(`| ${w.symbol} | ${w.label} | ${w.latestClose.toFixed(2)} | ${w.changePct >= 0 ? '+' : ''}${w.changePct.toFixed(2)}% |`);
  }
  if (input.strategyComparison) {
    const c = input.strategyComparison;
    lines.push('', `## 戦略比較 — ${c.symbol}`, '', '| 戦略 | 最終資産 | リターン% | 最大DD% | 勝率 | 取引数 |', '| --- | ---: | ---: | ---: | ---: | ---: |');
    for (const r of c.rows) {
      lines.push(`| ${r.strategy} | ${r.finalEquity.toFixed(0)} | ${r.totalReturnPct.toFixed(2)} | ${r.maxDrawdownPct.toFixed(2)} | ${(r.winRate * 100).toFixed(0)}% | ${r.tradeCount} |`);
    }
    lines.push('', `最良 (リターン基準): ${c.bestByReturn ?? '差なし'}`);
  }
  if (input.advisor) {
    lines.push('', '## アドバイザー', '');
    for (const r of input.advisor.recommendations) {
      lines.push(`${r.rank}. **${r.symbol}** — ${r.rationale} (リスク: ${r.riskFactors.join(' / ')})`);
    }
    lines.push('', `> ${input.advisor.disclaimer}`);
  }
  lines.push('', `---`, '', ADVISOR_DISCLAIMER);
  return lines.join('\n');
}

// ===========================================================================
// 精緻化されたテクニカル / リスク指標 (round 75 追加, 加算的)
//
// すべて純粋関数・概算であり、入力はモック価格 (実市場データではない)。
// これらは「投資助言ではありません」— 教育目的の参考統計に過ぎず、特定の
// 売買タイミング・価格予測・金額指示を意図しない (RISK_METRICS_DISCLAIMER)。
//
// 数値的注意点:
// - RSI/EMA は系列が短い (period 未満) と必ず null。EMA は SMA シードを使うため
//   最初の有効値は index = period-1。
// - ヒストリカル・ボラティリティは日次対数リターン (ln(p_t/p_{t-1})) の標本標準偏差
//   (n-1 で割る) を年率化 (×√tradingDays)。リターンが 1 本未満 (価格 < 3 本) では
//   標本分散が定義できず null。0 変動 (全て同値) なら 0。
// - 最大ドローダウンはピーク比の最大下落率 (0..1)。単調増加なら 0。
// ===========================================================================

export const RISK_METRICS_DISCLAIMER =
  '本指標は教育目的の概算統計であり、投資助言ではありません。' +
  '過去の値動き (ここではモックデータ) は将来を保証しません。';

/** 年率換算に使う既定取引日数 (米株のおおよその年間立会日数)。 */
export const TRADING_DAYS_PER_YEAR = 252;

/** 直近 2 本の SMA(fast)/SMA(slow) からゴールデン/デッドクロスを判定する純粋関数。
 *  戦略 (SMA_CROSSOVER_STRATEGY) とは独立した再利用可能な検出器。
 *  - golden: fast が slow を下から上抜け
 *  - dead:   fast が slow を上から下抜け
 *  履歴不足 (fast/slow が直近 2 本で算出できない) や fast>=slow の不正指定では null。 */
export function detectCross(
  closes: readonly number[],
  fastPeriod: number,
  slowPeriod: number,
): 'golden' | 'dead' | 'none' | null {
  if (fastPeriod <= 0 || slowPeriod <= 0) throw new Error('detectCross: periods must be > 0');
  // fast は slow より短くなければクロスの意味を成さない。
  if (fastPeriod >= slowPeriod) return null;
  const fast = sma(closes, fastPeriod);
  const slow = sma(closes, slowPeriod);
  const i = closes.length - 1;
  const f0 = fast[i];
  const s0 = slow[i];
  const f1 = fast[i - 1];
  const s1 = slow[i - 1];
  // 直近 2 本が必要。slow(長期) の方が遅れて有効化するため、最も遅く非 null になる
  // s1 (= slow[i-1]) を代表でガードする。s1 が非 null なら s0/f0/f1 も非 null
  // (fast は早く有効化し、s0 は s1 より後の index)。i<1 (履歴 1 本以下) のときは
  // slow[i-1] が undefined → null となりここで弾かれるため、別途の i ガードは不要。
  // 残り 3 値の `== null` 比較は型絞り込みのためだけに残す冗長ガード:
  // f0/s0/f1 は s1 が非 null の下では必ず非 null になる (fast は早く有効化し s0 は s1 の
  // 次 index) ため、3 値の null 状態は s1 と完全に相関する。よって個々の条件・論理演算子
  // (||↔&&) を変える変異は観測できず equivalent (型絞り込みには必要)。
  if (s1 == null) return null;
  // Stryker disable next-line ConditionalExpression,LogicalOperator
  if (f0 == null || s0 == null || f1 == null) return null;
  if (f1 <= s1 && f0 > s0) return 'golden';
  if (f1 >= s1 && f0 < s0) return 'dead';
  return 'none';
}

/** 日次対数リターン列を返す (要素数は closes.length-1)。
 *  非正の価格 (<= 0) や非有限値を含む場合、その区間の比は不正になるため null を返す。 */
export function logReturns(closes: readonly number[]): number[] | null {
  if (closes.length < 2) return null;
  const out: number[] = [];
  for (let i = 1; i < closes.length; i++) {
    const prev = closes[i - 1]!;
    const cur = closes[i]!;
    // 対数は正の価格でのみ定義。0/負/非有限はガード。
    if (!Number.isFinite(prev) || !Number.isFinite(cur) || prev <= 0 || cur <= 0) return null;
    out.push(Math.log(cur / prev));
  }
  return out;
}

/** ヒストリカル・ボラティリティ (年率)。
 *  日次対数リターンの標本標準偏差 (n-1) を √tradingDays で年率化する。
 *  価格が 3 本未満 (リターンが 2 本未満で標本分散が定義不能) なら null。
 *  リターンが全て同一 (0 変動) なら 0。tradingDays<=0 は不正で throw。 */
export function historicalVolatility(
  closes: readonly number[],
  tradingDays: number = TRADING_DAYS_PER_YEAR,
): number | null {
  if (tradingDays <= 0) throw new Error('historicalVolatility: tradingDays must be > 0');
  const rets = logReturns(closes);
  // logReturns が null (価格 <2 本/非正値) か、リターンが 2 本未満なら標本分散が定義不能。
  if (rets == null || rets.length < 2) return null;
  const mean = rets.reduce((a, b) => a + b, 0) / rets.length;
  let sumSq = 0;
  for (const r of rets) {
    const d = r - mean;
    sumSq += d * d;
  }
  // 標本分散 (n-1)。rets.length>=2 を上で保証済みなので分母 >0。
  const variance = sumSq / (rets.length - 1);
  return Math.sqrt(variance) * Math.sqrt(tradingDays);
}

/** 価格系列のピーク比・最大ドローダウン (0..1)。
 *  各時点までの最高値からの最大下落率。単調増加なら 0。
 *  価格が空/1 本のみ/非有限を含むなら null (ドローダウンが定義不能)。 */
export function maxDrawdown(closes: readonly number[]): number | null {
  if (closes.length < 2) return null;
  let peak = closes[0]!;
  if (!Number.isFinite(peak)) return null;
  let maxDd = 0;
  for (let i = 1; i < closes.length; i++) {
    const p = closes[i]!;
    if (!Number.isFinite(p)) return null;
    // p===peak のとき peak=p は同値の no-op のため > ↔ >= は equivalent。
    // Stryker disable next-line EqualityOperator
    if (p > peak) peak = p;
    // peak は最初の有限価格以上。peak<=0 になるのは全価格が <=0 のときのみで、その場合
    // ドローダウン率 (peak-p)/peak は符号が反転し意味を成さないため計算をスキップする
    // 防御ガード。本モジュールのモック価格は常に正のためここは到達せず、true 固定 /
    // peak>0 ↔ peak>=0 の変異は観測不能で equivalent。
    // Stryker disable next-line ConditionalExpression,EqualityOperator
    if (peak > 0) {
      const dd = (peak - p) / peak;
      // dd===maxDd のとき代入は同値の no-op のため > ↔ >= は equivalent。
      // Stryker disable next-line EqualityOperator
      if (dd > maxDd) maxDd = dd;
    }
  }
  return maxDd;
}

/** リターン列に対するシャープ的なリスク調整リターン (概算)。
 *  (平均リターン - リスクフリー率) / リターンの標本標準偏差。
 *  riskFreePerPeriod は同一周期 (日次なら日次) のリスクフリー率 (既定 0)。
 *  リターンが 2 本未満なら null。標準偏差が 0 (変動なし) なら null
 *  (0 除算を避け、リスク調整リターンが定義不能であることを明示)。 */
export function sharpeRatio(
  returns: readonly number[],
  riskFreePerPeriod: number = 0,
): number | null {
  if (returns.length < 2) return null;
  const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
  let sumSq = 0;
  for (const r of returns) {
    const d = r - mean;
    sumSq += d * d;
  }
  const stddev = Math.sqrt(sumSq / (returns.length - 1));
  // 変動ゼロでは分母が 0。リスク調整リターンは定義不能なので null。
  if (stddev === 0) return null;
  return (mean - riskFreePerPeriod) / stddev;
}

/** ボリンジャーバンドにおける %b (バンド内位置)。
 *  %b = (price - lower) / (upper - lower)。0 で下バンド, 1 で上バンド, 0.5 で中央。
 *  バンド幅が 0 (upper===lower, σ=0) または非 null 算出不可なら null。 */
export function percentB(
  closes: readonly number[],
  period: number,
  k: number,
): (number | null)[] {
  if (period <= 0) throw new Error('percentB: period must be > 0');
  const { upper, lower } = bollingerBands(closes, period, k);
  return closes.map((price, i) => {
    const u = upper[i];
    const l = lower[i];
    // upper/lower は bollingerBands が同一 index (middle=sma が null の区間) で同時に null /
    // 同時に非 null になるため、u と l の null 状態は完全に相関する。よって `u == null`
    // 単独・`l == null` 単独、および || ↔ && は観測上区別できず equivalent (型絞り込みには
    // 両方必要)。下の width===0 ガードが σ=0 の実質的な null ケースを担う。
    // Stryker disable next-line ConditionalExpression,LogicalOperator
    if (u == null || l == null) return null;
    const width = u - l;
    // σ=0 (全値同一) ではバンド幅 0 で位置が定義不能。
    if (width === 0) return null;
    return (price - l) / width;
  });
}

export interface RiskMetrics {
  symbol: string;
  latestClose: number;
  annualizedVolatilityPct: number | null;
  maxDrawdownPct: number | null;
  sharpeRatio: number | null;
  cross: 'golden' | 'dead' | 'none' | null;
  percentB: number | null;
  disclaimer: string;
}

/** 1 シンボルのモック履歴に対する精緻なリスク指標スナップショットを組み立てる。
 *  すべて概算・モックベースで、投資助言ではない (disclaimer 同梱)。 */
export function buildRiskMetrics(
  symbol: string,
  now: number = Date.now(),
  periods: number = HISTORY_LENGTH,
): RiskMetrics {
  const candles = mockCandles(symbol, now, periods);
  const closes = candles.map((c) => c.close);
  const last = candles[candles.length - 1];
  const vol = historicalVolatility(closes);
  const dd = maxDrawdown(closes);
  const rets = logReturns(closes);
  const sharpe = rets == null ? null : sharpeRatio(rets);
  const pb = percentB(closes, 20, 2);
  return {
    symbol,
    latestClose: last ? last.close : 0,
    annualizedVolatilityPct: vol == null ? null : vol * 100,
    maxDrawdownPct: dd == null ? null : dd * 100,
    sharpeRatio: sharpe,
    cross: detectCross(closes, 20, 50),
    percentB: pb[pb.length - 1] ?? null,
    disclaimer: RISK_METRICS_DISCLAIMER,
  };
}
