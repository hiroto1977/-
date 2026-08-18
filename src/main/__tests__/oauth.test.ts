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
  buildTokenRequestHeaders,
  classifyCallback,
  generatePkce,
  isLoopbackHost,
  isOAuthSupported,
  listenForCallback,
  OAUTH_CONFIGS,
  refresh,
  requiresClientSecret,
  safeStateEquals,
  serializeTokenBody,
  tokenResponseToSet,
  usesPkce,
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

// --- provider-shaped fixtures for the newly added OAuth configs -----------
// Each mirrors the wire contract of one real provider so the pure builders
// can be checked without touching the network or the env.

/** Slack: public client — PKCE, comma scopes, no secret. */
const SLACK_CFG: OAuthConfig = {
  authorizeUrl: 'https://slack.com/oauth/v2/authorize',
  tokenUrl: 'https://slack.com/api/oauth.v2.access',
  clientId: 'slack-client',
  scopes: ['channels:read', 'chat:write'],
  scopeDelimiter: ',',
  extraAuthParams: { user_scope: '' },
};

/** Notion: no PKCE, Basic client auth, JSON token body, owner=user. */
const NOTION_CFG: OAuthConfig = {
  authorizeUrl: 'https://api.notion.com/v1/oauth/authorize',
  tokenUrl: 'https://api.notion.com/v1/oauth/token',
  clientId: 'notion-client',
  clientSecret: 'notion-secret',
  clientAuth: 'basic',
  tokenBodyFormat: 'json',
  pkce: false,
  scopes: [],
  extraAuthParams: { owner: 'user' },
  extraTokenHeaders: { 'Notion-Version': '2022-06-28' },
};

/** Atlassian: no PKCE, secret in the body, audience + prompt required. */
const ATLASSIAN_CFG: OAuthConfig = {
  authorizeUrl: 'https://auth.atlassian.com/authorize',
  tokenUrl: 'https://auth.atlassian.com/oauth/token',
  clientId: 'atlassian-client',
  clientSecret: 'atlassian-secret',
  clientAuth: 'body',
  pkce: false,
  scopes: ['read:jira-work', 'offline_access'],
  extraAuthParams: { audience: 'api.atlassian.com', prompt: 'consent' },
};

/** Canva: PKCE *and* Basic client auth, form-encoded body. */
const CANVA_CFG: OAuthConfig = {
  authorizeUrl: 'https://www.canva.com/api/oauth/authorize',
  tokenUrl: 'https://api.canva.com/rest/v1/oauth/token',
  clientId: 'canva-client',
  clientSecret: 'canva-secret',
  clientAuth: 'basic',
  scopes: ['design:meta:read', 'folder:write'],
};

describe('usesPkce', () => {
  it('defaults to true when the config says nothing', () => {
    expect(usesPkce(CFG)).toBe(true);
    expect(usesPkce(SLACK_CFG)).toBe(true);
    expect(usesPkce(CANVA_CFG)).toBe(true);
  });

  it('is false only when explicitly opted out', () => {
    expect(usesPkce(NOTION_CFG)).toBe(false);
    expect(usesPkce(ATLASSIAN_CFG)).toBe(false);
    // `pkce: true` is the same as omitting it.
    expect(usesPkce({ ...NOTION_CFG, pkce: true })).toBe(true);
  });
});

describe('requiresClientSecret', () => {
  it('is true for both confidential client-auth modes', () => {
    expect(requiresClientSecret(NOTION_CFG)).toBe(true); // basic
    expect(requiresClientSecret(ATLASSIAN_CFG)).toBe(true); // body
    expect(requiresClientSecret(CANVA_CFG)).toBe(true); // basic + PKCE
  });

  it('is false for public clients (no clientAuth, or an explicit none)', () => {
    expect(requiresClientSecret(CFG)).toBe(false);
    expect(requiresClientSecret(SLACK_CFG)).toBe(false);
    expect(requiresClientSecret({ ...NOTION_CFG, clientAuth: 'none' })).toBe(false);
  });

  it('does NOT key off whether a secret happens to be present', () => {
    // A stray secret on a public-client config must not flip the mode —
    // that is what keeps a half-edited config from silently posting
    // credentials to a provider that rejects them (Slack + PKCE).
    expect(requiresClientSecret({ ...SLACK_CFG, clientSecret: 'oops' })).toBe(false);
    // ...and a missing secret must not downgrade a confidential provider
    // to "no secret needed" (that is what authorize()'s guard is for).
    expect(requiresClientSecret({ ...NOTION_CFG, clientSecret: undefined })).toBe(true);
  });
});

