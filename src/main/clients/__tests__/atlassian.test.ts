import { describe, expect, it, vi } from 'vitest';
import { fetchAtlassianSnapshot, parseAtlassianToken, ACTIONS } from '../atlassian';
import { FetchError } from '../types';

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

describe('parseAtlassianToken', () => {
  it('parses valid JSON credentials and trims trailing slash from site', () => {
    const creds = parseAtlassianToken(
      JSON.stringify({ email: 'a@b.com', token: 't', site: 'https://x.atlassian.net/' }),
    );
    expect(creds.site).toBe('https://x.atlassian.net');
  });

  // --- type validation kills (each typeof check) -----------------------

  it('rejects non-string email (number / null / object)', () => {
    expect(() => parseAtlassianToken(JSON.stringify({ email: 123, token: 't', site: 'https://x.atlassian.net' }))).toThrow(/形式が不正/);
    expect(() => parseAtlassianToken(JSON.stringify({ email: null, token: 't', site: 'https://x.atlassian.net' }))).toThrow(/形式が不正/);
    expect(() => parseAtlassianToken(JSON.stringify({ email: { x: 1 }, token: 't', site: 'https://x.atlassian.net' }))).toThrow(/形式が不正/);
  });

  it('rejects non-string token', () => {
    expect(() => parseAtlassianToken(JSON.stringify({ email: 'a@b.com', token: 42, site: 'https://x.atlassian.net' }))).toThrow(/形式が不正/);
  });

  it('rejects non-string site', () => {
    expect(() => parseAtlassianToken(JSON.stringify({ email: 'a@b.com', token: 't', site: false }))).toThrow(/形式が不正/);
  });

  it('rejects empty email/token/site', () => {
    expect(() => parseAtlassianToken(JSON.stringify({ email: '', token: 't', site: 'https://x.atlassian.net' }))).toThrow(/形式が不正/);
    expect(() => parseAtlassianToken(JSON.stringify({ email: 'a@b.com', token: '', site: 'https://x.atlassian.net' }))).toThrow(/形式が不正/);
    expect(() => parseAtlassianToken(JSON.stringify({ email: 'a@b.com', token: 't', site: '' }))).toThrow(/形式が不正/);
  });

  // --- length cap kills (each MAX_X EqualityOperator) ------------------

  it('accepts max-length email exactly at the 254-char boundary (kills `>` → `>=`)', () => {
    // 254 char email: "a".repeat(243) + "@example.com" = 255 chars,
    // tweak to exactly 254.
    const email = 'a'.repeat(254 - '@b.com'.length) + '@b.com';
    expect(email.length).toBe(254);
    const creds = parseAtlassianToken(JSON.stringify({ email, token: 't', site: 'https://x.atlassian.net' }));
    expect(creds.email).toBe(email);
  });

  it('rejects email > 254 chars', () => {
    const email = 'a'.repeat(248) + '@b.com'; // 254
    const longEmail = email + 'x'; // 255
    expect(() => parseAtlassianToken(JSON.stringify({ email: longEmail, token: 't', site: 'https://x.atlassian.net' }))).toThrow(/形式が不正/);
  });

  it('rejects token > 1024 chars (kills MAX_TOKEN boundary)', () => {
    expect(() => parseAtlassianToken(JSON.stringify({ email: 'a@b.com', token: 'x'.repeat(1025), site: 'https://x.atlassian.net' }))).toThrow(/形式が不正/);
  });

  it('accepts token exactly at 1024 chars', () => {
    const creds = parseAtlassianToken(JSON.stringify({ email: 'a@b.com', token: 'x'.repeat(1024), site: 'https://x.atlassian.net' }));
    expect(creds.token).toBe('x'.repeat(1024));
  });

  it('accepts site exactly at 256 chars (kills `>` → `>=` boundary on MAX_SITE)', () => {
    // The site length cap is `> MAX_SITE`. Mutating to `>=` would
    // reject the boundary case. Build a site of exactly 256 chars.
    // 'https://' (8) + subdomain (235) + '.atlassian.net' (14) - but
    // hostname labels max 63 chars, so use chained subdomains.
    const pad = 256 - 'https://'.length - '.atlassian.net'.length;
    // pad = 234. Build "a".repeat(60) + "." + ... to stay valid host.
    const sub = 'a'.repeat(60) + '.' + 'b'.repeat(60) + '.' + 'c'.repeat(60) + '.' + 'd'.repeat(pad - 183);
    const site = `https://${sub}.atlassian.net`;
    expect(site.length).toBe(256);
    const creds = parseAtlassianToken(JSON.stringify({ email: 'a@b.com', token: 't', site }));
    expect(creds.site).toBe(site);
  });

  it('rejects site > 256 chars (kills MAX_SITE boundary)', () => {
    const longSite = 'https://' + 'a'.repeat(245) + '.atlassian.net';
    expect(longSite.length).toBeGreaterThan(256);
    expect(() => parseAtlassianToken(JSON.stringify({ email: 'a@b.com', token: 't', site: longSite }))).toThrow(/形式が不正/);
  });

  // --- CR/LF/NUL refusal -----------------------------------------------

  it('rejects CR/LF/NUL in email (kills the email branch of the `||`)', () => {
    expect(() => parseAtlassianToken(JSON.stringify({ email: 'a@b.com\r\n', token: 't', site: 'https://x.atlassian.net' }))).toThrow(/制御文字/);
  });

  it('rejects CR/LF/NUL in token (kills the token branch of the `||` → `&&` mutation)', () => {
    // The LogicalOperator mutation flips || to &&. With &&, only BOTH
    // having control chars triggers — token-only would slip through.
    expect(() => parseAtlassianToken(JSON.stringify({ email: 'a@b.com', token: 't\n', site: 'https://x.atlassian.net' }))).toThrow(/制御文字/);
    expect(() => parseAtlassianToken(JSON.stringify({ email: 'a@b.com', token: 't\0', site: 'https://x.atlassian.net' }))).toThrow(/制御文字/);
  });

  // --- hostname allowlist ----------------------------------------------

  it('rejects a non-atlassian.net hostname (kills the allowlist check)', () => {
    expect(() => parseAtlassianToken(JSON.stringify({ email: 'a@b.com', token: 't', site: 'https://attacker.example.com' }))).toThrow(/atlassian\.net/);
  });

  it('accepts only *.atlassian.net (subdomain required)', () => {
    // Bare "atlassian.net" without subdomain: hostname.endsWith('.atlassian.net') is FALSE.
    expect(() => parseAtlassianToken(JSON.stringify({ email: 'a@b.com', token: 't', site: 'https://atlassian.net' }))).toThrow(/atlassian\.net/);
  });

  it('strips MULTIPLE trailing slashes from site (kills `\\/+$` → `\\/$` mutation)', () => {
    // Mutating `\/+$` to `\/$` would only strip one trailing slash.
    // Pin with a site that has 3 trailing slashes.
    const creds = parseAtlassianToken(
      JSON.stringify({ email: 'a@b.com', token: 't', site: 'https://x.atlassian.net///' }),
    );
    expect(creds.site).toBe('https://x.atlassian.net');
    expect(creds.site).not.toMatch(/\/$/);
  });

  it('throws FetchError for invalid JSON', () => {
    expect(() => parseAtlassianToken('not-json')).toThrow(FetchError);
  });

  it('throws FetchError when fields are missing', () => {
    expect(() => parseAtlassianToken(JSON.stringify({ email: 'a@b.com' }))).toThrow(FetchError);
  });

  it('throws specifically when email is the missing field', () => {
    // Kills the `!obj.email || !obj.token || !obj.site` LogicalOperator
    // mutation: with a `||` → `&&` mutation, ANY single-missing case
    // wouldn't throw.
    expect(() =>
      parseAtlassianToken(JSON.stringify({ token: 't', site: 'https://x.atlassian.net' })),
    ).toThrow(FetchError);
  });

  it('throws specifically when token is the missing field', () => {
    expect(() =>
      parseAtlassianToken(JSON.stringify({ email: 'a@b.com', site: 'https://x.atlassian.net' })),
    ).toThrow(FetchError);
  });

  it('throws specifically when site is the missing field', () => {
    expect(() =>
      parseAtlassianToken(JSON.stringify({ email: 'a@b.com', token: 't' })),
    ).toThrow(FetchError);
  });

  // --- security: reject non-https sites
  it('rejects http:// site (would put Basic auth in cleartext)', () => {
    expect(() =>
      parseAtlassianToken(
        JSON.stringify({ email: 'a@b.com', token: 't', site: 'http://x.atlassian.net' }),
      ),
    ).toThrow(/https/);
  });

  it('rejects javascript:// site (would crash URL handling later or exfiltrate token)', () => {
    expect(() =>
      parseAtlassianToken(
        JSON.stringify({ email: 'a@b.com', token: 't', site: 'javascript:alert(1)' }),
      ),
    ).toThrow(FetchError);
  });

  it('rejects file:// site', () => {
    expect(() =>
      parseAtlassianToken(
        JSON.stringify({ email: 'a@b.com', token: 't', site: 'file:///etc/passwd' }),
      ),
    ).toThrow(/https/);
  });

  it('rejects an unparseable site string', () => {
    expect(() =>
      parseAtlassianToken(
        JSON.stringify({ email: 'a@b.com', token: 't', site: 'not a url' }),
      ),
    ).toThrow(FetchError);
  });
});

