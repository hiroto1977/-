import { describe, expect, it, vi } from 'vitest';
import {
  buildAuthorizeUrl,
  buildRefreshBody,
  buildTokenExchangeBody,
  classifyCallback,
  generatePkce,
  isLoopbackHost,
  isOAuthSupported,
  OAUTH_CONFIGS,
  refresh,
  safeStateEquals,
  tokenResponseToSet,
  type OAuthConfig,
} from '../oauth';

const CFG: OAuthConfig = {
  authorizeUrl: 'https://accounts.example.com/o/oauth2/v2/auth',
  tokenUrl: 'https://oauth2.example.com/token',
  clientId: 'client-abc',
  scopes: ['https://example.com/auth/a', 'https://example.com/auth/b'],
  extraAuthParams: { access_type: 'offline', prompt: 'consent' },
};

describe('generatePkce', () => {
  it('produces a 43-char base64url verifier and a SHA-256 challenge', () => {
    const { verifier, challenge } = generatePkce();
    // 32 random bytes → base64url (no padding) = 43 chars
    expect(verifier).toMatch(/^[A-Za-z0-9_-]{43}$/);
    // SHA-256 → 32 bytes → base64url = 43 chars
    expect(challenge).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(challenge).not.toBe(verifier);
  });

  it('produces unique values across calls', () => {
    const a = generatePkce();
    const b = generatePkce();
    expect(a.verifier).not.toBe(b.verifier);
    expect(a.challenge).not.toBe(b.challenge);
  });
});

describe('buildAuthorizeUrl', () => {
  it('includes PKCE + state + redirect_uri + space-joined scopes + extras', () => {
    const url = new URL(
      buildAuthorizeUrl(CFG, 'http://127.0.0.1:54321/oauth/callback', 'state-xyz', 'chal-abc'),
    );
    expect(url.origin + url.pathname).toBe('https://accounts.example.com/o/oauth2/v2/auth');
    expect(url.searchParams.get('response_type')).toBe('code');
    expect(url.searchParams.get('client_id')).toBe('client-abc');
    expect(url.searchParams.get('redirect_uri')).toBe('http://127.0.0.1:54321/oauth/callback');
    expect(url.searchParams.get('scope')).toBe(
      'https://example.com/auth/a https://example.com/auth/b',
    );
    expect(url.searchParams.get('state')).toBe('state-xyz');
    expect(url.searchParams.get('code_challenge')).toBe('chal-abc');
    expect(url.searchParams.get('code_challenge_method')).toBe('S256');
    expect(url.searchParams.get('access_type')).toBe('offline');
    expect(url.searchParams.get('prompt')).toBe('consent');
  });

  it('honors a custom scope delimiter', () => {
    const url = new URL(
      buildAuthorizeUrl(
        { ...CFG, scopeDelimiter: ',' },
        'http://127.0.0.1:1/oauth/callback',
        's',
        'c',
      ),
    );
    expect(url.searchParams.get('scope')).toBe(
      'https://example.com/auth/a,https://example.com/auth/b',
    );
  });
});

describe('buildTokenExchangeBody', () => {
  it('encodes the PKCE-required parameters for the token endpoint', () => {
    const body = buildTokenExchangeBody(CFG, 'http://127.0.0.1:1/oauth/callback', 'code-xyz', 'v');
    expect(body.get('grant_type')).toBe('authorization_code');
    expect(body.get('code')).toBe('code-xyz');
    expect(body.get('redirect_uri')).toBe('http://127.0.0.1:1/oauth/callback');
    expect(body.get('client_id')).toBe('client-abc');
    expect(body.get('code_verifier')).toBe('v');
  });
});

describe('buildRefreshBody', () => {
  it('encodes the refresh_token grant', () => {
    const body = buildRefreshBody(CFG, 'rt-1');
    expect(body.get('grant_type')).toBe('refresh_token');
    expect(body.get('refresh_token')).toBe('rt-1');
    expect(body.get('client_id')).toBe('client-abc');
  });
});

describe('tokenResponseToSet', () => {
  it('maps snake_case fields to the TokenSet shape', () => {
    const before = Date.now();
    const tokens = tokenResponseToSet({
      access_token: 'at',
      refresh_token: 'rt',
      expires_in: 3600,
      scope: 'a b',
      token_type: 'Bearer',
    });
    expect(tokens.accessToken).toBe('at');
    expect(tokens.refreshToken).toBe('rt');
    expect(tokens.scope).toBe('a b');
    expect(tokens.tokenType).toBe('Bearer');
    expect(tokens.expiresAt).toBeGreaterThanOrEqual(before + 3600 * 1000 - 50);
    expect(tokens.expiresAt).toBeLessThanOrEqual(Date.now() + 3600 * 1000 + 50);
  });

  it('falls back to the previous refresh_token when the response omits one', () => {
    const tokens = tokenResponseToSet({ access_token: 'at2' }, 'rt-previous');
    expect(tokens.refreshToken).toBe('rt-previous');
    expect(tokens.expiresAt).toBeUndefined();
  });
});

