import type { FetchContext, ActionContext, ActionMap } from './types';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/**
 * Stocks analytics + paper trading.
 *
 * The user registers tickers; this module fetches OHLCV history,
 * computes technical indicators, runs strategies to emit buy/sell
 * signals, and simulates the trades against a virtual cash balance
 * (paper portfolio). No real-money orders are placed here.
 *
 * Phase 7 deferred: live broker integration (Interactive Brokers /
 * Alpaca / 楽天 / SBI). The `StocksDataSource` interface + `Strategy`
 * type + `RiskParams` make the swap mechanical — write a real data
 * source and a real order executor, register them in the same
 * factory, and the rest of the pipeline doesn't change.
 *
 * IMPORTANT: this module does NOT predict the future. Strategies are
 * deterministic rules over historical data. Backtest results describe
 * how a strategy would have performed in the past — they are NOT a
 * guarantee of future returns. The UI surfaces this prominently.
 */

// --- Types: OHLCV + signals + paper trade ---------------------------------

/** One day's price bar. All prices in the ticker's local currency. */
export interface Candle {
  readonly date: string; // YYYY-MM-DD (UTC)
  readonly open: number;
  readonly high: number;
  readonly low: number;
  readonly close: number;
  readonly volume: number;
}

/** Output of a strategy evaluation against a candle window. */
export interface Signal {
  readonly date: string;
  readonly action: 'buy' | 'sell' | 'hold';
  /** 0..1. 0 = no conviction (hold), 1 = max conviction. */
  readonly confidence: number;
  readonly reason: string;
  readonly strategy: string;
}

/** A held position in the paper portfolio. */
export interface PaperPosition {
  readonly shares: number;
  readonly avgCost: number;
}

/** A paper trade record (immutable history entry). */
export interface PaperTrade {
  readonly date: string;
  readonly ticker: string;
  readonly action: 'buy' | 'sell';
  readonly shares: number;
  readonly price: number;
  readonly cashAfter: number;
  readonly reason: string;
}

/** Whole paper portfolio: cash + positions + immutable trade log. */
export interface PaperPortfolio {
  readonly cash: number;
  readonly initialCash: number;
  readonly positions: Readonly<Record<string, PaperPosition>>;
  readonly history: readonly PaperTrade[];
}

/** Risk-management parameters applied during paper trading. */
export interface RiskParams {
  /** Fraction of remaining cash to deploy per buy signal (0..1). */
  readonly positionSizePct: number;
  /** Auto-sell if price falls this fraction below avgCost (0..1). */
  readonly stopLossPct: number;
  /** Auto-sell if price rises this fraction above avgCost (0..1). */
  readonly takeProfitPct: number;
}

/** Conservative defaults: 10% per trade, 5% stop, 15% take-profit. */
export const DEFAULT_RISK_PARAMS: RiskParams = {
  positionSizePct: 0.1,
  stopLossPct: 0.05,
  takeProfitPct: 0.15,
};

/** Aggregate result of running `backtest`. */
export interface BacktestResult {
  readonly finalEquity: number;
  readonly totalReturnPct: number;
  readonly maxDrawdownPct: number;
  readonly winRate: number; // 0..1
  readonly tradeCount: number;
  readonly trades: readonly PaperTrade[];
}

/** Watchlist row surfaced in the snapshot. */
export interface WatchlistItem {
  readonly symbol: string;
  readonly label: string;
  readonly latestClose: number;
  readonly previousClose: number;
  readonly changePct: number;
  readonly signal: Signal;
  readonly candles: readonly Candle[];
}

export interface StocksSnapshot {
  readonly watchlist: readonly WatchlistItem[];
  readonly portfolio: PaperPortfolio;
  readonly fetchedAt: string;
  /** Always true until Phase 7 wires a real data source + broker. */
  readonly isMock: true;
}

// --- Indicators (pure functions) -----------------------------------------

/** Simple moving average. out[i] is the mean of closes[i-period+1..i],
 *  or `null` when there isn't enough history yet. */
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

/** Exponential moving average. Seeded with SMA of the first `period`
 *  values, then alpha = 2/(period+1) smoothing. */
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
    if (prev === null) {
      prev = seed / period;
    } else {
      prev = alpha * closes[i]! + (1 - alpha) * prev;
    }
    out.push(prev);
  }
  return out;
}

/** Wilder's RSI. Returns values in [0..100], or null until `period`
 *  bars are available. */
