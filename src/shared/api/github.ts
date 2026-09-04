import { NotConfiguredError, type ServiceClient, type ServiceCredentials } from './types';
import { apiFetch, bearer, withQuery, type FetchFn } from './http';

const API = 'https://api.github.com';

/** REST の生の形のうち、この層が約束する分だけ。 */
export interface GithubRepo {
  readonly id: number;
  readonly name: string;
  readonly fullName: string;
  readonly private: boolean;
  readonly htmlUrl: string;
  readonly updatedAt: string;
}

export interface GithubIssueLike {
  readonly number: number;
  readonly title: string;
  readonly state: string;
  readonly htmlUrl: string;
  readonly updatedAt: string;
  readonly isPullRequest: boolean;
}

interface RawRepo {
  id: number;
  name: string;
  full_name: string;
  private: boolean;
  html_url: string;
  updated_at: string;
}

interface RawIssue {
  number: number;
  title: string;
  state: string;
  html_url: string;
  updated_at: string;
  pull_request?: unknown;
}

interface RawSearch {
  items?: RawIssue[];
}

function toRepo(r: RawRepo): GithubRepo {
  return {
    id: r.id,
    name: r.name,
    fullName: r.full_name,
    private: r.private,
    htmlUrl: r.html_url,
    updatedAt: r.updated_at,
  };
}

function toIssue(i: RawIssue): GithubIssueLike {
  return {
    number: i.number,
    title: i.title,
    state: i.state,
    htmlUrl: i.html_url,
    updatedAt: i.updated_at,
    // REST の issue には PR も混ざる。`pull_request` の有無だけが両者の違い。
    isPullRequest: i.pull_request !== undefined,
  };
}

export class GithubClient implements ServiceClient {
  readonly id = 'github';
  constructor(
    private readonly creds: ServiceCredentials = {},
    private readonly fetchFn?: FetchFn,
  ) {}

  isConfigured(): boolean {
    return Boolean(this.creds.token);
  }

  private ctx(): { fetch?: FetchFn; serviceId: string } {
    return { fetch: this.fetchFn, serviceId: this.id };
  }

  private headers(): Record<string, string> {
    return bearer(String(this.creds.token), {
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
    });
  }

  /** 認証ユーザーのリポジトリ。更新の新しい順。 */
  async listRepos(perPage = 30): Promise<GithubRepo[]> {
    if (!this.isConfigured()) throw new NotConfiguredError(this.id);
    const raw = await apiFetch<RawRepo[]>(
      withQuery(`${API}/user/repos`, { per_page: perPage, sort: 'updated' }),
      { headers: this.headers() },
      this.ctx(),
    );
    return raw.map(toRepo);
  }

  /** 自分が author の open な PR。 */
  async listPullRequests(perPage = 30): Promise<GithubIssueLike[]> {
    if (!this.isConfigured()) throw new NotConfiguredError(this.id);
    const raw = await apiFetch<RawSearch>(
      withQuery(`${API}/search/issues`, {
        q: 'is:pr author:@me is:open',
        per_page: perPage,
        sort: 'updated',
      }),
      { headers: this.headers() },
      this.ctx(),
    );
    return (raw.items ?? []).map(toIssue);
  }

  /** 認証ユーザーに割り当てられた issue。 */
  async listIssues(perPage = 30): Promise<GithubIssueLike[]> {
    if (!this.isConfigured()) throw new NotConfiguredError(this.id);
    const raw = await apiFetch<RawIssue[]>(
      withQuery(`${API}/issues`, { per_page: perPage, filter: 'assigned', state: 'open' }),
      { headers: this.headers() },
      this.ctx(),
    );
    return raw.map(toIssue);
  }
}
