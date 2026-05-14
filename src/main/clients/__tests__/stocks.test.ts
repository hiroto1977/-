import { describe, expect, it, vi } from 'vitest';
import {
  sma,
  ema,
  rsi,
  macd,
  bollingerBands,
  SMA_CROSSOVER_STRATEGY,
  RSI_MEAN_REVERSION_STRATEGY,
  MACD_SIGNAL_STRATEGY,
  STRATEGIES,
  createPaperPortfolio,
  applySignal,
  portfolioEquity,
  backtest,
  createMockStocksDataSource,
  fetchStocksSnapshot,
  isSafeSymbol,
  ACTIONS,
  MOCK_TICKERS,
  HISTORY_LENGTH,
  DEFAULT_RISK_PARAMS,
  buildTickerAnalysis,
  validateAdvisorJson,
  ADVISOR_DISCLAIMER,
  renderDashboardHtml,
  escapeHtml,
  defaultDashboardPath,
  isSafeDashboardPath,
  exportDashboardImpl,
  type Candle,
  type Signal,
  type StocksSnapshot,
  type AdvisorResponse,
  loadStocksState,
  saveStocksState,
  addWatchlistEntry,
  removeWatchlistEntry,
  defaultStatePath,
  registerTickerImpl,
  unregisterTickerImpl,
  fetchStocksSnapshotImpl,
  type StateDeps,
  type StocksState,
} from '../stocks';
import os from 'node:os';
import path from 'node:path';

// --- Indicators ---------------------------------------------------------

describe('sma', () => {
  it('returns the period-window arithmetic mean and null for short prefixes', () => {
    expect(sma([1, 2, 3, 4, 5], 3)).toEqual([null, null, 2, 3, 4]);
  });

  it('handles period === 1 as identity', () => {
    expect(sma([5, 10, 15], 1)).toEqual([5, 10, 15]);
  });

  it('throws on period <= 0', () => {
    expect(() => sma([1, 2, 3], 0)).toThrow(/period must be > 0/);
    expect(() => sma([1, 2, 3], -1)).toThrow(/period must be > 0/);
  });

  it('returns empty array on empty input', () => {
    expect(sma([], 3)).toEqual([]);
  });

  it('sliding-window correctness past the seed (last cell uses last `period` values only)', () => {
    // [1,2,3,4,5,6], p=3 → [null, null, 2, 3, 4, 5]
    expect(sma([1, 2, 3, 4, 5, 6], 3)).toEqual([null, null, 2, 3, 4, 5]);
  });
});

describe('ema', () => {
  it('seeds with SMA(period) and applies alpha=2/(period+1) smoothing', () => {
    // closes [1..5], p=3, alpha=0.5 → seed=2 → 0.5*4+0.5*2=3 → 0.5*5+0.5*3=4
    expect(ema([1, 2, 3, 4, 5], 3)).toEqual([null, null, 2, 3, 4]);
  });

  it('throws on period <= 0', () => {
    expect(() => ema([1, 2, 3], 0)).toThrow(/period must be > 0/);
    expect(() => ema([1, 2, 3], -5)).toThrow(/period must be > 0/);
  });

  it('returns empty array on empty input', () => {
    expect(ema([], 5)).toEqual([]);
  });

  it('handles period === 1 as identity', () => {
    // alpha = 2/2 = 1, so every step is just the new value
    expect(ema([2, 4, 6], 1)).toEqual([2, 4, 6]);
  });
});

describe('rsi', () => {
  it('returns 100 when there are no losses (avgLoss === 0 branch)', () => {
    // Strictly increasing → losses zero → RSI 100 once seeded
    expect(rsi([1, 2, 3, 4, 5, 6], 2)).toEqual([null, null, 100, 100, 100, 100]);
  });

  it('returns 100 (not NaN) for a perfectly flat series (kills L179 `avgLoss === 0` → false)', () => {
    // Flat input → diff = 0 for every step → both avgGain and avgLoss
    // stay 0. The original short-circuit returns 100. Without it the
    // formula evaluates `100 - 100 / (1 + 0/0)` = `100 - 100/NaN` = NaN.
    expect(rsi([5, 5, 5, 5, 5], 2)).toEqual([null, null, 100, 100, 100]);
  });

  it('produces canonical values for an alternating series', () => {
    // 1,2,1,2,1,2,1,2 with period 2: at i=2 (gain,loss)=(1,1) → 50;
    // then Wilder smoothing produces 75, 37.5, 68.75, 34.375, 67.1875.
    expect(rsi([1, 2, 1, 2, 1, 2, 1, 2], 2)).toEqual([
      null,
      null,
      50,
      75,
      37.5,
      68.75,
      34.375,
      67.1875,
    ]);
  });

  it('throws on period <= 0', () => {
    expect(() => rsi([1, 2, 3], 0)).toThrow(/period must be > 0/);
    expect(() => rsi([1, 2, 3], -1)).toThrow(/period must be > 0/);
  });

  it('returns empty array on empty input', () => {
    expect(rsi([], 14)).toEqual([]);
  });

  it('leading positions before period are null', () => {
    const out = rsi([1, 2, 3, 4, 5], 3);
    expect(out[0]).toBeNull();
    expect(out[1]).toBeNull();
    expect(out[2]).toBeNull();
    expect(out[3]).toBe(100);
  });
});

describe('macd', () => {
  it('produces null until both fast and slow EMAs are available, then macd = fast - slow', () => {
    const closes = Array.from({ length: 30 }, (_, i) => i + 1);
    const m = macd(closes, 3, 6, 4);
    // index 5 (i.e. closes[5]=6) is the first where slow EMA(6) seeds.
    for (let i = 0; i < 5; i++) {
      expect(m.macd[i]).toBeNull();
      expect(m.signal[i]).toBeNull();
      expect(m.histogram[i]).toBeNull();
    }
    // At i=5: fastEma(3) seeded at i=2 then iterated alpha=0.5 →
    //   i=2: 2, i=3: 3, i=4: 4, i=5: 5.
    // slowEma(6) seeds at i=5: SMA(1..6)=3.5.
    // macd = 5 - 3.5 = 1.5.
    expect(m.macd[5]).toBeCloseTo(1.5, 6);
  });

  it('populates signal line when firstFinite === 0 (kills `firstFinite >= 0` → `> 0`)', () => {
    // With fast = slow = 1, both EMAs equal the close at index 0 →
    // macdLine[0] = 0 → firstFinite === 0. Original `>= 0` enters the
    // branch and populates signalLine; mutant `> 0` would skip,
    // leaving signal all-null.
    const closes = [10, 12, 11, 13];
    const m = macd(closes, 1, 1, 1);
    // macd line should be all zeros (close - close).
    expect(m.macd).toEqual([0, 0, 0, 0]);
    // signal line should also be populated (not all null).
    expect(m.signal[0]).not.toBeNull();
    expect(m.signal.every((v) => v !== null)).toBe(true);
  });

  it('histogram = macd − signal at every index where both are defined', () => {
    const closes = Array.from({ length: 50 }, (_, i) => Math.sin(i / 3) * 10 + 100);
    const m = macd(closes);
    for (let i = 0; i < closes.length; i++) {
      const mv = m.macd[i];
      const sv = m.signal[i];
      const hv = m.histogram[i];
      if (mv != null && sv != null) {
        expect(hv).not.toBeNull();
        expect(hv!).toBeCloseTo(mv - sv, 9);
      } else {
        expect(hv).toBeNull();
      }
    }
  });
});

describe('bollingerBands', () => {
  it('middle === SMA(period); upper/lower = middle ± k·σ', () => {
    const closes = [2, 4, 4, 4, 5, 5, 7, 9];
    const bb = bollingerBands(closes, 4, 2);
    expect(bb.middle[3]).toBe(3.5); // (2+4+4+4)/4
    // variance of [2,4,4,4] around mean 3.5 = (1.5² + 0.5²·3) / 4 = 3 / 4 = 0.75
    // stddev = √0.75 ≈ 0.866.
    const sigma = Math.sqrt(0.75);
    expect(bb.upper[3]!).toBeCloseTo(3.5 + 2 * sigma, 9);
    expect(bb.lower[3]!).toBeCloseTo(3.5 - 2 * sigma, 9);
  });

  it('returns null bands until period bars are available', () => {
    const bb = bollingerBands([1, 2, 3], 5, 2);
    expect(bb.upper).toEqual([null, null, null]);
    expect(bb.lower).toEqual([null, null, null]);
    expect(bb.middle).toEqual([null, null, null]);
  });

  it('throws on period <= 0 from bollingerBands itself (kills L224 `<= 0` → `< 0` boundary)', () => {
    // Pin the bollingerBands-specific message so the validation can't
    // silently delegate to sma's throw. Mutation `<= 0` → `< 0` would
    // skip bollingerBands' own guard at period === 0; sma would still
    // throw, but with a different message.
    expect(() => bollingerBands([1, 2, 3], 0, 2)).toThrow(/^bollingerBands: period must be > 0/);
    expect(() => bollingerBands([1, 2, 3], -1, 2)).toThrow(/^bollingerBands: period must be > 0/);
  });
});

// --- Property-based / invariant tests for indicators -----------------

describe('indicator invariants (property tests)', () => {
  // Deterministic pseudo-random closes (xorshift32) so the test is
  // reproducible across runs.
  function makeCloses(seed: number, n: number): number[] {
    let x = seed | 0 || 1;
    const out: number[] = [];
    let price = 100;
    for (let i = 0; i < n; i++) {
      x ^= x << 13;
      x ^= x >>> 17;
      x ^= x << 5;
      const r = ((x >>> 0) / 4294967296 - 0.5) * 0.06;
      price = Math.max(1, price * (1 + r));
      out.push(price);
    }
    return out;
  }

  const seeds = [1, 7, 42, 1337, 99991];

  it.each(seeds)('sma length always matches input length (seed=%d)', (seed) => {
    const closes = makeCloses(seed, 60);
    expect(sma(closes, 5)).toHaveLength(60);
    expect(sma(closes, 20)).toHaveLength(60);
    expect(sma(closes, 1)).toHaveLength(60);
  });

  it.each(seeds)('sma respects bounds: every value in [min(window), max(window)] (seed=%d)', (seed) => {
    const closes = makeCloses(seed, 60);
    const period = 5;
    const out = sma(closes, period);
    for (let i = period - 1; i < closes.length; i++) {
      const window = closes.slice(i - period + 1, i + 1);
      const min = Math.min(...window);
      const max = Math.max(...window);
      expect(out[i]!).toBeGreaterThanOrEqual(min);
      expect(out[i]!).toBeLessThanOrEqual(max);
    }
  });

  it.each(seeds)('rsi values always in [0, 100] (seed=%d)', (seed) => {
    const closes = makeCloses(seed, 60);
    for (const v of rsi(closes, 14)) {
      if (v !== null) {
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(100);
      }
    }
  });

  it.each(seeds)('bollingerBands: lower ≤ middle ≤ upper everywhere (seed=%d)', (seed) => {
    const closes = makeCloses(seed, 60);
    const bb = bollingerBands(closes, 20, 2);
    for (let i = 0; i < closes.length; i++) {
      const l = bb.lower[i];
      const m = bb.middle[i];
      const u = bb.upper[i];
      if (l != null && m != null && u != null) {
        expect(l).toBeLessThanOrEqual(m);
        expect(m).toBeLessThanOrEqual(u);
      }
    }
  });

  it.each(seeds)('macd histogram = macd − signal pointwise (seed=%d)', (seed) => {
    const closes = makeCloses(seed, 60);
    const m = macd(closes);
    for (let i = 0; i < closes.length; i++) {
      const mv = m.macd[i];
      const sv = m.signal[i];
      const hv = m.histogram[i];
      if (mv != null && sv != null) {
        expect(hv!).toBeCloseTo(mv - sv, 9);
      }
    }
  });
});

// --- Patch tests (manually-mutated source assertions) -------------------

describe('paper-trade invariants (patch tests)', () => {
  // These tests pin properties that hold for ANY valid buy/sell sequence
  // — exercising what a manual source patch would break.

  it('cash + position cost ≡ initialCash on a single buy (conservation of cash)', () => {
    const p0 = createPaperPortfolio(50_000);
    const p1 = applySignal(p0, 'X', { date: '2026-01-01', action: 'buy', confidence: 1, reason: '', strategy: 't' }, 150);
    const pos = p1.positions['X']!;
    const positionCost = pos.shares * pos.avgCost;
    expect(p1.cash + positionCost).toBeCloseTo(50_000, 9);
  });

  it('avgCost is exactly the weighted mean across multiple buys', () => {
    let p = createPaperPortfolio(1_000_000);
    p = applySignal(p, 'X', { date: '01', action: 'buy', confidence: 1, reason: '', strategy: 't' }, 100); // 1000 sh
    p = applySignal(p, 'X', { date: '02', action: 'buy', confidence: 1, reason: '', strategy: 't' }, 50);  // 1800 sh
    p = applySignal(p, 'X', { date: '03', action: 'buy', confidence: 1, reason: '', strategy: 't' }, 200); // 405 sh
    const pos = p.positions['X']!;
    const expectedTotalCost = p.history.reduce(
      (acc, t) => (t.action === 'buy' ? acc + t.shares * t.price : acc),
      0,
    );
    expect(pos.shares * pos.avgCost).toBeCloseTo(expectedTotalCost, 6);
  });

  it('sell-then-buy roundtrip on different prices: cash delta == shares*(sell-buy)', () => {
    let p0 = createPaperPortfolio(100_000);
    p0 = applySignal(p0, 'X', { date: '01', action: 'buy', confidence: 1, reason: '', strategy: 't' }, 100);
    const beforeSell = p0;
    const sold = applySignal(p0, 'X', { date: '02', action: 'sell', confidence: 1, reason: '', strategy: 't' }, 150);
    const shares = beforeSell.positions['X']!.shares;
    expect(sold.cash - beforeSell.cash).toBeCloseTo(shares * 150, 6);
  });

  it('history is append-only (no in-place mutation of past trades)', () => {
    const p0 = createPaperPortfolio(100_000);
    const p1 = applySignal(p0, 'X', { date: '01', action: 'buy', confidence: 1, reason: 'r1', strategy: 't' }, 100);
    const oldHistory = p1.history;
    const p2 = applySignal(p1, 'X', { date: '02', action: 'sell', confidence: 1, reason: 'r2', strategy: 't' }, 110);
    // Both portfolios coexist; p1's history must not have grown.
    expect(p1.history).toHaveLength(1);
    expect(p2.history).toHaveLength(2);
    // The first entry is the same object (structural equality).
    expect(p2.history[0]).toBe(oldHistory[0]);
  });
});

// --- Strategies ---------------------------------------------------------

function makeCandles(closes: number[]): Candle[] {
  return closes.map((c, i) => ({
    date: `2026-01-${String(i + 1).padStart(2, '0')}`,
    open: c,
    high: c,
    low: c,
    close: c,
    volume: 1000,
  }));
}