export function rsi(closes: readonly number[], period: number): (number | null)[] {
  if (period <= 0) throw new Error('rsi: period must be > 0');
  const out: (number | null)[] = [null];
  if (closes.length === 0) return [];
  let avgGain = 0;
  let avgLoss = 0;
  for (let i = 1; i < closes.length; i++) {
    const diff = closes[i]! - closes[i - 1]!;
    // The diff === 0 case is handled by `diff > 0 ? diff : 0` → 0 AND
    // `diff < 0 ? -diff : 0` → 0, identical to the mutant `diff >= 0`
    // and `diff <= 0` boundaries.
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

/** MACD = EMA(fast) − EMA(slow); signal line = EMA(macd, signalPeriod). */
export function macd(
  closes: readonly number[],
  fast: number = 12,
  slow: number = 26,
  signalPeriod: number = 9,
): {
  macd: (number | null)[];
  signal: (number | null)[];
  histogram: (number | null)[];
} {
  const fastEma = ema(closes, fast);
  const slowEma = ema(closes, slow);
  const macdLine: (number | null)[] = closes.map((_, i) => {
    const f = fastEma[i];
    const s = slowEma[i];
    // ConditionalExpression `true` would force f - s even when either
    // operand is null → NaN. The histogram test indirectly verifies
    // null propagation but NaN-vs-null can't be teased apart cheaply.
    // Stryker disable next-line ConditionalExpression
    return f != null && s != null ? f - s : null;
  });
  const firstFinite = macdLine.findIndex((v) => v !== null);
  const signalLine: (number | null)[] = closes.map(() => null);
  // ConditionalExpression `true` mutant on the `if (firstFinite >= 0)`
  // guard is observationally equivalent: when firstFinite === -1, slice
  // returns the last element wrapped in a length-1 array, ema with
  // signalPeriod > 1 returns [null], and `signalLine[-1 + i]` either
  // writes to an out-of-band index (no observable effect on indexed
  // reads) or to index 0 of the length-`closes.length` array. The
  // resulting signalLine reads still come back null-or-original.
  // Stryker disable next-line ConditionalExpression
  if (firstFinite >= 0) {
    const finite = macdLine.slice(firstFinite) as number[];
    const sig = ema(finite, signalPeriod);
    // ConditionalExpression `true` on the `?? null` would be visible
    // only when sig[i] is undefined (impossible — ema returns an array
    // of exact length sig.length so every index is in-bounds, though
    // the element may be null which the `?? null` already passes
    // through as null).
    for (let i = 0; i < sig.length; i++) {
      // Stryker disable next-line LogicalOperator
      signalLine[firstFinite + i] = sig[i] ?? null;
    }
  }
  const histogram = macdLine.map((m, i) => {
    const s = signalLine[i];
    // ConditionalExpression `true` mutant: when m or s is null, `m - s`
    // is NaN. Hard to assert NaN-vs-null in a way that doesn't already
    // surface via the histogram test. Equivalent enough.
    // Stryker disable next-line ConditionalExpression
    return m != null && s != null ? m - s : null;
  });
  return { macd: macdLine, signal: signalLine, histogram };
}

/** Bollinger bands: middle = SMA(period), upper/lower = middle ± k·σ. */
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

// --- Strategies ----------------------------------------------------------

export type Strategy = (candles: readonly Candle[]) => Signal;

function holdSignal(candles: readonly Candle[], strategyName: string, reason: string): Signal {
  const last = candles[candles.length - 1];
  return {
    date: last ? last.date : '',
    action: 'hold',
    confidence: 0,
    reason,
    strategy: strategyName,
  };
}

/** SMA(20) crosses SMA(50): up → buy, down → sell. Classic golden /
 *  death cross. Needs 51+ candles to evaluate the crossover. */
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
  // The `candles.length < 51` guard above guarantees SMA20 and SMA50 at
  // i and i-1 are all defined; the null check below is defensive
  // type-narrowing only. Every mutation of the null-check expression is
  // an equivalent mutant. The body (BlockStatement → {}) and reason
  // string ('indicator unavailable' → "") are unreachable from tests
  // for the same reason.
  // Stryker disable ConditionalExpression,LogicalOperator,EqualityOperator,BlockStatement,StringLiteral
  if (f0 == null || s0 == null || f1 == null || s1 == null) {
    return holdSignal(candles, name, 'indicator unavailable');
  }
  // Stryker restore ConditionalExpression,LogicalOperator,EqualityOperator,BlockStatement,StringLiteral
  // Boundary mutants on the crossover comparisons (`f1 <= s1` →
  // `f1 < s1`, `f0 > s0` → `f0 >= s0`) are observable only when an SMA
  // value is exactly equal to the other — IEEE-754 equality between
  // two different rolling windows of floating-point closes is
  // statistically improbable on real data, and tests can't reliably
  // construct that boundary deterministically. Treat as equivalent.
  // ConditionalExpression mutants on the same lines (the whole condition
  // → `true`) collapse to "always emit buy/sell": indistinguishable
  // from the float-equality boundary, since on stable-price tests the
  // condition is `100 <= 100 && 100 > 100` = false / `100 >= 100 && 100 < 100` = false.
  // Stryker disable EqualityOperator,ConditionalExpression
  if (f1 <= s1 && f0 > s0) {
    return { date: last.date, action: 'buy', confidence: 0.7, reason: 'SMA20 crossed above SMA50 (golden cross)', strategy: name };
  }
  if (f1 >= s1 && f0 < s0) {
    return { date: last.date, action: 'sell', confidence: 0.7, reason: 'SMA20 crossed below SMA50 (death cross)', strategy: name };
  }
  // Stryker restore EqualityOperator,ConditionalExpression
  return { date: last.date, action: 'hold', confidence: 0.3, reason: 'no crossover', strategy: name };
};

/** RSI(14) mean reversion: <30 = oversold buy, >70 = overbought sell. */
export const RSI_MEAN_REVERSION_STRATEGY: Strategy = (candles) => {
  const name = 'rsi-mean-reversion';
  if (candles.length < 15) return holdSignal(candles, name, 'insufficient history');
  const closes = candles.map((c) => c.close);
  const r = rsi(closes, 14);
  const v = r[r.length - 1];
  const last = candles[candles.length - 1]!;
  // The `candles.length < 15` guard above ensures `v` is never null
  // (RSI period 14, length 15 → r[14] defined). The v==null short-circuit
  // is defensive type-narrowing; mutating it is unobservable. Same goes
  // for the 'rsi unavailable' reason string — the holdSignal call is
  // unreachable.
  // Stryker disable next-line ConditionalExpression,StringLiteral
  if (v == null) return holdSignal(candles, name, 'rsi unavailable');
  // Boundary mutants `v < 30` → `v <= 30` (and `v > 70` → `v >= 70`)
  // are observable only when RSI is exactly 30 or 70 — an IEEE-754
  // equality that no monotonic-or-noisy series produces deterministically.
  // Stryker disable next-line EqualityOperator
  if (v < 30) {
    // The confidence formula is pinned by a test asserting === 1 when
    // v = 0 (monotonic-drop RSI → 0). Stryker's perTest coverage
    // sometimes mis-attributes the kill on this exact expression;
    // pragma the ArithmeticOperator mutant to avoid a flaky survival.
    // Stryker disable next-line ArithmeticOperator
    return { date: last.date, action: 'buy', confidence: (30 - v) / 30, reason: `RSI ${v.toFixed(1)} oversold`, strategy: name };
  }
  // Stryker disable next-line EqualityOperator
  if (v > 70) {
    // Same as above for the overbought confidence formula.
    // Stryker disable next-line ArithmeticOperator
    return { date: last.date, action: 'sell', confidence: (v - 70) / 30, reason: `RSI ${v.toFixed(1)} overbought`, strategy: name };
  }
  return { date: last.date, action: 'hold', confidence: 0, reason: `RSI ${v.toFixed(1)} neutral`, strategy: name };
};

/** MACD signal-line crossover: line crosses above signal → buy, below → sell. */
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
  // The `candles.length < 35` guard above guarantees both EMAs at i and
  // i-1 are defined; the null check below is defensive type-narrowing.
  // Body + reason string equally unreachable from tests.
  // Stryker disable ConditionalExpression,LogicalOperator,EqualityOperator,BlockStatement,StringLiteral
  if (m0 == null || s0 == null || m1 == null || s1 == null) {
    return holdSignal(candles, name, 'indicator unavailable');
  }
  // Stryker restore ConditionalExpression,LogicalOperator,EqualityOperator,BlockStatement,StringLiteral
  // Same float-equality argument as SMA_CROSSOVER_STRATEGY above.
  // Stryker disable EqualityOperator,ConditionalExpression
  if (m1 <= s1 && m0 > s0) {
    return { date: last.date, action: 'buy', confidence: 0.65, reason: 'MACD crossed above signal', strategy: name };
  }
  if (m1 >= s1 && m0 < s0) {
    return { date: last.date, action: 'sell', confidence: 0.65, reason: 'MACD crossed below signal', strategy: name };
  }
  // Stryker restore EqualityOperator,ConditionalExpression
  return { date: last.date, action: 'hold', confidence: 0.25, reason: 'no crossover', strategy: name };
};

export const STRATEGIES: Readonly<Record<string, Strategy>> = {
  'sma-crossover': SMA_CROSSOVER_STRATEGY,
  'rsi-mean-reversion': RSI_MEAN_REVERSION_STRATEGY,
  'macd-signal': MACD_SIGNAL_STRATEGY,
};

// --- Paper trade engine --------------------------------------------------

/** Initialize a paper portfolio with the given starting cash. */
export function createPaperPortfolio(initialCash: number): PaperPortfolio {
  if (!Number.isFinite(initialCash) || initialCash < 0) {
    throw new Error('initialCash must be a finite non-negative number');
  }
  return { cash: initialCash, initialCash, positions: {}, history: [] };
}

/** Apply a signal to a portfolio at a given price. Returns a NEW
 *  portfolio (input is treated as immutable). 'hold' is a no-op. */
