import { NotConfiguredError, type ServiceClient, type ServiceCredentials } from './types';
import {
  ApiError,
  NotImplementedError,
  apiFetch,
  bearer,
  withQuery,
  type FetchFn,
} from './http';

export interface JiraIssue {
  readonly key: string;
  readonly summary: string;
  readonly status: string;
}

export interface ConfluencePage {
  readonly id: string;
  readonly title: string;
  readonly spaceId: string;
}

interface RawSearch {
  issues?: { key: string; fields?: { summary?: string; status?: { name?: string } } }[];
}

interface RawPage {
  id: string;
  title?: string;
  spaceId?: string;
}

/**
 * 利用者が入れた site URL を検証する。
 *
 * `src/main/clients/atlassian.ts` と同じ防御を張っている。**baseUrl は
 * 利用者入力なので、そのまま連結すると社内ホストへ向けさせられる**
 * (SSRF)。Atlassian Cloud は必ず `*.atlassian.net` の https なので、
 * そこまで絞ってから使う。
 */
function hasControlChar(s: string): boolean {
  // 正規表現の文字クラスで書くと eslint の no-control-regex に当たる。
  // ルールを黙らせるより、走査で同じことをする方が読み手にも明確。
  for (const ch of s) {
    const c = ch.charCodeAt(0);
    if (c < 0x20 || c === 0x7f) return true;
  }
  return false;
}

export function normalizeAtlassianSite(raw: string): string {
  if (hasControlChar(raw)) {
    throw new ApiError('Atlassian の baseUrl に制御文字が含まれています', 0, 'atlassian');
  }
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new ApiError('Atlassian の baseUrl を URL として解釈できません', 0, 'atlassian');
  }
  if (parsed.protocol !== 'https:') {
    throw new ApiError('Atlassian の baseUrl は https:// で始まる必要があります', 0, 'atlassian');
  }
  if (!parsed.hostname.endsWith('.atlassian.net')) {
    throw new ApiError('Atlassian の baseUrl は *.atlassian.net である必要があります', 0, 'atlassian');
  }
  // hostname だけを使って組み直す。貼り付け事故で混ざる末尾の `/` やパス・
  // クエリを落とすため (`https://x.atlassian.net//` のような形になりやすい)。
  return `https://${parsed.hostname}`;
}

export class AtlassianClient implements ServiceClient {
  readonly id = 'atlassian';
  constructor(
    private readonly creds: ServiceCredentials = {},
    private readonly fetchFn?: FetchFn,
  ) {}

  isConfigured(): boolean {
    return Boolean(this.creds.token && this.creds.baseUrl);
  }

  private ctx(): { fetch?: FetchFn; serviceId: string } {
    return { fetch: this.fetchFn, serviceId: this.id };
  }

  private site(): string {
    if (!this.isConfigured()) throw new NotConfiguredError(this.id);
    return normalizeAtlassianSite(String(this.creds.baseUrl));
  }

  async searchJira(jql: string, maxResults = 50): Promise<JiraIssue[]> {
    const site = this.site();
    const raw = await apiFetch<RawSearch>(
      withQuery(`${site}/rest/api/3/search`, { jql, maxResults, fields: 'summary,status' }),
      { headers: bearer(String(this.creds.token), { Accept: 'application/json' }) },
      this.ctx(),
    );
    return (raw.issues ?? []).map((i) => ({
      key: i.key,
      summary: i.fields?.summary ?? '',
      status: i.fields?.status?.name ?? '',
    }));
  }

  /** Confluence Cloud v2。ページ ID からタイトル・スペースを引く。 */
  async getConfluencePage(pageId: string): Promise<ConfluencePage> {
    const site = this.site();
    const raw = await apiFetch<RawPage>(
      `${site}/wiki/api/v2/pages/${encodeURIComponent(pageId)}`,
      { headers: bearer(String(this.creds.token), { Accept: 'application/json' }) },
      this.ctx(),
    );
    return { id: raw.id, title: raw.title ?? '', spaceId: raw.spaceId ?? '' };
  }

  /**
   * **未実装。**
   *
   * Compass はコンポーネント一覧に REST を出しておらず、`/gateway/api/graphql`
   * の GraphQL しか無い。クエリの形を一次資料で確認できていないので、
   * 推測で組んで動くふりをするより落とす方を採る。以前のスタブは `[]` を
   * 返しており、「コンポーネントが 0 件ある」と区別が付かなかった。
   */
  async listCompassComponents(): Promise<never> {
    if (!this.isConfigured()) throw new NotConfiguredError(this.id);
    throw new NotImplementedError(
      this.id,
      'listCompassComponents',
      'Compass は REST を持たず GraphQL (/gateway/api/graphql) のみで、クエリの形を一次資料で確認できていません',
    );
  }
}
