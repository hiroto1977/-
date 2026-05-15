/** @vitest-environment jsdom */
import { describe, expect, it, vi } from 'vitest';
import { webcrypto } from 'node:crypto';
if (!('subtle' in globalThis.crypto)) {
  Object.defineProperty(globalThis, 'crypto', { value: webcrypto, configurable: true });
}

import {
  buildGoogleAuthUrl,
  exchangeGoogleCode,
  generatePkce,
  GOOGLE_SCOPES,
  parseGoogleCallback,
  safeStateEquals,
} from '../../oauth/pkce';

describe('generatePkce', () => {
  it('returns verifier / challenge / state — all base64url, no padding', async () => {
    const s = await generatePkce();
    expect(s.verifier).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(s.challenge).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(s.state).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it('challenge is SHA-256 of verifier (correct length 43 chars for 32-byte hash)', async () => {
    const s = await generatePkce();
    expect(s.challenge).toHaveLength(43);
  });

  it('produces different secrets each call', async () => {
    const a = await generatePkce();
    const b = await generatePkce();
    expect(a.verifier).not.toBe(b.verifier);
    expect(a.state).not.toBe(b.state);
  });
});

describe('buildGoogleAuthUrl', () => {
  it('emits a valid Google auth URL with all required params', async () => {
    const s = await generatePkce();
    const url = buildGoogleAuthUrl(
      {
        clientId: 'app123.apps.googleusercontent.com',
        scopes: GOOGLE_SCOPES.drive,
        redirectUri: 'http://localhost:12345/cb',
      },
      s,
    );
    const u = new URL(url);
    expect(u.origin).toBe('https://accounts.google.com');
    expect(u.pathname).toBe('/o/oauth2/v2/auth');
    expect(u.searchParams.get('response_type')).toBe('code');
    expect(u.searchParams.get('client_id')).toBe('app123.apps.googleusercontent.com');
    expect(u.searchParams.get('redirect_uri')).toBe('http://localhost:12345/cb');
    expect(u.searchParams.get('scope')).toBe(GOOGLE_SCOPES.drive[0]);
    expect(u.searchParams.get('code_challenge')).toBe(s.challenge);
    expect(u.searchParams.get('code_challenge_method')).toBe('S256');
    expect(u.searchParams.get('state')).toBe(s.state);
  });

  it('joins multiple scopes with space', async () => {
    const s = await generatePkce();
    const url = buildGoogleAuthUrl(
      { clientId: 'x', scopes: ['a', 'b', 'c'], redirectUri: 'http://x' },
      s,
    );
    expect(new URL(url).searchParams.get('scope')).toBe('a b c');
  });
});

describe('exchangeGoogleCode', () => {
  function mockResponse(payload: unknown, ok = true, status = 200): Response {
    return {
      ok,
      status,
      async text() { return ok ? '' : JSON.stringify(payload); },
      async json() { return payload; },
    } as Response;
  }

  const baseArgs = {
    code: 'the-code',
    verifier: 'the-verifier',
    expectedState: 'st-xyz',
    receivedState: 'st-xyz',
    clientId: 'cid',
    redirectUri: 'http://x',
  };

  it('returns access_token + expiresAt on success', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      mockResponse({
        access_token: 'ya29.access',
        refresh_token: 'rt-xxx',
        expires_in: 3600,
        scope: 'a b',
      }),
    );
    const result = await exchangeGoogleCode(baseArgs, fetchMock);
    expect(result.accessToken).toBe('ya29.access');
    expect(result.refreshToken).toBe('rt-xxx');
    expect(result.scope).toBe('a b');
    expect(result.expiresAt).toBeGreaterThan(Date.now());
    expect(result.expiresAt).toBeLessThanOrEqual(Date.now() + 3600_000);
  });

  it('omits refresh_token field when Google returns none', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      mockResponse({ access_token: 'ya29.x', expires_in: 3600 }),
    );
    const result = await exchangeGoogleCode(baseArgs, fetchMock);
    expect(result.refreshToken).toBeUndefined();
  });

  it('falls back to 3600s when expires_in missing / non-finite', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      mockResponse({ access_token: 'x' }),
    );
    const r = await exchangeGoogleCode(baseArgs, fetchMock);
    expect(r.expiresAt).toBeGreaterThan(Date.now() + 3500_000);
  });

  it('throws on HTTP error', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      mockResponse({ error: 'invalid_grant' }, false, 400),
    );
    await expect(exchangeGoogleCode(baseArgs, fetchMock)).rejects.toThrow(/token exchange 400/);
  });

  it('rejects empty / oversize code', async () => {
    await expect(exchangeGoogleCode({ ...baseArgs, code: '' })).rejects.toThrow(/code が不正/);
    await expect(exchangeGoogleCode({ ...baseArgs, code: 'x'.repeat(2049) })).rejects.toThrow(/code が不正/);
  });

  it('rejects empty verifier', async () => {
    await expect(exchangeGoogleCode({ ...baseArgs, verifier: '' })).rejects.toThrow(/verifier が不正/);
  });

  it('throws when response missing access_token', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(mockResponse({ expires_in: 3600 }));
    await expect(exchangeGoogleCode(baseArgs, fetchMock)).rejects.toThrow(/missing access_token/);
  });

  it('rejects state mismatch (CSRF guard) BEFORE hitting token endpoint', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(mockResponse({}));
    await expect(
      exchangeGoogleCode({ ...baseArgs, receivedState: 'attacker-state' }, fetchMock),
    ).rejects.toThrow(/state が一致しません/);
    expect(fetchMock).not.toHaveBeenCalled(); // critical: never POST on mismatch
  });

  it('rejects empty expectedState / receivedState', async () => {
    await expect(exchangeGoogleCode({ ...baseArgs, expectedState: '' })).rejects.toThrow(/expectedState/);
    await expect(exchangeGoogleCode({ ...baseArgs, receivedState: '' })).rejects.toThrow(/receivedState/);
  });
});