describe('fetchAtlassianSnapshot', () => {
  it('uses Basic auth and normalizes projects', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        jsonResponse({
          values: [
            { key: 'KAN', name: 'AMITARIS', projectTypeKey: 'software', style: 'next-gen' },
          ],
        }),
      );

    const token = JSON.stringify({
      email: 'a@b.com',
      token: 'apitoken',
      site: 'https://x.atlassian.net',
    });
    const snap = await fetchAtlassianSnapshot({ token, fetch: fetchMock });

    const [, init] = fetchMock.mock.calls[0]!;
    const headers = (init as RequestInit).headers as Record<string, string>;
    expect(headers.Authorization).toMatch(/^Basic /);
    const decoded = Buffer.from(headers.Authorization!.replace('Basic ', ''), 'base64').toString();
    expect(decoded).toBe('a@b.com:apitoken');

    expect(snap.sites[0]).toMatchObject({ url: 'https://x.atlassian.net' });
    expect(snap.jiraProjects[0]).toMatchObject({ key: 'KAN', name: 'AMITARIS' });
  });

  it('sets sites[0].scopes to ["basic-auth"] and derives cloudId/name from the host', async () => {
    // Kills the ArrayDeclaration mutation `[]` on the scopes array,
    // plus the host-derivation logic that strips https:// and slices
    // before the first dot.
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValueOnce(jsonResponse({ values: [] }));
    const token = JSON.stringify({
      email: 'a@b.com',
      token: 't',
      site: 'https://my-team.atlassian.net',
    });
    const snap = await fetchAtlassianSnapshot({ token, fetch: fetchMock });
    expect(snap.sites[0]!.scopes).toEqual(['basic-auth']);
    expect(snap.sites[0]!.cloudId).toBe('my-team.atlassian.net');
    expect(snap.sites[0]!.name).toBe('my-team');
  });
});

