import { jsonFetch, type ActionContext, type ActionMap, type FetchContext } from './types';
import { displayDateOf } from '../../shared/isoDate';
import {
  displayField,
  objectRows,
  optionalString,
  requireNumber,
  requireObject,
  requireString,
} from '../../shared/apiResponse';
import { GITHUB_API, checkIssue, githubIssueInit, githubIssuesPath, parseCreatedIssue } from '../../shared/api/github';
import type { ActionData } from '../../shared/actionData';

interface GithubUser {
  login: string;
  name: string | null;
  company: string | null;
  avatar_url: string;
  html_url: string;
  public_repos: number;
  followers: number;
}

interface SearchItem {
  number: number;
  title: string;
  state: string;
  draft?: boolean;
  html_url: string;
  updated_at: string;
  pull_request?: { url: string };
}

interface SearchResponse {
  items: SearchItem[];
}

interface PullDetail {
  number: number;
  title: string;
  state: string;
  draft: boolean;
  html_url: string;
  updated_at: string;
  head: { ref: string };
  base: { ref: string };
}

export interface GithubSnapshot {
  user: {
    login: string;
    name: string;
    company: string;
    avatarUrl: string;
    profileUrl: string;
    publicRepos: number;
    followers: number;
  };
  pullRequests: {
    number: number;
    title: string;
    state: string;
    draft: boolean;
    head: string;
    base: string;
    /** 更新日 (`YYYY-MM-DD`・利用者の時計)。**読めなければ `null`** (パス 410)。 */
    updatedAt: string | null;
    htmlUrl: string;
  }[];
}

const USER_AGENT = 'service-hub-desktop';

function headers(token: string): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': USER_AGENT,
  };
}

