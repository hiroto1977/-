/**
 * Generic OAuth 2.0 Authorization Code flow with PKCE (RFC 7636) for
 * desktop apps (RFC 8252). The flow:
 *
 *   1. main spins up a loopback HTTP server on 127.0.0.1:<random>
 *   2. opens the provider's authorize URL in the user's default browser
 *   3. provider redirects back to 127.0.0.1:<port>/oauth/callback?code=...
 *   4. main exchanges code → { access_token, refresh_token, expires_in }
 *   5. caller persists the TokenSet via secrets.ts
 *
 * Only the parts that are truly side-effecting (browser launch, HTTP
 * server) live here. PKCE generation, URL building, and token request
 * body construction are pure functions and exported for unit tests.
 */

import { shell } from 'electron';
import http from 'node:http';
import { AddressInfo } from 'node:net';
import { createHash, randomBytes } from 'node:crypto';
import type { ServiceId } from '../shared/serviceId';

export interface OAuthConfig {
  authorizeUrl: string;
  tokenUrl: string;
  clientId: string;
  scopes: string[];
  /** Some providers (Google) take space-delimited scopes; others use commas. */
  scopeDelimiter?: string;
  /** Extra query params for the authorize URL (e.g. Google's
   *  `access_type=offline` + `prompt=consent` to get refresh tokens). */
  extraAuthParams?: Record<string, string>;
}

export interface TokenSet {
  accessToken: string;
  refreshToken?: string;
  /** Unix ms when the access token expires. */
  expiresAt?: number;
  /** Granted scopes echoed back from the provider, if any. */
  scope?: string;
  tokenType?: string;
}

/** Provider-side response from a token endpoint. */
interface TokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  scope?: string;
  token_type?: string;
}

/** Loaded by main.ts. Adding a service is just a new entry here. */
export const OAUTH_CONFIGS: Partial<Record<ServiceId, OAuthConfig>> = {
  // Google services share one OAuth 2.0 client (registered as "Desktop app"
  // in https://console.cloud.google.com/apis/credentials). Set
  // GOOGLE_OAUTH_CLIENT_ID in the env to enable.
  drive: {
    authorizeUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
    tokenUrl: 'https://oauth2.googleapis.com/token',
    clientId: process.env.GOOGLE_OAUTH_CLIENT_ID ?? '',
    scopes: ['https://www.googleapis.com/auth/drive'],
    extraAuthParams: { access_type: 'offline', prompt: 'consent' },
  },
  calendar: {
    authorizeUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
    tokenUrl: 'https://oauth2.googleapis.com/token',
    clientId: process.env.GOOGLE_OAUTH_CLIENT_ID ?? '',
    scopes: [
      'https://www.googleapis.com/auth/calendar',
      'https://www.googleapis.com/auth/calendar.events',
    ],
    extraAuthParams: { access_type: 'offline', prompt: 'consent' },
  },
  gmail: {
    authorizeUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
    tokenUrl: 'https://oauth2.googleapis.com/token',
    clientId: process.env.GOOGLE_OAUTH_CLIENT_ID ?? '',
    scopes: [
      'https://www.googleapis.com/auth/gmail.modify',
      'https://www.googleapis.com/auth/gmail.compose',
    ],
    extraAuthParams: { access_type: 'offline', prompt: 'consent' },
  },
};

export function isOAuthSupported(serviceId: ServiceId): boolean {
  const cfg = OAUTH_CONFIGS[serviceId];
  return Boolean(cfg && cfg.clientId);
}

// --- pure helpers (unit-testable) ---------------------------------------

function base64url(buf: Buffer): string {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function generatePkce(): { verifier: string; challenge: string } {
  const verifier = base64url(randomBytes(32));
  const challenge = base64url(createHash('sha256').update(verifier).digest());
  return { verifier, challenge };
}

export function buildAuthorizeUrl(
  config: OAuthConfig,
  redirectUri: string,
  state: string,
  challenge: string,
): string {
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: config.clientId,
    redirect_uri: redirectUri,
    scope: config.scopes.join(config.scopeDelimiter ?? ' '),
    state,
    code_challenge: challenge,
    code_challenge_method: 'S256',
    ...(config.extraAuthParams ?? {}),
  });
  return `${config.authorizeUrl}?${params.toString()}`;
}

export function buildTokenExchangeBody(
  config: OAuthConfig,
  redirectUri: string,
  code: string,
  verifier: string,
): URLSearchParams {
  return new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: redirectUri,
    client_id: config.clientId,
    code_verifier: verifier,
  });
}

export function buildRefreshBody(config: OAuthConfig, refreshToken: string): URLSearchParams {
  return new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
    client_id: config.clientId,
  });
}

export function tokenResponseToSet(raw: TokenResponse, fallbackRefresh?: string): TokenSet {
  const expiresIn = raw.expires_in ?? 0;
  return {
    accessToken: raw.access_token,
    refreshToken: raw.refresh_token ?? fallbackRefresh,
    expiresAt: expiresIn > 0 ? Date.now() + expiresIn * 1000 : undefined,
    scope: raw.scope,
    tokenType: raw.token_type,
  };
}

