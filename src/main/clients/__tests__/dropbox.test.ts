import { describe, expect, it, vi } from 'vitest';
import { fetchDropboxSnapshot } from '../dropbox';
import { FetchError } from '../types';

const json = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

describe('fetchDropboxSnapshot (デスクトップ版の入口)', () => {
  it('★ アカウント・容量・最近のアイテムを読み、鍵を Bearer で api.dropboxapi.com へだけ送る', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(json({ account_id: 'dbid:AAH', name: { display_name: '山田 太郎' }, email: 'a@example.com' }))
      .mockResolvedValueOnce(json({ used: 4_800_000_000, allocation: { '.tag': 'individual', allocated: 15_000_000_000 } }))
      .mockResolvedValueOnce(json({
        entries: [
          { '.tag': 'file', id: 'id:1', name: 'Q3-report.xlsx', size: 248_000, server_modified: '2026-11-16T12:00:00Z' },
          { '.tag': 'folder', id: 'id:2', name: 'marketing-assets' },
        ],
        has_more: true,
      }));

    const snap = await fetchDropboxSnapshot({ token: 'sl.test_example', fetch: fetchMock });

    expect(snap.accountName).toBe('山田 太郎');
    expect(snap.email).toBe('a@example.com');
    expect(snap.accountRead).toBe(true);
    expect(snap.usedBytes).toBe(4_800_000_000);
    expect(snap.allocatedBytes).toBe(15_000_000_000);
    expect(snap.spaceRead).toBe(true);
    expect(snap.entriesRead).toBe(true);
    expect(snap.hasMore).toBe(true);
    expect(snap.entries.map((e) => [e.kind, e.name, e.sizeBytes])).toEqual([
      ['file', 'Q3-report.xlsx', 248_000],
      ['folder', 'marketing-assets', null],
    ]);

    expect(fetchMock.mock.calls.map((c) => c[0])).toEqual([
      'https://api.dropboxapi.com/2/users/get_current_account',
      'https://api.dropboxapi.com/2/users/get_space_usage',
      'https://api.dropboxapi.com/2/files/list_folder',
    ]);
    for (const [, init] of fetchMock.mock.calls) {
      const headers = (init as RequestInit).headers as Record<string, string>;
      expect(headers.Authorization).toBe('Bearer sl.test_example');
      // 読み取りだけ —— method は照会の POST だけ、書き込みの照会は 1 つも無い。
      expect((init as RequestInit).method).toBe('POST');
    }
    // 引数の無い照会に本文は付けない。一覧の本文は固定の照会だけ。
    expect((fetchMock.mock.calls[0]![1] as RequestInit).body).toBeUndefined();
    expect((fetchMock.mock.calls[1]![1] as RequestInit).body).toBeUndefined();
    expect(JSON.parse(String((fetchMock.mock.calls[2]![1] as RequestInit).body))).toEqual({ path: '', recursive: false, limit: 20 });
  });

  it('★ 401 は dropbox の FetchError として上へ出す (見本へ黙って戻らない)', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValueOnce(json({ error_summary: 'invalid_access_token/' }, 401));
    const err = await fetchDropboxSnapshot({ token: 'bad', fetch: fetchMock }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(FetchError);
    expect((err as FetchError).serviceId).toBe('dropbox');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('本文が物でない応答 (null) は、型エラーの文面を出さずに断る', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValueOnce(json(null));
    const err = await fetchDropboxSnapshot({ token: 't', fetch: fetchMock }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(Error);
    expect((err as Error).message).not.toMatch(/Cannot read propert|is not a function|of null/);
  });
});
