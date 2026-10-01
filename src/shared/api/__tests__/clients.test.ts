import { describe, expect, it, vi } from 'vitest';
import {
  GithubClient,
  WordPressClient,
  AtlassianClient,
  NotionClient,
  DriveClient,
  CalendarClient,
  GmailClient,
  SlackClient,
  CanvaClient,
  NotConfiguredError,
  NotImplementedError,
  ApiError,
  normalizeAtlassianSite,
} from '../index';

/**
 * 認証ガードを検証する: 資格情報なしで呼ぶと NotConfiguredError が投げられ、メッセージに
 * サービス ID を含むことを確認する。`readonly id` の StringLiteral と `!isConfigured()` ガードの
 * true 方向 (常に throw) を撃墜する。
 */
async function expectGuard(promise: Promise<unknown>, id: string): Promise<void> {
  const err = await promise.catch((e: unknown) => e);
  expect(err).toBeInstanceOf(NotConfiguredError);
  expect((err as Error).message).toContain(id);
}

/** `Response` の必要な面だけを持つ替え玉。 */
function res(body: unknown, init: { ok?: boolean; status?: number; text?: string } = {}): Response {
  return {
    ok: init.ok ?? true,
    status: init.status ?? 200,
    json: async () => body,
    // `apiFetch` は本文を `readBodyWithCap` で読む (上限を掛けるため)。
    // `res.body` を持たない素朴なモックでは `text()` に落ちるので、
    // 成功時の本文はここで直列化して渡す。
    text: async () => init.text ?? JSON.stringify(body),
  } as unknown as Response;
}

function fetchOnce(body: unknown, init?: { ok?: boolean; status?: number; text?: string }) {
  return vi.fn<typeof fetch>().mockResolvedValue(res(body, init));
}

/** 直近の呼び出しの URL。 */
function urlOf(f: ReturnType<typeof fetchOnce>): string {
  return String(f.mock.calls[0]?.[0]);
}
/** 直近の呼び出しの init。 */
function initOf(f: ReturnType<typeof fetchOnce>): RequestInit {
  return (f.mock.calls[0]?.[1] ?? {}) as RequestInit;
}
function headersOf(f: ReturnType<typeof fetchOnce>): Record<string, string> {
  return (initOf(f).headers ?? {}) as Record<string, string>;
}
function bodyOf(f: ReturnType<typeof fetchOnce>): Record<string, unknown> {
  return JSON.parse(String(initOf(f).body)) as Record<string, unknown>;
}
/** URLSearchParams は空白を `+` にするので、読める形に戻してから照合する。 */
function decodedUrl(f: ReturnType<typeof fetchOnce>): string {
  return decodeURIComponent(urlOf(f).replace(/\+/g, ' '));
}

describe('ServiceClient — isConfigured', () => {
  it('returns false when no credentials and true with a token (Boolean coercion)', () => {
    // toBe(true/false) で Boolean() 除去 (MethodExpression) も撃墜 (token 文字列は !== true)。
    for (const Client of [GithubClient, WordPressClient, NotionClient, DriveClient, CalendarClient, GmailClient, SlackClient, CanvaClient]) {
      expect(new Client().isConfigured()).toBe(false);
      expect(new Client({ token: 'x' }).isConfigured()).toBe(true);
    }
  });

  it('Atlassian requires BOTH token and baseUrl (&& logical operator)', () => {
    expect(new AtlassianClient().isConfigured()).toBe(false);
    expect(new AtlassianClient({ token: 't' }).isConfigured()).toBe(false);
    expect(new AtlassianClient({ baseUrl: 'u' }).isConfigured()).toBe(false);
    expect(new AtlassianClient({ token: 't', baseUrl: 'u' }).isConfigured()).toBe(true);
  });
});

describe('ServiceClient — guards reject without credentials (carrying the service id)', () => {
  it('GithubClient', async () => {
    await expectGuard(new GithubClient().listRepos(), 'github');
    await expectGuard(new GithubClient().listPullRequests(), 'github');
    await expectGuard(new GithubClient().listIssues(), 'github');
  });
  it('WordPressClient', async () => {
    await expectGuard(new WordPressClient().listSites(), 'wordpress');
    await expectGuard(new WordPressClient().createPostDraft('s', {}), 'wordpress');
    await expectGuard(new WordPressClient().checkDomainAvailability('d.com'), 'wordpress');
  });
  it('AtlassianClient', async () => {
    await expectGuard(new AtlassianClient().searchJira('jql'), 'atlassian');
    await expectGuard(new AtlassianClient().getConfluencePage('p'), 'atlassian');
    await expectGuard(new AtlassianClient().listCompassComponents(), 'atlassian');
  });
  it('NotionClient', async () => {
    await expectGuard(new NotionClient().search('q'), 'notion');
    await expectGuard(new NotionClient().createPage({}), 'notion');
  });
  it('Google clients (drive / calendar / gmail)', async () => {
    await expectGuard(new DriveClient().listRecent(), 'drive');
    await expectGuard(new DriveClient().search('q'), 'drive');
    await expectGuard(new CalendarClient().listEvents(), 'calendar');
    await expectGuard(new CalendarClient().createEvent({}), 'calendar');
    await expectGuard(new GmailClient().searchThreads('q'), 'gmail');
    await expectGuard(new GmailClient().listLabels(), 'gmail');
  });
  it('SlackClient', async () => {
    await expectGuard(new SlackClient().searchChannels('q'), 'slack');
    await expectGuard(new SlackClient().sendMessage('c', 'm'), 'slack');
    await expectGuard(new SlackClient().readThread('c', 'ts'), 'slack');
  });
  it('CanvaClient', async () => {
    await expectGuard(new CanvaClient().searchDesigns('q'), 'canva');
    await expectGuard(new CanvaClient().generateDesign('p'), 'canva');
    await expectGuard(new CanvaClient().exportDesign('id', 'pdf'), 'canva');
  });
});

