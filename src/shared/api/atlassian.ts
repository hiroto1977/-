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
import { utf8ToBase64 } from '../base64';
import { jiraBrowseUrl } from '../atlassianLinks';
import { displayField, requireObject, requireString } from '../apiResponse';
import { ATLASSIAN_ISSUE_FIELDS, checkWriteFields, describeWriteFieldFailure } from '../writeFieldLimits';

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

// --- Jira: 課題の作成 (`atlassian/create-issue`) —— 両ビルドが同じ関数を通る (パス 321) ---

export type AtlassianTransport = (url: string, init: RequestInit) => Promise<Response>;

/** 保存 JSON から取り出した資格情報。`site` は `normalizeAtlassianSiteResult` を通った `https://<host>`。 */
export interface AtlassianBasicCreds {
  readonly email: string;
  readonly token: string;
  readonly site: string;
}

/**
 * API token の Basic 認証。`btoa` は Latin-1 しか受けないので UTF-8 を通す
 * (main は `Buffer` で、ブラウザ版は `btoa` で、と 2 つ在った —— 多バイトの email は
 * ブラウザ版だけが投げていた)。
 */
export function basicAuthorization(email: string, token: string): string {
  return 'Basic ' + utf8ToBase64(`${email}:${token}`);
}

export interface AtlassianIssueFields {
  readonly projectKey?: unknown;
  readonly summary?: unknown;
  readonly description?: unknown;
  readonly issueType?: unknown;
}

/** 台帳を通った課題。`issueType` は空なら Task (任意の欄の空文字は「無い」)。 */
export interface CheckedJiraIssue {
  readonly projectKey: string;
  readonly summary: string;
  readonly description?: string;
  readonly issueType: string;
}

/** 欄の型と長さは共有の台帳で断る (パス 111)。それまで文字列でない `description` は**落として**送っていた。 */
export function checkJiraIssue(input: AtlassianIssueFields): CheckedJiraIssue {
  const bad = checkWriteFields(input, ATLASSIAN_ISSUE_FIELDS);
  if (bad !== null) throw new Error(describeWriteFieldFailure(bad));
  const description = typeof input.description === 'string' && input.description.length > 0 ? input.description : undefined;
  const issueType = typeof input.issueType === 'string' && input.issueType.length > 0 ? input.issueType : 'Task';
  return {
    projectKey: String(input.projectKey).trim(),
    summary: String(input.summary).trim(),
    ...(description === undefined ? {} : { description }),
    issueType,
  };
}

export const JIRA_ISSUE_PATH = '/rest/api/3/issue';

/** 要求の組み立て。Jira Cloud REST v3 は description に Atlassian Document Format を要る。 */
export function jiraIssueInit(issue: CheckedJiraIssue, creds: { readonly email: string; readonly token: string }): RequestInit {
  const descBody =
    issue.description === undefined
      ? undefined
      : { type: 'doc', version: 1, content: [{ type: 'paragraph', content: [{ type: 'text', text: issue.description }] }] };
  return {
    method: 'POST',
    headers: {
      Authorization: basicAuthorization(creds.email, creds.token),
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      fields: {
        project: { key: issue.projectKey },
        summary: issue.summary,
        issuetype: { name: issue.issueType },
        ...(descBody ? { description: descBody } : {}),
      },
    }),
  };
}

/** ブラウザ版の口: 送って `Response` を返す。送り先は検証済みの `creds.site` だけ (`lint:network-targets` の台帳)。 */
export async function createJiraIssueRequest(
  issue: CheckedJiraIssue,
  creds: AtlassianBasicCreds,
  transport: AtlassianTransport,
): Promise<Response> {
  return transport(`${creds.site}${JIRA_ISSUE_PATH}`, jiraIssueInit(issue, creds));
}

export interface CreatedJiraIssue {
  readonly key: string;
  readonly url: string;
}

/** 応答の `key` を**形を確かめて**取り、`/browse/<key>` を添える (組み立ては `atlassianLinks.ts` の 1 つ)。 */
export function parseCreatedJiraIssue(body: unknown, site: string): CreatedJiraIssue {
  const key = displayField(requireString(requireObject(body, 'Atlassian API'), 'key', 'Atlassian API'));
  return { key, url: jiraBrowseUrl(site, key) };
}
