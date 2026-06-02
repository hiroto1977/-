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

describe('createGithubIssue', () => {
  it('POSTs to the issues endpoint with bearer auth and returns the mapped result', async () => {
    const fetchFn = vi.fn<typeof fetch>().mockResolvedValue(
      jsonResponse(201, { number: 7, html_url: 'https://github.com/o/r/issues/7', title: 'Bug' }),
    );
    const res = await createGithubIssue({ owner: 'o', repo: 'r', title: 'Bug', body: 'desc' }, 'ghp_x', fetchFn);
    expect(res).toEqual({ number: 7, url: 'https://github.com/o/r/issues/7', title: 'Bug' });
    const [url, init] = fetchFn.mock.calls[0]!;
    expect(url).toBe('https://api.github.com/repos/o/r/issues');
    expect((init!.headers as Record<string, string>).Authorization).toBe('Bearer ghp_x');
    expect(init!.method).toBe('POST');
    expect(JSON.parse(init!.body as string)).toMatchObject({ title: 'Bug', body: 'desc' });
  });

  it('trims inputs and url-encodes owner/repo', async () => {
    const fetchFn = vi.fn<typeof fetch>().mockResolvedValue(
      jsonResponse(201, { number: 1, html_url: 'u', title: 't' }),
    );
    await createGithubIssue({ owner: ' a/b ', repo: ' c ', title: ' t ' }, 'tok', fetchFn);
    expect(fetchFn.mock.calls[0]![0]).toBe('https://api.github.com/repos/a%2Fb/c/issues');
  });

  it('rejects missing required fields without calling fetch', async () => {
    const fetchFn = vi.fn<typeof fetch>();
    await expect(createGithubIssue({ owner: 'o', repo: 'r' }, 'tok', fetchFn)).rejects.toThrow(/必須/);
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('requires every one of owner / repo / title (each alone is insufficient)', async () => {
    const fetchFn = vi.fn<typeof fetch>();
    // それぞれ1項目だけ欠けても必ず弾く (|| を && に変えると素通りするケースを検出)。
    await expect(createGithubIssue({ owner: 'o', title: 't' }, 'tok', fetchFn)).rejects.toThrow(/必須/); // repo 欠落
    await expect(createGithubIssue({ repo: 'r', title: 't' }, 'tok', fetchFn)).rejects.toThrow(/必須/); // owner 欠落
    await expect(createGithubIssue({ owner: 'o', repo: 'r', title: '   ' }, 'tok', fetchFn)).rejects.toThrow(/必須/); // 空白のみ title
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('rejects non-string required fields (typeof guard)', async () => {
    const fetchFn = vi.fn<typeof fetch>();
    await expect(createGithubIssue({ owner: 123, repo: 'r', title: 't' }, 'tok', fetchFn)).rejects.toThrow(/必須/);
    await expect(createGithubIssue({ owner: 'o', repo: {}, title: 't' }, 'tok', fetchFn)).rejects.toThrow(/必須/);
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('surfaces API errors with status and body excerpt', async () => {
    const fetchFn = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse(422, { message: 'Validation Failed' }));
    await expect(
      createGithubIssue({ owner: 'o', repo: 'r', title: 't' }, 'tok', fetchFn),
    ).rejects.toThrow(/GitHub API 422/);
  });

  it('filters non-string labels', async () => {
    const fetchFn = vi.fn<typeof fetch>().mockResolvedValue(
      jsonResponse(201, { number: 1, html_url: 'u', title: 't' }),
    );
    await createGithubIssue({ owner: 'o', repo: 'r', title: 't', labels: ['bug', 3, 'ui'] }, 'tok', fetchFn);
    expect(JSON.parse(fetchFn.mock.calls[0]![1]!.body as string).labels).toEqual(['bug', 'ui']);
  });
});

describe('createNotionPage', () => {
  it('POSTs to the pages endpoint via the transport and maps the result', async () => {
    const transport = vi.fn().mockResolvedValue(jsonResponse(200, { id: 'p1', url: 'https://notion.so/p1' }));
    const res = await createNotionPage({ parentPageId: 'par', title: 'T', body: 'hi' }, 'secret', transport);
    expect(res).toEqual({ id: 'p1', url: 'https://notion.so/p1' });
    const [url, init] = transport.mock.calls[0]!;
    expect(url).toBe('https://api.notion.com/v1/pages');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer secret');
    const sent = JSON.parse(init.body as string);
    expect(sent.parent).toEqual({ page_id: 'par' });
    expect(sent.children).toHaveLength(1);
  });
  it('omits children when no body', async () => {
    const transport = vi.fn().mockResolvedValue(jsonResponse(200, { id: 'p', url: 'u' }));
    await createNotionPage({ parentPageId: 'par', title: 'T' }, 'tok', transport);
    expect(JSON.parse(transport.mock.calls[0]![1].body as string).children).toEqual([]);
  });
  it('requires parentPageId and title', async () => {
    const transport = vi.fn();
    await expect(createNotionPage({ title: 'T' }, 'tok', transport)).rejects.toThrow(/必須/);
    expect(transport).not.toHaveBeenCalled();
  });
  it('surfaces API errors', async () => {
    const transport = vi.fn().mockResolvedValue(jsonResponse(401, { message: 'unauthorized' }));
    await expect(createNotionPage({ parentPageId: 'p', title: 'T' }, 'tok', transport)).rejects.toThrow(/Notion API 401/);
  });
});

describe('sendSlackMessage', () => {
  it('POSTs to chat.postMessage and returns ts/channel', async () => {
    const transport = vi.fn().mockResolvedValue(jsonResponse(200, { ok: true, ts: '1.2', channel: 'C1' }));
    const res = await sendSlackMessage({ channel: '#general', text: 'hello' }, 'xoxb', transport);
    expect(res).toEqual({ ts: '1.2', channel: 'C1' });
    expect(transport.mock.calls[0]![0]).toBe('https://slack.com/api/chat.postMessage');
  });
  it('throws when Slack returns ok:false even on HTTP 200', async () => {
    const transport = vi.fn().mockResolvedValue(jsonResponse(200, { ok: false, error: 'channel_not_found' }));
    await expect(sendSlackMessage({ channel: 'C', text: 't' }, 'tok', transport)).rejects.toThrow(/channel_not_found/);
  });
  it('requires channel and text', async () => {
    const transport = vi.fn();
    await expect(sendSlackMessage({ channel: 'C' }, 'tok', transport)).rejects.toThrow(/必須/);
    expect(transport).not.toHaveBeenCalled();
  });
});

const TOK = JSON.stringify({ email: 'me@x.com', token: 'apitok', site: 'https://acme.atlassian.net/' });

describe('parseAtlassianToken', () => {
  it('parses and trims the site trailing slash', () => {
    expect(parseAtlassianToken(TOK)).toEqual({ email: 'me@x.com', token: 'apitok', site: 'https://acme.atlassian.net' });
  });
  it('rejects non-JSON / missing fields / non-https', () => {
    expect(() => parseAtlassianToken('nope')).toThrow(/JSON/);
    expect(() => parseAtlassianToken(JSON.stringify({ email: 'a' }))).toThrow(/欠けている|不正/);
    expect(() => parseAtlassianToken(JSON.stringify({ email: 'a@b', token: 't', site: 'http://x' }))).toThrow(/https/);
  });
});

describe('createAtlassianIssue', () => {
  it('POSTs to the issue endpoint with Basic auth and returns key/url', async () => {
    const transport = vi.fn().mockResolvedValue(jsonResponse(201, { id: '1', key: 'ACME-1', self: 's' }));
    const res = await createAtlassianIssue({ projectKey: 'ACME', summary: 'S', description: 'd' }, TOK, transport);
    expect(res).toEqual({ key: 'ACME-1', url: 'https://acme.atlassian.net/browse/ACME-1' });
    const [url, init] = transport.mock.calls[0]!;
    expect(url).toBe('https://acme.atlassian.net/rest/api/3/issue');
    expect((init.headers as Record<string, string>).Authorization).toBe('Basic ' + btoa('me@x.com:apitok'));
    const sent = JSON.parse(init.body as string);
    expect(sent.fields.project).toEqual({ key: 'ACME' });
    expect(sent.fields.issuetype).toEqual({ name: 'Task' });
    expect(sent.fields.description.type).toBe('doc');
  });
  it('requires projectKey and summary', async () => {
    const transport = vi.fn();
    await expect(createAtlassianIssue({ summary: 'S' }, TOK, transport)).rejects.toThrow(/必須/);
    expect(transport).not.toHaveBeenCalled();
  });
  it('surfaces API errors', async () => {
    const transport = vi.fn().mockResolvedValue(jsonResponse(400, { error: 'bad' }));
    await expect(createAtlassianIssue({ projectKey: 'A', summary: 'S' }, TOK, transport)).rejects.toThrow(/Atlassian API 400/);
  });
});


describe('createCalendarEvent', () => {
  it('POSTs an event with start/end and returns id/htmlLink', async () => {
    const transport = vi.fn().mockResolvedValue(jsonResponse(200, { id: 'e1', htmlLink: 'https://cal/e1' }));
    const res = await createCalendarEvent({ summary: 'M', start: '2026-01-31T10:00:00', end: '2026-01-31T11:00:00', timeZone: 'Asia/Tokyo' }, 'tok', transport);
    expect(res).toEqual({ id: 'e1', htmlLink: 'https://cal/e1' });
    const sent = JSON.parse(transport.mock.calls[0]![1].body as string);
    expect(sent.start).toEqual({ dateTime: '2026-01-31T10:00:00', timeZone: 'Asia/Tokyo' });
  });
  it('requires summary/start/end', async () => {
    const transport = vi.fn();
    await expect(createCalendarEvent({ summary: 'M' }, 'tok', transport)).rejects.toThrow(/必須/);
  });
});

describe('gmail helpers + createGmailDraft', () => {
  it('isSafeHeaderValue rejects CRLF/NUL', () => {
    expect(isSafeHeaderValue('a@b.com')).toBe(true);
    expect(isSafeHeaderValue('a@b\r\nBcc: x')).toBe(false);
  });
  it('buildRfc2822 encodes subject and guards header injection', () => {
    expect(buildRfc2822('a@b.com', 'やあ', 'hi')).toContain('To: a@b.com');
    expect(() => buildRfc2822('a@b\r\nBcc: x', 's', 'b')).toThrow(/CR\/LF/);
  });
  it('createGmailDraft POSTs a base64url raw message', async () => {
    const transport = vi.fn().mockResolvedValue(jsonResponse(200, { id: 'd1', message: { id: 'm1' } }));
    const res = await createGmailDraft({ to: 'a@b.com', subject: 'S', body: 'B' }, 'tok', transport);
    expect(res).toEqual({ id: 'd1', messageId: 'm1' });
    const raw = JSON.parse(transport.mock.calls[0]![1].body as string).message.raw as string;
    expect(raw).not.toMatch(/[+/=]/); // base64url
  });
});

describe('createDriveFolder', () => {
  it('POSTs a folder mimeType and falls back to a folder URL', async () => {
    const transport = vi.fn().mockResolvedValue(jsonResponse(200, { id: 'f1', name: 'Docs' }));
    const res = await createDriveFolder({ name: 'Docs' }, 'tok', transport);
    expect(res).toEqual({ id: 'f1', name: 'Docs', url: 'https://drive.google.com/drive/folders/f1' });
    expect(JSON.parse(transport.mock.calls[0]![1].body as string).mimeType).toBe('application/vnd.google-apps.folder');
  });
});

describe('createWordPressPostDraft', () => {
  it('defaults to draft status and returns id/url/title', async () => {
    const transport = vi.fn().mockResolvedValue(jsonResponse(200, { ID: 9, URL: 'u', title: 'T' }));
    const res = await createWordPressPostDraft({ siteId: 'blog.example.com', title: 'T' }, 'tok', transport);
    expect(res).toEqual({ id: 9, url: 'u', title: 'T' });
    expect(JSON.parse(transport.mock.calls[0]![1].body as string).status).toBe('draft');
  });
});

describe('createCanvaFolder', () => {
  it('defaults parent to root', async () => {
    const transport = vi.fn().mockResolvedValue(jsonResponse(200, { folder: { id: 'c1', name: 'N' } }));
    const res = await createCanvaFolder({ name: 'N' }, 'tok', transport);
    expect(res).toEqual({ id: 'c1', name: 'N' });
    expect(JSON.parse(transport.mock.calls[0]![1].body as string).parent_folder_id).toBe('root');
  });
});

describe('cloudflare', () => {
  it('createCloudflareDnsRecord unwraps the CF envelope', async () => {
    const transport = vi.fn().mockResolvedValue(jsonResponse(200, { success: true, result: { id: 'r1', name: 'a.x', type: 'A' } }));
    const res = await createCloudflareDnsRecord({ zoneId: 'z', type: 'A', name: 'a.x', content: '1.2.3.4' }, 'tok', transport);
    expect(res).toEqual({ id: 'r1', name: 'a.x', type: 'A' });
    expect(JSON.parse(transport.mock.calls[0]![1].body as string).proxied).toBe(false);
  });
  it('throws on CF success:false', async () => {
    const transport = vi.fn().mockResolvedValue(jsonResponse(200, { success: false, errors: [{ message: 'bad zone' }], result: null }));
    await expect(createCloudflareDnsRecord({ zoneId: 'z', type: 'A', name: 'n', content: 'c' }, 'tok', transport)).rejects.toThrow(/bad zone/);
  });
  it('purgeCloudflareCache requires files or purgeEverything', async () => {
    const transport = vi.fn();
    await expect(purgeCloudflareCache({ zoneId: 'z' }, 'tok', transport)).rejects.toThrow(/purgeEverything/);
  });
  it('purgeCloudflareCache purge_everything path', async () => {
    const transport = vi.fn().mockResolvedValue(jsonResponse(200, { success: true, result: { id: 'p1' } }));
    const res = await purgeCloudflareCache({ zoneId: 'z', purgeEverything: true }, 'tok', transport);
    expect(res).toEqual({ id: 'p1', purged: 'all' });
  });
});


describe('parseSecurityKeys', () => {
  it('parses {hibp,vt} JSON', () => {
    expect(parseSecurityKeys(JSON.stringify({ hibp: 'h', vt: 'v' }))).toEqual({ hibp: 'h', vt: 'v' });
  });
  it('treats a raw string as the HIBP key', () => {
    expect(parseSecurityKeys('rawkey')).toEqual({ hibp: 'rawkey' });
  });
  it('returns {} for empty', () => {
    expect(parseSecurityKeys('')).toEqual({});
  });
});

describe('scanUrlVirusTotal', () => {
  it('submits then reads the report and computes positives/total', async () => {
    const transport = vi.fn()
      .mockResolvedValueOnce(jsonResponse(200, { data: { id: 'x', type: 'analysis' } }))
      .mockResolvedValueOnce(jsonResponse(200, { data: { attributes: { last_analysis_stats: { harmless: 60, malicious: 2, suspicious: 1, undetected: 7 } } } }));
    const res = await scanUrlVirusTotal({ url: 'https://evil.test/' }, 'vtkey', transport);
    expect(res.positives).toBe(3);
    expect(res.total).toBe(70);
    expect(res.reportUrl).toContain('https://www.virustotal.com/gui/url/');
    // first call POSTs urlencoded body
    expect(transport.mock.calls[0]![1].method).toBe('POST');
    expect((transport.mock.calls[0]![1].headers as Record<string, string>)['x-apikey']).toBe('vtkey');
  });
  it('requires a url', async () => {
    const transport = vi.fn();
    await expect(scanUrlVirusTotal({}, 'k', transport)).rejects.toThrow(/必須/);
    expect(transport).not.toHaveBeenCalled();
  });
});


describe('checkEmailBreach', () => {
  it('treats upstream 404 as no breaches', async () => {
    const transport = vi.fn().mockResolvedValue(jsonResponse(404, {}));
    const res = await checkEmailBreach({ email: 'a@b.com' }, 'hibpkey', transport);
    expect(res).toEqual({ email: 'a@b.com', breaches: [] });
    expect((transport.mock.calls[0]![1].headers as Record<string, string>)['hibp-api-key']).toBe('hibpkey');
  });
  it('maps breach rows on 200', async () => {
    const transport = vi.fn().mockResolvedValue(jsonResponse(200, [
      { Name: 'Acme', Title: 'Acme Co', BreachDate: '2020-01-01', PwnCount: 100, DataClasses: ['Emails'] },
    ]));
    const res = await checkEmailBreach({ email: 'a@b.com' }, 'k', transport);
    expect(res.breaches).toEqual([{ name: 'Acme', title: 'Acme Co', date: '2020-01-01', pwnCount: 100, dataClasses: ['Emails'] }]);
  });
  it('throws on other HTTP errors', async () => {
    const transport = vi.fn().mockResolvedValue(jsonResponse(401, { message: 'bad key' }));
    await expect(checkEmailBreach({ email: 'a@b.com' }, 'k', transport)).rejects.toThrow(/HIBP API 401/);
  });
  it('requires an email', async () => {
    const transport = vi.fn();
    await expect(checkEmailBreach({}, 'k', transport)).rejects.toThrow(/必須/);
    expect(transport).not.toHaveBeenCalled();
  });
});

// --- 精度強化: 分岐・既定値・エッジ・厳密なリクエスト形 -------------------
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
    expect(msg).toContain('GitHub API 500');
    expect(msg).toContain('x'.repeat(200));
    expect(msg).not.toContain('x'.repeat(201)); // slice(0,200)
  });
});

describe('createGithubIssue request shape', () => {
  it('sends auth header + title/body and filtered labels to the exact URL', async () => {
    const fetchFn = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse(201, { number: 1, html_url: 'u', title: 'T' }));
    await createGithubIssue({ owner: 'o', repo: 'r', title: 'T', body: 'B', labels: ['a', 2, 'b'] }, 'tok', fetchFn);
    expect(fetchFn.mock.calls[0]![0]).toBe('https://api.github.com/repos/o/r/issues');
    expect((fetchFn.mock.calls[0]![1]!.headers as Record<string, string>).Authorization).toBe('Bearer tok');
    const sent = JSON.parse(fetchFn.mock.calls[0]![1]!.body as string);
    expect(sent).toMatchObject({ title: 'T', body: 'B', labels: ['a', 'b'] });
  });
});

