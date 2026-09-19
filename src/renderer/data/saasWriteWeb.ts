/**
 * ブラウザ版の外部 SaaS 書き込み (create-*) アクション (Part ②)。
 *
 * Electron 版は main の各 client が REST API を直接呼ぶ。ブラウザ版では、
 * CORS を許可している API (GitHub 等) は直接、CORS をブロックする API
 * (Notion / Atlassian / Slack 等) はユーザー提供の Cloudflare Worker
 * プロキシ経由で呼ぶ。トークンは Vault から取得して web-shim 側で渡す。
 *
 * ここは fetch を注入できる純粋ロジックに保ち、単体テスト可能にする。
 * サービスを追加するたびにこのモジュールに関数を増やしていく。
 */
/* ホストは共有に 1 つだけ —— main と同じ字面を写さない (パス 274)。 */
import {
  checkEvent,
  checkMail,
  createGraphEvent,
  sendGraphMail,
  type GraphEventFields,
  type GraphMailFields,
} from '../../shared/api/microsoft365';
import { checkIssue, createGithubIssueRequest, parseCreatedIssue } from '../../shared/api/github';
import { checkPage, createNotionPageRequest, parseCreatedPage } from '../../shared/api/notion';
import { checkMessage, postSlackMessageRequest, readSlackPost } from '../../shared/api/slack';
import { checkPost, createWordPressPostRequest, parseCreatedPost } from '../../shared/api/wordpress';
import { checkFolder, createCanvaFolderRequest, parseCreatedFolder } from '../../shared/api/canva';
import {
  checkDnsRecord,
  checkPurge,
  createDnsRecordRequest,
  parseCreatedDnsRecord,
  parsePurgeResult,
  purgeCacheRequest,
  readCloudflareEnvelope,
} from '../../shared/api/cloudflare';
import {
  checkCalendarEvent,
  checkDriveFolder,
  checkGmailDraft,
  createCalendarEventRequest,
  createDriveFolderRequest,
  createGmailDraftRequest,
  parseCreatedDraft,
  parseCreatedDriveFolder,
  parseCreatedEvent,
} from '../../shared/api/google';
import {
  ATLASSIAN_CREDS_MESSAGES,
  normalizeAtlassianSiteResult,
  readAtlassianCredentials,
  type AtlassianSiteFailure,
} from '../../shared/atlassianSite';
import { checkJiraIssue, createJiraIssueRequest, parseCreatedJiraIssue } from '../../shared/api/atlassian';
import { redactForMessage, MAX_RESPONSE_BODY_IN_MESSAGE } from '../../shared/redact';
import { MAX_HTTP_RESPONSE_BYTES, readBodyWithCap } from '../../shared/httpLimits';
import {
  optionalString,
  parseJsonBody,
  parseJsonText,
  requireObject,
  requireString,
} from '../../shared/apiResponse';
import { hibpBreaches } from '../../shared/securityResponse';
import {
  HIBP_NO_BREACH_STATUS,
  checkBreachEmail,
  checkEmailBreachRequest,
  checkScanUrl,
  fetchVtReportRequest,
  submitVtUrlRequest,
  summarizeVtReport,
} from '../../shared/api/security';
import type { ActionData } from '../../shared/actionData';

/**
 * 素の `fetch` と同じ形。
 *
 * **このモジュールの書き込み口はもうこれを使わない** —— 2026-08-31 に
 * `createGithubIssue` を `Transport` 必須へ揃えたので、13 本すべてが
 * 「呼び出し側が渡す」形になった。型は外向けに残してある (呼び出し側が
 * 自分の口を組み立てるときの記述用)。
 */
export type FetchFn = typeof fetch;

/** url + init を受け取り Response を返すトランスポート。直接 fetch でも、
 *  プロキシ (fetchViaProxy をバインドしたもの) でも差し替えられる。 */
export type Transport = (url: string, init: RequestInit) => Promise<Response>;

