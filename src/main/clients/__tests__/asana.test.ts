import { describe, expect, it, vi } from 'vitest';
import { fetchAsanaSnapshot } from '../asana';
import { FetchError } from '../types';

const json = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

describe('fetchAsanaSnapshot (デスクトップ版の入口)', () => {
  it('★ 利用者と未完了のタスクを読み、鍵を Bearer で app.asana.com へだけ送る', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(json({ data: { gid: '7', name: '山田', workspaces: [{ gid: '42', name: '本社' }] } }))
      .mockResolvedValueOnce(json({ data: [{ gid: '100', name: '見積もりを送る', due_on: '2026-11-20' }], next_page: null }));

    const snap = await fetchAsanaSnapshot({ token: 'pat-example', fetch: fetchMock });

    expect(snap).toEqual({
      userName: '山田',
      workspaceName: '本社',
      workspaceCount: 1,
      tasks: [{ id: '100', name: '見積もりを送る', dueOn: '2026-11-20', dueRead: true }],
      meRead: true,
      tasksAsked: true,
      tasksRead: true,
      more: false,
    });

    expect(fetchMock.mock.calls.map((c) => c[0])).toEqual([
      'https://app.asana.com/api/1.0/users/me?opt_fields=name,workspaces.name',
      'https://app.asana.com/api/1.0/tasks?assignee=me&workspace=42&completed_since=now&limit=20&opt_fields=name,due_on',
    ]);
    for (const [, init] of fetchMock.mock.calls) {
      const headers = (init as RequestInit).headers as Record<string, string>;
      expect(headers.Authorization).toBe('Bearer pat-example');
      // 読み取りだけ —— 書き込みの method も本文も付けない。
      expect((init as RequestInit).method).toBeUndefined();
      expect((init as RequestInit).body).toBeUndefined();
    }
  });

  it('★ 401 は asana の FetchError として上へ出す (見本へ黙って戻らない)', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValueOnce(json({ errors: [{ message: 'Not Authorized' }] }, 401));
    const err = await fetchAsanaSnapshot({ token: 'bad', fetch: fetchMock }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(FetchError);
    expect((err as FetchError).serviceId).toBe('asana');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('本文が物でない応答 (null) は、型エラーの文面を出さずに断る', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValueOnce(json(null));
    const err = await fetchAsanaSnapshot({ token: 't', fetch: fetchMock }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(Error);
    expect((err as Error).message).not.toMatch(/Cannot read propert|is not a function|of null/);
    // 針が的に当たる標本 (不在の主張には標本を添える)。
    expect("Cannot read properties of null (reading 'data')").toMatch(/Cannot read propert|is not a function|of null/);
  });

  it('★ 欄の無い応答 ({}) は「読めなかった」として返し、タスクは照会しない', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValueOnce(json({}));
    const snap = await fetchAsanaSnapshot({ token: 't', fetch: fetchMock });
    expect(snap).toEqual({
      userName: '',
      workspaceName: '',
      workspaceCount: 0,
      tasks: [],
      meRead: false,
      tasksAsked: false,
      tasksRead: false,
      more: false,
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('★ ワークスペースの gid が数字でなければ、その値を URL へ入れない (タスクは照会しない)', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(json({ data: { name: '山田', workspaces: [{ gid: '42&assignee=someone-else', name: 'x' }] } }));
    const snap = await fetchAsanaSnapshot({ token: 't', fetch: fetchMock });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(snap.tasksAsked).toBe(false);
  });
});
