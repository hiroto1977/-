import { describe, expect, it, vi } from 'vitest';
import { fetchLineSnapshot } from '../line';
import { FetchError } from '../types';

const json = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

describe('fetchLineSnapshot (デスクトップ版の入口)', () => {
  it('★ アカウントと配信数を読み、鍵を Bearer で api.line.me へだけ送る', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(json({ userId: 'U0', basicId: '@shop', displayName: 'お店', chatMode: 'chat', markAsReadMode: 'manual' }))
      .mockResolvedValueOnce(json({ type: 'limited', value: 5000 }))
      .mockResolvedValueOnce(json({ totalUsage: 1200 }));

    const snap = await fetchLineSnapshot({ token: 'token-example', fetch: fetchMock });

    expect(snap).toEqual({
      displayName: 'お店',
      basicId: '@shop',
      chatMode: 'chat',
      quotaType: 'limited',
      quotaLimit: 5000,
      usage: 1200,
    });

    expect(fetchMock.mock.calls.map((c) => c[0])).toEqual([
      'https://api.line.me/v2/bot/info',
      'https://api.line.me/v2/bot/message/quota',
      'https://api.line.me/v2/bot/message/quota/consumption',
    ]);
    for (const [, init] of fetchMock.mock.calls) {
      const headers = (init as RequestInit).headers as Record<string, string>;
      expect(headers.Authorization).toBe('Bearer token-example');
      // 読み取りだけ —— 書き込みの method も本文も付けない。
      expect((init as RequestInit).method).toBeUndefined();
      expect((init as RequestInit).body).toBeUndefined();
    }
  });

  it('★ 401 は line の FetchError として上へ出す (見本へ黙って戻らない)', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValueOnce(json({ message: 'Authentication failed' }, 401));
    const err = await fetchLineSnapshot({ token: 'bad', fetch: fetchMock }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(FetchError);
    expect((err as FetchError).serviceId).toBe('line');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('本文が物でない応答 (null) は、型エラーの文面を出さずに断る', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValueOnce(json(null));
    const err = await fetchLineSnapshot({ token: 't', fetch: fetchMock }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(Error);
    expect((err as Error).message).not.toMatch(/Cannot read propert|is not a function|of null/);
    // 針が的に当たる標本 (不在の主張には標本を添える)。
    expect("Cannot read properties of null (reading 'displayName')").toMatch(/Cannot read propert|is not a function|of null/);
  });

  it('★ 欄の無い応答 ({}) は「読めなかった」として返す (0 通や上限なしにしない)', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(json({}))
      .mockResolvedValueOnce(json({}))
      .mockResolvedValueOnce(json({}));
    const snap = await fetchLineSnapshot({ token: 't', fetch: fetchMock });
    expect(snap).toEqual({
      displayName: '',
      basicId: '',
      chatMode: null,
      quotaType: null,
      quotaLimit: null,
      usage: null,
    });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
});
