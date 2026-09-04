/** @vitest-environment jsdom */
import { beforeEach, describe, expect, it } from 'vitest';
import { logMood, recordAnalysis, clearHistory, loadStore, EMOTIONS_STORE_KEY } from '../emotionsWeb';

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
