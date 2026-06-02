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
    const gain = diff > 0 ? diff : 0;
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
    return f != null && s != null ? f - s : null;
  });
  const firstFinite = macdLine.findIndex((v) => v !== null);
  const signalLine: (number | null)[] = closes.map(() => null);
  if (firstFinite >= 0) {
    const finite = macdLine.slice(firstFinite) as number[];
    const sig = ema(finite, signalPeriod);
    for (let i = 0; i < sig.length; i++) signalLine[firstFinite + i] = sig[i] ?? null;
  }
  const histogram = macdLine.map((m, i) => {
    const s = signalLine[i];
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
  if (f0 == null || s0 == null || f1 == null || s1 == null) {
    return holdSignal(candles, name, 'indicator unavailable');
  }
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
  if (m0 == null || s0 == null || m1 == null || s1 == null) {
    return holdSignal(candles, name, 'indicator unavailable');
  }
  if (m1 <= s1 && m0 > s0) {
    return { date: last.date, action: 'buy', confidence: 0.65, reason: 'MACD crossed above signal', strategy: name };
  }
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
  if (!pos || pos.shares <= 0) return port;
  const proceeds = pos.shares * price;
  const newCash = port.cash + proceeds;
  const newPositions: Record<string, PaperPosition> = { ...port.positions };
  delete newPositions[ticker];
  const trade: PaperTrade = { date: signal.date, ticker, action: 'sell', shares: pos.shares, price, cashAfter: newCash, reason: signal.reason };
  return { ...port, cash: newCash, positions: newPositions, history: [...port.history, trade] };
}

function portfolioEquity(port: PaperPortfolio, prices: Readonly<Record<string, number>>): number {
  let equity = port.cash;
  for (const [ticker, pos] of Object.entries(port.positions)) {
    const price = prices[ticker];
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
      if (dropPct >= risk.stopLossPct) {
        port = applySignal(port, ticker, { date: bar.date, action: 'sell', confidence: 1, reason: 'stop-loss', strategy: 'risk' }, bar.close, risk);
      } else if (gainPct >= risk.takeProfitPct) {
        port = applySignal(port, ticker, { date: bar.date, action: 'sell', confidence: 1, reason: 'take-profit', strategy: 'risk' }, bar.close, risk);
      }
    }
    const equity = portfolioEquity(port, { [ticker]: bar.close });
    if (equity > peak) peak = equity;
    const dd = peak > 0 ? (peak - equity) / peak : 0;
    if (dd > maxDrawdown) maxDrawdown = dd;
  }
  const lastClose = candles[candles.length - 1]?.close ?? 0;
  const finalEquity = portfolioEquity(port, { [ticker]: lastClose });
  let wins = 0;
  let losses = 0;
  let lastBuyPrice: number | null = null;
  for (const t of port.history) {
    if (t.action === 'buy') lastBuyPrice = t.price;
    else if (t.action === 'sell' && lastBuyPrice != null) {
      if (t.price > lastBuyPrice) wins++;
      else losses++;
      lastBuyPrice = null;
    }
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
    if (typeof rec.symbol !== 'string' || !allowedSymbols.has(rec.symbol)) {
      throw new Error(`recommendation has invalid or out-of-universe symbol: ${String(rec.symbol)}`);
    }
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
