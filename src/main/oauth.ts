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
import { constantTimeEquals } from '../shared/constantTimeEquals';
import type { ServiceId } from '../shared/serviceId';
import { redactForMessage, MAX_RESPONSE_BODY_IN_MESSAGE } from '../shared/redact';
import { parseTokenResponse, type TokenResponseFields } from '../shared/tokenResponse';
import { externalUrlOrNull } from '../shared/externalUrlGate';
import {
  DEFAULT_HTTP_TIMEOUT_MS,
  egressInit,
  isRedirectResponse,
  MAX_HTTP_RESPONSE_BYTES,
  readBodyWithCap,
  readFailureBody,
  redirectRefusal,
  withTimeout,
} from '../shared/httpLimits';

/**
 * Refuse to talk to a non-HTTPS OAuth endpoint. Today every OAUTH_CONFIGS entry
 * hardcodes https and the IPC layer only lets the renderer override `clientId`,
 * so this is unreachable — it is a standing guard so a future config (or a test
 * fixture copied into prod) can never send credentials in cleartext.
 * RFC 8252 §8.3.
 *
 * ## 2 つの宛先に同じ関門を通す (2026-08-22)
 *
 * 以前このガードは**トークン端点にしか掛かっていなかった**。認可 URL は
 * 「全 config がハードコード https」という検査だけで守られていて、
 * **常設ガードは無かった** —— 同じ理由書きが片方にしか適用されていない。
 *
 * 認可 URL のほうが軽いわけではない:
 *
 * - `state` (CSRF トークン) と `client_id` を載せて出ていく
 * - `shell` へ**そのまま渡す** —— `externalUrlGate.ts` の関門を通る
 *   2 つの扉と違い、ここは `lint:forbidden` の allowFile で例外にしてある
 *   唯一の呼び出し口である。その例外の理由は「URL は我々が組み立てたもの」だが、
 *   **組み立ての材料が https である保証**は今まで検査の中にしか無かった
 *
 * 同じ問い (この宛先へ資格情報を載せて出てよいか) なので、実装も 1 つにする。
 * 引数の `role` は文言のためだけにあり、判定は両方で同一である。
 */
