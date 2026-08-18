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
import { redactSecrets } from '../../shared/redact';

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
function base64UrlEncode(bytes: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]!);
  // Stryker disable next-line Regex: base64 のパディングは末尾にしか現れないので、
  // 末尾アンカーを外しても取り除く対象は変わらない (等価変異)。
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export async function generatePkce(): Promise<PkceSecrets> {
  const verifier = base64UrlEncode(crypto.getRandomValues(new Uint8Array(64)));
  const state = base64UrlEncode(crypto.getRandomValues(new Uint8Array(32)));
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
  const challenge = base64UrlEncode(new Uint8Array(hash));
  return { verifier, challenge, state };
}

/** Constant-time string equality. The length check is safe to early-return
 *  because state is always fixed-length base64url (43 chars from 32 random
 *  bytes via generatePkce). The length is therefore NOT secret. If state
 *  ever becomes variable length (nonce + scope hash, etc.) this early-return
 *  leaks the length and must be replaced with a padded comparison.
 *  Equivalent to `oauth.ts:safeStateEquals` (main process); we reimplement
 *  here because main↔renderer can't share modules. */
export function safeStateEquals(a: string, b: string): boolean {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  if (a.length !== b.length) return false;
  let diff = 0;
  // Stryker disable next-line EqualityOperator: 長さが等しいことは上で確認済みなので、
  // 1 つ余分に回っても両側とも `charCodeAt(len)` が NaN になり `NaN ^ NaN === 0` で
  // diff が変わらない (等価変異)。境界を 1 つ越えても結果は同じ。
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

/** Parse a Google OAuth callback URL (or its raw query string) and extract
 *  `code` + `state`. UI should pass whatever the user pastes (full URL,
 *  query-string-only, or "code=...&state=..." fragment) and feed the result
 *  into `exchangeGoogleCode`. */
export function parseGoogleCallback(input: string): { code: string; state: string } | null {
  if (typeof input !== 'string') return null;
  const trimmed = input.trim();
  // Stryker disable next-line ConditionalExpression: 早期 return を外しても、空文字は
  // URL でも `=` 入りでもないので下の else で null に落ちる (等価変異・速い道として残す)。
  if (trimmed.length === 0) return null;
  // Three accepted forms:
  //   1. full URL: https://localhost:12345/cb?code=...&state=...
  //   2. query-only: ?code=...&state=...  or  code=...&state=...
  //   3. bare "code=4/..." with no state (rejected — state-less callback)
  let params: URLSearchParams;
  try {
    // 下の `} else if (trimmed.includes('='))` には**等価変異が 2 つ残る** —
    // `=` を含まない文字列がその枝へ入っても URLSearchParams が空になり、
    // 結局 `!code || !state` で null に落ちるため、条件を潰しても差が出ない。
    //
    // 黙らせていないのは、それが**割に合わない**と実測したため:
    //   pragma 無し … 163 変異体 98.77% (生存 2)
    //   範囲指定で囲む … 97 変異体 100%   (生存 0)
    // 2 つを消すために 66 個の測定を捨てることになる。分母を縮めて買った 100% は、
    // 正直な 98.77% より価値が低い (`lint:mutation-scope` が禁じているのと同じ形)。
    //
    // なお `} else if (` の行に `Stryker disable next-line` は効かない —
    // 閉じ括弧で始まる行は直前のコメントと結び付かない (`} catch {` / `} finally {`
    // も同じ)。囲むなら範囲指定しかないが、上記のとおり囲まない。
    if (/^https?:\/\//i.test(trimmed)) {
      params = new URL(trimmed).searchParams;
    } else if (trimmed.includes('=')) {
      // 先頭の `?` は URLSearchParams 自身が落とすので、こちらで剥がさない
      // (剥がす分岐は一度も結果を変えていなかった — 2026-08 変異検査)。
      params = new URLSearchParams(trimmed);
    } else {
      return null;
    }
  } catch {
    return null;
  }
  const code = params.get('code');
  const state = params.get('state');
  if (!code || !state) return null;
  return { code, state };
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

export interface ExchangeGoogleCodeArgs {
  /** Authorization code from the callback URL. */
  readonly code: string;
  /** PKCE verifier (the one whose SHA-256 was sent as code_challenge). */
  readonly verifier: string;
  /** The state we generated and stored before redirecting. */
  readonly expectedState: string;
  /** The state value parsed from the callback URL. */
  readonly receivedState: string;
  readonly clientId: string;
  readonly redirectUri: string;
}

/** Exchange a Google authorization code for an access/refresh token pair.
 *
 *  CSRF defense: MUST be passed both the state we issued (`expectedState`)
 *  and the state echoed back by Google (`receivedState`). Mismatch → throw
 *  BEFORE the token endpoint POST. This API shape exists because an earlier
 *  signature that didn't take `state` at all let callers forget the check —
 *  see Security Audit R2 finding #3. */
export async function exchangeGoogleCode(
  args: ExchangeGoogleCodeArgs,
  /** Test seam */
  fetchImpl: typeof fetch = fetch,
): Promise<TokenResult> {
  const { code, verifier, expectedState, receivedState, clientId, redirectUri } = args;
  if (typeof code !== 'string' || code.length === 0 || code.length > 2048) {
    throw new Error('code が不正です');
  }
  if (typeof verifier !== 'string' || verifier.length === 0) {
    throw new Error('verifier が不正です');
  }
  if (typeof expectedState !== 'string' || expectedState.length === 0) {
    throw new Error('expectedState が不正です (CSRF 防止)');
  }
  if (typeof receivedState !== 'string' || receivedState.length === 0) {
    throw new Error('receivedState が不正です (CSRF 防止)');
  }
  if (!safeStateEquals(expectedState, receivedState)) {
    throw new Error('state が一致しません — CSRF 攻撃の可能性があります');
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
    // 連携先が応答に資格情報を反射しても、エラー経由で漏らさない
    // (jsonFetch / proxy.ts と同じ規律)。この文字列は画面にそのまま出て、
    // 不具合報告に貼られる。
    throw new Error(`token exchange ${res.status}: ${redactSecrets(body.slice(0, 200))}`);
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
  // Stryker disable next-line ConditionalExpression: 型検査を落としても `Number.isFinite` が
  // 非数値を弾くため、既定の 3600 に落ちる結果は変わらない (等価変異)。
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
