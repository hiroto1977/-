import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  ACTIONS,
  detectNorton,
  fetchSecuritySnapshot,
  findExistingDirectory,
  nortonNotFoundDetails,
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

describe('findExistingDirectory', () => {
  it('returns the first candidate whose probe says it is a directory', async () => {
    const probe = vi.fn(async (p: string) => {
      if (p === '/opt/match') return { isDirectory: () => true };
      return { isDirectory: () => false };
    });
    const found = await findExistingDirectory(['/nope', '/opt/match', '/another'], probe);
    expect(found).toBe('/opt/match');
    // Stops at the first match — third candidate never probed.
    expect(probe).toHaveBeenCalledTimes(2);
  });

  it('returns null when no candidate is a directory', async () => {
    const probe = vi.fn(async () => ({ isDirectory: () => false }));
    expect(await findExistingDirectory(['/a', '/b'], probe)).toBeNull();
  });

  it('returns null when every probe throws (e.g. ENOENT)', async () => {
    const probe = vi.fn(async () => {
      throw new Error('ENOENT');
    });
    expect(await findExistingDirectory(['/a', '/b'], probe)).toBeNull();
  });

  it('returns null for an empty candidate list', async () => {
    const probe = vi.fn();
    expect(await findExistingDirectory([], probe)).toBeNull();
    expect(probe).not.toHaveBeenCalled();
  });

  it('skips an erroring candidate and continues to the next', async () => {
    const probe = vi.fn(async (p: string) => {
      if (p === '/a') throw new Error('boom');
      if (p === '/b') return { isDirectory: () => true };
      return { isDirectory: () => false };
    });
    const found = await findExistingDirectory(['/a', '/b'], probe);
    expect(found).toBe('/b');
  });

  it('treats a non-directory match as not-found (kills `isDirectory()` check drop)', async () => {
    // Without the isDirectory() check, a regular file at the path
    // would satisfy the candidate. Pin the directory requirement.
    const probe = vi.fn(async () => ({ isDirectory: () => false }));
    expect(await findExistingDirectory(['/regular-file'], probe)).toBeNull();
  });
});

