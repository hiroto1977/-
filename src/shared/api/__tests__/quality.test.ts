import { describe, expect, it, vi } from 'vitest';
import {
  decodeBase64Utf8,
  fetchQualitySnapshotWith,
  parseQualityReport,
  qualityHeaders,
  type QualityJsonFetch,
} from '../quality';

/** `docs/QUALITY.md` の Summary 表の形 (実物の行を抜粋)。 */
const REPORT_MD = [
  '# Service Hub — 品質レポート',
  '',
  '最終更新: 2026-10-01 05:24:21 UTC',
  '',
  '## Summary',
  '',
  '| 指標 | 値 |',
  '|---|---|',
  '| TypeScript 型検査 | ✅ pass |',
  '| ユニットテスト | 21066 passing (1036 files) |',
  '| Coverage (`src/main/**` のみ) — lines | 99.69% |',
  '| Coverage (`src/main/**` のみ) — statements | 99.21% |',
  '| Coverage (`src/main/**` のみ) — branches | 97.52% |',
  '| Coverage (`src/main/**` のみ) — functions | 98.60% |',
  '| Mutation score (total / covered) | 100.00% / 100.00% |',
  '| Mutation の表の行 (報告が測った本) | 308 本 (報告ファイルの日時 2026-10-01 04:51 UTC) |',
  '| Mutants killed | 37532 |',
  '| Mutants survived | 0 |',
  '| Mutants 有効 (分母) | 37532 |',
  '',
].join('\n');

const COMMIT_BODY = {
  sha: 'ca6693e4abcdef0123456789',
  commit: { committer: { date: '2026-11-21T12:00:00Z' } },
};

const CI_RUNS_BODY = {
  workflow_runs: [
    {
      status: 'completed',
      conclusion: 'success',
      updated_at: '2026-11-21T12:30:00Z',
      html_url: 'https://github.com/hiroto1977/-/actions/runs/1',
    },
  ],
};

const MUTATION_RUNS_BODY = {
  workflow_runs: [
    {
      status: 'completed',
      conclusion: 'failure',
      updated_at: '2026-11-20T12:30:00Z',
      html_url: 'https://github.com/hiroto1977/-/actions/runs/2',
    },
  ],
};

const TREE_BODY = {
  truncated: false,
  tree: [
    { path: 'src/a.test.ts', type: 'blob' },
    { path: 'src/b.test.tsx', type: 'blob' },
    { path: 'src/c.ts', type: 'blob' },
    { path: 'src/__tests__', type: 'tree' },
    { path: 'e2e/app.spec.ts', type: 'blob' },
  ],
};

function stubFetch(overrides: { contents?: unknown; failContents?: boolean } = {}): QualityJsonFetch {
  return vi.fn<QualityJsonFetch>(async (url: string) => {
    if (url.includes('/commits/main')) return COMMIT_BODY;
    if (url.includes('/workflows/ci.yml/runs')) return CI_RUNS_BODY;
    if (url.includes('/workflows/mutation.yml/runs')) return MUTATION_RUNS_BODY;
    if (url.includes('/git/trees/main')) return TREE_BODY;
    if (url.includes('review%3Aapproved')) return { total_count: 3 };
    if (url.includes('review%3Achanges_requested')) return { total_count: 1 };
    if (url.includes('/search/issues')) return { total_count: 7 };
    if (url.includes('/contents/docs/QUALITY.md')) {
      if (overrides.failContents === true) throw new Error('404');
      return overrides.contents ?? { content: Buffer.from(REPORT_MD, 'utf-8').toString('base64'), encoding: 'base64' };
    }
    throw new Error(`unexpected url: ${url}`);
  });
}

describe('qualityHeaders', () => {
  it('Bearer と GitHub の版ヘッダを組む', () => {
    expect(qualityHeaders('tok')).toEqual({
      Authorization: 'Bearer tok',
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
    });
  });
});

describe('decodeBase64Utf8', () => {
  it('日本語を含む UTF-8 を往復できる (改行混じりの base64 も)', () => {
    const b64 = Buffer.from('品質レポート ✅', 'utf-8').toString('base64');
    const withBreaks = `${b64.slice(0, 8)}\n${b64.slice(8)}`;
    expect(decodeBase64Utf8(withBreaks)).toBe('品質レポート ✅');
  });
});

describe('parseQualityReport', () => {
  it('Summary 表の実測値を生成時点つきで読む', () => {
    const report = parseQualityReport(REPORT_MD);
    expect(report.generatedAt).toBe('2026-10-01 05:24:21 UTC');
    expect(report.typecheckPass).toBe(true);
    expect(report.unitTestsPassing).toBe(21066);
    expect(report.unitTestFiles).toBe(1036);
    expect(report.coverageLines).toBe(99.69);
    expect(report.coverageStatements).toBe(99.21);
    expect(report.coverageBranches).toBe(97.52);
    expect(report.coverageFunctions).toBe(98.6);
    expect(report.mutationScoreTotal).toBe(100);
    expect(report.mutationScoreCovered).toBe(100);
    expect(report.mutationFiles).toBe(308);
    expect(report.mutationReportAt).toBe('2026-10-01 04:51 UTC');
    expect(report.mutantsKilled).toBe(37532);
    expect(report.mutantsSurvived).toBe(0);
    expect(report.mutantsValid).toBe(37532);
  });

  it('読めない行は null のまま (0 で埋めて実測に見せない)', () => {
    const report = parseQualityReport('# 何もない\n');
    expect(report.generatedAt).toBeNull();
    expect(report.typecheckPass).toBeNull();
    expect(report.unitTestsPassing).toBeNull();
    expect(report.coverageLines).toBeNull();
    expect(report.mutationScoreTotal).toBeNull();
    expect(report.mutantsKilled).toBeNull();
  });

  it('型検査が fail の行は false', () => {
    const report = parseQualityReport('| TypeScript 型検査 | ❌ fail (3 errors) |');
    expect(report.typecheckPass).toBe(false);
  });
});

