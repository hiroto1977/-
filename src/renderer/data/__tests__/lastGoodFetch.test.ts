/**
 * 最後に取得できた内容の覚え (`data/lastGoodFetch.ts`)。
 */
import { beforeEach, describe, expect, it } from 'vitest';
import {
  fetchedAtText,
  forgetAllFetches,
  forgetFetch,
  lastGoodFetch,
  rememberFetch,
  rememberedFetchCount,
  staleDataNote,
} from '../lastGoodFetch';
import { originOf } from '../../../shared/dataOrigin';

const AT = new Date(2026, 10, 11, 9, 5, 0).getTime();

beforeEach(() => {
  forgetAllFetches();
});

describe('覚える範囲', () => {
  it('標本: github はクラウドから取得する。sales と mutual-funds は違う', () => {
    expect(originOf('github')).toBe('remote');
    expect(originOf('sales')).not.toBe('remote');
    expect(originOf('mutual-funds')).not.toBe('remote');
  });

  it('クラウドから取得した内容を、時刻つきで覚える', () => {
    const data = { repos: [{ name: 'a' }] };
    expect(rememberFetch('github', data, AT)).toBe(true);
    expect(lastGoodFetch('github')).toEqual({ data, at: AT });
    expect(lastGoodFetch('github')?.data).toBe(data);
    expect(rememberedFetchCount()).toBe(1);
  });

  it('時刻を渡さなければ今の時刻で覚える', () => {
    const before = Date.now();
    rememberFetch('github', { x: 1 });
    const at = lastGoodFetch('github')?.at ?? 0;
    expect(at).toBeGreaterThanOrEqual(before);
    expect(at).toBeLessThanOrEqual(Date.now());
  });

  it('★ 端末の記録・同梱の見本を出す画面の内容は覚えない', () => {
    expect(rememberFetch('sales', { rows: [] }, AT)).toBe(false);
    expect(rememberFetch('mutual-funds', { holdings: [] }, AT)).toBe(false);
    expect(lastGoodFetch('sales')).toBeNull();
    expect(rememberedFetchCount()).toBe(0);
  });

  it('★ 見本を名乗る内容 (isMock) は覚えない。真偽値の true だけを見本と読む', () => {
    expect(rememberFetch('github', { isMock: true, repos: [] }, AT)).toBe(false);
    expect(lastGoodFetch('github')).toBeNull();
    expect(rememberFetch('github', { isMock: 'true', repos: [] }, AT)).toBe(true);
    expect(rememberFetch('slack', { isMock: false }, AT)).toBe(true);
    expect(rememberFetch('notion', null, AT)).toBe(true);
    expect(rememberedFetchCount()).toBe(3);
  });

  it('同じサービスは新しい方で置き換える', () => {
    rememberFetch('github', { v: 1 }, AT);
    rememberFetch('github', { v: 2 }, AT + 1);
    expect(lastGoodFetch('github')).toEqual({ data: { v: 2 }, at: AT + 1 });
    expect(rememberedFetchCount()).toBe(1);
  });
});

describe('消す', () => {
  it('そのサービスの分だけ消す', () => {
    rememberFetch('github', { v: 1 }, AT);
    rememberFetch('slack', { v: 2 }, AT);
    forgetFetch('github');
    expect(lastGoodFetch('github')).toBeNull();
    expect(lastGoodFetch('slack')).toEqual({ data: { v: 2 }, at: AT });
  });

  it('全部消す', () => {
    rememberFetch('github', { v: 1 }, AT);
    rememberFetch('slack', { v: 2 }, AT);
    forgetAllFetches();
    expect(rememberedFetchCount()).toBe(0);
    expect(lastGoodFetch('slack')).toBeNull();
  });
});

describe('いつの内容かを言う', () => {
  it('月/日 時:分 (時と分は 2 桁)', () => {
    expect(fetchedAtText(AT)).toBe('11/11 09:05');
    expect(fetchedAtText(new Date(2026, 0, 2, 23, 59).getTime())).toBe('1/2 23:59');
  });

  it('読めない時刻は時刻を名乗らない', () => {
    expect(fetchedAtText(Number.NaN)).toBe('時刻不明');
    expect(fetchedAtText(Number.POSITIVE_INFINITY)).toBe('時刻不明');
  });

  it('失敗の文のあとに、いつの内容を見せているかを足す', () => {
    expect(staleDataNote('fetch failed', AT)).toBe(
      'fetch failed —— 取得できなかったので、最後に取得できた内容 (11/11 09:05 時点) を表示しています。',
    );
  });
});
