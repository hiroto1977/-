/**
 * ブラウザ版の「銘柄登録 (stocks/register-ticker)」サポート。
 *
 * Electron 版では register-ticker / unregister-ticker は main プロセスが
 * `~/.local/business-hub/state.json` にウォッチリストを永続化し、再フェッチで
 * 価格付きの watchlist を返す。ブラウザ版には Node fs もバックエンドも無いため、
 * ここでは登録銘柄を localStorage に保存し、`fetchSnapshot('stocks')` 相当の
 * スナップショットを (決定論的なモック価格で) 合成する。
 *
 * これにより、ブラウザ版でも「登録」ボタンが動作し、登録した銘柄が
 * ウォッチリストに表示される (Electron 版と同じ操作感)。価格は実データでは
 * なくモックで、isMock: true を立てている。
 *
 * web-shim から使う想定で、ここは純粋ロジックのみ (vault / library 等の
 * ブラウザ専用依存を持たない) なので単体テストできる。
 */

export const STOCKS_WATCHLIST_KEY = 'stocks.watchlist';

/** Electron 版 `isSafeSymbol` と同じ規則。1-16 文字の [A-Za-z0-9.-^]。
 *  JP の TSE コード (`7203.T`)、US ティッカー (`AAPL`)、指数 (`^N225`) を許可。 */
export function isSafeSymbol(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  if (value.length === 0 || value.length > 16) return false;
  return /^[A-Za-z0-9.\-^]+$/.test(value);
}

// --- 型 (snapshot.ts / StocksPage の stocks 形状に一致) -------------------