describe('GithubClient', () => {
  const RAW_REPO = {
    id: 7,
    name: 'hub',
    full_name: 'me/hub',
    private: true,
    html_url: 'https://github.com/me/hub',
    updated_at: '2026-08-01T00:00:00Z',
  };

  it('listRepos は /user/repos を更新順で引き、camelCase に直す', async () => {
    const f = fetchOnce([RAW_REPO]);
    const out = await new GithubClient({ token: 'tok' }, f).listRepos();
    expect(urlOf(f)).toBe('https://api.github.com/user/repos?per_page=30&sort=updated');
    expect(out).toEqual([
      {
        id: 7,
        name: 'hub',
        fullName: 'me/hub',
        private: true,
        htmlUrl: 'https://github.com/me/hub',
        updatedAt: '2026-08-01T00:00:00Z',
      },
    ]);
  });

  it('perPage を渡せる', async () => {
    const f = fetchOnce([]);
    await new GithubClient({ token: 'tok' }, f).listRepos(5);
    expect(urlOf(f)).toContain('per_page=5');
  });

  it('API バージョンと Accept を送る', async () => {
    const f = fetchOnce([]);
    await new GithubClient({ token: 'tok' }, f).listRepos();
    expect(headersOf(f)).toEqual({
      Authorization: 'Bearer tok',
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
    });
  });

  it('listPullRequests は search を使い、items が無くても落ちない', async () => {
    const f = fetchOnce({});
    const out = await new GithubClient({ token: 'tok' }, f).listPullRequests();
    expect(urlOf(f)).toBe(
      'https://api.github.com/search/issues?q=is%3Apr+author%3A%40me+is%3Aopen&per_page=30&sort=updated',
    );
    expect(out).toEqual([]);
  });

  it('pull_request の有無で PR かどうかを見分ける', async () => {
    const base = { number: 1, title: 't', state: 'open', html_url: 'u', updated_at: 'd' };
    const f = fetchOnce({ items: [{ ...base, pull_request: {} }, { ...base, number: 2 }] });
    const out = await new GithubClient({ token: 'tok' }, f).listPullRequests();
    expect(out.map((x) => x.isPullRequest)).toEqual([true, false]);
    expect(out[0]).toEqual({
      number: 1,
      title: 't',
      state: 'open',
      htmlUrl: 'u',
      updatedAt: 'd',
      isPullRequest: true,
    });
  });

  it('listIssues は assigned な open issue を引く', async () => {
    const f = fetchOnce([]);
    await new GithubClient({ token: 'tok' }, f).listIssues();
    expect(urlOf(f)).toBe(
      'https://api.github.com/issues?per_page=30&filter=assigned&state=open',
    );
  });

  it('HTTP エラーは ApiError として伝わる', async () => {
    const f = fetchOnce(null, { ok: false, status: 401, text: 'unauthorized' });
    const err = await new GithubClient({ token: 'tok' }, f).listRepos().catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).status).toBe(401);
  });
});