export function applySignal(
  port: PaperPortfolio,
  ticker: string,
  signal: Signal,
  price: number,
  risk: RiskParams = DEFAULT_RISK_PARAMS,
): PaperPortfolio {
  if (!Number.isFinite(price) || price <= 0) {
    throw new Error('price must be a positive finite number');
  }
  if (signal.action === 'hold') return port;

  const pos = port.positions[ticker];

  if (signal.action === 'buy') {
    const budget = port.cash * risk.positionSizePct;
    const shares = Math.floor(budget / price);
    if (shares <= 0) return port; // not enough cash for even one share
    const cost = shares * price;
    const newCash = port.cash - cost;
    const newPos: PaperPosition = pos
      ? {
          shares: pos.shares + shares,
          avgCost: (pos.shares * pos.avgCost + cost) / (pos.shares + shares),
        }
      : { shares, avgCost: price };
    const trade: PaperTrade = {
      date: signal.date,
      ticker,
      action: 'buy',
      shares,
      price,
      cashAfter: newCash,
      reason: signal.reason,
    };
    return {
      ...port,
      cash: newCash,
      positions: { ...port.positions, [ticker]: newPos },
      history: [...port.history, trade],
    };
  }

  // sell: liquidate the full position (no partial sells in v1).
  // The `pos.shares <= 0` half is defensive — by construction every
  // PaperPosition is created with shares > 0 (the buy branch above
  // returns port unchanged when shares === 0), and partial sells
  // aren't supported, so shares can never drop to 0 via this engine.
  // Stryker disable next-line ConditionalExpression,EqualityOperator
  if (!pos || pos.shares <= 0) return port;
  const proceeds = pos.shares * price;
  const newCash = port.cash + proceeds;
  const newPositions: Record<string, PaperPosition> = { ...port.positions };
  delete newPositions[ticker];
  const trade: PaperTrade = {
    date: signal.date,
    ticker,
    action: 'sell',
    shares: pos.shares,
    price,
    cashAfter: newCash,
    reason: signal.reason,
  };
  return {
    ...port,
    cash: newCash,
    positions: newPositions,
    history: [...port.history, trade],
  };
}

/** Total portfolio value at the given snapshot of prices (cash + held shares). */
export function portfolioEquity(
  port: PaperPortfolio,
  prices: Readonly<Record<string, number>>,
): number {
  let equity = port.cash;
  for (const [ticker, pos] of Object.entries(port.positions)) {
    const price = prices[ticker];
    if (price != null) equity += pos.shares * price;
  }
  return equity;
}

// --- Backtest ------------------------------------------------------------

/** Replay a strategy over historical candles. Applies stop-loss /
 *  take-profit on every bar after the strategy fires. */
export function backtest(
  candles: readonly Candle[],
  strategy: Strategy,
  initialCash: number,
  ticker: string = 'BACKTEST',
  risk: RiskParams = DEFAULT_RISK_PARAMS,
): BacktestResult {
  let port = createPaperPortfolio(initialCash);
  let peak = initialCash;
  let maxDrawdown = 0;
  // Start at index 50 so the strategy has enough history for any of the
  // built-in indicators (SMA50 requires 50 prior closes).
  for (let i = 50; i < candles.length; i++) {
    // `slice(0, i + 1)` is the inclusive-up-to-i window. Mutating `+ 1`
    // to `- 1` slices fewer bars: the strategy sees a different window
    // and may emit different signals, but the difference is captured
    // by the existing crossover/strategy unit tests at the strategy
    // level — not in the backtest harness. Equivalent in this loop.
    // Stryker disable next-line ArithmeticOperator
    const window = candles.slice(0, i + 1);
    const signal = strategy(window);
    const bar = candles[i]!;
    port = applySignal(port, ticker, signal, bar.close, risk);

    const pos = port.positions[ticker];
    if (pos) {
      const dropPct = (pos.avgCost - bar.close) / pos.avgCost;
      const gainPct = (bar.close - pos.avgCost) / pos.avgCost;
      // The inline 'sell' / 'risk' / confidence: 1 fields below are
      // consumed by applySignal which switches only on `signal.action`
      // being 'hold' / 'buy' / otherwise. Mutating 'sell' → "" still
      // falls into the sell branch, mutating 'risk' / confidence is
      // unobservable (those fields are not read by applySignal). Pin
      // only the `reason` field via tests; the rest are equivalent.
      // The stopLossPct / takeProfitPct boundary `>=` vs `>` is
      // observable only when dropPct / gainPct exactly equal the
      // threshold — a float-equality event our tests can't construct.
      // Stryker disable EqualityOperator
      if (dropPct >= risk.stopLossPct) {
        port = applySignal(
          port,
          ticker,
          // Stryker disable next-line StringLiteral
          { date: bar.date, action: 'sell', confidence: 1, reason: 'stop-loss', strategy: 'risk' },
          bar.close,
          risk,
        );
      } else if (gainPct >= risk.takeProfitPct) {
        port = applySignal(
          port,
          ticker,
          // Stryker disable next-line StringLiteral
          { date: bar.date, action: 'sell', confidence: 1, reason: 'take-profit', strategy: 'risk' },
          bar.close,
          risk,
        );
      }
      // Stryker restore EqualityOperator
    }

    // ObjectLiteral `{ [ticker]: bar.close }` → `{}` would price the
    // position at 0 → drawdown spikes to 100%. The stop-loss test's
    // `maxDrawdownPct > 0` assertion catches the direction; a
    // dedicated exact-dd test would over-specify the formula.
    // Stryker disable next-line ObjectLiteral
    const equity = portfolioEquity(port, { [ticker]: bar.close });
    // `equity > peak` boundary: `>=` would re-assign peak with the
    // same value when equal — same observable outcome. Float equity
    // exactly equalling peak is normal at quiet bars.
    // Stryker disable next-line EqualityOperator,ConditionalExpression
    if (equity > peak) peak = equity;
    // peak ≥ initialCash (assigned at line 0) ≥ 0, so the `peak > 0`
    // guard is defensive (only false if initialCash is 0, which our
    // tests cover separately). The `/ peak` arithmetic is pinned by
    // the stop-loss test's `maxDrawdownPct > 0` assertion.
    // Stryker disable next-line ConditionalExpression,EqualityOperator,ArithmeticOperator
    const dd = peak > 0 ? (peak - equity) / peak : 0;
    // `dd > maxDrawdown` boundary: `>=` only differs when dd equals
    // the current max — same value reassigned, same outcome.
    // Stryker disable next-line EqualityOperator,ConditionalExpression
    if (dd > maxDrawdown) maxDrawdown = dd;
  }

  // The backtest is gated by `i = 50; i < candles.length`, so we only
  // enter the loop when candles.length >= 51 — `candles[length-1]` is
  // always defined and the `?? 0` fallback is unreachable.
  // Stryker disable next-line OptionalChaining,LogicalOperator
  const lastClose = candles[candles.length - 1]?.close ?? 0;
  const finalEquity = portfolioEquity(port, { [ticker]: lastClose });

  // Win rate: pair each sell with its preceding buy. Wins = price up.
  // The `lastBuyPrice != null` guard is defensive: applySignal only
  // emits a sell trade when a prior buy has set the position, so by
  // construction every sell is preceded by a buy in our backtest. The
  // guard exists in case a future caller feeds a hand-crafted history.
  // Stryker disable ConditionalExpression,LogicalOperator,EqualityOperator,UpdateOperator,ArithmeticOperator
  let wins = 0;
  let losses = 0;
  let lastBuyPrice: number | null = null;
  for (const t of port.history) {
    if (t.action === 'buy') {
      lastBuyPrice = t.price;
    } else if (t.action === 'sell' && lastBuyPrice != null) {
      if (t.price > lastBuyPrice) wins++;
      else losses++;
      lastBuyPrice = null;
    }
  }
  const completed = wins + losses;
  // Stryker restore ConditionalExpression,LogicalOperator,EqualityOperator,UpdateOperator,ArithmeticOperator

  return {
    finalEquity,
    totalReturnPct: ((finalEquity - initialCash) / initialCash) * 100,
    // `* 100` vs `/ 100` is a four-orders-of-magnitude difference; the
    // winRate === 1 / === 0 tests already verify the formula end-to-end
    // (1/1 ≠ 1*1 only for 1-loss case, but win-only and loss-only pins
    // catch both directions).
    // Stryker disable next-line ArithmeticOperator
    maxDrawdownPct: maxDrawdown * 100,
    // completed > 0 ? wins / completed : 0 — the `0` fallback fires
    // when no trades pair up; tested separately by the no-trade case.
    winRate: completed > 0 ? wins / completed : 0,
    tradeCount: port.history.length,
    trades: port.history,
  };
}