describe('fetchQualitySnapshotWith', () => {
  it('★ 即時値と QUALITY.md の実測を 1 つの snapshot に組む', async () => {
    const jsonFetch = stubFetch();
    const snap = await fetchQualitySnapshotWith(jsonFetch, 'tok');

    expect(snap.latestCommit).toEqual({ sha: 'ca6693e', date: '2026-11-21' });
    expect(snap.ciRun).toEqual({
      status: 'completed',
      conclusion: 'success',
      updatedAt: '2026-11-21',
      htmlUrl: 'https://github.com/hiroto1977/-/actions/runs/1',
    });
    expect(snap.mutationRun?.conclusion).toBe('failure');
    expect(snap.mutationRun?.updatedAt).toBe('2026-11-20');
    // *.test.ts(x) の blob だけを数える (spec や通常ファイル・tree は数えない)
    expect(snap.testFileCount).toBe(2);
    expect(snap.openPullRequests).toBe(7);
    expect(snap.approvedPullRequests).toBe(3);
    expect(snap.changesRequestedPullRequests).toBe(1);
    expect(snap.report?.generatedAt).toBe('2026-10-01 05:24:21 UTC');
    expect(snap.report?.unitTestsPassing).toBe(21066);

    const urls = (jsonFetch as ReturnType<typeof vi.fn>).mock.calls.map((c: unknown[]) => c[0] as string);
    expect(urls).toEqual([
      'https://api.github.com/repos/hiroto1977/-/commits/main',
      'https://api.github.com/repos/hiroto1977/-/actions/workflows/ci.yml/runs?branch=main&per_page=1',
      'https://api.github.com/repos/hiroto1977/-/actions/workflows/mutation.yml/runs?branch=main&per_page=1',
      'https://api.github.com/repos/hiroto1977/-/git/trees/main?recursive=1',
      'https://api.github.com/search/issues?q=repo%3Ahiroto1977%2F-+is%3Apr+is%3Aopen&per_page=1',
      'https://api.github.com/search/issues?q=repo%3Ahiroto1977%2F-+is%3Apr+is%3Aopen+review%3Aapproved&per_page=1',
      'https://api.github.com/search/issues?q=repo%3Ahiroto1977%2F-+is%3Apr+is%3Aopen+review%3Achanges_requested&per_page=1',
      'https://api.github.com/repos/hiroto1977/-/contents/docs/QUALITY.md',
    ]);
    const init = (jsonFetch as ReturnType<typeof vi.fn>).mock.calls[0]![1] as RequestInit;
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer tok');
  });

  it('QUALITY.md が読めなくても即時値は返る (report だけ null)', async () => {
    const snap = await fetchQualitySnapshotWith(stubFetch({ failContents: true }), 'tok');
    expect(snap.report).toBeNull();
    expect(snap.openPullRequests).toBe(7);
  });

  it('ワークフローの状態・結論は固定語彙だけを通す (長い文字列を画面へ通さない)', async () => {
    const big = 'x'.repeat(200_000);
    const jsonFetch = vi.fn<QualityJsonFetch>(async (url: string) => {
      if (url.includes('/workflows/')) {
        return {
          workflow_runs: [{ status: big, conclusion: big, updated_at: '2026-11-21T12:30:00Z', html_url: big }],
        };
      }
      return stubFetch()(url, {});
    });
    const snap = await fetchQualitySnapshotWith(jsonFetch, 'tok');
    expect(snap.ciRun?.status).toBe('');
    expect(snap.ciRun?.conclusion).toBeNull();
    // displayField の天井 (256 字 + 省略記号 1 字) に収まる。
    expect(snap.ciRun?.htmlUrl.length).toBeLessThanOrEqual(257);
  });

  it('ワークフローの履歴が無ければ run は null (0 件の成功にしない)', async () => {
    const jsonFetch = vi.fn<QualityJsonFetch>(async (url: string) => {
      if (url.includes('/workflows/')) return { workflow_runs: [] };
      return stubFetch()(url, {});
    });
    const snap = await fetchQualitySnapshotWith(jsonFetch, 'tok');
    expect(snap.ciRun).toBeNull();
    expect(snap.mutationRun).toBeNull();
  });

  it('trees が truncated なら件数は null (下限を実数と刷らない)', async () => {
    const jsonFetch = vi.fn<QualityJsonFetch>(async (url: string) => {
      if (url.includes('/git/trees/main')) return { truncated: true, tree: TREE_BODY.tree };
      return stubFetch()(url, {});
    });
    const snap = await fetchQualitySnapshotWith(jsonFetch, 'tok');
    expect(snap.testFileCount).toBeNull();
  });

  it('即時値の照会が落ちたら全体を落とす (空の成功にしない)', async () => {
    const jsonFetch = vi.fn<QualityJsonFetch>(async (url: string) => {
      if (url.includes('/commits/main')) throw new Error('401');
      return stubFetch()(url, {});
    });
    await expect(fetchQualitySnapshotWith(jsonFetch, 'bad')).rejects.toThrow('401');
  });
});