describe('SMA_CROSSOVER_STRATEGY', () => {
  it('emits "hold" with insufficient history (< 51 candles)', () => {
    const candles = makeCandles([1, 2, 3]);
    const s = SMA_CROSSOVER_STRATEGY(candles);
    expect(s.action).toBe('hold');
    expect(s.reason).toBe('insufficient history');
    expect(s.strategy).toBe('sma-crossover');
    // holdSignal pulls last.date from the last candle. Pin so the
    // `candles.length - 1` indexing arithmetic mutant dies.
    expect(s.date).toBe(candles[candles.length - 1]!.date);
  });

  it('emits "hold" with empty candles (kills L281 holdSignal `\'\'` fallback)', () => {
    // Exercises the `last ? last.date : ''` empty-array fallback.
    const s = SMA_CROSSOVER_STRATEGY([]);
    expect(s.action).toBe('hold');
    expect(s.date).toBe('');
    expect(s.reason).toBe('insufficient history');
  });

  it('boundary: exactly 51 candles is NOT insufficient (kills `< 51` → `<= 51`)', () => {
    const candles = makeCandles(Array(51).fill(100));
    const s = SMA_CROSSOVER_STRATEGY(candles);
    expect(s.reason).not.toBe('insufficient history');
  });

  it('boundary: exactly 50 candles IS insufficient', () => {
    const candles = makeCandles(Array(50).fill(100));
    const s = SMA_CROSSOVER_STRATEGY(candles);
    expect(s.reason).toBe('insufficient history');
  });

  it('emits "buy" at the bar where SMA20 crosses up through SMA50 (golden cross)', () => {
    // 55 bars of 100 then a sharp rise. The strategy only fires at the
    // crossover bar — scan candle counts to find the first one.
    const all = [...Array(55).fill(100), ...Array(40).fill(200)];
    let found: Signal | null = null;
    for (let n = 56; n <= all.length; n++) {
      const sub = SMA_CROSSOVER_STRATEGY(makeCandles(all.slice(0, n)));
      if (sub.action === 'buy') {
        found = sub;
        break;
      }
    }
    expect(found).not.toBeNull();
    expect(found!.reason).toMatch(/golden cross/);
    expect(found!.confidence).toBeGreaterThan(0);
    expect(found!.strategy).toBe('sma-crossover');
  });

  it('emits "sell" at the bar where SMA20 crosses down through SMA50 (death cross)', () => {
    const all = [...Array(55).fill(200), ...Array(40).fill(100)];
    let found: Signal | null = null;
    for (let n = 56; n <= all.length; n++) {
      const sub = SMA_CROSSOVER_STRATEGY(makeCandles(all.slice(0, n)));
      if (sub.action === 'sell') {
        found = sub;
        break;
      }
    }
    expect(found).not.toBeNull();
    expect(found!.reason).toMatch(/death cross/);
  });

  it('emits "hold" with stable history (no crossover)', () => {
    const closes = Array.from({ length: 80 }, () => 100);
    const s = SMA_CROSSOVER_STRATEGY(makeCandles(closes));
    expect(s.action).toBe('hold');
    expect(s.reason).toBe('no crossover');
  });
});

describe('RSI_MEAN_REVERSION_STRATEGY', () => {
  it('emits "hold" with < 15 candles', () => {
    const s = RSI_MEAN_REVERSION_STRATEGY(makeCandles([1, 2, 3]));
    expect(s.action).toBe('hold');
    expect(s.reason).toBe('insufficient history');
  });

  it('boundary: exactly 15 candles is NOT insufficient (kills `< 15` → `<= 15`)', () => {
    const s = RSI_MEAN_REVERSION_STRATEGY(makeCandles(Array(15).fill(100)));
    expect(s.reason).not.toBe('insufficient history');
  });

  it('emits "buy" when RSI < 30 (oversold) with confidence = (30 - RSI) / 30', () => {
    // Falling series → RSI low (= 0 with monotonic drops)
    const closes = [
      100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100,
      ...Array(20).fill(0).map((_, i) => 100 - i * 5),
    ];
    const s = RSI_MEAN_REVERSION_STRATEGY(makeCandles(closes));
    expect(s.action).toBe('buy');
    expect(s.reason).toMatch(/oversold/);
    // Monotonic-drop RSI → 0; confidence = (30 - 0) / 30 = 1.
    // Pin the confidence formula (kills L303 ArithmeticOperator mutants
    // that would change `(30 - v) / 30` to `(30 - v) * 30`, `(30 + v) / 30`).
    expect(s.confidence).toBe(1);
    // Pin strategy name so const name = 'rsi-mean-reversion' StringLiteral
    // mutant dies.
    expect(s.strategy).toBe('rsi-mean-reversion');
  });

  it('emits "sell" when RSI > 70 (overbought) with confidence = (RSI - 70) / 30', () => {
    const closes = [
      100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100,
      ...Array(20).fill(0).map((_, i) => 100 + i * 5),
    ];
    const s = RSI_MEAN_REVERSION_STRATEGY(makeCandles(closes));
    expect(s.action).toBe('sell');
    expect(s.reason).toMatch(/overbought/);
    // Monotonic rise → RSI 100, confidence = (100 - 70) / 30 = 1.
    expect(s.confidence).toBe(1);
  });

  it('emits "hold" with mixed RSI in neutral band', () => {
    // Alternating ±1 keeps RSI near 50.
    const closes = Array.from({ length: 30 }, (_, i) => 100 + (i % 2 === 0 ? 1 : 0));
    const s = RSI_MEAN_REVERSION_STRATEGY(makeCandles(closes));
    expect(s.action).toBe('hold');
    expect(s.reason).toMatch(/neutral/);
  });
});

describe('MACD_SIGNAL_STRATEGY', () => {
  it('emits "hold" with < 35 candles', () => {
    const s = MACD_SIGNAL_STRATEGY(makeCandles([1, 2, 3]));
    expect(s.action).toBe('hold');
    expect(s.reason).toBe('insufficient history');
  });

  it('boundary: exactly 35 candles is NOT insufficient (kills `< 35` → `<= 35`)', () => {
    const s = MACD_SIGNAL_STRATEGY(makeCandles(Array(35).fill(100)));
    expect(s.reason).not.toBe('insufficient history');
  });

  it('emits "buy" when MACD crosses above signal', () => {
    const closes = [
      ...Array(40).fill(100),
      ...Array(20).fill(0).map((_, i) => 100 + i * 5),
    ];
    const s = MACD_SIGNAL_STRATEGY(makeCandles(closes));
    expect(['buy', 'hold']).toContain(s.action);
    // At some recent bar in this rising tail a buy crossover should fire.
    let found = false;
    for (let n = 41; n <= closes.length; n++) {
      const slice = closes.slice(0, n);
      const sub = MACD_SIGNAL_STRATEGY(makeCandles(slice));
      if (sub.action === 'buy') {
        found = true;
        expect(sub.reason).toMatch(/crossed above signal/);
        break;
      }
    }
    expect(found).toBe(true);
  });

  it('emits "sell" when MACD crosses below signal', () => {
    const closes = [
      ...Array(40).fill(100),
      ...Array(20).fill(0).map((_, i) => 100 - i * 5),
    ];
    let found = false;
    for (let n = 41; n <= closes.length; n++) {
      const slice = closes.slice(0, n);
      const sub = MACD_SIGNAL_STRATEGY(makeCandles(slice));
      if (sub.action === 'sell') {
        found = true;
        expect(sub.reason).toMatch(/crossed below signal/);
        break;
      }
    }
    expect(found).toBe(true);
  });

  it('strategy field is "macd-signal" + reason "no crossover" on quiet history (kills MACD name + no-crossover StringLiteral mutants)', () => {
    const closes = Array.from({ length: 40 }, () => 100);
    const s = MACD_SIGNAL_STRATEGY(makeCandles(closes));
    expect(s.strategy).toBe('macd-signal');
    expect(s.reason).toBe('no crossover');
  });
});

describe('STRATEGIES registry', () => {
  it('contains all three built-in strategies', () => {
    expect(STRATEGIES['sma-crossover']).toBe(SMA_CROSSOVER_STRATEGY);
    expect(STRATEGIES['rsi-mean-reversion']).toBe(RSI_MEAN_REVERSION_STRATEGY);
    expect(STRATEGIES['macd-signal']).toBe(MACD_SIGNAL_STRATEGY);
  });
});

// --- Paper trade engine -------------------------------------------------

describe('createPaperPortfolio', () => {
  it('initializes cash/initialCash/empty positions/history', () => {
    const p = createPaperPortfolio(100_000);
    expect(p.cash).toBe(100_000);
    expect(p.initialCash).toBe(100_000);
    expect(p.positions).toEqual({});
    expect(p.history).toEqual([]);
  });

  it('throws on negative initial cash', () => {
    expect(() => createPaperPortfolio(-1)).toThrow(/non-negative/);
  });

  it('accepts zero initial cash without throwing (kills `< 0` → `<= 0` boundary)', () => {
    const p = createPaperPortfolio(0);
    expect(p.cash).toBe(0);
    expect(p.initialCash).toBe(0);
  });

  it('throws on non-finite initial cash', () => {
    expect(() => createPaperPortfolio(Number.NaN)).toThrow(/finite/);
    expect(() => createPaperPortfolio(Number.POSITIVE_INFINITY)).toThrow(/finite/);
  });
});

function buySignal(date: string): Signal {
  return { date, action: 'buy', confidence: 0.7, reason: 'test-buy', strategy: 't' };
}
function sellSignal(date: string): Signal {
  return { date, action: 'sell', confidence: 0.7, reason: 'test-sell', strategy: 't' };
}
function holdSignal(date: string): Signal {
  return { date, action: 'hold', confidence: 0, reason: 'test-hold', strategy: 't' };
}

describe('applySignal', () => {
  it('buy at 10% sizing creates a position and reduces cash', () => {
    const p0 = createPaperPortfolio(10_000);
    const p1 = applySignal(p0, 'AAPL', buySignal('2026-01-01'), 100);
    // budget = 1000, shares = 10, cost = 1000
    expect(p1.cash).toBe(9_000);
    expect(p1.positions['AAPL']).toEqual({ shares: 10, avgCost: 100 });
    expect(p1.history).toHaveLength(1);
    expect(p1.history[0]).toMatchObject({
      ticker: 'AAPL',
      action: 'buy',
      shares: 10,
      price: 100,
      cashAfter: 9_000,
      reason: 'test-buy',
      date: '2026-01-01',
    });
  });

  it('second buy averages avgCost into the existing position', () => {
    let p = createPaperPortfolio(10_000);
    p = applySignal(p, 'AAPL', buySignal('2026-01-01'), 100); // 10 sh @100
    p = applySignal(p, 'AAPL', buySignal('2026-01-02'), 200); // budget=900, shares=4 @200
    const pos = p.positions['AAPL']!;
    expect(pos.shares).toBe(14);
    // avg = (10*100 + 4*200) / 14 = 1800 / 14
    expect(pos.avgCost).toBeCloseTo(1800 / 14, 9);
  });

  it('sell liquidates the entire position and removes the key', () => {
    let p = createPaperPortfolio(10_000);
    p = applySignal(p, 'AAPL', buySignal('2026-01-01'), 100);
    p = applySignal(p, 'AAPL', sellSignal('2026-01-02'), 150);
    expect(p.positions['AAPL']).toBeUndefined();
    expect(p.cash).toBe(9_000 + 10 * 150);
    expect(p.history).toHaveLength(2);
    expect(p.history[1]!.action).toBe('sell');
    expect(p.history[1]!.shares).toBe(10);
  });

  it('selling one ticker preserves OTHER tickers (kills `{ ...port.positions }` → `{}`)', () => {
    let p = createPaperPortfolio(100_000);
    p = applySignal(p, 'AAPL', buySignal('2026-01-01'), 100);
    p = applySignal(p, 'MSFT', buySignal('2026-01-02'), 200);
    expect(Object.keys(p.positions).sort()).toEqual(['AAPL', 'MSFT']);
    p = applySignal(p, 'AAPL', sellSignal('2026-01-03'), 150);
    // MSFT must remain after selling AAPL.
    expect(p.positions['AAPL']).toBeUndefined();
    expect(p.positions['MSFT']).toBeDefined();
    expect(p.positions['MSFT']!.shares).toBeGreaterThan(0);
  });

  it('sell with no position is a no-op (no history entry)', () => {
    const p = createPaperPortfolio(10_000);
    const out = applySignal(p, 'AAPL', sellSignal('2026-01-01'), 100);
    expect(out).toBe(p); // same reference returned
  });

  it('hold is a no-op (same reference returned)', () => {
    const p = createPaperPortfolio(10_000);
    const out = applySignal(p, 'AAPL', holdSignal('2026-01-01'), 100);
    expect(out).toBe(p);
  });

  it('buy with not-enough cash for one share is a no-op', () => {
    // positionSizePct 0.1 of 5 → budget 0.5 → 0 shares at price 100.
    const p = createPaperPortfolio(5);
    const out = applySignal(p, 'AAPL', buySignal('2026-01-01'), 100);
    expect(out).toBe(p);
    expect(out.cash).toBe(5);
  });

  it('throws on non-positive price', () => {
    const p = createPaperPortfolio(10_000);
    expect(() => applySignal(p, 'AAPL', buySignal('2026-01-01'), 0)).toThrow(/positive finite/);
    expect(() => applySignal(p, 'AAPL', buySignal('2026-01-01'), -1)).toThrow(/positive finite/);
    expect(() => applySignal(p, 'AAPL', buySignal('2026-01-01'), Number.NaN)).toThrow(/positive finite/);
  });

  it('treats the input portfolio as immutable (returns a new object)', () => {
    const p0 = createPaperPortfolio(10_000);
    const p1 = applySignal(p0, 'AAPL', buySignal('2026-01-01'), 100);
    expect(p0.history).toHaveLength(0);
    expect(p0.cash).toBe(10_000);
    expect(p1).not.toBe(p0);
  });
});

describe('portfolioEquity', () => {
  it('returns cash when no positions held', () => {
    expect(portfolioEquity(createPaperPortfolio(5_000), {})).toBe(5_000);
  });

  it('cash + Σ shares · price', () => {
    let p = createPaperPortfolio(10_000);
    p = applySignal(p, 'AAPL', buySignal('2026-01-01'), 100);
    // 10 sh @ 100 + 9000 cash
    expect(portfolioEquity(p, { AAPL: 150 })).toBe(9_000 + 10 * 150);
  });

  it('ignores tickers without a current price', () => {
    let p = createPaperPortfolio(10_000);
    p = applySignal(p, 'AAPL', buySignal('2026-01-01'), 100);
    expect(portfolioEquity(p, {})).toBe(9_000);
  });
});

// --- Backtest -----------------------------------------------------------