describe('isLoopbackHost', () => {
  it('accepts the three canonical loopback hostnames', () => {
    expect(isLoopbackHost('127.0.0.1')).toBe(true);
    expect(isLoopbackHost('localhost')).toBe(true);
    expect(isLoopbackHost('[::1]')).toBe(true);
  });

  it('accepts loopback hostnames with a port suffix', () => {
    expect(isLoopbackHost('127.0.0.1:54321')).toBe(true);
    expect(isLoopbackHost('localhost:8080')).toBe(true);
    expect(isLoopbackHost('[::1]:1')).toBe(true);
  });

  it('is case-insensitive', () => {
    expect(isLoopbackHost('LOCALHOST')).toBe(true);
    expect(isLoopbackHost('LocalHost:80')).toBe(true);
  });

  it('rejects non-loopback hostnames', () => {
    expect(isLoopbackHost('attacker.example.com')).toBe(false);
    expect(isLoopbackHost('attacker.example.com:80')).toBe(false);
    expect(isLoopbackHost('10.0.0.1')).toBe(false);
    expect(isLoopbackHost('192.168.1.1')).toBe(false);
    // Public IPv6 loopback-like decoys
    expect(isLoopbackHost('[::2]')).toBe(false);
    expect(isLoopbackHost('[::1].evil.com')).toBe(false);
  });

  it('rejects undefined / non-string', () => {
    expect(isLoopbackHost(undefined)).toBe(false);
    expect(isLoopbackHost(42 as unknown as string)).toBe(false);
    expect(isLoopbackHost(null as unknown as string)).toBe(false);
    expect(isLoopbackHost('')).toBe(false);
  });

  it('only strips the trailing :port suffix, not in-name colons', () => {
    // "[::1]" contains colons but isn't followed by digits at the end.
    // Don't accidentally treat "[::1" as the host.
    expect(isLoopbackHost('[::1]')).toBe(true);
    // A weird input like "127.0.0.1:abc" — :abc is not :digits, so the
    // strip leaves "127.0.0.1:abc" → not in the allowlist → false.
    expect(isLoopbackHost('127.0.0.1:abc')).toBe(false);
  });
});

describe('classifyCallback', () => {
  const STATE = 'expected-state-abc-123-xyz-very-long-for-timing-safe-compare';

  it('returns success for a well-formed callback with matching state', () => {
    const result = classifyCallback(
      `/oauth/callback?code=auth-code-xyz&state=${STATE}`,
      STATE,
    );
    expect(result.kind).toBe('success');
    if (result.kind === 'success') {
      expect(result.code).toBe('auth-code-xyz');
      expect(result.state).toBe(STATE);
    }
  });

  it('returns wrong-path for any path other than /oauth/callback', () => {
    expect(classifyCallback('/', STATE).kind).toBe('wrong-path');
    expect(classifyCallback('/something', STATE).kind).toBe('wrong-path');
    expect(classifyCallback('/oauth/callback/extra', STATE).kind).toBe('wrong-path');
    expect(classifyCallback('/favicon.ico', STATE).kind).toBe('wrong-path');
  });

  it('returns oauth-error when the provider sends ?error=...', () => {
    const result = classifyCallback('/oauth/callback?error=access_denied', STATE);
    expect(result.kind).toBe('oauth-error');
    if (result.kind === 'oauth-error') {
      expect(result.error).toBe('access_denied');
    }
  });

  it('prefers oauth-error over missing-params when both signals are present', () => {
    // The provider explicitly reported an error; that takes precedence.
    const result = classifyCallback('/oauth/callback?error=denied', STATE);
    expect(result.kind).toBe('oauth-error');
  });

  it('returns missing-params when code or state is absent', () => {
    expect(classifyCallback('/oauth/callback', STATE).kind).toBe('missing-params');
    expect(classifyCallback('/oauth/callback?code=x', STATE).kind).toBe('missing-params');
    expect(classifyCallback('/oauth/callback?state=y', STATE).kind).toBe('missing-params');
  });

  it('returns state-mismatch when the state token does not match', () => {
    const result = classifyCallback(
      '/oauth/callback?code=x&state=wrong-state-different-length',
      STATE,
    );
    expect(result.kind).toBe('state-mismatch');
  });

  it('returns state-mismatch when state has the same length but different chars (CSRF)', () => {
    // Build a state of identical length so the length pre-check passes.
    const fakeState = 'F'.repeat(STATE.length);
    const result = classifyCallback(
      `/oauth/callback?code=x&state=${fakeState}`,
      STATE,
    );
    expect(result.kind).toBe('state-mismatch');
  });
});

