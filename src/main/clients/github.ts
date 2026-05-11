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

interface GithubPull {
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

  const user = await jsonFetch<GithubUser>('https://api.github.com/user', init, fetchCtx);
  const pulls = await jsonFetch<GithubPull[]>(
    'https://api.github.com/search/issues?q=is:pr+author:@me+is:open&per_page=10&sort=updated',
    init,
    fetchCtx,
  ).then((r: unknown) => (r as { items: GithubPull[] }).items ?? []);

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
    pullRequests: pulls.map((p) => ({
      number: p.number,
      title: p.title,
      state: p.state,
      draft: p.draft,
      head: p.head?.ref ?? '',
      base: p.base?.ref ?? '',
      updatedAt: p.updated_at,
      htmlUrl: p.html_url,
    })),
  };
}
