import { jsonFetch, type ActionContext, type ActionMap, type FetchContext } from './types';

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
    updatedAt: string;
    htmlUrl: string;
  }[];
}

function headers(token: string): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'service-hub-desktop',
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
  const items = search.items ?? [];
  const pulls = await Promise.all(
    items.map(async (item): Promise<GithubSnapshot['pullRequests'][number]> => {
      const fallback = {
        number: item.number,
        title: item.title,
        state: item.state,
        draft: item.draft ?? false,
        head: '',
        base: '',
        updatedAt: item.updated_at,
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
      try {
        const u = new URL(item.pull_request.url);
        if (u.protocol !== 'https:' || u.hostname !== 'api.github.com') return fallback;
      } catch {
        return fallback;
      }
      try {
        const pr = await jsonFetch<PullDetail>(item.pull_request.url, init, fetchCtx);
        return {
          number: pr.number,
          title: pr.title,
          state: pr.state,
          draft: pr.draft,
          // Stryker disable next-line OptionalChaining
          head: pr.head?.ref ?? '',
          // Stryker disable next-line OptionalChaining
          base: pr.base?.ref ?? '',
          updatedAt: pr.updated_at,
          htmlUrl: pr.html_url,
        };
      } catch {
        return fallback;
      }
    }),
  );

  return {
    user: {
      login: user.login,
      name: user.name ?? user.login,
      company: user.company ?? '',
      avatarUrl: user.avatar_url,
      profileUrl: user.html_url,
      publicRepos: user.public_repos,
      followers: user.followers,
    },
    pullRequests: pulls,
  };
}

// --- write-side actions --------------------------------------------------

interface CreateIssuePayload {
  owner: string;
  repo: string;
  title: string;
  body?: string;
  labels?: string[];
}

interface CreateIssueResponse {
  number: number;
  html_url: string;
  title: string;
  state: string;
}

async function createIssue(ctx: ActionContext): Promise<{ number: number; url: string; title: string }> {
  const { owner, repo, title, body, labels } = ctx.payload as unknown as CreateIssuePayload;
  if (!owner || !repo || !title) {
    throw new Error('owner, repo, title are required');
  }
  const res = await jsonFetch<CreateIssueResponse>(
    `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/issues`,
    {
      method: 'POST',
      headers: { ...headers(ctx.token), 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, body, labels }),
    },
    { fetch: ctx.fetch, serviceId: 'github' },
  );
  return { number: res.number, url: res.html_url, title: res.title };
}

export const ACTIONS: ActionMap = {
  'create-issue': createIssue,
};
