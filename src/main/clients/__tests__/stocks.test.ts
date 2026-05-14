import { describe, expect, it } from 'vitest';
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
  type Candle,
  type Signal,
} from '../stocks';

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
    const s = SMA_CROSSOVER_STRATEGY(makeCandles([1, 2, 3]));
    expect(s.action).toBe('hold');
    expect(s.reason).toBe('insufficient history');
    expect(s.strategy).toBe('sma-crossover');
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
  it('produces a watchlist of the 5 mock tickers + a paper portfolio', async () => {
    const snap = await fetchStocksSnapshot({ token: '' });
    expect(snap.watchlist).toHaveLength(MOCK_TICKERS.length);
    expect(snap.watchlist).toHaveLength(5);
    expect(snap.isMock).toBe(true);
    expect(snap.fetchedAt).toBe('2026-05-14T00:00:00.000Z');
    expect(snap.portfolio.initialCash).toBe(1_000_000);
  });

  it('every watchlist row carries label/latestClose/changePct/signal/candles', async () => {
    const snap = await fetchStocksSnapshot({ token: '' });
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
    const snap = await fetchStocksSnapshot({ token: '' });
    expect(snap.isMock).toBe(true);
  });

  it('changePct = (last - prev) / prev * 100 exactly (kills L637 arithmetic mutants)', async () => {
    const snap = await fetchStocksSnapshot({ token: '' });
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

describe('ACTIONS["register-ticker"]', () => {
  it('returns the upper-cased symbol + the Phase-7 deferral message', async () => {
    const r = (await ACTIONS['register-ticker']!({
      token: '',
      payload: { symbol: 'aapl' },
    })) as { symbol: string; added: boolean; message: string };
    expect(r.symbol).toBe('AAPL');
    expect(r.added).toBe(true);
    expect(r.message).toMatch(/Phase 7/);
  });

  it('rejects unsafe symbols before any other work', async () => {
    await expect(
      ACTIONS['register-ticker']!({ token: '', payload: { symbol: 'AAPL;rm' } }),
    ).rejects.toThrow(/1-16 chars/);
  });

  it('rejects missing symbol', async () => {
    await expect(
      ACTIONS['register-ticker']!({ token: '', payload: {} }),
    ).rejects.toThrow(/1-16 chars/);
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