/**
 * 応答本文を上限つきで読む。
 *
 * **プロキシ経由の道と直接叩く道で、判定を違えない。**
 * `network/proxy.ts` の `fetchViaProxy` は上限つきで読んだ本文から
 * `Response` を組み直して返すので、プロキシ経由で来た応答は既に 10MiB 以下
 * である。ところが CORS 許可済みで**直接叩く道** (GitHub) だけは素の
 * `fetch` から来た `Response` をそのまま読んでいた —— 相手が巨大な本文を
 * 返せばタブの記憶を使い切る (2026-08-31 に発見)。
 *
 * `web-shim.ts` は同じ理由で `readCappedText` を持っているが、こちらの
 * モジュールには渡っていなかった。**同じ問いには同じ答えを置く。**
 */
export async function readCapped(res: Response, label: string): Promise<string> {
  return readBodyWithCap(res, MAX_HTTP_RESPONSE_BYTES, label);
}

/** API 応答が ok でなければ本文の一部を添えて throw する共通ヘルパ。 */
async function ensureOk(res: Response, label: string): Promise<void> {
  if (res.ok) return;
  // 落ちている相手ほど大きなものを返しうるので、失敗の本文も上限つきで読む。
  const body = await readCapped(res, label).catch(() => '');
  throw new Error(`${label} ${res.status}: ${redactForMessage(body, MAX_RESPONSE_BODY_IN_MESSAGE)}`);
}

// --- GitHub: create-issue ------------------------------------------------
// api.github.com は CORS 許可済みのためブラウザから直接呼べる。

export interface CreateGithubIssueInput {
  owner?: unknown;
  repo?: unknown;
  title?: unknown;
  body?: unknown;
  labels?: unknown;
}



/**
 * GitHub の課題を作る。
 *
 * ## `transport` を**必須**にしてある理由 (2026-08-31)
 *
 * このモジュールの書き込み口は 13 本あり、**12 本は `transport: Transport` を
 * 必須の第 3 引数に取る** —— 呼び出し側は忘れようがない。ところがここだけが
 * `fetchFn: FetchFn = fetch` という**省略可の既定つき**だった。
 *
 * `api.github.com` は CORS を許可しているのでプロキシを通らず、その分
 * 「素の `fetch` でも動いてしまう」。実際 `web-shim.ts` は既定のまま呼んで
 * おり、**プロキシ経由の 14 経路にまとめて掛けている打ち切りが、この 1 本にだけ
 * 掛かっていなかった** (応答しない相手に対して `busy` が戻らない)。
 *
 * 検査で見張るより**忘れられない形にする**ほうが強い。兄弟 12 本と同じ
 * 引数の並びに揃えたので、渡し忘れは型検査で落ちる。
 */
export async function createGithubIssue(
  input: CreateGithubIssueInput,
  token: string,
  transport: Transport,
): Promise<ActionData<'github/create-issue'>> {
  /*
   * 欄の判定・URL・要求・応答の読みは **`shared/api/github.ts` の 1 つ**
   * (main も同じ関数を呼ぶ · 2026-09-18 のオントロジーの組み直し)。ここが持つのは
   * ブラウザ版の流儀だけ —— 打ち切りつきの transport と、失敗した本文の読み方
   * (`ensureOk` が上限つきで読んで伏字を通す)。
   */
  const issue = checkIssue(input);
  const res = await createGithubIssueRequest(issue, token, transport);
  await ensureOk(res, 'GitHub API');
  // ここは**プロキシを通らない唯一の書き込み経路** (api.github.com は CORS
  // 許可済み)。上限を掛けるのはこの読み出しだけで、他の create-* は
  // `fetchViaProxy` が組み直した 10MiB 以下の `Response` を受け取っている。
  return parseCreatedIssue(parseJsonText(await readCapped(res, 'GitHub API'), 'GitHub API'));
}

// --- Notion: create-page (CORS ブロック → プロキシ経由) -------------------