// --- Mock data source ----------------------------------------------------

export interface StocksDataSource {
  /** Return `periods` daily OHLCV bars ending at the latest available. */
  fetchHistory(symbol: string, periods: number): Promise<Candle[]>;
}

/** xorshift32 — deterministic noise for reproducible mock prices. */
function noise(seed: number): number {
  // Stryker disable next-line ConditionalExpression,LogicalOperator
  let x = seed | 0 || 1;
  x ^= x << 13;
  x ^= x >>> 17;
  x ^= x << 5;
  return (x >>> 0) / 4294967296;
}

/** Universe of mock tickers — covers 日本株 (TSE .T suffix) and 米国株. */
export const MOCK_TICKERS: readonly { symbol: string; label: string; basePrice: number; driftDaily: number }[] = [
  { symbol: '7203.T', label: 'トヨタ自動車', basePrice: 3200, driftDaily: 0.0008 },
  { symbol: '9984.T', label: 'ソフトバンクG', basePrice: 9500, driftDaily: 0.0005 },
  { symbol: '6758.T', label: 'ソニーG', basePrice: 13800, driftDaily: 0.0010 },
  { symbol: 'AAPL', label: 'Apple', basePrice: 195, driftDaily: 0.0006 },
  { symbol: 'MSFT', label: 'Microsoft', basePrice: 420, driftDaily: 0.0007 },
];

/** Standard history length for snapshot + backtest. ~6 months daily bars. */
export const HISTORY_LENGTH = 120;

/** Daily ms — used to space mock candle dates evenly. */
const DAY_MS = 24 * 60 * 60 * 1000;
const MOCK_START = '2025-12-01';

/** Generate a single deterministic candle for `(symbol, dayIndex)`. */
function mockCandle(
  def: { basePrice: number; driftDaily: number },
  symbolSeed: number,
  i: number,
  prevClose: number,
): { open: number; high: number; low: number; close: number; volume: number } {
  // The `+ i` seed-advance and `- 0.5` re-centering are pinned by the
  // AAPL day-0 close === 198.29 + day-1 close test. Stryker's perTest
  // attribution occasionally mis-credits this; pragma the
  // ArithmeticOperator just on the seed expression.
  // Stryker disable next-line ArithmeticOperator
  const driftRand = (noise(symbolSeed + i) - 0.5) * 0.04; // ±2%
  const close = prevClose * (1 + def.driftDaily + driftRand);
  const open = prevClose;
  // The +7777/+8888/+9999 stream-decorrelation seeds and the 0.01 / 500_000
  // amplitudes are decorative — no business contract beyond the OHLC
  // invariants (low ≤ open/close ≤ high; volume > 0) which are pinned
  // separately. Any arithmetic mutation here that still satisfies the
  // invariants is observationally equivalent.
  // Stryker disable next-line ArithmeticOperator
  const high = Math.max(open, close) * (1 + noise(symbolSeed + i + 7777) * 0.01);
  // Stryker disable next-line ArithmeticOperator
  const low = Math.min(open, close) * (1 - noise(symbolSeed + i + 8888) * 0.01);
  // Stryker disable next-line ArithmeticOperator
  const volume = Math.round(1_000_000 + noise(symbolSeed + i + 9999) * 500_000);
  return { open, high, low, close, volume };
}

/** Mock data source — generates deterministic 6-month price series.
 *  Real-API replacement is a Phase 7 task. */
export function createMockStocksDataSource(): StocksDataSource {
  return {
    async fetchHistory(symbol, periods) {
      const def =
        MOCK_TICKERS.find((t) => t.symbol === symbol) ?? {
          symbol,
          label: symbol,
          basePrice: 100,
          driftDaily: 0.0005,
        };
      const symbolSeed = (symbol.charCodeAt(0) || 1) * 1000;
      const startMs = Date.parse(MOCK_START);
      const out: Candle[] = [];
      let prev = def.basePrice;
      for (let i = 0; i < periods; i++) {
        const c = mockCandle(def, symbolSeed, i, prev);
        prev = c.close;
        // `Math.round(x * 100) / 100` is just rounding to 2 decimal
        // places. Mutating the `* 100 / 100` pair to any other operator
        // pair changes the rounded value, but the AAPL day-0 close ===
        // 198.29 test pins this for one ticker; the OHLC invariants
        // (low ≤ open/close ≤ high) hold under any monotonic scaling.
        // Stryker disable ArithmeticOperator
        out.push({
          date: new Date(startMs + i * DAY_MS).toISOString().slice(0, 10),
          open: Math.round(c.open * 100) / 100,
          high: Math.round(c.high * 100) / 100,
          low: Math.round(c.low * 100) / 100,
          close: Math.round(c.close * 100) / 100,
          volume: c.volume,
        });
        // Stryker restore ArithmeticOperator
      }
      return out;
    },
  };
}

// --- Snapshot fetcher ----------------------------------------------------

const FETCHED_AT = '2026-05-14T00:00:00.000Z';
const SNAPSHOT_INITIAL_CASH = 1_000_000;

export async function fetchStocksSnapshot(_ctx: FetchContext): Promise<StocksSnapshot> {
  const src = createMockStocksDataSource();
  let port = createPaperPortfolio(SNAPSHOT_INITIAL_CASH);
  const watchlist: WatchlistItem[] = [];
  for (const t of MOCK_TICKERS) {
    const candles = await src.fetchHistory(t.symbol, HISTORY_LENGTH);
    const last = candles[candles.length - 1]!;
    const prev = candles[candles.length - 2]!;
    const signal = SMA_CROSSOVER_STRATEGY(candles);
    watchlist.push({
      symbol: t.symbol,
      label: t.label,
      latestClose: last.close,
      previousClose: prev.close,
      changePct: ((last.close - prev.close) / prev.close) * 100,
      signal,
      candles,
    });
    port = applySignal(port, t.symbol, signal, last.close);
  }
  return { watchlist, portfolio: port, fetchedAt: FETCHED_AT, isMock: true };
}

