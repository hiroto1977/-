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

export type FetchFn = typeof fetch;

/** url + init を受け取り Response を返すトランスポート。直接 fetch でも、
 *  プロキシ (fetchViaProxy をバインドしたもの) でも差し替えられる。 */
export type Transport = (url: string, init: RequestInit) => Promise<Response>;

/** API 応答が ok でなければ本文の一部を添えて throw する共通ヘルパ。 */
async function ensureOk(res: Response, label: string): Promise<void> {
  if (res.ok) return;
  const body = await res.text().catch(() => '');
  throw new Error(`${label} ${res.status}: ${body.slice(0, 200)}`);
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

export interface CreateGithubIssueResult {
  number: number;
  url: string;
  title: string;
}

interface GithubIssueApiResponse {
  number: number;
  html_url: string;
  title: string;
}

export async function createGithubIssue(
  input: CreateGithubIssueInput,
  token: string,
  fetchFn: FetchFn = fetch,
): Promise<CreateGithubIssueResult> {
  const owner = typeof input.owner === 'string' ? input.owner.trim() : '';
  const repo = typeof input.repo === 'string' ? input.repo.trim() : '';
  const title = typeof input.title === 'string' ? input.title.trim() : '';
  if (!owner || !repo || !title) {
    throw new Error('owner, repo, title は必須です');
  }
  const body = typeof input.body === 'string' ? input.body : undefined;
  const labels = Array.isArray(input.labels)
    ? input.labels.filter((l): l is string => typeof l === 'string')
    : undefined;

  const res = await fetchFn(
    `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/issues`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'Content-Type': 'application/json',
        // User-Agent はブラウザが自動付与する (手動設定は禁止ヘッダ) ため省く。
      },
      body: JSON.stringify({ title, body, labels }),
    },
  );
  await ensureOk(res, 'GitHub API');
  const data = (await res.json()) as GithubIssueApiResponse;
  return { number: data.number, url: data.html_url, title: data.title };
}

// --- Notion: create-page (CORS ブロック → プロキシ経由) -------------------

export interface CreateNotionPageInput {
  parentPageId?: unknown;
  title?: unknown;
  body?: unknown;
}

export interface CreateNotionPageResult {
  id: string;
  url: string;
}

export async function createNotionPage(
  input: CreateNotionPageInput,
  token: string,
  transport: Transport,
): Promise<CreateNotionPageResult> {
  const parentPageId = typeof input.parentPageId === 'string' ? input.parentPageId.trim() : '';
  const title = typeof input.title === 'string' ? input.title.trim() : '';
  if (!parentPageId || !title) throw new Error('parentPageId と title は必須です');
  const body = typeof input.body === 'string' ? input.body : undefined;
  const children = body
    ? [{ object: 'block', type: 'paragraph', paragraph: { rich_text: [{ type: 'text', text: { content: body } }] } }]
    : [];

  const res = await transport('https://api.notion.com/v1/pages', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Notion-Version': '2022-06-28',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      parent: { page_id: parentPageId },
      properties: { title: { title: [{ text: { content: title } }] } },
      children,
    }),
  });
  await ensureOk(res, 'Notion API');
  const data = (await res.json()) as { id: string; url: string };
  return { id: data.id, url: data.url };
}

// --- Slack: send-message (CORS ブロック → プロキシ経由) -------------------

export interface SendSlackMessageInput {
  channel?: unknown;
  text?: unknown;
}

export interface SendSlackMessageResult {
  ts: string;
  channel: string;
}

export async function sendSlackMessage(
  input: SendSlackMessageInput,
  token: string,
  transport: Transport,
): Promise<SendSlackMessageResult> {
  const channel = typeof input.channel === 'string' ? input.channel.trim() : '';
  const text = typeof input.text === 'string' ? input.text : '';
  if (!channel || !text) throw new Error('channel と text は必須です');

  const res = await transport('https://slack.com/api/chat.postMessage', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json; charset=utf-8',
    },
    body: JSON.stringify({ channel, text }),
  });
  await ensureOk(res, 'Slack API');
  // Slack は HTTP 200 でも body.ok=false でエラーを返す。
  const data = (await res.json()) as { ok: boolean; error?: string; ts?: string; channel?: string };
  if (!data.ok) throw new Error(`Slack: ${data.error ?? 'unknown_error'}`);
  return { ts: data.ts ?? '', channel: data.channel ?? channel };
}

// --- Atlassian (Jira): create-issue (CORS ブロック → プロキシ経由) ---------
// トークンは {email, token, site} の JSON。ブラウザでは btoa で Basic 認証。

