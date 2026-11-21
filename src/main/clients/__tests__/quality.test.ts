import { describe, expect, it, vi } from 'vitest';
import { fetchQualitySnapshot } from '../quality';
import { FetchError } from '../types';

const json = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

const REPORT_MD = [
  '最終更新: 2026-10-01 05:24:21 UTC',
  '| TypeScript 型検査 | ✅ pass |',
  '| ユニットテスト | 21066 passing (1036 files) |',
  '| Mutation score (total / covered) | 100.00% / 100.00% |',
].join('\n');

/** 照会の順 (commit / ci / mutation / trees / PR×3 / QUALITY.md) に応答を並べる。 */
function successFetch() {
  return vi
    .fn<typeof fetch>()
    .mockResolvedValueOnce(
      json({ sha: 'ca6693e4abcdef0123456789', commit: { committer: { date: '2026-11-21T12:00:00Z' } } }),
    )
    .mockResolvedValueOnce(
      json({
        workflow_runs: [
          {
            status: 'completed',
            conclusion: 'success',
            updated_at: '2026-11-21T12:30:00Z',
            html_url: 'https://github.com/hiroto1977/-/actions/runs/1',
          },
        ],
      }),
    )
    .mockResolvedValueOnce(json({ workflow_runs: [] }))
    .mockResolvedValueOnce(
      json({
        truncated: false,
        tree: [
          { path: 'src/a.test.ts', type: 'blob' },
          { path: 'src/b.ts', type: 'blob' },
        ],
      }),
    )
    .mockResolvedValueOnce(json({ total_count: 7 }))
    .mockResolvedValueOnce(json({ total_count: 3 }))
    .mockResolvedValueOnce(json({ total_count: 1 }))
    .mockResolvedValueOnce(
      json({ content: Buffer.from(REPORT_MD, 'utf-8').toString('base64'), encoding: 'base64' }),
    );
}

describe('fetchQualitySnapshot (デスクトップ版の入口)', () => {
  it('★ GitHub から即時値を読み、鍵を Bearer で api.github.com へだけ送る', async () => {
    const fetchMock = successFetch();
    const snap = await fetchQualitySnapshot({ token: 'ghp_test_example', fetch: fetchMock });

    expect(snap.latestCommit).toEqual({ sha: 'ca6693e', date: '2026-11-21' });
    expect(snap.ciRun?.conclusion).toBe('success');
    expect(snap.mutationRun).toBeNull();
    expect(snap.testFileCount).toBe(1);
    expect(snap.openPullRequests).toBe(7);
    expect(snap.approvedPullRequests).toBe(3);
    expect(snap.changesRequestedPullRequests).toBe(1);
    expect(snap.report?.unitTestsPassing).toBe(21066);

    const urls = fetchMock.mock.calls.map((c) => c[0] as string);
    expect(urls).toHaveLength(8);
    for (const url of urls) {
      expect(url.startsWith('https://api.github.com/')).toBe(true);
    }
    expect(urls[0]).toBe('https://api.github.com/repos/hiroto1977/-/commits/main');
    for (const [, init] of fetchMock.mock.calls) {
      const headers = (init as RequestInit).headers as Record<string, string>;
      expect(headers.Authorization).toBe('Bearer ghp_test_example');
      expect(headers['X-GitHub-Api-Version']).toBe('2022-11-28');
      // 読み取りだけ —— method は GET (未指定) のみ。
      expect((init as RequestInit).method).toBeUndefined();
    }
  });

  it('★ 401 は quality の FetchError として上へ出す (見本へ黙って戻らない)', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(json({ message: 'Bad credentials' }, 401));
    const err = await fetchQualitySnapshot({ token: 'bad', fetch: fetchMock }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(FetchError);
    expect((err as FetchError).serviceId).toBe('quality');
  });
});