export async function fetchGithubSnapshot(ctx: FetchContext): Promise<GithubSnapshot> {
  const init: RequestInit = { headers: headers(ctx.token) };
  const fetchCtx = { fetch: ctx.fetch, serviceId: 'github' };

  const [user, search] = await Promise.all([
    jsonFetch<GithubUser>('https://api.github.com/user', init, fetchCtx),
    jsonFetch<SearchResponse>(
      'https://api.github.com/search/issues?q=is:pr+author:@me+is:open&per_page=10&sort=updated',
      init,
      fetchCtx,
    ),
  ]);

  // /search/issues returns Issue objects (no head/base). Follow each
  // pull_request.url for the full PR shape. Individual failures (e.g.
  // a private repo we lost access to) degrade gracefully to the search-
  // only fields.
  /*
   * **要素が物であることも、配列であることも検める** (2026-09-22 · パス 412)。
   * 実測 (直す前): `items` が文字列 → `items.map is not a function` /
   * 要素が `null` → `Cannot read properties of null (reading 'number')` ——
   * **どちらも GitHub の取得が丸ごと失敗する**。
   */
  const items = objectRows<SearchItem>(search.items);
  const pulls = await Promise.all(
    items.map(async (item): Promise<GithubSnapshot['pullRequests'][number]> => {
      const fallback = {
        number: item.number,
        // 画面の欄へ入る第三者の文字列は天井を通す (パス 411) —— 実測で
        // 6 欄に 200,000 字を入れると `GithubPage` の総文字数が 1,400,096 字に
        // なった。PR のタイトルとブランチ名は**フォークから PR を開ける誰でも**
        // 決められる欄である。
        title: displayField(item.title),
        state: displayField(item.state),
        draft: item.draft ?? false,
        head: '',
        base: '',
        updatedAt: displayDateOf(item.updated_at),
        htmlUrl: item.html_url,
      };
      // Stryker disable next-line ConditionalExpression: the `!url` early
      // return is equivalent to falling through to `new URL(undefined)`
      // which throws and is caught below, returning the same fallback.
      // All branches converge on `return fallback` when url is missing.
      if (!item.pull_request?.url) return fallback;
      // The PR URL is server-supplied (echoed back from search results)
      // so technically untrusted. Pin to api.github.com to defend against
      // a hijacked /search/issues response that points us elsewhere.
      // 取りに行くのは**関門の返り値** `prUrl.href` (パス 325)。生の文字列を渡しても
      // `fetch` が同じ URL parser で解くので今日の送り先は一致するが、一致が
      // 「両側が同じ parser を使う」という別の前提に依る形になる。隣の
      // salesforce 同期は最初から `base.origin` を使っていた。
      //
      // **ローカルの裸の変数 (`target` など) には置き換えない。** `lint:network-targets`
      // の `BARE_SEND` は「プロパティ参照」だけを拾う設計で、その限界は docblock に
      // 明記されている (`const u = cfg.url; fetch(u, …)` は掛からない) ——
      // 裸の名前にすると、この送り先が台帳の視野から黙って外れる。
      let prUrl: URL;
      try {
        prUrl = new URL(item.pull_request.url);
      } catch {
        return fallback;
      }
      if (prUrl.protocol !== 'https:' || prUrl.hostname !== 'api.github.com') return fallback;
      try {
        const pr = await jsonFetch<PullDetail>(prUrl.href, init, fetchCtx);
        return {
          number: pr.number,
          title: displayField(pr.title),
          state: displayField(pr.state),
          draft: pr.draft,
          // Stryker disable next-line OptionalChaining
          head: displayField(pr.head?.ref),
          // Stryker disable next-line OptionalChaining
          base: displayField(pr.base?.ref),
          updatedAt: displayDateOf(pr.updated_at),
          htmlUrl: pr.html_url,
        };
      } catch {
        return fallback;
      }
    }),
  );

  /*
   * **画面に出る欄を 1 つずつ要求する** (パス 262)。封筒は `jsonFetch` が
   * 見るが、`{}` の応答では 6 欄すべてが `undefined` のまま
   * スナップショットへ入り、`publicRepos` / `followers` は
   * **数として画面に刷られる** —— 14 のクライアントのうち、壊れた応答が
   * 「エラー」ではなく「データ」として画面へ届くのはここだけだった (実測)。
   * 名前と会社は元から `null` を取り得る欄なので任意のままにする。
   */
  const u = requireObject(user, 'GitHub API');
  return {
    user: {
      login: displayField(requireString(u, 'login', 'GitHub API')),
      name: displayField(optionalString(u, 'name') ?? requireString(u, 'login', 'GitHub API')),
      company: displayField(u['company']),
      avatarUrl: requireString(u, 'avatar_url', 'GitHub API'),
      profileUrl: requireString(u, 'html_url', 'GitHub API'),
      publicRepos: requireNumber(u, 'public_repos', 'GitHub API'),
      followers: requireNumber(u, 'followers', 'GitHub API'),
    },
    pullRequests: pulls,
  };
}

// --- write-side actions --------------------------------------------------

/**
 * `create-issue` の payload の宣言 (§3.2 の表がこの名前で照合する)。欄の判定は
 * shared の `checkIssue` (`GithubIssueFields` = 欄が unknown の受け口) が行う。
 */
export interface CreateIssuePayload {
  owner: string;
  repo: string;
  title: string;
  body?: string;
  labels?: string[];
}

async function createIssue(ctx: ActionContext): Promise<ActionData<'github/create-issue'>> {
  /*
   * 欄の判定・URL・要求・応答の読みは **`shared/api/github.ts` の 1 つ**を通る
   * (ブラウザ版も同じ関数を呼ぶ · 2026-09-18 のオントロジーの組み直し)。
   * ここが持つのは main の流儀だけ —— `jsonFetch` の打ち切り・上限・封筒と、
   * ブラウザには付けられない `User-Agent`。
   */
  const issue = checkIssue(ctx.payload);
  const res = await jsonFetch<Record<string, unknown>>(
    `${GITHUB_API}${githubIssuesPath(issue)}`,
    githubIssueInit(issue, ctx.token, { 'User-Agent': USER_AGENT }),
    { fetch: ctx.fetch, serviceId: 'github' },
  );
  return parseCreatedIssue(res);
}

export const ACTIONS: ActionMap = {
  'create-issue': createIssue,
};
