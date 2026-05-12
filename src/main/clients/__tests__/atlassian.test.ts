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

  it('throws FetchError for invalid JSON', () => {
    expect(() => parseAtlassianToken('not-json')).toThrow(FetchError);
  });

  it('throws FetchError when fields are missing', () => {
    expect(() => parseAtlassianToken(JSON.stringify({ email: 'a@b.com' }))).toThrow(FetchError);
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

    const [, init] = fetchMock.mock.calls[0];
    const headers = (init as RequestInit).headers as Record<string, string>;
    expect(headers.Authorization).toMatch(/^Basic /);
    const decoded = Buffer.from(headers.Authorization.replace('Basic ', ''), 'base64').toString();
    expect(decoded).toBe('a@b.com:apitoken');

    expect(snap.sites[0]).toMatchObject({ url: 'https://x.atlassian.net' });
    expect(snap.jiraProjects[0]).toMatchObject({ key: 'KAN', name: 'AMITARIS' });
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
    expect(snap.sites[0].url).toBe('https://x.atlassian.net');
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

    const result = (await ACTIONS['create-issue']({
      token,
      fetch: fetchMock,
      payload: { projectKey: 'KAN', summary: 'Hello', description: 'body text' },
    })) as { key: string; url: string };

    expect(result).toEqual({ key: 'KAN-42', url: 'https://x.atlassian.net/browse/KAN-42' });

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://x.atlassian.net/rest/api/3/issue');
    expect((init as RequestInit).method).toBe('POST');
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
    await ACTIONS['create-issue']({
      token,
      fetch: fetchMock,
      payload: { projectKey: 'KAN', summary: 'x', issueType: 'Bug' },
    });
    const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string);
    expect(body.fields.issuetype.name).toBe('Bug');
    expect(body.fields.description).toBeUndefined();
  });

  it('rejects when projectKey/summary are missing', async () => {
    const fetchMock = vi.fn<typeof fetch>();
    await expect(
      ACTIONS['create-issue']({ token, fetch: fetchMock, payload: { projectKey: 'KAN' } }),
    ).rejects.toThrow();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
