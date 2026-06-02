import { describe, expect, it } from 'vitest';
import {
  sma,
  ema,
  rsi,
  macd,
  bollingerBands,
  backtest,
  STRATEGIES,
  SMA_CROSSOVER_STRATEGY,
  RSI_MEAN_REVERSION_STRATEGY,
  MACD_SIGNAL_STRATEGY,
  compareStrategies,
  buildTickerAnalysis,
  buildAnalysesForUniverse,
  validateAdvisorJson,
  advisorSystemPrompt,
  renderDashboardHtml,
  renderDashboardMarkdown,
  ADVISOR_DISCLAIMER,
  DEFAULT_ADVISOR_UNIVERSE,
  type AdvisorResponse,
  type Strategy,
} from '../stocksAnalysisWeb';
import { mockCandles, type WebCandle } from '../stocksWatchlistWeb';

/** close 配列から最小限の WebCandle 列を作る (戦略・指標は close のみ参照)。 */
function mkCandles(closes: readonly number[]): WebCandle[] {
  return closes.map((close, i) => ({
    date: `D${i}`,
    open: close,
    high: close,
    low: close,
    close,
    volume: 1000,
  }));
}

const NOW = Date.UTC(2026, 0, 31);

describe('indicators', () => {
  it('sma averages the trailing window and nulls early bars', () => {
    const s = sma([1, 2, 3, 4], 2);
    expect(s[0]).toBeNull();
    expect(s[1]).toBe(1.5);
    expect(s[3]).toBe(3.5);
  });
  it('rsi stays within [0,100]', () => {
    const closes = mockCandles('AAPL', NOW, 120).map((c) => c.close);
    for (const v of rsi(closes, 14)) {
      if (v != null) {
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(100);
      }
    }
  });
  it('macd returns three aligned series', () => {
    const closes = mockCandles('MSFT', NOW, 120).map((c) => c.close);
    const m = macd(closes);
    expect(m.macd).toHaveLength(closes.length);
    expect(m.signal).toHaveLength(closes.length);
    expect(m.histogram).toHaveLength(closes.length);
  });

  it('sma computes exact trailing windows and rejects period<=0', () => {
    // [null,1.5,2.5,3.5,4.5] — スライド減算 (sum -= closes[i-period]) を検証。
    expect(sma([1, 2, 3, 4, 5], 2)).toEqual([null, 1.5, 2.5, 3.5, 4.5]);
    expect(() => sma([1, 2], 0)).toThrow(/period must be > 0/);
    expect(() => sma([1, 2], -1)).toThrow(/period must be > 0/);
  });

  it('ema seeds with the SMA then applies alpha exactly', () => {
    // period=2, alpha=2/3 → [null, 3, 5, 7]
    expect(ema([2, 4, 6, 8], 2)).toEqual([null, 3, 5, 7]);
    expect(() => ema([1, 2], 0)).toThrow(/period must be > 0/);
  });

  it('rsi handles empty, all-gains (100), all-losses (0) and rejects period<=0', () => {
    expect(rsi([], 14)).toEqual([]);
    expect(() => rsi([1, 2, 3], 0)).toThrow(/period must be > 0/);
    // 単調増加 → avgLoss=0 → 100。 単調減少 → avgGain=0 → 0。
    expect(rsi([1, 2, 3, 4, 5], 2)).toEqual([null, null, 100, 100, 100]);
    expect(rsi([5, 4, 3, 2, 1], 2)).toEqual([null, null, 0, 0, 0]);
  });

  it('bollingerBands: zero width for a flat series, exact width otherwise', () => {
    expect(() => bollingerBands([1, 2], 0, 2)).toThrow(/period must be > 0/);
    const flat = bollingerBands([5, 5, 5, 5], 2, 2);
    expect(flat.middle[3]).toBe(5);
    expect(flat.upper[3]).toBe(5);
    expect(flat.lower[3]).toBe(5);
    // [2,4],period2,k1 → middle3, stddev1 → upper4 / lower2
    const bb = bollingerBands([2, 4], 2, 1);
    expect([bb.lower[1], bb.middle[1], bb.upper[1]]).toEqual([2, 3, 4]);
  });

  it('macd of a flat series is zero where all series are defined', () => {
    const m = macd(Array(40).fill(5));
    const i = 39;
    expect(m.macd[i]).toBe(0);
    expect(m.signal[i]).toBe(0);
    expect(m.histogram[i]).toBe(0);
  });
});