describe('WordPressClient', () => {
  it('listSites はサイト一覧を整形する', async () => {
    const f = fetchOnce({ sites: [{ ID: 3, name: 'blog', URL: 'https://b.test' }] });
    const out = await new WordPressClient({ token: 'tok' }, f).listSites();
    expect(urlOf(f)).toBe('https://public-api.wordpress.com/rest/v1.1/me/sites');
    expect(headersOf(f)).toEqual({ Authorization: 'Bearer tok' });
    expect(out).toEqual([{ id: 3, name: 'blog', url: 'https://b.test' }]);
  });

  it('sites が無い応答でも空配列にする', async () => {
    const f = fetchOnce({});
    await expect(new WordPressClient({ token: 'tok' }, f).listSites()).resolves.toEqual([]);
  });

  it('createPostDraft は siteId をエスケープして new へ送る', async () => {
    const f = fetchOnce({ ID: 9, title: 't', status: 'draft', URL: 'https://b.test/9' });
    const out = await new WordPressClient({ token: 'tok' }, f).createPostDraft('a/b', { title: 't' });
    expect(urlOf(f)).toBe('https://public-api.wordpress.com/rest/v1.1/sites/a%2Fb/posts/new');
    expect(initOf(f).method).toBe('POST');
    expect(out).toEqual({ id: 9, title: 't', status: 'draft', url: 'https://b.test/9' });
  });

  it('呼び出し側が status:publish を渡しても下書きに固定する', async () => {
    // メソッド名が下書きだと言っている以上、渡された status で公開されるのは事故。
    const f = fetchOnce({ ID: 1, title: 't', status: 'draft', URL: 'u' });
    await new WordPressClient({ token: 'tok' }, f).createPostDraft('s', {
      title: 't',
      status: 'publish',
    });
    expect(bodyOf(f)).toEqual({ title: 't', status: 'draft' });
  });

  it('checkDomainAvailability は status を available に翻訳する', async () => {
    const f = fetchOnce({ status: 'available' });
    const out = await new WordPressClient({ token: 'tok' }, f).checkDomainAvailability('a.test');
    expect(urlOf(f)).toBe('https://public-api.wordpress.com/rest/v1.1/domains/a.test/is-available');
    expect(out).toEqual({ domain: 'a.test', available: true, status: 'available' });
  });

  it('available 以外は使えない扱いにする', async () => {
    const f = fetchOnce({ status: 'taken' });
    await expect(
      new WordPressClient({ token: 'tok' }, f).checkDomainAvailability('a.test'),
    ).resolves.toEqual({ domain: 'a.test', available: false, status: 'taken' });
  });

  it('status が無い応答は「使える」と誤解しない', async () => {
    const f = fetchOnce({});
    await expect(
      new WordPressClient({ token: 'tok' }, f).checkDomainAvailability('a.test'),
    ).resolves.toEqual({ domain: 'a.test', available: false, status: '' });
  });
});

describe('NotionClient', () => {
  it('search は POST /v1/search に query を載せ、Notion-Version を送る', async () => {
    const f = fetchOnce({ results: [{ id: 'p1', object: 'page', url: 'u', last_edited_time: 't' }] });
    const out = await new NotionClient({ token: 'tok' }, f).search('見積');
    expect(urlOf(f)).toBe('https://api.notion.com/v1/search');
    expect(initOf(f).method).toBe('POST');
    expect(headersOf(f)['Notion-Version']).toBe('2022-06-28');
    expect(bodyOf(f)).toEqual({ query: '見積' });
    expect(out).toEqual([{ id: 'p1', object: 'page', url: 'u', lastEditedTime: 't' }]);
  });

  it('results が無くても空配列', async () => {
    const f = fetchOnce({});
    await expect(new NotionClient({ token: 'tok' }, f).search('q')).resolves.toEqual([]);
  });

  it('url / last_edited_time が欠けても空文字で埋める', async () => {
    const f = fetchOnce({ results: [{ id: 'p1', object: 'page' }] });
    await expect(new NotionClient({ token: 'tok' }, f).search('q')).resolves.toEqual([
      { id: 'p1', object: 'page', url: '', lastEditedTime: '' },
    ]);
  });

  it('createPage は payload をそのまま送る', async () => {
    const f = fetchOnce({ id: 'n1', object: 'page', url: 'u', last_edited_time: 't' });
    const out = await new NotionClient({ token: 'tok' }, f).createPage({ parent: { page_id: 'x' } });
    expect(urlOf(f)).toBe('https://api.notion.com/v1/pages');
    expect(bodyOf(f)).toEqual({ parent: { page_id: 'x' } });
    expect(out).toEqual({ id: 'n1', object: 'page', url: 'u', lastEditedTime: 't' });
  });

  it('createPage の応答に url が無くても空文字で埋める', async () => {
    const f = fetchOnce({ id: 'n1', object: 'page' });
    await expect(new NotionClient({ token: 'tok' }, f).createPage({})).resolves.toEqual({
      id: 'n1',
      object: 'page',
      url: '',
      lastEditedTime: '',
    });
  });
});