describe('createNotionPage children branch', () => {
  it('wraps body text in a paragraph child, else empty children', async () => {
    const transport = vi.fn().mockResolvedValue(jsonResponse(200, { id: 'p', url: 'u' }));
    await createNotionPage({ parentPageId: 'par', title: 'T', body: 'hello' }, 'tok', transport);
    const withBody = JSON.parse(transport.mock.calls[0]![1].body as string);
    expect(withBody.children).toHaveLength(1);
    expect(withBody.children[0].paragraph.rich_text[0].text.content).toBe('hello');
    expect(transport.mock.calls[0]![0]).toBe('https://api.notion.com/v1/pages');
    await createNotionPage({ parentPageId: 'par', title: 'T' }, 'tok', transport);
    expect(JSON.parse(transport.mock.calls[1]![1].body as string).children).toEqual([]);
  });
});

describe('sendSlackMessage success defaults', () => {
  it('returns ts and falls back channel to the input when absent', async () => {
    const transport = vi.fn().mockResolvedValue(jsonResponse(200, { ok: true, ts: '1.2' }));
    const r = await sendSlackMessage({ channel: 'C', text: 'hi' }, 'tok', transport);
    expect(r).toEqual({ ts: '1.2', channel: 'C' });
  });
});

describe('parseAtlassianToken edges', () => {
  it('rejects an over-long email, control chars, non-https; strips trailing slashes', () => {
    const longEmail = 'a'.repeat(255) + '@b.com';
    expect(() => parseAtlassianToken(JSON.stringify({ email: longEmail, token: 't', site: 'https://x.atlassian.net' }))).toThrow(/欠けている|不正/);
    expect(() => parseAtlassianToken(JSON.stringify({ email: 'a@b\n', token: 't', site: 'https://x.atlassian.net' }))).toThrow(/制御文字/);
    expect(() => parseAtlassianToken(JSON.stringify({ email: 'a@b', token: 't\r', site: 'https://x.atlassian.net' }))).toThrow(/制御文字/);
    const c = parseAtlassianToken(JSON.stringify({ email: 'a@b', token: 't', site: 'https://x.atlassian.net///' }));
    expect(c.site).toBe('https://x.atlassian.net');
  });
});

