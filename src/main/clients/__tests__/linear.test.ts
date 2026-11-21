import { describe, expect, it, vi } from 'vitest';
import { fetchLinearSnapshot } from '../linear';
import { FetchError } from '../types';
import { LINEAR_ISSUES_QUERY } from '../../../shared/api/linear';

const json = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

const NODE = {
  identifier: 'ENG-12',
  title: '見積もりの画面を直す',
  priority: 2,
  dueDate: '2026-11-20',
  state: { name: '進行中' },
  team: { name: '開発' },
};

describe('fetchLinearSnapshot (デスクトップ版の入口)', () => {
  it('★ 利用者と未完了の課題を読み、鍵を api.linear.app の /graphql へだけ送る', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValueOnce(
      json({ data: { viewer: { name: '山田', assignedIssues: { nodes: [NODE], pageInfo: { hasNextPage: false } } } } }),
    );

    const snap = await fetchLinearSnapshot({ token: 'lin_api_example', fetch: fetchMock });

    expect(snap).toEqual({
      userName: '山田',
      issues: [
        {
          identifier: 'ENG-12',
          title: '見積もりの画面を直す',
          priority: 2,
          dueDate: '2026-11-20',
          dueRead: true,
          stateName: '進行中',
          teamName: '開発',
        },
      ],
      viewerRead: true,
      issuesRead: true,
      more: false,
      refused: false,
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('https://api.linear.app/graphql');
    const headers = (init as RequestInit).headers as Record<string, string>;
    // 個人の API キーは Bearer を付けずに置く (Linear の決まり)。
    expect(headers.Authorization).toBe('lin_api_example');
    expect(headers['Content-Type']).toBe('application/json');
    expect((init as RequestInit).method).toBe('POST');
    // 本文は固定の照会だけ —— 読むだけ (mutation ではない) で、鍵は入らない。
    expect((init as RequestInit).body).toBe(JSON.stringify({ query: LINEAR_ISSUES_QUERY }));
  });

  it('★ 401 は linear の FetchError として上へ出す (見本へ黙って戻らない)', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValueOnce(json({ errors: [{ message: 'Authentication required' }] }, 401));
    const err = await fetchLinearSnapshot({ token: 'bad', fetch: fetchMock }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(FetchError);
    expect((err as FetchError).serviceId).toBe('linear');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('★ HTTP 200 の本文が errors を持つ応答は「断られた」として返す (0 件と混ぜない)', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValueOnce(json({ errors: [{ message: 'Authentication required' }] }));
    const snap = await fetchLinearSnapshot({ token: 't', fetch: fetchMock });
    expect(snap).toEqual({ userName: '', issues: [], viewerRead: false, issuesRead: false, more: false, refused: true });
  });

  it('本文が物でない応答 (null) は、型エラーの文面を出さずに断る', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValueOnce(json(null));
    const err = await fetchLinearSnapshot({ token: 't', fetch: fetchMock }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(Error);
    expect((err as Error).message).not.toMatch(/Cannot read propert|is not a function|of null/);
    // 針が的に当たる標本 (不在の主張には標本を添える)。
    expect("Cannot read properties of null (reading 'data')").toMatch(/Cannot read propert|is not a function|of null/);
  });

  it('★ 欄の無い応答 ({}) は「読めなかった」として返す', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValueOnce(json({}));
    const snap = await fetchLinearSnapshot({ token: 't', fetch: fetchMock });
    expect(snap).toEqual({ userName: '', issues: [], viewerRead: false, issuesRead: false, more: false, refused: false });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
