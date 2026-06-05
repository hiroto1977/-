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
  // NOTE: compareStrategies は describe ボディではなく各 it 内で呼ぶ (collection 時に
  // 評価すると、指標/戦略/backtest を壊す mutant がここで例外を投げて collection 全体が
  // 失敗し、Stryker がファイル内の全 mutant を survived 扱いにしてしまうため)。
  const makeInput = () => ({
    watchlist: [{ symbol: 'AAPL', label: 'AAPL', latestClose: 123.45, changePct: 1.2 }],
    strategyComparison: compareStrategies('AAPL', 1_000_000, NOW),
    advisor,
    generatedAt: '2026-01-31T00:00:00.000Z',
  });
  it('html includes the symbol, the comparison, and the disclaimer', () => {
    const html = renderDashboardHtml(makeInput());
    expect(html).toContain('AAPL');
    expect(html).toContain('戦略比較');
    expect(html).toContain(ADVISOR_DISCLAIMER);
    expect(html.startsWith('<!doctype html>')).toBe(true);
  });
  it('markdown includes a table and the disclaimer', () => {
    const md = renderDashboardMarkdown(makeInput());
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

// ===================== mutation hardening (PR: stocksAnalysisWeb 100%) =====================
describe('indicators (mutation hardening)', () => {
  it('ema seeds with the SMA then applies alpha (period 3 golden)', () => {
    expect(ema([2, 4, 6, 8, 10], 3)).toEqual([null, null, 4, 6, 8]);
  });
  it('rsi of a flat series is 100 via the avgLoss===0 guard (formula would be NaN)', () => {
    expect(rsi([5, 5, 5, 5], 2)).toEqual([null, null, 100, 100]);
  });
  it('rsi golden over a mixed gain/loss series (seeding → Wilder smoothing transition)', () => {
    expect(rsi([10, 11, 9, 12, 8, 13, 7], 3)).toEqual([
      null, null, null, 66.66666666666666, 33.33333333333333, 65.59139784946237, 35.05747126436782,
    ]);
  });
  it('macd golden over a ramp (line / signal / histogram alignment)', () => {
    expect(macd([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 2, 3, 2)).toEqual({
      macd: [null, null, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5],
      signal: [null, null, null, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5],
      histogram: [null, null, null, 0, 0, 0, 0, 0, 0, 0],
    });
  });
  it('bollinger golden over a ramp', () => {
    expect(bollingerBands([2, 4, 6], 2, 1)).toEqual({
      upper: [null, 4, 6], middle: [null, 3, 5], lower: [null, 2, 4],
    });
  });
});

describe('strategies (mutation hardening — crafted signals on deterministic mock symbols)', () => {
  it('MACD emits buy on a bullish crossover (AAG)', () => {
    const sig = MACD_SIGNAL_STRATEGY(mockCandles('AAG', NOW, 120));
    expect(sig.action).toBe('buy');
    expect(sig.confidence).toBe(0.65);
    expect(sig.reason).toBe('MACD crossed above signal');
  });
  it('MACD emits sell on a bearish crossover (AAC)', () => {
    const sig = MACD_SIGNAL_STRATEGY(mockCandles('AAC', NOW, 120));
    expect(sig.action).toBe('sell');
    expect(sig.confidence).toBe(0.65);
    expect(sig.reason).toBe('MACD crossed below signal');
  });
  it('RSI holds (neutral) for a mid-range RSI (AAB)', () => {
    const sig = RSI_MEAN_REVERSION_STRATEGY(mockCandles('AAB', NOW, 120));
    expect(sig.action).toBe('hold');
    expect(sig.confidence).toBe(0);
    expect(sig.reason).toMatch(/neutral/);
  });
});

describe('validateAdvisorJson (mutation hardening — every throw path + boundaries)', () => {
  const allowed = new Set(['AAPL', 'MSFT']);
  const rec = (o = {}) => ({ symbol: 'AAPL', rank: 1, rationale: 'ok', riskFactors: ['r'], ...o });
  const recs = (arr: unknown[]) => validateAdvisorJson({ recommendations: arr }, allowed);
  it('rejects a non-object top level (null / number)', () => {
    expect(() => validateAdvisorJson(null, allowed)).toThrow(/not an object/);
    expect(() => validateAdvisorJson(5, allowed)).toThrow(/not an object/);
  });
  it('rejects a non-array recommendations field', () => {
    expect(() => validateAdvisorJson({ recommendations: 'x' }, allowed)).toThrow(/missing recommendations/);
  });
  it('rejects more than 5 recommendations but accepts exactly 5 (>5 strict)', () => {
    expect(() => recs(Array.from({ length: 6 }, () => rec()))).toThrow(/exceeds 5/);
    expect(recs(Array.from({ length: 5 }, () => rec()))).toHaveLength(5);
  });
  it('rejects a non-object recommendation entry', () => {
    expect(() => recs([null])).toThrow(/entry is not an object/);
  });
  it('rejects a non-string symbol (treated as out-of-universe)', () => {
    expect(() => recs([rec({ symbol: 5 })])).toThrow(/out-of-universe/);
  });
  it('rejects non-finite / non-number / <1 rank, accepts exactly 1 (rank<1 strict)', () => {
    expect(() => recs([rec({ rank: NaN })])).toThrow(/invalid rank/);
    expect(() => recs([rec({ rank: 'x' })])).toThrow(/invalid rank/);
    expect(() => recs([rec({ rank: 0 })])).toThrow(/invalid rank/);
    expect(recs([rec({ rank: 1 })])[0]!.rank).toBe(1);
  });
  it('rejects empty / non-string / >400 rationale, accepts exactly 400 (>400 strict)', () => {
    expect(() => recs([rec({ rationale: '' })])).toThrow(/empty rationale/);
    expect(() => recs([rec({ rationale: 5 })])).toThrow(/empty rationale/);
    expect(() => recs([rec({ rationale: 'x'.repeat(401) })])).toThrow(/exceeds 400/);
    expect(recs([rec({ rationale: 'x'.repeat(400) })])[0]!.rationale).toHaveLength(400);
  });
  it('rejects non-array / empty / malformed riskFactors, accepts a 200-char one (>200 strict)', () => {
    expect(() => recs([rec({ riskFactors: 'x' })])).toThrow(/no riskFactors/);
    expect(() => recs([rec({ riskFactors: [] })])).toThrow(/no riskFactors/);
    expect(() => recs([rec({ riskFactors: [''] })])).toThrow(/1-200 char/);
    expect(() => recs([rec({ riskFactors: [5] })])).toThrow(/1-200 char/);
    expect(() => recs([rec({ riskFactors: ['x'.repeat(201)] })])).toThrow(/1-200 char/);
    expect(recs([rec({ riskFactors: ['x'.repeat(200), 'y'] })])[0]!.riskFactors).toEqual(['x'.repeat(200), 'y']);
  });
});

describe('advisor constants & prompt (mutation hardening — golden text)', () => {
  it('ADVISOR_DISCLAIMER exact text', () => {
    expect(ADVISOR_DISCLAIMER).toBe(
      '本機能は教育目的の参考情報であり、投資助言ではありません。過去パフォーマンスは将来のリターンを保証しません。実際の売買判断はご自身の責任で行ってください。',
    );
  });
  it('DEFAULT_ADVISOR_UNIVERSE exact list', () => {
    expect(DEFAULT_ADVISOR_UNIVERSE).toEqual(['AAPL', 'MSFT', 'GOOGL', 'AMZN', 'META']);
  });
  it('advisorSystemPrompt golden (full text incl. allowlist interpolation)', () => {
    expect(advisorSystemPrompt(['AAPL', 'MSFT'])).toBe("あなたは株式分析アシスタントです。\nユーザーの質問と、与えられたティッカーのテクニカル分析データに基づいて、\n質問に最も適合する銘柄を最大 5 件、ランク順 (1 が最良) に提案します。\n\n厳守事項:\n- 必ず以下の JSON スキーマで応答 (前後のテキスト・コードフェンス禁止):\n  { \"recommendations\": [{ \"symbol\": \"string\", \"rank\": number, \"rationale\": \"string\", \"riskFactors\": [\"string\"] }] }\n- symbol は必ず次の許可済みリストから選ぶこと: [\"AAPL\", \"MSFT\"]\n- 知らないティッカーや実在しないティッカーを提示してはならない。\n- 具体的な売買タイミング (例: \"今買え\") や具体的な価格予測を含めてはならない。\n- 各 recommendation には必ず riskFactors (1-3 件) を含めること。\n- rationale は 40-160 文字。テクニカル指標を根拠として簡潔に。\n- 過去パフォーマンスは将来を保証しない、という注意を念頭に置く。");
  });
});

describe('dashboard render (golden exact output, mutation hardening)', () => {
  const full = {
    watchlist: [
      { symbol: 'AAPL', label: 'Apple', latestClose: 123.45, changePct: 1.2 },
      { symbol: 'X<', label: 'Y&', latestClose: 10, changePct: -2.5 },
      { symbol: 'Z', label: 'Z', latestClose: 5, changePct: 0 },
    ],
    strategyComparison: {
      symbol: 'AAPL', initialCash: 1000,
      rows: [
        { strategy: 'sma-crossover', finalEquity: 1050.4, totalReturnPct: 5.04, maxDrawdownPct: 2.1, winRate: 0.5, tradeCount: 4 },
        { strategy: 'macd-signal', finalEquity: 980, totalReturnPct: -2, maxDrawdownPct: 3, winRate: 0, tradeCount: 2 },
      ],
      bestByReturn: 'sma-crossover',
    },
    advisor: {
      recommendations: [{ symbol: 'AAPL', rank: 1, rationale: 'strong trend', riskFactors: ['volatility', 'liquidity'] }],
      disclaimer: 'DISC',
      notForRealMoney: true as const,
    },
    generatedAt: '2026-01-31T00:00:00.000Z',
  };
  const empty = { watchlist: [], generatedAt: 'now' };
  const cmpNullBest = { watchlist: [], generatedAt: 'now', strategyComparison: { symbol: 'AAPL', initialCash: 1000, rows: [], bestByReturn: null } };
  it('html full golden (rows +/0/-, comparison, advisor, disclaimer, escaping)', () => {
    expect(renderDashboardHtml(full)).toBe("<!doctype html><html lang=\"ja\"><head><meta charset=\"utf-8\"><title>Stocks ダッシュボード</title></head><body style=\"font-family:sans-serif;padding:24px;background:#0f1117;color:#e6e8ec\"><h1>Stocks ダッシュボード (ブラウザ版・モックデータ)</h1><p>生成: 2026-01-31T00:00:00.000Z</p><h2>ウォッチリスト</h2><table border=\"1\" cellpadding=\"6\" style=\"border-collapse:collapse\"><tr><th>シンボル</th><th>名称</th><th>終値</th><th>前日比</th></tr><tr><td>AAPL</td><td>Apple</td><td style=\"text-align:right\">123.45</td><td style=\"text-align:right;color:#22c55e\">+1.20%</td></tr><tr><td>X&lt;</td><td>Y&amp;</td><td style=\"text-align:right\">10.00</td><td style=\"text-align:right;color:#ef4444\">-2.50%</td></tr><tr><td>Z</td><td>Z</td><td style=\"text-align:right\">5.00</td><td style=\"text-align:right;color:#22c55e\">+0.00%</td></tr></table><h2>戦略比較 — AAPL</h2><table border=\"1\" cellpadding=\"6\" style=\"border-collapse:collapse\"><tr><th>戦略</th><th>最終資産</th><th>リターン%</th><th>最大DD%</th><th>勝率</th><th>取引数</th></tr><tr><td>sma-crossover</td><td style=\"text-align:right\">1050</td><td style=\"text-align:right\">5.04</td><td style=\"text-align:right\">2.10</td><td style=\"text-align:right\">50%</td><td style=\"text-align:right\">4</td></tr><tr><td>macd-signal</td><td style=\"text-align:right\">980</td><td style=\"text-align:right\">-2.00</td><td style=\"text-align:right\">3.00</td><td style=\"text-align:right\">0%</td><td style=\"text-align:right\">2</td></tr></table><p>最良 (リターン基準): sma-crossover</p><h2>アドバイザー</h2><ol><li><b>AAPL</b> — strong trend <i>(リスク: volatility / liquidity)</i></li></ol><p style=\"color:#fbbf24\">DISC</p><p style=\"margin-top:24px;color:#8a93a6;font-size:12px\">本機能は教育目的の参考情報であり、投資助言ではありません。過去パフォーマンスは将来のリターンを保証しません。実際の売買判断はご自身の責任で行ってください。</p></body></html>");
  });
  it('html empty golden (placeholder row, omitted sections)', () => {
    expect(renderDashboardHtml(empty)).toBe("<!doctype html><html lang=\"ja\"><head><meta charset=\"utf-8\"><title>Stocks ダッシュボード</title></head><body style=\"font-family:sans-serif;padding:24px;background:#0f1117;color:#e6e8ec\"><h1>Stocks ダッシュボード (ブラウザ版・モックデータ)</h1><p>生成: now</p><h2>ウォッチリスト</h2><table border=\"1\" cellpadding=\"6\" style=\"border-collapse:collapse\"><tr><th>シンボル</th><th>名称</th><th>終値</th><th>前日比</th></tr><tr><td colspan=\"4\">(登録銘柄なし)</td></tr></table><p style=\"margin-top:24px;color:#8a93a6;font-size:12px\">本機能は教育目的の参考情報であり、投資助言ではありません。過去パフォーマンスは将来のリターンを保証しません。実際の売買判断はご自身の責任で行ってください。</p></body></html>");
  });
  it('html golden with an empty comparison + null bestByReturn (差なし)', () => {
    expect(renderDashboardHtml(cmpNullBest)).toBe("<!doctype html><html lang=\"ja\"><head><meta charset=\"utf-8\"><title>Stocks ダッシュボード</title></head><body style=\"font-family:sans-serif;padding:24px;background:#0f1117;color:#e6e8ec\"><h1>Stocks ダッシュボード (ブラウザ版・モックデータ)</h1><p>生成: now</p><h2>ウォッチリスト</h2><table border=\"1\" cellpadding=\"6\" style=\"border-collapse:collapse\"><tr><th>シンボル</th><th>名称</th><th>終値</th><th>前日比</th></tr><tr><td colspan=\"4\">(登録銘柄なし)</td></tr></table><h2>戦略比較 — AAPL</h2><table border=\"1\" cellpadding=\"6\" style=\"border-collapse:collapse\"><tr><th>戦略</th><th>最終資産</th><th>リターン%</th><th>最大DD%</th><th>勝率</th><th>取引数</th></tr></table><p>最良 (リターン基準): 差なし</p><p style=\"margin-top:24px;color:#8a93a6;font-size:12px\">本機能は教育目的の参考情報であり、投資助言ではありません。過去パフォーマンスは将来のリターンを保証しません。実際の売買判断はご自身の責任で行ってください。</p></body></html>");
  });
  it('markdown full golden', () => {
    expect(renderDashboardMarkdown(full)).toBe("# Stocks ダッシュボード (ブラウザ版・モックデータ)\n\n生成: 2026-01-31T00:00:00.000Z\n\n## ウォッチリスト\n\n| シンボル | 名称 | 終値 | 前日比 |\n| --- | --- | ---: | ---: |\n| AAPL | Apple | 123.45 | +1.20% |\n| X< | Y& | 10.00 | -2.50% |\n| Z | Z | 5.00 | +0.00% |\n\n## 戦略比較 — AAPL\n\n| 戦略 | 最終資産 | リターン% | 最大DD% | 勝率 | 取引数 |\n| --- | ---: | ---: | ---: | ---: | ---: |\n| sma-crossover | 1050 | 5.04 | 2.10 | 50% | 4 |\n| macd-signal | 980 | -2.00 | 3.00 | 0% | 2 |\n\n最良 (リターン基準): sma-crossover\n\n## アドバイザー\n\n1. **AAPL** — strong trend (リスク: volatility / liquidity)\n\n> DISC\n\n---\n\n本機能は教育目的の参考情報であり、投資助言ではありません。過去パフォーマンスは将来のリターンを保証しません。実際の売買判断はご自身の責任で行ってください。");
  });
  it('markdown empty golden', () => {
    expect(renderDashboardMarkdown(empty)).toBe("# Stocks ダッシュボード (ブラウザ版・モックデータ)\n\n生成: now\n\n## ウォッチリスト\n\n| シンボル | 名称 | 終値 | 前日比 |\n| --- | --- | ---: | ---: |\n| (登録銘柄なし) | | | |\n\n---\n\n本機能は教育目的の参考情報であり、投資助言ではありません。過去パフォーマンスは将来のリターンを保証しません。実際の売買判断はご自身の責任で行ってください。");
  });
  it('markdown golden with an empty comparison + null bestByReturn (差なし)', () => {
    expect(renderDashboardMarkdown(cmpNullBest)).toBe("# Stocks ダッシュボード (ブラウザ版・モックデータ)\n\n生成: now\n\n## ウォッチリスト\n\n| シンボル | 名称 | 終値 | 前日比 |\n| --- | --- | ---: | ---: |\n| (登録銘柄なし) | | | |\n\n## 戦略比較 — AAPL\n\n| 戦略 | 最終資産 | リターン% | 最大DD% | 勝率 | 取引数 |\n| --- | ---: | ---: | ---: | ---: | ---: |\n\n最良 (リターン基準): 差なし\n\n---\n\n本機能は教育目的の参考情報であり、投資助言ではありません。過去パフォーマンスは将来のリターンを保証しません。実際の売買判断はご自身の責任で行ってください。");
  });
});

// ===================== mutation hardening — phase 2 (logic boundaries) =====================
const mkc = (closes: readonly number[]): WebCandle[] =>
  closes.map((c, i) => ({ date: `D${i}`, open: c, high: c, low: c, close: c, volume: 1000 }));
// 決定論モックで RSI(14) がちょうど 20 / 30 / 70 / 80 になる 15 本の終値列。
const RSI20 = [100, 101, 102, 101, 100, 99, 98, 97, 96, 95, 94, 94, 94, 94, 94];
const RSI30 = [100, 101, 102, 103, 102, 101, 100, 99, 98, 97, 96, 96, 96, 96, 96];
const RSI70 = [100, 101, 102, 103, 104, 105, 106, 107, 106, 105, 104, 104, 104, 104, 104];
const RSI80 = [100, 101, 102, 103, 104, 105, 106, 107, 108, 107, 106, 106, 106, 106, 106];

describe('strategies (mutation hardening — fields, length & threshold boundaries)', () => {
  it('SMA stamps the strategy name and dates the insufficient-history holdSignal', () => {
    const buy = SMA_CROSSOVER_STRATEGY(mkc([...Array(50).fill(100), 200]));
    expect(buy.strategy).toBe('sma-crossover');
    const insuf = SMA_CROSSOVER_STRATEGY(mkc(Array(50).fill(100)));
    expect(insuf.strategy).toBe('sma-crossover');
    expect(insuf.date).toBe('D49'); // holdSignal uses candles[candles.length - 1]
  });
  it('MACD / RSI strategies stamp their names', () => {
    expect(MACD_SIGNAL_STRATEGY(mockCandles('AAG', NOW, 120)).strategy).toBe('macd-signal');
    expect(RSI_MEAN_REVERSION_STRATEGY(mockCandles('AAB', NOW, 120)).strategy).toBe('rsi-mean-reversion');
  });
  it('RSI proceeds at exactly 15 candles and holds at exactly RSI 30 (< 15 and < 30 strict)', () => {
    const sig = RSI_MEAN_REVERSION_STRATEGY(mkc(RSI30));
    expect(sig.reason).not.toMatch(/insufficient/);
    expect(sig.action).toBe('hold');
  });
  it('RSI holds at exactly RSI 70 (> 70 strict)', () => {
    expect(RSI_MEAN_REVERSION_STRATEGY(mkc(RSI70)).action).toBe('hold');
  });
  it('RSI buy confidence uses (30 - v) / 30 (v=20 → 1/3)', () => {
    const sig = RSI_MEAN_REVERSION_STRATEGY(mkc(RSI20));
    expect(sig.action).toBe('buy');
    expect(sig.confidence).toBeCloseTo(1 / 3, 6);
  });
  it('MACD proceeds at exactly 35 candles (< 35 strict)', () => {
    expect(MACD_SIGNAL_STRATEGY(mkc(Array(35).fill(100))).reason).not.toMatch(/insufficient/);
  });
});

describe('bollinger (mutation hardening)', () => {
  it('throws its own message for period<=0 (not delegated to sma)', () => {
    expect(() => bollingerBands([1, 2], 0, 2)).toThrow(/bollingerBands: period/);
  });
});

describe('backtest (mutation hardening — averaging, win/loss, valuation)', () => {
  const buyAt = (...lens: number[]): Strategy => (c) =>
    lens.includes(c.length)
      ? { date: c[c.length - 1]!.date, action: 'buy', confidence: 1, reason: 'b', strategy: 't' }
      : { date: c[c.length - 1]?.date ?? '', action: 'hold', confidence: 0, reason: 'h', strategy: 't' };

  it('averages cost across two buys, affecting the later exit (exact P&L)', () => {
    const candles = mkc([...Array(51).fill(100), 110, 100, 200]);
    expect(backtest(candles, buyAt(51, 52), 10_000)).toEqual({
      finalEquity: 11_720, totalReturnPct: 17.2, maxDrawdownPct: 1.782178217821782, winRate: 1, tradeCount: 3,
    });
  });
  it('buys and holds to the end, valuing the open position at the last close', () => {
    const r = backtest(mkc([...Array(51).fill(100), 100, 100, 100]), buyAt(51), 10_000);
    expect(r.finalEquity).toBe(10_000); // cash 9000 + 10 shares * 100
    expect(r.tradeCount).toBe(1);
    expect(r.winRate).toBe(0);
    expect(r.maxDrawdownPct).toBe(0);
  });
  it('counts a sell at exactly the buy price as a loss (win check is strict >)', () => {
    const buyThenSell: Strategy = (c) =>
      c.length === 51
        ? { date: c[c.length - 1]!.date, action: 'buy', confidence: 1, reason: 'b', strategy: 't' }
        : c.length === 52
          ? { date: c[c.length - 1]!.date, action: 'sell', confidence: 1, reason: 's', strategy: 't' }
          : { date: c[c.length - 1]?.date ?? '', action: 'hold', confidence: 0, reason: 'h', strategy: 't' };
    const r = backtest(mkc([...Array(51).fill(100), 100, 100]), buyThenSell, 10_000);
    expect(r.tradeCount).toBe(2);
    expect(r.winRate).toBe(0);
  });
});

describe('compareStrategies (mutation hardening — bestByReturn positive case)', () => {
  it('selects the positive-return strategy as bestByReturn (AAA → macd-signal)', () => {
    const r = compareStrategies('AAA', 1_000_000, NOW);
    expect(r.bestByReturn).toBe('macd-signal');
    const m = r.rows.find((x) => x.strategy === 'macd-signal')!;
    expect(m.totalReturnPct).toBeCloseTo(2.514754, 4);
    expect(m.tradeCount).toBe(6);
    expect(m.winRate).toBeCloseTo(2 / 3, 6);
  });
});

describe('buildTickerAnalysis (mutation hardening — changePct & rsiSignal branches)', () => {
  it('changePct is 0 when the previous close is 0 (avoids /0; prev.close>0 strict)', () => {
    expect(buildTickerAnalysis('X', 'X', mkc([0, 110])).changePct).toBe(0);
  });
  it('rsiSignal: oversold (<30), neutral at exactly 30/70, overbought (>70), neutral when unavailable', () => {
    const sig = (closes: readonly number[]) => buildTickerAnalysis('X', 'X', mkc(closes)).rsiSignal;
    expect(sig(RSI20)).toBe('oversold');
    expect(sig(RSI30)).toBe('neutral');
    expect(sig(RSI70)).toBe('neutral');
    expect(sig(RSI80)).toBe('overbought');
    expect(sig([100, 101])).toBe('neutral'); // rsi unavailable → neutral
  });
});

// ===================== mutation hardening — phase 3 (境界の厳密化) =====================
describe('strategies — 単調トレンドではクロス無しで hold (sub-condition load-bearing)', () => {
  it('SMA: 単調下降では death cross にならず hold', () => {
    // `f1 >= s1` を true 固定する mutant は「f0<s0 なら常に sell」になるため、下降継続で kill。
    const sig = SMA_CROSSOVER_STRATEGY(mkCandles(Array.from({ length: 60 }, (_, i) => 200 - i)));
    expect(sig.action).toBe('hold');
    expect(sig.reason).toBe('no crossover');
  });
  it('MACD: 単調下降では death cross にならず hold', () => {
    const sig = MACD_SIGNAL_STRATEGY(mkCandles(Array.from({ length: 60 }, (_, i) => 200 - i)));
    expect(sig.action).toBe('hold');
    expect(sig.reason).toBe('no crossover');
  });
});

describe('backtest — stop-loss / take-profit のちょうど閾値 (>= は strict ではない)', () => {
  const buyAt = (...lens: number[]): Strategy => (c) =>
    lens.includes(c.length)
      ? { date: c[c.length - 1]!.date, action: 'buy', confidence: 1, reason: 'b', strategy: 't' }
      : { date: c[c.length - 1]?.date ?? '', action: 'hold', confidence: 0, reason: 'h', strategy: 't' };
  it('ちょうど -5% で損切りが発火する (dropPct >= stopLossPct)', () => {
    // `>=` を `>` にする mutant はちょうど 5% で発火せず取引が 1 件に減るため kill。
    const r = backtest(mkCandles([...Array(51).fill(100), 95, 95]), buyAt(51), 10_000);
    expect(r.tradeCount).toBe(2);
    expect(r.finalEquity).toBe(9_950);
  });
  it('ちょうど +15% で利確が発火する (gainPct >= takeProfitPct)', () => {
    const r = backtest(mkCandles([...Array(51).fill(100), 115, 115]), buyAt(51), 10_000);
    expect(r.tradeCount).toBe(2);
    expect(r.winRate).toBe(1);
    expect(r.finalEquity).toBe(10_150);
  });
});

describe('validateAdvisorJson — 非オブジェクト item', () => {
  it('数値の recommendation entry を弾く (typeof item !== object の分岐)', () => {
    expect(() => validateAdvisorJson({ recommendations: [5] }, new Set(['AAPL']))).toThrow(/entry is not an object/);
  });
});

// ===================== mutation hardening — phase 4 (最終残課題) =====================
describe('MACD death cross の sub-condition (m0 < s0)', () => {
  it('MACD が signal の下にあり続ける hold では death と誤判定しない (AAD: m1<s1)', () => {
    // `m1 >= s1` を true 固定する mutant は m0<s0 のとき sell にしてしまう。m1<s1 かつ
    // m0<s0 で hold になる銘柄 AAD で kill (単調下降は m1==s1 に収束し届かない)。
    const sig = MACD_SIGNAL_STRATEGY(mockCandles('AAD', NOW, 120));
    expect(sig.action).toBe('hold');
  });
});

describe('dashboard html — 複数 advisor 推奨 (join 区切りの golden)', () => {
  it('2 件の推奨を区切り無し(join(\'\'))で連結する', () => {
    // 推奨が 1 件だと join 区切りが観測されないため、2 件で exact 出力を固定。
    const html = renderDashboardHtml({
      watchlist: [], generatedAt: 'now',
      advisor: {
        recommendations: [
          { symbol: 'AAPL', rank: 1, rationale: 'r1', riskFactors: ['x'] },
          { symbol: 'MSFT', rank: 2, rationale: 'r2', riskFactors: ['y'] },
        ],
        disclaimer: 'D', notForRealMoney: true,
      },
    });
    expect(html).toBe("<!doctype html><html lang=\"ja\"><head><meta charset=\"utf-8\"><title>Stocks ダッシュボード</title></head><body style=\"font-family:sans-serif;padding:24px;background:#0f1117;color:#e6e8ec\"><h1>Stocks ダッシュボード (ブラウザ版・モックデータ)</h1><p>生成: now</p><h2>ウォッチリスト</h2><table border=\"1\" cellpadding=\"6\" style=\"border-collapse:collapse\"><tr><th>シンボル</th><th>名称</th><th>終値</th><th>前日比</th></tr><tr><td colspan=\"4\">(登録銘柄なし)</td></tr></table><h2>アドバイザー</h2><ol><li><b>AAPL</b> — r1 <i>(リスク: x)</i></li><li><b>MSFT</b> — r2 <i>(リスク: y)</i></li></ol><p style=\"color:#fbbf24\">D</p><p style=\"margin-top:24px;color:#8a93a6;font-size:12px\">本機能は教育目的の参考情報であり、投資助言ではありません。過去パフォーマンスは将来のリターンを保証しません。実際の売買判断はご自身の責任で行ってください。</p></body></html>");
  });
});