describe('safeStateEquals', () => {
  it('returns true for identical strings', () => {
    expect(safeStateEquals('abc', 'abc')).toBe(true);
    expect(safeStateEquals('', '')).toBe(true);
  });

  it('returns false for different strings of equal length', () => {
    expect(safeStateEquals('abc', 'abd')).toBe(false);
  });

  it('returns false for different lengths (without leaking via timing)', () => {
    // Returns false before calling timingSafeEqual, which would otherwise
    // throw on length mismatch.
    expect(safeStateEquals('abc', 'abcd')).toBe(false);
    expect(safeStateEquals('abcd', 'abc')).toBe(false);
  });

  it('returns false for non-string inputs', () => {
    expect(safeStateEquals(undefined as unknown as string, 'abc')).toBe(false);
    expect(safeStateEquals('abc', null as unknown as string)).toBe(false);
    expect(safeStateEquals(42 as unknown as string, 'abc')).toBe(false);
  });

  it('handles real 32-byte base64url state strings (43 chars)', () => {
    const a = 'aBcDeFgHiJkLmNoPqRsTuVwXyZ1234567890ABCDEF1';
    expect(safeStateEquals(a, a)).toBe(true);
    expect(safeStateEquals(a, a.slice(0, -1) + 'X')).toBe(false);
  });
});

describe('OAUTH_CONFIGS shape', () => {
  // These assertions pin the literal endpoints + scopes per service.
  // They kill the ObjectLiteral mutation that turns each entry into {}
  // and the ArrayDeclaration mutation that empties the scopes array.

  it('drive uses Google OAuth endpoints with Drive scope + offline access', () => {
    const cfg = OAUTH_CONFIGS.drive;
    expect(cfg).toBeDefined();
    expect(cfg?.authorizeUrl).toBe('https://accounts.google.com/o/oauth2/v2/auth');
    expect(cfg?.tokenUrl).toBe('https://oauth2.googleapis.com/token');
    expect(cfg?.scopes).toEqual(['https://www.googleapis.com/auth/drive']);
    expect(cfg?.extraAuthParams).toMatchObject({
      access_type: 'offline',
      prompt: 'consent',
    });
    // clientId is a string (empty when GOOGLE_OAUTH_CLIENT_ID unset),
    // never undefined. Kills the LogicalOperator mutation that turns
    // `?? ''` into `&& ''` (which yields undefined for unset env).
    expect(typeof cfg?.clientId).toBe('string');
  });

  it('every Google service exposes clientId as a string (kills `?? ""` → `&& ""` on line 61/68/78)', () => {
    for (const svc of ['drive', 'calendar', 'gmail'] as const) {
      const cfg = OAUTH_CONFIGS[svc];
      expect(typeof cfg?.clientId).toBe('string');
    }
  });

  it('calendar uses Google OAuth endpoints with both Calendar scopes', () => {
    const cfg = OAUTH_CONFIGS.calendar;
    expect(cfg).toBeDefined();
    expect(cfg?.authorizeUrl).toBe('https://accounts.google.com/o/oauth2/v2/auth');
    expect(cfg?.tokenUrl).toBe('https://oauth2.googleapis.com/token');
    expect(cfg?.scopes).toEqual([
      'https://www.googleapis.com/auth/calendar',
      'https://www.googleapis.com/auth/calendar.events',
    ]);
    expect(cfg?.extraAuthParams).toMatchObject({
      access_type: 'offline',
      prompt: 'consent',
    });
  });

  it('gmail uses Google OAuth endpoints with modify+compose scopes', () => {
    const cfg = OAUTH_CONFIGS.gmail;
    expect(cfg).toBeDefined();
    expect(cfg?.authorizeUrl).toBe('https://accounts.google.com/o/oauth2/v2/auth');
    expect(cfg?.tokenUrl).toBe('https://oauth2.googleapis.com/token');
    expect(cfg?.scopes).toEqual([
      'https://www.googleapis.com/auth/gmail.modify',
      'https://www.googleapis.com/auth/gmail.compose',
    ]);
    expect(cfg?.extraAuthParams).toMatchObject({
      access_type: 'offline',
      prompt: 'consent',
    });
  });

  it('does not register OAuth configs for non-Google services', () => {
    // Kills the outer OBJECT_LITERAL mutation that would replace the
    // whole OAUTH_CONFIGS with {} — by inversion the assertion checks
    // we DO have the three known entries.
    const keys = Object.keys(OAUTH_CONFIGS);
    expect(keys).toEqual(expect.arrayContaining(['drive', 'calendar', 'gmail']));
    expect(keys).not.toContain('github');
    expect(keys).not.toContain('notion');
  });
});

