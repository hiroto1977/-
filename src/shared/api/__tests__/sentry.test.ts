/**
 * Sentry 共有クライアントの検査 (2026-11-18)。
 *
 * ここは main (デスクトップ) と renderer (ブラウザ) の**両方**が呼ぶ。通信手段を差し替えられる形
 * そのものを固定し、応答の正規化は値ごと留める (読めない物を「無い」「0」と混ぜない)。
 */
import { describe, expect, it, vi } from 'vitest';
import {
  SENTRY_API_BASE,
  SENTRY_COUNT_UNREADABLE,
  SENTRY_ISSUE_LIMIT,
  SENTRY_LAST_SEEN_UNREADABLE,
  SENTRY_LEVEL_LABELS,
  SENTRY_LEVEL_UNREADABLE,
  SENTRY_ORGS_PATH,
  SENTRY_TITLE_MISSING,
  buildSentrySnapshot,
  fetchSentrySnapshotWith,
  normalizeSentryIssues,
  normalizeSentryOrgs,
  sentryCount,
  sentryCountText,
  sentryHeaders,
  sentryIntakeNote,
  sentryIssueMeta,
  sentryIssueTitle,
  sentryIssuesPath,
  sentryLastSeenText,
  sentryLevel,
  sentryLevelText,
  sentryOrgSlug,
  sentryScopeNote,
  type SentryIssue,
} from '../sentry';
import { rereadModule } from '../../__tests__/rereadModule';

const ORGS_URL = 'https://sentry.io/api/0/organizations/';
const ISSUES_URL = 'https://sentry.io/api/0/organizations/acme/issues/?query=is%3Aunresolved&limit=21';

const ROW = {
  shortId: 'WEB-1A',
  title: 'TypeError: x is undefined',
  level: 'error',
  count: '24',
  lastSeen: '2026-11-17T12:00:00Z',
  project: { name: 'web' },
};

const ISSUE: SentryIssue = {
  shortId: 'WEB-1A',
  title: 'TypeError: x is undefined',
  level: 'error',
  count: 24,
  lastSeen: '2026-11-17',
  projectName: 'web',
};

describe('直下の値', () => {
  it('送り先と件数', () => {
    expect(SENTRY_API_BASE).toBe('https://sentry.io/api/0');
    expect(SENTRY_ORGS_PATH).toBe('/organizations/');
    expect(SENTRY_ISSUE_LIMIT).toBe(20);
  });

  it('★ 直下の値を読み直しても同じ (文・URL を値ごと留める)', async () => {
    const m = await rereadModule<typeof import('../sentry')>(import.meta.url, '../sentry');
    expect(m.SENTRY_API_BASE).toBe('https://sentry.io/api/0');
    expect(m.SENTRY_ORGS_PATH).toBe('/organizations/');
    expect(m.SENTRY_ISSUE_LIMIT).toBe(20);
    expect(m.SENTRY_TITLE_MISSING).toBe('(題名なし)');
    expect(m.SENTRY_LEVEL_UNREADABLE).toBe('重大度が読めません');
    expect(m.SENTRY_COUNT_UNREADABLE).toBe('発生回数が読めません');
    expect(m.SENTRY_LAST_SEEN_UNREADABLE).toBe('最終発生日が読めません');
    expect(m.SENTRY_LEVEL_LABELS).toEqual({ fatal: '致命的', error: 'エラー', warning: '警告', info: '情報', debug: 'デバッグ' });
  });
});

describe('sentryOrgSlug', () => {
  it('小文字の英数字・ハイフン・下線の slug をそのまま返す', () => {
    for (const s of ['acme', 'a', '0', 'acme-inc', 'acme_inc', 'a1-b2_c3', 'a'.repeat(50)]) {
      expect(sentryOrgSlug(s), s).toBe(s);
    }
  });

  it('★ それ以外は空文字 (URL へ入れない)', () => {
    const bad = [
      '', 'Acme', '-acme', '_acme', 'acme/../x', 'acme?x=1', 'acme#x', 'acme inc', 'acme.inc', '../etc', 'a\nb',
      'a'.repeat(51), ' acme', 'acme ', 'acme\n', 'xacme/', 42, null, undefined, {}, ['acme'],
    ];
    for (const s of bad) expect(sentryOrgSlug(s), JSON.stringify(s)).toBe('');
  });
});

describe('sentryIssuesPath', () => {
  it('★ 未解決だけを、表示する件数より 1 件多く照会する', () => {
    expect(sentryIssuesPath('acme')).toBe('/organizations/acme/issues/?query=is%3Aunresolved&limit=21');
  });

  it('★ slug は符号化して入れる (関門を通らない値が来ても道を壊さない)', () => {
    expect(sentryIssuesPath('a/b?c')).toBe('/organizations/a%2Fb%3Fc/issues/?query=is%3Aunresolved&limit=21');
  });
});