describe('backtest', () => {
  it('returns initialCash as finalEquity for stable, holding-only inputs', () => {
    // Constant prices → no crossovers → no trades; equity == cash == initialCash.
    const candles = makeCandles(Array(200).fill(100));
    const res = backtest(candles, SMA_CROSSOVER_STRATEGY, 10_000);
    expect(res.tradeCount).toBe(0);
    expect(res.finalEquity).toBe(10_000);
    expect(res.totalReturnPct).toBe(0);
    expect(res.winRate).toBe(0);
    expect(res.maxDrawdownPct).toBe(0);
    expect(res.trades).toEqual([]);
  });

  it('records buy then forced take-profit at +15% above avg cost with reason="take-profit"', () => {
    // Build a series with a golden cross then a sharp climb (>15%) so
    // take-profit fires.
    const closes = [
      ...Array(55).fill(100),
      ...Array(40).fill(200), // crosses → buy at 200; +15% above 200 = 230 (never)
      ...Array(20).fill(0).map((_, i) => 200 + i * 5), // climbs through 230
    ];
    const res = backtest(makeCandles(closes), SMA_CROSSOVER_STRATEGY, 10_000);
    const sells = res.trades.filter((t) => t.action === 'sell');
    const buys = res.trades.filter((t) => t.action === 'buy');
    expect(buys.length).toBeGreaterThan(0);
    expect(sells.length).toBeGreaterThan(0);
    // The forced exit pairs as a win for the first buy.
    expect(res.winRate).toBeGreaterThan(0);
    // Pin the synthetic sell signal's fields (kills ObjectLiteral and
    // StringLiteral mutants on the take-profit signal literal).
    const tpSell = sells.find((s) => s.reason === 'take-profit');
    expect(tpSell).toBeDefined();
    expect(tpSell!.action).toBe('sell');
    expect(tpSell!.shares).toBeGreaterThan(0);
  });

  it('triggers stop-loss when price drops > 5% below avgCost with reason="stop-loss"', () => {
    // Crash after buy.
    const closes = [
      ...Array(55).fill(100),
      ...Array(20).fill(200), // golden-cross buy near 200
      ...Array(20).fill(150), // -25% → stop-loss
    ];
    const res = backtest(makeCandles(closes), SMA_CROSSOVER_STRATEGY, 10_000);
    const sells = res.trades.filter((t) => t.action === 'sell');
    expect(sells.length).toBeGreaterThan(0);
    // Maximum drawdown registered.
    expect(res.maxDrawdownPct).toBeGreaterThan(0);
    // Pin the synthetic sell signal's reason.
    const slSell = sells.find((s) => s.reason === 'stop-loss');
    expect(slSell).toBeDefined();
    expect(slSell!.action).toBe('sell');
  });

  it('does NOT trigger stop-loss for a 2.5% drop (kills dropPct `/` → `*` arithmetic mutant)', () => {
    // After golden-cross buy at 200, price drops only 2.5% to 195.
    // Original: dropPct = (200-195)/200 = 0.025 < 0.05 → no stop-loss.
    // Mutated `*`: dropPct = (200-195)*200 = 1000 → fires stop-loss.
    const closes = [
      ...Array(55).fill(100),
      ...Array(20).fill(200), // golden cross → buy near 200
      ...Array(20).fill(195), // -2.5% — below threshold
    ];
    const res = backtest(makeCandles(closes), SMA_CROSSOVER_STRATEGY, 10_000);
    const slSells = res.trades.filter((t) => t.reason === 'stop-loss');
    expect(slSells).toHaveLength(0);
  });

  it('winRate === 1 when the only completed pair is a winning take-profit', () => {
    // Pins: wins/completed formula, wins + losses sum.
    const closes = [
      ...Array(55).fill(100),
      ...Array(20).fill(200),
      ...Array(20).fill(0).map((_, i) => 200 + i * 5), // rises through +15%
    ];
    const res = backtest(makeCandles(closes), SMA_CROSSOVER_STRATEGY, 10_000);
    const tpSells = res.trades.filter((t) => t.reason === 'take-profit');
    expect(tpSells.length).toBeGreaterThan(0);
    expect(res.winRate).toBe(1);
  });

  it('winRate === 0 when the only completed pair is a stop-loss loss', () => {
    const closes = [
      ...Array(55).fill(100),
      ...Array(20).fill(200),
      ...Array(20).fill(150), // -25% → stop-loss losing trade
    ];
    const res = backtest(makeCandles(closes), SMA_CROSSOVER_STRATEGY, 10_000);
    const slSells = res.trades.filter((t) => t.reason === 'stop-loss');
    expect(slSells.length).toBeGreaterThan(0);
    expect(res.winRate).toBe(0);
  });

  it('does NOT trigger take-profit for a 5% gain (kills gainPct `/` → `*` arithmetic mutant)', () => {
    // After golden-cross buy at 200, price rises 5% to 210 — below
    // takeProfitPct = 0.15. Original: 0.05 < 0.15 → no take-profit.
    // Mutated `*`: (210-200)*200 = 2000 → fires take-profit.
    const closes = [
      ...Array(55).fill(100),
      ...Array(20).fill(200),
      ...Array(20).fill(210), // +5% — below 15% threshold
    ];
    const res = backtest(makeCandles(closes), SMA_CROSSOVER_STRATEGY, 10_000);
    const tpSells = res.trades.filter((t) => t.reason === 'take-profit');
    expect(tpSells).toHaveLength(0);
  });

  it('stop-loss boundary uses `>= 5%` (kills `> 5%` boundary)', () => {
    // Construct a series that drops EXACTLY 5% below buy avgCost on a
    // single bar. With `>= stopLossPct` it fires; with `>` it does not.
    // For SMA crossover the buy fires near 200 (after 55 bars at 100,
    // then bars at 200). Drop to 190 = 5% below → boundary.
    const closes = [
      ...Array(55).fill(100),
      ...Array(20).fill(200),
      ...Array(5).fill(190), // exactly -5%
    ];
    const res = backtest(makeCandles(closes), SMA_CROSSOVER_STRATEGY, 10_000);
    const slSell = res.trades.find((t) => t.reason === 'stop-loss');
    expect(slSell).toBeDefined();
  });

  it('totalReturnPct = (finalEquity - initialCash) / initialCash * 100', () => {
    const candles = makeCandles(Array(200).fill(100));
    const res = backtest(candles, SMA_CROSSOVER_STRATEGY, 5_000);
    expect(res.totalReturnPct).toBe(((res.finalEquity - 5_000) / 5_000) * 100);
  });

  it('finalEquity reflects last bar price (kills L578 `length-1` → `+1` and L579 ObjectLiteral `{}`)', () => {
    // Backtest where price doubles AFTER the strategy's last trade
    // → finalEquity should include the position's mark-to-market at
    // the LAST bar. With `+1` indexing or empty prices object the
    // finalEquity falls back to cash only.
    const closes = [
      ...Array(55).fill(100),
      ...Array(20).fill(200), // golden cross → buy at 200
      ...Array(40).fill(210), // small +5% (below take-profit)
    ];
    const res = backtest(makeCandles(closes), SMA_CROSSOVER_STRATEGY, 10_000);
    // No take-profit fired (5% < 15%), so position remains at end.
    const slSells = res.trades.filter((t) => t.reason === 'stop-loss' || t.reason === 'take-profit');
    expect(slSells).toHaveLength(0);
    // finalEquity must include the held position's value at last price.
    // Without the mark-to-market, finalEquity would equal cash only,
    // which is < initialCash (we spent some on the buy).
    expect(res.finalEquity).toBeGreaterThan(10_000 - 1); // not lossy
  });

  it('default ticker is "BACKTEST" when called without ticker arg (kills L506 StringLiteral)', () => {
    const closes = [
      ...Array(55).fill(100),
      ...Array(20).fill(200),
      ...Array(20).fill(0).map((_, i) => 200 + i * 5),
    ];
    const res = backtest(makeCandles(closes), SMA_CROSSOVER_STRATEGY, 10_000);
    // Trades should have ticker === 'BACKTEST' (the default).
    expect(res.trades.length).toBeGreaterThan(0);
    for (const t of res.trades) {
      expect(t.ticker).toBe('BACKTEST');
    }
  });

  it('winRate fraction is wins / completed for mixed wins+losses (kills L613 `/` → `*`)', () => {
    // Engineer a backtest where the strategy emits one winning trade
    // (take-profit) AND one losing trade (stop-loss). 1 win + 1 loss →
    // winRate = 1 / 2 = 0.5. Mutated `*`: 1 * 2 = 2.
    const closes = [
      ...Array(55).fill(100),
      ...Array(20).fill(200), // golden cross → buy at 200 (BUY #1)
      ...Array(20).fill(0).map((_, i) => 200 + i * 5), // → take-profit (WIN)
      ...Array(20).fill(100), // death cross
      ...Array(20).fill(200), // golden cross → buy at 200 (BUY #2)
      ...Array(20).fill(150), // → stop-loss (LOSS)
    ];
    const res = backtest(makeCandles(closes), SMA_CROSSOVER_STRATEGY, 10_000);
    // Look for at least one TP and one SL.
    const tps = res.trades.filter((t) => t.reason === 'take-profit');
    const sls = res.trades.filter((t) => t.reason === 'stop-loss');
    if (tps.length >= 1 && sls.length >= 1) {
      expect(res.winRate).toBeGreaterThan(0);
      expect(res.winRate).toBeLessThan(1);
    }
  });

  it('totalReturnPct sign + magnitude with a known winning backtest (kills L520 arithmetic mutants)', () => {
    // Take-profit-driven win: buy at 200, take-profit at 230 (+15%).
    const closes = [
      ...Array(55).fill(100),
      ...Array(40).fill(200),
      ...Array(20).fill(0).map((_, i) => 200 + i * 5),
    ];
    const res = backtest(makeCandles(closes), SMA_CROSSOVER_STRATEGY, 10_000);
    // finalEquity should be > initialCash (we won) and the formula
    // result strictly > 0. Mutating `* 100` → `/ 100` would shrink it
    // 10_000×, mutating `- initialCash` → `+ initialCash` would
    // explode it positive far beyond reality. Mutating `/ initialCash`
    // → `* initialCash` would similarly explode.
    expect(res.finalEquity).toBeGreaterThan(10_000);
    expect(res.totalReturnPct).toBeGreaterThan(0);
    expect(res.totalReturnPct).toBeLessThan(100); // sanity (won't double)
    expect(res.totalReturnPct).toBeCloseTo(
      ((res.finalEquity - 10_000) / 10_000) * 100,
      9,
    );
  });
});

// --- Mock data source ---------------------------------------------------

describe('createMockStocksDataSource', () => {
  it('produces deterministic AAPL day-0 close (kills mock arithmetic mutants)', async () => {
    const src = createMockStocksDataSource();
    const candles = await src.fetchHistory('AAPL', 1);
    // Reference computed offline: noise('A'.charCodeAt * 1000 = 65000) ≈ 0.9063;
    // driftRand = (0.9063 - 0.5) * 0.04 ≈ 0.01625;
    // close = 195 * (1 + 0.0006 + 0.01625) ≈ 198.286 → rounded 198.29.
    expect(candles[0]!.close).toBe(198.29);
    expect(candles[0]!.date).toBe('2025-12-01');
  });

  it('exports the documented 5 mock tickers with non-empty symbol/label/basePrice', () => {
    // Pin StringLiteral mutants on each MOCK_TICKERS entry.
    const symbols = MOCK_TICKERS.map((t) => t.symbol);
    expect(symbols).toEqual(['7203.T', '9984.T', '6758.T', 'AAPL', 'MSFT']);
    for (const t of MOCK_TICKERS) {
      expect(t.label.length).toBeGreaterThan(0);
      expect(t.basePrice).toBeGreaterThan(0);
      expect(t.driftDaily).toBeGreaterThan(0);
    }
  });

  it('returns the requested number of bars', async () => {
    const src = createMockStocksDataSource();
    const candles = await src.fetchHistory('7203.T', 30);
    expect(candles).toHaveLength(30);
  });

  it('uses the base price 100 + 0.0005 drift for unknown symbols', async () => {
    const src = createMockStocksDataSource();
    const candles = await src.fetchHistory('UNKNOWN', 2);
    // Day 0: prev=100. noise('U'.charCodeAt=85 → 85000) seeds drift.
    expect(candles).toHaveLength(2);
    // Each candle's date should advance by 1 day.
    expect(candles[1]!.date).toBe('2025-12-02');
    // Close must be a finite positive number around the 100 base price
    // (kills L687 ObjectLiteral mutant `{}` which would leave basePrice
    // undefined → NaN closes).
    expect(candles[0]!.close).toBeGreaterThan(50);
    expect(candles[0]!.close).toBeLessThan(150);
    expect(Number.isFinite(candles[0]!.close)).toBe(true);
  });

  it('OHLC invariants: low ≤ open/close ≤ high; volume > 0', async () => {
    const src = createMockStocksDataSource();
    const candles = await src.fetchHistory('AAPL', HISTORY_LENGTH);
    for (const c of candles) {
      expect(c.low).toBeLessThanOrEqual(c.open);
      expect(c.low).toBeLessThanOrEqual(c.close);
      expect(c.high).toBeGreaterThanOrEqual(c.open);
      expect(c.high).toBeGreaterThanOrEqual(c.close);
      expect(c.volume).toBeGreaterThan(0);
    }
  });
});

// --- Snapshot -----------------------------------------------------------

describe('fetchStocksSnapshot', () => {
  // Empty-state shortcut so snapshot tests don't depend on the real
  // ~/.local/business-hub/state.json file.
  const emptyStateDeps = { loadState: async () => ({ watchlist: [] as readonly string[] }) };

  it('produces a watchlist of the 5 mock tickers + a paper portfolio', async () => {
    const snap = await fetchStocksSnapshotImpl({ token: '' }, emptyStateDeps);
    expect(snap.watchlist).toHaveLength(MOCK_TICKERS.length);
    expect(snap.watchlist).toHaveLength(5);
    expect(snap.isMock).toBe(true);
    expect(snap.fetchedAt).toBe('2026-05-14T00:00:00.000Z');
    expect(snap.portfolio.initialCash).toBe(1_000_000);
  });

  it('every watchlist row carries label/latestClose/changePct/signal/candles', async () => {
    const snap = await fetchStocksSnapshotImpl({ token: '' }, emptyStateDeps);
    for (const row of snap.watchlist) {
      expect(row.label).toBeTruthy();
      expect(row.latestClose).toBeGreaterThan(0);
      expect(row.previousClose).toBeGreaterThan(0);
      expect(typeof row.changePct).toBe('number');
      expect(row.signal.strategy).toBe('sma-crossover');
      expect(row.candles).toHaveLength(HISTORY_LENGTH);
    }
  });

  it('isMock is exactly true (kills `true` → `false` mutant)', async () => {
    const snap = await fetchStocksSnapshotImpl({ token: '' }, emptyStateDeps);
    expect(snap.isMock).toBe(true);
  });

  it('changePct = (last - prev) / prev * 100 exactly (kills L637 arithmetic mutants)', async () => {
    const snap = await fetchStocksSnapshotImpl({ token: '' }, emptyStateDeps);
    for (const row of snap.watchlist) {
      const expected = ((row.latestClose - row.previousClose) / row.previousClose) * 100;
      expect(row.changePct).toBeCloseTo(expected, 9);
    }
  });
});

// --- isSafeSymbol -------------------------------------------------------

describe('isSafeSymbol', () => {
  it('accepts JP TSE tickers (7203.T)', () => {
    expect(isSafeSymbol('7203.T')).toBe(true);
  });
  it('accepts US tickers (AAPL)', () => {
    expect(isSafeSymbol('AAPL')).toBe(true);
  });
  it('accepts index symbols with caret (^N225)', () => {
    expect(isSafeSymbol('^N225')).toBe(true);
  });
  it('accepts symbols with dashes (BRK-B)', () => {
    expect(isSafeSymbol('BRK-B')).toBe(true);
  });
  it('rejects empty and too-long strings', () => {
    expect(isSafeSymbol('')).toBe(false);
    expect(isSafeSymbol('A'.repeat(17))).toBe(false);
  });
  it('accepts a 16-char boundary (kills `> 16` → `>= 16` mutation)', () => {
    expect(isSafeSymbol('A'.repeat(16))).toBe(true);
  });
  it('rejects whitespace and shell metachars', () => {
    expect(isSafeSymbol('AA PL')).toBe(false);
    expect(isSafeSymbol('AAPL;rm')).toBe(false);
    expect(isSafeSymbol('AAPL|cat')).toBe(false);
    expect(isSafeSymbol('AAPL/etc')).toBe(false);
    expect(isSafeSymbol('AAPL\\etc')).toBe(false);
    expect(isSafeSymbol('AAPL\0')).toBe(false);
  });
  it('rejects non-string types', () => {
    expect(isSafeSymbol(null)).toBe(false);
    expect(isSafeSymbol(undefined)).toBe(false);
    expect(isSafeSymbol(42)).toBe(false);
    expect(isSafeSymbol({})).toBe(false);
  });
});

// --- Actions ------------------------------------------------------------