describe('SlackClient', () => {
  const CH = { id: 'C1', name: 'general', is_private: false };

  it('searchChannels は conversations.list を引いて名前で絞る', async () => {
    const f = fetchOnce({ ok: true, channels: [CH, { id: 'C2', name: 'random' }] });
    const out = await new SlackClient({ token: 'tok' }, f).searchChannels('gene');
    expect(urlOf(f)).toBe(
      'https://slack.com/api/conversations.list?types=public_channel%2Cprivate_channel&exclude_archived=true&limit=200',
    );
    expect(out).toEqual([{ id: 'C1', name: 'general', isPrivate: false }]);
  });

  it('空クエリなら全件返す', async () => {
    const f = fetchOnce({ ok: true, channels: [CH, { id: 'C2', name: 'random' }] });
    const out = await new SlackClient({ token: 'tok' }, f).searchChannels('  ');
    expect(out.map((c) => c.id)).toEqual(['C1', 'C2']);
  });

  it('大文字小文字を無視して照合する', async () => {
    const f = fetchOnce({ ok: true, channels: [CH] });
    await expect(new SlackClient({ token: 'tok' }, f).searchChannels('GENERAL')).resolves.toHaveLength(1);
  });

  it('非公開チャンネルを非公開として返す', async () => {
    const f = fetchOnce({ ok: true, channels: [{ id: 'C9', name: 'secret', is_private: true }] });
    const out = await new SlackClient({ token: 'tok' }, f).searchChannels('secret');
    expect(out[0]?.isPrivate).toBe(true);
  });

  it('is_private が無ければ公開扱いにする', async () => {
    const f = fetchOnce({ ok: true, channels: [{ id: 'C3', name: 'x' }] });
    const out = await new SlackClient({ token: 'tok' }, f).searchChannels('x');
    expect(out[0]?.isPrivate).toBe(false);
  });

  it('limit を渡せる', async () => {
    const f = fetchOnce({ ok: true, channels: [] });
    await new SlackClient({ token: 'tok' }, f).searchChannels('x', 10);
    expect(urlOf(f)).toContain('limit=10');
  });

  it('channels が無くても空配列', async () => {
    const f = fetchOnce({ ok: true });
    await expect(new SlackClient({ token: 'tok' }, f).searchChannels('x')).resolves.toEqual([]);
  });

  it('sendMessage は chat.postMessage に POST する', async () => {
    const f = fetchOnce({ ok: true, ts: '1.2', channel: 'C1' });
    const out = await new SlackClient({ token: 'tok' }, f).sendMessage('C1', 'hi');
    expect(urlOf(f)).toBe('https://slack.com/api/chat.postMessage');
    expect(bodyOf(f)).toEqual({ channel: 'C1', text: 'hi' });
    expect(out).toEqual({ ts: '1.2', channel: 'C1' });
  });

  it('sendMessage の応答に channel が無ければ渡した channel を返す', async () => {
    const f = fetchOnce({ ok: true });
    await expect(new SlackClient({ token: 'tok' }, f).sendMessage('C9', 'hi')).resolves.toEqual({
      ts: '',
      channel: 'C9',
    });
  });

  it('HTTP 200 でも ok:false なら送信成功にしない', async () => {
    const f = fetchOnce({ ok: false, error: 'not_in_channel' });
    const err = await new SlackClient({ token: 'tok' }, f).sendMessage('C1', 'hi').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).message).toContain('not_in_channel');
  });

  it('readThread は conversations.replies を引く', async () => {
    const f = fetchOnce({ ok: true, messages: [{ ts: '1.0', user: 'U1', text: 'a' }, { ts: '1.1' }] });
    const out = await new SlackClient({ token: 'tok' }, f).readThread('C1', '1.0');
    expect(urlOf(f)).toBe('https://slack.com/api/conversations.replies?channel=C1&ts=1.0');
    expect(out).toEqual([
      { ts: '1.0', user: 'U1', text: 'a' },
      { ts: '1.1', user: '', text: '' },
    ]);
  });

  it('messages が無くても空配列', async () => {
    const f = fetchOnce({ ok: true });
    await expect(new SlackClient({ token: 'tok' }, f).readThread('C1', '1.0')).resolves.toEqual([]);
  });
});

describe('DriveClient', () => {
  const FILE = {
    id: 'f1',
    name: 'a.txt',
    mimeType: 'text/plain',
    modifiedTime: 't',
    webViewLink: 'u',
  };

  it('listRecent は更新の新しい順で引く', async () => {
    const f = fetchOnce({ files: [FILE] });
    const out = await new DriveClient({ token: 'tok' }, f).listRecent();
    expect(urlOf(f)).toBe(
      'https://www.googleapis.com/drive/v3/files?fields=files%28id%2Cname%2CmimeType%2CmodifiedTime%2CwebViewLink%29&orderBy=modifiedTime+desc&pageSize=20',
    );
    expect(out).toEqual([{ id: 'f1', name: 'a.txt', mimeType: 'text/plain', modifiedTime: 't', webViewLink: 'u' }]);
  });

  it('pageSize を渡せる', async () => {
    const f = fetchOnce({ files: [] });
    await new DriveClient({ token: 'tok' }, f).listRecent(3);
    expect(urlOf(f)).toContain('pageSize=3');
  });

  it('欠けたフィールドは空文字で埋める', async () => {
    const f = fetchOnce({ files: [{ id: 'f1', name: 'a' }] });
    await expect(new DriveClient({ token: 'tok' }, f).listRecent()).resolves.toEqual([
      { id: 'f1', name: 'a', mimeType: '', modifiedTime: '', webViewLink: '' },
    ]);
  });

  it('files が無くても空配列', async () => {
    const f = fetchOnce({});
    await expect(new DriveClient({ token: 'tok' }, f).listRecent()).resolves.toEqual([]);
  });

  it('search は name contains のクエリを組む', async () => {
    const f = fetchOnce({ files: [] });
    await new DriveClient({ token: 'tok' }, f).search('報告');
    expect(decodedUrl(f)).toContain("q=name contains '報告'");
  });

  it("シングルクォートを退避する（クエリ言語として解釈させない）", async () => {
    const f = fetchOnce({ files: [] });
    await new DriveClient({ token: 'tok' }, f).search("a' or name contains 'b");
    expect(decodedUrl(f)).toContain("name contains 'a\\' or name contains \\'b'");
  });

  it('バックスラッシュも退避する', async () => {
    const f = fetchOnce({ files: [] });
    await new DriveClient({ token: 'tok' }, f).search('a\\b');
    expect(decodedUrl(f)).toContain("name contains 'a\\\\b'");
  });
});