const MAX_ATLASSIAN_EMAIL = 254;

interface AtlassianCreds {
  email: string;
  token: string;
  site: string;
}

/** Vault に保存された Atlassian トークン JSON を検証して取り出す。 */
export function parseAtlassianToken(raw: string): AtlassianCreds {
  let obj: { email?: unknown; token?: unknown; site?: unknown };
  try {
    obj = JSON.parse(raw) as typeof obj;
  } catch {
    throw new Error('Atlassian トークンは { "email", "token", "site" } 形式の JSON で保存してください');
  }
  if (
    typeof obj.email !== 'string' || obj.email.length === 0 || obj.email.length > MAX_ATLASSIAN_EMAIL ||
    typeof obj.token !== 'string' || obj.token.length === 0 ||
    typeof obj.site !== 'string' || obj.site.length === 0
  ) {
    throw new Error('Atlassian トークンの email / token / site が欠けているか不正です');
  }
  if (/[\r\n\0]/.test(obj.email) || /[\r\n\0]/.test(obj.token)) {
    throw new Error('Atlassian の email / token に制御文字を含めることはできません');
  }
  let site: URL;
  try {
    site = new URL(obj.site);
  } catch {
    throw new Error('Atlassian の site は https URL で指定してください');
  }
  if (site.protocol !== 'https:') throw new Error('Atlassian の site は https のみ対応');
  return { email: obj.email, token: obj.token, site: obj.site.replace(/\/+$/, '') };
}

export interface CreateAtlassianIssueInput {
  projectKey?: unknown;
  summary?: unknown;
  description?: unknown;
  issueType?: unknown;
}

export interface CreateAtlassianIssueResult {
  key: string;
  url: string;
}

export async function createAtlassianIssue(
  input: CreateAtlassianIssueInput,
  tokenJson: string,
  transport: Transport,
): Promise<CreateAtlassianIssueResult> {
  const creds = parseAtlassianToken(tokenJson);
  const projectKey = typeof input.projectKey === 'string' ? input.projectKey.trim() : '';
  const summary = typeof input.summary === 'string' ? input.summary.trim() : '';
  if (!projectKey || !summary) throw new Error('projectKey と summary は必須です');
  const description = typeof input.description === 'string' ? input.description : undefined;
  const issueType = typeof input.issueType === 'string' && input.issueType.length > 0 ? input.issueType : 'Task';
  const descBody = description
    ? { type: 'doc', version: 1, content: [{ type: 'paragraph', content: [{ type: 'text', text: description }] }] }
    : undefined;

  const res = await transport(`${creds.site}/rest/api/3/issue`, {
    method: 'POST',
    headers: {
      Authorization: 'Basic ' + btoa(`${creds.email}:${creds.token}`),
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      fields: {
        project: { key: projectKey },
        summary,
        issuetype: { name: issueType },
        ...(descBody ? { description: descBody } : {}),
      },
    }),
  });
  await ensureOk(res, 'Atlassian API');
  const data = (await res.json()) as { key: string };
  return { key: data.key, url: `${creds.site}/browse/${data.key}` };
}

// --- UTF-8 安全な base64 / base64url (ブラウザの btoa は Latin1 のみ) -------