export interface CreateNotionPageInput {
  parentPageId?: unknown;
  title?: unknown;
  body?: unknown;
}


export async function createNotionPage(
  input: CreateNotionPageInput,
  token: string,
  transport: Transport,
): Promise<ActionData<'notion/create-page'>> {
  // 欄の判定・URL・要求・応答の読みは shared/api/notion.ts の 1 つ (main も同じ関数)。
  const page = checkPage(input);
  const res = await createNotionPageRequest(page, token, transport);
  await ensureOk(res, 'Notion API');
  return parseCreatedPage(await parseJsonBody(res, 'Notion API'));
}

// --- Slack: send-message (CORS ブロック → プロキシ経由) -------------------

export interface SendSlackMessageInput {
  channel?: unknown;
  text?: unknown;
}


export async function sendSlackMessage(
  input: SendSlackMessageInput,
  token: string,
  transport: Transport,
): Promise<ActionData<'slack/send-message'>> {
  // 欄の判定・URL・要求・応答の読みは shared/api/slack.ts の 1 つ (main も同じ関数)。
  const message = checkMessage(input);
  const res = await postSlackMessageRequest(message, token, transport);
  await ensureOk(res, 'Slack API');
  // Slack は HTTP 200 でも body.ok=false でエラーを返す。断り方だけがブラウザ版の流儀。
  const post = readSlackPost(await parseJsonBody(res, 'Slack API'), message);
  if (!post.ok) throw new Error(`Slack: ${post.error}`);
  return { ts: post.ts, channel: post.channel };
}

// --- Atlassian (Jira): create-issue (CORS ブロック → プロキシ経由) ---------
// トークンは {email, token, site} の JSON。Basic 認証の組み立ては shared (`basicAuthorization`)。


interface AtlassianCreds {
  email: string;
  token: string;
  site: string;
}

/** Vault に保存された Atlassian トークン JSON を検証して取り出す。
 *
 *  3 段の検査 (JSON → 3 欄と天井 → 制御文字) とその文面は
 *  `shared/atlassianSite.ts` に 1 つだけ置く (パス 284)。それまでは同じ 3 段が
 *  main (`clients/atlassian.ts`) にも在り、**文面が両方で違い** (どちらも
 *  日本語なのに言い回しだけ違う)、しかも**両方が JSON リテラルの `null` で
 *  素の TypeError を投げていた**。共有側の docblock に実測が在る。 */
export function parseAtlassianToken(raw: string): AtlassianCreds {
  const creds = readAtlassianCredentials(raw);
  if (!creds.ok) throw new Error(ATLASSIAN_CREDS_MESSAGES[creds.reason]);
  // **ホスト名まで絞る。** ここは `Authorization: Basic btoa(email:token)` を
  // 付けて `${site}/rest/api/3/issue` へ POST する経路で、以前は
  // `https:` かどうかしか見ていなかった。つまり site を差し替えるだけで
  // Atlassian のメールアドレスと API トークンが任意の相手へ届いた。
  // 実体は `src/shared/atlassianSite.ts` に 1 つだけ置いてある。
  const site = normalizeAtlassianSiteResult(creds.site);
  if (!site.ok) throw new Error(ATLASSIAN_SITE_MESSAGES[site.reason]);
  return { email: creds.email, token: creds.token, site: site.site };
}


/* site の文面は呼び手ごと (main 側の同じ表の注記に理由が在る · パス 284)。 */
const ATLASSIAN_SITE_MESSAGES: Record<AtlassianSiteFailure, string> = {
  'control-char': 'Atlassian の site に制御文字を含めることはできません',
  'not-a-url': 'Atlassian の site は https URL で指定してください',
  'not-https': 'Atlassian の site は https のみ対応',
  'not-atlassian': 'Atlassian の site は *.atlassian.net である必要があります',
};

export interface CreateAtlassianIssueInput {
  projectKey?: unknown;
  summary?: unknown;
  description?: unknown;
  issueType?: unknown;
}