describe('registerTickerImpl', () => {
  // Pure-state tests with injected memory store — no real file I/O.
  function memoryDeps() {
    let store: string | null = null;
    return {
      deps: {
        statePath: () => '/tmp/test.json',
        readFile: async () => {
          if (store === null) throw new Error('ENOENT');
          return store;
        },
        writeFile: async (_p: string, c: string) => {
          store = c;
        },
        mkdir: async () => {},
        rename: async () => {},
      },
      getStore: () => store,
    };
  }

  it('persists the upper-cased symbol on first registration', async () => {
    const { deps, getStore } = memoryDeps();
    const r = await registerTickerImpl({ token: '', payload: { symbol: 'aapl' } }, deps);
    expect(r.symbol).toBe('AAPL');
    expect(r.added).toBe(true);
    expect(r.watchlist).toEqual(['AAPL']);
    expect(r.message).toContain('AAPL added to watchlist');
    // Stored on disk too.
    expect(getStore()).not.toBeNull();
    expect(JSON.parse(getStore()!).watchlist).toEqual(['AAPL']);
  });

  it('is idempotent — adding a duplicate returns added:false', async () => {
    const { deps } = memoryDeps();
    await registerTickerImpl({ token: '', payload: { symbol: 'AAPL' } }, deps);
    const r2 = await registerTickerImpl({ token: '', payload: { symbol: 'aapl' } }, deps);
    expect(r2.added).toBe(false);
    expect(r2.watchlist).toEqual(['AAPL']);
    expect(r2.message).toContain('already in watchlist');
  });

  it('appends to an existing watchlist', async () => {
    const { deps } = memoryDeps();
    await registerTickerImpl({ token: '', payload: { symbol: 'AAPL' } }, deps);
    const r = await registerTickerImpl({ token: '', payload: { symbol: 'MSFT' } }, deps);
    expect(r.watchlist).toEqual(['AAPL', 'MSFT']);
    expect(r.added).toBe(true);
  });

  it('uppercases a mixed-case symbol', async () => {
    const { deps } = memoryDeps();
    const r = await registerTickerImpl({ token: '', payload: { symbol: 'BrK-B' } }, deps);
    expect(r.symbol).toBe('BRK-B');
    expect(r.watchlist).toEqual(['BRK-B']);
    expect(r.message).toContain('BRK-B');
    expect(r.message).not.toContain('BrK-B');
  });

  it('rejects unsafe symbols before any I/O', async () => {
    let touched = false;
    const deps: StateDeps = {
      statePath: () => '/tmp/never.json',
      readFile: async () => { touched = true; return ''; },
      writeFile: async () => { touched = true; },
    };
    await expect(
      registerTickerImpl({ token: '', payload: { symbol: 'AAPL;rm' } }, deps),
    ).rejects.toThrow(/1-16 chars/);
    expect(touched).toBe(false);
  });

  it('rejects missing symbol', async () => {
    await expect(
      registerTickerImpl({ token: '', payload: {} }, { writeFile: async () => {} }),
    ).rejects.toThrow(/1-16 chars/);
  });

  it('is registered as the register-ticker action', () => {
    expect(typeof ACTIONS['register-ticker']).toBe('function');
  });
});

describe('ACTIONS["backtest"]', () => {
  it('runs the SMA crossover backtest on AAPL mock data', async () => {
    const r = (await ACTIONS['backtest']!({
      token: '',
      payload: { symbol: 'AAPL', strategy: 'sma-crossover', initialCash: 100_000 },
    })) as { finalEquity: number; totalReturnPct: number; tradeCount: number };
    expect(r.finalEquity).toBeGreaterThan(0);
    expect(typeof r.totalReturnPct).toBe('number');
    expect(r.tradeCount).toBeGreaterThanOrEqual(0);
  });

  it('rejects unknown strategy', async () => {
    await expect(
      ACTIONS['backtest']!({
        token: '',
        payload: { symbol: 'AAPL', strategy: 'gut-feeling', initialCash: 100_000 },
      }),
    ).rejects.toThrow(/unknown strategy/);
  });

  it('rejects unsafe symbol', async () => {
    await expect(
      ACTIONS['backtest']!({
        token: '',
        payload: { symbol: 'AAPL;rm', strategy: 'sma-crossover', initialCash: 100_000 },
      }),
    ).rejects.toThrow(/1-16 chars/);
  });

  it('rejects non-positive initialCash', async () => {
    for (const v of [0, -100, Number.NaN, Number.POSITIVE_INFINITY]) {
      await expect(
        ACTIONS['backtest']!({
          token: '',
          payload: { symbol: 'AAPL', strategy: 'sma-crossover', initialCash: v },
        }),
      ).rejects.toThrow(/positive finite/);
    }
  });

  it('rejects non-number initialCash', async () => {
    await expect(
      ACTIONS['backtest']!({
        token: '',
        payload: { symbol: 'AAPL', strategy: 'sma-crossover', initialCash: 'lots' },
      }),
    ).rejects.toThrow(/positive finite/);
  });
});

// --- Risk params --------------------------------------------------------

describe('DEFAULT_RISK_PARAMS', () => {
  it('exposes the documented 10/5/15 defaults', () => {
    expect(DEFAULT_RISK_PARAMS.positionSizePct).toBe(0.1);
    expect(DEFAULT_RISK_PARAMS.stopLossPct).toBe(0.05);
    expect(DEFAULT_RISK_PARAMS.takeProfitPct).toBe(0.15);
  });
});

// --- buildTickerAnalysis ------------------------------------------------

describe('buildTickerAnalysis', () => {
  it('produces all indicator fields from a 120-bar history', async () => {
    const src = createMockStocksDataSource();
    const candles = await src.fetchHistory('AAPL', HISTORY_LENGTH);
    const ta = buildTickerAnalysis('AAPL', 'Apple', candles);
    expect(ta.symbol).toBe('AAPL');
    expect(ta.label).toBe('Apple');
    expect(ta.latestClose).toBeGreaterThan(0);
    expect(typeof ta.changePct).toBe('number');
    expect(ta.sma20).not.toBeNull();
    expect(ta.sma50).not.toBeNull();
    expect(ta.rsi14).not.toBeNull();
    expect(ta.macd.line).not.toBeNull();
    expect(ta.macd.signal).not.toBeNull();
    expect(ta.macd.histogram).not.toBeNull();
    expect(ta.bollinger.upper).not.toBeNull();
    expect(['buy', 'sell', 'hold']).toContain(ta.smaCrossover);
    expect(['oversold', 'neutral', 'overbought']).toContain(ta.rsiSignal);
  });

  it('returns 0 latestClose and 0 changePct on empty input (defensive)', () => {
    const ta = buildTickerAnalysis('X', 'X', []);
    expect(ta.latestClose).toBe(0);
    expect(ta.changePct).toBe(0);
    expect(ta.sma20).toBeNull();
    expect(ta.rsi14).toBeNull();
  });

  it('rsiSignal is "oversold" for a monotonically falling series', () => {
    const closes = Array.from({ length: 50 }, (_, i) => 100 - i * 2);
    const candles: Candle[] = closes.map((c, i) => ({
      date: `2026-01-${String(i + 1).padStart(2, '0')}`,
      open: c,
      high: c,
      low: c,
      close: c,
      volume: 1,
    }));
    const ta = buildTickerAnalysis('X', 'X', candles);
    expect(ta.rsiSignal).toBe('oversold');
  });

  it('rsiSignal is "overbought" for a monotonically rising series', () => {
    const closes = Array.from({ length: 50 }, (_, i) => 100 + i * 2);
    const candles: Candle[] = closes.map((c, i) => ({
      date: `2026-01-${String(i + 1).padStart(2, '0')}`,
      open: c,
      high: c,
      low: c,
      close: c,
      volume: 1,
    }));
    const ta = buildTickerAnalysis('X', 'X', candles);
    expect(ta.rsiSignal).toBe('overbought');
  });
});

// --- validateAdvisorJson -----------------------------------------------

describe('validateAdvisorJson', () => {
  const allowed = new Set(['AAPL', 'MSFT', '7203.T']);

  function goodRec(over: Partial<{ symbol: string; rank: number; rationale: string; riskFactors: string[] }> = {}): unknown {
    return {
      symbol: 'AAPL',
      rank: 1,
      rationale: 'Sample rationale citing SMA and RSI signals.',
      riskFactors: ['市場全体の下落リスク', '個別決算リスク'],
      ...over,
    };
  }

  it('accepts a well-formed response within the allowed universe', () => {
    const out = validateAdvisorJson({ recommendations: [goodRec()] }, allowed);
    expect(out).toHaveLength(1);
    expect(out[0]!.symbol).toBe('AAPL');
    expect(out[0]!.rank).toBe(1);
    expect(out[0]!.riskFactors).toHaveLength(2);
  });

  it('rejects null / non-object root', () => {
    expect(() => validateAdvisorJson(null, allowed)).toThrow(/not an object/);
    expect(() => validateAdvisorJson('hello', allowed)).toThrow(/not an object/);
    expect(() => validateAdvisorJson(42, allowed)).toThrow(/not an object/);
  });

  it('rejects missing recommendations array', () => {
    expect(() => validateAdvisorJson({}, allowed)).toThrow(/missing recommendations/);
    expect(() => validateAdvisorJson({ recommendations: 'oops' }, allowed)).toThrow(/missing recommendations/);
  });

  it('rejects empty recommendations array', () => {
    expect(() => validateAdvisorJson({ recommendations: [] }, allowed)).toThrow(/zero recommendations/);
  });

  it('rejects more than 5 recommendations (kills `> 5` boundary on length cap)', () => {
    const six = Array.from({ length: 6 }, () => goodRec());
    expect(() => validateAdvisorJson({ recommendations: six }, allowed)).toThrow(/exceeds 5/);
  });

  it('accepts exactly 5 recommendations (boundary)', () => {
    const five = Array.from({ length: 5 }, (_, i) => goodRec({ rank: i + 1 }));
    const out = validateAdvisorJson({ recommendations: five }, allowed);
    expect(out).toHaveLength(5);
  });

  it('rejects out-of-universe symbol (anti-hallucination guard)', () => {
    expect(() =>
      validateAdvisorJson({ recommendations: [goodRec({ symbol: 'FAKE' })] }, allowed),
    ).toThrow(/out-of-universe/);
  });

  it('rejects non-string symbol', () => {
    expect(() =>
      validateAdvisorJson({ recommendations: [{ ...(goodRec() as object), symbol: 42 }] }, allowed),
    ).toThrow(/invalid or out-of-universe/);
  });

  it('rejects non-finite or sub-1 rank', () => {
    expect(() =>
      validateAdvisorJson({ recommendations: [goodRec({ rank: 0 })] }, allowed),
    ).toThrow(/invalid rank/);
    expect(() =>
      validateAdvisorJson({ recommendations: [goodRec({ rank: Number.NaN })] }, allowed),
    ).toThrow(/invalid rank/);
    expect(() =>
      validateAdvisorJson(
        { recommendations: [{ ...(goodRec() as object), rank: 'one' }] },
        allowed,
      ),
    ).toThrow(/invalid rank/);
  });

  it('rejects empty / oversized rationale', () => {
    expect(() =>
      validateAdvisorJson({ recommendations: [goodRec({ rationale: '' })] }, allowed),
    ).toThrow(/empty rationale/);
    expect(() =>
      validateAdvisorJson({ recommendations: [goodRec({ rationale: 'x'.repeat(401) })] }, allowed),
    ).toThrow(/exceeds 400/);
  });

  it('rejects empty or non-array riskFactors', () => {
    expect(() =>
      validateAdvisorJson({ recommendations: [goodRec({ riskFactors: [] })] }, allowed),
    ).toThrow(/no riskFactors/);
    expect(() =>
      validateAdvisorJson(
        { recommendations: [{ ...(goodRec() as object), riskFactors: 'oops' }] },
        allowed,
      ),
    ).toThrow(/no riskFactors/);
  });

  it('rejects riskFactor that is not a 1-200 char string', () => {
    expect(() =>
      validateAdvisorJson(
        { recommendations: [goodRec({ riskFactors: [''] })] },
        allowed,
      ),
    ).toThrow(/riskFactor entry/);
    expect(() =>
      validateAdvisorJson(
        { recommendations: [goodRec({ riskFactors: ['x'.repeat(201)] })] },
        allowed,
      ),
    ).toThrow(/riskFactor entry/);
    expect(() =>
      validateAdvisorJson(
        { recommendations: [{ ...(goodRec() as object), riskFactors: [42] }] },
        allowed,
      ),
    ).toThrow(/riskFactor entry/);
  });

  it('rejects null entry inside recommendations array', () => {
    expect(() =>
      validateAdvisorJson({ recommendations: [null] }, allowed),
    ).toThrow(/entry is not an object/);
  });
});

// --- ACTIONS["advise"] (AI orchestration) -------------------------------

function anthropicMock(text: string, init: ResponseInit = { status: 200 }) {
  return new Response(
    JSON.stringify({
      content: [{ type: 'text', text }],
      stop_reason: 'end_turn',
    }),
    { ...init, headers: { 'content-type': 'application/json', ...(init.headers ?? {}) } },
  );
}

describe('ACTIONS["advise"]', () => {
  const goodJson = JSON.stringify({
    recommendations: [
      {
        symbol: 'AAPL',
        rank: 1,
        rationale: 'SMA20 が SMA50 を上抜けて golden cross が成立。RSI も中立圏で勢いに余地。',
        riskFactors: ['市場全体のリスク', '次回決算リスク'],
      },
      {
        symbol: 'MSFT',
        rank: 2,
        rationale: 'MACD ヒストグラムが拡大しトレンド継続。RSI は 60 付近で過熱なし。',
        riskFactors: ['金利上昇リスク'],
      },
    ],
  });

  it('returns a structured AdvisorResponse with the disclaimer attached', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValueOnce(anthropicMock(goodJson));
    const res = (await ACTIONS['advise']!({
      token: 'sk-ant-x',
      fetch: fetchMock,
      payload: { question: '長期保有に向いている銘柄は?' },
    })) as { recommendations: { symbol: string }[]; disclaimer: string; notForRealMoney: boolean };
    expect(res.recommendations).toHaveLength(2);
    expect(res.recommendations[0]!.symbol).toBe('AAPL');
    expect(res.disclaimer).toBe(ADVISOR_DISCLAIMER);
    expect(res.notForRealMoney).toBe(true);
  });

  it('posts to api.anthropic.com/v1/messages with x-api-key + system prompt + technical data', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValueOnce(anthropicMock(goodJson));
    await ACTIONS['advise']!({
      token: 'sk-ant-xxxxx',
      fetch: fetchMock,
      payload: { question: 'グロース株を 3 つ' },
    });
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('https://api.anthropic.com/v1/messages');
    const headers = (init as RequestInit).headers as Record<string, string>;
    expect(headers['x-api-key']).toBe('sk-ant-xxxxx');
    expect(headers['anthropic-version']).toBe('2023-06-01');
    const body = JSON.parse((init as RequestInit).body as string);
    // System prompt restricts the universe to the 5 default tickers.
    expect(body.system).toContain('7203.T');
    expect(body.system).toContain('AAPL');
    expect(body.system).toContain('MSFT');
    // User prompt embeds the technical-analysis JSON.
    expect(body.messages[0].content).toContain('テクニカル分析データ');
    expect(body.messages[0].content).toContain('グロース株を 3 つ');
  });

  it('rejects an out-of-universe ticker the LLM tries to invent (hallucination guard)', async () => {
    const bad = JSON.stringify({
      recommendations: [
        {
          symbol: 'TSLA', // not in universe
          rank: 1,
          rationale: 'looks attractive',
          riskFactors: ['risk'],
        },
      ],
    });
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValueOnce(anthropicMock(bad));
    await expect(
      ACTIONS['advise']!({
        token: 'sk-ant-x',
        fetch: fetchMock,
        payload: { question: 'おすすめ' },
      }),
    ).rejects.toThrow(/out-of-universe/);
  });

  it('rejects malformed (non-JSON) LLM output', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValueOnce(
      anthropicMock("hi, here's my pick: AAPL"),
    );
    await expect(
      ACTIONS['advise']!({
        token: 'sk-ant-x',
        fetch: fetchMock,
        payload: { question: 'おすすめ' },
      }),
    ).rejects.toThrow(/not valid JSON/);
  });

  it('rejects empty / oversized / control-char questions', async () => {
    const fetchMock = vi.fn<typeof fetch>();
    await expect(
      ACTIONS['advise']!({ token: 't', fetch: fetchMock, payload: { question: '' } }),
    ).rejects.toThrow(/required/);
    await expect(
      ACTIONS['advise']!({ token: 't', fetch: fetchMock, payload: { question: 'x'.repeat(1001) } }),
    ).rejects.toThrow(/exceeds 1000/);
    await expect(
      ACTIONS['advise']!({ token: 't', fetch: fetchMock, payload: { question: 'hi\nworld' } }),
    ).rejects.toThrow(/control characters/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects custom universe entries that fail isSafeSymbol', async () => {
    const fetchMock = vi.fn<typeof fetch>();
    await expect(
      ACTIONS['advise']!({
        token: 't',
        fetch: fetchMock,
        payload: { question: 'q', universe: ['AAPL', 'EVIL;rm -rf'] },
      }),
    ).rejects.toThrow(/unsafe symbol/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects empty custom universe', async () => {
    const fetchMock = vi.fn<typeof fetch>();
    await expect(
      ACTIONS['advise']!({
        token: 't',
        fetch: fetchMock,
        payload: { question: 'q', universe: [] },
      }),
    ).rejects.toThrow(/universe is empty/);
  });

  it('rejects oversized custom universe (>25)', async () => {
    const fetchMock = vi.fn<typeof fetch>();
    await expect(
      ACTIONS['advise']!({
        token: 't',
        fetch: fetchMock,
        payload: {
          question: 'q',
          universe: Array.from({ length: 26 }, (_, i) => 'TIC' + i),
        },
      }),
    ).rejects.toThrow(/exceeds 25/);
  });

  it('propagates HTTP errors from the Anthropic API', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response('rate limited', { status: 429 }));
    await expect(
      ACTIONS['advise']!({
        token: 'sk-ant-x',
        fetch: fetchMock,
        payload: { question: 'q' },
      }),
    ).rejects.toThrow(/stocks-advisor 429/);
  });

  it('rejects when content is missing text', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValueOnce(
      new Response(JSON.stringify({ content: [] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
    await expect(
      ACTIONS['advise']!({
        token: 'sk-ant-x',
        fetch: fetchMock,
        payload: { question: 'q' },
      }),
    ).rejects.toThrow(/no text content/);
  });

  it('honors a custom model + maxTokens override', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValueOnce(anthropicMock(goodJson));
    await ACTIONS['advise']!({
      token: 'sk-ant-x',
      fetch: fetchMock,
      payload: { question: 'q', model: 'claude-opus-4-7', maxTokens: 512 },
    });
    const body = JSON.parse((fetchMock.mock.calls[0]![1] as RequestInit).body as string);
    expect(body.model).toBe('claude-opus-4-7');
    expect(body.max_tokens).toBe(512);
  });

  it('defaults to claude-sonnet-4-6 + 1024 max_tokens', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValueOnce(anthropicMock(goodJson));
    await ACTIONS['advise']!({
      token: 'sk-ant-x',
      fetch: fetchMock,
      payload: { question: 'q' },
    });
    const body = JSON.parse((fetchMock.mock.calls[0]![1] as RequestInit).body as string);
    expect(body.model).toBe('claude-sonnet-4-6');
    expect(body.max_tokens).toBe(1024);
  });

  it('accepts a custom universe and embeds those symbols in the prompt', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValueOnce(anthropicMock(goodJson));
    await ACTIONS['advise']!({
      token: 'sk-ant-x',
      fetch: fetchMock,
      payload: { question: 'q', universe: ['AAPL', 'MSFT'] },
    });
    const body = JSON.parse((fetchMock.mock.calls[0]![1] as RequestInit).body as string);
    expect(body.system).toContain('AAPL');
    expect(body.system).toContain('MSFT');
    // Other defaults must NOT leak in when caller supplies an explicit universe.
    expect(body.system).not.toContain('7203.T');
  });
});

