import { NotConfiguredError, type ServiceClient, type ServiceCredentials } from './types';
import { apiFetch, jsonBody, type FetchFn } from './http';

const API = 'https://api.notion.com/v1';
/** Notion は日付つきのバージョン指定が必須。 */
const NOTION_VERSION = '2022-06-28';

export interface NotionHit {
  readonly id: string;
  readonly object: string;
  readonly url: string;
  readonly lastEditedTime: string;
}

interface RawHit {
  id: string;
  object: string;
  url?: string;
  last_edited_time?: string;
}

interface RawSearch {
  results?: RawHit[];
}

export class NotionClient implements ServiceClient {
  readonly id = 'notion';
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
    return jsonBody(String(this.creds.token), { 'Notion-Version': NOTION_VERSION });
  }

  async search(query: string): Promise<NotionHit[]> {
    if (!this.isConfigured()) throw new NotConfiguredError(this.id);
    const raw = await apiFetch<RawSearch>(
      `${API}/search`,
      { method: 'POST', headers: this.headers(), body: JSON.stringify({ query }) },
      this.ctx(),
    );
    return (raw.results ?? []).map((r) => ({
      id: r.id,
      object: r.object,
      url: r.url ?? '',
      lastEditedTime: r.last_edited_time ?? '',
    }));
  }

  /** ページを作る。`parent` と `properties` は Notion の形をそのまま渡す。 */
  async createPage(payload: unknown): Promise<NotionHit> {
    if (!this.isConfigured()) throw new NotConfiguredError(this.id);
    const raw = await apiFetch<RawHit>(
      `${API}/pages`,
      { method: 'POST', headers: this.headers(), body: JSON.stringify(payload) },
      this.ctx(),
    );
    return {
      id: raw.id,
      object: raw.object,
      url: raw.url ?? '',
      lastEditedTime: raw.last_edited_time ?? '',
    };
  }
}