export async function createAtlassianIssue(
  input: CreateAtlassianIssueInput,
  tokenJson: string,
  transport: Transport,
): Promise<ActionData<'atlassian/create-issue'>> {
  const creds = parseAtlassianToken(tokenJson);
  // 欄の判定・ADF・Basic 認証・要求・応答の読みは shared/api/atlassian.ts の 1 つ (main も同じ関数)。
  const issue = checkJiraIssue(input);
  const res = await createJiraIssueRequest(issue, creds, transport);
  await ensureOk(res, 'Atlassian API');
  return parseCreatedJiraIssue(await parseJsonBody(res, 'Atlassian API'), creds.site);
}

// --- Google Calendar: create-event (OAuth, CORS → プロキシ) ---------------

export interface CreateCalendarEventInput {
  summary?: unknown;
  start?: unknown;
  end?: unknown;
  description?: unknown;
  location?: unknown;
  timeZone?: unknown;
}


export async function createCalendarEvent(
  input: CreateCalendarEventInput,
  token: string,
  transport: Transport,
): Promise<ActionData<'calendar/create-event'>> {
  // 欄の判定・時間帯の既定・URL・要求・応答の読みは shared/api/google.ts の 1 つ (main も同じ関数)。
  const event = checkCalendarEvent(input);
  const res = await createCalendarEventRequest(event, token, transport);
  await ensureOk(res, 'Calendar API');
  return parseCreatedEvent(await parseJsonBody(res, 'Google Calendar API'));
}

// --- Gmail: create-draft (OAuth, CORS → プロキシ) -------------------------

// RFC 2822 の組み立ては shared の 1 つ (main も同じ関数)。検査が読むので名前はここからも出す。
export { buildRfc2822, isSafeHeaderValue } from '../../shared/rfc2822';

export interface CreateGmailDraftInput {
  to?: unknown;
  subject?: unknown;
  body?: unknown;
}

export async function createGmailDraft(
  input: CreateGmailDraftInput,
  token: string,
  transport: Transport,
): Promise<ActionData<'gmail/create-draft'>> {
  // 欄の判定・RFC 2822・base64url・URL・要求・応答の読みは shared/api/google.ts の 1 つ (main も同じ関数)。
  const draft = checkGmailDraft(input);
  const res = await createGmailDraftRequest(draft, token, transport);
  await ensureOk(res, 'Gmail API');
  return parseCreatedDraft(await parseJsonBody(res, 'Gmail API'));
}

// --- Google Drive: create-folder (OAuth, CORS → プロキシ) -----------------

export interface CreateDriveFolderInput {
  name?: unknown;
  parentId?: unknown;
}

export async function createDriveFolder(
  input: CreateDriveFolderInput,
  token: string,
  transport: Transport,
): Promise<ActionData<'drive/create-folder'>> {
  // 欄の判定・URL・要求・応答の読みは shared/api/google.ts の 1 つ (main も同じ関数)。
  const folder = checkDriveFolder(input);
  const res = await createDriveFolderRequest(folder, token, transport);
  await ensureOk(res, 'Drive API');
  return parseCreatedDriveFolder(await parseJsonBody(res, 'Google Drive API'));
}

// --- WordPress.com: create-post-draft (Bearer, CORS → プロキシ) -----------

export interface CreateWordPressPostInput {
  siteId?: unknown;
  title?: unknown;
  content?: unknown;
  status?: unknown;
}

export async function createWordPressPostDraft(
  input: CreateWordPressPostInput,
  token: string,
  transport: Transport,
): Promise<ActionData<'wordpress/create-post-draft'>> {
  // 欄の判定・URL・要求・応答の読みは shared/api/wordpress.ts の 1 つ (main も同じ関数)。
  const post = checkPost(input);
  const res = await createWordPressPostRequest(post, token, transport);
  await ensureOk(res, 'WordPress API');
  return parseCreatedPost(await parseJsonBody(res, 'WordPress.com API'));
}

