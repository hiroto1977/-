import { describe, expect, it, vi } from 'vitest';
import {
  buildAuthorizeUrl,
  buildRefreshBody,
  buildTokenExchangeBody,
  generatePkce,
  refresh,
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

    const [url, init] = fetchMock.mock.calls[0];
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
});