describe('createAtlassianIssue defaults + body', () => {
  const tok = JSON.stringify({ email: 'a@b', token: 't', site: 'https://x.atlassian.net' });
  it('defaults issueType to Task, embeds description doc, builds browse URL', async () => {
    const transport = vi.fn().mockResolvedValue(jsonResponse(200, { key: 'PROJ-1' }));
    const r = await createAtlassianIssue({ projectKey: 'PROJ', summary: 'S', description: 'D' }, tok, transport);
    expect(r).toEqual({ key: 'PROJ-1', url: 'https://x.atlassian.net/browse/PROJ-1' });
    const sent = JSON.parse(transport.mock.calls[0]![1].body as string);
    expect(sent.fields.issuetype.name).toBe('Task');
    expect(sent.fields.description.content[0].content[0].text).toBe('D');
  });
  it('honors an explicit issueType and omits description when absent', async () => {
    const transport = vi.fn().mockResolvedValue(jsonResponse(200, { key: 'P-2' }));
    await createAtlassianIssue({ projectKey: 'P', summary: 'S', issueType: 'Bug' }, tok, transport);
    const sent = JSON.parse(transport.mock.calls[0]![1].body as string);
    expect(sent.fields.issuetype.name).toBe('Bug');
    expect('description' in sent.fields).toBe(false);
  });
});