describe('safeStateEquals (constant-time)', () => {
  it('returns true for equal strings', () => {
    expect(safeStateEquals('abc', 'abc')).toBe(true);
    expect(safeStateEquals('', '')).toBe(true);
  });

  it('returns false for different content of same length', () => {
    expect(safeStateEquals('abc', 'abd')).toBe(false);
  });

  it('returns false for different lengths', () => {
    expect(safeStateEquals('abc', 'abcd')).toBe(false);
    expect(safeStateEquals('abc', 'ab')).toBe(false);
  });

  it('returns false for non-string inputs', () => {
    expect(safeStateEquals(null as unknown as string, 'abc')).toBe(false);
    expect(safeStateEquals('abc', undefined as unknown as string)).toBe(false);
  });
});

describe('parseGoogleCallback', () => {
  it('parses a full callback URL', () => {
    const got = parseGoogleCallback('https://localhost:12345/cb?code=4%2F0AB123&state=st-xyz&scope=a');
    expect(got).toEqual({ code: '4/0AB123', state: 'st-xyz' });
  });

  it('parses a query-only string with leading ?', () => {
    expect(parseGoogleCallback('?code=ab&state=xy')).toEqual({ code: 'ab', state: 'xy' });
  });

  it('parses a query string without leading ?', () => {
    expect(parseGoogleCallback('code=ab&state=xy')).toEqual({ code: 'ab', state: 'xy' });
  });

  it('returns null when state is missing (rejects bare-code paste)', () => {
    expect(parseGoogleCallback('?code=ab')).toBeNull();
    expect(parseGoogleCallback('code=ab')).toBeNull();
  });

  it('returns null when code is missing', () => {
    expect(parseGoogleCallback('?state=xy')).toBeNull();
  });

  it('returns null for empty / non-string input', () => {
    expect(parseGoogleCallback('')).toBeNull();
    expect(parseGoogleCallback('   ')).toBeNull();
    expect(parseGoogleCallback(null as unknown as string)).toBeNull();
  });

  it('returns null for malformed URL', () => {
    expect(parseGoogleCallback('http://[invalid')).toBeNull();
  });
});
