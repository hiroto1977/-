import { NotConfiguredError, type ServiceClient, type ServiceCredentials } from './types';
import { apiFetch, jsonBody, type FetchFn } from './http';
import { requireObject, requireString } from '../apiResponse';
import { NOTION_PAGE_FIELDS, checkWriteFields, describeWriteFieldFailure } from '../writeFieldLimits';

/** 送り先は 1 つ。読み (下の class) も書き (ページの作成) も同じ定数を通る。 */
export const NOTION_API = 'https://api.notion.com/v1';
const API = NOTION_API;
/** Notion は日付つきのバージョン指定が必須。両ビルドで 1 つ。 */
export const NOTION_VERSION = '2022-06-28';

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

// --- ページの作成 (POST /v1/pages) ---------------------------------------
/*
 * **両ビルドが同じ関数を通る** (2026-09-18 · オントロジーの組み直し · github.ts と同じ形)。
 * それまで main と `saasWriteWeb.ts` が別々に組み、ブラウザ版だけが parentPageId /
 * title を trim し、main だけが応答の `id` / `url` を確かめずに返していた。
 */

export type NotionTransport = (url: string, init: RequestInit) => Promise<Response>;

export interface NotionPageFields {
  readonly parentPageId?: unknown;
  readonly title?: unknown;
  readonly body?: unknown;
}

export interface CheckedPage {
  readonly parentPageId: string;
  readonly title: string;
  /** 平文。1 つの段落ブロックになる。 */
  readonly body: string | undefined;
}

/** 欄の型・長さを共有台帳 (`NOTION_PAGE_FIELDS`) で断る (パス 111)。 */
export function checkPage(input: NotionPageFields): CheckedPage {
  const bad = checkWriteFields(input, NOTION_PAGE_FIELDS);
  if (bad !== null) throw new Error(describeWriteFieldFailure(bad));
  return {
    parentPageId: typeof input.parentPageId === 'string' ? input.parentPageId.trim() : '',
    title: typeof input.title === 'string' ? input.title.trim() : '',
    body: typeof input.body === 'string' ? input.body : undefined,
  };
}

export const NOTION_PAGES_PATH = '/pages';

/** 要求の組み立て (`notion/create-page`)。本文は Notion の段落ブロックの形で送る。 */
export function notionPageInit(page: CheckedPage, token: string): RequestInit {
  const children = page.body
    ? [{ object: 'block', type: 'paragraph', paragraph: { rich_text: [{ type: 'text', text: { content: page.body } }] } }]
    : [];
  return {
    method: 'POST',
    headers: jsonBody(token, { 'Notion-Version': NOTION_VERSION }),
    body: JSON.stringify({
      parent: { page_id: page.parentPageId },
      properties: { title: { title: [{ text: { content: page.title } }] } },
      children,
    }),
  };
}

/** ブラウザ版の口: 送って `Response` を返す。ok の判定と本文の読みは呼ぶ側の流儀。 */
export async function createNotionPageRequest(
  page: CheckedPage,
  token: string,
  transport: NotionTransport,
): Promise<Response> {
  return transport(`${NOTION_API}${NOTION_PAGES_PATH}`, notionPageInit(page, token));
}

export interface CreatedPage {
  readonly id: string;
  readonly url: string;
}

/** 200 の本文から `id` / `url` を**形を確かめて**取る (パス 261 / 262)。 */
export function parseCreatedPage(body: unknown): CreatedPage {
  const o = requireObject(body, 'Notion API');
  return { id: requireString(o, 'id', 'Notion API'), url: requireString(o, 'url', 'Notion API') };
}