function utf8ToBase64(s: string): string {
  const bytes = new TextEncoder().encode(s);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

function utf8ToBase64Url(s: string): string {
  return utf8ToBase64(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
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

function defaultTimeZone(): string {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (typeof tz === 'string' && tz.length > 0) return tz;
  } catch {
    /* ignore */
  }
  return 'UTC';
}

export async function createCalendarEvent(
  input: CreateCalendarEventInput,
  token: string,
  transport: Transport,
): Promise<{ id: string; htmlLink: string }> {
  const summary = typeof input.summary === 'string' ? input.summary.trim() : '';
  const start = typeof input.start === 'string' ? input.start : '';
  const end = typeof input.end === 'string' ? input.end : '';
  if (!summary || !start || !end) throw new Error('summary, start, end は必須です');
  const tz = typeof input.timeZone === 'string' && input.timeZone.length > 0 ? input.timeZone : defaultTimeZone();
  const body = {
    summary,
    description: typeof input.description === 'string' ? input.description : undefined,
    location: typeof input.location === 'string' ? input.location : undefined,
    start: { dateTime: start, timeZone: tz },
    end: { dateTime: end, timeZone: tz },
  };
  const res = await transport('https://www.googleapis.com/calendar/v3/calendars/primary/events', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  await ensureOk(res, 'Calendar API');
  const data = (await res.json()) as { id: string; htmlLink: string };
  return { id: data.id, htmlLink: data.htmlLink };
}

// --- Gmail: create-draft (OAuth, CORS → プロキシ) -------------------------

export function isSafeHeaderValue(value: unknown): value is string {
  return typeof value === 'string' && !/[\r\n\0]/.test(value);
}

export function buildRfc2822(to: string, subject: string, body: string): string {
  if (!isSafeHeaderValue(to)) throw new Error('to に CR/LF/NUL は使用できません');
  const utf8Subject = `=?UTF-8?B?${utf8ToBase64(subject)}?=`;
  return [
    `To: ${to}`,
    `Subject: ${utf8Subject}`,
    'Content-Type: text/plain; charset="UTF-8"',
    'MIME-Version: 1.0',
    '',
    body,
  ].join('\r\n');
}

export interface CreateGmailDraftInput {
  to?: unknown;
  subject?: unknown;
  body?: unknown;
}

export async function createGmailDraft(
  input: CreateGmailDraftInput,
  token: string,
  transport: Transport,
): Promise<{ id: string; messageId: string }> {
  const to = typeof input.to === 'string' ? input.to.trim() : '';
  const subject = typeof input.subject === 'string' ? input.subject : '';
  if (!to || !subject) throw new Error('to と subject は必須です');
  const raw = utf8ToBase64Url(buildRfc2822(to, subject, typeof input.body === 'string' ? input.body : ''));
  const res = await transport('https://gmail.googleapis.com/gmail/v1/users/me/drafts', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: { raw } }),
  });
  await ensureOk(res, 'Gmail API');
  const data = (await res.json()) as { id: string; message: { id: string } };
  return { id: data.id, messageId: data.message.id };
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
): Promise<{ id: string; name: string; url: string }> {
  const name = typeof input.name === 'string' ? input.name.trim() : '';
  if (!name) throw new Error('name は必須です');
  const parentId = typeof input.parentId === 'string' ? input.parentId : undefined;
  const res = await transport('https://www.googleapis.com/drive/v3/files?fields=id,name,webViewLink', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name,
      mimeType: 'application/vnd.google-apps.folder',
      ...(parentId ? { parents: [parentId] } : {}),
    }),
  });
  await ensureOk(res, 'Drive API');
  const data = (await res.json()) as { id: string; name: string; webViewLink?: string };
  return { id: data.id, name: data.name, url: data.webViewLink ?? `https://drive.google.com/drive/folders/${data.id}` };
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
): Promise<{ id: number; url: string; title: string }> {
  const siteId = typeof input.siteId === 'string' ? input.siteId.trim() : '';
  const title = typeof input.title === 'string' ? input.title.trim() : '';
  if (!siteId || !title) throw new Error('siteId と title は必須です');
  const allowed = new Set(['draft', 'publish', 'pending', 'private']);
  const status = typeof input.status === 'string' && allowed.has(input.status) ? input.status : 'draft';
  const res = await transport(
    `https://public-api.wordpress.com/rest/v1.1/sites/${encodeURIComponent(siteId)}/posts/new`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, content: typeof input.content === 'string' ? input.content : '', status }),
    },
  );
  await ensureOk(res, 'WordPress API');
  const data = (await res.json()) as { ID: number; URL: string; title: string };
  return { id: data.ID, url: data.URL, title: data.title };
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
): Promise<{ id: string; name: string }> {
  const name = typeof input.name === 'string' ? input.name.trim() : '';
  if (!name) throw new Error('name は必須です');
  const parentFolderId = typeof input.parentFolderId === 'string' && input.parentFolderId.length > 0 ? input.parentFolderId : 'root';
  const res = await transport('https://api.canva.com/rest/v1/folders', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, parent_folder_id: parentFolderId }),
  });
  await ensureOk(res, 'Canva API');
  const data = (await res.json()) as { folder: { id: string; name: string } };
  return { id: data.folder.id, name: data.folder.name };
}

// --- Cloudflare: create-dns-record / purge-cache (Bearer, CORS → プロキシ) -

const CF_API_BASE = 'https://api.cloudflare.com/client/v4';

interface CfWrap<T> {
  success: boolean;
  errors?: { message: string }[];
  result: T;
}