describe('STRATEGIES', () => {
  it('has the three built-in strategies', () => {
    expect(Object.keys(STRATEGIES).sort()).toEqual(['macd-signal', 'rsi-mean-reversion', 'sma-crossover']);
  });
});

describe('SMA_CROSSOVER_STRATEGY (crafted crossovers)', () => {
  it('holds with insufficient history and empty input (date "")', () => {
    expect(SMA_CROSSOVER_STRATEGY(mkCandles(Array(50).fill(100))).reason).toBe('insufficient history');
    const empty = SMA_CROSSOVER_STRATEGY([]);
    expect(empty.action).toBe('hold');
    expect(empty.date).toBe('');
  });
  it('emits buy on a golden cross', () => {
    // 50本フラット@100 + 末尾200 → SMA20(105) が SMA50(102) を上抜け、直前は同値。
    const sig = SMA_CROSSOVER_STRATEGY(mkCandles([...Array(50).fill(100), 200]));
    expect(sig.action).toBe('buy');
    expect(sig.confidence).toBe(0.7);
    expect(sig.reason).toMatch(/golden cross/);
  });
  it('emits sell on a death cross', () => {
    const sig = SMA_CROSSOVER_STRATEGY(mkCandles([...Array(50).fill(100), 10]));
    expect(sig.action).toBe('sell');
    expect(sig.confidence).toBe(0.7);
    expect(sig.reason).toMatch(/death cross/);
  });
  it('holds when there is no crossover', () => {
    const sig = SMA_CROSSOVER_STRATEGY(mkCandles(Array(51).fill(100)));
    expect(sig.action).toBe('hold');
    expect(sig.confidence).toBe(0.3);
    expect(sig.reason).toBe('no crossover');
  });
});

describe('RSI_MEAN_REVERSION_STRATEGY', () => {
  it('holds with insufficient history (<15)', () => {
    expect(RSI_MEAN_REVERSION_STRATEGY(mkCandles(Array(14).fill(100))).reason).toBe('insufficient history');
  });
  it('buys when RSI is fully oversold (strictly falling → 0)', () => {
    const sig = RSI_MEAN_REVERSION_STRATEGY(mkCandles(Array.from({ length: 30 }, (_, i) => 200 - i)));
    expect(sig.action).toBe('buy');
    expect(sig.confidence).toBe(1); // (30-0)/30
    expect(sig.reason).toMatch(/oversold/);
  });
  it('sells when RSI is fully overbought (strictly rising → 100)', () => {
    const sig = RSI_MEAN_REVERSION_STRATEGY(mkCandles(Array.from({ length: 30 }, (_, i) => 100 + i)));
    expect(sig.action).toBe('sell');
    expect(sig.confidence).toBe(1); // (100-70)/30
    expect(sig.reason).toMatch(/overbought/);
  });
});

describe('MACD_SIGNAL_STRATEGY', () => {
  it('holds with insufficient history (<35)', () => {
    expect(MACD_SIGNAL_STRATEGY(mkCandles(Array(34).fill(100))).reason).toBe('insufficient history');
  });
  it('holds with no crossover on a flat series', () => {
    const sig = MACD_SIGNAL_STRATEGY(mkCandles(Array(40).fill(100)));
    expect(sig.action).toBe('hold');
    expect(sig.confidence).toBe(0.25);
    expect(sig.reason).toBe('no crossover');
  });
});