function assertHttpsEndpoint(url: string, role: 'token' | 'authorization'): void {
  /*
   * **解析してから判定する。字面では判定しない。** (2026-09-15 · パス 291)
   *
   * ここは 2026-09-15 まで `url.startsWith('https://')` だった ——
   * つまり `externalUrlGate.ts` の docblock が**20 行かけて「これは誤りだ」と
   * 説明している、その述語**である。あちらはブラウザ版が持っていた
   * `/^https?:\/\//i` を「字面は `https://` で始まるので通るが、実際に開くのは
   * 解析後の URL で、検査した文字列とは別物になりうる」と述べて捨てた。
   *
   * 実測 (2026-09-15・6 形を両方の述語に通した。**5 形で答えが割れた**):
   *
   *   形                              startsWith  解析して判定  解析後の origin
   *   https://accounts.google.com/…   通す        通す          https://accounts.google.com
   *   https://<LF>javascript:alert(1) 通す        断る          (解析不能)
   *   https://<NUL>evil               通す        断る          (解析不能)
   *   https://accounts.google.com@evil.example/…
   *                                   通す        断る          **https://evil.example**
   *   https://user:pw@evil.example/…  通す        断る          **https://evil.example**
   *   https://                        通す        断る          (解析不能)
   *
   * 4 つ目が要点である。`externalUrlGate.ts` が userinfo の判定を足した理由に
   * 挙げている例と**同じホスト**で、頭から読むと Google だが送り先は
   * `evil.example` である。`tokenUrl` にこの形が入れば
   * **client_secret と code をそこへ POST する**。
   *
   * **今日は悪用できない** —— `OAUTH_CONFIGS` の 9 つの `authorizeUrl` /
   * `tokenUrl` はすべてソース中の `https://…` リテラルで、実行時に差し替わる
   * 道が無い (実測)。だからこれは**深さの守りと述語の一貫性**の直しである。
   * ただし上の docblock が自分で書いているとおり、以前ここは
   * 「全 config がハードコード https」という**検査の中だけの保証**に頼って
   * いた。常設ガードへ移したとき、選んだ述語が弱いままだった。
   *
   * `externalUrlOrNull` を使わないのは**問いが違う**から ——
   * あちらは「OS に URL を開かせてよいか」で、ここは「この宛先へ資格情報を
   * 載せて出てよいか」である (`tokenUrl` は `fetch` の相手で、OS へは渡らない)。
   * userinfo を落とす式は `proxyEndpoint.ts` / `aiEndpoint.ts` /
   * `externalUrlGate.ts` が既に同じ形で持っており、これで 4 つ目になる ——
   * **統合しないのは 4 つが別の問いに答えているためで**、
   * `shared/__tests__/loopbackChecks.test.ts` がループバック判定 3 つについて
   * 同じ判断を記録している。
   */
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error(`OAuth ${role} endpoint must use https`);
  }
  if (parsed.protocol !== 'https:') {
    throw new Error(`OAuth ${role} endpoint must use https`);
  }
  if (parsed.username !== '' || parsed.password !== '') {
    throw new Error(`OAuth ${role} endpoint must not embed credentials in the URL`);
  }
}

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
  /** RFC 7636 PKCE. Defaults to **true** — that is the only mode a public
   *  client should ever use. Set to `false` ONLY for providers whose own
   *  documentation does not describe `code_challenge` (Notion,
   *  WordPress.com, Atlassian 3LO). Sending a challenge such a server
   *  never recorded, and then a `code_verifier` it cannot validate, is a
   *  good way to get an opaque `invalid_request` back. */
  pkce?: boolean;
  /** Confidential-client secret, for the providers that flatly refuse a
   *  token exchange without one (Notion / Canva / WordPress.com /
   *  Atlassian). Read from the environment exactly like `clientId` —
   *  never hardcoded, and never reachable from the renderer: the
   *  `oauth:authorize` IPC handler only lets the UI override `clientId`.
   *
   *  RFC 8252 §8.5 is right that a secret shipped inside a desktop
   *  binary is not a secret. It is nonetheless the only credential these
   *  four providers accept, so we let the *operator* supply their own
   *  registered app's secret via env rather than embedding one. */
  clientSecret?: string;
  /** How client credentials reach the token endpoint. RFC 6749 §2.3.1:
   *  a client MUST NOT use more than one authentication method, hence
   *  the three-way choice rather than "always send both".
   *   - `'none'` (default) — public client; only `client_id` in the body.
   *   - `'basic'` — HTTP Basic `base64(client_id:client_secret)` header,
   *     nothing in the body (Notion, Canva).
   *   - `'body'`  — `client_id` + `client_secret` as form fields
   *     (WordPress.com, Atlassian). */
  clientAuth?: 'none' | 'basic' | 'body';
  /** Wire format of the token-endpoint request body. Defaults to
   *  `'form'` (`application/x-www-form-urlencoded`, what RFC 6749 §4.1.3
   *  mandates). Notion is the outlier: its `/v1/oauth/token` documents a
   *  JSON body. */
  tokenBodyFormat?: 'form' | 'json';
  /** Extra headers for the token request (Notion wants its API-version
   *  header). Merged after `Content-Type` / `Authorization`. */
  extraTokenHeaders?: Record<string, string>;
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

/**
 * Provider-side response from a token endpoint. **`shared/tokenResponse.ts` の
 * 検証済みの形そのもの** —— ここで宣言を写すと、写しがずれた日に `as` が黙る
 * (パス 260 で外した `JSON.parse(…) as TokenResponse` がその形だった)。
 */
