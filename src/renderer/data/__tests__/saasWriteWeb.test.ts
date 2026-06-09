import { describe, expect, it, vi } from 'vitest';
import {
  createGithubIssue,
  createNotionPage,
  sendSlackMessage,
  createAtlassianIssue,
  parseAtlassianToken,
  createCalendarEvent,
  createGmailDraft,
  createDriveFolder,
  createWordPressPostDraft,
  createCanvaFolder,
  createCloudflareDnsRecord,
  purgeCloudflareCache,
  buildRfc2822,
  isSafeHeaderValue,
  scanUrlVirusTotal,
  parseSecurityKeys,
  checkEmailBreach,
} from '../saasWriteWeb';

function jsonResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as unknown as Response;
}

/** init.headers を素の Record として取り出すヘルパ (リクエスト形 golden 照合用)。 */
function headersOf(init: RequestInit | undefined): Record<string, string> {
  return (init?.headers ?? {}) as Record<string, string>;
}

/** init.body (JSON 文字列) を parse するヘルパ。 */
function bodyOf(init: RequestInit | undefined): Record<string, unknown> {
  return JSON.parse(init?.body as string) as Record<string, unknown>;
}

describe('createGithubIssue', () => {
  it('POSTs to the issues endpoint with the exact headers and body shape', async () => {
    const fetchFn = vi.fn<typeof fetch>().mockResolvedValue(
      jsonResponse(201, { number: 7, html_url: 'https://github.com/o/r/issues/7', title: 'Bug' }),
    );
    const res = await createGithubIssue({ owner: 'o', repo: 'r', title: 'Bug', body: 'desc' }, 'ghp_x', fetchFn);
    expect(res).toEqual({ number: 7, url: 'https://github.com/o/r/issues/7', title: 'Bug' });
    const [url, init] = fetchFn.mock.calls[0]!;
    expect(url).toBe('https://api.github.com/repos/o/r/issues');
    expect(init!.method).toBe('POST');
    // 全ヘッダを golden 照合 (StringLiteral 変異を一括 kill)。
    expect(headersOf(init)).toEqual({
      Authorization: 'Bearer ghp_x',
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'Content-Type': 'application/json',
    });
    expect(bodyOf(init)).toEqual({ title: 'Bug', body: 'desc', labels: undefined });
  });

  it('trims inputs and url-encodes owner/repo', async () => {
    const fetchFn = vi.fn<typeof fetch>().mockResolvedValue(
      jsonResponse(201, { number: 1, html_url: 'u', title: 't' }),
    );
    await createGithubIssue({ owner: ' a/b ', repo: ' c ', title: ' t ' }, 'tok', fetchFn);
    expect(fetchFn.mock.calls[0]![0]).toBe('https://api.github.com/repos/a%2Fb/c/issues');
    // trim が効いている (title は trim 後の 't')。
    expect(bodyOf(fetchFn.mock.calls[0]![1]).title).toBe('t');
  });

  it('rejects missing required fields without calling fetch (exact message)', async () => {
    const fetchFn = vi.fn<typeof fetch>();
    await expect(createGithubIssue({ owner: 'o', repo: 'r' }, 'tok', fetchFn)).rejects.toThrow(
      'owner, repo, title は必須です',
    );
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('requires every one of owner / repo / title (each alone is insufficient)', async () => {
    const fetchFn = vi.fn<typeof fetch>();
    // それぞれ1項目だけ欠けても必ず弾く (|| を && に変えると素通りするケースを検出)。
    await expect(createGithubIssue({ owner: 'o', title: 't' }, 'tok', fetchFn)).rejects.toThrow(/必須/); // repo 欠落
    await expect(createGithubIssue({ repo: 'r', title: 't' }, 'tok', fetchFn)).rejects.toThrow(/必須/); // owner 欠落
    await expect(createGithubIssue({ owner: 'o', repo: 'r' }, 'tok', fetchFn)).rejects.toThrow(/必須/); // title 欠落
    await expect(createGithubIssue({ owner: '   ', repo: 'r', title: 't' }, 'tok', fetchFn)).rejects.toThrow(/必須/); // 空白のみ owner
    await expect(createGithubIssue({ owner: 'o', repo: '   ', title: 't' }, 'tok', fetchFn)).rejects.toThrow(/必須/); // 空白のみ repo
    await expect(createGithubIssue({ owner: 'o', repo: 'r', title: '   ' }, 'tok', fetchFn)).rejects.toThrow(/必須/); // 空白のみ title
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('rejects non-string required fields (typeof guard)', async () => {
    const fetchFn = vi.fn<typeof fetch>();
    await expect(createGithubIssue({ owner: 123, repo: 'r', title: 't' }, 'tok', fetchFn)).rejects.toThrow(/必須/);
    await expect(createGithubIssue({ owner: 'o', repo: {}, title: 't' }, 'tok', fetchFn)).rejects.toThrow(/必須/);
    await expect(createGithubIssue({ owner: 'o', repo: 'r', title: 5 }, 'tok', fetchFn)).rejects.toThrow(/必須/);
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('drops a non-string body to undefined', async () => {
    const fetchFn = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse(201, { number: 1, html_url: 'u', title: 't' }));
    await createGithubIssue({ owner: 'o', repo: 'r', title: 't', body: 99 }, 'tok', fetchFn);
    expect('body' in bodyOf(fetchFn.mock.calls[0]![1])).toBe(false);
  });

  it('surfaces API errors with status and body excerpt', async () => {
    const fetchFn = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse(422, { message: 'Validation Failed' }));
    await expect(
      createGithubIssue({ owner: 'o', repo: 'r', title: 't' }, 'tok', fetchFn),
    ).rejects.toThrow(/GitHub API 422/);
  });

  it('filters non-string labels; absent / non-array labels become undefined', async () => {
    const fetchFn = vi.fn<typeof fetch>().mockResolvedValue(
      jsonResponse(201, { number: 1, html_url: 'u', title: 't' }),
    );
    await createGithubIssue({ owner: 'o', repo: 'r', title: 't', labels: ['bug', 3, 'ui'] }, 'tok', fetchFn);
    expect(bodyOf(fetchFn.mock.calls[0]![1]).labels).toEqual(['bug', 'ui']);
    await createGithubIssue({ owner: 'o', repo: 'r', title: 't', labels: 'notarray' }, 'tok', fetchFn);
    expect('labels' in bodyOf(fetchFn.mock.calls[1]![1])).toBe(false);
  });
});

describe('createNotionPage', () => {
  it('POSTs the exact endpoint/headers/body and maps the result', async () => {
    const transport = vi.fn().mockResolvedValue(jsonResponse(200, { id: 'p1', url: 'https://notion.so/p1' }));
    const res = await createNotionPage({ parentPageId: 'par', title: 'T', body: 'hi' }, 'secret', transport);
    expect(res).toEqual({ id: 'p1', url: 'https://notion.so/p1' });
    const [url, init] = transport.mock.calls[0]!;
    expect(url).toBe('https://api.notion.com/v1/pages');
    expect(init.method).toBe('POST');
    expect(headersOf(init)).toEqual({
      Authorization: 'Bearer secret',
      'Notion-Version': '2022-06-28',
      'Content-Type': 'application/json',
    });
    // body 全体を golden 照合 (children の入れ子 ObjectLiteral/StringLiteral を一括 kill)。
    expect(bodyOf(init)).toEqual({
      parent: { page_id: 'par' },
      properties: { title: { title: [{ text: { content: 'T' } }] } },
      children: [
        { object: 'block', type: 'paragraph', paragraph: { rich_text: [{ type: 'text', text: { content: 'hi' } }] } },
      ],
    });
  });
  it('omits children (empty array) when no body, and when body is non-string', async () => {
    const transport = vi.fn().mockResolvedValue(jsonResponse(200, { id: 'p', url: 'u' }));
    await createNotionPage({ parentPageId: 'par', title: 'T' }, 'tok', transport);
    expect(bodyOf(transport.mock.calls[0]![1]).children).toEqual([]);
    await createNotionPage({ parentPageId: 'par', title: 'T', body: 42 }, 'tok', transport);
    expect(bodyOf(transport.mock.calls[1]![1]).children).toEqual([]);
  });
  it('requires parentPageId and title (each alone is insufficient)', async () => {
    const transport = vi.fn();
    await expect(createNotionPage({ title: 'T' }, 'tok', transport)).rejects.toThrow('parentPageId と title は必須です');
    await expect(createNotionPage({ parentPageId: 'p' }, 'tok', transport)).rejects.toThrow(/必須/);
    await expect(createNotionPage({ parentPageId: '  ', title: 'T' }, 'tok', transport)).rejects.toThrow(/必須/);
    await expect(createNotionPage({ parentPageId: 'p', title: '  ' }, 'tok', transport)).rejects.toThrow(/必須/);
    await expect(createNotionPage({ parentPageId: 1, title: 'T' }, 'tok', transport)).rejects.toThrow(/必須/);
    expect(transport).not.toHaveBeenCalled();
  });
  it('surfaces API errors', async () => {
    const transport = vi.fn().mockResolvedValue(jsonResponse(401, { message: 'unauthorized' }));
    await expect(createNotionPage({ parentPageId: 'p', title: 'T' }, 'tok', transport)).rejects.toThrow(/Notion API 401/);
  });
});

describe('sendSlackMessage', () => {
  it('POSTs the exact endpoint/headers/body and returns ts/channel', async () => {
    const transport = vi.fn().mockResolvedValue(jsonResponse(200, { ok: true, ts: '1.2', channel: 'C1' }));
    const res = await sendSlackMessage({ channel: '#general', text: 'hello' }, 'xoxb', transport);
    expect(res).toEqual({ ts: '1.2', channel: 'C1' });
    const [url, init] = transport.mock.calls[0]!;
    expect(url).toBe('https://slack.com/api/chat.postMessage');
    expect(init.method).toBe('POST');
    expect(headersOf(init)).toEqual({
      Authorization: 'Bearer xoxb',
      'Content-Type': 'application/json; charset=utf-8',
    });
    expect(bodyOf(init)).toEqual({ channel: '#general', text: 'hello' });
  });
  it('throws when Slack returns ok:false even on HTTP 200 (exact error)', async () => {
    const transport = vi.fn().mockResolvedValue(jsonResponse(200, { ok: false, error: 'channel_not_found' }));
    await expect(sendSlackMessage({ channel: 'C', text: 't' }, 'tok', transport)).rejects.toThrow('Slack: channel_not_found');
  });
  it('falls back to a generic error string when ok:false without error field', async () => {
    const transport = vi.fn().mockResolvedValue(jsonResponse(200, { ok: false }));
    await expect(sendSlackMessage({ channel: 'C', text: 't' }, 'tok', transport)).rejects.toThrow('Slack: unknown_error');
  });
  it('returns ts and falls back channel to the (trimmed) input when absent; text kept verbatim', async () => {
    const transport = vi.fn().mockResolvedValue(jsonResponse(200, { ok: true, ts: '1.2' }));
    const r = await sendSlackMessage({ channel: '  C  ', text: '  spaced  ' }, 'tok', transport);
    expect(r).toEqual({ ts: '1.2', channel: 'C' });
    expect(bodyOf(transport.mock.calls[0]![1])).toEqual({ channel: 'C', text: '  spaced  ' });
  });
  it('returns empty ts when absent', async () => {
    const transport = vi.fn().mockResolvedValue(jsonResponse(200, { ok: true, channel: 'C9' }));
    const r = await sendSlackMessage({ channel: 'C', text: 't' }, 'tok', transport);
    expect(r).toEqual({ ts: '', channel: 'C9' });
  });
  it('requires channel and text (each alone is insufficient)', async () => {
    const transport = vi.fn();
    await expect(sendSlackMessage({ channel: 'C' }, 'tok', transport)).rejects.toThrow('channel と text は必須です');
    await expect(sendSlackMessage({ text: 't' }, 'tok', transport)).rejects.toThrow(/必須/);
    await expect(sendSlackMessage({ channel: '  ', text: 't' }, 'tok', transport)).rejects.toThrow(/必須/);
    await expect(sendSlackMessage({ channel: 'C', text: '' }, 'tok', transport)).rejects.toThrow(/必須/);
    await expect(sendSlackMessage({ channel: 5, text: 't' }, 'tok', transport)).rejects.toThrow(/必須/);
    // text が非文字列 → '' に正規化されて弾かれる (typeof ガードの三項式を直接検証)。
    await expect(sendSlackMessage({ channel: 'C', text: 5 }, 'tok', transport)).rejects.toThrow(/必須/);
    await expect(sendSlackMessage({ channel: 'C', text: {} }, 'tok', transport)).rejects.toThrow(/必須/);
    expect(transport).not.toHaveBeenCalled();
  });
  it('surfaces HTTP errors', async () => {
    const transport = vi.fn().mockResolvedValue(jsonResponse(500, {}));
    await expect(sendSlackMessage({ channel: 'C', text: 't' }, 'tok', transport)).rejects.toThrow(/Slack API 500/);
  });
});

const TOK = JSON.stringify({ email: 'me@x.com', token: 'apitok', site: 'https://acme.atlassian.net/' });

describe('parseAtlassianToken', () => {
  it('parses and trims the site trailing slash', () => {
    expect(parseAtlassianToken(TOK)).toEqual({ email: 'me@x.com', token: 'apitok', site: 'https://acme.atlassian.net' });
  });
  it('rejects non-JSON / missing fields / non-https (exact messages)', () => {
    expect(() => parseAtlassianToken('nope')).toThrow(
      'Atlassian トークンは { "email", "token", "site" } 形式の JSON で保存してください',
    );
    expect(() => parseAtlassianToken(JSON.stringify({ email: 'a' }))).toThrow(
      'Atlassian トークンの email / token / site が欠けているか不正です',
    );
    expect(() => parseAtlassianToken(JSON.stringify({ email: 'a@b', token: 't', site: 'http://x' }))).toThrow(
      'Atlassian の site は https のみ対応',
    );
  });
  it('rejects an invalid (unparseable) site URL', () => {
    expect(() => parseAtlassianToken(JSON.stringify({ email: 'a@b', token: 't', site: 'not a url' }))).toThrow(
      'Atlassian の site は https URL で指定してください',
    );
  });
  it('rejects each missing/empty/over-long/non-string field individually', () => {
    const ok = { email: 'a@b', token: 't', site: 'https://x.atlassian.net' };
    expect(() => parseAtlassianToken(JSON.stringify({ ...ok, email: '' }))).toThrow(/欠けている|不正/);
    expect(() => parseAtlassianToken(JSON.stringify({ ...ok, email: 5 }))).toThrow(/欠けている|不正/);
    expect(() => parseAtlassianToken(JSON.stringify({ ...ok, token: '' }))).toThrow(/欠けている|不正/);
    expect(() => parseAtlassianToken(JSON.stringify({ ...ok, token: 9 }))).toThrow(/欠けている|不正/);
    expect(() => parseAtlassianToken(JSON.stringify({ ...ok, site: '' }))).toThrow(/欠けている|不正/);
    expect(() => parseAtlassianToken(JSON.stringify({ ...ok, site: 7 }))).toThrow(/欠けている|不正/);
    // ちょうど上限 (254) は許容、超過 (255) は拒否 (境界)。
    const at254 = 'a'.repeat(252) + '@b'; // length 254
    expect(at254.length).toBe(254);
    expect(parseAtlassianToken(JSON.stringify({ ...ok, email: at254 })).email).toBe(at254);
    const at255 = 'a'.repeat(253) + '@b';
    expect(at255.length).toBe(255);
    expect(() => parseAtlassianToken(JSON.stringify({ ...ok, email: at255 }))).toThrow(/欠けている|不正/);
  });
  it('rejects control chars in email or token (exact message)', () => {
    expect(() => parseAtlassianToken(JSON.stringify({ email: 'a@b\n', token: 't', site: 'https://x.atlassian.net' }))).toThrow(
      'Atlassian の email / token に制御文字を含めることはできません',
    );
    expect(() => parseAtlassianToken(JSON.stringify({ email: 'a@b\r', token: 't', site: 'https://x.atlassian.net' }))).toThrow(/制御文字/);
    expect(() => parseAtlassianToken(JSON.stringify({ email: 'a@b\0', token: 't', site: 'https://x.atlassian.net' }))).toThrow(/制御文字/);
    expect(() => parseAtlassianToken(JSON.stringify({ email: 'a@b', token: 't\r', site: 'https://x.atlassian.net' }))).toThrow(/制御文字/);
    expect(() => parseAtlassianToken(JSON.stringify({ email: 'a@b', token: 't\n', site: 'https://x.atlassian.net' }))).toThrow(/制御文字/);
    expect(() => parseAtlassianToken(JSON.stringify({ email: 'a@b', token: 't\0', site: 'https://x.atlassian.net' }))).toThrow(/制御文字/);
  });
  it('strips multiple trailing slashes only', () => {
    const c = parseAtlassianToken(JSON.stringify({ email: 'a@b', token: 't', site: 'https://x.atlassian.net///' }));
    expect(c.site).toBe('https://x.atlassian.net');
  });
});

describe('createAtlassianIssue', () => {
  it('POSTs the exact endpoint/headers/body with Basic auth and returns key/url', async () => {
    const transport = vi.fn().mockResolvedValue(jsonResponse(201, { id: '1', key: 'ACME-1', self: 's' }));
    const res = await createAtlassianIssue({ projectKey: 'ACME', summary: 'S', description: 'd' }, TOK, transport);
    expect(res).toEqual({ key: 'ACME-1', url: 'https://acme.atlassian.net/browse/ACME-1' });
    const [url, init] = transport.mock.calls[0]!;
    expect(url).toBe('https://acme.atlassian.net/rest/api/3/issue');
    expect(init.method).toBe('POST');
    expect(headersOf(init)).toEqual({
      Authorization: 'Basic ' + btoa('me@x.com:apitok'),
      Accept: 'application/json',
      'Content-Type': 'application/json',
    });
    expect(bodyOf(init)).toEqual({
      fields: {
        project: { key: 'ACME' },
        summary: 'S',
        issuetype: { name: 'Task' },
        description: { type: 'doc', version: 1, content: [{ type: 'paragraph', content: [{ type: 'text', text: 'd' }] }] },
      },
    });
  });
  it('honors an explicit issueType and omits description when absent (or non-string)', async () => {
    const transport = vi.fn().mockResolvedValue(jsonResponse(200, { key: 'P-2' }));
    await createAtlassianIssue({ projectKey: 'P', summary: 'S', issueType: 'Bug' }, TOK, transport);
    let sent = bodyOf(transport.mock.calls[0]![1]) as { fields: Record<string, unknown> & { issuetype: { name: string } } };
    expect(sent.fields.issuetype.name).toBe('Bug');
    expect('description' in sent.fields).toBe(false);
    // 空文字 issueType は Task にフォールバック。description が非文字列も省略。
    await createAtlassianIssue({ projectKey: 'P', summary: 'S', issueType: '', description: 5 }, TOK, transport);
    sent = bodyOf(transport.mock.calls[1]![1]) as { fields: Record<string, unknown> & { issuetype: { name: string } } };
    expect(sent.fields.issuetype.name).toBe('Task');
    expect('description' in sent.fields).toBe(false);
  });
  it('requires projectKey and summary (each alone insufficient, trimmed)', async () => {
    const transport = vi.fn();
    await expect(createAtlassianIssue({ summary: 'S' }, TOK, transport)).rejects.toThrow('projectKey と summary は必須です');
    await expect(createAtlassianIssue({ projectKey: 'P' }, TOK, transport)).rejects.toThrow(/必須/);
    await expect(createAtlassianIssue({ projectKey: '  ', summary: 'S' }, TOK, transport)).rejects.toThrow(/必須/);
    await expect(createAtlassianIssue({ projectKey: 'P', summary: '  ' }, TOK, transport)).rejects.toThrow(/必須/);
    await expect(createAtlassianIssue({ projectKey: 3, summary: 'S' }, TOK, transport)).rejects.toThrow(/必須/);
    expect(transport).not.toHaveBeenCalled();
  });
  it('surfaces API errors', async () => {
    const transport = vi.fn().mockResolvedValue(jsonResponse(400, { error: 'bad' }));
    await expect(createAtlassianIssue({ projectKey: 'A', summary: 'S' }, TOK, transport)).rejects.toThrow(/Atlassian API 400/);
  });
});

describe('createCalendarEvent', () => {
  it('POSTs the exact endpoint/headers/body with explicit timeZone', async () => {
    const transport = vi.fn().mockResolvedValue(jsonResponse(200, { id: 'e1', htmlLink: 'https://cal/e1' }));
    const res = await createCalendarEvent(
      { summary: 'M', start: '2026-01-31T10:00:00', end: '2026-01-31T11:00:00', description: 'D', location: 'L', timeZone: 'Asia/Tokyo' },
      'tok',
      transport,
    );
    expect(res).toEqual({ id: 'e1', htmlLink: 'https://cal/e1' });
    const [url, init] = transport.mock.calls[0]!;
    expect(url).toBe('https://www.googleapis.com/calendar/v3/calendars/primary/events');
    expect(init.method).toBe('POST');
    expect(headersOf(init)).toEqual({ Authorization: 'Bearer tok', 'Content-Type': 'application/json' });
    expect(bodyOf(init)).toEqual({
      summary: 'M',
      description: 'D',
      location: 'L',
      start: { dateTime: '2026-01-31T10:00:00', timeZone: 'Asia/Tokyo' },
      end: { dateTime: '2026-01-31T11:00:00', timeZone: 'Asia/Tokyo' },
    });
  });
  it('drops non-string description/location, trims summary, and falls back the timeZone to the environment default', async () => {
    const transport = vi.fn().mockResolvedValue(jsonResponse(200, { id: 'e', htmlLink: 'h' }));
    await createCalendarEvent(
      { summary: ' M ', start: '2026-01-01T10:00:00', end: '2026-01-01T11:00:00', description: 5, location: {}, timeZone: '' },
      'tok',
      transport,
    );
    const sent = bodyOf(transport.mock.calls[0]![1]) as {
      summary: string;
      description?: unknown;
      location?: unknown;
      start: { timeZone: string };
      end: { timeZone: string };
    };
    expect(sent.summary).toBe('M'); // trimmed
    expect('description' in sent).toBe(false);
    expect('location' in sent).toBe(false);
    // 環境既定 TZ (vitest は UTC) にフォールバック。空文字や 'X' ではない。
    expect(sent.start.timeZone).toBe('UTC');
    expect(sent.end.timeZone).toBe('UTC');
  });
  it('requires summary/start/end (each alone insufficient)', async () => {
    const transport = vi.fn();
    await expect(createCalendarEvent({ summary: 'M' }, 'tok', transport)).rejects.toThrow('summary, start, end は必須です');
    await expect(createCalendarEvent({ start: 's', end: 'e' }, 'tok', transport)).rejects.toThrow(/必須/);
    await expect(createCalendarEvent({ summary: 'M', end: 'e' }, 'tok', transport)).rejects.toThrow(/必須/);
    await expect(createCalendarEvent({ summary: 'M', start: 's' }, 'tok', transport)).rejects.toThrow(/必須/);
    await expect(createCalendarEvent({ summary: '  ', start: 's', end: 'e' }, 'tok', transport)).rejects.toThrow(/必須/);
    await expect(createCalendarEvent({ summary: 'M', start: 5, end: 'e' }, 'tok', transport)).rejects.toThrow(/必須/);
    await expect(createCalendarEvent({ summary: 'M', start: 's', end: 5 }, 'tok', transport)).rejects.toThrow(/必須/);
    expect(transport).not.toHaveBeenCalled();
  });
  it('surfaces API errors', async () => {
    const transport = vi.fn().mockResolvedValue(jsonResponse(500, { e: 1 }));
    await expect(
      createCalendarEvent({ summary: 'M', start: 's', end: 'e' }, 'tok', transport),
    ).rejects.toThrow(/Calendar API 500/);
  });
});

describe('gmail helpers + createGmailDraft', () => {
  it('isSafeHeaderValue rejects CRLF/NUL/non-string', () => {
    expect(isSafeHeaderValue('a@b.com')).toBe(true);
    expect(isSafeHeaderValue('a@b\r\nBcc: x')).toBe(false);
    expect(isSafeHeaderValue('a\rb')).toBe(false);
    expect(isSafeHeaderValue('a\nb')).toBe(false);
    expect(isSafeHeaderValue('a\0b')).toBe(false);
    expect(isSafeHeaderValue(42)).toBe(false);
    expect(isSafeHeaderValue(null)).toBe(false);
  });
  it('buildRfc2822 produces the exact MIME message (golden) and guards header injection', () => {
    expect(buildRfc2822('a@b.com', 'やあ', 'hi')).toBe(
      [
        'To: a@b.com',
        'Subject: =?UTF-8?B?44KE44GC?=',
        'Content-Type: text/plain; charset="UTF-8"',
        'MIME-Version: 1.0',
        '',
        'hi',
      ].join('\r\n'),
    );
    expect(() => buildRfc2822('a@b\r\nBcc: x', 's', 'b')).toThrow('to に CR/LF/NUL は使用できません');
  });
  it('createGmailDraft POSTs the exact endpoint/headers and a padding-free base64url raw', async () => {
    const transport = vi.fn().mockResolvedValue(jsonResponse(200, { id: 'd1', message: { id: 'm1' } }));
    const res = await createGmailDraft({ to: ' a@b.com ', subject: 'S', body: 'B' }, 'tok', transport);
    expect(res).toEqual({ id: 'd1', messageId: 'm1' });
    const [url, init] = transport.mock.calls[0]!;
    expect(url).toBe('https://gmail.googleapis.com/gmail/v1/users/me/drafts');
    expect(init.method).toBe('POST');
    expect(headersOf(init)).toEqual({ Authorization: 'Bearer tok', 'Content-Type': 'application/json' });
    // to は trim される (' a@b.com ' → 'a@b.com')。raw を golden 照合。
    const raw = (bodyOf(init).message as { raw: string }).raw;
    expect(raw).toBe(
      'VG86IGFAYi5jb20NClN1YmplY3Q6ID0_VVRGLTg_Qj9Vdz09Pz0NCkNvbnRlbnQtVHlwZTogdGV4dC9wbGFpbjsgY2hhcnNldD0iVVRGLTgiDQpNSU1FLVZlcnNpb246IDEuMA0KDQpC',
    );
  });
  it('encodes a raw that exercises both + and / so base64url replacement matters', async () => {
    const transport = vi.fn().mockResolvedValue(jsonResponse(200, { id: 'd', message: { id: 'm' } }));
    // body '~~a' は素の base64 に + と / の両方を含む → base64url 変換(+→-, /→_, =除去)を全て検証。
    await createGmailDraft({ to: 'a@b.com', subject: 'S', body: '~~a' }, 'tok', transport);
    const raw = (bodyOf(transport.mock.calls[0]![1]).message as { raw: string }).raw;
    expect(raw).toBe(
      'VG86IGFAYi5jb20NClN1YmplY3Q6ID0_VVRGLTg_Qj9Vdz09Pz0NCkNvbnRlbnQtVHlwZTogdGV4dC9wbGFpbjsgY2hhcnNldD0iVVRGLTgiDQpNSU1FLVZlcnNpb246IDEuMA0KDQp-fmE',
    );
    expect(raw).not.toMatch(/[+/=]/); // base64url: + / = は出現しない
  });
  it('strips a full == padding run (so the /=+$/ regex removes all padding, not just one)', async () => {
    const transport = vi.fn().mockResolvedValue(jsonResponse(200, { id: 'd', message: { id: 'm' } }));
    // body 'aa' は素の base64 が '==' (二重パディング) で終わる → /=+$/ が両方除去することを golden で検証。
    await createGmailDraft({ to: 'a@b.com', subject: 'S', body: 'aa' }, 'tok', transport);
    const raw = (bodyOf(transport.mock.calls[0]![1]).message as { raw: string }).raw;
    expect(raw).toBe(
      'VG86IGFAYi5jb20NClN1YmplY3Q6ID0_VVRGLTg_Qj9Vdz09Pz0NCkNvbnRlbnQtVHlwZTogdGV4dC9wbGFpbjsgY2hhcnNldD0iVVRGLTgiDQpNSU1FLVZlcnNpb246IDEuMA0KDQphYQ',
    );
    expect(raw.endsWith('=')).toBe(false); // == パディングは完全に除去 (末尾に = が残らない)
  });
  it('treats a non-string body as empty', async () => {
    const transport = vi.fn().mockResolvedValue(jsonResponse(200, { id: 'd', message: { id: 'm' } }));
    await createGmailDraft({ to: 'a@b.com', subject: 'S', body: 123 }, 'tok', transport);
    const raw = (bodyOf(transport.mock.calls[0]![1]).message as { raw: string }).raw;
    // body 省略時 (空文字) の golden と一致。
    expect(raw).toBe(
      'VG86IGFAYi5jb20NClN1YmplY3Q6ID0_VVRGLTg_Qj9Vdz09Pz0NCkNvbnRlbnQtVHlwZTogdGV4dC9wbGFpbjsgY2hhcnNldD0iVVRGLTgiDQpNSU1FLVZlcnNpb246IDEuMA0KDQo',
    );
  });
  it('requires to and subject (each alone insufficient)', async () => {
    const transport = vi.fn();
    await expect(createGmailDraft({ to: 'a@b.com' }, 'tok', transport)).rejects.toThrow('to と subject は必須です');
    await expect(createGmailDraft({ subject: 'S' }, 'tok', transport)).rejects.toThrow(/必須/);
    await expect(createGmailDraft({ to: '  ', subject: 'S' }, 'tok', transport)).rejects.toThrow(/必須/);
    await expect(createGmailDraft({ to: 'a@b.com', subject: '' }, 'tok', transport)).rejects.toThrow(/必須/);
    await expect(createGmailDraft({ to: 5, subject: 'S' }, 'tok', transport)).rejects.toThrow(/必須/);
    // subject が非文字列 → '' に正規化されて弾かれる (typeof ガードの三項式を直接検証)。
    await expect(createGmailDraft({ to: 'a@b.com', subject: 5 }, 'tok', transport)).rejects.toThrow(/必須/);
    await expect(createGmailDraft({ to: 'a@b.com', subject: {} }, 'tok', transport)).rejects.toThrow(/必須/);
    expect(transport).not.toHaveBeenCalled();
  });
  it('surfaces API errors', async () => {
    const transport = vi.fn().mockResolvedValue(jsonResponse(403, {}));
    await expect(createGmailDraft({ to: 'a@b.com', subject: 'S' }, 'tok', transport)).rejects.toThrow(/Gmail API 403/);
  });
});

describe('createDriveFolder', () => {
  it('POSTs the exact endpoint/headers/body and falls back to a folder URL', async () => {
    const transport = vi.fn().mockResolvedValue(jsonResponse(200, { id: 'f1', name: 'Docs' }));
    const res = await createDriveFolder({ name: ' Docs ' }, 'tok', transport);
    expect(res).toEqual({ id: 'f1', name: 'Docs', url: 'https://drive.google.com/drive/folders/f1' });
    const [url, init] = transport.mock.calls[0]!;
    expect(url).toBe('https://www.googleapis.com/drive/v3/files?fields=id,name,webViewLink');
    expect(init.method).toBe('POST');
    expect(headersOf(init)).toEqual({ Authorization: 'Bearer tok', 'Content-Type': 'application/json' });
    expect(bodyOf(init)).toEqual({ name: 'Docs', mimeType: 'application/vnd.google-apps.folder' });
  });
  it('includes parents and uses webViewLink when present', async () => {
    const transport = vi.fn().mockResolvedValue(jsonResponse(200, { id: 'f', name: 'N', webViewLink: 'L' }));
    const r = await createDriveFolder({ name: 'N', parentId: 'P' }, 'tok', transport);
    expect(r.url).toBe('L');
    expect(bodyOf(transport.mock.calls[0]![1])).toEqual({
      name: 'N',
      mimeType: 'application/vnd.google-apps.folder',
      parents: ['P'],
    });
  });
  it('ignores a non-string parentId', async () => {
    const transport = vi.fn().mockResolvedValue(jsonResponse(200, { id: 'f', name: 'N' }));
    await createDriveFolder({ name: 'N', parentId: 5 }, 'tok', transport);
    expect('parents' in bodyOf(transport.mock.calls[0]![1])).toBe(false);
  });
  it('requires name (also trimmed) and surfaces API errors', async () => {
    const transport = vi.fn();
    await expect(createDriveFolder({}, 'tok', transport)).rejects.toThrow('name は必須です');
    await expect(createDriveFolder({ name: '   ' }, 'tok', transport)).rejects.toThrow(/必須/);
    await expect(createDriveFolder({ name: 7 }, 'tok', transport)).rejects.toThrow(/必須/);
    expect(transport).not.toHaveBeenCalled();
    transport.mockResolvedValue(jsonResponse(500, {}));
    await expect(createDriveFolder({ name: 'N' }, 'tok', transport)).rejects.toThrow(/Drive API 500/);
  });
});

describe('createWordPressPostDraft', () => {
  it('POSTs the exact endpoint/headers/body, defaults to draft', async () => {
    const transport = vi.fn().mockResolvedValue(jsonResponse(200, { ID: 9, URL: 'u', title: 'T' }));
    const res = await createWordPressPostDraft({ siteId: ' blog.example.com ', title: ' T ', content: 'C' }, 'tok', transport);
    expect(res).toEqual({ id: 9, url: 'u', title: 'T' });
    const [url, init] = transport.mock.calls[0]!;
    expect(url).toBe('https://public-api.wordpress.com/rest/v1.1/sites/blog.example.com/posts/new');
    expect(init.method).toBe('POST');
    expect(headersOf(init)).toEqual({ Authorization: 'Bearer tok', 'Content-Type': 'application/json' });
    expect(bodyOf(init)).toEqual({ title: 'T', content: 'C', status: 'draft' });
  });
  it('keeps each allowed status and coerces unknown/non-string to draft; defaults empty content', async () => {
    const transport = vi.fn().mockResolvedValue(jsonResponse(200, { ID: 1, URL: 'u', title: 'T' }));
    for (const s of ['draft', 'publish', 'pending', 'private']) {
      await createWordPressPostDraft({ siteId: 's', title: 'T', status: s }, 'tok', transport);
    }
    const got = transport.mock.calls.map((c) => bodyOf(c[1]).status);
    expect(got).toEqual(['draft', 'publish', 'pending', 'private']);
  });
  it('coerces an unknown status to draft (allowlist miss → default)', async () => {
    const transport = vi.fn().mockResolvedValue(jsonResponse(200, { ID: 1, URL: 'u', title: 'T' }));
    await createWordPressPostDraft({ siteId: 's', title: 'T', status: 'bogus' }, 'tok', transport);
    expect(bodyOf(transport.mock.calls[0]![1]).status).toBe('draft');
  });
  it('coerces a non-string status to draft and defaults empty content', async () => {
    const transport = vi.fn().mockResolvedValue(jsonResponse(200, { ID: 1, URL: 'u', title: 'T' }));
    await createWordPressPostDraft({ siteId: 's', title: 'T', status: 5, content: 9 }, 'tok', transport);
    expect(bodyOf(transport.mock.calls[0]![1])).toEqual({ title: 'T', content: '', status: 'draft' });
  });
  it('requires siteId and title (each alone insufficient) and surfaces API errors', async () => {
    const transport = vi.fn();
    await expect(createWordPressPostDraft({ title: 'T' }, 'tok', transport)).rejects.toThrow('siteId と title は必須です');
    await expect(createWordPressPostDraft({ siteId: 's' }, 'tok', transport)).rejects.toThrow(/必須/);
    await expect(createWordPressPostDraft({ siteId: '  ', title: 'T' }, 'tok', transport)).rejects.toThrow(/必須/);
    await expect(createWordPressPostDraft({ siteId: 's', title: '  ' }, 'tok', transport)).rejects.toThrow(/必須/);
    await expect(createWordPressPostDraft({ siteId: 5, title: 'T' }, 'tok', transport)).rejects.toThrow(/必須/);
    expect(transport).not.toHaveBeenCalled();
    transport.mockResolvedValue(jsonResponse(401, {}));
    await expect(createWordPressPostDraft({ siteId: 's', title: 'T' }, 'tok', transport)).rejects.toThrow(/WordPress API 401/);
  });
});

describe('createCanvaFolder', () => {
  it('POSTs the exact endpoint/headers/body, defaults parent to root', async () => {
    const transport = vi.fn().mockResolvedValue(jsonResponse(200, { folder: { id: 'c1', name: 'N' } }));
    const res = await createCanvaFolder({ name: ' N ' }, 'tok', transport);
    expect(res).toEqual({ id: 'c1', name: 'N' });
    const [url, init] = transport.mock.calls[0]!;
    expect(url).toBe('https://api.canva.com/rest/v1/folders');
    expect(init.method).toBe('POST');
    expect(headersOf(init)).toEqual({ Authorization: 'Bearer tok', 'Content-Type': 'application/json' });
    expect(bodyOf(init)).toEqual({ name: 'N', parent_folder_id: 'root' });
  });
  it('uses a provided non-empty parentFolderId instead of root; empty/non-string falls back to root', async () => {
    const transport = vi.fn().mockResolvedValue(jsonResponse(200, { folder: { id: 'c', name: 'N' } }));
    await createCanvaFolder({ name: 'N', parentFolderId: 'FID' }, 'tok', transport);
    expect(bodyOf(transport.mock.calls[0]![1]).parent_folder_id).toBe('FID');
    await createCanvaFolder({ name: 'N', parentFolderId: '' }, 'tok', transport);
    expect(bodyOf(transport.mock.calls[1]![1]).parent_folder_id).toBe('root');
    await createCanvaFolder({ name: 'N', parentFolderId: 5 }, 'tok', transport);
    expect(bodyOf(transport.mock.calls[2]![1]).parent_folder_id).toBe('root');
  });
  it('requires name (also trimmed) and surfaces API errors', async () => {
    const transport = vi.fn();
    await expect(createCanvaFolder({}, 'tok', transport)).rejects.toThrow('name は必須です');
    await expect(createCanvaFolder({ name: '  ' }, 'tok', transport)).rejects.toThrow(/必須/);
    await expect(createCanvaFolder({ name: 9 }, 'tok', transport)).rejects.toThrow(/必須/);
    expect(transport).not.toHaveBeenCalled();
    transport.mockResolvedValue(jsonResponse(500, {}));
    await expect(createCanvaFolder({ name: 'N' }, 'tok', transport)).rejects.toThrow(/Canva API 500/);
  });
});

describe('cloudflare', () => {
  it('createCloudflareDnsRecord POSTs the exact endpoint/headers/body and unwraps the CF envelope', async () => {
    const transport = vi.fn().mockResolvedValue(jsonResponse(200, { success: true, result: { id: 'r1', name: 'a.x', type: 'A' } }));
    const res = await createCloudflareDnsRecord({ zoneId: ' z ', type: 'A', name: ' a.x ', content: ' 1.2.3.4 ' }, 'tok', transport);
    expect(res).toEqual({ id: 'r1', name: 'a.x', type: 'A' });
    const [url, init] = transport.mock.calls[0]!;
    expect(url).toBe('https://api.cloudflare.com/client/v4/zones/z/dns_records');
    expect(init.method).toBe('POST');
    expect(headersOf(init)).toEqual({ Authorization: 'Bearer tok', Accept: 'application/json', 'Content-Type': 'application/json' });
    // trim 済み + ttl 既定 1 + proxied 既定 false。
    expect(bodyOf(init)).toEqual({ type: 'A', name: 'a.x', content: '1.2.3.4', ttl: 1, proxied: false });
  });
  it('honors a numeric ttl and proxied=true for A/AAAA/CNAME; omits proxied for other types', async () => {
    const transport = vi.fn().mockResolvedValue(jsonResponse(200, { success: true, result: { id: 'r', name: 'n', type: 'A' } }));
    await createCloudflareDnsRecord({ zoneId: 'z', type: 'AAAA', name: 'n', content: '::1', ttl: 300, proxied: true }, 'tok', transport);
    expect(bodyOf(transport.mock.calls[0]![1])).toEqual({ type: 'AAAA', name: 'n', content: '::1', ttl: 300, proxied: true });
    await createCloudflareDnsRecord({ zoneId: 'z', type: 'CNAME', name: 'n', content: 'x', proxied: true }, 'tok', transport);
    expect(bodyOf(transport.mock.calls[1]![1]).proxied).toBe(true);
    // proxied は真偽厳密 (=== true)。'true' 文字列は false。
    await createCloudflareDnsRecord({ zoneId: 'z', type: 'A', name: 'n', content: 'x', proxied: 'true' }, 'tok', transport);
    expect(bodyOf(transport.mock.calls[2]![1]).proxied).toBe(false);
    // 非 A/AAAA/CNAME (TXT) は proxied キー自体を持たない。ttl が非数値なら 1。
    await createCloudflareDnsRecord({ zoneId: 'z', type: 'TXT', name: 'n', content: 'v', ttl: 'x' }, 'tok', transport);
    const txt = bodyOf(transport.mock.calls[3]![1]);
    expect('proxied' in txt).toBe(false);
    expect(txt.ttl).toBe(1);
  });
  it('requires zoneId/type/name/content (each alone insufficient, trimmed)', async () => {
    const transport = vi.fn();
    const base = { zoneId: 'z', type: 'A', name: 'n', content: 'c' };
    await expect(createCloudflareDnsRecord({ ...base, zoneId: '' }, 'tok', transport)).rejects.toThrow('zoneId, type, name, content は必須です');
    await expect(createCloudflareDnsRecord({ ...base, type: '' }, 'tok', transport)).rejects.toThrow(/必須/);
    await expect(createCloudflareDnsRecord({ ...base, name: '  ' }, 'tok', transport)).rejects.toThrow(/必須/);
    await expect(createCloudflareDnsRecord({ ...base, content: '  ' }, 'tok', transport)).rejects.toThrow(/必須/);
    await expect(createCloudflareDnsRecord({ ...base, zoneId: 5 }, 'tok', transport)).rejects.toThrow(/必須/);
    await expect(createCloudflareDnsRecord({ ...base, type: 5 }, 'tok', transport)).rejects.toThrow(/必須/);
    await expect(createCloudflareDnsRecord({ ...base, name: 5 }, 'tok', transport)).rejects.toThrow(/必須/);
    await expect(createCloudflareDnsRecord({ ...base, content: 5 }, 'tok', transport)).rejects.toThrow(/必須/);
    expect(transport).not.toHaveBeenCalled();
  });
  it('throws on CF success:false with the first error message, else a generic one', async () => {
    let transport = vi.fn().mockResolvedValue(jsonResponse(200, { success: false, errors: [{ message: 'bad zone' }], result: null }));
    await expect(createCloudflareDnsRecord({ zoneId: 'z', type: 'A', name: 'n', content: 'c' }, 'tok', transport)).rejects.toThrow('Cloudflare: bad zone');
    transport = vi.fn().mockResolvedValue(jsonResponse(200, { success: false, result: null }));
    await expect(createCloudflareDnsRecord({ zoneId: 'z', type: 'A', name: 'n', content: 'c' }, 'tok', transport)).rejects.toThrow('Cloudflare: unknown error');
    transport = vi.fn().mockResolvedValue(jsonResponse(200, { success: false, errors: [], result: null }));
    await expect(createCloudflareDnsRecord({ zoneId: 'z', type: 'A', name: 'n', content: 'c' }, 'tok', transport)).rejects.toThrow('Cloudflare: unknown error');
  });
  it('surfaces HTTP errors before unwrapping', async () => {
    const transport = vi.fn().mockResolvedValue(jsonResponse(403, {}));
    await expect(createCloudflareDnsRecord({ zoneId: 'z', type: 'A', name: 'n', content: 'c' }, 'tok', transport)).rejects.toThrow(/Cloudflare API 403/);
  });
  it('purgeCloudflareCache: purge_everything path posts the exact endpoint/headers/body', async () => {
    const transport = vi.fn().mockResolvedValue(jsonResponse(200, { success: true, result: { id: 'p1' } }));
    const res = await purgeCloudflareCache({ zoneId: ' z ', purgeEverything: true }, 'tok', transport);
    expect(res).toEqual({ id: 'p1', purged: 'all' });
    const [url, init] = transport.mock.calls[0]!;
    expect(url).toBe('https://api.cloudflare.com/client/v4/zones/z/purge_cache');
    expect(init.method).toBe('POST');
    expect(headersOf(init)).toEqual({ Authorization: 'Bearer tok', Accept: 'application/json', 'Content-Type': 'application/json' });
    expect(bodyOf(init)).toEqual({ purge_everything: true });
  });
  it('purges specific files (filtering non-strings) and reports their count', async () => {
    const transport = vi.fn().mockResolvedValue(jsonResponse(200, { success: true, result: { id: 'p' } }));
    const r = await purgeCloudflareCache({ zoneId: 'z', files: ['https://a/x', 'https://a/y', 5] }, 'tok', transport);
    expect(r).toEqual({ id: 'p', purged: 2 });
    expect(bodyOf(transport.mock.calls[0]![1])).toEqual({ files: ['https://a/x', 'https://a/y'] });
  });
  it('treats purgeEverything strictly (only === true triggers the all path)', async () => {
    const transport = vi.fn();
    // purgeEverything が真値でも true でなければ files が必要 → 空 files で弾く。
    await expect(purgeCloudflareCache({ zoneId: 'z', purgeEverything: 1 }, 'tok', transport)).rejects.toThrow(/purgeEverything/);
    expect(transport).not.toHaveBeenCalled();
  });
  it('purgeCloudflareCache requires zoneId and (files or purgeEverything)', async () => {
    const transport = vi.fn();
    await expect(purgeCloudflareCache({}, 'tok', transport)).rejects.toThrow('zoneId は必須です');
    await expect(purgeCloudflareCache({ zoneId: '  ' }, 'tok', transport)).rejects.toThrow(/zoneId/);
    await expect(purgeCloudflareCache({ zoneId: 5 }, 'tok', transport)).rejects.toThrow(/zoneId/);
    await expect(purgeCloudflareCache({ zoneId: 'z' }, 'tok', transport)).rejects.toThrow('purgeEverything=true か、空でない files[] のいずれかが必要です');
    await expect(purgeCloudflareCache({ zoneId: 'z', files: [] }, 'tok', transport)).rejects.toThrow(/purgeEverything/);
    await expect(purgeCloudflareCache({ zoneId: 'z', files: [5, 6] }, 'tok', transport)).rejects.toThrow(/purgeEverything/);
    await expect(purgeCloudflareCache({ zoneId: 'z', files: 'notarray' }, 'tok', transport)).rejects.toThrow(/purgeEverything/);
    expect(transport).not.toHaveBeenCalled();
  });
  it('purge surfaces CF success:false and HTTP errors', async () => {
    let transport = vi.fn().mockResolvedValue(jsonResponse(200, { success: false, errors: [{ message: 'nope' }], result: null }));
    await expect(purgeCloudflareCache({ zoneId: 'z', purgeEverything: true }, 'tok', transport)).rejects.toThrow('Cloudflare: nope');
    transport = vi.fn().mockResolvedValue(jsonResponse(500, {}));
    await expect(purgeCloudflareCache({ zoneId: 'z', purgeEverything: true }, 'tok', transport)).rejects.toThrow(/Cloudflare API 500/);
  });
});

describe('parseSecurityKeys', () => {
  it('parses {hibp,vt} JSON', () => {
    expect(parseSecurityKeys(JSON.stringify({ hibp: 'h', vt: 'v' }))).toEqual({ hibp: 'h', vt: 'v' });
  });
  it('keeps only non-empty string keys', () => {
    expect(parseSecurityKeys(JSON.stringify({ hibp: 'h' }))).toEqual({ hibp: 'h' });
    expect(parseSecurityKeys(JSON.stringify({ vt: 'v' }))).toEqual({ vt: 'v' });
    expect(parseSecurityKeys(JSON.stringify({ vt: 123 }))).toEqual({});
    expect(parseSecurityKeys(JSON.stringify({ hibp: 5, vt: 'v' }))).toEqual({ vt: 'v' });
    expect(parseSecurityKeys(JSON.stringify({ hibp: '', vt: '' }))).toEqual({});
  });
  it('treats a raw (non-JSON) string as the HIBP key', () => {
    expect(parseSecurityKeys('rawkey')).toEqual({ hibp: 'rawkey' });
  });
  it('returns {} for empty input', () => {
    expect(parseSecurityKeys('')).toEqual({});
  });
  it('returns {} for non-object JSON (number / null / array)', () => {
    expect(parseSecurityKeys('123')).toEqual({});
    expect(parseSecurityKeys('null')).toEqual({});
    expect(parseSecurityKeys('[1,2]')).toEqual({});
  });
});

describe('scanUrlVirusTotal', () => {
  it('submits then reads the report with exact endpoints/headers/body and computes positives/total', async () => {
    const transport = vi.fn()
      .mockResolvedValueOnce(jsonResponse(200, { data: { id: 'x', type: 'analysis' } }))
      .mockResolvedValueOnce(jsonResponse(200, { data: { attributes: { last_analysis_stats: { harmless: 60, malicious: 2, suspicious: 1, undetected: 7 } } } }));
    const res = await scanUrlVirusTotal({ url: ' https://evil.test/ ' }, 'vtkey', transport);
    expect(res.positives).toBe(3);
    expect(res.total).toBe(70);
    expect(res.url).toBe('https://evil.test/'); // trimmed
    expect(res.reportUrl).toBe('https://www.virustotal.com/gui/url/aHR0cHM6Ly9ldmlsLnRlc3Qv');
    // submit POST: urlencoded body + x-apikey
    const [submitUrl, submitInit] = transport.mock.calls[0]!;
    expect(submitUrl).toBe('https://www.virustotal.com/api/v3/urls');
    expect(submitInit.method).toBe('POST');
    expect(headersOf(submitInit)).toEqual({ 'x-apikey': 'vtkey', 'Content-Type': 'application/x-www-form-urlencoded' });
    expect(submitInit.body).toBe('url=https%3A%2F%2Fevil.test%2F');
    // report GET: by padding-free base64url id
    const [reportUrl, reportInit] = transport.mock.calls[1]!;
    expect(reportUrl).toBe('https://www.virustotal.com/api/v3/urls/aHR0cHM6Ly9ldmlsLnRlc3Qv');
    expect(reportInit.method).toBe('GET');
    expect(headersOf(reportInit)).toEqual({ 'x-apikey': 'vtkey' });
  });
  it('strips base64 padding and converts + / in the VT id (so the report id is base64url)', async () => {
    const ok = jsonResponse(200, { data: { attributes: { last_analysis_stats: { harmless: 1, malicious: 0, suspicious: 0, undetected: 0 } } } });
    // 'https://a/a>a' の base64 は '+' を含む → '-' に置換されること。
    let transport = vi.fn().mockResolvedValueOnce(jsonResponse(200, {})).mockResolvedValueOnce(ok);
    let res = await scanUrlVirusTotal({ url: 'https://a/a>a' }, 'k', transport);
    expect(transport.mock.calls[1]![0]).toBe('https://www.virustotal.com/api/v3/urls/aHR0cHM6Ly9hL2E-YQ');
    expect(res.reportUrl).toBe('https://www.virustotal.com/gui/url/aHR0cHM6Ly9hL2E-YQ');
    // 'https://a/a?a' の base64 は '/' を含む → '_' に置換されること。
    transport = vi.fn().mockResolvedValueOnce(jsonResponse(200, {})).mockResolvedValueOnce(ok);
    res = await scanUrlVirusTotal({ url: 'https://a/a?a' }, 'k', transport);
    expect(transport.mock.calls[1]![0]).toBe('https://www.virustotal.com/api/v3/urls/aHR0cHM6Ly9hL2E_YQ');
  });
  it('requires a url (also trimmed)', async () => {
    const transport = vi.fn();
    await expect(scanUrlVirusTotal({}, 'k', transport)).rejects.toThrow('url は必須です');
    await expect(scanUrlVirusTotal({ url: '   ' }, 'k', transport)).rejects.toThrow(/必須/);
    await expect(scanUrlVirusTotal({ url: 5 }, 'k', transport)).rejects.toThrow(/必須/);
    expect(transport).not.toHaveBeenCalled();
  });
  it('surfaces submit and report HTTP errors', async () => {
    let transport = vi.fn().mockResolvedValueOnce(jsonResponse(429, {}));
    await expect(scanUrlVirusTotal({ url: 'https://x/' }, 'k', transport)).rejects.toThrow(/VirusTotal API 429/);
    transport = vi.fn().mockResolvedValueOnce(jsonResponse(200, {})).mockResolvedValueOnce(jsonResponse(404, {}));
    await expect(scanUrlVirusTotal({ url: 'https://x/' }, 'k', transport)).rejects.toThrow(/VirusTotal API 404/);
  });
});

describe('checkEmailBreach', () => {
  it('GETs the exact endpoint/headers and treats upstream 404 as no breaches', async () => {
    const transport = vi.fn().mockResolvedValue(jsonResponse(404, {}));
    const res = await checkEmailBreach({ email: ' a@b.com ' }, 'hibpkey', transport);
    expect(res).toEqual({ email: 'a@b.com', breaches: [] }); // trimmed
    const [url, init] = transport.mock.calls[0]!;
    expect(url).toBe('https://haveibeenpwned.com/api/v3/breachedaccount/a%40b.com?truncateResponse=false');
    expect(init.method).toBe('GET');
    expect(headersOf(init)).toEqual({
      'hibp-api-key': 'hibpkey',
      'User-Agent': 'service-hub',
      Accept: 'application/json',
    });
  });
  it('maps breach rows on 200', async () => {
    const transport = vi.fn().mockResolvedValue(jsonResponse(200, [
      { Name: 'Acme', Title: 'Acme Co', BreachDate: '2020-01-01', PwnCount: 100, DataClasses: ['Emails'] },
      { Name: 'Beta', Title: 'Beta Inc', BreachDate: '2021-02-02', PwnCount: 5, DataClasses: ['Passwords', 'Emails'] },
    ]));
    const res = await checkEmailBreach({ email: 'a@b.com' }, 'k', transport);
    expect(res.breaches).toEqual([
      { name: 'Acme', title: 'Acme Co', date: '2020-01-01', pwnCount: 100, dataClasses: ['Emails'] },
      { name: 'Beta', title: 'Beta Inc', date: '2021-02-02', pwnCount: 5, dataClasses: ['Passwords', 'Emails'] },
    ]);
  });
  it('throws on other HTTP errors', async () => {
    const transport = vi.fn().mockResolvedValue(jsonResponse(401, { message: 'bad key' }));
    await expect(checkEmailBreach({ email: 'a@b.com' }, 'k', transport)).rejects.toThrow(/HIBP API 401/);
  });
  it('requires an email (also trimmed)', async () => {
    const transport = vi.fn();
    await expect(checkEmailBreach({}, 'k', transport)).rejects.toThrow('email は必須です');
    await expect(checkEmailBreach({ email: '   ' }, 'k', transport)).rejects.toThrow(/必須/);
    await expect(checkEmailBreach({ email: 5 }, 'k', transport)).rejects.toThrow(/必須/);
    expect(transport).not.toHaveBeenCalled();
  });
});

// --- ensureOk のエラー整形 (status + 本文 200 文字 truncate) -----------------
describe('ensureOk error formatting', () => {
  it('includes the status and truncates the body excerpt to 200 chars', async () => {
    const long = 'x'.repeat(300);
    const fetchFn = vi.fn<typeof fetch>().mockResolvedValue({
      ok: false, status: 500, json: async () => ({}), text: async () => long,
    } as unknown as Response);
    let msg = '';
    try {
      await createGithubIssue({ owner: 'o', repo: 'r', title: 't' }, 'tok', fetchFn);
    } catch (e) {
      msg = (e as Error).message;
    }
    expect(msg).toBe(`GitHub API 500: ${'x'.repeat(200)}`);
    expect(msg).not.toContain('x'.repeat(201)); // slice(0,200)
  });
  it('falls back to an empty body excerpt when res.text() rejects', async () => {
    const fetchFn = vi.fn<typeof fetch>().mockResolvedValue({
      ok: false, status: 503, json: async () => ({}), text: async () => { throw new Error('boom'); },
    } as unknown as Response);
    let msg = '';
    try {
      await createGithubIssue({ owner: 'o', repo: 'r', title: 't' }, 'tok', fetchFn);
    } catch (e) {
      msg = (e as Error).message;
    }
    expect(msg).toBe('GitHub API 503: ');
  });
});
