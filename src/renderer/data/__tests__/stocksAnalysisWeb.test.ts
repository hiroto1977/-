import { describe, expect, it } from 'vitest';
import {
  sma,
  rsi,
  macd,
  STRATEGIES,
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
} from '../stocksAnalysisWeb';
import { mockCandles } from '../stocksWatchlistWeb';

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
});

describe('STRATEGIES', () => {
  it('has the three built-in strategies', () => {
    expect(Object.keys(STRATEGIES).sort()).toEqual(['macd-signal', 'rsi-mean-reversion', 'sma-crossover']);
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
});