type TokenResponse = TokenResponseFields;

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
  // freee 会計 — OAuth 2.0 (Authorization Code + PKCE)。freee アプリストアで
  // アプリを登録し FREEE_OAUTH_CLIENT_ID を env に設定すると有効になる。
  freee: {
    authorizeUrl: 'https://accounts.secure.freee.co.jp/public_api/authorize',
    tokenUrl: 'https://accounts.secure.freee.co.jp/public_api/token',
    clientId: process.env.FREEE_OAUTH_CLIENT_ID ?? '',
    scopes: ['read'],
  },
  // Microsoft 365 (Microsoft Graph) — Azure AD (Entra ID) の OAuth 2.0 +
  // PKCE。Azure ポータルでアプリ登録し MS365_OAUTH_CLIENT_ID を env に設定。
  // 個人/組織どちらも許可する common テナントを使用。
  'microsoft-365': {
    authorizeUrl: 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize',
    tokenUrl: 'https://login.microsoftonline.com/common/oauth2/v2.0/token',
    clientId: process.env.MS365_OAUTH_CLIENT_ID ?? '',
    scopes: [
      'User.Read',
      'Mail.Read',
      'Mail.Send',
      'Calendars.Read',
      'Calendars.ReadWrite',
      'offline_access',
    ],
  },
  // Slack — OAuth V2 + PKCE。Slack アプリの設定で PKCE を有効化すると
  // *public client* 扱いになり、トークン交換で client_secret を送らない
  // (むしろ送ってはいけない) 構成になる。SLACK_OAUTH_CLIENT_ID を env に設定。
  // 出典: https://docs.slack.dev/authentication/using-pkce/
  //       https://docs.slack.dev/authentication/installing-with-oauth/
  // 注意: PKCE を有効化すると refresh token の寿命が 30 日になり、この操作は
  //       Slack サポート経由でしか取り消せない (一方通行)。
  slack: {
    authorizeUrl: 'https://slack.com/oauth/v2/authorize',
    // oauth.v2.access は Web API メソッドなので https://slack.com/api/ 配下。
    tokenUrl: 'https://slack.com/api/oauth.v2.access',
    clientId: process.env.SLACK_OAUTH_CLIENT_ID ?? '',
    // Slack はスコープを **カンマ区切り** で受け取る (公式 SDK の
    // AuthorizeUrlGenerator も ",".join している)。
    scopeDelimiter: ',',
    // `scope` = **bot** スコープ。ここで要求した権限が bot トークン (xoxb-) に
    // 付き、oauth.v2.access レスポンスの *トップレベル* access_token として
    // 返る = tokenResponseToSet がそのまま読める形。読み取り
    // (conversations.list / team.info) + chat.postMessage アクション分。
    scopes: ['channels:read', 'groups:read', 'team:read', 'chat:write'],
    // `user_scope` は **user** トークン (xoxp-) 用の別枠で、そちらは
    // レスポンスの authed_user.access_token に入る。本アプリは bot トークン
    // だけを使うので明示的に空で要求する (公式 SDK と同じ挙動)。
    extraAuthParams: { user_scope: '' },
  },
  // Notion — 公開インテグレーションの OAuth 2.0。
  // 出典: https://developers.notion.com/guides/get-started/authorization
  //       https://developers.notion.com/reference/create-a-token
  // 固有の作法が 3 つある:
  //   1. PKCE 非対応 (公式ドキュメントに code_challenge の記載が無い)
  //   2. トークン交換は client_id:client_secret の HTTP Basic 認証
  //   3. トークンエンドポイントのボディは **JSON**
  // スコープの概念は無く、権限はインテグレーション側の capabilities と
  // 認可時にユーザーが選んだページで決まる。
  notion: {
    authorizeUrl: 'https://api.notion.com/v1/oauth/authorize',
    tokenUrl: 'https://api.notion.com/v1/oauth/token',
    clientId: process.env.NOTION_OAUTH_CLIENT_ID ?? '',
    clientSecret: process.env.NOTION_OAUTH_CLIENT_SECRET ?? '',
    clientAuth: 'basic',
    tokenBodyFormat: 'json',
    pkce: false,
    scopes: [],
    // owner=user は必須。ユーザーがワークスペースとページを選んで認可する。
    extraAuthParams: { owner: 'user' },
    // clients/notion.ts が固定している API バージョンと揃える。
    extraTokenHeaders: { 'Notion-Version': '2022-06-28' },
  },
  // Canva Connect API — Authorization Code + PKCE (S256 必須)。ただし
  // トークンエンドポイントは client_id / client_secret によるクライアント
  // 認証も必須で (Basic 認証が推奨)、ブラウザから直接は叩けない。
  // 出典: https://www.canva.dev/docs/connect/authentication/
  //       https://www.canva.dev/docs/connect/api-reference/authentication/generate-access-token/
  //       スコープ名は Canva 公式 OpenAPI spec の oauthAuthCode securityScheme
  //       (canva-sdks/canva-connect-api-starter-kit openapi/spec.yml) で確認。
  canva: {
    authorizeUrl: 'https://www.canva.com/api/oauth/authorize',
    tokenUrl: 'https://api.canva.com/rest/v1/oauth/token',
    clientId: process.env.CANVA_OAUTH_CLIENT_ID ?? '',
    clientSecret: process.env.CANVA_OAUTH_CLIENT_SECRET ?? '',
    clientAuth: 'basic',
    // GET /v1/designs = design:meta:read、POST /v1/folders = folder:write
    // (create-folder アクション用)。/v1/brand-kits は公開 spec に無く必要な
    // スコープを確定できないため要求しない — clients/canva.ts 側が 403/404 を
    // 握り潰して縮退する設計になっている。
    scopes: ['design:meta:read', 'folder:write'],
  },
  // WordPress.com — OAuth 2.0 Authorization Code。PKCE の記載は無く、
  // トークン交換に client_secret が必須。`global` スコープで /me/sites を
  // 含む全サイトにアクセスできる (`auth` は /me/ のみの限定スコープ)。
  // 出典: https://developer.wordpress.com/docs/api/oauth2/
  wordpress: {
    authorizeUrl: 'https://public-api.wordpress.com/oauth2/authorize',
    tokenUrl: 'https://public-api.wordpress.com/oauth2/token',
    clientId: process.env.WPCOM_OAUTH_CLIENT_ID ?? '',
    clientSecret: process.env.WPCOM_OAUTH_CLIENT_SECRET ?? '',
    clientAuth: 'body',
    pkce: false,
    scopes: ['global'],
  },
  // Atlassian (Jira / Confluence Cloud) — OAuth 2.0 (3LO)。PKCE 非対応で
  // client_secret 必須。authorize URL の audience=api.atlassian.com と
  // prompt=consent は **必須クエリ**、offline_access を要求すると
  // refresh_token (ローテーション式) が返る。
  // 出典: https://developer.atlassian.com/cloud/oauth/getting-started/implementing-oauth-3lo/
  //       https://developer.atlassian.com/cloud/jira/platform/scopes-for-oauth-2-3LO-and-forge-apps/
  atlassian: {
    authorizeUrl: 'https://auth.atlassian.com/authorize',
    tokenUrl: 'https://auth.atlassian.com/oauth/token',
    clientId: process.env.ATLASSIAN_OAUTH_CLIENT_ID ?? '',
    clientSecret: process.env.ATLASSIAN_OAUTH_CLIENT_SECRET ?? '',
    clientAuth: 'body',
    pkce: false,
    // read:jira-work = Jira の課題/プロジェクト読み取り (classic scope)。
    scopes: ['read:jira-work', 'offline_access'],
    extraAuthParams: { audience: 'api.atlassian.com', prompt: 'consent' },
  },
};