// --- Canva: create-folder (Bearer, CORS → プロキシ) -----------------------

export interface CreateCanvaFolderInput {
  name?: unknown;
  parentFolderId?: unknown;
}

export async function createCanvaFolder(
  input: CreateCanvaFolderInput,
  token: string,
  transport: Transport,
): Promise<ActionData<'canva/create-folder'>> {
  // 欄の判定・URL・要求・応答の読みは shared/api/canva.ts の 1 つ (main も同じ関数)。
  const folder = checkFolder(input);
  const res = await createCanvaFolderRequest(folder, token, transport);
  await ensureOk(res, 'Canva API');
  return parseCreatedFolder(await parseJsonBody(res, 'Canva API'));
}

// --- Cloudflare: create-dns-record / purge-cache (Bearer, CORS → プロキシ) -

/**
 * 封筒 (`{success, errors, result}`) の判定は shared の 1 つ (`readCloudflareEnvelope` ——
 * main も同じ関数)。ここは断りを `Error` で運ぶだけ (main は serviceId つきの FetchError)。
 */
function cfUnwrap(raw: unknown): unknown {
  const env = readCloudflareEnvelope(raw);
  if (!env.ok) throw new Error(`Cloudflare: ${env.message}`);
  return env.result;
}

export interface CreateCfDnsRecordInput {
  zoneId?: unknown;
  type?: unknown;
  name?: unknown;
  content?: unknown;
  ttl?: unknown;
  proxied?: unknown;
}

export async function createCloudflareDnsRecord(
  input: CreateCfDnsRecordInput,
  token: string,
  transport: Transport,
): Promise<ActionData<'cloudflare/create-dns-record'>> {
  // 欄の判定・本文・URL・要求・結果の読みは shared/api/cloudflare.ts の 1 つ (main も同じ関数)。
  const record = checkDnsRecord(input);
  const res = await createDnsRecordRequest(record, token, transport);
  await ensureOk(res, 'Cloudflare API');
  return parseCreatedDnsRecord(cfUnwrap(await parseJsonBody(res, 'Cloudflare API')));
}

export interface PurgeCfCacheInput {
  zoneId?: unknown;
  files?: unknown;
  purgeEverything?: unknown;
}

export async function purgeCloudflareCache(
  input: PurgeCfCacheInput,
  token: string,
  transport: Transport,
): Promise<ActionData<'cloudflare/purge-cache'>> {
  const purge = checkPurge(input);
  const res = await purgeCacheRequest(purge, token, transport);
  await ensureOk(res, 'Cloudflare API');
  return parsePurgeResult(cfUnwrap(await parseJsonBody(res, 'Cloudflare API')), purge);
}

// --- セキュリティ: VirusTotal scan-url (CORS → プロキシ) -------------------
// HIBP の check-email-breach は「404 = 漏洩なし」を fetchViaProxy が
// エラーとして扱い区別できないため未対応 (HIBP 対応プロキシが必要)。

// 資格情報の解析は shared の 1 つ (main も同じ関数)。web-shim と検査が読むので名前はここからも出す。
export { parseSecurityKeys } from '../../shared/api/security';

/** HIBP は User-Agent 必須。ブラウザ版はプロキシ (Worker) が名乗り、ここでの値は封筒に載るだけ。 */
const WEB_USER_AGENT = 'service-hub';

export interface ScanUrlInput {
  url?: unknown;
}

export async function scanUrlVirusTotal(
  input: ScanUrlInput,
  vtKey: string,
  transport: Transport,
): Promise<ActionData<'security/scan-url'>> {
  // URL の判定・投入・id・レポートの読みは shared/api/security.ts の 1 つ (main も同じ関数)。
  const url = checkScanUrl(input);
  const submit = await submitVtUrlRequest(url, vtKey, transport);
  await ensureOk(submit, 'VirusTotal API');
  const report = await fetchVtReportRequest(url, vtKey, transport);
  await ensureOk(report, 'VirusTotal API');
  return summarizeVtReport(url, await parseJsonBody(report, 'VirusTotal API'));
}