function cfUnwrap<T>(payload: CfWrap<T>): T {
  if (!payload.success) {
    throw new Error(`Cloudflare: ${payload.errors?.[0]?.message ?? 'unknown error'}`);
  }
  return payload.result;
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
): Promise<{ id: string; name: string; type: string }> {
  const zoneId = typeof input.zoneId === 'string' ? input.zoneId.trim() : '';
  const type = typeof input.type === 'string' ? input.type : '';
  const name = typeof input.name === 'string' ? input.name.trim() : '';
  const content = typeof input.content === 'string' ? input.content.trim() : '';
  if (!zoneId || !type || !name || !content) throw new Error('zoneId, type, name, content は必須です');
  const body: Record<string, unknown> = { type, name, content, ttl: typeof input.ttl === 'number' ? input.ttl : 1 };
  if (type === 'A' || type === 'AAAA' || type === 'CNAME') body.proxied = input.proxied === true;
  const res = await transport(`${CF_API_BASE}/zones/${encodeURIComponent(zoneId)}/dns_records`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  await ensureOk(res, 'Cloudflare API');
  const record = cfUnwrap((await res.json()) as CfWrap<{ id: string; name: string; type: string }>);
  return { id: record.id, name: record.name, type: record.type };
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
): Promise<{ id: string; purged: 'all' | number }> {
  const zoneId = typeof input.zoneId === 'string' ? input.zoneId.trim() : '';
  if (!zoneId) throw new Error('zoneId は必須です');
  const purgeEverything = input.purgeEverything === true;
  const files = Array.isArray(input.files) ? input.files.filter((f): f is string => typeof f === 'string') : [];
  if (!purgeEverything && files.length === 0) {
    throw new Error('purgeEverything=true か、空でない files[] のいずれかが必要です');
  }
  const body = purgeEverything ? { purge_everything: true } : { files };
  const res = await transport(`${CF_API_BASE}/zones/${encodeURIComponent(zoneId)}/purge_cache`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  await ensureOk(res, 'Cloudflare API');
  const result = cfUnwrap((await res.json()) as CfWrap<{ id: string }>);
  return { id: result.id, purged: purgeEverything ? 'all' : files.length };
}

// --- セキュリティ: VirusTotal scan-url (CORS → プロキシ) -------------------
// HIBP の check-email-breach は「404 = 漏洩なし」を fetchViaProxy が
// エラーとして扱い区別できないため未対応 (HIBP 対応プロキシが必要)。

interface SecurityKeys {
  hibp?: string;
  vt?: string;
}

/** Vault のセキュリティトークン(JSON {hibp,vt} か、生文字列なら HIBP キー)を解析。 */
export function parseSecurityKeys(raw: string): SecurityKeys {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as { hibp?: unknown; vt?: unknown } | null;
    if (parsed && typeof parsed === 'object') {
      const out: SecurityKeys = {};
      if (typeof parsed.hibp === 'string' && parsed.hibp) out.hibp = parsed.hibp;
      if (typeof parsed.vt === 'string' && parsed.vt) out.vt = parsed.vt;
      return out;
    }
  } catch {
    return { hibp: raw };
  }
  return {};
}

/** VirusTotal の URL 識別子 = base64url(url) (パディング無し)。 */
function vtBase64(url: string): string {
  return utf8ToBase64(url).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
}

export interface ScanUrlInput {
  url?: unknown;
}

export async function scanUrlVirusTotal(
  input: ScanUrlInput,
  vtKey: string,
  transport: Transport,
): Promise<{ url: string; positives: number; total: number; reportUrl: string }> {
  const url = typeof input.url === 'string' ? input.url.trim() : '';
  if (!url) throw new Error('url は必須です');

  // 解析を投入 (レポートを最新化)。
  const submit = await transport('https://www.virustotal.com/api/v3/urls', {
    method: 'POST',
    headers: { 'x-apikey': vtKey, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ url }).toString(),
  });
  await ensureOk(submit, 'VirusTotal API');

  const id = vtBase64(url);
  const report = await transport(`https://www.virustotal.com/api/v3/urls/${id}`, {
    method: 'GET',
    headers: { 'x-apikey': vtKey },
  });
  await ensureOk(report, 'VirusTotal API');
  const data = (await report.json()) as {
    data: { attributes: { last_analysis_stats: { harmless: number; malicious: number; suspicious: number; undetected: number } } };
  };
  const s = data.data.attributes.last_analysis_stats;
  const positives = s.malicious + s.suspicious;
  const total = s.harmless + s.malicious + s.suspicious + s.undetected;
  return { url, positives, total, reportUrl: `https://www.virustotal.com/gui/url/${id}` };
}