describe('sentryLevel', () => {
  it('5 つの値をそのまま返す', () => {
    for (const l of ['fatal', 'error', 'warning', 'info', 'debug']) expect(sentryLevel(l)).toBe(l);
  });

  it('★ それ以外は null (prototype 側の名前・文字列でない値も)', () => {
    for (const v of ['critical', 'ERROR', '', 'constructor', '__proto__', 'toString', 3, null, undefined, {}, ['fatal']]) {
      expect(sentryLevel(v), JSON.stringify(v)).toBeNull();
    }
  });
});

describe('sentryCount', () => {
  it('0 以上の整数 (数・10 進の文字列) を数として返す', () => {
    expect(sentryCount('24')).toBe(24);
    expect(sentryCount(24)).toBe(24);
    expect(sentryCount('0')).toBe(0);
    expect(sentryCount(0)).toBe(0);
  });

  it('★ それ以外は null (0 と混ぜない)', () => {
    for (const v of ['-5', -5, '1.5', 1.5, 'たくさん', '', '1,234', NaN, Infinity, null, undefined, true, {}, [3]]) {
      expect(sentryCount(v), JSON.stringify(v)).toBeNull();
    }
  });
});

describe('normalizeSentryOrgs', () => {
  it('slug の読める組織だけを数え、1 つ目を使う', () => {
    expect(
      normalizeSentryOrgs([{ slug: 'BAD SLUG', name: 'x' }, { slug: 'acme', name: 'Acme' }, { slug: 'beta', name: 'Beta' }, null, 'x']),
    ).toEqual({ orgSlug: 'acme', orgName: 'Acme', orgCount: 2, read: true });
  });

  it('★ 空の配列は「読めた・0 個」', () => {
    expect(normalizeSentryOrgs([])).toEqual({ orgSlug: '', orgName: '', orgCount: 0, read: true });
  });

  it('★ 配列でない応答は「読めなかった」(投げない)', () => {
    for (const body of [{}, null, undefined, 'x', 42, { slug: 'acme' }]) {
      expect(normalizeSentryOrgs(body), JSON.stringify(body)).toEqual({ orgSlug: '', orgName: '', orgCount: 0, read: false });
    }
  });

  it('名前が読めない組織は空文字 (slug が読めれば使う)', () => {
    expect(normalizeSentryOrgs([{ slug: 'acme', name: 42 }])).toEqual({ orgSlug: 'acme', orgName: '', orgCount: 1, read: true });
  });
});

describe('normalizeSentryIssues', () => {
  it('問題を画面の形へ (回数は数へ・最終発生は日付へ)', () => {
    expect(normalizeSentryIssues([ROW])).toEqual({ issues: [ISSUE], read: true, more: false });
  });

  it('★ 読めない欄は null / 空文字 (行は落とさない・投げない)', () => {
    expect(
      normalizeSentryIssues([
        { shortId: 7, title: null, level: 'critical', count: 'x', lastSeen: 20261117, project: 'web' },
        {},
        { project: null },
        { project: { name: 9 } },
      ]).issues,
    ).toEqual(Array.from({ length: 4 }, () => ({ shortId: '', title: '', level: null, count: null, lastSeen: null, projectName: '' })));
  });

  it('物でない要素は数えない', () => {
    expect(normalizeSentryIssues([null, 'x', 3, [ROW], ROW])).toEqual({ issues: [ISSUE], read: true, more: false });
  });

  it('★ 空の配列は「読めた・0 件」、配列でない応答は「読めなかった」', () => {
    expect(normalizeSentryIssues([])).toEqual({ issues: [], read: true, more: false });
    for (const body of [{}, null, undefined, 'x', { detail: 'x' }]) {
      expect(normalizeSentryIssues(body), JSON.stringify(body)).toEqual({ issues: [], read: false, more: false });
    }
  });

  it('★ ちょうど 20 件は「ほかには無い」、21 件は先頭 20 件だけを出して「ほかにも在る」', () => {
    const rows = (n: number): unknown[] => Array.from({ length: n }, (_, i) => ({ ...ROW, shortId: `WEB-${i + 1}` }));
    const exact = normalizeSentryIssues(rows(20));
    expect(exact.issues).toHaveLength(20);
    expect(exact.more).toBe(false);
    const over = normalizeSentryIssues(rows(21));
    expect(over.issues).toHaveLength(20);
    expect(over.issues[0]!.shortId).toBe('WEB-1');
    expect(over.issues[19]!.shortId).toBe('WEB-20');
    expect(over.more).toBe(true);
  });
});