describe('ADVISOR_DISCLAIMER', () => {
  it('contains the educational-purpose + non-advice declaration', () => {
    expect(ADVISOR_DISCLAIMER).toMatch(/教育目的/);
    expect(ADVISOR_DISCLAIMER).toMatch(/投資助言ではありません/);
    expect(ADVISOR_DISCLAIMER).toMatch(/過去パフォーマンス.*保証/);
    expect(ADVISOR_DISCLAIMER).toMatch(/ご自身の責任/);
  });
});

// --- Advisor system prompt content -------------------------------------

describe('advisor system prompt content (kills StringLiteral mutants on each line)', () => {
  // Send a happy-path advise() call and capture the system prompt that
  // was sent to Anthropic. Then assert every required phrase exists.
  it('embeds all safety/structure clauses in the system prompt', async () => {
    const goodJson = JSON.stringify({
      recommendations: [
        {
          symbol: 'AAPL',
          rank: 1,
          rationale: 'A valid rationale citing tech signals for the response.',
          riskFactors: ['市場リスク'],
        },
      ],
    });
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          content: [{ type: 'text', text: goodJson }],
          stop_reason: 'end_turn',
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    );
    await ACTIONS['advise']!({
      token: 'sk-ant-x',
      fetch: fetchMock,
      payload: { question: 'q?' },
    });
    const body = JSON.parse((fetchMock.mock.calls[0]![1] as RequestInit).body as string);
    const sys: string = body.system;
    // Every line of the prompt carries observable safety information.
    expect(sys).toContain('株式分析アシスタント');
    expect(sys).toContain('ユーザーの質問');
    expect(sys).toContain('最大 5 件');
    expect(sys).toContain('厳守事項');
    expect(sys).toContain('JSON スキーマ');
    expect(sys).toContain('"recommendations"');
    expect(sys).toContain('"symbol"');
    expect(sys).toContain('"rank"');
    expect(sys).toContain('"rationale"');
    expect(sys).toContain('"riskFactors"');
    expect(sys).toContain('許可済みリスト');
    expect(sys).toContain('実在しないティッカー');
    expect(sys).toContain('今買え');
    expect(sys).toContain('riskFactors (1-3 件)');
    expect(sys).toContain('40-160 文字');
    expect(sys).toContain('過去パフォーマンスは将来を保証しない');
    expect(sys).toContain('\n'); // multi-line join('\n')
  });
});

// --- buildTickerAnalysis edge cases ------------------------------------

describe('buildTickerAnalysis edge cases', () => {
  it('changePct === 0 when there is exactly 1 candle (prev is undefined)', () => {
    const candles: Candle[] = [
      { date: '2026-01-01', open: 1, high: 1, low: 1, close: 100, volume: 1 },
    ];
    const ta = buildTickerAnalysis('X', 'X', candles);
    expect(ta.latestClose).toBe(100);
    expect(ta.changePct).toBe(0);
  });

  it('changePct === 0 when prev.close is 0 (avoid divide-by-zero)', () => {
    const candles: Candle[] = [
      { date: '2026-01-01', open: 0, high: 0, low: 0, close: 0, volume: 1 },
      { date: '2026-01-02', open: 0, high: 0, low: 0, close: 100, volume: 1 },
    ];
    const ta = buildTickerAnalysis('X', 'X', candles);
    expect(ta.latestClose).toBe(100);
    expect(ta.changePct).toBe(0);
  });

  it('rsiSignal === "neutral" when rsi value is undefined (short history)', () => {
    const candles: Candle[] = [
      { date: '2026-01-01', open: 1, high: 1, low: 1, close: 100, volume: 1 },
    ];
    const ta = buildTickerAnalysis('X', 'X', candles);
    expect(ta.rsiSignal).toBe('neutral');
  });

  it('rsiSignal === "neutral" when rsi is between 30 and 70 (mid range)', () => {
    // Build a slowly-alternating series so RSI lands in the neutral band.
    const closes: number[] = [];
    for (let i = 0; i < 30; i++) closes.push(100 + (i % 2 === 0 ? 1 : -0.5));
    const candles: Candle[] = closes.map((c, i) => ({
      date: `2026-01-${String(i + 1).padStart(2, '0')}`,
      open: c,
      high: c,
      low: c,
      close: c,
      volume: 1,
    }));
    const ta = buildTickerAnalysis('X', 'X', candles);
    expect(ta.rsiSignal).toBe('neutral');
  });
});

// --- advisor: label resolution + numeric boundaries --------------------

describe('advisor edge cases', () => {
  function jsonRes(text: string) {
    return new Response(
      JSON.stringify({ content: [{ type: 'text', text }], stop_reason: 'end_turn' }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    );
  }
  const ok = () =>
    jsonRes(
      JSON.stringify({
        recommendations: [
          {
            symbol: 'AAPL',
            rank: 1,
            rationale: 'A valid rationale string.',
            riskFactors: ['risk'],
          },
        ],
      }),
    );

  it('uses MOCK_TICKERS label (not symbol) when symbol is a known mock ticker', async () => {
    // Embeds analyses JSON into the user message; the AAPL analysis
    // should carry label "Apple" not "AAPL".
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValueOnce(ok());
    await ACTIONS['advise']!({
      token: 'sk-ant-x',
      fetch: fetchMock,
      payload: { question: 'q?' },
    });
    const body = JSON.parse((fetchMock.mock.calls[0]![1] as RequestInit).body as string);
    const userMsg = body.messages[0].content as string;
    expect(userMsg).toContain('"label":"Apple"');
    expect(userMsg).toContain('"label":"トヨタ自動車"');
  });

  it('uses raw symbol as label when caller-supplied universe is outside MOCK_TICKERS', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValueOnce(
      jsonRes(
        JSON.stringify({
          recommendations: [
            { symbol: 'NVDA', rank: 1, rationale: 'rationale here', riskFactors: ['r'] },
          ],
        }),
      ),
    );
    await ACTIONS['advise']!({
      token: 'sk-ant-x',
      fetch: fetchMock,
      payload: { question: 'q?', universe: ['NVDA'] },
    });
    const body = JSON.parse((fetchMock.mock.calls[0]![1] as RequestInit).body as string);
    expect(body.messages[0].content).toContain('"label":"NVDA"');
  });

  it('boundary: question exactly 1000 chars is accepted (kills `> 1000` → `>= 1000`)', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValueOnce(ok());
    const q = 'q'.repeat(1000);
    await expect(
      ACTIONS['advise']!({ token: 't', fetch: fetchMock, payload: { question: q } }),
    ).resolves.toBeDefined();
  });

  it('boundary: universe of exactly 25 symbols accepted', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValueOnce(
      jsonRes(
        JSON.stringify({
          recommendations: [
            { symbol: 'TIC0', rank: 1, rationale: 'rationale here', riskFactors: ['r'] },
          ],
        }),
      ),
    );
    const universe = Array.from({ length: 25 }, (_, i) => 'TIC' + i);
    await expect(
      ACTIONS['advise']!({
        token: 'sk-ant-x',
        fetch: fetchMock,
        payload: { question: 'q', universe },
      }),
    ).resolves.toBeDefined();
  });

  it('non-string model arg is ignored, defaults to claude-sonnet-4-6', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValueOnce(ok());
    await ACTIONS['advise']!({
      token: 't',
      fetch: fetchMock,
      payload: { question: 'q', model: 42 as unknown as string },
    });
    const body = JSON.parse((fetchMock.mock.calls[0]![1] as RequestInit).body as string);
    expect(body.model).toBe('claude-sonnet-4-6');
  });

  it('empty-string model is ignored, defaults to claude-sonnet-4-6', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValueOnce(ok());
    await ACTIONS['advise']!({
      token: 't',
      fetch: fetchMock,
      payload: { question: 'q', model: '' },
    });
    const body = JSON.parse((fetchMock.mock.calls[0]![1] as RequestInit).body as string);
    expect(body.model).toBe('claude-sonnet-4-6');
  });

  it('non-finite maxTokens is ignored, defaults to 1024', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValueOnce(ok());
    await ACTIONS['advise']!({
      token: 't',
      fetch: fetchMock,
      payload: { question: 'q', maxTokens: Number.POSITIVE_INFINITY },
    });
    const body = JSON.parse((fetchMock.mock.calls[0]![1] as RequestInit).body as string);
    expect(body.max_tokens).toBe(1024);
  });

  it('non-positive maxTokens (0 or negative) is ignored, defaults to 1024', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValueOnce(ok());
    await ACTIONS['advise']!({
      token: 't',
      fetch: fetchMock,
      payload: { question: 'q', maxTokens: 0 },
    });
    const body = JSON.parse((fetchMock.mock.calls[0]![1] as RequestInit).body as string);
    expect(body.max_tokens).toBe(1024);
  });

  it('content-type header is application/json (kills MethodExpression body→headers mutant)', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValueOnce(ok());
    await ACTIONS['advise']!({
      token: 't',
      fetch: fetchMock,
      payload: { question: 'q' },
    });
    const init = fetchMock.mock.calls[0]![1] as RequestInit;
    const headers = init.headers as Record<string, string>;
    expect(headers['content-type']).toBe('application/json');
    // POST method pinned (kills the method assignment mutants).
    expect(init.method).toBe('POST');
  });

  it('messages array has exactly one user-role entry', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValueOnce(ok());
    await ACTIONS['advise']!({
      token: 't',
      fetch: fetchMock,
      payload: { question: 'q' },
    });
    const body = JSON.parse((fetchMock.mock.calls[0]![1] as RequestInit).body as string);
    expect(body.messages).toHaveLength(1);
    expect(body.messages[0].role).toBe('user');
  });

  it('analyses payload starts empty (kills `analyses: TickerAnalysis[] = []` → `[Stryker...]`)', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValueOnce(ok());
    await ACTIONS['advise']!({
      token: 't',
      fetch: fetchMock,
      payload: { question: 'q' },
    });
    const body = JSON.parse((fetchMock.mock.calls[0]![1] as RequestInit).body as string);
    const userMsg = body.messages[0].content as string;
    // The serialized analyses array must NOT contain the Stryker marker.
    expect(userMsg).not.toContain('Stryker was here');
    // And it must contain exactly the 5 default symbols.
    for (const t of MOCK_TICKERS) {
      expect(userMsg).toContain('"symbol":"' + t.symbol + '"');
    }
  });

  it('truncates a 300-char Anthropic error body to 200 chars (kills L1135 `.slice(0, 200)` → `body`)', async () => {
    const longErr = 'E'.repeat(300);
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValueOnce(
      new Response(longErr, { status: 500 }),
    );
    const err = await ACTIONS['advise']!({
      token: 't',
      fetch: fetchMock,
      payload: { question: 'q' },
    }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(Error);
    expect((err as Error).message).toMatch(/^stocks-advisor 500:/);
    // 200 E chars max in the message tail; not 300.
    expect((err as Error).message).toMatch(/E{200}$/);
    expect((err as Error).message).not.toContain('E'.repeat(201));
  });

  it('boundary: rationale exactly 400 chars accepted', () => {
    const allowed = new Set(['AAPL']);
    const out = validateAdvisorJson(
      {
        recommendations: [
          {
            symbol: 'AAPL',
            rank: 1,
            rationale: 'x'.repeat(400),
            riskFactors: ['r'],
          },
        ],
      },
      allowed,
    );
    expect(out[0]!.rationale).toHaveLength(400);
  });

  it('boundary: riskFactor exactly 200 chars accepted', () => {
    const allowed = new Set(['AAPL']);
    const out = validateAdvisorJson(
      {
        recommendations: [
          {
            symbol: 'AAPL',
            rank: 1,
            rationale: 'rationale',
            riskFactors: ['r'.repeat(200)],
          },
        ],
      },
      allowed,
    );
    expect(out[0]!.riskFactors[0]).toHaveLength(200);
  });
});

// --- escapeHtml ----------------------------------------------------------

describe('escapeHtml', () => {
  it('escapes &, <, >, ", \'', () => {
    expect(escapeHtml('<script>')).toBe('&lt;script&gt;');
    expect(escapeHtml('a & b')).toBe('a &amp; b');
    expect(escapeHtml('"x"')).toBe('&quot;x&quot;');
    expect(escapeHtml("it's")).toBe('it&#39;s');
  });

  it('escapes & FIRST so &lt; cannot decode back to <', () => {
    // If `<` was escaped before `&`, the result would be `&amp;lt;`
    // which renders as `&lt;` literally instead of `<`.
    expect(escapeHtml('&lt;')).toBe('&amp;lt;');
  });

  it('leaves safe text untouched', () => {
    expect(escapeHtml('hello world')).toBe('hello world');
    expect(escapeHtml('')).toBe('');
  });

  it('handles a XSS-style attempt (kills any drop in the escape chain)', () => {
    const out = escapeHtml('<img src=x onerror="alert(1)">');
    expect(out).not.toContain('<');
    expect(out).not.toContain('>');
    expect(out).not.toContain('"');
    expect(out).toContain('&lt;');
    expect(out).toContain('&gt;');
    expect(out).toContain('&quot;');
  });
});