describe('buildAuthorizeUrl — provider-specific shapes', () => {
  it('omits the PKCE params entirely for non-PKCE providers', () => {
    const url = new URL(
      buildAuthorizeUrl(NOTION_CFG, 'http://127.0.0.1:1/oauth/callback', 'st', 'chal'),
    );
    expect(url.searchParams.get('code_challenge')).toBeNull();
    expect(url.searchParams.get('code_challenge_method')).toBeNull();
    // Everything else is still there.
    expect(url.searchParams.get('response_type')).toBe('code');
    expect(url.searchParams.get('client_id')).toBe('notion-client');
    expect(url.searchParams.get('state')).toBe('st');
  });

  it('omits the scope param when the provider has no scope concept (Notion)', () => {
    const url = new URL(
      buildAuthorizeUrl(NOTION_CFG, 'http://127.0.0.1:1/oauth/callback', 'st', 'chal'),
    );
    expect(url.searchParams.has('scope')).toBe(false);
    // owner=user is REQUIRED by Notion, so it must survive.
    expect(url.searchParams.get('owner')).toBe('user');
  });

  it('joins Slack scopes with commas and requests an empty user_scope', () => {
    const url = new URL(
      buildAuthorizeUrl(SLACK_CFG, 'http://127.0.0.1:1/oauth/callback', 'st', 'chal'),
    );
    expect(url.origin + url.pathname).toBe('https://slack.com/oauth/v2/authorize');
    expect(url.searchParams.get('scope')).toBe('channels:read,chat:write');
    // Present-but-empty: bot scopes only, no user token requested.
    expect(url.searchParams.has('user_scope')).toBe(true);
    expect(url.searchParams.get('user_scope')).toBe('');
    // Slack is a public client → PKCE stays on.
    expect(url.searchParams.get('code_challenge')).toBe('chal');
    expect(url.searchParams.get('code_challenge_method')).toBe('S256');
  });

  it('carries Atlassian audience + prompt and space-joined scopes', () => {
    const url = new URL(
      buildAuthorizeUrl(ATLASSIAN_CFG, 'http://127.0.0.1:1/oauth/callback', 'st', 'chal'),
    );
    expect(url.origin + url.pathname).toBe('https://auth.atlassian.com/authorize');
    expect(url.searchParams.get('audience')).toBe('api.atlassian.com');
    expect(url.searchParams.get('prompt')).toBe('consent');
    expect(url.searchParams.get('scope')).toBe('read:jira-work offline_access');
    expect(url.searchParams.get('code_challenge')).toBeNull();
  });

  it('keeps PKCE for Canva even though it also uses client authentication', () => {
    const url = new URL(
      buildAuthorizeUrl(CANVA_CFG, 'http://127.0.0.1:1/oauth/callback', 'st', 'chal-xyz'),
    );
    expect(url.origin + url.pathname).toBe('https://www.canva.com/api/oauth/authorize');
    expect(url.searchParams.get('code_challenge')).toBe('chal-xyz');
    expect(url.searchParams.get('code_challenge_method')).toBe('S256');
    expect(url.searchParams.get('scope')).toBe('design:meta:read folder:write');
    // The secret NEVER appears in a URL that gets handed to the browser.
    expect(url.search).not.toContain('canva-secret');
    expect(url.searchParams.has('client_secret')).toBe(false);
  });
});

describe('buildTokenExchangeBody — client authentication modes', () => {
  it('basic mode puts NO credentials in the body (RFC 6749 §2.3.1)', () => {
    const body = buildTokenExchangeBody(NOTION_CFG, 'http://127.0.0.1:1/cb', 'code-1', 'ver');
    expect(body.get('grant_type')).toBe('authorization_code');
    expect(body.get('code')).toBe('code-1');
    expect(body.get('redirect_uri')).toBe('http://127.0.0.1:1/cb');
    // Credentials ride in the Authorization header instead.
    expect(body.has('client_id')).toBe(false);
    expect(body.has('client_secret')).toBe(false);
    // Non-PKCE provider → no verifier it never issued a challenge for.
    expect(body.has('code_verifier')).toBe(false);
  });

  it('body mode sends client_id AND client_secret as form fields', () => {
    const body = buildTokenExchangeBody(ATLASSIAN_CFG, 'http://127.0.0.1:1/cb', 'code-2', 'ver');
    expect(body.get('client_id')).toBe('atlassian-client');
    expect(body.get('client_secret')).toBe('atlassian-secret');
    expect(body.has('code_verifier')).toBe(false);
  });

  it('public mode sends client_id + code_verifier and never a secret', () => {
    const body = buildTokenExchangeBody(SLACK_CFG, 'http://127.0.0.1:1/cb', 'code-3', 'ver-3');
    expect(body.get('client_id')).toBe('slack-client');
    expect(body.has('client_secret')).toBe(false);
    // Slack with PKCE explicitly forbids client_secret here.
    expect(body.get('code_verifier')).toBe('ver-3');
  });

  it('Canva keeps the verifier (PKCE) while dropping body credentials (basic)', () => {
    const body = buildTokenExchangeBody(CANVA_CFG, 'http://127.0.0.1:1/cb', 'code-4', 'ver-4');
    expect(body.get('code_verifier')).toBe('ver-4');
    expect(body.has('client_id')).toBe(false);
    expect(body.has('client_secret')).toBe(false);
  });

  it('falls back to an empty secret string rather than "undefined" in body mode', () => {
    // Kills `config.clientSecret ?? ''` → `config.clientSecret`, which
    // would serialize the literal text "undefined" as the secret.
    const body = buildTokenExchangeBody(
      { ...ATLASSIAN_CFG, clientSecret: undefined },
      'http://127.0.0.1:1/cb',
      'c',
      'v',
    );
    expect(body.get('client_secret')).toBe('');
  });
});

describe('buildRefreshBody — client authentication modes', () => {
  it('basic mode omits credentials from the refresh body too', () => {
    const body = buildRefreshBody(NOTION_CFG, 'rt-notion');
    expect(body.get('grant_type')).toBe('refresh_token');
    expect(body.get('refresh_token')).toBe('rt-notion');
    expect(body.has('client_id')).toBe(false);
    expect(body.has('client_secret')).toBe(false);
  });

  it('body mode repeats both credentials on refresh', () => {
    const body = buildRefreshBody(ATLASSIAN_CFG, 'rt-atl');
    expect(body.get('client_id')).toBe('atlassian-client');
    expect(body.get('client_secret')).toBe('atlassian-secret');
  });

  it('public mode sends only client_id on refresh', () => {
    const body = buildRefreshBody(SLACK_CFG, 'rt-slack');
    expect(body.get('client_id')).toBe('slack-client');
    expect(body.has('client_secret')).toBe(false);
  });
});

