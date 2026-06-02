/** @vitest-environment jsdom */
import { beforeEach, describe, expect, it } from 'vitest';
import {
  STOCKS_WATCHLIST_KEY,
  isSafeSymbol,
  loadWatchlistSymbols,
  registerSymbol,
  unregisterSymbol,
  buildWatchlistItem,
  buildStocksSnapshot,
  mockCandles,
} from '../stocksWatchlistWeb';

beforeEach(() => {
  localStorage.clear();
});

describe('isSafeSymbol', () => {
  it('accepts JP / US / index symbols', () => {
    expect(isSafeSymbol('AAPL')).toBe(true);
    expect(isSafeSymbol('7203.T')).toBe(true);
    expect(isSafeSymbol('^N225')).toBe(true);
  });
  it('rejects empty, too long, unsafe, or non-string', () => {
    expect(isSafeSymbol('')).toBe(false);
    expect(isSafeSymbol('A'.repeat(17))).toBe(false);
    expect(isSafeSymbol('AA PL')).toBe(false);
    expect(isSafeSymbol('rm -rf')).toBe(false);
    expect(isSafeSymbol(123)).toBe(false);
    expect(isSafeSymbol(null)).toBe(false);
  });
});

describe('registerSymbol', () => {
  it('adds a new symbol (uppercased) and persists it', () => {
    const r = registerSymbol('aapl');
    expect(r.added).toBe(true);
    expect(r.symbol).toBe('AAPL');
    expect(r.watchlist).toEqual(['AAPL']);
    expect(loadWatchlistSymbols()).toEqual(['AAPL']);
    expect(JSON.parse(localStorage.getItem(STOCKS_WATCHLIST_KEY)!)).toEqual(['AAPL']);
  });

  it('is idempotent for an already-registered symbol', () => {
    registerSymbol('AAPL');
    const again = registerSymbol('aapl');
    expect(again.added).toBe(false);
    expect(again.watchlist).toEqual(['AAPL']);
    expect(loadWatchlistSymbols()).toEqual(['AAPL']);
  });

  it('keeps multiple symbols in insertion order', () => {
    registerSymbol('AAPL');
    registerSymbol('7203.T');
    const r = registerSymbol('^N225');
    expect(r.watchlist).toEqual(['AAPL', '7203.T', '^N225']);
  });

  it('throws on an invalid symbol', () => {
    expect(() => registerSymbol('bad symbol')).toThrow(/symbol must be/);
    expect(loadWatchlistSymbols()).toEqual([]);
  });
});

describe('unregisterSymbol', () => {
  it('removes a registered symbol', () => {
    registerSymbol('AAPL');
    registerSymbol('MSFT');
    const r = unregisterSymbol('aapl');
    expect(r.removed).toBe(true);
    expect(r.watchlist).toEqual(['MSFT']);
    expect(loadWatchlistSymbols()).toEqual(['MSFT']);
  });

  it('reports removed=false for an absent symbol', () => {
    registerSymbol('AAPL');
    const r = unregisterSymbol('TSLA');
    expect(r.removed).toBe(false);
    expect(r.watchlist).toEqual(['AAPL']);
  });

  it('throws on an invalid symbol', () => {
    expect(() => unregisterSymbol('x'.repeat(20))).toThrow(/symbol must be/);
  });
});

describe('loadWatchlistSymbols', () => {
  it('returns [] when nothing is stored', () => {
    expect(loadWatchlistSymbols()).toEqual([]);
  });
  it('ignores corrupt JSON', () => {
    localStorage.setItem(STOCKS_WATCHLIST_KEY, '{not json');
    expect(loadWatchlistSymbols()).toEqual([]);
  });
  it('filters out unsafe entries and dedupes (uppercased)', () => {
    localStorage.setItem(STOCKS_WATCHLIST_KEY, JSON.stringify(['aapl', 'AAPL', 'bad sym', 42]));
    expect(loadWatchlistSymbols()).toEqual(['AAPL']);
  });
});

describe('mockCandles', () => {
  const NOW = Date.UTC(2026, 0, 31);
  it('is deterministic for the same symbol + now', () => {
    expect(mockCandles('AAPL', NOW)).toEqual(mockCandles('AAPL', NOW));
  });
  it('differs across symbols', () => {
    expect(mockCandles('AAPL', NOW)).not.toEqual(mockCandles('MSFT', NOW));
  });
  it('produces 30 valid candles (high >= low, positive prices, dated)', () => {
    const candles = mockCandles('7203.T', NOW);
    expect(candles).toHaveLength(30);
    for (const c of candles) {
      expect(c.high).toBeGreaterThanOrEqual(c.low);
      expect(c.close).toBeGreaterThan(0);
      expect(c.volume).toBeGreaterThan(0);
      expect(c.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
    expect(candles[candles.length - 1]!.date).toBe('2026-01-31');
  });
});

describe('buildWatchlistItem', () => {
  const NOW = Date.UTC(2026, 0, 31);
  it('derives latest/previous close and a signal from the candles', () => {
    const item = buildWatchlistItem('AAPL', NOW);
    const candles = mockCandles('AAPL', NOW);
    expect(item.symbol).toBe('AAPL');
    expect(item.label).toBe('AAPL');
    expect(item.latestClose).toBe(candles[candles.length - 1]!.close);
    expect(item.previousClose).toBe(candles[candles.length - 2]!.close);
    expect(['buy', 'sell', 'hold']).toContain(item.signal.action);
    expect(item.signal.strategy).toBe('browser-mock');
    expect(item.candles).toHaveLength(30);
  });
});

describe('buildStocksSnapshot', () => {
  const NOW = Date.UTC(2026, 0, 31);
  it('returns an empty watchlist when none registered', () => {
    const snap = buildStocksSnapshot(NOW);
    expect(snap.watchlist).toEqual([]);
    expect(snap.isMock).toBe(true);
    expect(snap.portfolio.cash).toBe(1_000_000);
  });
  it('builds one watchlist item per registered symbol', () => {
    registerSymbol('AAPL');
    registerSymbol('7203.T');
    const snap = buildStocksSnapshot(NOW);
    expect(snap.watchlist.map((w) => w.symbol)).toEqual(['AAPL', '7203.T']);
    expect(snap.watchlist[0]!.candles).toHaveLength(30);
  });
});