// --- renderDashboardHtml -------------------------------------------------

function emptySnapshot(): StocksSnapshot {
  return {
    watchlist: [],
    portfolio: { cash: 1_000_000, initialCash: 1_000_000, positions: {}, history: [] },
    fetchedAt: '2026-05-14T00:00:00.000Z',
    isMock: true,
  };
}

describe('renderDashboardHtml', () => {
  it('generates a complete HTML document with doctype + lang ja', () => {
    const html = renderDashboardHtml({
      snapshot: emptySnapshot(),
      generatedAt: '2026-05-14T12:00:00.000Z',
    });
    expect(html).toMatch(/^<!doctype html>/i);
    expect(html).toContain('<html lang="ja">');
    expect(html).toContain('<meta charset="utf-8">');
    expect(html).toContain('Service Hub — Stocks ダッシュボード');
    expect(html).toMatch(/<\/html>\s*$/);
  });

  it('embeds the safety banner with simulation-mode disclaimer', () => {
    const html = renderDashboardHtml({
      snapshot: emptySnapshot(),
      generatedAt: '2026-05-14T12:00:00.000Z',
    });
    expect(html).toContain('シミュレーション中');
    expect(html).toContain('実弾発注は行いません');
    expect(html).toContain('Phase 7');
    expect(html).toContain('教育目的');
    expect(html).toContain('投資助言ではありません');
    expect(html).toContain('過去パフォーマンス');
  });

  it('renders paper portfolio tiles with formatted values', () => {
    const html = renderDashboardHtml({
      snapshot: emptySnapshot(),
      generatedAt: '2026-05-14T12:00:00.000Z',
    });
    expect(html).toContain('ペーパー口座');
    expect(html).toContain('現在資産');
    expect(html).toContain('現金残高');
    expect(html).toContain('損益');
    expect(html).toContain('初期入金');
    expect(html).toContain('取引履歴');
    expect(html).toContain('1,000,000');
  });

  it('shows P&L green when positive (kills color-flip mutant)', () => {
    const snap: StocksSnapshot = {
      ...emptySnapshot(),
      watchlist: [
        {
          symbol: 'X',
          label: 'X Corp',
          latestClose: 200,
          previousClose: 100,
          changePct: 100,
          signal: { date: '01', action: 'buy', confidence: 0.7, reason: 'r', strategy: 't' },
          candles: [
            { date: '01', open: 100, high: 100, low: 100, close: 100, volume: 1 },
            { date: '02', open: 200, high: 200, low: 200, close: 200, volume: 1 },
          ],
        },
      ],
      portfolio: {
        cash: 900_000,
        initialCash: 1_000_000,
        positions: { X: { shares: 500, avgCost: 200 } },
        history: [],
      },
    };
    const html = renderDashboardHtml({ snapshot: snap, generatedAt: '01' });
    // equity = 900_000 + 500 * 200 = 1_000_000; pnl = 0 → green branch.
    // Force a winning state: cash 1_000_500, position 500 sh @ 200 →
    // total 1_100_500, pnl = +100_500.
    const win: StocksSnapshot = {
      ...snap,
      portfolio: { ...snap.portfolio, cash: 1_000_500 },
    };
    const winHtml = renderDashboardHtml({ snapshot: win, generatedAt: '01' });
    expect(winHtml).toContain('#22c55e'); // green
    // Negative case: cash 100, equity 100_100, pnl -899_900.
    const loss: StocksSnapshot = {
      ...snap,
      portfolio: { ...snap.portfolio, cash: 100 },
    };
    const lossHtml = renderDashboardHtml({ snapshot: loss, generatedAt: '01' });
    expect(lossHtml).toContain('#ef4444'); // red
    // Just make sure they differ
    expect(winHtml).not.toBe(lossHtml);
  });

  it('escapes attacker-controlled fields (ticker label / signal reason)', () => {
    const snap: StocksSnapshot = {
      ...emptySnapshot(),
      watchlist: [
        {
          symbol: 'X',
          label: '<script>alert(1)</script>',
          latestClose: 100,
          previousClose: 100,
          changePct: 0,
          signal: { date: '01', action: 'hold', confidence: 0, reason: 'evil"&<>', strategy: 's' },
          candles: [],
        },
      ],
    };
    const html = renderDashboardHtml({ snapshot: snap, generatedAt: '01' });
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('&lt;script&gt;');
    expect(html).toContain('&quot;&amp;&lt;&gt;');
  });

  it('embeds advisor section when advisorResult is provided', () => {
    const advisor: AdvisorResponse = {
      recommendations: [
        {
          symbol: 'AAPL',
          rank: 1,
          rationale: 'A reason for choosing AAPL based on indicators.',
          riskFactors: ['市場リスク', '為替リスク'],
        },
      ],
      disclaimer: ADVISOR_DISCLAIMER,
      notForRealMoney: true,
    };
    const html = renderDashboardHtml({
      snapshot: emptySnapshot(),
      advisorResult: advisor,
      generatedAt: '01',
    });
    expect(html).toContain('AI アドバイザー結果');
    expect(html).toContain('AAPL');
    expect(html).toContain('A reason for choosing AAPL');
    expect(html).toContain('市場リスク');
    expect(html).toContain('為替リスク');
    expect(html).toContain(ADVISOR_DISCLAIMER);
  });

  it('skips advisor section when advisorResult is undefined', () => {
    const html = renderDashboardHtml({
      snapshot: emptySnapshot(),
      generatedAt: '01',
    });
    expect(html).not.toContain('AI アドバイザー結果');
  });

  it('skips trade history section when history is empty', () => {
    const html = renderDashboardHtml({
      snapshot: emptySnapshot(),
      generatedAt: '01',
    });
    expect(html).not.toContain('最近の取引');
  });

  it('embeds trade history when present', () => {
    const snap: StocksSnapshot = {
      ...emptySnapshot(),
      portfolio: {
        cash: 1_000_000,
        initialCash: 1_000_000,
        positions: {},
        history: [
          {
            date: '2026-01-01',
            ticker: 'AAPL',
            action: 'buy',
            shares: 10,
            price: 195,
            cashAfter: 998_050,
            reason: 'test buy',
          },
        ],
      },
    };
    const html = renderDashboardHtml({ snapshot: snap, generatedAt: '01' });
    expect(html).toContain('最近の取引');
    expect(html).toContain('AAPL');
    expect(html).toContain('test buy');
  });

  it('shows latest top-bar timestamp escaped', () => {
    const html = renderDashboardHtml({
      snapshot: emptySnapshot(),
      generatedAt: '2026-05-14T12:00:00.000Z',
    });
    expect(html).toContain('生成日時');
    expect(html).toContain('2026-05-14T12:00:00.000Z');
  });
});

// --- defaultDashboardPath -----------------------------------------------

describe('defaultDashboardPath', () => {
  it('lands under home/.local/business-hub/data', () => {
    const p = defaultDashboardPath();
    expect(p.startsWith(os.homedir())).toBe(true);
    expect(p).toContain('.local');
    expect(p).toContain('business-hub');
    expect(p).toContain('data');
    expect(p.endsWith('dashboard.html')).toBe(true);
  });
});

// --- isSafeDashboardPath ------------------------------------------------

describe('isSafeDashboardPath', () => {
  const home = '/home/user';

  it('accepts a .html under the home dir', () => {
    expect(isSafeDashboardPath('/home/user/dashboard.html', home)).toBe(true);
    expect(isSafeDashboardPath('/home/user/.local/business-hub/data/dashboard.html', home)).toBe(true);
  });

  it('rejects paths outside the home dir', () => {
    expect(isSafeDashboardPath('/etc/passwd.html', home)).toBe(false);
    expect(isSafeDashboardPath('/tmp/dashboard.html', home)).toBe(false);
  });

  it('rejects non-html paths', () => {
    expect(isSafeDashboardPath('/home/user/dashboard.txt', home)).toBe(false);
    expect(isSafeDashboardPath('/home/user/dashboard', home)).toBe(false);
    expect(isSafeDashboardPath('/home/user/.bashrc', home)).toBe(false);
  });

  it('rejects empty / oversize / control-char paths', () => {
    expect(isSafeDashboardPath('', home)).toBe(false);
    expect(isSafeDashboardPath('/home/user/' + 'x'.repeat(1100) + '.html', home)).toBe(false);
    expect(isSafeDashboardPath('/home/user/dash\nboard.html', home)).toBe(false);
    expect(isSafeDashboardPath('/home/user/dash\0board.html', home)).toBe(false);
  });

  it('rejects non-string types', () => {
    expect(isSafeDashboardPath(null as unknown as string, home)).toBe(false);
    expect(isSafeDashboardPath(undefined as unknown as string, home)).toBe(false);
    expect(isSafeDashboardPath(42 as unknown as string, home)).toBe(false);
  });

  it('rejects path-traversal `..` attempts that resolve outside home', () => {
    // `/home/user/../etc/passwd.html` resolves to `/home/etc/passwd.html`
    expect(isSafeDashboardPath('/home/user/../etc/passwd.html', home)).toBe(false);
  });
});

// --- exportDashboardImpl ------------------------------------------------

describe('exportDashboardImpl', () => {
  function mockSnapshot(): StocksSnapshot {
    return emptySnapshot();
  }

  it('writes the rendered HTML to the default path and returns size + path', async () => {
    const writes: Array<{ path: string; content: string }> = [];
    const r = await exportDashboardImpl(
      { token: '', payload: {} },
      {
        fetchSnapshot: async () => mockSnapshot(),
        writeFile: async (p, c) => {
          writes.push({ path: p, content: c });
        },
        now: () => new Date('2026-05-14T12:00:00.000Z'),
      },
    );
    expect(r.path).toBe(defaultDashboardPath());
    expect(r.bytes).toBeGreaterThan(0);
    expect(r.generatedAt).toBe('2026-05-14T12:00:00.000Z');
    expect(writes).toHaveLength(1);
    expect(writes[0]!.content).toContain('<!doctype html>');
    expect(writes[0]!.content).toContain('2026-05-14T12:00:00.000Z');
  });

  it('honors a custom safe path', async () => {
    const customPath = path.join(os.homedir(), 'my-dashboard.html');
    let received = '';
    const r = await exportDashboardImpl(
      { token: '', payload: { path: customPath } },
      {
        fetchSnapshot: async () => mockSnapshot(),
        writeFile: async (p) => {
          received = p;
        },
      },
    );
    expect(r.path).toBe(customPath);
    expect(received).toBe(customPath);
  });

  it('rejects an unsafe path outside the home directory', async () => {
    await expect(
      exportDashboardImpl(
        { token: '', payload: { path: '/etc/passwd.html' } },
        { fetchSnapshot: async () => mockSnapshot(), writeFile: async () => {} },
      ),
    ).rejects.toThrow(/under the user home directory/);
  });

  it('rejects a non-.html path', async () => {
    await expect(
      exportDashboardImpl(
        { token: '', payload: { path: path.join(os.homedir(), 'dash.txt') } },
        { fetchSnapshot: async () => mockSnapshot(), writeFile: async () => {} },
      ),
    ).rejects.toThrow(/under the user home directory/);
  });

  it('embeds advisor result when payload.advisorResult is a valid AdvisorResponse', async () => {
    const advisor: AdvisorResponse = {
      recommendations: [
        {
          symbol: 'AAPL',
          rank: 1,
          rationale: 'A reason cited in HTML.',
          riskFactors: ['市場リスク'],
        },
      ],
      disclaimer: ADVISOR_DISCLAIMER,
      notForRealMoney: true,
    };
    let captured = '';
    await exportDashboardImpl(
      { token: '', payload: { advisorResult: advisor } },
      {
        fetchSnapshot: async () => mockSnapshot(),
        writeFile: async (_p, c) => {
          captured = c;
        },
      },
    );
    expect(captured).toContain('AI アドバイザー結果');
    expect(captured).toContain('AAPL');
    expect(captured).toContain('A reason cited in HTML');
  });

  it('ignores malformed advisor payloads (anti-injection)', async () => {
    const badAdvisor = {
      recommendations: 'not-an-array',
      disclaimer: 'x',
      notForRealMoney: false, // wrong type
    };
    let captured = '';
    await exportDashboardImpl(
      { token: '', payload: { advisorResult: badAdvisor } },
      {
        fetchSnapshot: async () => mockSnapshot(),
        writeFile: async (_p, c) => {
          captured = c;
        },
      },
    );
    // Section must NOT be present when the advisor result fails validation.
    expect(captured).not.toContain('AI アドバイザー結果');
  });

  it('non-string custom path falls back to the default', async () => {
    let writtenPath = '';
    const r = await exportDashboardImpl(
      { token: '', payload: { path: 42 as unknown as string } },
      {
        fetchSnapshot: async () => mockSnapshot(),
        writeFile: async (p) => {
          writtenPath = p;
        },
      },
    );
    expect(r.path).toBe(defaultDashboardPath());
    expect(writtenPath).toBe(defaultDashboardPath());
  });

  it('empty-string custom path falls back to the default', async () => {
    const r = await exportDashboardImpl(
      { token: '', payload: { path: '' } },
      {
        fetchSnapshot: async () => mockSnapshot(),
        writeFile: async () => {},
      },
    );
    expect(r.path).toBe(defaultDashboardPath());
  });
});

// --- ACTIONS["export-dashboard"] real-fs integration --------------------

describe('ACTIONS["export-dashboard"]', () => {
  it('is registered as an action on the stocks service', () => {
    expect(typeof ACTIONS['export-dashboard']).toBe('function');
  });
});

// --- compareStrategiesImpl + ACTIONS["compare-strategies"] -------------

import { compareStrategiesImpl, type StrategyComparisonResult } from '../stocks';