describe('backtest (paper trading)', () => {
  const flat = mkCandles(Array(60).fill(100));
  const HOLD: Strategy = (c) => ({ date: c[c.length - 1]?.date ?? '', action: 'hold', confidence: 0, reason: 'h', strategy: 't' });
  const BUY: Strategy = (c) => ({ date: c[c.length - 1]?.date ?? '', action: 'buy', confidence: 1, reason: 'b', strategy: 't' });

  it('a never-trading strategy leaves equity untouched', () => {
    const r = backtest(flat, HOLD, 10_000);
    expect(r.finalEquity).toBe(10_000);
    expect(r.totalReturnPct).toBe(0);
    expect(r.maxDrawdownPct).toBe(0);
    expect(r.winRate).toBe(0);
    expect(r.tradeCount).toBe(0);
  });
  it('an always-buy strategy on a rising series trades and stays finite', () => {
    const rising = mkCandles(Array.from({ length: 80 }, (_, i) => 100 + i * 2));
    const r = backtest(rising, BUY, 100_000);
    expect(r.tradeCount).toBeGreaterThan(0); // 買い + 利確売りが発生
    expect(Number.isFinite(r.finalEquity)).toBe(true);
    expect(r.winRate).toBeGreaterThanOrEqual(0);
    expect(r.winRate).toBeLessThanOrEqual(1);
  });

  // i=50 でちょうど1回だけ買う戦略 (window 長 51 のときだけ buy)。
  const buyOnceAtStart: Strategy = (c) =>
    c.length === 51
      ? { date: c[c.length - 1]!.date, action: 'buy', confidence: 1, reason: 'b', strategy: 't' }
      : { date: c[c.length - 1]?.date ?? '', action: 'hold', confidence: 0, reason: 'h', strategy: 't' };

  it('take-profit: buy @100 then +20% triggers a winning exit (exact P&L)', () => {
    // 既定リスク: positionSizePct 0.1, takeProfit 0.15。10000*0.1/100=10株, cost1000, cash9000。
    // i=51 で 120 → gain20% ≥15% → 利確売り 10@120 → cash 10200。
    const candles = mkCandles([...Array(51).fill(100), 120, 120]);
    const r = backtest(candles, buyOnceAtStart, 10_000);
    expect(r.finalEquity).toBe(10_200);
    expect(r.totalReturnPct).toBe(2);
    expect(r.tradeCount).toBe(2); // buy + take-profit sell
    expect(r.winRate).toBe(1);
    expect(r.maxDrawdownPct).toBe(0);
  });

  it('stop-loss: buy @100 then −10% triggers a losing exit (exact P&L)', () => {
    // i=51 で 90 → drop10% ≥5% → 損切り売り 10@90 → cash 9900。
    const candles = mkCandles([...Array(51).fill(100), 90, 90]);
    const r = backtest(candles, buyOnceAtStart, 10_000);
    expect(r.finalEquity).toBe(9_900);
    expect(r.totalReturnPct).toBe(-1);
    expect(r.tradeCount).toBe(2); // buy + stop-loss sell
    expect(r.winRate).toBe(0);
    expect(r.maxDrawdownPct).toBe(1); // (10000-9900)/10000
  });

  it('skips a buy when the position budget rounds to zero shares', () => {
    const candles = mkCandles([...Array(51).fill(100), 100, 100]);
    const r = backtest(candles, buyOnceAtStart, 5); // 5*0.1/100 < 1 株 → 取引なし
    expect(r.tradeCount).toBe(0);
    expect(r.finalEquity).toBe(5);
  });

  it('ignores a sell with no open position', () => {
    const SELL: Strategy = (c) => ({ date: c[c.length - 1]?.date ?? '', action: 'sell', confidence: 1, reason: 's', strategy: 't' });
    const r = backtest(flat, SELL, 10_000);
    expect(r.tradeCount).toBe(0);
    expect(r.finalEquity).toBe(10_000);
  });
});

describe('compareStrategies', () => {
  it('is deterministic and returns one row per strategy', () => {
    const a = compareStrategies('AAPL', 1_000_000, NOW);
    const b = compareStrategies('AAPL', 1_000_000, NOW);
    expect(a).toEqual(b);
    expect(a.rows.map((r) => r.strategy).sort()).toEqual(['macd-signal', 'rsi-mean-reversion', 'sma-crossover']);
  });
  it('produces finite metrics and a valid winRate', () => {
    const res = compareStrategies('7203.T', 500_000, NOW);
    for (const r of res.rows) {
      expect(Number.isFinite(r.finalEquity)).toBe(true);
      expect(Number.isFinite(r.totalReturnPct)).toBe(true);
      expect(r.winRate).toBeGreaterThanOrEqual(0);
      expect(r.winRate).toBeLessThanOrEqual(1);
      expect(r.tradeCount).toBeGreaterThanOrEqual(0);
    }
  });
  it('bestByReturn is null or one of the strategies', () => {
    const res = compareStrategies('GOOGL', 1_000_000, NOW);
    if (res.bestByReturn !== null) {
      expect(Object.keys(STRATEGIES)).toContain(res.bestByReturn);
    }
  });
  it('golden: AAPL rows + null bestByReturn when no strategy beats 0', () => {
    const cmp = compareStrategies('AAPL', 1_000_000, NOW);
    expect(cmp.bestByReturn).toBeNull(); // 全戦略 ≤0% → null
    const sma = cmp.rows.find((r) => r.strategy === 'sma-crossover')!;
    expect(sma.tradeCount).toBe(0); // クロス無 → 取引なし
    const macd = cmp.rows.find((r) => r.strategy === 'macd-signal')!;
    expect(macd.tradeCount).toBe(6);
    expect(macd.winRate).toBeCloseTo(1 / 3, 4);
    expect(macd.finalEquity).toBeCloseTo(999_161.65, 1);
    expect(macd.totalReturnPct).toBeCloseTo(-0.0838, 3);
    expect(macd.maxDrawdownPct).toBeCloseTo(0.5917, 3);
  });
});