describe('CalendarClient', () => {
  it('listEvents は primary カレンダーを開始順で引く', async () => {
    const f = fetchOnce({ items: [] });
    await new CalendarClient({ token: 'tok' }, f).listEvents('A', 'B');
    expect(urlOf(f)).toBe(
      'https://www.googleapis.com/calendar/v3/calendars/primary/events?timeMin=A&timeMax=B&maxResults=20&singleEvents=true&orderBy=startTime',
    );
  });

  it('timeMin / timeMax は省略できる', async () => {
    const f = fetchOnce({ items: [] });
    await new CalendarClient({ token: 'tok' }, f).listEvents();
    expect(urlOf(f)).toBe(
      'https://www.googleapis.com/calendar/v3/calendars/primary/events?maxResults=20&singleEvents=true&orderBy=startTime',
    );
  });

  it('時刻つき予定は dateTime を採る', async () => {
    const f = fetchOnce({
      items: [{ id: 'e1', summary: 's', start: { dateTime: 'S' }, end: { dateTime: 'E' }, htmlLink: 'l' }],
    });
    await expect(new CalendarClient({ token: 'tok' }, f).listEvents()).resolves.toEqual([
      { id: 'e1', summary: 's', start: 'S', end: 'E', htmlLink: 'l' },
    ]);
  });

  it('終日予定は date を採る', async () => {
    const f = fetchOnce({ items: [{ id: 'e2', start: { date: '2026-08-13' }, end: { date: '2026-08-14' } }] });
    await expect(new CalendarClient({ token: 'tok' }, f).listEvents()).resolves.toEqual([
      { id: 'e2', summary: '', start: '2026-08-13', end: '2026-08-14', htmlLink: '' },
    ]);
  });

  it('start / end がどちらも無ければ空文字', async () => {
    const f = fetchOnce({ items: [{ id: 'e3' }] });
    await expect(new CalendarClient({ token: 'tok' }, f).listEvents()).resolves.toEqual([
      { id: 'e3', summary: '', start: '', end: '', htmlLink: '' },
    ]);
  });

  it('items が無くても空配列', async () => {
    const f = fetchOnce({});
    await expect(new CalendarClient({ token: 'tok' }, f).listEvents()).resolves.toEqual([]);
  });

  it('createEvent は POST し、作られた予定を返す', async () => {
    const f = fetchOnce({ id: 'n1', summary: 'x', start: { dateTime: 'S' }, end: { dateTime: 'E' }, htmlLink: 'l' });
    const out = await new CalendarClient({ token: 'tok' }, f).createEvent({ summary: 'x' });
    expect(urlOf(f)).toBe('https://www.googleapis.com/calendar/v3/calendars/primary/events');
    expect(initOf(f).method).toBe('POST');
    expect(bodyOf(f)).toEqual({ summary: 'x' });
    expect(out).toEqual({ id: 'n1', summary: 'x', start: 'S', end: 'E', htmlLink: 'l' });
  });
});

describe('GmailClient', () => {
  it('searchThreads は q を渡す', async () => {
    const f = fetchOnce({ threads: [{ id: 't1', snippet: 's', historyId: 'h' }] });
    const out = await new GmailClient({ token: 'tok' }, f).searchThreads('is:unread');
    expect(urlOf(f)).toBe('https://gmail.googleapis.com/gmail/v1/users/me/threads?q=is%3Aunread&maxResults=20');
    expect(out).toEqual([{ id: 't1', snippet: 's', historyId: 'h' }]);
  });

  it('maxResults を渡せる', async () => {
    const f = fetchOnce({ threads: [] });
    await new GmailClient({ token: 'tok' }, f).searchThreads('q', 4);
    expect(urlOf(f)).toContain('maxResults=4');
  });

  it('欠けたフィールドは空文字で埋め、threads 無しは空配列', async () => {
    const f1 = fetchOnce({ threads: [{ id: 't1' }] });
    await expect(new GmailClient({ token: 'tok' }, f1).searchThreads('q')).resolves.toEqual([
      { id: 't1', snippet: '', historyId: '' },
    ]);
    const f2 = fetchOnce({});
    await expect(new GmailClient({ token: 'tok' }, f2).searchThreads('q')).resolves.toEqual([]);
  });

  it('listLabels はラベル一覧を返す', async () => {
    const f = fetchOnce({ labels: [{ id: 'L1', name: 'INBOX', type: 'system' }, { id: 'L2', name: 'x' }] });
    const out = await new GmailClient({ token: 'tok' }, f).listLabels();
    expect(urlOf(f)).toBe('https://gmail.googleapis.com/gmail/v1/users/me/labels');
    expect(out).toEqual([
      { id: 'L1', name: 'INBOX', type: 'system' },
      { id: 'L2', name: 'x', type: '' },
    ]);
  });

  it('labels が無くても空配列', async () => {
    const f = fetchOnce({});
    await expect(new GmailClient({ token: 'tok' }, f).listLabels()).resolves.toEqual([]);
  });
});