describe('buildSentrySnapshot', () => {
  const ORGS = { orgSlug: 'acme', orgName: 'Acme', orgCount: 2, read: true };

  it('2 つの照会の結果を画面の形へ', () => {
    expect(buildSentrySnapshot(ORGS, { issues: [ISSUE], read: true, more: true })).toEqual({
      orgName: 'Acme',
      orgCount: 2,
      issues: [ISSUE],
      orgsRead: true,
      issuesAsked: true,
      issuesRead: true,
      more: true,
    });
  });

  it('★ 問題を照会しなかったとき (null) は、照会していないと分かる形にする', () => {
    expect(buildSentrySnapshot({ orgSlug: '', orgName: '', orgCount: 0, read: false }, null)).toEqual({
      orgName: '',
      orgCount: 0,
      issues: [],
      orgsRead: false,
      issuesAsked: false,
      issuesRead: false,
      more: false,
    });
  });

  it('問題の一覧が読めなかったときは issuesRead が false (照会はした)', () => {
    const snap = buildSentrySnapshot(ORGS, { issues: [], read: false, more: false });
    expect(snap.issuesAsked).toBe(true);
    expect(snap.issuesRead).toBe(false);
    expect(snap.more).toBe(false);
  });
});

describe('画面に出す文', () => {
  it('題名: 番号つき。題名が空なら理由、番号が空なら題名だけ', () => {
    expect(sentryIssueTitle({ shortId: 'WEB-1A', title: 'TypeError' })).toBe('WEB-1A TypeError');
    expect(sentryIssueTitle({ shortId: 'WEB-1A', title: '' })).toBe('WEB-1A (題名なし)');
    expect(sentryIssueTitle({ shortId: '', title: 'TypeError' })).toBe('TypeError');
    expect(sentryIssueTitle({ shortId: '', title: '' })).toBe(SENTRY_TITLE_MISSING);
  });

  it('重大度: 5 つの呼び名と、読めないときの文', () => {
    expect(sentryLevelText('fatal')).toBe('致命的');
    expect(sentryLevelText('error')).toBe('エラー');
    expect(sentryLevelText('warning')).toBe('警告');
    expect(sentryLevelText('info')).toBe('情報');
    expect(sentryLevelText('debug')).toBe('デバッグ');
    expect(sentryLevelText(null)).toBe(SENTRY_LEVEL_UNREADABLE);
    expect(Object.keys(SENTRY_LEVEL_LABELS)).toEqual(['fatal', 'error', 'warning', 'info', 'debug']);
  });

  it('★ 型の外の値で引いても、表の外の値を返さない', () => {
    for (const v of ['constructor', '__proto__', 'toString', 'critical', 7]) {
      expect(sentryLevelText(v as never), String(v)).toBe('重大度が読めません');
    }
  });

  it('発生回数: 桁区切りつき。0 回は 0 回、読めなければ理由', () => {
    expect(sentryCountText(24)).toBe('発生 24 回');
    expect(sentryCountText(1234567)).toBe('発生 1,234,567 回');
    expect(sentryCountText(0)).toBe('発生 0 回');
    expect(sentryCountText(null)).toBe(SENTRY_COUNT_UNREADABLE);
  });

  it('最終発生日: 日付つき。読めなければ理由', () => {
    expect(sentryLastSeenText('2026-11-17')).toBe('最終発生 2026-11-17');
    expect(sentryLastSeenText(null)).toBe(SENTRY_LAST_SEEN_UNREADABLE);
  });

  it('補足の行: プロジェクト · 重大度 · 発生回数 · 最終発生日', () => {
    expect(sentryIssueMeta(ISSUE)).toBe('web · 重大度: エラー · 発生 24 回 · 最終発生 2026-11-17');
  });

  it('★ 補足の行: 読めなかったプロジェクト名は並べず、読めなかった値は理由を述べる', () => {
    expect(sentryIssueMeta({ ...ISSUE, projectName: '', level: null, count: null, lastSeen: null })).toBe(
      '重大度: 重大度が読めません · 発生回数が読めません · 最終発生日が読めません',
    );
  });
});

describe('sentryIntakeNote', () => {
  const ok = { orgsRead: true, issuesAsked: true, issuesRead: true };

  it('全部読めていれば null', () => {
    expect(sentryIntakeNote(ok)).toBeNull();
  });

  it('★ 原因は上流から順に 1 つだけ述べる', () => {
    expect(sentryIntakeNote({ orgsRead: false, issuesAsked: false, issuesRead: false })).toBe(
      'Sentry の応答から組織の一覧を読み取れませんでした (問題は照会していません)。',
    );
    expect(sentryIntakeNote({ orgsRead: true, issuesAsked: false, issuesRead: false })).toBe(
      'Sentry の応答に、読める組織がありませんでした (問題は照会していません)。',
    );
    expect(sentryIntakeNote({ ...ok, issuesRead: false })).toBe(
      'Sentry の応答から未解決の問題の一覧を読み取れませんでした (0 件という意味ではありません)。',
    );
  });
});