describe('buildTickerAnalysis', () => {
  it('summarizes indicators and a crossover signal', () => {
    const a = buildTickerAnalysis('AAPL', 'AAPL', mockCandles('AAPL', NOW, 120));
    expect(a.symbol).toBe('AAPL');
    expect(['buy', 'sell', 'hold']).toContain(a.smaCrossover);
    expect(['oversold', 'overbought', 'neutral']).toContain(a.rsiSignal);
    expect(Number.isFinite(a.latestClose)).toBe(true);
  });
  it('buildAnalysesForUniverse maps every symbol', () => {
    const out = buildAnalysesForUniverse(['AAPL', 'MSFT'], NOW);
    expect(out.map((a) => a.symbol)).toEqual(['AAPL', 'MSFT']);
  });
  it('golden: pins all indicator outputs for AAPL/120 (sma/ema/rsi/macd/bollinger)', () => {
    const ta = buildTickerAnalysis('AAPL', 'AAPL', mockCandles('AAPL', NOW, 120));
    expect(ta.latestClose).toBe(951.81);
    expect(ta.changePct).toBeCloseTo(0.2496, 4);
    expect(ta.sma20).toBeCloseTo(983.6495, 3);
    expect(ta.sma50).toBeCloseTo(974.423, 3);
    expect(ta.rsi14).toBeCloseTo(41.0662, 3);
    expect(ta.macd.line).toBeCloseTo(-5.1468, 3);
    expect(ta.macd.signal).toBeCloseTo(0.2563, 3);
    expect(ta.macd.histogram).toBeCloseTo(-5.4031, 3);
    expect(ta.bollinger.upper).toBeCloseTo(1020.9771, 3);
    expect(ta.bollinger.middle).toBeCloseTo(983.6495, 3);
    expect(ta.bollinger.lower).toBeCloseTo(946.3219, 3);
    expect(ta.smaCrossover).toBe('hold');
    expect(ta.rsiSignal).toBe('neutral');
  });
  it('computes changePct exactly and nulls indicators for short input', () => {
    const a = buildTickerAnalysis('X', 'Lbl', mkCandles([100, 110]));
    expect(a.latestClose).toBe(110);
    expect(a.changePct).toBe(10); // (110-100)/100*100
    expect(a.sma20).toBeNull();
    expect(a.smaCrossover).toBe('hold'); // insufficient → hold
    expect(a.label).toBe('Lbl');
  });
  it('changePct is 0 for a single candle (no previous bar)', () => {
    const a = buildTickerAnalysis('X', 'X', mkCandles([42]));
    expect(a.latestClose).toBe(42);
    expect(a.changePct).toBe(0);
    expect(a.rsiSignal).toBe('neutral');
  });
});

