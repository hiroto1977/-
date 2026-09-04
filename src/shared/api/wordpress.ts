import { NotConfiguredError, type ServiceClient, type ServiceCredentials } from './types';
import { apiFetch, bearer, jsonBody, type FetchFn } from './http';

const API = 'https://public-api.wordpress.com/rest/v1.1';

export interface WordPressSite {
  readonly id: number;
  readonly name: string;
  readonly url: string;
}

export interface WordPressPost {
  readonly id: number;
  readonly title: string;
  readonly status: string;
  readonly url: string;
}

export interface DomainAvailability {
  readonly domain: string;
  readonly available: boolean;
  readonly status: string;
}

interface RawSites {
  sites?: { ID: number; name: string; URL: string }[];
}

interface RawPost {
  ID: number;
  title: string;
  status: string;
  URL: string;
}

interface RawAvailability {
  status?: string;
}

export class WordPressClient implements ServiceClient {
  readonly id = 'wordpress';
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

  async listSites(): Promise<WordPressSite[]> {
    if (!this.isConfigured()) throw new NotConfiguredError(this.id);
    const raw = await apiFetch<RawSites>(
      `${API}/me/sites`,
      { headers: bearer(String(this.creds.token)) },
      this.ctx(),
    );
    return (raw.sites ?? []).map((s) => ({ id: s.ID, name: s.name, url: s.URL }));
  }

  /**
   * 下書きとして投稿を作る。
   *
   * **`status: 'draft'` は呼び出し側の payload で上書きさせない。** メソッド名が
   * 下書きだと言っている以上、渡された status で公開されるのは事故になる。
   */
  async createPostDraft(siteId: string, payload: Record<string, unknown>): Promise<WordPressPost> {
    if (!this.isConfigured()) throw new NotConfiguredError(this.id);
    const raw = await apiFetch<RawPost>(
      `${API}/sites/${encodeURIComponent(siteId)}/posts/new`,
      {
        method: 'POST',
        headers: jsonBody(String(this.creds.token)),
        body: JSON.stringify({ ...payload, status: 'draft' }),
      },
      this.ctx(),
    );
    return { id: raw.ID, title: raw.title, status: raw.status, url: raw.URL };
  }

  async checkDomainAvailability(domain: string): Promise<DomainAvailability> {
    if (!this.isConfigured()) throw new NotConfiguredError(this.id);
    const raw = await apiFetch<RawAvailability>(
      `${API}/domains/${encodeURIComponent(domain)}/is-available`,
      { headers: bearer(String(this.creds.token)) },
      this.ctx(),
    );
    const status = raw.status ?? '';
    return { domain, available: status === 'available', status };
  }
}
