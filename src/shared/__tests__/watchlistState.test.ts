/**
 * 銘柄のウォッチリストの保存値 —— 「保存した」「まだ無い」「読めなかった」を混ぜず、読み込みで落とした
 * 件数を言う (2026-09-17 · パス 309。チームレーダーのパス 120・人材育成のパス 121 と同じ形の 4 つ目)。
 *
 * それまで main は `catch { return DEFAULT_STATE }`、ブラウザ版は `catch { return [] }` で、壊れた保存値を
 * 「まだ無い」に畳んでいた —— 画面は「初期状態（登録なし）」と言い、次の登録が保存値を 1 件で上書きした。
 */
import { describe, expect, it } from 'vitest';
import {
  WATCHLIST_UNREADABLE,
  droppedWatchlistNote,
  isSafeSymbol,
  readStoredWatchlist,
  symbolsOrEmpty,
  unreadableWatchlistNote,
  watchlistStoredNote,
} from '../watchlistState';
import { MAX_TICKER_CHARS } from '../advisorQuestionLimits';

describe('isSafeSymbol — 両ビルドが読む 1 つの規則 (パス 309 まで写しが 2 つ)', () => {
  it.each(['AAPL', '7203.T', '^N225', 'BRK-B', 'a'])('通す: %s', (s) => {
    expect(isSafeSymbol(s)).toBe(true);
  });

  it.each(['', 'bad symbol', 'BAD;rm', 'over_underscore', '../x', 'A\u0000B', 'AAPL\n', '日経'])('弾く: %j', (s) => {
    expect(isSafeSymbol(s)).toBe(false);
  });

  it('文字列でない物を弾く', () => {
    for (const v of [42, null, undefined, {}, ['AAPL'], true]) expect(isSafeSymbol(v)).toBe(false);
  });

  it(`天井は MAX_TICKER_CHARS (${MAX_TICKER_CHARS}) 字 —— ちょうどは通し、1 字超は弾く`, () => {
    expect(isSafeSymbol('A'.repeat(MAX_TICKER_CHARS))).toBe(true);
    expect(isSafeSymbol('A'.repeat(MAX_TICKER_CHARS + 1))).toBe(false);
  });
});

describe('readStoredWatchlist — 3 つの状態を混ぜない', () => {
  it('null (保存が無い) は「まだ無い」', () => {
    expect(readStoredWatchlist(null)).toEqual({ kind: 'none' });
  });

  it('デスクトップ版の包み `{ watchlist: [...] }` を読む', () => {
    expect(readStoredWatchlist(JSON.stringify({ watchlist: ['AAPL', 'MSFT'] }))).toEqual({
      kind: 'saved',
      symbols: ['AAPL', 'MSFT'],
      dropped: 0,
    });
  });

  it('ブラウザ版の包み (裸の配列) を読む', () => {
    expect(readStoredWatchlist(JSON.stringify(['AAPL', '7203.T']))).toEqual({
      kind: 'saved',
      symbols: ['AAPL', '7203.T'],
      dropped: 0,
    });
  });

  it('★ JSON でない → 理由つきで「読めなかった」(パス 309 までは両ビルドとも黙って空)', () => {
    expect(readStoredWatchlist('{壊れた')).toEqual({ kind: 'unreadable', reason: 'JSON として読めません' });
    // 文言は定数 —— 壊れ方 (V8 の引用) で画面の文が変わらない。
    expect(readStoredWatchlist('not json at all')).toEqual({ kind: 'unreadable', reason: WATCHLIST_UNREADABLE.notJson });
  });

  it('★ 形が違う (数・文字列・null・真偽の根、watchlist が配列でない) → 「読めなかった」', () => {
    for (const raw of [
      '42',
      '"AAPL"',
      'null',
      'true',
      JSON.stringify({ watchlist: 'AAPL' }),
      JSON.stringify({ watchlist: null }),
      JSON.stringify({ watchlist: { AAPL: true } }),
    ]) {
      expect(readStoredWatchlist(raw), raw).toEqual({ kind: 'unreadable', reason: 'ウォッチリストの形ではありません' });
    }
  });

  it('文字列は反復できるが配列ではない —— "AAPL" を [A, P, L] に展開しない (対照)', () => {
    const r = readStoredWatchlist('"AAPL"');
    expect(r.kind).toBe('unreadable');
  });

  it('watchlist の欄が無いオブジェクトは古い版の空 (「読めなかった」ではない)', () => {
    expect(readStoredWatchlist(JSON.stringify({ unrelated: 'data' }))).toEqual({ kind: 'saved', symbols: [], dropped: 0 });
    expect(readStoredWatchlist('{}')).toEqual({ kind: 'saved', symbols: [], dropped: 0 });
  });

  it('★ 銘柄コードでない要素は落として数える (重複は 1 つに畳むが、落とした数には入れない)', () => {
    expect(readStoredWatchlist(JSON.stringify(['aapl', 'AAPL', 'bad sym', 42, null, 'MSFT']))).toEqual({
      kind: 'saved',
      symbols: ['AAPL', 'MSFT'],
      dropped: 3,
    });
    expect(readStoredWatchlist(JSON.stringify({ watchlist: ['AAPL', 'BAD;rm', 'OK.T', 'over_underscore'] }))).toEqual({
      kind: 'saved',
      symbols: ['AAPL', 'OK.T'],
      dropped: 2,
    });
  });

  it('大文字に揃える (登録側は upper で書く —— 手で小文字にした保存値も同じ銘柄として読む)', () => {
    expect(readStoredWatchlist(JSON.stringify(['aapl', '7203.t']))).toEqual({
      kind: 'saved',
      symbols: ['AAPL', '7203.T'],
      dropped: 0,
    });
  });
});