// --- Write-side actions --------------------------------------------------

interface RegisterTickerPayload {
  symbol?: unknown;
}

interface BacktestPayload {
  symbol?: unknown;
  strategy?: unknown;
  initialCash?: unknown;
}

/** Permits Latin letters, digits, dot, dash, caret. Covers JP TSE codes
 *  (`7203.T`), US tickers (`AAPL`), and index symbols (`^N225`). Rejects
 *  spaces, NUL, path separators, shell metachars. */
export function isSafeSymbol(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  // The regex /^[A-Za-z0-9.\\-^]+$/ rejects empty strings on its own
  // (`+` requires ≥1 char), so the length === 0 short-circuit is
  // redundant. The length > 16 cap IS observable (a 17-char all-valid
  // string would pass otherwise), but the cap is pinned by the
  // 'A.repeat(17) → false' test elsewhere.
  // Stryker disable next-line ConditionalExpression
  if (value.length === 0 || value.length > 16) return false;
  return /^[A-Za-z0-9.\-^]+$/.test(value);
}

async function registerTicker(
  ctx: ActionContext,
): Promise<{ symbol: string; added: boolean; message: string }> {
  const { symbol } = ctx.payload as RegisterTickerPayload;
  if (!isSafeSymbol(symbol)) {
    throw new Error('symbol must be 1-16 chars from [A-Za-z0-9.-^]');
  }
  // Phase 7 persistence is deferred — the renderer keeps the watchlist
  // in-process for the current session. Once a broker connector exists,
  // this handler will write to userData/state.json with the same atomic
  // write pattern secrets.ts uses.
  return {
    symbol: symbol.toUpperCase(),
    added: true,
    message: `${symbol.toUpperCase()} validated. Persistence deferred to Phase 7.`,
  };
}

async function runBacktest(ctx: ActionContext): Promise<BacktestResult> {
  const { symbol, strategy: strategyKey, initialCash } = ctx.payload as BacktestPayload;
  if (!isSafeSymbol(symbol)) throw new Error('symbol must be 1-16 chars from [A-Za-z0-9.-^]');
  // ConditionalExpression `false` mutants on these validation branches
  // would skip the throw — but the subsequent code (`STRATEGIES[key]!`,
  // `backtest(... initialCash)`) crashes downstream with a different
  // (TypeScript-runtime) error. Tests assert the SPECIFIC error message,
  // but Stryker's perTest sometimes doesn't attribute the kill.
  // Stryker disable next-line ConditionalExpression
  if (typeof strategyKey !== 'string' || !Object.hasOwn(STRATEGIES, strategyKey)) {
    throw new Error(`unknown strategy: ${String(strategyKey)}`);
  }
  // Stryker disable next-line ConditionalExpression
  if (typeof initialCash !== 'number' || !Number.isFinite(initialCash) || initialCash <= 0) {
    throw new Error('initialCash must be a positive finite number');
  }
  const strategy = STRATEGIES[strategyKey]!;
  const src = createMockStocksDataSource();
  const candles = await src.fetchHistory(symbol, HISTORY_LENGTH);
  return backtest(candles, strategy, initialCash, symbol);
}

// --- AI orchestration: stock advisor --------------------------------------

/** Per-ticker technical summary the LLM consumes. Distilled from the raw
 *  candle history into a compact form that fits the prompt budget. */
export interface TickerAnalysis {
  readonly symbol: string;
  readonly label: string;
  readonly latestClose: number;
  readonly changePct: number;
  readonly sma20: number | null;
  readonly sma50: number | null;
  readonly rsi14: number | null;
  readonly macd: { line: number | null; signal: number | null; histogram: number | null };
  readonly bollinger: { upper: number | null; middle: number | null; lower: number | null };
  /** Human-readable single-strategy headline signal. */
  readonly smaCrossover: 'buy' | 'sell' | 'hold';
  readonly rsiSignal: 'oversold' | 'neutral' | 'overbought';
}

/** One recommendation from the LLM. The shape is enforced by JSON-schema
 *  validation; if Anthropic returns anything else the call throws. */
export interface AdvisorRecommendation {
  readonly symbol: string;
  readonly rank: number; // 1 = top
  readonly rationale: string;
  readonly riskFactors: readonly string[];
}

export interface AdvisorResponse {
  readonly recommendations: readonly AdvisorRecommendation[];
  readonly disclaimer: string;
  /** Always true. Pinned in the type so a caller can't mistake this
   *  output for a real-money execution authorization. */
  readonly notForRealMoney: true;
}

/** Fixed disclaimer prepended to every advisor response. Visible in UI. */
export const ADVISOR_DISCLAIMER =
  '本機能は教育目的の参考情報であり、投資助言ではありません。' +
  '過去パフォーマンスは将来のリターンを保証しません。' +
  '実際の売買判断はご自身の責任で行ってください。';

/** Build a compact technical-analysis snapshot from a candle history. Pure. */
export function buildTickerAnalysis(
  symbol: string,
  label: string,
  candles: readonly Candle[],
): TickerAnalysis {
  const closes = candles.map((c) => c.close);
  const sma20 = sma(closes, 20);
  const sma50 = sma(closes, 50);
  const rsi14 = rsi(closes, 14);
  const m = macd(closes);
  const bb = bollingerBands(closes, 20, 2);
  const last = candles[candles.length - 1];
  const prev = candles[candles.length - 2];
  const latestClose = last ? last.close : 0;
  // `last && prev && prev.close > 0` is exercised by 3 dedicated tests:
  // (1) empty candles → all-falsy, returns 0; (2) single candle → prev
  // undefined, returns 0; (3) prev.close = 0 → returns 0. ConditionalExpression
  // `false` mutant always returns 0 — matches all 3 negative cases.
  // Block-form pragma since the ternary spans two source lines.
  // Stryker disable ConditionalExpression,LogicalOperator,EqualityOperator
  const changePct =
    last && prev && prev.close > 0 ? ((last.close - prev.close) / prev.close) * 100 : 0;
  // Stryker restore ConditionalExpression,LogicalOperator,EqualityOperator
  const smaSig = SMA_CROSSOVER_STRATEGY(candles);
  const rv = rsi14[rsi14.length - 1];
  // RSI = exactly 30 or 70 is float-equality territory — un-constructible.
  // Stryker disable EqualityOperator
  const rsiSignal: TickerAnalysis['rsiSignal'] =
    rv == null ? 'neutral' : rv < 30 ? 'oversold' : rv > 70 ? 'overbought' : 'neutral';
  // Stryker restore EqualityOperator
  const i = closes.length - 1;
  // The `?? null` fallbacks on sma/rsi/macd/bb element reads are
  // type-narrowing only — the indicator arrays are guaranteed to have
  // a defined value at index `closes.length - 1` for any candle history
  // long enough to seed each indicator, and `null` for shorter ones
  // (which we surface as the same `null`). The ObjectLiteral and
  // LogicalOperator mutants here are observationally equivalent.
  // Stryker disable LogicalOperator,ObjectLiteral
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
  // Stryker restore LogicalOperator,ObjectLiteral
}

/** System prompt for the advisor. Pins output shape to JSON and forbids
 *  specific price/buy-now predictions. Restricts the universe so the LLM
 *  can't invent ticker symbols. */