/** True when the provider will not exchange a code without a client
 *  secret. Derived from `clientAuth` rather than from "is clientSecret
 *  set", so a half-configured provider fails loudly instead of silently
 *  posting an empty secret. */
export function requiresClientSecret(config: OAuthConfig): boolean {
  return config.clientAuth === 'basic' || config.clientAuth === 'body';
}

/** PKCE is on unless a config explicitly opts out. */
export function usesPkce(config: OAuthConfig): boolean {
  return config.pkce !== false;
}

export function isOAuthSupported(serviceId: ServiceId): boolean {
  const cfg = OAUTH_CONFIGS[serviceId];
  if (!cfg || !cfg.clientId) return false;
  // A confidential-client provider with no secret configured is not
  // "supported" — offering the button would only produce a token-endpoint
  // 401 after the user has already granted consent in the browser.
  return !requiresClientSecret(cfg) || Boolean(cfg.clientSecret);
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
    // Notion has no scope concept at all; sending `scope=` to a provider
    // that never defined the parameter is noise at best.
    ...(config.scopes.length > 0
      ? { scope: config.scopes.join(config.scopeDelimiter ?? ' ') }
      : {}),
    state,
    ...(usesPkce(config) ? { code_challenge: challenge, code_challenge_method: 'S256' } : {}),
    ...(config.extraAuthParams ?? {}),
  });
  return `${config.authorizeUrl}?${params.toString()}`;
}

/** Which client credentials belong in the token-request *body*, given the
 *  provider's authentication method. Basic-auth providers get nothing
 *  here — their credentials ride in the Authorization header, and
 *  duplicating them is exactly what RFC 6749 §2.3.1 forbids. */
function clientCredentialParams(config: OAuthConfig): Record<string, string> {
  if (config.clientAuth === 'basic') return {};
  if (config.clientAuth === 'body') {
    return { client_id: config.clientId, client_secret: config.clientSecret ?? '' };
  }
  return { client_id: config.clientId };
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
    ...clientCredentialParams(config),
    ...(usesPkce(config) ? { code_verifier: verifier } : {}),
  });
}

export function buildRefreshBody(config: OAuthConfig, refreshToken: string): URLSearchParams {
  return new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
    ...clientCredentialParams(config),
  });
}

/** Headers for a token-endpoint POST: the body's content type, plus HTTP
 *  Basic client authentication when the provider requires it. */
export function buildTokenRequestHeaders(config: OAuthConfig): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type':
      config.tokenBodyFormat === 'json'
        ? 'application/json'
        : 'application/x-www-form-urlencoded',
  };
  if (config.clientAuth === 'basic') {
    const credentials = `${config.clientId}:${config.clientSecret ?? ''}`;
    // Stryker disable next-line StringLiteral: `'utf8'` を空にしても Node は utf8 へ
    // 落とすため同じ base64 になる (実測: Buffer.from('a:b','') === Buffer.from('a:b','utf8'))。
    headers.Authorization = `Basic ${Buffer.from(credentials, 'utf8').toString('base64')}`;
  }
  return { ...headers, ...(config.extraTokenHeaders ?? {}) };
}