describe('compareStrategiesImpl', () => {
  it('returns one row per built-in strategy with all metrics', async () => {
    const r = (await compareStrategiesImpl(
      { token: '', payload: { symbol: 'AAPL', initialCash: 100_000 } },
    )) as StrategyComparisonResult;
    expect(r.symbol).toBe('AAPL');
    expect(r.initialCash).toBe(100_000);
    expect(r.rows).toHaveLength(3);
    const names = r.rows.map((x) => x.strategy);
    expect(names).toEqual(['sma-crossover', 'rsi-mean-reversion', 'macd-signal']);
    for (const row of r.rows) {
      expect(row.finalEquity).toBeGreaterThan(0);
      expect(typeof row.totalReturnPct).toBe('number');
      expect(typeof row.maxDrawdownPct).toBe('number');
      expect(row.winRate).toBeGreaterThanOrEqual(0);
      expect(row.winRate).toBeLessThanOrEqual(1);
      expect(row.tradeCount).toBeGreaterThanOrEqual(0);
    }
  });

  it('bestByReturn names a winning strategy whose return equals the max', async () => {
    // Use an injected fetcher with a clearly winning trajectory so the
    // SMA crossover strategy goes positive and the others don't trade
    // (constant flat → no signals).
    const closes = [
      ...Array(55).fill(100),
      ...Array(20).fill(200), // golden cross → buy
      ...Array(20).fill(0).map((_, i) => 200 + i * 5), // take-profit
    ];
    const candles: Candle[] = closes.map((c, i) => ({
      date: `2026-01-${String(i + 1).padStart(2, '0')}`,
      open: c,
      high: c,
      low: c,
      close: c,
      volume: 1,
    }));
    const r = await compareStrategiesImpl(
      { token: '', payload: { symbol: 'X', initialCash: 10_000 } },
      { fetchHistory: async () => candles },
    );
    expect(r.bestByReturn).not.toBeNull();
    expect(['sma-crossover', 'rsi-mean-reversion', 'macd-signal']).toContain(r.bestByReturn);
    const best = r.rows.find((x) => x.strategy === r.bestByReturn)!;
    const maxReturn = Math.max(...r.rows.map((x) => x.totalReturnPct));
    expect(best.totalReturnPct).toBe(maxReturn);
    expect(best.totalReturnPct).toBeGreaterThan(0);
  });

  it('bestByReturn is null when all strategies return 0 (flat market)', async () => {
    const closes = Array(120).fill(100);
    const candles: Candle[] = closes.map((c, i) => ({
      date: `2026-01-${String(i + 1).padStart(2, '0')}`,
      open: c,
      high: c,
      low: c,
      close: c,
      volume: 1,
    }));
    const r = await compareStrategiesImpl(
      { token: '', payload: { symbol: 'X', initialCash: 10_000 } },
      { fetchHistory: async () => candles },
    );
    expect(r.bestByReturn).toBeNull();
  });

  it('rejects unsafe symbol', async () => {
    await expect(
      compareStrategiesImpl({ token: '', payload: { symbol: 'BAD;rm', initialCash: 10_000 } }),
    ).rejects.toThrow(/1-16 chars/);
  });

  it('rejects non-positive / non-finite / non-number initialCash', async () => {
    for (const v of [0, -1, Number.NaN, Number.POSITIVE_INFINITY, 'lots' as unknown as number]) {
      await expect(
        compareStrategiesImpl({
          token: '',
          payload: { symbol: 'AAPL', initialCash: v },
        }),
      ).rejects.toThrow(/positive finite/);
    }
  });

  it('is registered as an action', () => {
    expect(typeof ACTIONS['compare-strategies']).toBe('function');
  });

  it('uses the default mock data source when deps.fetchHistory is omitted (production path)', async () => {
    const r = (await ACTIONS['compare-strategies']!({
      token: '',
      payload: { symbol: 'AAPL', initialCash: 10_000 },
    })) as StrategyComparisonResult;
    expect(r.rows).toHaveLength(3);
  });
});

// --- renderDashboardHtml strategyComparison section --------------------

describe('renderDashboardHtml strategyComparison', () => {
  function comp(rows: StrategyComparisonResult['rows'], best: string | null): StrategyComparisonResult {
    return { symbol: 'AAPL', initialCash: 100_000, rows, bestByReturn: best };
  }
  const sampleRows: StrategyComparisonResult['rows'] = [
    { strategy: 'sma-crossover', finalEquity: 115_000, totalReturnPct: 15, maxDrawdownPct: 5, winRate: 1, tradeCount: 2 },
    { strategy: 'rsi-mean-reversion', finalEquity: 100_000, totalReturnPct: 0, maxDrawdownPct: 0, winRate: 0, tradeCount: 0 },
    { strategy: 'macd-signal', finalEquity: 95_000, totalReturnPct: -5, maxDrawdownPct: 8, winRate: 0, tradeCount: 1 },
  ];

  it('renders the 戦略比較 table when strategyComparison is provided', () => {
    const html = renderDashboardHtml({
      snapshot: emptySnapshot(),
      strategyComparison: comp(sampleRows, 'sma-crossover'),
      generatedAt: '01',
    });
    expect(html).toContain('戦略比較');
    expect(html).toContain('AAPL');
    expect(html).toContain('sma-crossover');
    expect(html).toContain('rsi-mean-reversion');
    expect(html).toContain('macd-signal');
    expect(html).toContain('+15.00%');
    expect(html).toContain('-5.00%');
    expect(html).toContain('最良'); // best label
  });

  it('omits the section when strategyComparison is undefined', () => {
    const html = renderDashboardHtml({
      snapshot: emptySnapshot(),
      generatedAt: '01',
    });
    expect(html).not.toContain('戦略比較');
    expect(html).not.toContain('最良');
  });

  it('omits 最良 highlight when bestByReturn is null', () => {
    const html = renderDashboardHtml({
      snapshot: emptySnapshot(),
      strategyComparison: comp(sampleRows.map((r) => ({ ...r, totalReturnPct: 0 })), null),
      generatedAt: '01',
    });
    expect(html).toContain('戦略比較');
    expect(html).not.toContain('最良');
  });

  it('escapes the symbol in the section header (anti-XSS)', () => {
    const html = renderDashboardHtml({
      snapshot: emptySnapshot(),
      strategyComparison: { ...comp(sampleRows, null), symbol: '<scr>' },
      generatedAt: '01',
    });
    expect(html).not.toContain('<scr>');
    expect(html).toContain('&lt;scr&gt;');
  });
});

// --- exportDashboardImpl with strategyComparison passthrough -----------

describe('exportDashboardImpl strategyComparison passthrough', () => {
  it('embeds the strategy comparison when payload is well-formed', async () => {
    let html = '';
    await exportDashboardImpl(
      {
        token: '',
        payload: {
          strategyComparison: {
            symbol: 'AAPL',
            initialCash: 100_000,
            rows: [
              { strategy: 'sma-crossover', finalEquity: 115_000, totalReturnPct: 15, maxDrawdownPct: 5, winRate: 1, tradeCount: 2 },
            ],
            bestByReturn: 'sma-crossover',
          },
        },
      },
      {
        fetchSnapshot: async () => emptySnapshot(),
        writeFile: async (_p, c) => {
          html = c;
        },
      },
    );
    expect(html).toContain('戦略比較');
    expect(html).toContain('sma-crossover');
  });

  it('drops a malformed strategyComparison payload silently', async () => {
    let html = '';
    await exportDashboardImpl(
      { token: '', payload: { strategyComparison: { symbol: 42 } } },
      {
        fetchSnapshot: async () => emptySnapshot(),
        writeFile: async (_p, c) => {
          html = c;
        },
      },
    );
    expect(html).not.toContain('戦略比較');
  });
});

// --- BacktestResult.equityCurve --------------------------------------

describe('backtest equityCurve', () => {
  it('has length === candles.length − 50 (one entry per loop iteration)', () => {
    const candles = makeCandles(Array(120).fill(100));
    const res = backtest(candles, SMA_CROSSOVER_STRATEGY, 10_000);
    expect(res.equityCurve).toHaveLength(120 - 50);
  });

  it('starts at initialCash for a flat market with no trades', () => {
    const candles = makeCandles(Array(80).fill(100));
    const res = backtest(candles, SMA_CROSSOVER_STRATEGY, 10_000);
    expect(res.tradeCount).toBe(0);
    for (const eq of res.equityCurve) {
      expect(eq).toBe(10_000);
    }
  });

  it('equityCurve last value matches finalEquity (when no trades open)', () => {
    const candles = makeCandles(Array(80).fill(100));
    const res = backtest(candles, SMA_CROSSOVER_STRATEGY, 10_000);
    expect(res.equityCurve[res.equityCurve.length - 1]).toBe(res.finalEquity);
  });

  it('shows post-buy mark-to-market growth in the equity curve', () => {
    const closes = [
      ...Array(55).fill(100),
      ...Array(20).fill(200), // buy near 200
      ...Array(20).fill(210), // +5% mark-to-market
    ];
    const res = backtest(makeCandles(closes), SMA_CROSSOVER_STRATEGY, 10_000);
    // After the buy fires and the position holds at +5%, the equity at
    // the LAST bar should reflect the held position's value.
    expect(res.equityCurve[res.equityCurve.length - 1]).toBeGreaterThan(10_000 - 1);
  });
});

// --- renderDashboardMarkdown ----------------------------------------

import { renderDashboardMarkdown, defaultDashboardMdPath, isSafeDashboardMdPath, exportDashboardMdImpl } from '../stocks';

describe('renderDashboardMarkdown', () => {
  it('emits the canonical headings + disclaimer paragraph', () => {
    const md = renderDashboardMarkdown({
      snapshot: emptySnapshot(),
      generatedAt: '2026-05-14T12:00:00.000Z',
    });
    expect(md).toContain('# Service Hub — Stocks ダッシュボード');
    expect(md).toContain('生成日時: 2026-05-14T12:00:00.000Z');
    expect(md).toContain('## ペーパー口座');
    expect(md).toContain('## ウォッチリスト (0 銘柄)');
    expect(md).toContain('シミュレーション中');
    expect(md).toContain('実弾発注は行いません');
    expect(md).toContain('Phase 7');
    expect(md).toContain('教育目的');
    expect(md).toContain('投資助言ではありません');
    expect(md).toContain('過去パフォーマンス');
    expect(md).toContain('Generated by Service Hub');
  });

  it('renders watchlist as a table when populated', () => {
    const snap: StocksSnapshot = {
      ...emptySnapshot(),
      watchlist: [
        {
          symbol: 'AAPL',
          label: 'Apple',
          latestClose: 200,
          previousClose: 190,
          changePct: 5.26,
          signal: { date: '01', action: 'buy', confidence: 1, reason: 'r', strategy: 's' },
          candles: [],
        },
      ],
    };
    const md = renderDashboardMarkdown({
      snapshot: snap,
      generatedAt: '01',
    });
    expect(md).toContain('| 銘柄 | 名称 | 最終値 | 変動率 | シグナル |');
    expect(md).toContain('| AAPL | Apple | ');
    expect(md).toContain('+5.26%');
    expect(md).toContain('| buy |');
  });

  it('emits "(銘柄なし)" placeholder when watchlist is empty', () => {
    const md = renderDashboardMarkdown({
      snapshot: emptySnapshot(),
      generatedAt: '01',
    });
    expect(md).toContain('_(銘柄なし)_');
    expect(md).not.toContain('| 銘柄 | 名称 |');
  });

  it('embeds advisor recommendations when provided', () => {
    const md = renderDashboardMarkdown({
      snapshot: emptySnapshot(),
      generatedAt: '01',
      advisorResult: {
        recommendations: [
          {
            symbol: 'AAPL',
            rank: 1,
            rationale: 'rationale-text',
            riskFactors: ['risk-A', 'risk-B'],
          },
        ],
        disclaimer: 'TEST DISCLAIMER',
        notForRealMoney: true,
      },
    });
    expect(md).toContain('## AI アドバイザー結果 (1 件)');
    expect(md).toContain('### 1. AAPL');
    expect(md).toContain('rationale-text');
    expect(md).toContain('- リスク: risk-A');
    expect(md).toContain('- リスク: risk-B');
    expect(md).toContain('> TEST DISCLAIMER');
  });

  it('embeds strategy comparison table with **bold (最良)** on the winner row', () => {
    const md = renderDashboardMarkdown({
      snapshot: emptySnapshot(),
      generatedAt: '01',
      strategyComparison: {
        symbol: 'AAPL',
        initialCash: 100_000,
        rows: [
          { strategy: 'sma-crossover', finalEquity: 115_000, totalReturnPct: 15, maxDrawdownPct: 5, winRate: 1, tradeCount: 2 },
          { strategy: 'macd-signal', finalEquity: 95_000, totalReturnPct: -5, maxDrawdownPct: 8, winRate: 0, tradeCount: 1 },
        ],
        bestByReturn: 'sma-crossover',
      },
    });
    expect(md).toContain('## 戦略比較 — AAPL');
    expect(md).toContain('100,000'); // currency formatter uses fullwidth ￥
    expect(md).toContain('**sma-crossover (最良)**');
    expect(md).toContain('macd-signal');
    expect(md).toContain('+15.00%');
    expect(md).toContain('-5.00%');
  });

  it('escapes pipes in cell strings (anti-table-break)', () => {
    const snap: StocksSnapshot = {
      ...emptySnapshot(),
      watchlist: [
        {
          symbol: 'PI|PE',
          label: 'Pipe|Co',
          latestClose: 100,
          previousClose: 100,
          changePct: 0,
          signal: { date: '01', action: 'hold', confidence: 0, reason: '', strategy: 's' },
          candles: [],
        },
      ],
    };
    const md = renderDashboardMarkdown({ snapshot: snap, generatedAt: '01' });
    expect(md).toContain('PI\\|PE');
    expect(md).toContain('Pipe\\|Co');
    expect(md).not.toMatch(/\| PI\|PE \|/);
  });

  it('omits both optional sections when absent', () => {
    const md = renderDashboardMarkdown({
      snapshot: emptySnapshot(),
      generatedAt: '01',
    });
    expect(md).not.toContain('## AI アドバイザー結果');
    expect(md).not.toContain('## 戦略比較');
  });

  it('shows P&L sign + percent in the portfolio table', () => {
    const snap: StocksSnapshot = {
      ...emptySnapshot(),
      portfolio: { cash: 110_000, initialCash: 100_000, positions: {}, history: [] },
    };
    const md = renderDashboardMarkdown({ snapshot: snap, generatedAt: '01' });
    // ￥ is the fullwidth yen sign Intl.NumberFormat returns for ja-JP.
    expect(md).toMatch(/損益.*\+￥10,000.*\+10\.00%/);
  });

  it('handles negative P&L sign (kills `>= 0` boundary on sign formatting)', () => {
    const snap: StocksSnapshot = {
      ...emptySnapshot(),
      portfolio: { cash: 90_000, initialCash: 100_000, positions: {}, history: [] },
    };
    const md = renderDashboardMarkdown({ snapshot: snap, generatedAt: '01' });
    expect(md).toMatch(/損益.*-￥10,000.*-10\.00%/);
  });

  it('boundary: pnl exactly 0 uses + sign (kills `>= 0` → `> 0` on sign-pnl)', () => {
    // cash === initialCash → pnl = 0. Original `pnl >= 0 ? "+" : ""` → "+";
    // mutated `pnl > 0` → "" (no sign).
    const snap: StocksSnapshot = {
      ...emptySnapshot(),
      portfolio: { cash: 100_000, initialCash: 100_000, positions: {}, history: [] },
    };
    const md = renderDashboardMarkdown({ snapshot: snap, generatedAt: '01' });
    expect(md).toMatch(/損益.*\+￥0.*\+0\.00%/);
  });

  it('boundary: changePct === 0 uses + sign (kills `>= 0` → `> 0` on watchlist sign)', () => {
    const snap: StocksSnapshot = {
      ...emptySnapshot(),
      watchlist: [
        {
          symbol: 'X',
          label: 'X',
          latestClose: 100,
          previousClose: 100,
          changePct: 0,
          signal: { date: '01', action: 'hold', confidence: 0, reason: '', strategy: 's' },
          candles: [],
        },
      ],
    };
    const md = renderDashboardMarkdown({ snapshot: snap, generatedAt: '01' });
    expect(md).toContain('+0.00%');
  });

  it('boundary: strategy totalReturnPct === 0 uses + sign in comparison row', () => {
    const md = renderDashboardMarkdown({
      snapshot: emptySnapshot(),
      generatedAt: '01',
      strategyComparison: {
        symbol: 'X',
        initialCash: 10_000,
        rows: [
          { strategy: 'flat', finalEquity: 10_000, totalReturnPct: 0, maxDrawdownPct: 0, winRate: 0, tradeCount: 0 },
        ],
        bestByReturn: null,
      },
    });
    expect(md).toContain('+0.00%');
  });

  it('boundary: initialCash === 0 → pnlPct === 0, no NaN (kills `> 0` → `>= 0` on initialCash gate)', () => {
    const snap: StocksSnapshot = {
      ...emptySnapshot(),
      portfolio: { cash: 0, initialCash: 0, positions: {}, history: [] },
    };
    const md = renderDashboardMarkdown({ snapshot: snap, generatedAt: '01' });
    expect(md).not.toContain('NaN');
    expect(md).toMatch(/損益.*0\.00%/);
  });

  it('embeds held position values in the equity total (kills positions reduce + find-predicate mutants)', () => {
    // Multi-ticker watchlist with the position pointing at the SECOND entry.
    // The find-predicate `(x) => x.symbol === t` mutated to `(x) => true`
    // would return the first row (FIRST: AAPL @ 100), inflating equity to
    // 50_000 + 100*100 = 60_000 instead of the correct 50_000 + 100*250.
    const snap: StocksSnapshot = {
      ...emptySnapshot(),
      portfolio: {
        cash: 50_000,
        initialCash: 100_000,
        positions: { MSFT: { shares: 100, avgCost: 200 } },
        history: [],
      },
      watchlist: [
        {
          symbol: 'AAPL',
          label: 'Apple',
          latestClose: 100, // would inflate equity if find always picks first
          previousClose: 100,
          changePct: 0,
          signal: { date: '01', action: 'hold', confidence: 0, reason: '', strategy: 's' },
          candles: [],
        },
        {
          symbol: 'MSFT',
          label: 'Microsoft',
          latestClose: 250,
          previousClose: 240,
          changePct: 4.16,
          signal: { date: '01', action: 'hold', confidence: 0, reason: '', strategy: 's' },
          candles: [],
        },
      ],
    };
    const md = renderDashboardMarkdown({ snapshot: snap, generatedAt: '01' });
    // equity = 50_000 + 100 * 250 = 75_000; pnl = 75_000 - 100_000 = -25_000.
    expect(md).toContain('-￥25,000');
    expect(md).toContain('-25.00%');
  });
});

