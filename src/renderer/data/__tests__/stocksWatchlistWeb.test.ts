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
  it('accepts exactly 16 chars (upper length boundary)', () => {
    expect(isSafeSymbol('A'.repeat(16))).toBe(true);
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

  it('reports the added vs already-present message with the running count', () => {
    expect(registerSymbol('AAPL').message).toBe('AAPL をウォッチリストに追加しました (計 1 件)');
    expect(registerSymbol('AAPL').message).toBe('AAPL は既にウォッチリストにあります (計 1 件)');
    expect(registerSymbol('MSFT').message).toBe('MSFT をウォッチリストに追加しました (計 2 件)');
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

  it('reports the removed vs absent message with the running count', () => {
    registerSymbol('AAPL');
    registerSymbol('MSFT');
    expect(unregisterSymbol('AAPL').message).toBe('AAPL をウォッチリストから削除しました (計 1 件)');
    expect(unregisterSymbol('AAPL').message).toBe('AAPL はウォッチリストにありません');
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
  it('matches a golden 3-candle series (pins seed, PRNG, OHLCV formulas)', () => {
    expect(mockCandles('AAPL', NOW, 3)).toEqual([
      { date: '2026-01-29', open: 920, high: 923.85, low: 911.62, close: 922.46, volume: 515433 },
      { date: '2026-01-30', open: 922.46, high: 930.1, low: 909.59, close: 912.15, volume: 205335 },
      { date: '2026-01-31', open: 912.15, high: 912.51, low: 895.44, close: 904.03, volume: 269705 },
    ]);
  });
  it('spans the date range and clamps periods to a positive integer', () => {
    const c30 = mockCandles('AAPL', NOW, 30);
    expect(c30[0]!.date).toBe('2026-01-02'); // now − 29 日
    expect(c30[29]!.date).toBe('2026-01-31');
    expect(mockCandles('AAPL', NOW, 0)).toHaveLength(1); // Math.max(1, …)
    expect(mockCandles('AAPL', NOW, 2.9)).toHaveLength(2); // Math.floor
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
  it('maps changePct to buy/sell/hold at the ±1% thresholds', () => {
    // 決定論的なモックの changePct: AAPL=-1.75(sell) / INTC=+1.45(buy) / META=-1.0(境界=hold)
    const sell = buildWatchlistItem('AAPL', NOW);
    expect([sell.changePct, sell.signal.action]).toEqual([-1.75, 'sell']);
    const buy = buildWatchlistItem('INTC', NOW);
    expect([buy.changePct, buy.signal.action]).toEqual([1.45, 'buy']);
    const hold = buildWatchlistItem('META', NOW);
    expect([hold.changePct, hold.signal.action]).toEqual([-1, 'hold']); // -1 は < -1 でないため hold
    expect(sell.signal.confidence).toBe(0.5);
    expect(sell.signal.reason).toMatch(/モックデータ/);
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