/** Serialize a token-request parameter bag to the wire format the
 *  provider expects. Form-encoded per RFC 6749 §4.1.3 unless the config
 *  opts into JSON (Notion). */
export function serializeTokenBody(config: OAuthConfig, params: URLSearchParams): string {
  if (config.tokenBodyFormat === 'json') {
    return JSON.stringify(Object.fromEntries(params));
  }
  return params.toString();
}

export function tokenResponseToSet(raw: TokenResponse, fallbackRefresh?: string): TokenSet {
  const expiresIn = raw.expires_in ?? 0;
  // **足した結果を見る。** `expires_in` が有限でも `Date.now() + 1e308 * 1000` は
  // `Infinity` で、`JSON.stringify` はそれを `null` にする —— 読み戻すと
  // 「期限が記録されていない」になり 1 度も更新しない (パス 260 で実測)。
  // 入口の欄と、計算した量は**別の量**なので、それぞれの場所で見る (パス 57)。
  const expiresAt = Date.now() + expiresIn * 1000;
  return {
    accessToken: raw.access_token,
    refreshToken: raw.refresh_token ?? fallbackRefresh,
    expiresAt: expiresIn > 0 && Number.isFinite(expiresAt) ? expiresAt : undefined,
    scope: raw.scope,
    tokenType: raw.token_type,
  };
}

// --- side-effecting flows -----------------------------------------------

/**
 * OAuth の state の定時間比較。**規則は `shared/constantTimeEquals.ts` に 1 つ**
 * (2026-09-20 · パス 331)。`docs/SECURITY_AUDIT.md` の P1-5 を閉じる。
 *
 * ## ここに在った実装を捨てた理由
 *
 * 2026-08-22 の版は `Buffer.from(s, 'utf8')` → `timingSafeEqual` で、
 * ブラウザ版 (`renderer/oauth/pkce.ts`) にはコード単位を XOR する双子が在った。
 * その双子の docblock は「等価」と書いていたが、**等価ではなかった** ——
 * UTF-8 への変換は**孤立サロゲートをすべて U+FFFD へ潰す**ので、
 * `'\uD800'` と `'\uDC00'` を **main だけが「等しい」と答える**。
 * 実測 (2026-09-20): サロゲート帯を跨ぐ 1 文字の総当たり 4,330,561 組のうち
 * **4,192,256 組 (96.8%)** で答えが割れた (base64url の字だけなら 0 組)。
 *
 * 今日この差から攻撃は成立しない —— 比較の片側 `expectedState` は必ず
 * このアプリが作った base64url だからである。直したのは、**守りの正しさが
 * 「片側は必ず自分が作った値」という別の前提に依っていた**ためで、
 * 潰れの無い側へ揃えれば前提ごと要らなくなる。
 *
 * ## バイト長の判定を消してよい理由
 *
 * 旧実装が `ab.length !== bb.length` を置いていたのは、`timingSafeEqual` が
 * バイト長の違いで **RangeError を投げる**からだった (43 文字の state に
 * 全角を 1 つ混ぜた偽コールバックで主プロセスごと落ちる · 2026-08-22 実測)。
 * `timingSafeEqual` を使わなくなったので、その投げる口ごと無くなった。
 *
 * ## state の長さ (実測・2026-09-20)
 *
 * この注記は長らく「state は 32 バイト乱数の base64url」と書いていたが、
 * **main の実物は 16 バイト** (`base64url(randomBytes(16))` → 22 字) である。
 * 32 バイトはブラウザ版の値で、そちらの注記から写されたまま突き合わせられて
 * いなかった。結論 (固定長だから長さは秘密でない) は両方で成り立つ。
 */
export const safeStateEquals = constantTimeEquals;

/** Strip the port suffix (`:1234`) from a Host header and check whether
 *  the remainder is a loopback hostname. The OAuth callback server only
 *  ever listens on 127.0.0.1, but a DNS rebinding attack or a request
 *  reaching us via a different name could fool a naive callback handler.
 *  Accept only literal loopback hostnames. */