describe('buildTokenRequestHeaders', () => {
  it('defaults to form encoding with no Authorization header', () => {
    expect(buildTokenRequestHeaders(CFG)).toEqual({
      'Content-Type': 'application/x-www-form-urlencoded',
    });
    expect(buildTokenRequestHeaders(SLACK_CFG)).toEqual({
      'Content-Type': 'application/x-www-form-urlencoded',
    });
  });

  it('emits base64(client_id:client_secret) Basic auth for basic mode', () => {
    const headers = buildTokenRequestHeaders(CANVA_CFG);
    expect(headers['Content-Type']).toBe('application/x-www-form-urlencoded');
    const expected = Buffer.from('canva-client:canva-secret', 'utf8').toString('base64');
    expect(headers.Authorization).toBe(`Basic ${expected}`);
    // Round-trip so a wrong separator / encoding can't slip through.
    expect(Buffer.from(expected, 'base64').toString('utf8')).toBe('canva-client:canva-secret');
  });

  it('switches Content-Type to application/json for Notion and merges extra headers', () => {
    const headers = buildTokenRequestHeaders(NOTION_CFG);
    expect(headers['Content-Type']).toBe('application/json');
    expect(headers['Notion-Version']).toBe('2022-06-28');
    expect(headers.Authorization).toBe(
      `Basic ${Buffer.from('notion-client:notion-secret', 'utf8').toString('base64')}`,
    );
  });

  it('never adds Authorization for body-mode providers (secret goes in the body)', () => {
    const headers = buildTokenRequestHeaders(ATLASSIAN_CFG);
    expect(headers.Authorization).toBeUndefined();
  });

  it('encodes an empty secret rather than the string "undefined"', () => {
    const headers = buildTokenRequestHeaders({ ...CANVA_CFG, clientSecret: undefined });
    expect(Buffer.from(headers.Authorization!.slice('Basic '.length), 'base64').toString()).toBe(
      'canva-client:',
    );
  });
});