// --- セキュリティ: HIBP メール漏洩チェック (CORS → プロキシ) --------------
// fetchViaProxy は worker エンベロープの上流ステータスを保持するため、
// HIBP の「漏洩なし = 404」を Response.status で正しく判定できる。

export interface CheckEmailBreachInput {
  email?: unknown;
}

export async function checkEmailBreach(
  input: CheckEmailBreachInput,
  hibpKey: string,
  transport: Transport,
): Promise<ActionData<'security/check-email-breach'>> {
  // 空白落としと空の断りは shared (パス 285 —— 2026-08-22 に双子がずれて「誤った安心」を返した組)。
  const email = checkBreachEmail(input);
  const res = await checkEmailBreachRequest(email, hibpKey, WEB_USER_AGENT, transport);
  // 404 = この email はどの漏洩にも含まれない (正常)。
  if (res.status === HIBP_NO_BREACH_STATUS) return { email, breaches: [] };
  await ensureOk(res, 'HIBP API');
  // **でっち上げの漏洩を作らない** (パス 261) —— 要素ごとに欄を要求する (`hibpBreaches`)。
  return { email, breaches: hibpBreaches(await parseJsonBody(res, 'HIBP API')) };
}

/**
 * Microsoft Graph でメールを送る (ブラウザ版・パス 274)。
 *
 * ## なぜこれが無かったのか
 *
 * ブラウザ版には `send-mail` の枝が 1 つも無く、`web-shim` の既定 (「名指し
 * していない action は `action_not_found`」) へ落ちていた。ところが**同じ
 * フォームの隣の `create-event` は動いていた** —— `createCalendarEvent` が
 * 在るので。押せる条件も同じ (`submitting` と欄の天井だけ) なので、
 * 利用者から見ると「予定は作れるのにメールだけ送れない」形だった。
 *
 * 欄の判定と要求の組み立ては **`shared/api/microsoft365.ts` の 1 つ**を通る
 * (main も同じ関数を呼ぶ)。ここが持つのは**ブラウザ版の流儀**だけ ——
 * プロキシ経由の transport と、失敗した本文の読み方 (`ensureOk` が上限つきで
 * 読んで伏字を通す)。202 は `res.ok` なので `ensureOk` は**本文を読まずに返る**。
 */
export async function sendMicrosoftMail(
  input: GraphMailFields,
  token: string,
  transport: Transport,
): Promise<ActionData<'microsoft-365/send-mail'>> {
  const mail = checkMail(input);
  const res = await sendGraphMail(mail, token, transport);
  await ensureOk(res, 'Microsoft Graph');
  return { ok: true, to: mail.to, subject: mail.subject };
}

/**
 * Microsoft 365 予定作成 (Graph · プロキシ経由) —— **パス 275**。
 *
 * 送信 (202・本文なし) と違い **201 Created は作った予定を返す**ので、ここは
 * 本文を読んで形を確かめる —— `{}` を「作成成功」として返すと `undefined` を
 * 埋めた `webLink` が押せるリンクとして画面へ行く (パス 261 が 2 経路で実測した形)。
 */
export async function createMicrosoftEvent(
  input: GraphEventFields,
  token: string,
  transport: Transport,
): Promise<ActionData<'microsoft-365/create-event'>> {
  const event = checkEvent(input);
  const res = await createGraphEvent(event, token, transport);
  await ensureOk(res, 'Microsoft Graph');
  const o = requireObject(await parseJsonBody(res, 'Microsoft Graph'), 'Microsoft Graph');
  return {
    id: requireString(o, 'id', 'Microsoft Graph'),
    subject: optionalString(o, 'subject') ?? event.subject,
    webLink: optionalString(o, 'webLink') ?? '',
  };
}
