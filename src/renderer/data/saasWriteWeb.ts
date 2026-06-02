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