// --- side-effecting flows -----------------------------------------------

const CALLBACK_HTML = `<!doctype html><html><head><meta charset="utf-8"><title>Service Hub</title>
<style>body{font-family:system-ui;background:#0f1117;color:#e6e8ee;display:flex;align-items:center;justify-content:center;height:100vh;margin:0}
.box{text-align:center;padding:32px 48px;border:1px solid #232936;border-radius:12px;background:#161a22}
h1{margin:0 0 8px;font-size:18px}p{margin:0;color:#8a93a6;font-size:13px}</style></head>
<body><div class="box"><h1>認証完了</h1><p>このタブは閉じて Service Hub に戻ってください。</p></div></body></html>`;

interface CallbackResult {
  code: string;
  state: string;
}

/** Listen on 127.0.0.1:0 for the OAuth redirect. Resolves with the
 *  `code` parameter once we get it; rejects on timeout, server error,
 *  or `error=...` from the provider. */
function listenForCallback(expectedState: string, timeoutMs = 5 * 60_000): Promise<CallbackResult> & {
  port: () => Promise<number>;
  cancel: () => void;
} {
  let resolve!: (r: CallbackResult) => void;
  let reject!: (err: Error) => void;
  const promise = new Promise<CallbackResult>((res, rej) => {
    resolve = res;
    reject = rej;
  });

  let portResolve!: (n: number) => void;
  let portReject!: (err: Error) => void;
  const portPromise = new Promise<number>((res, rej) => {
    portResolve = res;
    portReject = rej;
  });

  const server = http.createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://127.0.0.1');
    if (url.pathname !== '/oauth/callback') {
      res.writeHead(404).end();
      return;
    }
    const error = url.searchParams.get('error');
    const code = url.searchParams.get('code');
    const state = url.searchParams.get('state');

    if (error) {
      res.writeHead(400, { 'Content-Type': 'text/plain' }).end(`OAuth error: ${error}`);
      reject(new Error(`OAuth provider returned error: ${error}`));
    } else if (!code || !state) {
      res.writeHead(400).end('missing code/state');
      reject(new Error('OAuth callback missing code or state'));
    } else if (state !== expectedState) {
      res.writeHead(400).end('state mismatch');
      reject(new Error('OAuth state mismatch (possible CSRF)'));
    } else {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }).end(CALLBACK_HTML);
      resolve({ code, state });
    }

    // Close after the response is flushed so the browser sees the page.
    setTimeout(() => server.close(), 50);
  });

  server.on('error', (err) => {
    portReject(err);
    reject(err);
  });

  server.listen(0, '127.0.0.1', () => {
    const port = (server.address() as AddressInfo).port;
    portResolve(port);
  });

  const timeout = setTimeout(() => {
    reject(new Error(`OAuth flow timed out after ${Math.round(timeoutMs / 1000)}s`));
    server.close();
  }, timeoutMs);

  promise.finally(() => clearTimeout(timeout));

  return Object.assign(promise, {
    port: () => portPromise,
    cancel: () => {
      reject(new Error('OAuth flow cancelled'));
      server.close();
    },
  });
}

export type FetchFn = typeof fetch;

/** Run the full Authorization Code + PKCE flow for one service. */
export async function authorize(config: OAuthConfig, fetchFn: FetchFn = fetch): Promise<TokenSet> {
  if (!config.clientId) {
    throw new Error('OAuth client ID is not configured for this service');
  }
  const { verifier, challenge } = generatePkce();
  const state = base64url(randomBytes(16));

  const listener = listenForCallback(state);
  const port = await listener.port();
  const redirectUri = `http://127.0.0.1:${port}/oauth/callback`;
  const authorizeUrl = buildAuthorizeUrl(config, redirectUri, state, challenge);

  await shell.openExternal(authorizeUrl);

  const { code } = await listener;

  const res = await fetchFn(config.tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: buildTokenExchangeBody(config, redirectUri, code, verifier).toString(),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Token exchange failed (${res.status}): ${body.slice(0, 200)}`);
  }
  const raw = (await res.json()) as TokenResponse;
  return tokenResponseToSet(raw);
}

/** Refresh an access token. Returns a fresh TokenSet (carrying over the
 *  refresh_token if the provider didn't issue a new one — Google's
 *  default behavior). */
export async function refresh(
  config: OAuthConfig,
  current: TokenSet,
  fetchFn: FetchFn = fetch,
): Promise<TokenSet> {
  if (!current.refreshToken) {
    throw new Error('no refresh token available');
  }
  const res = await fetchFn(config.tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: buildRefreshBody(config, current.refreshToken).toString(),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Token refresh failed (${res.status}): ${body.slice(0, 200)}`);
  }
  const raw = (await res.json()) as TokenResponse;
  return tokenResponseToSet(raw, current.refreshToken);
}