export interface WebCandle {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface WebSignal {
  date: string;
  action: 'buy' | 'sell' | 'hold';
  confidence: number;
  reason: string;
  strategy: string;
}

export interface WebWatchlistItem {
  symbol: string;
  label: string;
  latestClose: number;
  previousClose: number;
  changePct: number;
  signal: WebSignal;
  candles: WebCandle[];
}

export interface WebStocksSnapshot {
  watchlist: WebWatchlistItem[];
  portfolio: {
    cash: number;
    initialCash: number;
    positions: Record<string, { shares: number; avgCost: number }>;
    history: unknown[];
  };
  fetchedAt: string;
  isMock: boolean;
}

// --- localStorage 永続化 -------------------------------------------------

/** 保存済みの登録シンボル一覧を読む。壊れていれば空配列。 */
export function loadWatchlistSymbols(): string[] {
  try {
    const raw = localStorage.getItem(STOCKS_WATCHLIST_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    // 念のため再検証し、重複を除いて正規化する。
    const seen = new Set<string>();
    const out: string[] = [];
    for (const v of parsed) {
      if (isSafeSymbol(v)) {
        const u = v.toUpperCase();
        if (!seen.has(u)) {
          seen.add(u);
          out.push(u);
        }
      }
    }
    return out;
  } catch {
    return [];
  }
}

function saveWatchlistSymbols(list: readonly string[]): void {
  localStorage.setItem(STOCKS_WATCHLIST_KEY, JSON.stringify(list));
}

// --- 登録 / 解除 (Electron 版アクションと同じ戻り値の形) ------------------

export interface RegisterResult {
  symbol: string;
  added: boolean;
  watchlist: readonly string[];
  message: string;
}

export interface UnregisterResult {
  symbol: string;
  removed: boolean;
  watchlist: readonly string[];
  message: string;
}

/** 銘柄を登録する。無効なシンボルは throw (web-shim 側で action_failed に変換)。 */
export function registerSymbol(symbol: unknown): RegisterResult {
  if (!isSafeSymbol(symbol)) {
    throw new Error('symbol must be 1-16 chars from [A-Za-z0-9.-^]');
  }
  const upper = symbol.toUpperCase();
  const current = loadWatchlistSymbols();
  const wasAlreadyThere = current.includes(upper);
  const next = wasAlreadyThere ? current : [...current, upper];
  if (!wasAlreadyThere) saveWatchlistSymbols(next);
  return {
    symbol: upper,
    added: !wasAlreadyThere,
    watchlist: next,
    message: wasAlreadyThere
      ? `${upper} は既にウォッチリストにあります (計 ${next.length} 件)`
      : `${upper} をウォッチリストに追加しました (計 ${next.length} 件)`,
  };
}

/** 銘柄を解除する。 */
export function unregisterSymbol(symbol: unknown): UnregisterResult {
  if (!isSafeSymbol(symbol)) {
    throw new Error('symbol must be 1-16 chars from [A-Za-z0-9.-^]');
  }
  const upper = symbol.toUpperCase();
  const current = loadWatchlistSymbols();
  const wasThere = current.includes(upper);
  const next = current.filter((s) => s !== upper);
  if (wasThere) saveWatchlistSymbols(next);
  return {
    symbol: upper,
    removed: wasThere,
    watchlist: next,
    message: wasThere
      ? `${upper} をウォッチリストから削除しました (計 ${next.length} 件)`
      : `${upper} はウォッチリストにありません`,
  };
}

// --- 決定論的モック価格生成 ----------------------------------------------

const MOCK_DAYS = 30;

/** シンボル文字列から決定論的な 32bit シードを作る (FNV-1a)。 */
function seedFromSymbol(symbol: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < symbol.length; i++) {
    h ^= symbol.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/** mulberry32 — 小さな決定論的 PRNG。 */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** `daysAgo` 日前の YYYY-MM-DD (UTC ベース、`now` を注入可能でテスト可能)。 */
function isoDaysAgo(daysAgo: number, now: number): string {
  const d = new Date(now - daysAgo * 24 * 60 * 60 * 1000);
  return d.toISOString().slice(0, 10);
}

/** シンボルに対する決定論的なモック・ローソク足 (ランダムウォーク)。
 *  `periods` 本生成する (既定 30: ウォッチリストのスパークライン用)。
 *  バックテスト等はより長い履歴 (例 120) を要求する。 */
export function mockCandles(
  symbol: string,
  now: number = Date.now(),
  periods: number = MOCK_DAYS,
): WebCandle[] {
  const n = Math.max(1, Math.floor(periods));
  const rng = mulberry32(seedFromSymbol(symbol));
  let price = 80 + Math.floor(rng() * 920); // 80–999 の初期値
  const candles: WebCandle[] = [];
  for (let i = 0; i < n; i++) {
    const open = price;
    const drift = (rng() - 0.48) * 0.04; // おおむね ±2%
    const close = Math.max(1, round2(open * (1 + drift)));
    const high = round2(Math.max(open, close) * (1 + rng() * 0.01));
    const low = round2(Math.min(open, close) * (1 - rng() * 0.01));
    const volume = 100_000 + Math.floor(rng() * 900_000);
    candles.push({
      date: isoDaysAgo(n - 1 - i, now),
      open: round2(open),
      high,
      low,
      close,
      volume,
    });
    price = close;
  }
  return candles;
}

/** 1 シンボルのウォッチリスト項目 (モック価格つき) を組み立てる。 */
export function buildWatchlistItem(symbol: string, now: number = Date.now()): WebWatchlistItem {
  const candles = mockCandles(symbol, now);
  const last = candles[candles.length - 1]!;
  const prev = candles[candles.length - 2] ?? last;
  const changePct = prev.close === 0 ? 0 : round2(((last.close - prev.close) / prev.close) * 100);
  const action: WebSignal['action'] = changePct > 1 ? 'buy' : changePct < -1 ? 'sell' : 'hold';
  return {
    symbol,
    label: symbol,
    latestClose: last.close,
    previousClose: prev.close,
    changePct,
    signal: {
      date: last.date,
      action,
      confidence: 0.5,
      reason: 'ブラウザ版の簡易シグナル（実際の市場価格ではなくモックデータです）',
      strategy: 'browser-mock',
    },
    candles,
  };
}

/** Electron 版 `fetchSnapshot('stocks')` 相当のスナップショットを合成する。
 *  ウォッチリストは localStorage の登録銘柄から構築する。 */
export function buildStocksSnapshot(now: number = Date.now()): WebStocksSnapshot {
  const symbols = loadWatchlistSymbols();
  return {
    watchlist: symbols.map((s) => buildWatchlistItem(s, now)),
    portfolio: {
      cash: 1_000_000,
      initialCash: 1_000_000,
      positions: {},
      history: [],
    },
    fetchedAt: new Date(now).toISOString(),
    isMock: true,
  };
}