/**
 * **`shared/aiEndpoint.ts` の `isLoopbackHostname` へ寄せないこと (意図的に厳しい)。**
 *
 * あちらは 127.0.0.0/8 全体・末尾ドット・`ip6-localhost` まで通す ——
 * 「平文 http を許してよいローカル相手か」という問いに答えるためで、正しい。
 * こちらは **DNS リバインディングの番人**で、コールバック待受が実際に bind して
 * いるのは `127.0.0.1` の 1 本だけ。正規のコールバックが名乗る Host は
 * `127.0.0.1:<port>` か `localhost:<port>` しかないので、それ以外を通す理由が無い。
 *
 * 統合は許可を**広げる方向にしか働かない**。違いが意図的であることは
 * `shared/__tests__/loopbackChecks.test.ts` が機械で留めている。
 */
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

/**
 * **利用者が同意画面を操作している間、loopback を開けておく時間。** (2026-09-15 · パス 282)
 *
 * HTTP の締切 (`DEFAULT_HTTP_TIMEOUT_MS` = 30 秒) とは**別の量**である ——
 * こちらが待っているのは相手のサーバではなく**人**で、ブラウザを開き、
 * アカウントを選び、権限を読んで押すまでの時間。だから長い。
 *
 * 名前を付けたのは、下の rate-limit の注記が「the 5-min timeout」と
 * **散文で同じ数を述べていた**ため —— 数が式と散文の 2 か所に在ると、
 * 片方だけ動いたときに誰も気付けない (パス 282 の census が拾った)。
 */