describe('createCalendarEvent optionals', () => {
  it('passes description/location/timeZone through', async () => {
    const transport = vi.fn().mockResolvedValue(jsonResponse(200, { id: 'e', htmlLink: 'h' }));
    await createCalendarEvent(
      { summary: 'M', start: '2026-01-01T10:00:00', end: '2026-01-01T11:00:00', description: 'D', location: 'L', timeZone: 'Asia/Tokyo' },
      'tok',
      transport,
    );
    const sent = JSON.parse(transport.mock.calls[0]![1].body as string);
    expect(sent.description).toBe('D');
    expect(sent.location).toBe('L');
    expect(sent.start.timeZone).toBe('Asia/Tokyo');
    expect(sent.end.dateTime).toBe('2026-01-01T11:00:00');
  });
});

describe('createWordPressPostDraft status allowlist', () => {
  it('keeps an allowed status and coerces an unknown one to draft', async () => {
    const transport = vi.fn().mockResolvedValue(jsonResponse(200, { ID: 1, URL: 'u', title: 'T' }));
    await createWordPressPostDraft({ siteId: 's', title: 'T', status: 'publish' }, 'tok', transport);
    expect(JSON.parse(transport.mock.calls[0]![1].body as string).status).toBe('publish');
    await createWordPressPostDraft({ siteId: 's', title: 'T', status: 'bogus' }, 'tok', transport);
    expect(JSON.parse(transport.mock.calls[1]![1].body as string).status).toBe('draft');
  });
});

