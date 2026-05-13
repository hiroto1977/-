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

  it('returns {} when the parsed value is null', () => {
    expect(parseSecurityKeys('null')).toEqual({});
  });

  it('returns {} when the parsed value is a JSON array (not an object)', () => {
    expect(parseSecurityKeys('["hibp","vt"]')).toEqual({});
  });

  it('returns {} when the parsed value is a JSON number', () => {
    expect(parseSecurityKeys('42')).toEqual({});
  });

  it('ignores hibp when its type is wrong (e.g. number)', () => {
    expect(parseSecurityKeys('{"hibp":42,"vt":"ok"}')).toEqual({ vt: 'ok' });
  });

  // --- explicit mutation kill targets
  it('treats truthy non-object primitives as "{}" — string', () => {
    // JSON.parse('"abc"') = "abc", a truthy string. With the `parsed &&
    // typeof parsed === 'object'` guard removed, the block would still
    // produce {}. So this asserts the guard's *effective* outcome.
    expect(parseSecurityKeys('"abc"')).toEqual({});
  });

  it('treats truthy non-object primitives as "{}" — number', () => {
    expect(parseSecurityKeys('42')).toEqual({});
  });

  it('treats truthy non-object primitives as "{}" — boolean', () => {
    expect(parseSecurityKeys('true')).toEqual({});
  });

  it('returns {} for JSON null — with NO leaked fields (kills `if(parsed && ...)` → true)', () => {
    const out = parseSecurityKeys('null');
    expect(out).toEqual({});
    expect(Object.keys(out)).toHaveLength(0);
  });

  it('returns {} for JSON array — with NO leaked fields', () => {
    const out = parseSecurityKeys('[1, 2, 3]');
    expect(out).toEqual({});
    expect(Object.keys(out)).toHaveLength(0);
  });

  it('drops hibp when value is an empty string (kills `if (... && parsed.hibp)` → true)', () => {
    // With the `&& parsed.hibp` truthy-check removed, hibp would be set
    // to "". This asserts the truthy-guard fires for the hibp case
    // specifically (vt is tested elsewhere).
    expect(parseSecurityKeys('{"hibp":"","vt":"ok"}')).toEqual({ vt: 'ok' });
  });

  it('ignores vt when its type is wrong (kills the vt-type-guard mutation)', () => {
    // Symmetric to "ignores hibp when its type is wrong". Pinning the
    // typeof check on the vt branch so a ConditionalExpression `true`
    // mutation can't silently assign `vt = 42`.
    expect(parseSecurityKeys('{"hibp":"ok","vt":42}')).toEqual({ hibp: 'ok' });
  });

  it('drops vt when value is an empty string (kills `if (... && parsed.vt)` → true)', () => {
    expect(parseSecurityKeys('{"hibp":"ok","vt":""}')).toEqual({ hibp: 'ok' });
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

  it('handles an unknown platform string without crashing', async () => {
    // Kills the `?? []` mutation — without the nullish coalesce, an
    // unknown platform key would return undefined and the for-loop
    // would throw on a non-iterable.
    const result = await detectNorton('aix' as NodeJS.Platform);
    expect(result.installed).toBe(false);
    expect(result.platform).toBe('aix');
  });

  it('returns a non-linux details message for darwin (kills `platform === "linux"` → true)', async () => {
    // Pins the specific Japanese fallback message for non-linux platforms,
    // so a ConditionalExpression `true` mutation that always selects the
    // Linux message would be caught.
    const result = await detectNorton('darwin');
    expect(result.installed).toBe(false);
    expect(result.platform).toBe('darwin');
    expect(result.details).toMatch(/見つかりませんでした/);
    expect(result.details).not.toMatch(/Linux 版/);
  });

  it('returns a non-linux details message for win32 too', async () => {
    const result = await detectNorton('win32');
    expect(result.details).toMatch(/見つかりませんでした/);
    expect(result.details).not.toMatch(/Linux 版/);
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

    const result = (await ACTIONS['check-email-breach']!({
      token: goodToken,
      fetch: fetchMock,
      payload: { email: 'a@b.com' },
    })) as { email: string; breaches: unknown[] };

    expect(result).toEqual({ email: 'a@b.com', breaches: [] });
    const [url, init] = fetchMock.mock.calls[0]!;
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

    const result = (await ACTIONS['check-email-breach']!({
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
      ACTIONS['check-email-breach']!({
        token: goodToken,
        fetch: fetchMock,
        payload: { email: 'a@b.com' },
      }),
    ).rejects.toBeInstanceOf(FetchError);
  });

  it('refuses to run without an HIBP key', async () => {
    const fetchMock = vi.fn<typeof fetch>();
    await expect(
      ACTIONS['check-email-breach']!({
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
      ACTIONS['check-email-breach']!({ token: goodToken, fetch: fetchMock, payload: {} }),
    ).rejects.toThrow(/email/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('truncates a long HIBP error body to 200 chars (kills `body.slice(0, 200)` → `body`)', async () => {
    const longBody = 'X'.repeat(500);
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(longBody, { status: 500 }));
    let caught: Error | undefined;
    try {
      await ACTIONS['check-email-breach']!({
        token: JSON.stringify({ hibp: 'k' }),
        fetch: fetchMock,
        payload: { email: 'a@b.com' },
      });
    } catch (err) {
      caught = err as Error;
    }
    expect(caught).toBeDefined();
    expect(caught!.message).toMatch(/HIBP 500: X{200}$/);
    expect(caught!.message.length).toBeLessThan(longBody.length);
  });
});

describe('ACTIONS["scan-url"]', () => {
  const goodToken = JSON.stringify({ vt: 'vt-key' });

  it('encodes the URL as application/x-www-form-urlencoded body, not query string', async () => {
    // Kills MethodExpression mutation that drops .toString() on the
    // URLSearchParams — would otherwise send "[object URLSearchParams]"
    // as the body and break VT's parser.
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({ data: { id: 'a', type: 'analysis' } }))
      .mockResolvedValueOnce(
        jsonResponse({
          data: {
            id: 'u',
            attributes: { last_analysis_stats: { harmless: 1, malicious: 0, suspicious: 0, undetected: 0 } },
          },
        }),
      );
    await ACTIONS['scan-url']!({
      token: JSON.stringify({ vt: 'k' }),
      fetch: fetchMock,
      payload: { url: 'https://example.com/path?q=1&r=2' },
    });
    const submitBody = (fetchMock.mock.calls[0]![1] as RequestInit).body as string;
    expect(typeof submitBody).toBe('string');
    expect(submitBody).toBe('url=https%3A%2F%2Fexample.com%2Fpath%3Fq%3D1%26r%3D2');
  });

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

    const result = (await ACTIONS['scan-url']!({
      token: goodToken,
      fetch: fetchMock,
      payload: { url: 'https://example.com/x' },
    })) as { positives: number; total: number; reportUrl: string };

    expect(result.positives).toBe(3); // 2 malicious + 1 suspicious
    expect(result.total).toBe(70);
    expect(result.reportUrl).toContain('virustotal.com/gui/url/');

    const [submitUrl, submitInit] = fetchMock.mock.calls[0]!;
    expect(submitUrl).toBe('https://www.virustotal.com/api/v3/urls');
    expect((submitInit as RequestInit).method).toBe('POST');
    expect((submitInit as RequestInit).headers).toMatchObject({ 'x-apikey': 'vt-key' });
  });

  it('refuses to run without a VT key', async () => {
    const fetchMock = vi.fn<typeof fetch>();
    await expect(
      ACTIONS['scan-url']!({
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
      ACTIONS['scan-url']!({ token: goodToken, fetch: fetchMock, payload: {} }),
    ).rejects.toThrow(/url/);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