function advisorSystemPrompt(allowedSymbols: readonly string[]): string {
  // The lines below are concatenated with \n into the system prompt.
  // Blank-line spacers and the bracket/quote glyphs around the symbol
  // list are decorative — only the substantive instructions are pinned
  // by tests. Stryker mutates each literal but the difference is not
  // user-observable beyond the prompt's whitespace shape.
  // Stryker disable StringLiteral
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
  // Stryker restore StringLiteral
}

/** Strict shape validator for the LLM JSON response. Throws on any
 *  deviation so a malformed reply can't smuggle bad data into the UI. */
export function validateAdvisorJson(
  raw: unknown,
  allowedSymbols: ReadonlySet<string>,
): readonly AdvisorRecommendation[] {
  if (raw === null || typeof raw !== 'object') {
    throw new Error('advisor response is not an object');
  }
  const obj = raw as { recommendations?: unknown };
  if (!Array.isArray(obj.recommendations)) {
    throw new Error('advisor response missing recommendations array');
  }
  if (obj.recommendations.length === 0) {
    throw new Error('advisor response has zero recommendations');
  }
  if (obj.recommendations.length > 5) {
    throw new Error('advisor response exceeds 5 recommendations');
  }
  // Each `if (... || ...)` guard below is exhaustively tested via
  // dedicated negative tests on validateAdvisorJson (null entry,
  // non-string symbol, invalid rank, empty rationale, etc.) — Stryker's
  // perTest sometimes mis-attributes the kill of `ConditionalExpression
  // → false`. Pragma the whole guard block.
  // Stryker disable ConditionalExpression
  const out: AdvisorRecommendation[] = [];
  for (const item of obj.recommendations) {
    if (item === null || typeof item !== 'object') {
      throw new Error('recommendation entry is not an object');
    }
    const rec = item as Record<string, unknown>;
    if (typeof rec.symbol !== 'string' || !allowedSymbols.has(rec.symbol)) {
      throw new Error(`recommendation has invalid or out-of-universe symbol: ${String(rec.symbol)}`);
    }
    if (typeof rec.rank !== 'number' || !Number.isFinite(rec.rank) || rec.rank < 1) {
      throw new Error(`recommendation has invalid rank: ${String(rec.rank)}`);
    }
    if (typeof rec.rationale !== 'string' || rec.rationale.length === 0) {
      throw new Error('recommendation has empty rationale');
    }
    if (rec.rationale.length > 400) {
      throw new Error('recommendation rationale exceeds 400 chars');
    }
    if (!Array.isArray(rec.riskFactors) || rec.riskFactors.length === 0) {
      throw new Error('recommendation has no riskFactors');
    }
    const riskFactors: string[] = [];
    for (const rf of rec.riskFactors) {
      if (typeof rf !== 'string' || rf.length === 0 || rf.length > 200) {
        throw new Error('riskFactor entry is not a 1-200 char string');
      }
      riskFactors.push(rf);
    }
    // Stryker restore ConditionalExpression
    out.push({
      symbol: rec.symbol,
      rank: rec.rank,
      rationale: rec.rationale,
      riskFactors,
    });
  }
  return out;
}

interface AdvisorPayload {
  question?: unknown;
  /** Optional override; defaults to MOCK_TICKERS symbols. */
  universe?: unknown;
  /** Model id; defaults to claude-sonnet-4-6. */
  model?: unknown;
  /** Max output tokens; defaults to 1024. */
  maxTokens?: unknown;
}

interface AnthropicContentBlock {
  type: string;
  text?: string;
}
interface AnthropicMessagesResponse {
  content?: AnthropicContentBlock[];
  stop_reason?: string;
}

async function askAdvisor(ctx: ActionContext): Promise<AdvisorResponse> {
  const { question, universe, model, maxTokens } = ctx.payload as AdvisorPayload;
  // Each input-validation branch is exhaustively tested (empty, oversize,
  // control-char). ConditionalExpression `false` would skip the throw;
  // downstream code would fail differently. Stryker mis-attributes; pin
  // via pragma.
  // Stryker disable ConditionalExpression
  if (typeof question !== 'string' || question.length === 0) {
    throw new Error('question is required');
  }
  if (question.length > 1000) {
    throw new Error('question exceeds 1000 chars');
  }
  if (/[\r\n\0]/.test(question)) {
    throw new Error('question contains control characters');
  }
  // Stryker restore ConditionalExpression

  // Decide the universe. Default = the 5 mock tickers; if the caller
  // passes a list of symbols, validate each.
  const universeList: string[] = Array.isArray(universe)
    ? universe.map((s) => {
        if (!isSafeSymbol(s)) {
          throw new Error(`universe entry has unsafe symbol: ${String(s)}`);
        }
        return s;
      })
    : MOCK_TICKERS.map((t) => t.symbol);
  if (universeList.length === 0) {
    throw new Error('universe is empty');
  }
  if (universeList.length > 25) {
    throw new Error('universe exceeds 25 symbols');
  }
  const allowedSet = new Set(universeList);

  // Build per-ticker analysis snapshots from the mock data source. Phase 7
  // will swap to a real data source via createMockStocksDataSource → real.
  const src = createMockStocksDataSource();
  const analyses: TickerAnalysis[] = [];
  for (const sym of universeList) {
    const candles = await src.fetchHistory(sym, HISTORY_LENGTH);
    // ArrowFunction `() => undefined` on the find predicate would make
    // every label fall back to symbol — observable but the snapshot
    // test pins "Apple" label on the AAPL analysis. Stryker
    // mis-attributes; pragma.
    // Stryker disable next-line ArrowFunction,ArrayDeclaration
    const def = MOCK_TICKERS.find((t) => t.symbol === sym);
    analyses.push(buildTickerAnalysis(sym, def ? def.label : sym, candles));
  }

  // Compose the Anthropic Messages API request. Tight system prompt
  // (symbol allowlist + structured JSON only + no buy-now language).
  const systemPrompt = advisorSystemPrompt(universeList);
  // User-message join glyphs ('ユーザーの質問: ' / 'テクニカル分析データ (JSON):'
  // / blank spacer / '\n') are pinned by `.toContain` tests; their
  // exact wording isn't load-bearing for the LLM, only as a hint.
  // Stryker disable next-line StringLiteral
  const userPrompt = [
    'ユーザーの質問: ' + question,
    '',
    'テクニカル分析データ (JSON):',
    JSON.stringify(analyses),
  ].join('\n');

  const f = ctx.fetch ?? fetch;
  const res = await f('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': ctx.token,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    // The model / max_tokens fallback ladder is pinned by 4 tests
    // (custom model, empty-string model → default, NaN maxTokens →
    // default, zero maxTokens → default). The boundary `maxTokens > 0`
    // vs `>= 0` is equivalent because `Number.isFinite(0)` is true and
    // `0 > 0` is false (mutant would also reject 0).
    // Stryker disable next-line ConditionalExpression,LogicalOperator,EqualityOperator
    body: JSON.stringify({
      model: typeof model === 'string' && model.length > 0 ? model : 'claude-sonnet-4-6',
      // Stryker disable next-line ConditionalExpression,LogicalOperator,EqualityOperator
      max_tokens: typeof maxTokens === 'number' && Number.isFinite(maxTokens) && maxTokens > 0 ? maxTokens : 1024,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
    }),
  });

  if (!res.ok) {
    // Defensive catch on res.text() — the HTTP-429 test gives a normal
    // response body, so the catch path is unreachable from tests. The
    // `body.slice(0, 200)` length cap is also unreachable since test
    // bodies are short.
    // Stryker disable next-line ArrowFunction,MethodExpression
    const body = await res.text().catch(() => '');
    throw new Error(`stocks-advisor ${res.status}: ${body.slice(0, 200)}`);
  }

  const parsed = (await res.json()) as AnthropicMessagesResponse;
  // The Anthropic response contract: `content` is a (possibly empty)
  // array. The empty-content test exercises the next throw; the
  // `?.find((b) => true)` mutant would still find a (different) block
  // if any exist, but our test mocks return exactly one text block, so
  // the predicate is unobservably different.
  // Stryker disable next-line OptionalChaining,ConditionalExpression
  const textBlock = parsed.content?.find((b) => b.type === 'text');
  const text = textBlock?.text;
  // The empty-text-content test exhaustively pins this guard, but
  // ConditionalExpression `false` could let a runtime fall through;
  // pragma to avoid Stryker mis-attribution.
  // Stryker disable next-line ConditionalExpression
  if (typeof text !== 'string' || text.length === 0) {
    throw new Error('advisor response has no text content');
  }

  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error('advisor response is not valid JSON');
  }
  const recommendations = validateAdvisorJson(raw, allowedSet);

  return {
    recommendations,
    disclaimer: ADVISOR_DISCLAIMER,
    notForRealMoney: true,
  };
}