describe('createCanvaFolder explicit parent', () => {
  it('uses a provided parentFolderId instead of root', async () => {
    const transport = vi.fn().mockResolvedValue(jsonResponse(200, { folder: { id: 'c', name: 'N' } }));
    await createCanvaFolder({ name: 'N', parentFolderId: 'FID' }, 'tok', transport);
    expect(JSON.parse(transport.mock.calls[0]![1].body as string).parent_folder_id).toBe('FID');
  });
});

describe('createDriveFolder parents branch', () => {
  it('includes parents and uses webViewLink when present', async () => {
    const transport = vi.fn().mockResolvedValue(jsonResponse(200, { id: 'f', name: 'N', webViewLink: 'L' }));
    const r = await createDriveFolder({ name: 'N', parentId: 'P' }, 'tok', transport);
    expect(r.url).toBe('L');
    expect(JSON.parse(transport.mock.calls[0]![1].body as string).parents).toEqual(['P']);
  });
});

describe('cloudflare proxied + purge files', () => {
  it('sets proxied for A and respects proxied=true; omits it for TXT', async () => {
    const transport = vi.fn().mockResolvedValue(jsonResponse(200, { success: true, result: { id: 'r', name: 'n', type: 'A' } }));
    await createCloudflareDnsRecord({ zoneId: 'z', type: 'A', name: 'n', content: '1.1.1.1', proxied: true }, 'tok', transport);
    expect(JSON.parse(transport.mock.calls[0]![1].body as string).proxied).toBe(true);
    await createCloudflareDnsRecord({ zoneId: 'z', type: 'TXT', name: 'n', content: 'v' }, 'tok', transport);
    expect('proxied' in JSON.parse(transport.mock.calls[1]![1].body as string)).toBe(false);
  });
  it('purges specific files and reports their count', async () => {
    const transport = vi.fn().mockResolvedValue(jsonResponse(200, { success: true, result: { id: 'p' } }));
    const r = await purgeCloudflareCache({ zoneId: 'z', files: ['https://a/x', 'https://a/y', 5] }, 'tok', transport);
    expect(r).toEqual({ id: 'p', purged: 2 });
    expect(JSON.parse(transport.mock.calls[0]![1].body as string).files).toEqual(['https://a/x', 'https://a/y']);
  });
});

describe('VirusTotal report addressing + parseSecurityKeys', () => {
  it('addresses the report by a padding-free base64url id', async () => {
    const transport = vi.fn()
      .mockResolvedValueOnce(jsonResponse(200, {}))
      .mockResolvedValueOnce(jsonResponse(200, { data: { attributes: { last_analysis_stats: { harmless: 1, malicious: 0, suspicious: 0, undetected: 0 } } } }));
    await scanUrlVirusTotal({ url: 'https://x/' }, 'k', transport);
    const reportUrl = transport.mock.calls[1]![0] as string;
    expect(reportUrl).toMatch(/^https:\/\/www\.virustotal\.com\/api\/v3\/urls\/[A-Za-z0-9_-]+$/);
  });
  it('keeps only string keys and ignores non-object JSON', () => {
    expect(parseSecurityKeys(JSON.stringify({ hibp: 'h' }))).toEqual({ hibp: 'h' });
    expect(parseSecurityKeys(JSON.stringify({ vt: 123 }))).toEqual({});
    expect(parseSecurityKeys('123')).toEqual({}); // JSON 数値 → 非オブジェクト → {}
  });
});