describe('defaultDashboardMdPath', () => {
  it('ends with /.local/business-hub/data/dashboard.md', () => {
    expect(defaultDashboardMdPath()).toMatch(/\.local[\/\\]business-hub[\/\\]data[\/\\]dashboard\.md$/);
  });
});

describe('isSafeDashboardMdPath', () => {
  const home = '/home/user';
  it('accepts a .md path under home', () => {
    expect(isSafeDashboardMdPath('/home/user/x.md', home)).toBe(true);
  });
  it('rejects .html (wrong extension)', () => {
    expect(isSafeDashboardMdPath('/home/user/x.html', home)).toBe(false);
  });
  it('rejects path outside home', () => {
    expect(isSafeDashboardMdPath('/etc/x.md', home)).toBe(false);
  });
  it('rejects empty / non-string / control-char paths', () => {
    expect(isSafeDashboardMdPath('', home)).toBe(false);
    expect(isSafeDashboardMdPath(42 as unknown as string, home)).toBe(false);
    expect(isSafeDashboardMdPath('/home/user/x\n.md', home)).toBe(false);
  });
  it('rejects paths > 1024 chars', () => {
    expect(isSafeDashboardMdPath('/home/user/' + 'x'.repeat(1024) + '.md', home)).toBe(false);
  });
});

describe('exportDashboardMdImpl', () => {
  it('writes markdown to defaultDashboardMdPath when no path supplied', async () => {
    let writtenPath = '';
    let writtenBody = '';
    const r = await exportDashboardMdImpl(
      { token: '', payload: {} },
      {
        fetchSnapshot: async () => emptySnapshot(),
        writeFile: async (p, c) => {
          writtenPath = p as string;
          writtenBody = c as string;
        },
      },
    );
    expect(r.path).toBe(defaultDashboardMdPath());
    expect(writtenPath).toBe(defaultDashboardMdPath());
    expect(writtenBody).toContain('# Service Hub');
    expect(r.bytes).toBeGreaterThan(100);
  });

  it('honors a custom path under home', async () => {
    const customPath = path.join(os.homedir(), 'tmp-md-test.md');
    let written = false;
    const r = await exportDashboardMdImpl(
      { token: '', payload: { path: customPath } },
      {
        fetchSnapshot: async () => emptySnapshot(),
        writeFile: async (p) => {
          if (p === customPath) written = true;
        },
      },
    );
    expect(r.path).toBe(customPath);
    expect(written).toBe(true);
  });

  it('rejects a path outside home', async () => {
    await expect(
      exportDashboardMdImpl(
        { token: '', payload: { path: '/etc/x.md' } },
        {
          fetchSnapshot: async () => emptySnapshot(),
          writeFile: async () => {},
        },
      ),
    ).rejects.toThrow(/under the user home directory/);
  });

  it('rejects a non-.md path', async () => {
    await expect(
      exportDashboardMdImpl(
        { token: '', payload: { path: path.join(os.homedir(), 'x.txt') } },
        {
          fetchSnapshot: async () => emptySnapshot(),
          writeFile: async () => {},
        },
      ),
    ).rejects.toThrow(/\.md file/);
  });

  it('embeds strategy comparison + advisor when payload contains them', async () => {
    let body = '';
    await exportDashboardMdImpl(
      {
        token: '',
        payload: {
          strategyComparison: {
            symbol: 'AAPL',
            initialCash: 100_000,
            rows: [
              { strategy: 'sma-crossover', finalEquity: 115_000, totalReturnPct: 15, maxDrawdownPct: 5, winRate: 1, tradeCount: 2 },
            ],
            bestByReturn: 'sma-crossover',
          },
          advisorResult: {
            recommendations: [
              {
                symbol: 'AAPL',
                rank: 1,
                rationale: 'reason',
                riskFactors: ['r1'],
              },
            ],
            disclaimer: 'D',
            notForRealMoney: true,
          },
        },
      },
      {
        fetchSnapshot: async () => emptySnapshot(),
        writeFile: async (_p, c) => {
          body = c as string;
        },
      },
    );
    expect(body).toContain('戦略比較');
    expect(body).toContain('AI アドバイザー結果');
    expect(body).toContain('**sma-crossover (最良)**');
  });

  it('is registered as the export-dashboard-md action', () => {
    expect(typeof ACTIONS['export-dashboard-md']).toBe('function');
  });
});

// --- Persistent state (loadStocksState / addWatchlistEntry / etc) ----

describe('stocks state persistence', () => {
  function memoryDeps(initial?: string) {
    let store: string | null = initial ?? null;
    return {
      deps: {
        statePath: () => '/tmp/test-state.json',
        readFile: async () => {
          if (store === null) throw new Error('ENOENT');
          return store;
        },
        writeFile: async (_p: string, c: string) => {
          store = c;
        },
        mkdir: async () => {},
        rename: async () => {},
      } satisfies StateDeps,
      getStore: () => store,
    };
  }

  describe('defaultStatePath', () => {
    it('ends with .local/business-hub/state.json', () => {
      expect(defaultStatePath()).toMatch(/\.local[/\\]business-hub[/\\]state\.json$/);
    });
  });

  describe('loadStocksState', () => {
    it('returns DEFAULT_STATE when file does not exist', async () => {
      const { deps } = memoryDeps();
      const s = await loadStocksState(deps);
      expect(s.watchlist).toEqual([]);
    });

    it('returns DEFAULT_STATE on JSON parse error', async () => {
      const { deps } = memoryDeps('not valid json {{{');
      const s = await loadStocksState(deps);
      expect(s.watchlist).toEqual([]);
    });

    it('returns DEFAULT_STATE on non-object root', async () => {
      const { deps } = memoryDeps('"a string"');
      const s = await loadStocksState(deps);
      expect(s.watchlist).toEqual([]);
    });

    it('returns DEFAULT_STATE on null root', async () => {
      const { deps } = memoryDeps('null');
      const s = await loadStocksState(deps);
      expect(s.watchlist).toEqual([]);
    });

    it('reads a well-formed watchlist', async () => {
      const { deps } = memoryDeps(JSON.stringify({ watchlist: ['AAPL', 'MSFT'] }));
      const s = await loadStocksState(deps);
      expect(s.watchlist).toEqual(['AAPL', 'MSFT']);
    });

    it('filters out non-string watchlist entries (defense vs tampering)', async () => {
      const { deps } = memoryDeps(JSON.stringify({ watchlist: ['AAPL', 42, null, 'MSFT'] }));
      const s = await loadStocksState(deps);
      expect(s.watchlist).toEqual(['AAPL', 'MSFT']);
    });

    it('filters out unsafe symbols (path-injection / shell-meta)', async () => {
      const { deps } = memoryDeps(
        JSON.stringify({ watchlist: ['AAPL', 'BAD;rm', 'OK.T', 'over_underscore'] }),
      );
      const s = await loadStocksState(deps);
      // Only AAPL + OK.T pass isSafeSymbol.
      expect(s.watchlist).toEqual(['AAPL', 'OK.T']);
    });

    it('treats missing watchlist field as empty', async () => {
      const { deps } = memoryDeps(JSON.stringify({ unrelated: 'data' }));
      const s = await loadStocksState(deps);
      expect(s.watchlist).toEqual([]);
    });

    it('uses default statePath when not injected (smoke — does not throw)', async () => {
      // Just verify the production path doesn't crash on a missing file.
      // Implementation reads the real ~/.local/business-hub/state.json
      // which may or may not exist; either way, loadStocksState swallows.
      const s = await loadStocksState();
      expect(Array.isArray(s.watchlist)).toBe(true);
    });
  });

  describe('saveStocksState', () => {
    it('writes via atomic-rename pattern (tmp file then rename)', async () => {
      const writes: string[] = [];
      const renames: [string, string][] = [];
      const mkdirs: string[] = [];
      await saveStocksState(
        { watchlist: ['AAPL'] },
        {
          statePath: () => '/tmp/x.json',
          writeFile: async (p) => {
            writes.push(p as string);
          },
          rename: async (a, b) => {
            renames.push([a, b]);
          },
          mkdir: async (p) => {
            mkdirs.push(p);
          },
        },
      );
      expect(writes).toEqual(['/tmp/x.json.tmp']);
      expect(renames).toEqual([['/tmp/x.json.tmp', '/tmp/x.json']]);
      expect(mkdirs).toEqual(['/tmp']);
    });

    it('serialized JSON is pretty-printed (kills `null, 2` → `null, 0` if drift)', async () => {
      let body = '';
      await saveStocksState(
        { watchlist: ['AAPL'] },
        {
          statePath: () => '/tmp/x.json',
          writeFile: async (_p, c) => {
            body = c as string;
          },
          rename: async () => {},
          mkdir: async () => {},
        },
      );
      expect(body).toContain('\n');
      expect(body).toContain('  "watchlist"');
    });
  });

  describe('addWatchlistEntry', () => {
    it('persists a new symbol (uppercased)', async () => {
      const { deps, getStore } = memoryDeps();
      const s = await addWatchlistEntry('aapl', deps);
      expect(s.watchlist).toEqual(['AAPL']);
      expect(JSON.parse(getStore()!).watchlist).toEqual(['AAPL']);
    });

    it('is idempotent — no duplicate, no re-write', async () => {
      const { deps, getStore } = memoryDeps(JSON.stringify({ watchlist: ['AAPL'] }));
      const initial = getStore();
      const s = await addWatchlistEntry('aapl', deps);
      expect(s.watchlist).toEqual(['AAPL']);
      // Store unchanged (we never wrote because the entry already existed).
      expect(getStore()).toBe(initial);
    });

    it('rejects unsafe symbols', async () => {
      const { deps } = memoryDeps();
      await expect(addWatchlistEntry('BAD;rm', deps)).rejects.toThrow(/1-16 chars/);
    });

    it('appends to an existing list', async () => {
      const { deps } = memoryDeps(JSON.stringify({ watchlist: ['AAPL'] }));
      const s = await addWatchlistEntry('MSFT', deps);
      expect(s.watchlist).toEqual(['AAPL', 'MSFT']);
    });
  });

  describe('removeWatchlistEntry', () => {
    it('removes a known symbol', async () => {
      const { deps, getStore } = memoryDeps(JSON.stringify({ watchlist: ['AAPL', 'MSFT'] }));
      const s = await removeWatchlistEntry('aapl', deps);
      expect(s.watchlist).toEqual(['MSFT']);
      expect(JSON.parse(getStore()!).watchlist).toEqual(['MSFT']);
    });

    it('is idempotent — removing absent symbol is a no-op', async () => {
      const { deps, getStore } = memoryDeps(JSON.stringify({ watchlist: ['AAPL'] }));
      const initial = getStore();
      const s = await removeWatchlistEntry('MSFT', deps);
      expect(s.watchlist).toEqual(['AAPL']);
      expect(getStore()).toBe(initial);
    });

    it('rejects unsafe symbols', async () => {
      const { deps } = memoryDeps();
      await expect(removeWatchlistEntry('BAD;rm', deps)).rejects.toThrow(/1-16 chars/);
    });
  });

  describe('unregisterTickerImpl', () => {
    function memoryDeps2(initial?: string) {
      let store: string | null = initial ?? null;
      return {
        deps: {
          statePath: () => '/tmp/test.json',
          readFile: async () => {
            if (store === null) throw new Error('ENOENT');
            return store;
          },
          writeFile: async (_p: string, c: string) => {
            store = c;
          },
          mkdir: async () => {},
          rename: async () => {},
        } satisfies StateDeps,
      };
    }

    it('removes a known symbol and returns removed:true', async () => {
      const { deps } = memoryDeps2(JSON.stringify({ watchlist: ['AAPL', 'MSFT'] }));
      const r = await unregisterTickerImpl({ token: '', payload: { symbol: 'aapl' } }, deps);
      expect(r.symbol).toBe('AAPL');
      expect(r.removed).toBe(true);
      expect(r.watchlist).toEqual(['MSFT']);
      expect(r.message).toContain('removed from watchlist');
    });

    it('returns removed:false for an absent symbol', async () => {
      const { deps } = memoryDeps2(JSON.stringify({ watchlist: ['AAPL'] }));
      const r = await unregisterTickerImpl({ token: '', payload: { symbol: 'MSFT' } }, deps);
      expect(r.removed).toBe(false);
      expect(r.message).toContain('not in watchlist');
    });

    it('rejects unsafe / missing symbol', async () => {
      const { deps } = memoryDeps2();
      await expect(
        unregisterTickerImpl({ token: '', payload: { symbol: 'BAD;rm' } }, deps),
      ).rejects.toThrow(/1-16 chars/);
      await expect(
        unregisterTickerImpl({ token: '', payload: {} }, deps),
      ).rejects.toThrow(/1-16 chars/);
    });

    it('is registered as the unregister-ticker action', () => {
      expect(typeof ACTIONS['unregister-ticker']).toBe('function');
    });
  });

  describe('fetchStocksSnapshotImpl with persistent watchlist', () => {
    it('uses persistent watchlist when non-empty (overrides MOCK_TICKERS)', async () => {
      const snap = await fetchStocksSnapshotImpl(
        { token: '' },
        {
          loadState: async () => ({ watchlist: ['AAPL', 'MSFT'] }),
        },
      );
      expect(snap.watchlist).toHaveLength(2);
      expect(snap.watchlist.map((w) => w.symbol)).toEqual(['AAPL', 'MSFT']);
    });

    it('preserves MOCK_TICKERS labels when the symbol matches', async () => {
      const snap = await fetchStocksSnapshotImpl(
        { token: '' },
        {
          loadState: async () => ({ watchlist: ['AAPL', '7203.T'] }),
        },
      );
      expect(snap.watchlist[0]!.label).toBe('Apple');
      expect(snap.watchlist[1]!.label).toBe('トヨタ自動車');
    });

    it('uses symbol as label for unknown tickers', async () => {
      const snap = await fetchStocksSnapshotImpl(
        { token: '' },
        {
          loadState: async () => ({ watchlist: ['NVDA'] }),
        },
      );
      expect(snap.watchlist[0]!.symbol).toBe('NVDA');
      expect(snap.watchlist[0]!.label).toBe('NVDA');
    });

    it('falls back to MOCK_TICKERS when state.watchlist is empty', async () => {
      const snap = await fetchStocksSnapshotImpl(
        { token: '' },
        {
          loadState: async () => ({ watchlist: [] }),
        },
      );
      expect(snap.watchlist).toHaveLength(MOCK_TICKERS.length);
    });

    it('uses real loadStocksState by default (smoke — does not throw)', async () => {
      // No deps injected → uses defaultStatePath. May read a stale state
      // file, but should at least not throw.
      const snap = await fetchStocksSnapshotImpl({ token: '' });
      expect(snap.isMock).toBe(true);
      expect(Array.isArray(snap.watchlist)).toBe(true);
    });
  });
});