describe('fetchAtlassianSnapshot edge cases', () => {
  it('returns an empty jiraProjects list when the API omits values entirely', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValueOnce(
      jsonResponse({} /* no values key */),
    );
    const token = JSON.stringify({
      email: 'a@b.com',
      token: 'apitoken',
      site: 'https://x.atlassian.net',
    });
    const snap = await fetchAtlassianSnapshot({ token, fetch: fetchMock });
    expect(snap.jiraProjects).toEqual([]);
    expect(snap.sites[0]!.url).toBe('https://x.atlassian.net');
  });
});

describe('ACTIONS["create-issue"]', () => {
  const token = JSON.stringify({
    email: 'a@b.com',
    token: 'apitoken',
    site: 'https://x.atlassian.net',
  });

  it('POSTs to {site}/rest/api/3/issue with project/summary/description', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValueOnce(
      jsonResponse({ id: '10001', key: 'KAN-42', self: 'https://x/issue/10001' }),
    );

    const result = (await ACTIONS['create-issue']!({
      token,
      fetch: fetchMock,
      payload: { projectKey: 'KAN', summary: 'Hello', description: 'body text' },
    })) as { key: string; url: string };

    expect(result).toEqual({ key: 'KAN-42', url: 'https://x.atlassian.net/browse/KAN-42' });

    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('https://x.atlassian.net/rest/api/3/issue');
    expect((init as RequestInit).method).toBe('POST');
    // Pins Authorization + Accept + Content-Type headers all present
    // (kills the `headers = {}` ObjectLiteral mutation on the createIssue
    // request init). All three are required for Jira to accept the POST.
    const headers = (init as RequestInit).headers as Record<string, string>;
    expect(headers).toBeDefined();
    expect(headers.Authorization).toMatch(/^Basic /);
    expect(headers.Accept).toBe('application/json');
    expect(headers['Content-Type']).toBe('application/json');
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body.fields.project).toEqual({ key: 'KAN' });
    expect(body.fields.summary).toBe('Hello');
    expect(body.fields.issuetype).toEqual({ name: 'Task' });
    // description wrapped as Atlassian Document Format
    expect(body.fields.description.type).toBe('doc');
    expect(body.fields.description.content[0].content[0].text).toBe('body text');
  });

  it('honors a custom issue type', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValueOnce(
      jsonResponse({ id: '1', key: 'KAN-1', self: '' }),
    );
    await ACTIONS['create-issue']!({
      token,
      fetch: fetchMock,
      payload: { projectKey: 'KAN', summary: 'x', issueType: 'Bug' },
    });
    const body = JSON.parse((fetchMock.mock.calls[0]![1] as RequestInit).body as string);
    expect(body.fields.issuetype.name).toBe('Bug');
    expect(body.fields.description).toBeUndefined();
  });

  it('rejects when projectKey/summary are missing', async () => {
    const fetchMock = vi.fn<typeof fetch>();
    await expect(
      ACTIONS['create-issue']!({ token, fetch: fetchMock, payload: { projectKey: 'KAN' } }),
    ).rejects.toThrow();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
