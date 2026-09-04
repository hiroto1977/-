import { NotConfiguredError, type ServiceClient, type ServiceCredentials } from './types';
import {
  normalizeAtlassianSiteResult,
  type AtlassianSiteFailure,
} from '../atlassianSite';
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
 * 実体は `src/shared/atlassianSite.ts`。ここは `ApiError` への言い換えだけを
 * 持つ。以前はこの関数が検証を丸ごと持っており、説明文には
 * 「`src/main/clients/atlassian.ts` と同じ防御を張っている」と書いてあったが、
 * **実際には同じではなかった** (向こうは元の文字列から末尾の `/` を落とすだけ
 * だった)。同じだと書くなら同じ実装を指すようにする。
 */
export function normalizeAtlassianSite(raw: string): string {
  const result = normalizeAtlassianSiteResult(raw);
  if (result.ok) return result.site;
  throw new ApiError(ATLASSIAN_SITE_MESSAGES[result.reason], 0, 'atlassian');
}

const ATLASSIAN_SITE_MESSAGES: Record<AtlassianSiteFailure, string> = {
  'control-char': 'Atlassian の baseUrl に制御文字が含まれています',
  'not-a-url': 'Atlassian の baseUrl を URL として解釈できません',
  'not-https': 'Atlassian の baseUrl は https:// で始まる必要があります',
  'not-atlassian': 'Atlassian の baseUrl は *.atlassian.net である必要があります',
};

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
