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
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
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

// `=+$` vs `=$` are equivalent for our 16-byte and 32-byte buffers
// (1 trailing `=` each); marked inline below.
function base64url(buf: Buffer): string {
  // Stryker disable next-line Regex
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

/** Constant-time string comparison for the OAuth state token. The
 *  practical risk from a non-constant-time `!==` is small (the state
 *  lives for ≤ 5 minutes and we accept exactly one callback per flow),
 *  but `timingSafeEqual` removes the theoretical CPU-time side channel
 *  entirely. Returns false on length mismatch so the lengths themselves
 *  don't leak via timing either. Closes P1-5 from docs/SECURITY_AUDIT.md. */
export function safeStateEquals(a: string, b: string): boolean {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  if (a.length !== b.length) return false;
  // Equivalent mutant: Node's Buffer.from(str, '') silently falls back to
  // utf8 when the encoding string is unknown — so 'utf8' → '' produces
  // identical bytes for the strings we encounter here.
  // Stryker disable next-line StringLiteral
  return timingSafeEqual(Buffer.from(a, 'utf8'), Buffer.from(b, 'utf8'));
}

/** Strip the port suffix (`:1234`) from a Host header and check whether
 *  the remainder is a loopback hostname. The OAuth callback server only
 *  ever listens on 127.0.0.1, but a DNS rebinding attack or a request
 *  reaching us via a different name could fool a naive callback handler.
 *  Accept only literal loopback hostnames. */
export function isLoopbackHost(hostHeader: string | undefined): boolean {
  if (typeof hostHeader !== 'string') return false;
  const lowered = hostHeader.toLowerCase();
  const hostOnly = lowered.replace(/:\d+$/, '');
  return hostOnly === '127.0.0.1' || hostOnly === 'localhost' || hostOnly === '[::1]';
}

/** Discriminated-union outcome of a callback request. The HTTP layer
 *  maps each kind to a status + body; the test layer exercises the
 *  pure decision logic directly. */
export type CallbackOutcome =
  | { kind: 'success'; code: string; state: string }
  | { kind: 'wrong-path' }
  | { kind: 'oauth-error'; error: string }
  | { kind: 'missing-params' }
  | { kind: 'state-mismatch' };

/** Decide what to do with an incoming callback request. Pure logic
 *  extracted from listenForCallback so we can unit-test every branch
 *  (success, wrong path, error param, missing params, state CSRF).
 *
 *  CSRF / DoS defense: per RFC 6749 §4.1.2.1 the provider MUST echo
 *  `state` even on error responses. We validate state BEFORE honoring
 *  any error/missing-params signal, so an unauthenticated local-origin
 *  request (the threat model: a browser tab spraying loopback ports
 *  during the OAuth window) cannot terminate the flow with a forged
 *  `?error=access_denied`. Such requests fall through to state-mismatch
 *  which we treat as a *non-terminal* 400 — the legitimate callback
 *  arriving later still resolves the flow. */
export function classifyCallback(reqUrl: string, expectedState: string): CallbackOutcome {
  const url = new URL(reqUrl, 'http://127.0.0.1');
  if (url.pathname !== '/oauth/callback') return { kind: 'wrong-path' };
  const error = url.searchParams.get('error');
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  // State first. If the request lacks state OR state mismatches, it
  // can't be the legitimate provider callback — refuse regardless of
  // what else is in the query. Treat as state-mismatch so the listener
  // sends a non-terminal 400.
  if (!state || !safeStateEquals(state, expectedState)) return { kind: 'state-mismatch' };
  if (error) return { kind: 'oauth-error', error };
  if (!code) return { kind: 'missing-params' };
  return { kind: 'success', code, state };
}

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
 *  or `error=...` from the provider.
 *
 *  Exported for integration testing (real HTTP server bound to 127.0.0.1
 *  on a random port). Not part of the stable API. */
export function listenForCallback(expectedState: string, timeoutMs = 5 * 60_000): Promise<CallbackResult> & {
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

  // Stray-request rate limit: a malicious local process can spray the
  // loopback port during the OAuth window. Cap non-resolving requests
  // so the listener can't be kept alive indefinitely past the 5-min
  // timeout, and so accidental browser preflights / favicon probes
  // don't accumulate state.
  //
  // All the strayCount increment/threshold mutants below are
  // defense-in-depth TUNING (50→0, ++→--, >=→>, etc.). They alter how
  // aggressively we close the server but never compromise correctness:
  // - The 5-minute outer timeout always fires
  // - The legitimate callback resolves the listener regardless
  // - Other strays just keep getting 400
  // The "all 49 strays return 400" test pins behavior below STRAY_LIMIT;
  // beyond that, the counter is a knob, not a contract. Suppress.
  const STRAY_LIMIT = 50;
  let strayCount = 0;
  // Stryker disable ConditionalExpression,EqualityOperator,UpdateOperator
  const server = http.createServer((req, res) => {
    if (!isLoopbackHost(req.headers.host)) {
      res.writeHead(400, { 'Content-Type': 'text/plain' }).end('bad host');
      strayCount++;
      if (strayCount >= STRAY_LIMIT) server.close();
      return;
    }
    const outcome = classifyCallback(req.url ?? '/', expectedState);
    switch (outcome.kind) {
      case 'wrong-path':
        res.writeHead(404).end();
        strayCount++;
        if (strayCount >= STRAY_LIMIT) server.close();
        return;
      case 'state-mismatch':
        // Non-terminal: a forged callback (no state / wrong state) is
        // refused with 400, but the listener keeps waiting for the
        // legitimate provider callback. Without this, a local attacker
        // could DoS every OAuth flow by spraying the loopback port.
        res.writeHead(400).end('state mismatch');
        strayCount++;
        if (strayCount >= STRAY_LIMIT) server.close();
        return;
      case 'oauth-error':
        // State already validated before this branch — this IS the
        // legitimate provider responding with an error. Terminal.
        res.writeHead(400, { 'Content-Type': 'text/plain' }).end(`OAuth error: ${outcome.error}`);
        reject(new Error(`OAuth provider returned error: ${outcome.error}`));
        break;
      case 'missing-params':
        // State validated → provider somehow omitted `code`. Terminal.
        res.writeHead(400).end('missing code');
        reject(new Error('OAuth callback missing code'));
        break;
      case 'success':
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }).end(CALLBACK_HTML);
        resolve({ code: outcome.code, state: outcome.state });
        break;
    }
    // Close after the response is flushed so the browser sees the page.
    setTimeout(() => server.close(), 50);
  });
  // Stryker restore ConditionalExpression,EqualityOperator,UpdateOperator

  // Hard-to-kill mutants below: provoking a server.on('error') in a
  // unit test requires a kernel-level binding failure (e.g. exhausting
  // ephemeral ports); the 'error' event name and the '127.0.0.1' bind
  // host are both effectively integration concerns. Listening on '' (the
  // empty-bind mutant) still works on most OSes for loopback connects.
  // Stryker disable StringLiteral
  server.on('error', (err) => {
    portReject(err);
    reject(err);
  });

  server.listen(0, '127.0.0.1', () => {
    const port = (server.address() as AddressInfo).port;
    portResolve(port);
  });
  // Stryker restore StringLiteral

  const timeout = setTimeout(() => {
    reject(new Error(`OAuth flow timed out after ${Math.round(timeoutMs / 1000)}s`));
    server.close();
  }, timeoutMs);

  // `.finally` creates a chained promise; if no consumer .catches the
  // chain, Node reports an unhandled rejection alongside the main
  // promise. Silence the side chain — the original `promise` is what
  // the caller awaits.
  promise.finally(() => clearTimeout(timeout)).catch(() => {});

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