describe('serializeTokenBody', () => {
  it('form-encodes by default', () => {
    const params = new URLSearchParams({ grant_type: 'authorization_code', code: 'a b' });
    expect(serializeTokenBody(CFG, params)).toBe('grant_type=authorization_code&code=a+b');
  });

  it('JSON-encodes when the provider asks for it (Notion)', () => {
    const params = new URLSearchParams({
      grant_type: 'authorization_code',
      code: 'c-1',
      redirect_uri: 'http://127.0.0.1:1/cb',
    });
    const body = serializeTokenBody(NOTION_CFG, params);
    expect(JSON.parse(body)).toEqual({
      grant_type: 'authorization_code',
      code: 'c-1',
      redirect_uri: 'http://127.0.0.1:1/cb',
    });
    // Really JSON, not a query string.
    expect(body.startsWith('{')).toBe(true);
  });

  it('round-trips an empty parameter bag in both formats', () => {
    expect(serializeTokenBody(CFG, new URLSearchParams())).toBe('');
    expect(serializeTokenBody(NOTION_CFG, new URLSearchParams())).toBe('{}');
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

  it('registers exactly the ten OAuth-capable services and nothing else', () => {
    // Kills the outer OBJECT_LITERAL mutation that would replace the
    // whole OAUTH_CONFIGS with {} — by inversion the assertion checks
    // we DO have every known entry. Also pins the count that
    // `verify:arch` cross-checks against docs/ARCHITECTURE.md.
    const keys = Object.keys(OAUTH_CONFIGS);
    expect(keys.sort()).toEqual(
      [
        'atlassian',
        'calendar',
        'canva',
        'drive',
        'freee',
        'gmail',
        'microsoft-365',
        'notion',
        'slack',
        'wordpress',
      ].sort(),
    );
    // GitHub / Cloudflare stay PAT-only — no OAuth app to register against.
    expect(keys).not.toContain('github');
    expect(keys).not.toContain('cloudflare');
  });

  it('slack uses Slack OAuth V2 endpoints, comma-joined bot scopes and PKCE', () => {
    // Slack is the only newly added provider that can run as a true
    // public client: enabling PKCE on the app makes client_secret
    // forbidden rather than required.
    const cfg = OAUTH_CONFIGS.slack;
    expect(cfg).toBeDefined();
    expect(cfg?.authorizeUrl).toBe('https://slack.com/oauth/v2/authorize');
    expect(cfg?.tokenUrl).toBe('https://slack.com/api/oauth.v2.access');
    expect(cfg?.scopes).toEqual(['channels:read', 'groups:read', 'team:read', 'chat:write']);
    // Slack joins scopes with commas, not spaces.
    expect(cfg?.scopeDelimiter).toBe(',');
    // Bot scopes only: the user-token bucket is explicitly requested empty
    // so the token lands in the response's TOP-LEVEL access_token.
    expect(cfg?.extraAuthParams).toEqual({ user_scope: '' });
    // Public client — PKCE on (default), no secret, no Basic auth.
    expect(usesPkce(cfg!)).toBe(true);
    expect(requiresClientSecret(cfg!)).toBe(false);
    expect(cfg?.clientAuth).toBeUndefined();
    expect(cfg?.clientSecret).toBeUndefined();
    expect(typeof cfg?.clientId).toBe('string');
    expect(cfg?.clientId).toBe('');
  });

  it('notion uses Basic auth + a JSON body + owner=user and no PKCE', () => {
    const cfg = OAUTH_CONFIGS.notion;
    expect(cfg).toBeDefined();
    expect(cfg?.authorizeUrl).toBe('https://api.notion.com/v1/oauth/authorize');
    expect(cfg?.tokenUrl).toBe('https://api.notion.com/v1/oauth/token');
    // Notion has no scope concept — permissions come from the
    // integration's capabilities and the pages the user picks.
    expect(cfg?.scopes).toEqual([]);
    expect(cfg?.clientAuth).toBe('basic');
    expect(cfg?.tokenBodyFormat).toBe('json');
    expect(usesPkce(cfg!)).toBe(false);
    expect(requiresClientSecret(cfg!)).toBe(true);
    // owner=user is a REQUIRED authorize param for Notion.
    expect(cfg?.extraAuthParams).toEqual({ owner: 'user' });
    expect(cfg?.extraTokenHeaders).toEqual({ 'Notion-Version': '2022-06-28' });
    // Both halves of the credential are env-sourced strings, empty in CI.
    expect(typeof cfg?.clientId).toBe('string');
    expect(typeof cfg?.clientSecret).toBe('string');
    expect(cfg?.clientId).toBe('');
    expect(cfg?.clientSecret).toBe('');
  });

  it('canva uses Connect API endpoints with PKCE *and* Basic client auth', () => {
    // Canva is the awkward middle case: PKCE is mandatory yet the token
    // endpoint still demands client authentication.
    const cfg = OAUTH_CONFIGS.canva;
    expect(cfg).toBeDefined();
    expect(cfg?.authorizeUrl).toBe('https://www.canva.com/api/oauth/authorize');
    expect(cfg?.tokenUrl).toBe('https://api.canva.com/rest/v1/oauth/token');
    expect(cfg?.scopes).toEqual(['design:meta:read', 'folder:write']);
    expect(usesPkce(cfg!)).toBe(true);
    expect(cfg?.clientAuth).toBe('basic');
    expect(requiresClientSecret(cfg!)).toBe(true);
    // Form-encoded body (only Notion opts into JSON).
    expect(cfg?.tokenBodyFormat).toBeUndefined();
    expect(typeof cfg?.clientId).toBe('string');
    expect(typeof cfg?.clientSecret).toBe('string');
    expect(cfg?.clientId).toBe('');
    expect(cfg?.clientSecret).toBe('');
  });

  it('wordpress uses public-api.wordpress.com endpoints with the global scope and no PKCE', () => {
    const cfg = OAUTH_CONFIGS.wordpress;
    expect(cfg).toBeDefined();
    expect(cfg?.authorizeUrl).toBe('https://public-api.wordpress.com/oauth2/authorize');
    expect(cfg?.tokenUrl).toBe('https://public-api.wordpress.com/oauth2/token');
    // `global` reaches /me/sites across every site; `auth` would only
    // reach /me/.
    expect(cfg?.scopes).toEqual(['global']);
    expect(usesPkce(cfg!)).toBe(false);
    expect(cfg?.clientAuth).toBe('body');
    expect(requiresClientSecret(cfg!)).toBe(true);
    expect(cfg?.extraAuthParams).toBeUndefined();
    expect(typeof cfg?.clientId).toBe('string');
    expect(typeof cfg?.clientSecret).toBe('string');
    expect(cfg?.clientId).toBe('');
    expect(cfg?.clientSecret).toBe('');
  });

  it('atlassian uses 3LO endpoints with the required audience + prompt params', () => {
    const cfg = OAUTH_CONFIGS.atlassian;
    expect(cfg).toBeDefined();
    expect(cfg?.authorizeUrl).toBe('https://auth.atlassian.com/authorize');
    expect(cfg?.tokenUrl).toBe('https://auth.atlassian.com/oauth/token');
    // read:jira-work is the classic read scope; offline_access is what
    // makes Atlassian issue a refresh token at all.
    expect(cfg?.scopes).toEqual(['read:jira-work', 'offline_access']);
    // audience AND prompt=consent are both required by Atlassian.
    expect(cfg?.extraAuthParams).toEqual({
      audience: 'api.atlassian.com',
      prompt: 'consent',
    });
    expect(usesPkce(cfg!)).toBe(false);
    expect(cfg?.clientAuth).toBe('body');
    expect(requiresClientSecret(cfg!)).toBe(true);
    expect(typeof cfg?.clientId).toBe('string');
    expect(typeof cfg?.clientSecret).toBe('string');
    expect(cfg?.clientId).toBe('');
    expect(cfg?.clientSecret).toBe('');
  });

  it('pins every token endpoint to https (assertHttpsTokenUrl can never fire in prod)', () => {
    for (const [id, cfg] of Object.entries(OAUTH_CONFIGS)) {
      expect(cfg, id).toBeDefined();
      expect(cfg!.tokenUrl.startsWith('https://'), id).toBe(true);
      expect(cfg!.authorizeUrl.startsWith('https://'), id).toBe(true);
    }
  });

  it('never hardcodes a client secret — every credential comes from the env', () => {
    // The whole point of the clientSecret field: it is operator-supplied.
    // With no env vars set (CI default) every one must be the empty string.
    for (const [id, cfg] of Object.entries(OAUTH_CONFIGS)) {
      if (cfg?.clientSecret !== undefined) {
        expect(cfg.clientSecret, id).toBe('');
      }
      expect(cfg?.clientId, id).toBe('');
    }
  });
});

describe('isOAuthSupported', () => {
  // isOAuthSupported(svc) reflects (a) entry existence and (b) clientId
  // non-empty. With GOOGLE_OAUTH_CLIENT_ID absent (CI default), all
  // three are unsupported at module load. We can only assert that
  // services without an entry return false unconditionally.
  it('returns false for services without an OAUTH_CONFIGS entry', () => {
    expect(isOAuthSupported('github')).toBe(false);
    expect(isOAuthSupported('cloudflare')).toBe(false);
  });

  it('returns false for registered providers whose client ID is unset', () => {
    // These DO have an OAUTH_CONFIGS entry now, but no env credentials in
    // CI — the `cfg.clientId` half of the guard must still reject them.
    expect(isOAuthSupported('notion')).toBe(false);
    expect(isOAuthSupported('slack')).toBe(false);
    expect(isOAuthSupported('canva')).toBe(false);
    expect(isOAuthSupported('wordpress')).toBe(false);
    expect(isOAuthSupported('atlassian')).toBe(false);
  });

  it('returns false for a confidential provider that has a client ID but no secret', async () => {
    // Notion/Canva/WordPress/Atlassian cannot complete a token exchange
    // without a secret, so a half-configured install must NOT advertise
    // the "authenticate in browser" button. Exercises the
    // `requiresClientSecret(cfg) && !cfg.clientSecret` branch, which the
    // all-empty CI env can never reach.
    const prev = process.env.NOTION_OAUTH_CLIENT_ID;
    process.env.NOTION_OAUTH_CLIENT_ID = 'notion-client-id-12345';
    try {
      vi.resetModules();
      const fresh = (await import('../oauth')) as typeof import('../oauth');
      expect(fresh.isOAuthSupported('notion')).toBe(false);
    } finally {
      if (prev === undefined) delete process.env.NOTION_OAUTH_CLIENT_ID;
      else process.env.NOTION_OAUTH_CLIENT_ID = prev;
      vi.resetModules();
    }
  });

  it('returns true for a confidential provider once BOTH id and secret are set', async () => {
    const prevId = process.env.NOTION_OAUTH_CLIENT_ID;
    const prevSecret = process.env.NOTION_OAUTH_CLIENT_SECRET;
    process.env.NOTION_OAUTH_CLIENT_ID = 'notion-client-id-12345';
    process.env.NOTION_OAUTH_CLIENT_SECRET = 'notion-client-secret-abcde';
    try {
      vi.resetModules();
      const fresh = (await import('../oauth')) as typeof import('../oauth');
      expect(fresh.isOAuthSupported('notion')).toBe(true);
      // Sibling providers stay unsupported — the env var is per-provider.
      expect(fresh.isOAuthSupported('canva')).toBe(false);
    } finally {
      if (prevId === undefined) delete process.env.NOTION_OAUTH_CLIENT_ID;
      else process.env.NOTION_OAUTH_CLIENT_ID = prevId;
      if (prevSecret === undefined) delete process.env.NOTION_OAUTH_CLIENT_SECRET;
      else process.env.NOTION_OAUTH_CLIENT_SECRET = prevSecret;
      vi.resetModules();
    }
  });

  it('returns true for a public (PKCE) provider with only a client ID set', async () => {
    // Slack is a public client: no secret is needed, so a client ID alone
    // must be enough. Kills a `requiresClientSecret` → always-true mutant.
    const prev = process.env.SLACK_OAUTH_CLIENT_ID;
    process.env.SLACK_OAUTH_CLIENT_ID = '123456789012.987654321098';
    try {
      vi.resetModules();
      const fresh = (await import('../oauth')) as typeof import('../oauth');
      expect(fresh.isOAuthSupported('slack')).toBe(true);
    } finally {
      if (prev === undefined) delete process.env.SLACK_OAUTH_CLIENT_ID;
      else process.env.SLACK_OAUTH_CLIENT_ID = prev;
      vi.resetModules();
    }
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

  it('rejects a confidential provider with no client secret BEFORE opening the browser', async () => {
    // Ordering matters as much as the rejection: it would be hostile to
    // send the user through a consent screen and only then discover the
    // exchange can never succeed.
    openExternalMock.mockClear();
    const fetchMock = vi.fn<typeof fetch>();
    await expect(
      authorize({ ...NOTION_CFG, clientSecret: '' }, fetchMock),
    ).rejects.toThrow(/OAuth client secret is not configured/);
    expect(openExternalMock).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('does NOT demand a secret from a public (PKCE) provider like Slack', async () => {
    // Inverse of the guard above — kills a `requiresClientSecret` →
    // always-true mutant, which would break every public client.
    openExternalMock.mockClear();
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          ok: true,
          access_token: 'xoxb-bot-token',
          token_type: 'bot',
          scope: 'channels:read,chat:write',
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    );

    const authorizePromise = authorize({ ...SLACK_CFG, clientSecret: undefined }, fetchMock);
    const url = await waitForOpenExternalCall();
    const parsed = new URL(url);
    const port = Number(new URL(parsed.searchParams.get('redirect_uri')!).port);
    await fireCallback(port, { code: 'slack-code', state: parsed.searchParams.get('state')! });
    const tokens = await authorizePromise;

    // Slack returns the BOT token at the top level of oauth.v2.access.
    expect(tokens.accessToken).toBe('xoxb-bot-token');
    expect(tokens.tokenType).toBe('bot');

    const [tokenUrl, init] = fetchMock.mock.calls[0]!;
    expect(tokenUrl).toBe('https://slack.com/api/oauth.v2.access');
    expect((init as RequestInit).headers).toEqual({
      'Content-Type': 'application/x-www-form-urlencoded',
    });
    const body = new URLSearchParams((init as RequestInit).body as string);
    expect(body.get('client_id')).toBe('slack-client');
    // With PKCE enabled Slack requires the verifier and forbids the secret.
    expect(body.get('code_verifier')).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(body.has('client_secret')).toBe(false);
  });

  it('exchanges a Notion code as JSON with a Basic auth header and no PKCE', async () => {
    openExternalMock.mockClear();
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          access_token: 'ntn_access',
          refresh_token: 'nrt_refresh',
          token_type: 'bearer',
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    );

    const authorizePromise = authorize(NOTION_CFG, fetchMock);
    const url = await waitForOpenExternalCall();
    const parsed = new URL(url);
    // owner=user is required, and no PKCE challenge is offered.
    expect(parsed.searchParams.get('owner')).toBe('user');
    expect(parsed.searchParams.has('code_challenge')).toBe(false);
    const port = Number(new URL(parsed.searchParams.get('redirect_uri')!).port);
    const redirectUri = `http://127.0.0.1:${port}/oauth/callback`;
    await fireCallback(port, { code: 'notion-code', state: parsed.searchParams.get('state')! });
    const tokens = await authorizePromise;

    expect(tokens.accessToken).toBe('ntn_access');
    expect(tokens.refreshToken).toBe('nrt_refresh');

    const [tokenUrl, init] = fetchMock.mock.calls[0]!;
    expect(tokenUrl).toBe('https://api.notion.com/v1/oauth/token');
    const headers = (init as RequestInit).headers as Record<string, string>;
    expect(headers['Content-Type']).toBe('application/json');
    expect(headers['Notion-Version']).toBe('2022-06-28');
    expect(headers.Authorization).toBe(
      `Basic ${Buffer.from('notion-client:notion-secret', 'utf8').toString('base64')}`,
    );
    // Body is JSON, carries no credentials and no verifier.
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({
      grant_type: 'authorization_code',
      code: 'notion-code',
      redirect_uri: redirectUri,
    });
  });

  it('exchanges an Atlassian code with the secret in the form body', async () => {
    openExternalMock.mockClear();
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          access_token: 'atl-access',
          refresh_token: 'atl-refresh',
          expires_in: 3600,
          scope: 'read:jira-work offline_access',
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    );

    const authorizePromise = authorize(ATLASSIAN_CFG, fetchMock);
    const url = await waitForOpenExternalCall();
    const parsed = new URL(url);
    expect(parsed.searchParams.get('audience')).toBe('api.atlassian.com');
    expect(parsed.searchParams.get('prompt')).toBe('consent');
    const port = Number(new URL(parsed.searchParams.get('redirect_uri')!).port);
    await fireCallback(port, { code: 'atl-code', state: parsed.searchParams.get('state')! });
    const tokens = await authorizePromise;

    expect(tokens.accessToken).toBe('atl-access');
    expect(tokens.refreshToken).toBe('atl-refresh');

    const [, init] = fetchMock.mock.calls[0]!;
    expect((init as RequestInit).headers).toEqual({
      'Content-Type': 'application/x-www-form-urlencoded',
    });
    const body = new URLSearchParams((init as RequestInit).body as string);
    expect(body.get('client_id')).toBe('atlassian-client');
    expect(body.get('client_secret')).toBe('atlassian-secret');
    expect(body.has('code_verifier')).toBe(false);
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

  it('refreshes a Notion token as JSON over Basic auth', async () => {
    // Notion rotates the refresh token on every use, so the response's
    // new refresh_token must win over the carried-over one.
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValueOnce(
      new Response(
        JSON.stringify({ access_token: 'ntn_new', refresh_token: 'nrt_rotated' }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    );

    const result = await refresh(
      NOTION_CFG,
      { accessToken: 'ntn_old', refreshToken: 'nrt_old' },
      fetchMock,
    );
    expect(result.accessToken).toBe('ntn_new');
    expect(result.refreshToken).toBe('nrt_rotated');

    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('https://api.notion.com/v1/oauth/token');
    const headers = (init as RequestInit).headers as Record<string, string>;
    expect(headers['Content-Type']).toBe('application/json');
    expect(headers.Authorization).toBe(
      `Basic ${Buffer.from('notion-client:notion-secret', 'utf8').toString('base64')}`,
    );
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({
      grant_type: 'refresh_token',
      refresh_token: 'nrt_old',
    });
  });

  it('refreshes an Atlassian token with the secret in the form body', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValueOnce(
      new Response(JSON.stringify({ access_token: 'atl-new', expires_in: 3600 }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );

    await refresh(ATLASSIAN_CFG, { accessToken: 'old', refreshToken: 'atl-rt' }, fetchMock);

    const [, init] = fetchMock.mock.calls[0]!;
    expect((init as RequestInit).headers).toEqual({
      'Content-Type': 'application/x-www-form-urlencoded',
    });
    const body = new URLSearchParams((init as RequestInit).body as string);
    expect(body.get('grant_type')).toBe('refresh_token');
    expect(body.get('refresh_token')).toBe('atl-rt');
    expect(body.get('client_secret')).toBe('atlassian-secret');
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

describe('assertHttpsTokenUrl (RFC 8252 §8.3 — トークン交換を平文で行わせない)', () => {
  // authorize() / refresh() の冒頭ガード。現行の OAUTH_CONFIGS は全て https を
  // ハードコードしており IPC 層も clientId しか上書きさせないため到達しないが、
  // 将来の設定追加やテスト用 fixture の混入で平文交換が起きないための常設ガード。
  // ここを固定しないと「if を消す/条件を false にする」変異が生き残る = ガードが
  // 実際に効いているという保証が無い状態になる。
  const httpCfg: OAuthConfig = { ...CFG, tokenUrl: 'http://oauth2.example.com/token' };

  it('authorize は http のトークンエンドポイントを拒否する (ブラウザを開く前に落ちる)', async () => {
    const before = openExternalMock.mock.calls.length;
    await expect(authorize(httpCfg)).rejects.toThrow('OAuth token endpoint must use https');
    // 順序も重要: 平文だと分かった時点で、認可URLを開く副作用より前に止まること。
    expect(openExternalMock.mock.calls.length).toBe(before);
  });

  it('refresh は http のトークンエンドポイントを拒否する (fetch を呼ばない)', async () => {
    const fetchSpy = vi.fn<typeof fetch>();
    await expect(refresh(httpCfg, { accessToken: 'at', refreshToken: 'rt' }, fetchSpy)).rejects.toThrow(
      'OAuth token endpoint must use https',
    );
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('https のトークンエンドポイントはガードを通過する (誤検知しない)', async () => {
    const fetchSpy = vi.fn<typeof fetch>(
      async () =>
        new Response(JSON.stringify({ access_token: 'at', token_type: 'Bearer', expires_in: 3600 }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
    );
    const set = await refresh(CFG, { accessToken: 'old', refreshToken: 'rt' }, fetchSpy);
    expect(set.accessToken).toBe('at');
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });
});

// ===== OAUTH_CONFIGS の完全一致 golden (2026-08 変異検査) ==================
//
// `oauth.ts` の無効化を外して実測すると **394 変異体・70.05%・生存 117**。
// そのうち **103 件がこの設定表**にあった。既存の検査は主要サービスの
// 一部フィールドを `toMatchObject` (部分一致) で見ていたため、
// 触れていないサービス / フィールドは丸ごと素通りしていた。
//
// この表は **利用者の認可がどこへ送られるか**を決める。`authorizeUrl` を
// 空にしても、`scopes` を減らしても、`pkce` を反転させても、誰も気付かない
// 状態だった。仕様転記のデータなので、**完全一致 golden** が正しい道具である。
//
// `clientId` / `clientSecret` は env 由来なので値そのものは比較せず、
// 「文字列であること」(=`?? ''` が効いていること) を別に確かめる。
// ===== 残りの穴 (2026-08 変異検査) ======================================

describe('トークン交換の Basic 認証ヘッダー', () => {
  it('Basic <base64(clientId:clientSecret)> をそのまま組み立てる', () => {
    const headers = buildTokenRequestHeaders({
      authorizeUrl: 'https://x.example/a',
      tokenUrl: 'https://x.example/t',
      clientId: 'the-id',
      clientSecret: 'the-secret',
      clientAuth: 'basic',
      scopes: [],
    });
    const expected = `Basic ${Buffer.from('the-id:the-secret', 'utf8').toString('base64')}`;
    expect(headers.Authorization).toBe(expected);
    // 前置きの "Basic " が消えると相手は認証方式を判別できない。
    expect(headers.Authorization?.startsWith('Basic ')).toBe(true);
  });

  it('clientSecret 未設定でも id: の形で組み立てる', () => {
    const headers = buildTokenRequestHeaders({
      authorizeUrl: 'https://x.example/a',
      tokenUrl: 'https://x.example/t',
      clientId: 'the-id',
      clientAuth: 'basic',
      scopes: [],
    });
    expect(headers.Authorization).toBe(`Basic ${Buffer.from('the-id:', 'utf8').toString('base64')}`);
  });

  it('basic 以外では Authorization を付けない', () => {
    const headers = buildTokenRequestHeaders({
      authorizeUrl: 'https://x.example/a',
      tokenUrl: 'https://x.example/t',
      clientId: 'the-id',
      clientSecret: 's',
      clientAuth: 'body',
      scopes: [],
    });
    expect('Authorization' in headers).toBe(false);
  });
});

describe('ループバックサーバの結び先と応答本文', () => {
  // これらはモジュール読み込み時に決まる値 / 定数なので、先頭で import した
  // ものを見ていると変異体が素通りする。読み直してから確かめる。
  async function freshListen(): Promise<typeof listenForCallback> {
    vi.resetModules();
    const mod = (await import('../oauth')) as unknown as { listenForCallback: typeof listenForCallback };
    return mod.listenForCallback;
  }

  // `listen(0, '127.0.0.1')` の第 2 引数が消えると全インタフェース (0.0.0.0) で
  // 待ち受けることになり、同一ネットワークの別ホストから OAuth コールバック口が
  // 見える。サーバを外へ出していないので、**渡した引数を直接見る**。
  it('ループバックにだけ結ぶ (listen の host 引数を見る)', async () => {
    const http = await import('node:http');
    const proto = http.Server.prototype as unknown as { listen: (...a: unknown[]) => unknown };
    const original = proto.listen;
    const hosts: unknown[] = [];
    proto.listen = function patched(this: unknown, ...args: unknown[]) {
      hosts.push(args[1]);
      return original.apply(this, args);
    };
    try {
      const listen = await freshListen();
      const listener = listen('bind-check-state-0123456789');
      await listener.port();
      expect(hosts).toContain('127.0.0.1');
      listener.cancel();
      await listener.catch(() => undefined);
    } finally {
      proto.listen = original;
    }
  });

  it('認証完了ページの中身を返す (定数が空になっていない)', async () => {
    const listen = await freshListen();
    const STATE = 'html-check-state-0123456789';
    const listener = listen(STATE);
    const port = await listener.port();
    const body = await new Promise<string>((resolve, reject) => {
      const http = require('node:http') as typeof import('node:http');
      const req = http.request(
        { host: '127.0.0.1', port, path: `/oauth/callback?code=c&state=${STATE}` },
        (res) => {
          let buf = '';
          res.on('data', (d) => { buf += String(d); });
          res.on('end', () => resolve(buf));
        },
      );
      req.on('error', reject);
      req.end();
    });
    expect(body).toContain('<!doctype html>');
    expect(body).toContain('認証完了');
    expect(body).toContain('Service Hub');
    expect(body.length).toBeGreaterThan(200);
    await listener;
  });
});

describe('OAUTH_CONFIGS — 全サービス完全一致 (golden)', () => {
  /** env 由来の項目を落とした比較用の形。 */
  function withoutSecrets(cfg: Record<string, unknown>): Record<string, unknown> {
    const { clientId: _id, clientSecret: _sec, ...rest } = cfg;
    return rest;
  }

  const GOOGLE_AUTH = 'https://accounts.google.com/o/oauth2/v2/auth';
  const GOOGLE_TOKEN = 'https://oauth2.googleapis.com/token';
  const GOOGLE_EXTRA = { access_type: 'offline', prompt: 'consent' };

  const EXPECTED: Record<string, Record<string, unknown>> = {
    drive: {
      authorizeUrl: GOOGLE_AUTH,
      tokenUrl: GOOGLE_TOKEN,
      scopes: ['https://www.googleapis.com/auth/drive'],
      extraAuthParams: GOOGLE_EXTRA,
    },
    calendar: {
      authorizeUrl: GOOGLE_AUTH,
      tokenUrl: GOOGLE_TOKEN,
      scopes: [
        'https://www.googleapis.com/auth/calendar',
        'https://www.googleapis.com/auth/calendar.events',
      ],
      extraAuthParams: GOOGLE_EXTRA,
    },
    gmail: {
      authorizeUrl: GOOGLE_AUTH,
      tokenUrl: GOOGLE_TOKEN,
      scopes: [
        'https://www.googleapis.com/auth/gmail.modify',
        'https://www.googleapis.com/auth/gmail.compose',
      ],
      extraAuthParams: GOOGLE_EXTRA,
    },
    freee: {
      authorizeUrl: 'https://accounts.secure.freee.co.jp/public_api/authorize',
      tokenUrl: 'https://accounts.secure.freee.co.jp/public_api/token',
      scopes: ['read'],
    },
    'microsoft-365': {
      authorizeUrl: 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize',
      tokenUrl: 'https://login.microsoftonline.com/common/oauth2/v2.0/token',
      scopes: [
        'User.Read',
        'Mail.Read',
        'Mail.Send',
        'Calendars.Read',
        'Calendars.ReadWrite',
        'offline_access',
      ],
    },
    slack: {
      authorizeUrl: 'https://slack.com/oauth/v2/authorize',
      tokenUrl: 'https://slack.com/api/oauth.v2.access',
      scopeDelimiter: ',',
      scopes: ['channels:read', 'groups:read', 'team:read', 'chat:write'],
      extraAuthParams: { user_scope: '' },
    },
    notion: {
      authorizeUrl: 'https://api.notion.com/v1/oauth/authorize',
      tokenUrl: 'https://api.notion.com/v1/oauth/token',
      clientAuth: 'basic',
      tokenBodyFormat: 'json',
      pkce: false,
      scopes: [],
      extraAuthParams: { owner: 'user' },
      extraTokenHeaders: { 'Notion-Version': '2022-06-28' },
    },
    canva: {
      authorizeUrl: 'https://www.canva.com/api/oauth/authorize',
      tokenUrl: 'https://api.canva.com/rest/v1/oauth/token',
      clientAuth: 'basic',
      scopes: ['design:meta:read', 'folder:write'],
    },
    wordpress: {
      authorizeUrl: 'https://public-api.wordpress.com/oauth2/authorize',
      tokenUrl: 'https://public-api.wordpress.com/oauth2/token',
      clientAuth: 'body',
      pkce: false,
      scopes: ['global'],
    },
    atlassian: {
      authorizeUrl: 'https://auth.atlassian.com/authorize',
      tokenUrl: 'https://auth.atlassian.com/oauth/token',
      clientAuth: 'body',
      pkce: false,
      scopes: ['read:jira-work', 'offline_access'],
      extraAuthParams: { audience: 'api.atlassian.com', prompt: 'consent' },
    },
  };

  // **モジュールを読み直してから比較する。** この表はモジュール読み込み時に
  // 一度だけ評価されるので、先頭で import した値を見ていると、表を書き換える
  // 変異体が「評価済みの古い値」と比較されて素通りする (Stryker の static
  // mutant)。`vi.resetModules()` + 動的 import で毎回評価し直す。
  async function freshConfigs(): Promise<Record<string, Record<string, unknown>>> {
    vi.resetModules();
    const mod = (await import('../oauth')) as unknown as {
      OAUTH_CONFIGS: Record<string, Record<string, unknown>>;
    };
    return mod.OAUTH_CONFIGS;
  }

  it('登録されているサービスの一覧が一致する (増減を見逃さない)', async () => {
    expect(Object.keys(await freshConfigs()).sort()).toEqual(Object.keys(EXPECTED).sort());
  });

  for (const [svc, expected] of Object.entries(EXPECTED)) {
    it(`${svc}: 設定が完全一致する`, async () => {
      const cfg = (await freshConfigs())[svc];
      expect(cfg).toBeDefined();
      expect(withoutSecrets(cfg ?? {})).toEqual(expected);
    });

    // env 未設定のとき `?? ''` が効いて**空文字**になること。「文字列である」
    // だけでは、既定値を別の文字列に変えても素通りする。
    it(`${svc}: env 未設定の clientId は空文字`, async () => {
      const cfg = (await freshConfigs())[svc];
      expect(cfg?.clientId).toBe('');
    });
  }

  it('client_secret を持つサービスは env 未設定なら空文字', async () => {
    const cfgs = await freshConfigs();
    for (const svc of ['notion', 'canva', 'wordpress', 'atlassian']) {
      expect(cfgs[svc]?.clientSecret, svc).toBe('');
    }
  });

  // env を設定すればその値が通ること。`?? ''` を `&& ''` にする変異体は
  // ここで落ちる (設定済みでも空文字になってしまうため)。
  it('env を設定するとその値が clientId に入る', async () => {
    const KEY = 'GOOGLE_OAUTH_CLIENT_ID';
    const prev = process.env[KEY];
    process.env[KEY] = 'test-client-id-123';
    try {
      const cfgs = await freshConfigs();
      expect(cfgs.drive?.clientId).toBe('test-client-id-123');
      expect(cfgs.calendar?.clientId).toBe('test-client-id-123');
      expect(cfgs.gmail?.clientId).toBe('test-client-id-123');
    } finally {
      if (prev === undefined) delete process.env[KEY]; else process.env[KEY] = prev;
    }
  });

  it('env を設定するとその値が clientSecret に入る', async () => {
    const KEY = 'CANVA_OAUTH_CLIENT_SECRET';
    const prev = process.env[KEY];
    process.env[KEY] = 'test-secret-456';
    try {
      expect((await freshConfigs()).canva?.clientSecret).toBe('test-secret-456');
    } finally {
      if (prev === undefined) delete process.env[KEY]; else process.env[KEY] = prev;
    }
  });

  // client_secret を要求するのはどれか、を表そのものから固定する。
  // ここが狂うと「秘密を送らない public client」に秘密を送る / 逆に
  // 送るべき相手に送らない、のどちらかになる。
  it('client_secret を使うのは basic / body のサービスだけ', async () => {
    const withSecret = Object.entries(await freshConfigs())
      .filter(([, c]) => c?.clientAuth === 'basic' || c?.clientAuth === 'body')
      .map(([k]) => k)
      .sort();
    expect(withSecret).toEqual(['atlassian', 'canva', 'notion', 'wordpress']);
  });

  it('PKCE を使わないのは仕様上非対応の 3 つだけ', async () => {
    const noPkce = Object.entries(await freshConfigs())
      .filter(([, c]) => c?.pkce === false)
      .map(([k]) => k)
      .sort();
    expect(noPkce).toEqual(['atlassian', 'notion', 'wordpress']);
  });

  it('すべての authorizeUrl / tokenUrl が https', async () => {
    for (const [svc, c] of Object.entries(await freshConfigs())) {
      expect(String(c.authorizeUrl).startsWith('https://'), svc).toBe(true);
      expect(String(c.tokenUrl).startsWith('https://'), svc).toBe(true);
    }
  });
});
