import { describe, expect, it, vi } from 'vitest';
import { DISCORD_USER_AGENT, fetchDiscordSnapshot } from '../discord';
import { FetchError } from '../types';

const json = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

describe('fetchDiscordSnapshot (デスクトップ版の入口)', () => {
  it('★ 参加しているサーバーを読み、鍵を discord.com の 1 つの道へだけ送る', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(json([{ id: '111', name: '開発', approximate_member_count: 42 }]));

    const snap = await fetchDiscordSnapshot({ token: 'aaa.bbb.ccc', fetch: fetchMock });

    expect(snap).toEqual({
      guilds: [{ id: '111', name: '開発', memberCount: 42 }],
      guildsRead: true,
      more: false,
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('https://discord.com/api/v10/users/@me/guilds?limit=21&with_counts=true');
    const headers = (init as RequestInit).headers as Record<string, string>;
    expect(headers.Authorization).toBe('Bot aaa.bbb.ccc');
    // 読むだけ —— GET (method を指定しない) で、本文を送らない。
    expect((init as RequestInit).method).toBeUndefined();
    expect((init as RequestInit).body).toBeUndefined();
  });

  it('★ User-Agent は固定の名前だけを名乗る (利用者・端末・リポジトリを指す値を入れない)', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValueOnce(json([]));
    await fetchDiscordSnapshot({ token: 't', fetch: fetchMock });
    const headers = (fetchMock.mock.calls[0]![1] as RequestInit).headers as Record<string, string>;
    expect(headers['User-Agent']).toBe('DiscordBot (service-hub-desktop, 1)');
    expect(DISCORD_USER_AGENT).toBe('DiscordBot (service-hub-desktop, 1)');
    expect(DISCORD_USER_AGENT).not.toMatch(/github\.com|@|https?:/);
  });

  it('★ 401 は discord の FetchError として上へ出す (見本へ黙って戻らない)', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValueOnce(json({ message: '401: Unauthorized', code: 0 }, 401));
    const err = await fetchDiscordSnapshot({ token: 'bad', fetch: fetchMock }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(FetchError);
    expect((err as FetchError).serviceId).toBe('discord');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('★ 配列でない応答 ({} / null) は投げずに「読めなかった」として返す', async () => {
    for (const body of [{}, null, 'x', 42]) {
      const fetchMock = vi.fn<typeof fetch>().mockResolvedValueOnce(json(body));
      const snap = await fetchDiscordSnapshot({ token: 't', fetch: fetchMock });
      expect(snap, JSON.stringify(body)).toEqual({ guilds: [], guildsRead: false, more: false });
    }
  });

  it('★ 配列を直接返す正しい応答を断らない (封筒が物であることを要求する口を使っていない)', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValueOnce(json([]));
    const snap = await fetchDiscordSnapshot({ token: 't', fetch: fetchMock });
    expect(snap).toEqual({ guilds: [], guildsRead: true, more: false });
  });
});