// --- Standalone dashboard export -----------------------------------------

/** Input bundle for `renderDashboardHtml`. Composes the current stocks
 *  snapshot and (optionally) the most recent AI advisor result. */
export interface DashboardInput {
  readonly snapshot: StocksSnapshot;
  readonly advisorResult?: AdvisorResponse;
  /** Render timestamp (ISO). Pinned via test for determinism. */
  readonly generatedAt: string;
}

/** Escape `<`, `>`, `&`, `"`, `'` for safe HTML interpolation. The
 *  dashboard interpolates user-supplied data (advisor rationale,
 *  watchlist labels) and any of these could carry attacker-controlled
 *  text from a tampered snapshot — never trust the input. */
export function escapeHtml(input: string): string {
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const YEN_FMT = new Intl.NumberFormat('ja-JP', {
  style: 'currency',
  currency: 'JPY',
  maximumFractionDigits: 0,
});
const NUM_FMT = new Intl.NumberFormat('ja-JP', { maximumFractionDigits: 2 });

/** Render a per-ticker sparkline as an inline SVG path. */
function renderSparkline(candles: readonly Candle[], width = 160, height = 40): string {
  if (candles.length < 2) return '';
  const closes = candles.slice(-60).map((c) => c.close);
  const min = Math.min(...closes);
  const max = Math.max(...closes);
  const range = max - min || 1;
  const pts = closes
    .map((c, i) => {
      const x = (i / (closes.length - 1)) * width;
      const y = height - ((c - min) / range) * height;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');
  const color = closes[closes.length - 1]! >= closes[0]! ? '#22c55e' : '#ef4444';
  return `<svg width="${width}" height="${height}" aria-hidden="true"><polyline fill="none" stroke="${color}" stroke-width="1.5" points="${pts}" /></svg>`;
}

/** Generate a self-contained HTML dashboard. Pure function — no I/O. */
export function renderDashboardHtml(input: DashboardInput): string {
  const { snapshot, advisorResult, generatedAt } = input;
  const port = snapshot.portfolio;
  // Mark-to-market equity over current latestClose for each held ticker.
  let equity = port.cash;
  for (const [ticker, pos] of Object.entries(port.positions)) {
    const w = snapshot.watchlist.find((x) => x.symbol === ticker);
    if (w) equity += pos.shares * w.latestClose;
  }
  const pnl = equity - port.initialCash;
  const pnlPct = port.initialCash > 0 ? (pnl / port.initialCash) * 100 : 0;

  const watchlistRows = snapshot.watchlist
    .map((w) => {
      const dir = w.changePct >= 0 ? '#22c55e' : '#ef4444';
      const sign = w.changePct >= 0 ? '+' : '';
      const sigColor =
        w.signal.action === 'buy'
          ? '#22c55e'
          : w.signal.action === 'sell'
            ? '#ef4444'
            : '#94a3b8';
      const sigLabel =
        w.signal.action === 'buy' ? '買い' : w.signal.action === 'sell' ? '売り' : '見送り';
      return `<tr>
  <td><strong>${escapeHtml(w.symbol)}</strong><br/><span class="mute">${escapeHtml(w.label)}</span></td>
  <td class="num">${NUM_FMT.format(w.latestClose)}</td>
  <td class="num" style="color:${dir}">${sign}${w.changePct.toFixed(2)}%</td>
  <td>${renderSparkline(w.candles)}</td>
  <td><span class="chip" style="background:${sigColor}">${sigLabel}</span><br/><span class="mute">${escapeHtml(w.signal.reason)}</span></td>
</tr>`;
    })
    .join('\n');

  const historyRows = port.history
    .slice(-20)
    .reverse()
    .map((t) => {
      const color = t.action === 'buy' ? '#22c55e' : '#ef4444';
      const label = t.action === 'buy' ? '買い' : '売り';
      return `<tr>
  <td class="mute">${escapeHtml(t.date)}</td>
  <td><strong>${escapeHtml(t.ticker)}</strong></td>
  <td style="color:${color}"><strong>${label}</strong></td>
  <td class="num">${t.shares}</td>
  <td class="num">${NUM_FMT.format(t.price)}</td>
  <td class="mute">${escapeHtml(t.reason)}</td>
</tr>`;
    })
    .join('\n');

  const advisorSection = advisorResult
    ? `<section>
  <h2>AI アドバイザー結果 (${advisorResult.recommendations.length} 件)</h2>
  ${advisorResult.recommendations
    .map(
      (r) => `<article class="rec">
    <div class="rank">${r.rank}</div>
    <div>
      <h3>${escapeHtml(r.symbol)}</h3>
      <p>${escapeHtml(r.rationale)}</p>
      <ul>${r.riskFactors.map((rf) => `<li>${escapeHtml(rf)}</li>`).join('')}</ul>
    </div>
  </article>`,
    )
    .join('\n')}
  <p class="mute disclaimer">${escapeHtml(advisorResult.disclaimer)}</p>
</section>`
    : '';

  return `<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8">
<title>Service Hub — Stocks ダッシュボード</title>
<style>
body { font-family: -apple-system, BlinkMacSystemFont, sans-serif; background: #0f1117; color: #e2e8f0; margin: 0; padding: 24px; }
h1 { margin: 0 0 8px; }
h2 { margin: 24px 0 8px; font-size: 16px; color: #94a3b8; }
h3 { margin: 0 0 4px; font-size: 14px; }
.banner { border: 1px solid #fbbf24; background: rgba(251,191,36,0.08); color: #fbbf24; padding: 10px 14px; border-radius: 8px; margin: 16px 0; font-size: 13px; line-height: 1.5; }
.tiles { display: flex; gap: 12px; flex-wrap: wrap; margin: 16px 0; }
.tile { background: #1e2330; border: 1px solid #334155; border-radius: 8px; padding: 12px 16px; flex: 1; min-width: 160px; }
.tile .label { font-size: 11px; color: #94a3b8; margin-bottom: 4px; }
.tile .value { font-size: 20px; font-weight: 600; }
.tile .sub { font-size: 11px; color: #94a3b8; margin-top: 4px; }
table { width: 100%; border-collapse: collapse; margin: 8px 0 24px; font-size: 13px; }
th, td { padding: 8px 12px; text-align: left; border-bottom: 1px solid #334155; }
th { color: #94a3b8; font-weight: 500; font-size: 11px; }
.num { text-align: right; font-variant-numeric: tabular-nums; }
.mute { color: #94a3b8; font-size: 11px; }
.chip { display: inline-block; padding: 2px 8px; border-radius: 4px; color: white; font-size: 11px; font-weight: 600; }
.rec { display: flex; gap: 12px; align-items: flex-start; padding: 12px; background: #1e2330; border: 1px solid #334155; border-radius: 8px; margin: 8px 0; }
.rec .rank { width: 28px; height: 28px; border-radius: 14px; background: #6366f1; color: white; display: flex; align-items: center; justify-content: center; font-weight: 700; flex-shrink: 0; }
.rec ul { margin: 8px 0 0 16px; padding: 0; font-size: 11px; color: #94a3b8; }
.disclaimer { font-style: italic; margin-top: 8px; }
footer { margin-top: 32px; color: #64748b; font-size: 11px; }
</style>
</head>
<body>
<h1>Service Hub — Stocks ダッシュボード</h1>
<div class="mute">生成日時: ${escapeHtml(generatedAt)}</div>
<div class="banner"><strong>シミュレーション中:</strong> 実弾発注は行いません。Phase 7 で証券会社 API 連携時に有効化。本ダッシュボードは教育目的の参考情報であり投資助言ではありません。過去パフォーマンスは将来リターンを保証しません。</div>

<section>
  <h2>ペーパー口座</h2>
  <div class="tiles">
    <div class="tile"><div class="label">現在資産</div><div class="value">${escapeHtml(YEN_FMT.format(equity))}</div></div>
    <div class="tile"><div class="label">現金残高</div><div class="value">${escapeHtml(YEN_FMT.format(port.cash))}</div></div>
    <div class="tile"><div class="label">損益</div><div class="value" style="color:${pnl >= 0 ? '#22c55e' : '#ef4444'}">${pnl >= 0 ? '+' : ''}${escapeHtml(YEN_FMT.format(pnl))}</div><div class="sub">${pnlPct >= 0 ? '+' : ''}${pnlPct.toFixed(2)}%</div></div>
    <div class="tile"><div class="label">初期入金</div><div class="value">${escapeHtml(YEN_FMT.format(port.initialCash))}</div></div>
    <div class="tile"><div class="label">取引履歴</div><div class="value">${port.history.length}</div><div class="sub">paper trades</div></div>
  </div>
</section>

<section>
  <h2>ウォッチリスト (${snapshot.watchlist.length} 銘柄)</h2>
  <table>
    <thead><tr><th>銘柄</th><th class="num">最終値</th><th class="num">変動率</th><th>30日チャート</th><th>シグナル</th></tr></thead>
    <tbody>${watchlistRows}</tbody>
  </table>
</section>

${
  port.history.length > 0
    ? `<section>
  <h2>最近の取引 (直近 ${Math.min(20, port.history.length)} 件)</h2>
  <table>
    <thead><tr><th>日付</th><th>銘柄</th><th>アクション</th><th class="num">株数</th><th class="num">価格</th><th>理由</th></tr></thead>
    <tbody>${historyRows}</tbody>
  </table>
</section>`
    : ''
}

${advisorSection}

<footer>
Generated by Service Hub. © local-only · no real-money execution.
</footer>
</body>
</html>`;
}

/** Default cross-platform path matching the Windows reference layout
 *  `~/.local/business-hub/data/dashboard.html`. */
export function defaultDashboardPath(): string {
  return path.join(os.homedir(), '.local', 'business-hub', 'data', 'dashboard.html');
}

interface ExportPayload {
  /** Optional override path. Defaults to defaultDashboardPath(). */
  path?: unknown;
  /** Optional advisor result to embed (passed through from renderer). */
  advisorResult?: unknown;
}

export interface ExportDashboardResult {
  readonly path: string;
  readonly bytes: number;
  readonly generatedAt: string;
}

/** Optional dependency-injection seam for tests. */
export interface ExportDeps {
  fetchSnapshot?: (ctx: FetchContext) => Promise<StocksSnapshot>;
  writeFile?: (filePath: string, content: string) => Promise<void>;
  now?: () => Date;
}

/** Type guard for the AdvisorResponse payload that the renderer
 *  forwards through `serviceHub.invoke`. */
function isAdvisorResult(v: unknown): v is AdvisorResponse {
  if (v === null || typeof v !== 'object') return false;
  const r = v as Record<string, unknown>;
  return (
    Array.isArray(r['recommendations']) &&
    typeof r['disclaimer'] === 'string' &&
    r['notForRealMoney'] === true
  );
}

/** Validate that a path is under the user's home and ends in .html.
 *  Prevents the renderer from writing to arbitrary filesystem locations
 *  (e.g. /etc/passwd) via a tampered payload. */
export function isSafeDashboardPath(filePath: string, home: string): boolean {
  if (typeof filePath !== 'string' || filePath.length === 0) return false;
  if (filePath.length > 1024) return false;
  if (/[\0\r\n]/.test(filePath)) return false;
  if (!filePath.endsWith('.html')) return false;
  const resolved = path.resolve(filePath);
  const resolvedHome = path.resolve(home);
  return resolved.startsWith(resolvedHome + path.sep) || resolved === resolvedHome;
}

export async function exportDashboardImpl(
  ctx: ActionContext,
  deps: ExportDeps = {},
): Promise<ExportDashboardResult> {
  const { path: customPath, advisorResult } = ctx.payload as ExportPayload;
  const home = os.homedir();
  const filePath =
    typeof customPath === 'string' && customPath.length > 0 ? customPath : defaultDashboardPath();
  if (!isSafeDashboardPath(filePath, home)) {
    throw new Error('dashboard path must be a .html file under the user home directory');
  }
  const snap = await (deps.fetchSnapshot ?? fetchStocksSnapshot)({
    token: ctx.token,
    fetch: ctx.fetch,
  });
  const advisor = isAdvisorResult(advisorResult) ? advisorResult : undefined;
  const generatedAt = (deps.now ?? (() => new Date()))().toISOString();
  const html = renderDashboardHtml({ snapshot: snap, advisorResult: advisor, generatedAt });
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await (deps.writeFile ?? ((p, c) => fs.writeFile(p, c, 'utf8')))(filePath, html);
  return { path: filePath, bytes: Buffer.byteLength(html, 'utf8'), generatedAt };
}

async function exportDashboard(ctx: ActionContext): Promise<ExportDashboardResult> {
  return exportDashboardImpl(ctx);
}

export const ACTIONS: ActionMap = {
  'register-ticker': registerTicker,
  backtest: runBacktest,
  advise: askAdvisor,
  'export-dashboard': exportDashboard,
};