describe('nortonNotFoundDetails', () => {
  it('returns the Linux-specific message for linux', () => {
    expect(nortonNotFoundDetails('linux')).toMatch(/Linux 版が無い/);
  });

  it('returns the generic not-found message for non-Linux platforms', () => {
    expect(nortonNotFoundDetails('darwin')).toMatch(/見つかりませんでした/);
    expect(nortonNotFoundDetails('darwin')).not.toMatch(/Linux 版/);
    expect(nortonNotFoundDetails('win32')).toMatch(/見つかりませんでした/);
    expect(nortonNotFoundDetails('win32')).not.toMatch(/Linux 版/);
    // Unknown platforms also fall to the generic branch.
    expect(nortonNotFoundDetails('aix' as NodeJS.Platform)).toMatch(/見つかりませんでした/);
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
    // Also kills the ArrayDeclaration mutant on the [] fallback: with
    // an injected `["Stryker was here"]` fallback the probe would be
    // called once (with a synthetic path); we pin probe.callCount === 0.
    const probe = vi.fn(async (_p: string) => ({ isDirectory: () => false }));
    const result = await detectNorton('aix' as NodeJS.Platform, probe);
    expect(result.installed).toBe(false);
    expect(result.platform).toBe('aix');
    expect(probe).not.toHaveBeenCalled();
  });

  it('darwin path list contains the documented .app paths (kills ArrayDeclaration mutants)', async () => {
    // Drive detectNorton with a probe that records which candidates
    // it was asked about. This indirectly asserts the contents of
    // NORTON_PATHS_BY_PLATFORM.darwin without exporting it. Without
    // these specific paths, the ArrayDeclaration mutation (replacing
    // the array with [] or ["Stryker was here"]) would alter the
    // probe-call sequence and fail this assertion.
    const seen: string[] = [];
    const probe = vi.fn(async (p: string) => {
      seen.push(p);
      return { isDirectory: () => false };
    });
    await detectNorton('darwin', probe);
    expect(seen).toContain('/Applications/Norton 360.app');
    expect(seen).toContain('/Applications/Norton Security.app');
    expect(seen).toContain('/Library/Application Support/Symantec');
  });

  it('win32 path list contains the documented Norton 360 install dirs', async () => {
    const seen: string[] = [];
    const probe = vi.fn(async (p: string) => {
      seen.push(p);
      return { isDirectory: () => false };
    });
    await detectNorton('win32', probe);
    expect(seen).toContain('C:\\Program Files\\Norton 360');
    expect(seen).toContain('C:\\Program Files (x86)\\Norton 360');
    expect(seen).toContain('C:\\ProgramData\\Norton');
  });

  it('linux path list is empty (Norton does not ship for Linux — kills the Linux ArrayDeclaration mutation)', async () => {
    const seen: string[] = [];
    const probe = vi.fn(async (p: string) => {
      seen.push(p);
      return { isDirectory: () => false };
    });
    await detectNorton('linux', probe);
    expect(seen).toEqual([]);
    expect(probe).not.toHaveBeenCalled();
  });

  it('returns installed=true when one of the candidate paths exists as a directory (kills `if (found !== null)` → false)', async () => {
    // Use the darwin path '/Applications/Norton 360.app' (which the
    // NORTON_PATHS_BY_PLATFORM map lists for darwin) and a probe that
    // says "yes, that's a directory" for exactly that string.
    const probe = vi.fn(async (p: string) => ({
      isDirectory: () => p === '/Applications/Norton 360.app',
    }));
    const result = await detectNorton('darwin', probe);
    expect(result.installed).toBe(true);
    expect(result.installPath).toBe('/Applications/Norton 360.app');
    expect(result.details).toMatch(/Norton 360\.app を検出/);
  });

  it('falls back to installed=false when the probe finds nothing', async () => {
    const probe = vi.fn(async () => ({ isDirectory: () => false }));
    const result = await detectNorton('darwin', probe);
    expect(result.installed).toBe(false);
    expect(result.installPath).toBe('');
    expect(result.details).toMatch(/見つかりませんでした/);
  });

  it('truncates HIBP error body to 200 chars (already-killed regression test)', async () => {
    // Pinned here for any future code shuffle that loses the slice.
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
    expect(caught!.message.length).toBeLessThan(longBody.length);
  });

  it('uses the empty-string fallback when HIBP res.text() rejects (kills catch `() => undefined`)', async () => {
    const erroringBody = new ReadableStream({
      start(controller) {
        controller.error(new Error('body read failed'));
      },
    });
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(erroringBody, { status: 500 }));
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
    expect(caught).toBeInstanceOf(FetchError);
    // With () => '' fallback: message ends "HIBP 500: " (empty body).
    // With () => undefined mutant: body.slice would throw a TypeError,
    // bubbling a non-FetchError. Pin both.
    expect(caught!.message).toBe('HIBP 500: ');
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

  it('returns an empty breaches array in the snapshot (kills `breaches: []` → `["Stryker..."]`)', async () => {
    // The snapshot doesn't auto-query HIBP; breaches should be exactly
    // empty. Negative assertion catches any non-empty mutant.
    const snap = await fetchSecuritySnapshot({ token: '' });
    expect(snap.breaches).toEqual([]);
    expect(snap.breaches.length).toBe(0);
  });
});

describe('ACTIONS["check-email-breach"] — URL + header pinning (kills StringLiteral mutants)', () => {
  it('hits exactly the HIBP URL with encoded email + truncateResponse=false', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse([{ Name: 'X', Title: 'X', BreachDate: '2024-01-01', PwnCount: 1, DataClasses: [] }]));
    await ACTIONS['check-email-breach']!({
      token: JSON.stringify({ hibp: 'k' }),
      fetch: fetchMock,
      payload: { email: 'a+b@c.example' },
    });
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe(
      'https://haveibeenpwned.com/api/v3/breachedaccount/a%2Bb%40c.example?truncateResponse=false',
    );
    const headers = (init as RequestInit).headers as Record<string, string>;
    expect(headers['hibp-api-key']).toBe('k');
    expect(headers['User-Agent']).toBe('service-hub-desktop');
    expect(headers.Accept).toBe('application/json');
  });

  it('throws `HIBP <status>: <body>` on non-2xx (kills the "HIBP " literal)', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response('rate limited', { status: 429 }));
    let caught: FetchError | undefined;
    try {
      await ACTIONS['check-email-breach']!({
        token: JSON.stringify({ hibp: 'k' }),
        fetch: fetchMock,
        payload: { email: 'a@b.com' },
      });
    } catch (err) {
      caught = err as FetchError;
    }
    expect(caught).toBeDefined();
    expect(caught!.message).toBe('HIBP 429: rate limited');
    expect(caught!.serviceId).toBe('security');
  });
});