describe('sentryScopeNote', () => {
  it('見ていない物が無ければ null (組織が 1 つ・0 個のとき)', () => {
    expect(sentryScopeNote({ orgCount: 1, orgName: 'Acme', more: false })).toBeNull();
    expect(sentryScopeNote({ orgCount: 0, orgName: '', more: false })).toBeNull();
  });

  it('★ 組織が 2 つ以上なら、見ているのが 1 つ目だけだと述べる', () => {
    expect(sentryScopeNote({ orgCount: 2, orgName: 'Acme', more: false })).toBe(
      '組織が 2 個あります。表示しているのは 1 つ目 (Acme)の問題だけです。',
    );
    expect(sentryScopeNote({ orgCount: 3, orgName: '', more: false })).toBe(
      '組織が 3 個あります。表示しているのは 1 つ目の問題だけです。',
    );
  });

  it('★ ほかにも問題が在れば、先頭 20 件までだと述べる (両方なら 2 文を空白でつなぐ)', () => {
    expect(sentryScopeNote({ orgCount: 1, orgName: 'Acme', more: true })).toBe(
      '未解決の問題はほかにもあります (先頭 20 件までを表示しています)。',
    );
    expect(sentryScopeNote({ orgCount: 2, orgName: 'Acme', more: true })).toBe(
      '組織が 2 個あります。表示しているのは 1 つ目 (Acme)の問題だけです。 未解決の問題はほかにもあります (先頭 20 件までを表示しています)。',
    );
  });
});

describe('sentryHeaders', () => {
  it('鍵は Authorization: Bearer にだけ置く', () => {
    expect(sentryHeaders('sntryu_example')).toEqual({ Authorization: 'Bearer sntryu_example' });
  });
});

describe('fetchSentrySnapshotWith', () => {
  type Fetch = (url: string, init: RequestInit) => Promise<unknown>;

  it('★ 組織 → 1 つ目の組織の問題、の順に 2 回だけ照会する (どちらも同じヘッダ・本文なし)', async () => {
    const jsonFetch = vi.fn<Fetch>().mockResolvedValueOnce([{ slug: 'acme', name: 'Acme' }, { slug: 'beta', name: 'Beta' }]).mockResolvedValueOnce([ROW]);
    const snap = await fetchSentrySnapshotWith(jsonFetch, 'sntryu_example');
    expect(snap).toEqual({
      orgName: 'Acme',
      orgCount: 2,
      issues: [ISSUE],
      orgsRead: true,
      issuesAsked: true,
      issuesRead: true,
      more: false,
    });
    expect(jsonFetch.mock.calls).toEqual([
      [ORGS_URL, { headers: { Authorization: 'Bearer sntryu_example' } }],
      [ISSUES_URL, { headers: { Authorization: 'Bearer sntryu_example' } }],
    ]);
  });

  it('★ 読める組織が無ければ、問題は照会しない', async () => {
    for (const orgs of [[], [{ slug: 'BAD/SLUG' }], {}, null]) {
      const jsonFetch = vi.fn<Fetch>().mockResolvedValueOnce(orgs);
      const snap = await fetchSentrySnapshotWith(jsonFetch, 't');
      expect(snap.issuesAsked, JSON.stringify(orgs)).toBe(false);
      expect(snap.issues).toEqual([]);
      expect(jsonFetch).toHaveBeenCalledTimes(1);
    }
  });

  it('問題の一覧が配列でなければ「読めなかった」(0 件と混ぜない)', async () => {
    const jsonFetch = vi.fn<Fetch>().mockResolvedValueOnce([{ slug: 'acme', name: 'Acme' }]).mockResolvedValueOnce({ detail: 'x' });
    const snap = await fetchSentrySnapshotWith(jsonFetch, 't');
    expect(snap.issuesAsked).toBe(true);
    expect(snap.issuesRead).toBe(false);
  });

  it('通信手段の失敗はそのまま上へ出す (握りつぶして見本や 0 件にしない)', async () => {
    const jsonFetch = vi.fn<Fetch>().mockRejectedValueOnce(new Error('boom'));
    await expect(fetchSentrySnapshotWith(jsonFetch, 't')).rejects.toThrow('boom');
  });
});