describe('注記 — 読めなかった / 落とした物が在る時だけ', () => {
  it('★ 読めなかった: 理由・出ている物 (見本 / 空)・上書きの警告を 1 行で', () => {
    expect(unreadableWatchlistNote('JSON として読めません', 'demo')).toBe(
      '保存したウォッチリストを読めませんでした (JSON として読めません)。見本の銘柄を表示しています。'
        + 'このまま銘柄を登録・解除すると空の一覧を基に上書きされ、元の保存値は戻りません。',
    );
    expect(unreadableWatchlistNote('EACCES: permission denied', 'empty')).toBe(
      '保存したウォッチリストを読めませんでした (EACCES: permission denied)。一覧は空です。'
        + 'このまま銘柄を登録・解除すると空の一覧を基に上書きされ、元の保存値は戻りません。',
    );
  });

  it('落とした件数: 1 件から言う・0 件は null', () => {
    expect(droppedWatchlistNote(0)).toBeNull();
    expect(droppedWatchlistNote(1)).toBe(
      '保存したウォッチリストのうち 1 件は銘柄コードとして読めず、読み込みで落としました。このまま登録・解除すると、これらは失われます。',
    );
  });

  it('watchlistStoredNote: unreadable → 理由 / saved + dropped → 件数 / saved・none → null', () => {
    expect(watchlistStoredNote({ kind: 'unreadable', reason: 'x' }, 'demo')).toContain('読めませんでした (x)');
    expect(watchlistStoredNote({ kind: 'saved', symbols: ['AAPL'], dropped: 2 }, 'empty')).toContain('2 件は銘柄コードとして読めず');
    expect(watchlistStoredNote({ kind: 'saved', symbols: ['AAPL'], dropped: 0 }, 'empty')).toBeNull();
    expect(watchlistStoredNote({ kind: 'none' }, 'demo')).toBeNull();
  });
});

describe('symbolsOrEmpty — 読めなかった保存値を空として扱う唯一の場所', () => {
  it('saved は symbols・none / unreadable は空', () => {
    expect(symbolsOrEmpty({ kind: 'saved', symbols: ['AAPL'], dropped: 0 })).toEqual(['AAPL']);
    expect(symbolsOrEmpty({ kind: 'none' })).toEqual([]);
    expect(symbolsOrEmpty({ kind: 'unreadable', reason: 'x' })).toEqual([]);
  });
});