describe('isOAuthSupported', () => {
  // isOAuthSupported(svc) reflects (a) entry existence and (b) clientId
  // non-empty. With GOOGLE_OAUTH_CLIENT_ID absent (CI default), all
  // three are unsupported at module load. We can only assert that
  // services without an entry return false unconditionally.
  it('returns false for services without an OAUTH_CONFIGS entry', () => {
    expect(isOAuthSupported('github')).toBe(false);
    expect(isOAuthSupported('notion')).toBe(false);
    expect(isOAuthSupported('slack')).toBe(false);
    expect(isOAuthSupported('cloudflare')).toBe(false);
  });

  it('returns false for Google services when GOOGLE_OAUTH_CLIENT_ID is empty', () => {
    // At test time GOOGLE_OAUTH_CLIENT_ID is unset, so clientId === ''
    // and the Boolean(cfg && cfg.clientId) check returns false.
    if (!process.env.GOOGLE_OAUTH_CLIENT_ID) {
      expect(isOAuthSupported('drive')).toBe(false);
      expect(isOAuthSupported('calendar')).toBe(false);
      expect(isOAuthSupported('gmail')).toBe(false);
    }
  });
});

describe('refresh', () => {
  it('POSTs to the token endpoint and merges the response', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValueOnce(
      new Response(
        JSON.stringify({ access_token: 'new-at', expires_in: 3600 }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    );

    const result = await refresh(
      CFG,
      { accessToken: 'old', refreshToken: 'rt' },
      fetchMock,
    );

    expect(result.accessToken).toBe('new-at');
    // Google omits refresh_token in refresh responses; we carry over the old one.
    expect(result.refreshToken).toBe('rt');
    expect(result.expiresAt).toBeGreaterThan(Date.now() + 3500 * 1000);

    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe(CFG.tokenUrl);
    expect((init as RequestInit).method).toBe('POST');
    expect((init as RequestInit).headers).toMatchObject({
      'Content-Type': 'application/x-www-form-urlencoded',
    });
    const body = new URLSearchParams((init as RequestInit).body as string);
    expect(body.get('grant_type')).toBe('refresh_token');
    expect(body.get('refresh_token')).toBe('rt');
  });

  it('throws a descriptive error on non-2xx', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response('{"error":"invalid_grant"}', { status: 400 }));
    await expect(
      refresh(CFG, { accessToken: 'a', refreshToken: 'r' }, fetchMock),
    ).rejects.toThrow(/Token refresh failed.*400/);
  });

  it('throws synchronously when there is no refresh_token to use', async () => {
    const fetchMock = vi.fn<typeof fetch>();
    await expect(refresh(CFG, { accessToken: 'a' }, fetchMock)).rejects.toThrow(/no refresh/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('uses the empty-string fallback when refresh res.text() rejects (kills `() => ""` → `() => undefined`)', async () => {
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
      await refresh(CFG, { accessToken: 'a', refreshToken: 'r' }, fetchMock);
    } catch (err) {
      caught = err as Error;
    }
    expect(caught).toBeDefined();
    // The () => '' fallback yields "Token refresh failed (500): ".
    // The () => undefined mutant would throw TypeError (body.slice fails).
    expect(caught!.message).toBe('Token refresh failed (500): ');
  });

  it('truncates a long error body to 200 chars (kills `body.slice(0, 200)` → `body`)', async () => {
    // A 500-char error body should be sliced to exactly 200 chars in
    // the thrown message. Without the slice, the entire body would be
    // included.
    const longBody = 'x'.repeat(500);
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(longBody, { status: 500 }));
    let caught: Error | undefined;
    try {
      await refresh(CFG, { accessToken: 'a', refreshToken: 'r' }, fetchMock);
    } catch (err) {
      caught = err as Error;
    }
    expect(caught).toBeDefined();
    // The message has a fixed prefix "Token refresh failed (500): " before
    // the (sliced) body. The sliced body is exactly 200 chars of 'x'.
    expect(caught!.message).toMatch(/Token refresh failed \(500\): x{200}$/);
    // Confirm explicitly we didn't include the un-truncated rest.
    expect(caught!.message.length).toBeLessThan(longBody.length);
  });
});
