import { NotConfiguredError, type ServiceClient, type ServiceCredentials } from './types';
import { apiFetch, bearer, jsonBody, type FetchFn } from './http';
import { displayField, requireNumber, requireObject, requireString } from '../apiResponse';
import { WORDPRESS_POST_FIELDS, checkWriteFields, describeWriteFieldFailure } from '../writeFieldLimits';

/** 送り先は 1 つ。読み (下の class) も書き (下書きの作成) も同じ定数を通る。 */
export const WORDPRESS_API = 'https://public-api.wordpress.com/rest/v1.1';
const API = WORDPRESS_API;

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

// --- 下書きの作成 (POST /sites/{id}/posts/new) ------------------------------
/*
 * **両ビルドが同じ関数を通る** (2026-09-18 · オントロジーの組み直し · github.ts と同じ形)。
 * `status` は台帳 (`WORDPRESS_POST_STATUSES`) の外なら `checkWriteFields` が断り、
 * 空なら draft —— main は `?? 'draft'`、ブラウザ版は「非空なら採用」で、揃えて後者。
 */

export type WordPressTransport = (url: string, init: RequestInit) => Promise<Response>;

export interface WordPressPostFields {
  readonly siteId?: unknown;
  readonly title?: unknown;
  readonly content?: unknown;
  readonly status?: unknown;
}

export interface CheckedPost {
  /** blog id か hostname。 */
  readonly siteId: string;
  readonly title: string;
  readonly content: string;
  readonly status: string;
}

/** 欄の型・長さ・status の一覧を共有台帳 (`WORDPRESS_POST_FIELDS`) で断る (パス 111)。 */
export function checkPost(input: WordPressPostFields): CheckedPost {
  const bad = checkWriteFields(input, WORDPRESS_POST_FIELDS);
  if (bad !== null) throw new Error(describeWriteFieldFailure(bad));
  return {
    siteId: typeof input.siteId === 'string' ? input.siteId.trim() : '',
    title: typeof input.title === 'string' ? input.title.trim() : '',
    content: typeof input.content === 'string' ? input.content : '',
    status: typeof input.status === 'string' && input.status.length > 0 ? input.status : 'draft',
  };
}

/** パスの動的部分は encodeURIComponent (不変条件 #6)。 */
export function wordpressPostsPath(post: CheckedPost): string {
  return `/sites/${encodeURIComponent(post.siteId)}/posts/new`;
}

/** 要求の組み立て (`wordpress/create-post-draft`)。 */
export function wordpressPostInit(post: CheckedPost, token: string): RequestInit {
  return {
    method: 'POST',
    headers: jsonBody(token),
    body: JSON.stringify({ title: post.title, content: post.content, status: post.status }),
  };
}

/** ブラウザ版の口: 送って `Response` を返す。 */
export async function createWordPressPostRequest(
  post: CheckedPost,
  token: string,
  transport: WordPressTransport,
): Promise<Response> {
  return transport(`${WORDPRESS_API}${wordpressPostsPath(post)}`, wordpressPostInit(post, token));
}

export interface CreatedPost {
  readonly id: number;
  readonly url: string;
  readonly title: string;
}

/** 応答の `ID` / `URL` / `title` を**形を確かめて**取る (パス 261 / 262)。 */
export function parseCreatedPost(body: unknown): CreatedPost {
  const o = requireObject(body, 'WordPress.com API');
  return {
    id: requireNumber(o, 'ID', 'WordPress.com API'),
    url: requireString(o, 'URL', 'WordPress.com API'),
    title: displayField(requireString(o, 'title', 'WordPress.com API')),
  };
}