describe('normalizeAtlassianSite', () => {
  it('ホスト名だけに正規化する（貼り付け事故の末尾スラッシュを落とす）', () => {
    expect(normalizeAtlassianSite('https://x.atlassian.net//')).toBe('https://x.atlassian.net');
    expect(normalizeAtlassianSite('https://x.atlassian.net/wiki/spaces')).toBe('https://x.atlassian.net');
  });

  it('制御文字を弾く（改行やヌルでログ行を割らせない）', () => {
    for (const code of [0x00, 0x0a, 0x0d, 0x1f, 0x7f]) {
      const bad = `https://x.atlassian.net${String.fromCharCode(code)}`;
      const err = (() => {
        try {
          normalizeAtlassianSite(bad);
          return null;
        } catch (e) {
          return e;
        }
      })();
      expect(err, `code ${code} が素通りした`).toBeInstanceOf(ApiError);
      expect((err as ApiError).message).toContain('制御文字');
    }
  });

  it('制御文字でない記号は弾かない（0x20 と 0x7f の境界）', () => {
    // 0x7e (~) は制御文字ではないので通り、パスは落ちてホスト名だけが残る。
    expect(normalizeAtlassianSite('https://x.atlassian.net/~a')).toBe('https://x.atlassian.net');
  });

  it('URL として読めないものを弾く', () => {
    expect(() => normalizeAtlassianSite('not a url')).toThrow(/URL として解釈できません/);
  });

  it('弾いたエラーは serviceId を持つ（どのサービスの失敗か分かるように）', () => {
    for (const bad of ['not a url', 'http://x.atlassian.net', 'https://evil.test', 'https://x.atlassian.net\u0000']) {
      const err = (() => {
        try {
          normalizeAtlassianSite(bad);
          return null;
        } catch (e) {
          return e;
        }
      })();
      expect((err as ApiError).serviceId).toBe('atlassian');
      expect((err as ApiError).status).toBe(0);
    }
  });

  it('http を弾く（平文で資格情報を送らせない）', () => {
    expect(() => normalizeAtlassianSite('http://x.atlassian.net')).toThrow(/https/);
  });

  it('atlassian.net 以外のホストを弾く（社内ホストへ向けさせない）', () => {
    expect(() => normalizeAtlassianSite('https://evil.test')).toThrow(/atlassian\.net/);
    expect(() => normalizeAtlassianSite('https://x.atlassian.net.evil.test')).toThrow(/atlassian\.net/);
  });
});

describe('AtlassianClient', () => {
  const CREDS = { token: 'tok', baseUrl: 'https://x.atlassian.net' };

  it('searchJira は JQL と欲しいフィールドを渡す', async () => {
    const f = fetchOnce({ issues: [{ key: 'AB-1', fields: { summary: 's', status: { name: 'Done' } } }] });
    const out = await new AtlassianClient(CREDS, f).searchJira('project = AB');
    expect(urlOf(f)).toBe(
      'https://x.atlassian.net/rest/api/3/search?jql=project+%3D+AB&maxResults=50&fields=summary%2Cstatus',
    );
    expect(out).toEqual([{ key: 'AB-1', summary: 's', status: 'Done' }]);
  });

  it('maxResults を渡せる', async () => {
    const f = fetchOnce({ issues: [] });
    await new AtlassianClient(CREDS, f).searchJira('x', 7);
    expect(urlOf(f)).toContain('maxResults=7');
  });

  it('JSON を要求するヘッダを送る（両メソッドとも）', async () => {
    const expected = { Authorization: 'Bearer tok', Accept: 'application/json' };
    const f1 = fetchOnce({ issues: [] });
    await new AtlassianClient(CREDS, f1).searchJira('x');
    expect(headersOf(f1)).toEqual(expected);
    const f2 = fetchOnce({ id: 'p' });
    await new AtlassianClient(CREDS, f2).getConfluencePage('p');
    expect(headersOf(f2)).toEqual(expected);
  });

  it('fields はあるが status が無い応答でも落ちない', async () => {
    const f = fetchOnce({ issues: [{ key: 'AB-3', fields: { summary: 's' } }] });
    await expect(new AtlassianClient(CREDS, f).searchJira('x')).resolves.toEqual([
      { key: 'AB-3', summary: 's', status: '' },
    ]);
  });

  it('fields が欠けても空文字で埋め、issues 無しは空配列', async () => {
    const f1 = fetchOnce({ issues: [{ key: 'AB-2' }] });
    await expect(new AtlassianClient(CREDS, f1).searchJira('x')).resolves.toEqual([
      { key: 'AB-2', summary: '', status: '' },
    ]);
    const f2 = fetchOnce({});
    await expect(new AtlassianClient(CREDS, f2).searchJira('x')).resolves.toEqual([]);
  });

  it('getConfluencePage は v2 のページ API を引く', async () => {
    const f = fetchOnce({ id: 'p1', title: 'T', spaceId: 'S' });
    const out = await new AtlassianClient(CREDS, f).getConfluencePage('p 1');
    expect(urlOf(f)).toBe('https://x.atlassian.net/wiki/api/v2/pages/p%201');
    expect(out).toEqual({ id: 'p1', title: 'T', spaceId: 'S' });
  });

  it('getConfluencePage の欠けたフィールドは空文字', async () => {
    const f = fetchOnce({ id: 'p1' });
    await expect(new AtlassianClient(CREDS, f).getConfluencePage('p1')).resolves.toEqual({
      id: 'p1',
      title: '',
      spaceId: '',
    });
  });

  it('baseUrl が atlassian.net でなければネットワークに出る前に落ちる', async () => {
    const f = fetchOnce({});
    await expect(
      new AtlassianClient({ token: 't', baseUrl: 'https://evil.test' }, f).searchJira('x'),
    ).rejects.toThrow(/atlassian\.net/);
    expect(f).not.toHaveBeenCalled();
  });

  it('listCompassComponents は空配列で成功したふりをせず落ちる', async () => {
    const err = await new AtlassianClient(CREDS).listCompassComponents().catch((e: unknown) => e);
    expect(err).toBeInstanceOf(NotImplementedError);
    expect((err as Error).message).toContain('listCompassComponents');
    expect((err as Error).message).toContain('GraphQL');
  });
});

