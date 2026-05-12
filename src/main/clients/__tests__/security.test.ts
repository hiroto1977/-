import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  ACTIONS,
  detectNorton,
  fetchSecuritySnapshot,
  parseSecurityKeys,
} from '../security';
import { FetchError } from '../types';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('parseSecurityKeys', () => {
  it('returns {} for an empty string', () => {
    expect(parseSecurityKeys('')).toEqual({});
  });

  it('parses a JSON blob with hibp + vt', () => {
    expect(parseSecurityKeys('{"hibp":"abc","vt":"xyz"}')).toEqual({ hibp: 'abc', vt: 'xyz' });
  });

  it('treats a non-JSON value as a single HIBP key', () => {
    expect(parseSecurityKeys('plain-string')).toEqual({ hibp: 'plain-string' });
  });

  it('drops empty/non-string fields', () => {
    expect(parseSecurityKeys('{"hibp":"k","vt":""}')).toEqual({ hibp: 'k' });
  });
});

describe('detectNorton', () => {
  let tmpDir = '';

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'norton-test-'));
  });
  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('returns installed=false on linux without trying any paths', async () => {
    const result = await detectNorton('linux');
    expect(result.installed).toBe(false);
    expect(result.platform).toBe('linux');
    expect(result.details).toMatch(/Linux 版/);
  });

  it('returns installed=false when none of the win32 paths exist', async () => {
    const result = await detectNorton('win32');
    expect(result.installed).toBe(false);
    expect(result.platform).toBe('win32');
  });

  // Note: the real win32/darwin paths are absolute (`C:\...` or `/Applications/...`)
  // and we can't fake them in CI without monkeypatching. The structure of the
  // function is exercised by the negative cases above; happy-path detection
  // is covered manually on a real Norton install.
});

describe('fetchSecuritySnapshot', () => {
  it('reflects whether each API key is present', async () => {
    const snap1 = await fetchSecuritySnapshot({ token: '' });
    expect(snap1.keysConfigured).toEqual({ hibp: false, vt: false });

    const snap2 = await fetchSecuritySnapshot({
      token: JSON.stringify({ hibp: 'k1' }),
    });
    expect(snap2.keysConfigured).toEqual({ hibp: true, vt: false });

    const snap3 = await fetchSecuritySnapshot({
      token: JSON.stringify({ hibp: 'k1', vt: 'k2' }),
    });
    expect(snap3.keysConfigured).toEqual({ hibp: true, vt: true });
  });

  it('always returns a Norton status object', async () => {
    const snap = await fetchSecuritySnapshot({ token: '' });
    expect(snap.norton).toMatchObject({
      installed: expect.any(Boolean),
      platform: expect.any(String),
      details: expect.any(String),
    });
  });
});

describe('ACTIONS["check-email-breach"]', () => {
  const goodToken = JSON.stringify({ hibp: 'hibp-key' });

  it('returns an empty list when HIBP returns 404', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response('', { status: 404 }));

    const result = (await ACTIONS['check-email-breach']({
      token: goodToken,
      fetch: fetchMock,
      payload: { email: 'a@b.com' },
    })) as { email: string; breaches: unknown[] };

    expect(result).toEqual({ email: 'a@b.com', breaches: [] });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toContain('haveibeenpwned.com/api/v3/breachedaccount/');
    expect(url).toContain(encodeURIComponent('a@b.com'));
    expect((init as RequestInit).headers).toMatchObject({ 'hibp-api-key': 'hibp-key' });
  });

  it('normalizes a breach response', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValueOnce(
      jsonResponse([
        {
          Name: 'AcmeCorp',
          Title: 'Acme Corp',
          BreachDate: '2021-04-01',
          PwnCount: 1234567,
          DataClasses: ['Email addresses', 'Passwords'],
        },
      ]),
    );

    const result = (await ACTIONS['check-email-breach']({
      token: goodToken,
      fetch: fetchMock,
      payload: { email: 'a@b.com' },
    })) as { breaches: { name: string; pwnCount: number }[] };

    expect(result.breaches).toHaveLength(1);
    expect(result.breaches[0]).toMatchObject({ name: 'AcmeCorp', pwnCount: 1234567 });
  });

  it('throws FetchError for non-2xx (other than 404)', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response('rate limit', { status: 429 }));
    await expect(
      ACTIONS['check-email-breach']({
        token: goodToken,
        fetch: fetchMock,
        payload: { email: 'a@b.com' },
      }),
    ).rejects.toBeInstanceOf(FetchError);
  });

  it('refuses to run without an HIBP key', async () => {
    const fetchMock = vi.fn<typeof fetch>();
    await expect(
      ACTIONS['check-email-breach']({
        token: '',
        fetch: fetchMock,
        payload: { email: 'a@b.com' },
      }),
    ).rejects.toThrow(/HIBP/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects when email is missing', async () => {
    const fetchMock = vi.fn<typeof fetch>();
    await expect(
      ACTIONS['check-email-breach']({ token: goodToken, fetch: fetchMock, payload: {} }),
    ).rejects.toThrow(/email/);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('ACTIONS["scan-url"]', () => {
  const goodToken = JSON.stringify({ vt: 'vt-key' });

  it('submits the URL then GETs the report and returns positives/total', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      // submit
      .mockResolvedValueOnce(jsonResponse({ data: { id: 'analysis-1', type: 'analysis' } }))
      // report
      .mockResolvedValueOnce(
        jsonResponse({
          data: {
            id: 'url-id',
            attributes: {
              last_analysis_stats: { harmless: 60, malicious: 2, suspicious: 1, undetected: 7 },
            },
          },
        }),
      );

    const result = (await ACTIONS['scan-url']({
      token: goodToken,
      fetch: fetchMock,
      payload: { url: 'https://example.com/x' },
    })) as { positives: number; total: number; reportUrl: string };

    expect(result.positives).toBe(3); // 2 malicious + 1 suspicious
    expect(result.total).toBe(70);
    expect(result.reportUrl).toContain('virustotal.com/gui/url/');

    const [submitUrl, submitInit] = fetchMock.mock.calls[0];
    expect(submitUrl).toBe('https://www.virustotal.com/api/v3/urls');
    expect((submitInit as RequestInit).method).toBe('POST');
    expect((submitInit as RequestInit).headers).toMatchObject({ 'x-apikey': 'vt-key' });
  });

  it('refuses to run without a VT key', async () => {
    const fetchMock = vi.fn<typeof fetch>();
    await expect(
      ACTIONS['scan-url']({
        token: JSON.stringify({ hibp: 'k' }),
        fetch: fetchMock,
        payload: { url: 'https://x' },
      }),
    ).rejects.toThrow(/VirusTotal/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects when url is missing', async () => {
    const fetchMock = vi.fn<typeof fetch>();
    await expect(
      ACTIONS['scan-url']({ token: goodToken, fetch: fetchMock, payload: {} }),
    ).rejects.toThrow(/url/);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