const OAUTH_CALLBACK_WINDOW_MS = 5 * 60_000;

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
export function listenForCallback(expectedState: string, timeoutMs = OAUTH_CALLBACK_WINDOW_MS): Promise<CallbackResult> & {
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
  const server = http.createServer((req, res) => {
    if (!isLoopbackHost(req.headers.host)) {
      res.writeHead(400, { 'Content-Type': 'text/plain' }).end('bad host');
      // Stryker disable next-line UpdateOperator,ConditionalExpression,EqualityOperator: この計数は「上限を超えたら閉じる」という保険であって契約ではない。
      // 上限未満で 400 / 404 を返し続けることは検査で固定してあり、上限そのものを
      // 動かしても外から見える振る舞いは変わらない (正規のコールバックは常に解決し、
      // 5 分の外側タイムアウトも必ず効く)。
      strayCount++;
      // Stryker disable next-line ConditionalExpression,EqualityOperator
      if (strayCount >= STRAY_LIMIT) server.close();
      return;
    }
    // 多層防御: `classifyCallback` が投げたら **400 (非終端) に倒す**。
    // ここは攻撃者が任意の URL を送れる唯一の入口で、request listener の中の
    // 同期 throw は `uncaughtException` になり、main.ts に受け手が無いので
    // アプリごと落ちる。実際 2 通りで落ちていた (2026-08-22 に実測して両方直した):
    //   - `safeStateEquals` のバイト長 RangeError
    //   - `GET http://[` —— パーサは受けるが `new URL` が拒む request-target
    // 判定できない要求は「正規のコールバックではない」ので state 不一致と
    // 同じ扱い —— 400 を返しつつ待受は続け、本物が後から来れば解決する。
    // Node's http.IncomingMessage.url is always populated by the parser
    // (even '/' for the empty path), so the `?? '/'` fallback is
    // unreachable; the StringLiteral '/' → '' mutant is equivalent.
    //
    // pragma は**対象行の直上**に置くこと。この 1 箇所で 2 回間違えた ——
    // 1 度目は説明文を挟んで、2 度目は `try {` の上に置いて。`next-line` は
    // 「次の行」しか見ないので、間に何が入っても無言で外れる。
    let outcome: CallbackOutcome;
    try {
      // Stryker disable next-line StringLiteral
      outcome = classifyCallback(req.url ?? '/', expectedState);
    } catch {
      res.writeHead(400).end('bad request');
      return;
    }
    switch (outcome.kind) {
      case 'wrong-path':
        res.writeHead(404).end();
        // Stryker disable next-line UpdateOperator
        strayCount++;
        // Stryker disable next-line ConditionalExpression,EqualityOperator
        if (strayCount >= STRAY_LIMIT) server.close();
        return;
      case 'state-mismatch':
        // Non-terminal: a forged callback (no state / wrong state) is
        // refused with 400, but the listener keeps waiting for the
        // legitimate provider callback. Without this, a local attacker
        // could DoS every OAuth flow by spraying the loopback port.
        //
        // Deliberately NOT counted toward STRAY_LIMIT: state-mismatch is
        // the exact shape a local attacker sprays, so counting it would
        // re-introduce the DoS this branch exists to prevent (50 forged
        // callbacks would close the server before the real one arrives).
        // The 5-minute timeout remains the bound for this case.
        res.writeHead(400).end('state mismatch');
        return;
      case 'oauth-error':
        // State already validated before this branch — this IS the
        // legitimate provider responding with an error. Terminal.
        //
        // **この応答だけが要求の値を映して返す** (`error` はクエリ由来)。
        // 到達には state 一致が要るので任意の相手からは叩けないが、
        // 「映して返す唯一の口」が「何も映さない成功応答」より弱い頭書きな
        // のは筋が通らない (成功側は `charset` を明示していて、その理由も
        // 『ブラウザに中身を推測させない』と書いてある)。揃える:
        //   - charset を明示 —— 無いと符号化の推測が残る
        //   - nosniff —— 宣言した text/plain を HTML と読み替えさせない
        res
          .writeHead(400, {
            'Content-Type': 'text/plain; charset=utf-8',
            'X-Content-Type-Options': 'nosniff',
          })
          .end(`OAuth error: ${outcome.error}`);
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
    // Equivalent mutant: dropping server.close() leaves the server
    // listening until the outer 5-min timeout or .cancel() fires. Tests
    // that complete in <5min cannot observe the difference.
    // Stryker disable next-line ArrowFunction
    setTimeout(() => server.close(), 50);
  });

  // Hard-to-kill mutants below: provoking a server.on('error') in a
  // unit test requires a kernel-level binding failure (e.g. exhausting
  // ephemeral ports); the 'error' event name and the '127.0.0.1' bind
  // host are both effectively integration concerns. Listening on '' (the
  // empty-bind mutant) still works on most OSes for loopback connects.
  // Same goes for the error/listen handler bodies — only fired on
  // genuine network failure.
  // カーネル側の bind 失敗 (エフェメラルポート枯渇など) でしか発火しないため、
  // 単体テストからは到達できない。イベント名も含めて観測できない。
  /* Stryker disable BlockStatement,StringLiteral */
  server.on('error', (err) => {
    portReject(err);
    reject(err);
  });
  /* Stryker restore BlockStatement,StringLiteral */

  server.listen(0, '127.0.0.1', () => {
    const port = (server.address() as AddressInfo).port;
    portResolve(port);
  });

  const timeout = setTimeout(() => {
    reject(new Error(`OAuth flow timed out after ${Math.round(timeoutMs / 1000)}s`));
    server.close();
  }, timeoutMs);

  // `.finally` creates a chained promise; if no consumer .catches the
  // chain, Node reports an unhandled rejection alongside the main
  // promise. Silence the side chain — the original `promise` is what
  // the caller awaits.
  // Equivalent mutant: dropping clearTimeout leaves the 5-min timeout
  // pending. The original `promise` has already resolved/rejected so
  // the caller sees no difference; only the process exit is delayed
  // until the timer expires.
  // Stryker disable next-line ArrowFunction
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
  // Fail before opening the browser: without the secret the exchange is
  // guaranteed to 401 *after* the user has already granted consent.
  if (requiresClientSecret(config) && !config.clientSecret) {
    throw new Error('OAuth client secret is not configured for this service');
  }
  assertHttpsEndpoint(config.tokenUrl, 'token');
  // 認可 URL も同じ関門を通す。**ブラウザを開く副作用より前**に落とすこと ——
  // 平文の宛先へ `state` を投げてから気付いても遅い。
  assertHttpsEndpoint(config.authorizeUrl, 'authorization');
  const { verifier, challenge } = generatePkce();
  const state = base64url(randomBytes(16));

  const listener = listenForCallback(state);
  const port = await listener.port();
  const redirectUri = `http://127.0.0.1:${port}/oauth/callback`;
  const authorizeUrl = buildAuthorizeUrl(config, redirectUri, state, challenge);

  /*
   * **OS へ渡す文字列そのものを、共有の関門に通す。** (2026-09-15 · パス 291)
   *
   * `externalUrlGate.ts` は自分を「外へ開く URL を判定する**唯一の関門**」と
   * 宣言しているが、ここは `lint:forbidden` の allowFile で例外にしてある
   * `shell` への直接の呼び出し口で、**その関門を通っていなかった**
   * (上の `assertHttpsEndpoint` が別の述語で守っていた)。
   * つまり「唯一」は実物より広い主張だった —— パス 290 が
   * `redact.ts` の「全経路」で見つけたのと同じ形である。
   *
   * **`assertHttpsEndpoint` が見るのは `config.authorizeUrl` (土台) で、
   * `shell` が受けるのは組み立て後の文字列である。** 関門の docblock が
   * 掲げる性質は「**調べたものと開くものが一致する**」なので、
   * 土台だけを調べていては満たせない。だから組み立て後を通し、
   * **関門が返した正規化済みの文字列を開く** (引数をそのまま渡さない)。
   *
   * ここまで来れば土台は https で userinfo 無しだが、`buildAuthorizeUrl` は
   * `config.extraAuthParams` を差し込むので、組み立て後を見るのが正しい。
   */
  const safeAuthorizeUrl = externalUrlOrNull(authorizeUrl);
  if (safeAuthorizeUrl === null) {
    throw new Error('OAuth authorization URL was rejected by the external-URL gate');
  }

  await shell.openExternal(safeAuthorizeUrl);

  const { code } = await listener;

  // **本文を読み終えるまでを締切の中に入れる。** `fetch` はヘッダで解決するので、
  // Response を外へ出すと打ち切りが本文に掛からない (2026-08-28)。
  const raw = await withTimeout(DEFAULT_HTTP_TIMEOUT_MS, null, async (signal) => {
    const res = await fetchFn(config.tokenUrl, egressInit({
      method: 'POST',
      headers: buildTokenRequestHeaders(config),
      body: serializeTokenBody(config, buildTokenExchangeBody(config, redirectUri, code, verifier)),
      signal,
    }));
    // 転送には追随しない (規則は httpLimits.ts)。token 端点が動いたなら、資格情報を別の場所へ再送しない。
    if (isRedirectResponse(res)) throw new Error(redirectRefusal(res, config.tokenUrl, '認可サーバ'));
    if (!res.ok) {
      const body = await readFailureBody(
        res,
        // `readFailureBody` が中身を捨てるので、この標識はエラー本文にも記録にも
        // 現れない —— 空文字に変えても観測できる違いが無い (equivalent)。
        // 746/779 行目 (捨てない方) の同じ標識は撃墜済みなので、そちらは開けておく。
        // Stryker disable next-line StringLiteral
        'oauth',
      );
      throw new Error(`Token exchange failed (${res.status}): ${redactForMessage(body, MAX_RESPONSE_BODY_IN_MESSAGE)}`);
    }
    // **`as` ではなく検証を通す。** 規則は `shared/tokenResponse.ts` に 1 つ
    // (ブラウザ版の `pkce.ts` も同じ関数を読む)。断り文は本文を引用しない。
    const parsed = parseTokenResponse(await readBodyWithCap(res, MAX_HTTP_RESPONSE_BYTES, 'oauth'));
    if (!parsed.ok) throw new Error(parsed.message);
    return parsed.value;
  });
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
  assertHttpsEndpoint(config.tokenUrl, 'token');
  // クロージャの中では `current.refreshToken` の絞り込みが効かないので、
  // 上の guard を通った値をここで確定させる。
  const refreshToken = current.refreshToken;
  const raw = await withTimeout(DEFAULT_HTTP_TIMEOUT_MS, null, async (signal) => {
    const res = await fetchFn(config.tokenUrl, egressInit({
      method: 'POST',
      headers: buildTokenRequestHeaders(config),
      body: serializeTokenBody(config, buildRefreshBody(config, refreshToken)),
      signal,
    }));
    // 転送には追随しない (規則は httpLimits.ts)。token 端点が動いたなら、資格情報を別の場所へ再送しない。
    if (isRedirectResponse(res)) throw new Error(redirectRefusal(res, config.tokenUrl, '認可サーバ'));
    if (!res.ok) {
      const body = await readFailureBody(
        res,
        // `readFailureBody` が中身を捨てるので、この標識はエラー本文にも記録にも
        // 現れない —— 空文字に変えても観測できる違いが無い (equivalent)。
        // 746/779 行目 (捨てない方) の同じ標識は撃墜済みなので、そちらは開けておく。
        // Stryker disable next-line StringLiteral
        'oauth',
      );
      throw new Error(`Token refresh failed (${res.status}): ${redactForMessage(body, MAX_RESPONSE_BODY_IN_MESSAGE)}`);
    }
    // **`as` ではなく検証を通す。** 規則は `shared/tokenResponse.ts` に 1 つ
    // (ブラウザ版の `pkce.ts` も同じ関数を読む)。断り文は本文を引用しない。
    const parsed = parseTokenResponse(await readBodyWithCap(res, MAX_HTTP_RESPONSE_BYTES, 'oauth'));
    if (!parsed.ok) throw new Error(parsed.message);
    return parsed.value;
  });
  return tokenResponseToSet(raw, current.refreshToken);
}
