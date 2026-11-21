import { describe, expect, it, vi } from 'vitest';
import { fetchSentrySnapshot } from '../sentry';
import { FetchError } from '../types';

const json = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

const ROW = {
  shortId: 'WEB-1A',
  title: 'TypeError: x is undefined',
  level: 'error',
  count: '24',
  lastSeen: '2026-11-17T12:00:00Z',
  project: { name: 'web' },
};

describe('fetchSentrySnapshot (デスクトップ版の入口)', () => {
  it('★ 組織と未解決の問題を読み、鍵を sentry.io の 2 つの道へだけ送る', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(json([{ slug: 'acme', name: 'Acme' }]))
      .mockResolvedValueOnce(json([ROW]));

    const snap = await fetchSentrySnapshot({ token: 'sntryu_example', fetch: fetchMock });

    expect(snap).toEqual({
      orgName: 'Acme',
      orgCount: 1,
      issues: [
        { shortId: 'WEB-1A', title: 'TypeError: x is undefined', level: 'error', count: 24, lastSeen: '2026-11-17', projectName: 'web' },
      ],
      orgsRead: true,
      issuesAsked: true,
      issuesRead: true,
      more: false,
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls.map((c) => c[0])).toEqual([
      'https://sentry.io/api/0/organizations/',
      'https://sentry.io/api/0/organizations/acme/issues/?query=is%3Aunresolved&limit=21',
    ]);
    for (const [, init] of fetchMock.mock.calls) {
      expect(((init as RequestInit).headers as Record<string, string>).Authorization).toBe('Bearer sntryu_example');
      // 読むだけ —— どちらの照会も GET (method を指定しない) で、本文を送らない。
      expect((init as RequestInit).method).toBeUndefined();
      expect((init as RequestInit).body).toBeUndefined();
    }
  });

  it('★ 401 は sentry の FetchError として上へ出す (見本へ黙って戻らない)', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValueOnce(json({ detail: 'Invalid token' }, 401));
    const err = await fetchSentrySnapshot({ token: 'bad', fetch: fetchMock }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(FetchError);
    expect((err as FetchError).serviceId).toBe('sentry');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('★ 配列でない応答 ({} / null) は投げずに「読めなかった」として返し、問題は照会しない', async () => {
    for (const body of [{}, null, 'x', 42]) {
      const fetchMock = vi.fn<typeof fetch>().mockResolvedValueOnce(json(body));
      const snap = await fetchSentrySnapshot({ token: 't', fetch: fetchMock });
      expect(snap, JSON.stringify(body)).toEqual({
        orgName: '',
        orgCount: 0,
        issues: [],
        orgsRead: false,
        issuesAsked: false,
        issuesRead: false,
        more: false,
      });
      expect(fetchMock).toHaveBeenCalledTimes(1);
    }
  });

  it('★ 配列を直接返す正しい応答を断らない (封筒が物であることを要求する口を使っていない)', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(json([{ slug: 'acme', name: 'Acme' }]))
      .mockResolvedValueOnce(json([]));
    const snap = await fetchSentrySnapshot({ token: 't', fetch: fetchMock });
    expect(snap.orgsRead).toBe(true);
    expect(snap.issuesRead).toBe(true);
    expect(snap.issues).toEqual([]);
  });

  it('問題の一覧だけが配列でないときは、0 件と混ぜずに「読めなかった」と返す', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(json([{ slug: 'acme', name: 'Acme' }]))
      .mockResolvedValueOnce(json({ detail: 'x' }));
    const snap = await fetchSentrySnapshot({ token: 't', fetch: fetchMock });
    expect(snap.issuesAsked).toBe(true);
    expect(snap.issuesRead).toBe(false);
    expect(snap.issues).toEqual([]);
  });
});
