import { jsonFetch, type FetchContext } from './types';

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
      if (!item.pull_request?.url) return fallback;
      try {
        const pr = await jsonFetch<PullDetail>(item.pull_request.url, init, fetchCtx);
        return {
          number: pr.number,
          title: pr.title,
          state: pr.state,
          draft: pr.draft,
          head: pr.head?.ref ?? '',
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
