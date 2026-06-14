import { describe, expect, it, vi } from 'vitest';
import http from 'node:http';

// electron must be mocked BEFORE the oauth module is imported because
// authorize() uses shell.openExternal at top-level import time.
const openExternalMock = vi.fn(async (_url: string) => true);
vi.mock('electron', () => ({
  shell: { openExternal: (url: string) => openExternalMock(url) },
}));

const {
  authorize,
  buildAuthorizeUrl,
  buildRefreshBody,
  buildTokenExchangeBody,
  classifyCallback,
  generatePkce,
  isLoopbackHost,
  isOAuthSupported,
  listenForCallback,
  OAUTH_CONFIGS,
  refresh,
  safeStateEquals,
  tokenResponseToSet,
} = await import('../oauth');
type OAuthConfig = import('../oauth').OAuthConfig;

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

  it('returns oauth-error when the provider sends ?error=... WITH matching state', () => {
    // State validation now happens BEFORE the error check (CSRF defense
    // against unauthenticated local processes spraying the loopback
    // port with forged ?error=denied). Provider must echo state per
    // RFC 6749 §4.1.2.1, and we require it.
    const result = classifyCallback(`/oauth/callback?error=access_denied&state=${STATE}`, STATE);
    expect(result.kind).toBe('oauth-error');
    if (result.kind === 'oauth-error') {
      expect(result.error).toBe('access_denied');
    }
  });

  it('treats ?error=... WITHOUT state as state-mismatch (CSRF defense, kills local-DoS)', () => {
    // Without state, the request can't be the legitimate provider —
    // refuse it as state-mismatch rather than honoring the error
    // signal (which would terminate the OAuth flow at the listener).
    const result = classifyCallback('/oauth/callback?error=denied', STATE);
    expect(result.kind).toBe('state-mismatch');
  });

  it('returns missing-params when code is absent (state matched)', () => {
    expect(classifyCallback(`/oauth/callback?state=${STATE}`, STATE).kind).toBe('missing-params');
  });

  it('returns state-mismatch when state is absent entirely', () => {
    // No state at all → can't be from provider → state-mismatch (non-terminal).
    expect(classifyCallback('/oauth/callback', STATE).kind).toBe('state-mismatch');
    expect(classifyCallback('/oauth/callback?code=x', STATE).kind).toBe('state-mismatch');
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

  it('freee uses its production OAuth endpoints with read scope and a string clientId', () => {
    // Pins the ObjectLiteral (entry → {}), StringLiteral (each URL/scope),
    // ArrayDeclaration (scopes → []), and LogicalOperator (`?? ''` → `&& ''`) mutants.
    const cfg = OAUTH_CONFIGS.freee;
    expect(cfg).toBeDefined();
    expect(cfg?.authorizeUrl).toBe('https://accounts.secure.freee.co.jp/public_api/authorize');
    expect(cfg?.tokenUrl).toBe('https://accounts.secure.freee.co.jp/public_api/token');
    expect(cfg?.scopes).toEqual(['read']);
    // clientId is always a string (empty string when FREEE_OAUTH_CLIENT_ID is unset).
    // Kills `process.env.FREEE_OAUTH_CLIENT_ID ?? ''` → `&& ''` (which would give undefined).
    expect(typeof cfg?.clientId).toBe('string');
    // Pins the empty-string fallback value itself (kills StringLiteral `'' → "Stryker..."`).
    // テスト環境では FREEE_OAUTH_CLIENT_ID 未設定 → clientId は空文字。
    expect(cfg?.clientId).toBe('');
    // freee does not need extraAuthParams (no offline/prompt overrides).
    expect(cfg?.extraAuthParams).toBeUndefined();
  });

  it('microsoft-365 uses Microsoft identity platform endpoints with read+write scopes and a string clientId', () => {
    // Pins the ObjectLiteral (entry → {}), each StringLiteral in the scopes array,
    // ArrayDeclaration (scopes → []), and LogicalOperator (`?? ''` → `&& ''`) mutants.
    const cfg = OAUTH_CONFIGS['microsoft-365'];
    expect(cfg).toBeDefined();
    expect(cfg?.authorizeUrl).toBe(
      'https://login.microsoftonline.com/common/oauth2/v2.0/authorize',
    );
    expect(cfg?.tokenUrl).toBe('https://login.microsoftonline.com/common/oauth2/v2.0/token');
    // 読み取り (User.Read / Mail.Read / Calendars.Read) に加え、書き込みアクション
    // (send-mail / create-event) 用の Mail.Send / Calendars.ReadWrite を含む。
    expect(cfg?.scopes).toEqual([
      'User.Read',
      'Mail.Read',
      'Mail.Send',
      'Calendars.Read',
      'Calendars.ReadWrite',
      'offline_access',
    ]);
    // clientId is always a string (empty string when MS365_OAUTH_CLIENT_ID is unset).
    // Kills `process.env.MS365_OAUTH_CLIENT_ID ?? ''` → `&& ''`.
    expect(typeof cfg?.clientId).toBe('string');
    // Pins the empty-string fallback value itself (kills StringLiteral `'' → "Stryker..."`).
    // テスト環境では MS365_OAUTH_CLIENT_ID 未設定 → clientId は空文字。
    expect(cfg?.clientId).toBe('');
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

  it('returns true for Google services when GOOGLE_OAUTH_CLIENT_ID is set (kills ConditionalExpression → false)', async () => {
    // Module-level OAUTH_CONFIGS captures process.env at load time, so a
    // fresh import with the env var set reads the truthy clientId. This
    // exercises the TRUE branch — without it, mutating `Boolean(cfg && cfg.clientId)`
    // to `false` would still pass every other test (they all check false).
    const prev = process.env.GOOGLE_OAUTH_CLIENT_ID;
    process.env.GOOGLE_OAUTH_CLIENT_ID = 'test-client-id-12345.apps.googleusercontent.com';
    try {
      vi.resetModules();
      const fresh = (await import('../oauth')) as typeof import('../oauth');
      expect(fresh.isOAuthSupported('drive')).toBe(true);
      expect(fresh.isOAuthSupported('calendar')).toBe(true);
      expect(fresh.isOAuthSupported('gmail')).toBe(true);
      // Non-entry services still return false (cfg is undefined → falsy).
      expect(fresh.isOAuthSupported('github')).toBe(false);
    } finally {
      if (prev === undefined) delete process.env.GOOGLE_OAUTH_CLIENT_ID;
      else process.env.GOOGLE_OAUTH_CLIENT_ID = prev;
      vi.resetModules();
    }
  });
});

describe('listenForCallback (integration — real HTTP server)', () => {
  /** Helper: make an HTTP GET to the loopback server and discard the
   *  response body. The test reads listenForCallback's promise
   *  resolution / rejection separately. */
  async function fireGet(
    port: number,
    path: string,
    hostHeader?: string,
  ): Promise<{ status: number; body: string; contentType: string | undefined }> {
    return new Promise((resolve, reject) => {
      const headers: Record<string, string> = {};
      if (hostHeader !== undefined) headers.Host = hostHeader;
      const req = http.request(
        {
          hostname: '127.0.0.1',
          port,
          path,
          method: 'GET',
          headers,
        },
        (res) => {
          let body = '';
          res.on('data', (chunk) => (body += chunk.toString()));
          res.on('end', () =>
            resolve({
              status: res.statusCode ?? 0,
              body,
              contentType: res.headers['content-type'],
            }),
          );
        },
      );
      req.on('error', reject);
      req.end();
    });
  }

  it('resolves with {code, state} on a well-formed callback', async () => {
    const STATE = 'integ-test-state-12345-abcdef';
    const listener = listenForCallback(STATE);
    const port = await listener.port();
    const res = await fireGet(
      port,
      `/oauth/callback?code=actual-code&state=${STATE}`,
    );
    expect(res.status).toBe(200);
    expect(res.body).toContain('認証完了');
    // Pin Content-Type on the success response so the ObjectLiteral
    // (oauth.ts:311 → {}) and the inner StringLiteral mutants are killed.
    // The exact value includes a charset so the browser doesn't sniff.
    expect(res.contentType).toBe('text/html; charset=utf-8');
    const result = await listener;
    expect(result.code).toBe('actual-code');
    expect(result.state).toBe(STATE);
  });

  /** Wrap listenForCallback so any rejection is captured immediately
   *  (no unhandled-rejection warnings). Returns the captured error or
   *  the resolved value. */
  function trap(p: ReturnType<typeof listenForCallback>): Promise<Error | { code: string; state: string }> {
    return p.then((r) => r as { code: string; state: string }).catch((e) => e as Error);
  }

  it('responds 400 on state mismatch but does NOT terminate the flow (CSRF DoS defense)', async () => {
    // After the hardening: a forged callback with wrong/missing state
    // returns 400 but the listener KEEPS WAITING for the legitimate
    // browser callback. Without this, any local process could spray
    // the loopback port with `?state=wrong` and silently kill every
    // OAuth flow.
    const STATE = 'expected-state-mismatch-test';
    const listener = listenForCallback(STATE);
    const trapped = trap(listener);
    const port = await listener.port();
    const res = await fireGet(
      port,
      `/oauth/callback?code=c&state=different-state-same-length`,
    );
    expect(res.status).toBe(400);
    expect(res.body).toContain('state mismatch');
    // Now the legitimate callback arrives — the listener should still resolve.
    const okRes = await fireGet(port, `/oauth/callback?code=real-code&state=${STATE}`);
    expect(okRes.status).toBe(200);
    const result = await trapped;
    expect((result as { code: string }).code).toBe('real-code');
  });

  it('responds 400 + does NOT reject when ?error=... arrives without state (DoS defense)', async () => {
    // Same defense: unauthenticated `?error=denied` (no state) is treated
    // as state-mismatch — non-terminal.
    const STATE = 'expected-state-error-defense';
    const listener = listenForCallback(STATE);
    const trapped = trap(listener);
    const port = await listener.port();
    const stray = await fireGet(port, '/oauth/callback?error=access_denied');
    expect(stray.status).toBe(400);
    // Listener still alive — legitimate callback resolves it.
    const okRes = await fireGet(port, `/oauth/callback?code=ok-code&state=${STATE}`);
    expect(okRes.status).toBe(200);
    const result = await trapped;
    expect((result as { code: string }).code).toBe('ok-code');
  });

  it('rejects when the provider returns ?error=... WITH matching state (legitimate provider error)', async () => {
    const STATE = 'expected-real-error-state';
    const listener = listenForCallback(STATE);
    const trapped = trap(listener);
    const port = await listener.port();
    const res = await fireGet(port, `/oauth/callback?error=access_denied&state=${STATE}`);
    expect(res.status).toBe(400);
    expect(res.body).toContain('OAuth error');
    expect(res.body).toContain('access_denied');
    // Pin Content-Type header so the ObjectLiteral mutant ({} for the
    // headers object) is killed — without text/plain the browser may
    // interpret the body differently.
    expect(res.contentType).toMatch(/^text\/plain/);
    const result = await trapped;
    expect((result as Error).message).toMatch(/access_denied/);
  });

  it('rejects when code is missing but state matches (legitimate-but-broken provider response)', async () => {
    const STATE = 'expected-state-no-code';
    const listener = listenForCallback(STATE);
    const trapped = trap(listener);
    const port = await listener.port();
    const res = await fireGet(port, `/oauth/callback?state=${STATE}`);
    expect(res.status).toBe(400);
    expect(res.body).toContain('missing code');
    const result = await trapped;
    expect((result as Error).message).toMatch(/missing code/);
  });

  it('returns 404 on paths other than /oauth/callback', async () => {
    const listener = listenForCallback('s');
    const trapped = trap(listener);
    const port = await listener.port();
    const res = await fireGet(port, '/some-other-path');
    expect(res.status).toBe(404);
    listener.cancel();
    await trapped; // drain
  });

  it('returns 400 + "bad host" on a non-loopback Host header (DNS rebinding defense)', async () => {
    const listener = listenForCallback('s');
    const trapped = trap(listener);
    const port = await listener.port();
    const res = await fireGet(
      port,
      '/oauth/callback?code=c&state=s',
      'attacker.example:54321',
    );
    expect(res.status).toBe(400);
    expect(res.body).toBe('bad host');
    // Pin Content-Type header so the ObjectLiteral mutant ({} for the
    // headers object on oauth.ts:278) is killed.
    expect(res.contentType).toMatch(/^text\/plain/);
    listener.cancel();
    await trapped;
  });

  it('accepts localhost as a Host header (verifies isLoopbackHost wiring)', async () => {
    const STATE = 'localhost-host-test';
    const listener = listenForCallback(STATE);
    const port = await listener.port();
    const res = await fireGet(
      port,
      `/oauth/callback?code=c&state=${STATE}`,
      `localhost:${port}`,
    );
    expect(res.status).toBe(200);
    await listener;
  });

  it('rejects with timeout error when no callback arrives within timeoutMs', async () => {
    // 50ms timeout — fires immediately because no request comes in.
    const listener = listenForCallback('untouched-state', 50);
    const trapped = trap(listener);
    const result = await trapped;
    expect((result as Error).message).toMatch(/timed out after/);
  });

  it('formats the timeout message as seconds (kills `/ 1000` → `* 1000` ArithmeticOperator)', async () => {
    // Original: `Math.round(timeoutMs / 1000)`. For timeoutMs=50ms,
    // 50/1000 = 0.05 → round → 0s. With `* 1000` mutation, 50*1000 = 50000s.
    const listener = listenForCallback('s', 50);
    const trapped = trap(listener);
    const result = await trapped;
    const msg = (result as Error).message;
    expect(msg).toMatch(/timed out after 0s/);
    expect(msg).not.toMatch(/50000s/);
  });

  it('returns 400 on EVERY stray request (kills strayCount increment direction and threshold)', async () => {
    // After STRAY_LIMIT (50) strays, the server self-closes. The exact
    // ordering of the "next request fails" assertion is racy, so test
    // the strong invariant instead: every stray request gets the SAME
    // 400 status (kills increment-direction and threshold equality
    // mutations because if strayCount decremented or the threshold
    // flipped, the counter would never reach STRAY_LIMIT and never
    // affect behavior — but if it reached too early, some strays
    // would be served by a closed socket and fail with ECONNREFUSED
    // instead of 400).
    const STATE = 'stray-counter-test';
    const listener = listenForCallback(STATE);
    const trapped = trap(listener);
    const port = await listener.port();
    const statuses: number[] = [];
    // 49 strays — comfortably under STRAY_LIMIT=50 so all should return 400.
    for (let i = 0; i < 49; i++) {
      try {
        const r = await fireGet(port, `/oauth/callback?state=wrong-${i}`);
        statuses.push(r.status);
      } catch {
        statuses.push(0);
      }
    }
    expect(statuses).toEqual(new Array(49).fill(400));
    listener.cancel();
    await trapped;
  });

  it('cancel() rejects the listener and closes the server', async () => {
    const listener = listenForCallback('s');
    const trapped = trap(listener);
    await listener.port(); // ensure server is listening
    listener.cancel();
    const result = await trapped;
    expect((result as Error).message).toMatch(/cancelled/);
  });
});

describe('authorize (end-to-end flow with real loopback + mocked electron + mocked fetch)', () => {
  /** Helper: poll for the openExternal mock to be invoked, then return
   *  the captured authorize URL. */
  async function waitForOpenExternalCall(timeoutMs = 1000): Promise<string> {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      if (openExternalMock.mock.calls.length > 0) {
        return openExternalMock.mock.calls[openExternalMock.mock.calls.length - 1]![0];
      }
      await new Promise((r) => setTimeout(r, 5));
    }
    throw new Error('shell.openExternal was never called within timeout');
  }

  async function fireCallback(port: number, params: Record<string, string>): Promise<void> {
    return new Promise((resolve, reject) => {
      const qs = new URLSearchParams(params).toString();
      const req = http.request(
        { hostname: '127.0.0.1', port, path: `/oauth/callback?${qs}`, method: 'GET' },
        (res) => {
          res.on('data', () => {});
          res.on('end', () => resolve());
        },
      );
      req.on('error', reject);
      req.end();
    });
  }

  const CFG: OAuthConfig = {
    authorizeUrl: 'https://accounts.example.com/o/oauth2/v2/auth',
    tokenUrl: 'https://oauth2.example.com/token',
    clientId: 'integration-client-id',
    scopes: ['scope-a', 'scope-b'],
  };

  it('rejects immediately when clientId is not configured', async () => {
    await expect(authorize({ ...CFG, clientId: '' }, vi.fn<typeof fetch>())).rejects.toThrow(
      /OAuth client ID is not configured/,
    );
  });

  it('completes the full flow: opens browser → receives callback → exchanges code for token', async () => {
    openExternalMock.mockClear();
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          access_token: 'received-access-token',
          refresh_token: 'received-refresh-token',
          expires_in: 3600,
          scope: 'scope-a scope-b',
          token_type: 'Bearer',
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    );

    const authorizePromise = authorize(CFG, fetchMock);
    const url = await waitForOpenExternalCall();
    const parsed = new URL(url);
    const port = Number(new URL(parsed.searchParams.get('redirect_uri')!).port);
    const state = parsed.searchParams.get('state')!;
    expect(port).toBeGreaterThan(0);
    expect(state.length).toBeGreaterThan(0);

    await fireCallback(port, { code: 'received-code', state });
    const tokens = await authorizePromise;

    expect(tokens.accessToken).toBe('received-access-token');
    expect(tokens.refreshToken).toBe('received-refresh-token');
    expect(tokens.scope).toBe('scope-a scope-b');
    expect(tokens.tokenType).toBe('Bearer');

    // Verify the token-exchange POST shape.
    const [tokenUrl, init] = fetchMock.mock.calls[0]!;
    expect(tokenUrl).toBe(CFG.tokenUrl);
    expect((init as RequestInit).method).toBe('POST');
    expect((init as RequestInit).headers).toMatchObject({
      'Content-Type': 'application/x-www-form-urlencoded',
    });
    const body = new URLSearchParams((init as RequestInit).body as string);
    expect(body.get('grant_type')).toBe('authorization_code');
    expect(body.get('code')).toBe('received-code');
    expect(body.get('client_id')).toBe(CFG.clientId);
    expect(body.get('redirect_uri')).toBe(`http://127.0.0.1:${port}/oauth/callback`);
    expect(body.get('code_verifier')).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });

  it('throws when the token endpoint returns non-2xx, including the truncated body', async () => {
    openExternalMock.mockClear();
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response('X'.repeat(500), { status: 400 }));

    const authorizePromise = authorize(CFG, fetchMock).catch((e) => e);
    const url = await waitForOpenExternalCall();
    const parsed = new URL(url);
    const port = Number(new URL(parsed.searchParams.get('redirect_uri')!).port);
    const state = parsed.searchParams.get('state')!;
    await fireCallback(port, { code: 'c', state });

    const result = (await authorizePromise) as Error;
    expect(result).toBeInstanceOf(Error);
    expect(result.message).toMatch(/Token exchange failed \(400\): X{200}$/);
    expect(result.message.length).toBeLessThan(500);
  });

  it('uses an empty-body fallback when token-endpoint res.text() rejects', async () => {
    openExternalMock.mockClear();
    const erroringBody = new ReadableStream({
      start(c) {
        c.error(new Error('text fail'));
      },
    });
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(erroringBody, { status: 502 }));

    const authorizePromise = authorize(CFG, fetchMock).catch((e) => e);
    const url = await waitForOpenExternalCall();
    const parsed = new URL(url);
    const port = Number(new URL(parsed.searchParams.get('redirect_uri')!).port);
    const state = parsed.searchParams.get('state')!;
    await fireCallback(port, { code: 'c', state });

    const result = (await authorizePromise) as Error;
    expect(result.message).toBe('Token exchange failed (502): ');
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
