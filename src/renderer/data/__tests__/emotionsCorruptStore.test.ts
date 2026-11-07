/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { assertStoreWritable, logMood, recordAnalysis, clearHistory, loadStore, EMOTIONS_STORE_KEY } from '../emotionsWeb';

/*
 * **読めなかった保管値の上に書くと、読めなかっただけの記録が消える。**
 *
 * `loadStore` は壊れた JSON を飲んで空を返していた。読み出しとしては正しい
 * (画面が落ちるより空の方がまし) が、`logMood` はその空を**土台にして書く**。
 *
 * 直す前の実測 —— 末尾が切れた保管値に `logMood` を 1 回するだけで:
 *
 *   前: {"moods":[{"date":"2026-01-01","score":4,"note":"大事なメモ"}]…  (壊れている)
 *   後: {"moods":[{"date":"2026-02-02","score":3,"note":"new"}],"analyses":[]}
 *
 * 元の記録も、壊れた文字列そのものも消える。**壊れていても文字列の中には
 * `"note":"…"` が読める形で残っている**ので、消さなければ人手で拾える。
 *
 * 同じ機能の main 側 (`main/clients/emotions.ts`) は最初から正しく、
 * `ENOENT` だけを飲んで壊れた JSON は投げ直す。ブラウザ版だけが全部飲んでいた
 * (`main/secrets.ts` で見つけたのと同じ形)。
 */

/** 実際の記録が入っているが末尾が切れている、という保管値。 */
function writeCorruptStore(): string {
  const good = JSON.stringify({
    moods: [{ date: '2026-01-01', score: 4, note: '大事なメモ' }],
    analyses: [],
  });
  const corrupt = good.slice(0, -3);
  localStorage.setItem(EMOTIONS_STORE_KEY, corrupt);
  return corrupt;
}

beforeEach(() => {
  localStorage.clear();
});

describe('読めなかった保管値の上には書かない', () => {
  it('壊れているとき logMood は断り、元の文字列を残す', () => {
    const corrupt = writeCorruptStore();
    expect(() => logMood({ date: '2026-02-02', score: 3, note: 'new' })).toThrow(/記録を中止/);
    expect(localStorage.getItem(EMOTIONS_STORE_KEY), '保管値を書き換えている').toBe(corrupt);
    expect(localStorage.getItem(EMOTIONS_STORE_KEY) ?? '', '拾える形が消えている').toContain(
      '大事なメモ',
    );
  });

  it('壊れているとき recordAnalysis も断る', () => {
    const corrupt = writeCorruptStore();
    expect(() =>
      recordAnalysis('text', undefined, {
        scores: { joy: 1, sadness: 0, anger: 0, fear: 0, surprise: 0, disgust: 0 },
        sentiment: 'positive',
        dominant: 'joy',
      }),
    ).toThrow(/記録を中止/);
    expect(localStorage.getItem(EMOTIONS_STORE_KEY)).toBe(corrupt);
  });

  it('「履歴を消去」は通す (行き止まりにしない)', () => {
    writeCorruptStore();
    expect(() => clearHistory('all')).not.toThrow();
    // 消した後は普通に書ける。
    expect(() => logMood({ date: '2026-02-02', score: 3, note: 'new' })).not.toThrow();
    expect(loadStore().moods).toHaveLength(1);
  });

  it('まだ何も無いときは普通に書ける (「無い」と「読めない」を混同しない)', () => {
    expect(() => logMood({ date: '2026-02-02', score: 3, note: 'first' })).not.toThrow();
    expect(loadStore().moods).toHaveLength(1);
  });

  it('読み出しは今までどおり空を返す (画面を止めない)', () => {
    writeCorruptStore();
    expect(loadStore(), '読み出しまで投げている').toEqual({ moods: [], analyses: [] });
  });

  it('普通の保管値なら何も変わらない', () => {
    logMood({ date: '2026-01-01', score: 4, note: 'ok' });
    expect(() => logMood({ date: '2026-01-02', score: 5, note: 'ok2' })).not.toThrow();
    expect(loadStore().moods).toHaveLength(2);
  });
});


/*
 * ## 保管値ではなく**保存領域そのもの**を断られる端末 (2026-09-06)
 *
 * `localStorage` は触れるだけで投げる —— サイトデータをブロックしたオリジンで
 * Chrome は `SecurityError` を返す。`loadStore()` は `getItem` を `try` の**上**で
 * 呼んでいたので、その例外は degraded に数えられず**生で呼び出し側へ抜けていた**。
 *
 * つまりこの端末では、このファイルが留めている守り 2 つが**どちらも働かなかった**:
 * 上書きを断る `loadStoreForWrite()` と、Anthropic へ送る前の門
 * `assertStoreWritable()` —— どちらも `lastLoadDegraded` を見ているためである。
 */
describe('保存領域そのものへ触れられない端末', () => {
  function refuseAccess(): void {
    const boom = (): never => {
      const e = new Error('Access is denied for this document.');
      e.name = 'SecurityError';
      throw e;
    };
    vi.stubGlobal('localStorage', {
      getItem: boom,
      setItem: boom,
      removeItem: boom,
      clear: boom,
      key: boom,
      get length(): number {
        return boom();
      },
    });
  }

  /*
   * **後片付けは `afterEach` に置く。** 各 it の末尾で `unstubAllGlobals()` して
   * いた頃は、守りを外す対照を回すと ★ が投げて後片付けに届かず、断る
   * `localStorage` が次の it へ漏れて**対照まで落ちた** —— 対照は独立していな
   * ければ「守りを外すと ★ だけが落ちる」を示せない (2026-09-06 実測)。
   */
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('★ loadStore() は投げない (空を返す)', () => {
    refuseAccess();
    expect(() => loadStore()).not.toThrow();
    expect(loadStore()).toEqual({ moods: [], analyses: [] });
  });

  it('★ degraded に数える —— 送る前の門が断る', () => {
    refuseAccess();
    expect(() => assertStoreWritable()).toThrow(/読めませんでした/);
  });

  it('★ 記録もしない (空を土台に上書きしない)', () => {
    refuseAccess();
    expect(() => logMood({ date: '2026-03-03', score: 3 })).toThrow(/読めませんでした/);
  });

  it('対照: 触れる端末では門が通り、記録できる', () => {
    expect(() => assertStoreWritable()).not.toThrow();
    expect(logMood({ date: '2026-03-03', score: 3 }).date).toBe('2026-03-03');
  });
});
