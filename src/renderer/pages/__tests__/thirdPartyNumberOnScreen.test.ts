/** @vitest-environment jsdom */
/**
 * **第三者の「数」が読めなかったら、画面はそう言う。** (2026-09-22 · パス 416)
 *
 * パス 415 は**文字列**の葉を長くして 11 client を閉じたが、**数**の葉は測っていなかった。
 * 同じ 2 段の測り方 (① 全 76 画面に壊れた数を入れる ② そのうち網の口を持つ client は
 * **実物を通す**) でやり直すと、実物を通って画面へ届くのは **1 件**だった。
 *
 * 実測 (2026-09-22 ・ 直す前・実物の `fetchYoutubeSnapshot` に食わせる):
 *
 * | `statistics.subscriberCount` | 直す前 | 直した後 |
 * | --- | --- | --- |
 * | `"12500"` | 12,500 | 12,500 |
 * | `NaN` / `"abc"` / `{}` | **画面に `NaN`** | 「不明」 |
 * | `null` / `""` / `[]` | **0** (「登録者 0 人」という事実の主張) | 「不明」 |
 *
 * ★ **`Number(x ?? 0)` は 2 つの誤りを同時に持つ** —— 読めない値を `NaN` にして
 *   画面へ出し、欠けた値を `0` にして**事実として主張する** (法則 `blank-states-its-reason`)。
 *
 * ★ **他の 5 client は実物を通すと届かなかった** (測った): github は `requireNumber` が
 *   断り (パス 262)、base / canva / freee は `finiteNumberOf` ほかの門が在る (パス 410)。
 *   **`1e308` は直さない** —— 有限なので「読めた数」で、`1e+308` と出るほうが
 *   0 へ倒すより正直である (パス 408 が Ollama の大きさについて下したのと同じ判断)。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { YoutubePage } from '../YoutubePage';
import { fetchYoutubeSnapshot } from '../../../main/clients/youtube';
import { apiNumberOf } from '../../../shared/apiResponse';

function replying(bodies: readonly unknown[]): typeof fetch {
  let i = 0;
  return (async () => {
    const body = bodies[Math.min(i++, bodies.length - 1)];
    return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });
  }) as unknown as typeof fetch;
}

let container: HTMLDivElement;
let root: Root | null = null;

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
});

afterEach(async () => {
  if (root !== null) { const r = root; root = null; await act(async () => { r.unmount(); }); }
  container.remove();
  vi.restoreAllMocks();
});

/** 実物の client に統計を食わせて `YoutubePage` を描く。 */
async function screenFor(stats: unknown): Promise<string> {
  const data = await fetchYoutubeSnapshot({
    token: JSON.stringify({ apiKey: 'k', channelId: 'UC_x' }),
    fetch: replying([
      { items: [{ id: 'UC_x', snippet: { title: 'C' }, statistics: stats, contentDetails: { relatedPlaylists: { uploads: 'UU' } } }] },
      { items: [] },
    ]),
  } as never);
  (globalThis as unknown as { serviceHub: unknown }).serviceHub = {
    getVersion: () => Promise.resolve('0.1.0-web'),
    listConfigured: () => Promise.resolve(['youtube']),
    fetchSnapshot: () => Promise.resolve({ ok: true, data }),
    invoke: vi.fn(() => Promise.resolve({ ok: true, data: {} })),
    openExternal: () => Promise.resolve(),
    oauthSupported: () => Promise.resolve(false),
    setToken: () => Promise.resolve(),
    clearToken: () => Promise.resolve(),
  };
  root = createRoot(container);
  await act(async () => { root!.render(createElement(YoutubePage)); });
  for (let i = 0; i < 8; i += 1) await act(async () => { await new Promise<void>((r) => setTimeout(r, 0)); });
  return container.textContent ?? '';
}

describe('第三者の数が読めなかったとき (パス 416)', () => {
  it('★ 読める統計の答えは 1 つも変わらない', async () => {
    const t = await screenFor({ subscriberCount: '12500', viewCount: '982000', videoCount: '142' });
    expect(t).toContain('12,500');
    expect(t).toContain('982,000');
    expect(t).toContain('142');
    expect(t).not.toContain('不明');
  });

  for (const [label, bad] of Object.entries({
    '読めない文字列': 'abc',
    '物': { a: 1 },
    '欠落': undefined,
    '空文字': '',
    '配列': [],
    '桁区切り入り': '12,500',
  })) {
    it(`★ ${label} は「不明」と言う (NaN も 0 も出さない)`, async () => {
      const t = await screenFor({ subscriberCount: bad, viewCount: bad, videoCount: bad });
      expect(t, '画面が「不明」と言っていない').toContain('不明');
      expect(t, '画面に NaN が出た').not.toContain('NaN');
      // 0 を「事実」として刷らない —— タイルの値が素の 0 になっていないこと。
      expect(t).not.toContain('登録者数0');
    });
  }
});

describe('apiNumberOf (パス 416)', () => {
  it('★ 10 進の文字列と有限の数は読む', () => {
    expect(apiNumberOf('12500')).toBe(12_500);
    expect(apiNumberOf('-3')).toBe(-3);
    expect(apiNumberOf('1.5')).toBe(1.5);
    expect(apiNumberOf(42)).toBe(42);
    expect(apiNumberOf(0)).toBe(0);
  });

  it('★ 読めない物は null (0 にも NaN にもしない)', () => {
    for (const v of ['abc', '', ' ', '12,500', '1e3', '0x10', '１２３', null, undefined, {}, [], true, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(apiNumberOf(v), `${JSON.stringify(v)} を読んでしまった`).toBeNull();
    }
  });

  it('★ 利用者の入力欄の読み手とは受理集合が違う (母集団が違うので揃えない)', async () => {
    const { readNumeric } = await import('../../../shared/readNumeric');
    // 全角は**利用者の欄**では読めて、API の数としては読めない。
    expect(readNumeric('１２３')).toBe(123);
    expect(apiNumberOf('１２３')).toBeNull();
  });
});
