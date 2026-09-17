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

import { round2 } from '../../shared/num';
import { isoDateFromTimestamp, parseTimestamp } from '../../shared/isoDate';
import type { RegisterResult, UnregisterResult } from '../../shared/stocksTypes';
import {
  isSafeSymbol,
  readStoredWatchlist,
  symbolsOrEmpty,
  watchlistStoredNote,
  type StoredWatchlist,
} from '../../shared/watchlistState';

// 戻り値の形は shared/stocksTypes.ts が 1 つだけ持つ (パス 117)。
export type { RegisterResult, UnregisterResult } from '../../shared/stocksTypes';
// 銘柄コードの規則も shared が 1 つだけ持つ (パス 309 まで Electron 版と「同じ規則」の写しがここに在った)。
export { isSafeSymbol } from '../../shared/watchlistState';

export const STOCKS_WATCHLIST_KEY = 'stocks.watchlist';

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
  /** 保存先から何が読めたか (パス 309)。デスクトップ版の `StocksSnapshot` と同じ 2 欄。 */
  stored: StoredWatchlist['kind'];
  storedNote: string | null;
}

// --- localStorage 永続化 -------------------------------------------------

/**
 * 保存先を読む —— 「まだ無い」「読めなかった」「保存した (落とした件数つき)」を混ぜない (パス 309)。
 *
 * 2026-09-17 まで `catch { return [] }` で全部を空に畳んでいた: 壊れた保存値で一覧は空になり、
 * 画面は「初期状態（登録なし）では一覧は空です」と言い、次の登録が `[新しい 1 件]` で上書きした。
 * 判定は shared の同じ関数 (デスクトップ版の `state.json` と同じ 1 つ)。
 */
export function readWatchlist(): StoredWatchlist {
  try {
    return readStoredWatchlist(localStorage.getItem(STOCKS_WATCHLIST_KEY));
  } catch (e) {
    // Web Storage そのものが拒む環境 (パス 89) —— 「読めなかった」として理由を運ぶ。
    return { kind: 'unreadable', reason: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * 助言の対象を組む側の読み (web-shim の `callStocksAdvisor`)。画面が送る universe が優先で、
 * 保存値は補助 (パス 105) —— 読めなければ空として既定の主要銘柄に倒す。倒す場所は shared の 1 つ。
 */
export function loadWatchlistSymbols(): string[] {
  return [...symbolsOrEmpty(readWatchlist())];
}

function saveWatchlistSymbols(list: readonly string[]): void {
  localStorage.setItem(STOCKS_WATCHLIST_KEY, JSON.stringify(list));
}

// --- 登録 / 解除 (Electron 版アクションと同じ戻り値の形 —— 型は shared/stocksTypes.ts) ----

/** 銘柄を登録する。無効なシンボルは throw (web-shim 側で action_failed に変換)。 */
export function registerSymbol(symbol: unknown): RegisterResult {
  if (!isSafeSymbol(symbol)) {
    throw new Error('symbol must be 1-16 chars from [A-Za-z0-9.-^]');
  }
  const upper = symbol.toUpperCase();
  // 読めなかった保存値は空として扱う (明示の操作は警告のうえ通す —— shared の `symbolsOrEmpty` の注記)。
  const current = symbolsOrEmpty(readWatchlist());
  const wasAlreadyThere = current.includes(upper);
  const next = wasAlreadyThere ? current : [...current, upper];
  // 既存登録時は next===current で保存しても localStorage 内容は不変のため、この
  // 条件を true 固定する変異 (常に保存) は equivalent。
  // Stryker disable next-line ConditionalExpression
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
  const current = symbolsOrEmpty(readWatchlist());
  const wasThere = current.includes(upper);
  const next = current.filter((s) => s !== upper);
  // 未登録時は next===current で保存しても localStorage 内容は不変のため、この
  // 条件を true 固定する変異 (常に保存) は equivalent。
  // Stryker disable next-line ConditionalExpression
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

/**
 * `daysAgo` 日前の YYYY-MM-DD (UTC ベース、`now` を注入可能でテスト可能)。
 *
 * **`toISOString()` は範囲外で投げる**ので共有の判定を通す (パス 188)。
 * 今日 `now` に来るのは `Date.now()` だけなので到達はしない —— 床である。
 */
function isoDaysAgo(daysAgo: number, now: number): string {
  return isoDateFromTimestamp(now - daysAgo * 24 * 60 * 60 * 1000) ?? '';
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
  // mockCandles の close は Math.max(1, …) で常に >=1 のため prev.close===0 は到達不能。
  // この除算ガードを false 固定する変異は equivalent (常に計算され結果不変)。
  // Stryker disable next-line ConditionalExpression
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
  // 読めなかったときも一覧は空だが、`storedNote` がそう言う (パス 309)。
  const stored = readWatchlist();
  const symbols = symbolsOrEmpty(stored);
  return {
    watchlist: symbols.map((s) => buildWatchlistItem(s, now)),
    portfolio: {
      cash: 1_000_000,
      initialCash: 1_000_000,
      positions: {},
      history: [],
    },
    fetchedAt: parseTimestamp(now)?.toISOString() ?? '',
    isMock: true,
    stored: stored.kind,
    storedNote: watchlistStoredNote(stored, 'empty'),
  };
}