describe('CanvaClient', () => {
  it('searchDesigns は query と並び順を渡す', async () => {
    const f = fetchOnce({ items: [{ id: 'd1', title: 'T', urls: { edit_url: 'E' }, updated_at: 5 }] });
    const out = await new CanvaClient({ token: 'tok' }, f).searchDesigns('提案');
    expect(urlOf(f)).toBe(
      'https://api.canva.com/rest/v1/designs?query=%E6%8F%90%E6%A1%88&ownership=any&sort_by=modified_descending&limit=20',
    );
    expect(out).toEqual([{ id: 'd1', title: 'T', editUrl: 'E', updatedAt: 5 }]);
  });

  it('空クエリなら query を送らない', async () => {
    const f = fetchOnce({ items: [] });
    await new CanvaClient({ token: 'tok' }, f).searchDesigns('');
    expect(urlOf(f)).not.toContain('query=');
  });

  it('limit を渡せる', async () => {
    const f = fetchOnce({ items: [] });
    await new CanvaClient({ token: 'tok' }, f).searchDesigns('q', 3);
    expect(urlOf(f)).toContain('limit=3');
  });

  it('edit_url が無ければ design ID から組み立てる', async () => {
    const f = fetchOnce({ items: [{ id: 'd9' }] });
    await expect(new CanvaClient({ token: 'tok' }, f).searchDesigns('q')).resolves.toEqual([
      { id: 'd9', title: '', editUrl: 'https://www.canva.com/design/d9', updatedAt: 0 },
    ]);
  });

  it('items が無くても空配列', async () => {
    const f = fetchOnce({});
    await expect(new CanvaClient({ token: 'tok' }, f).searchDesigns('q')).resolves.toEqual([]);
  });

  it('exportDesign は書き出しジョブを作り、status をそのまま返す', async () => {
    const f = fetchOnce({ job: { id: 'j1', status: 'in_progress', urls: [] } });
    const out = await new CanvaClient({ token: 'tok' }, f).exportDesign('d1', 'pdf');
    expect(urlOf(f)).toBe('https://api.canva.com/rest/v1/exports');
    expect(bodyOf(f)).toEqual({ design_id: 'd1', format: { type: 'pdf' } });
    // 非同期なので、受付時点で完了扱いにしない。
    expect(out).toEqual({ id: 'j1', status: 'in_progress', urls: [] });
  });

  it('job が無い応答でも落ちない', async () => {
    const f = fetchOnce({});
    await expect(new CanvaClient({ token: 'tok' }, f).exportDesign('d1', 'pdf')).resolves.toEqual({
      id: '',
      status: '',
      urls: [],
    });
  });

  it('urls が省略された job でも空配列にする', async () => {
    const f = fetchOnce({ job: { id: 'j1', status: 'success' } });
    const out = await new CanvaClient({ token: 'tok' }, f).exportDesign('d1', 'pdf');
    expect(out.urls).toEqual([]);
  });

  it('generateDesign は成功したふりをせず落ちる', async () => {
    const err = await new CanvaClient({ token: 'tok' }).generateDesign('猫のポスター').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(NotImplementedError);
    expect((err as Error).message).toContain('generateDesign');
    expect((err as Error).message).toContain('プロンプトからデザインを生成する入口が無く');
  });
});

