import { describe, expect, it, vi } from 'vitest';
import { fetchAtlassianSnapshot, parseAtlassianToken } from '../atlassian';
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