describe('validateAdvisorJson', () => {
  const allowed = new Set(['AAPL', 'MSFT']);
  it('accepts a valid response', () => {
    const recs = validateAdvisorJson(
      { recommendations: [{ symbol: 'AAPL', rank: 1, rationale: 'x'.repeat(40), riskFactors: ['r'] }] },
      allowed,
    );
    expect(recs).toHaveLength(1);
    expect(recs[0]!.symbol).toBe('AAPL');
  });
  it('rejects out-of-universe symbol', () => {
    expect(() =>
      validateAdvisorJson({ recommendations: [{ symbol: 'TSLA', rank: 1, rationale: 'x', riskFactors: ['r'] }] }, allowed),
    ).toThrow(/out-of-universe/);
  });
  it('rejects missing riskFactors and bad shapes', () => {
    expect(() => validateAdvisorJson({ recommendations: [] }, allowed)).toThrow(/zero/);
    expect(() =>
      validateAdvisorJson({ recommendations: [{ symbol: 'AAPL', rank: 0, rationale: 'x', riskFactors: ['r'] }] }, allowed),
    ).toThrow(/rank/);
    expect(() =>
      validateAdvisorJson({ recommendations: [{ symbol: 'AAPL', rank: 1, rationale: 'x', riskFactors: [] }] }, allowed),
    ).toThrow(/riskFactors/);
  });
});

describe('advisorSystemPrompt', () => {
  it('pins the JSON schema, the allowlist, and forbids buy-now language', () => {
    const p = advisorSystemPrompt(['AAPL', 'MSFT']);
    expect(p).toContain('"AAPL"');
    expect(p).toContain('recommendations');
    expect(p).toContain('今買え');
    expect(DEFAULT_ADVISOR_UNIVERSE.length).toBeGreaterThan(0);
  });
});

describe('dashboard render', () => {
  const advisor: AdvisorResponse = {
    recommendations: [{ symbol: 'AAPL', rank: 1, rationale: 'strong trend', riskFactors: ['volatility'] }],
    disclaimer: ADVISOR_DISCLAIMER,
    notForRealMoney: true,
  };
  const input = {
    watchlist: [{ symbol: 'AAPL', label: 'AAPL', latestClose: 123.45, changePct: 1.2 }],
    strategyComparison: compareStrategies('AAPL', 1_000_000, NOW),
    advisor,
    generatedAt: '2026-01-31T00:00:00.000Z',
  };
  it('html includes the symbol, the comparison, and the disclaimer', () => {
    const html = renderDashboardHtml(input);
    expect(html).toContain('AAPL');
    expect(html).toContain('戦略比較');
    expect(html).toContain(ADVISOR_DISCLAIMER);
    expect(html.startsWith('<!doctype html>')).toBe(true);
  });
  it('markdown includes a table and the disclaimer', () => {
    const md = renderDashboardMarkdown(input);
    expect(md).toContain('# Stocks');
    expect(md).toContain('| AAPL |');
    expect(md).toContain(ADVISOR_DISCLAIMER);
  });
  it('escapes HTML special chars in symbols', () => {
    const html = renderDashboardHtml({
      watchlist: [{ symbol: 'A<B', label: '"x"', latestClose: 1, changePct: 0 }],
      generatedAt: 'now',
    });
    expect(html).toContain('A&lt;B');
    expect(html).not.toContain('A<B</td>');
  });
  it('escapes all five HTML metacharacters', () => {
    const html = renderDashboardHtml({
      watchlist: [{ symbol: `&<>"'`, label: 'L', latestClose: 1, changePct: 0 }],
      generatedAt: 'now',
    });
    expect(html).toContain('&amp;&lt;&gt;&quot;&#39;');
  });
  it('colors and signs a negative change red', () => {
    const html = renderDashboardHtml({
      watchlist: [{ symbol: 'X', label: 'X', latestClose: 10, changePct: -1.2 }],
      generatedAt: 'now',
    });
    expect(html).toContain('#ef4444');
    expect(html).toContain('-1.20%');
  });
  it('renders placeholders and omits sections when data is empty/absent', () => {
    const html = renderDashboardHtml({ watchlist: [], generatedAt: 'now' });
    expect(html).toContain('(登録銘柄なし)');
    expect(html).not.toContain('戦略比較');
    expect(html).not.toContain('アドバイザー');
    const md = renderDashboardMarkdown({ watchlist: [], generatedAt: 'now' });
    expect(md).toContain('| (登録銘柄なし) | | | |');
    expect(md).not.toContain('## 戦略比較');
    expect(md).not.toContain('## アドバイザー');
  });
  it('markdown shows the comparison best-row label', () => {
    const cmp = compareStrategies('AAPL', 1_000_000, NOW);
    const md = renderDashboardMarkdown({ watchlist: [], strategyComparison: cmp, generatedAt: 'now' });
    expect(md).toContain('## 戦略比較 — AAPL');
    expect(md).toContain(cmp.bestByReturn ?? '差なし');
  });
});