describe('すべてのメソッドが資格情報を載せて出ていく', () => {
  /**
   * 各メソッドの init（ヘッダ・method）を 1 箇所で固定する。
   *
   * ここを個別のテスト任せにすると、**ヘッダごと落ちても本文の照合だけ
   * 通ってしまう**組み合わせが残る（実際 mutation で
   * `{ headers: ... }` → `{}` が複数生き残った）。トークンを載せ忘れた
   * リクエストは 401 になるだけなので、型でもテストでも気づけない。
   */
  // body: 応答の形がリストの API は配列を返さないと整形で落ちるため個別に与える。
  const CASES: readonly { name: string; run: (f: ReturnType<typeof fetchOnce>) => Promise<unknown>; method?: string; body?: unknown }[] = [
    { name: 'github.listRepos', body: [], run: (f) => new GithubClient({ token: 'tok' }, f).listRepos() },
    { name: 'github.listPullRequests', run: (f) => new GithubClient({ token: 'tok' }, f).listPullRequests() },
    { name: 'github.listIssues', body: [], run: (f) => new GithubClient({ token: 'tok' }, f).listIssues() },
    { name: 'wordpress.listSites', run: (f) => new WordPressClient({ token: 'tok' }, f).listSites() },
    { name: 'wordpress.createPostDraft', method: 'POST', run: (f) => new WordPressClient({ token: 'tok' }, f).createPostDraft('s', {}) },
    { name: 'wordpress.checkDomainAvailability', run: (f) => new WordPressClient({ token: 'tok' }, f).checkDomainAvailability('a.test') },
    { name: 'notion.search', method: 'POST', run: (f) => new NotionClient({ token: 'tok' }, f).search('q') },
    { name: 'notion.createPage', method: 'POST', run: (f) => new NotionClient({ token: 'tok' }, f).createPage({}) },
    { name: 'slack.searchChannels', run: (f) => new SlackClient({ token: 'tok' }, f).searchChannels('') },
    { name: 'slack.sendMessage', method: 'POST', run: (f) => new SlackClient({ token: 'tok' }, f).sendMessage('C', 'm') },
    { name: 'slack.readThread', run: (f) => new SlackClient({ token: 'tok' }, f).readThread('C', '1') },
    { name: 'drive.listRecent', run: (f) => new DriveClient({ token: 'tok' }, f).listRecent() },
    { name: 'drive.search', run: (f) => new DriveClient({ token: 'tok' }, f).search('q') },
    { name: 'calendar.listEvents', run: (f) => new CalendarClient({ token: 'tok' }, f).listEvents() },
    { name: 'calendar.createEvent', method: 'POST', run: (f) => new CalendarClient({ token: 'tok' }, f).createEvent({}) },
    { name: 'gmail.searchThreads', run: (f) => new GmailClient({ token: 'tok' }, f).searchThreads('q') },
    { name: 'gmail.listLabels', run: (f) => new GmailClient({ token: 'tok' }, f).listLabels() },
    { name: 'canva.searchDesigns', run: (f) => new CanvaClient({ token: 'tok' }, f).searchDesigns('q') },
    { name: 'canva.exportDesign', method: 'POST', run: (f) => new CanvaClient({ token: 'tok' }, f).exportDesign('d', 'pdf') },
    { name: 'atlassian.searchJira', run: (f) => new AtlassianClient({ token: 'tok', baseUrl: 'https://x.atlassian.net' }, f).searchJira('x') },
    { name: 'atlassian.getConfluencePage', run: (f) => new AtlassianClient({ token: 'tok', baseUrl: 'https://x.atlassian.net' }, f).getConfluencePage('p') },
  ];

  for (const c of CASES) {
    it(`${c.name} は Authorization を送る`, async () => {
      const f = fetchOnce(c.body ?? { ok: true });
      await c.run(f);
      expect(headersOf(f).Authorization, `${c.name} にトークンが載っていない`).toBe('Bearer tok');
    });
  }

  for (const c of CASES.filter((x) => x.method !== undefined)) {
    it(`${c.name} は ${c.method} で送る`, async () => {
      const f = fetchOnce(c.body ?? { ok: true });
      await c.run(f);
      expect(initOf(f).method).toBe(c.method);
    });
  }

  for (const c of CASES.filter((x) => x.method === undefined)) {
    it(`${c.name} は本文を送らない（読み取りに body を付けない）`, async () => {
      const f = fetchOnce(c.body ?? { ok: true });
      await c.run(f);
      expect(initOf(f).method).toBeUndefined();
      expect(initOf(f).body).toBeUndefined();
    });
  }
});

describe('NotConfiguredError', () => {
  it('names itself and embeds the service id in the message', () => {
    const err = new NotConfiguredError('github');
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe('NotConfiguredError');
    expect(err.message).toContain('github');
    expect(err.message).toContain('not configured');
  });
});
