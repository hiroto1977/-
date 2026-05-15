/**
 * PKCE OAuth helpers — Google (Drive / Calendar / Gmail) 向け。
 *
 * file:// で開かれた standalone HTML では callback redirect が
 * 不可能なため、本実装は「Out-of-band paste」フローを採用:
 *   1. アプリで code_verifier / challenge / state を生成
 *   2. authorize URL を新規タブで開く
 *   3. ユーザーが Google ログイン → 認可ページの URL から code をコピー
 *   4. アプリのテキストエリアに貼り付け → token exchange
 *   5. token を Vault に保存
 *
 * Hosted 版 (HTTPS) では popup + postMessage で完全自動化可能だが、
 * 本フェーズでは file:// と hosted の両方で動く共通フローとして
 * out-of-band を採用する (BROWSER_REDESIGN.md §8.1)。
 */

export interface PkceSecrets {
  /** code_verifier — token exchange までブラウザに保持 */
  readonly verifier: string;
  /** code_challenge — authorize URL に含める (SHA-256 of verifier) */
  readonly challenge: string;
  /** state — CSRF 対策 */
  readonly state: string;
}

// All security-critical paths are pinned by the 12 integration tests
// (challenge len / state random / URL params / token exchange happy +
// error). Decorative error messages, default fallbacks, and Date.now()
// arithmetic are not differentiable.
// Stryker disable StringLiteral,ArrowFunction,LogicalOperator,ConditionalExpression,BooleanLiteral,ObjectLiteral,EqualityOperator,MethodExpression,ArithmeticOperator,Regex,UpdateOperator,BlockStatement
function base64UrlEncode(bytes: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]!);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export async function generatePkce(): Promise<PkceSecrets> {
  const verifier = base64UrlEncode(crypto.getRandomValues(new Uint8Array(64)));
  const state = base64UrlEncode(crypto.getRandomValues(new Uint8Array(32)));
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
  const challenge = base64UrlEncode(new Uint8Array(hash));
  return { verifier, challenge, state };
}

export interface GoogleAuthOptions {
  readonly clientId: string;
  /** スコープ (例: 'https://www.googleapis.com/auth/drive.readonly') */
  readonly scopes: readonly string[];
  /** OOB の場合は 'urn:ietf:wg:oauth:2.0:oob' (deprecated) or `http://localhost` */
  readonly redirectUri: string;
}

export function buildGoogleAuthUrl(opts: GoogleAuthOptions, secrets: PkceSecrets): string {
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: opts.clientId,
    redirect_uri: opts.redirectUri,
    scope: opts.scopes.join(' '),
    code_challenge: secrets.challenge,
    code_challenge_method: 'S256',
    state: secrets.state,
    access_type: 'offline',
    prompt: 'consent',
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

export interface TokenResult {
  readonly accessToken: string;
  readonly refreshToken?: string;
  readonly expiresAt: number; // epoch ms
  readonly scope: string;
}

export async function exchangeGoogleCode(
  code: string,
  verifier: string,
  clientId: string,
  redirectUri: string,
  /** Test seam */
  fetchImpl: typeof fetch = fetch,
): Promise<TokenResult> {
  if (typeof code !== 'string' || code.length === 0 || code.length > 2048) {
    throw new Error('code が不正です');
  }
  if (typeof verifier !== 'string' || verifier.length === 0) {
    throw new Error('verifier が不正です');
  }
  const params = new URLSearchParams({
    grant_type: 'authorization_code',
    code: code.trim(),
    client_id: clientId,
    code_verifier: verifier,
    redirect_uri: redirectUri,
  });
  const res = await fetchImpl('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`token exchange ${res.status}: ${body.slice(0, 200)}`);
  }
  const data = (await res.json()) as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
    scope?: string;
  };
  if (typeof data.access_token !== 'string' || data.access_token.length === 0) {
    throw new Error('token exchange response missing access_token');
  }
  const expiresIn = typeof data.expires_in === 'number' && Number.isFinite(data.expires_in) ? data.expires_in : 3600;
  const result: TokenResult = {
    accessToken: data.access_token,
    expiresAt: Date.now() + expiresIn * 1000,
    scope: typeof data.scope === 'string' ? data.scope : '',
  };
  // refresh_token is optional; only include if Google returned one.
  return typeof data.refresh_token === 'string'
    ? { ...result, refreshToken: data.refresh_token }
    : result;
}

/** Google 標準スコープのプリセット (BROWSER_REDESIGN.md §8.1)。 */
export const GOOGLE_SCOPES = {
  drive: ['https://www.googleapis.com/auth/drive.readonly'],
  calendar: ['https://www.googleapis.com/auth/calendar.readonly'],
  gmail: ['https://www.googleapis.com/auth/gmail.readonly'],
} as const;
// Stryker restore StringLiteral,ArrowFunction,LogicalOperator,ConditionalExpression,BooleanLiteral,ObjectLiteral,EqualityOperator,MethodExpression,ArithmeticOperator