describe('ACTIONS["scan-url"] — URL + header pinning (kills StringLiteral mutants)', () => {
  it('uses exactly the VT POST + GET URLs and x-apikey header on both', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({ data: { id: 'a', type: 'analysis' } }))
      .mockResolvedValueOnce(
        jsonResponse({
          data: {
            id: 'url-id',
            attributes: {
              last_analysis_stats: { harmless: 1, malicious: 0, suspicious: 0, undetected: 0 },
            },
          },
        }),
      );
    await ACTIONS['scan-url']!({
      token: JSON.stringify({ vt: 'vt-key' }),
      fetch: fetchMock,
      payload: { url: 'https://example.com/' },
    });
    const [submitUrl, submitInit] = fetchMock.mock.calls[0]!;
    const [getUrl, getInit] = fetchMock.mock.calls[1]!;
    expect(submitUrl).toBe('https://www.virustotal.com/api/v3/urls');
    expect(getUrl).toBe(
      'https://www.virustotal.com/api/v3/urls/aHR0cHM6Ly9leGFtcGxlLmNvbS8',
    );
    const sh = (submitInit as RequestInit).headers as Record<string, string>;
    const gh = (getInit as RequestInit).headers as Record<string, string>;
    expect(sh['x-apikey']).toBe('vt-key');
    expect(sh['Content-Type']).toBe('application/x-www-form-urlencoded');
    expect(gh['x-apikey']).toBe('vt-key');
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

  it('constructs the GET URL with base64url-encoded VT id (kills vtBase64 body → undefined)', async () => {
    // The 2nd fetch call hits /api/v3/urls/<id> where <id> is
    // base64url(url). If vtBase64 returns undefined (BlockStatement
    // mutation), the URL becomes /api/v3/urls/undefined. Pin the
    // exact ID.
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({ data: { id: 'a', type: 'analysis' } }))
      .mockResolvedValueOnce(
        jsonResponse({
          data: {
            id: 'url-id',
            attributes: {
              last_analysis_stats: { harmless: 1, malicious: 0, suspicious: 0, undetected: 0 },
            },
          },
        }),
      );
    const result = (await ACTIONS['scan-url']!({
      token: goodToken,
      fetch: fetchMock,
      payload: { url: 'https://example.com/' },
    })) as { reportUrl: string };

    // base64url('https://example.com/') = 'aHR0cHM6Ly9leGFtcGxlLmNvbS8'
    // (= padding stripped, + → -, / → _).
    const expectedId = 'aHR0cHM6Ly9leGFtcGxlLmNvbS8';
    const reportUrl = fetchMock.mock.calls[1]![0] as string;
    expect(reportUrl).toBe(`https://www.virustotal.com/api/v3/urls/${expectedId}`);
    // The user-facing reportUrl in the result also embeds the same id.
    expect(result.reportUrl).toContain(expectedId);
    expect(result.reportUrl).not.toContain('undefined');
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
