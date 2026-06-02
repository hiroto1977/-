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
