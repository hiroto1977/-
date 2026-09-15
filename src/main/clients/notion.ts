import { jsonFetch, type ActionContext, type ActionMap, type FetchContext } from './types';
import { readArrayField } from '../../shared/apiResponse';
import { NOTION_PAGE_FIELDS, checkWriteFields, describeWriteFieldFailure } from '../../shared/writeFieldLimits';
import type { ActionData } from '../../shared/actionData';


interface NotionPage {
  id: string;
  url: string;
  last_edited_time: string;
  properties?: Record<string, unknown>;
  parent?: { type: string };
  object: 'page' | 'database';
}

interface NotionSearchResponse {
  results: NotionPage[];
}

export interface NotionSnapshot {
  teams: { id: string; name: string }[];
  note: string;
  pages: { id: string; title: string; url: string; lastEditedTime: string; kind: string }[];
}

function extractTitle(page: NotionPage): string {
  const props = page.properties ?? {};
  for (const value of Object.values(props)) {
    const v = value as { type?: string; title?: { plain_text?: string }[] };
    if (v?.type === 'title' && Array.isArray(v.title)) {
      const text = v.title.map((t) => t.plain_text ?? '').join('').trim();
      if (text) return text;
    }
  }
  return '(無題)';
}

export async function fetchNotionSnapshot(ctx: FetchContext): Promise<NotionSnapshot> {
  const fetchCtx = { fetch: ctx.fetch, serviceId: 'notion' };
  const headers = {
    Authorization: `Bearer ${ctx.token}`,
    'Notion-Version': '2022-06-28',
    'Content-Type': 'application/json',
  };

  const search = await jsonFetch<NotionSearchResponse>(
    'https://api.notion.com/v1/search',
    {
      method: 'POST',
      headers,
      body: JSON.stringify({
        page_size: 10,
        sort: { direction: 'descending', timestamp: 'last_edited_time' },
      }),
    },
    fetchCtx,
  );

  /*
   * **`results` が在ったのかどうかを見る** (2026-09-14 · パス 264)。
   *
   * 以前は `(search.results ?? []).map(…)` で、鍵が無いことと空の配列を
   * 同じ `[]` に畳んでいた。そこから作られる `note` は
   * 「インテグレーションに共有されたページなし」—— **利用者の Notion の
   * 設定についての診断**である。本文が `{}` でもその文が出るので、
   * 共有は正しいのに共有設定を直しに行かせることになる。
   */
  const list = readArrayField(search, 'results');
  const pages = (list.rows as readonly NotionPage[]).map((p) => ({
    id: p.id,
    title: extractTitle(p),
    url: p.url,
    lastEditedTime: p.last_edited_time,
    kind: p.object,
  }));

  return {
    teams: [],
    note: !list.read
      ? '共有ページの一覧を読み取れませんでした (応答に results がありません)。件数は 0 ではなく不明です。'
      : pages.length === 0
        ? 'インテグレーションに共有されたページなし'
        : `${pages.length} 件取得`,
    pages,
  };
}

// --- write-side actions --------------------------------------------------

interface CreatePagePayload {
  parentPageId: string; // a page id the integration has access to
  title: string;
  body?: string; // plain text — turned into a single paragraph block
}

interface NotionCreatePageResponse {
  id: string;
  url: string;
}

async function createPage(ctx: ActionContext): Promise<ActionData<'notion/create-page'>> {
  // 欄の型と長さは共有の台帳で断る (パス 111)。それまでは `!parentPageId || !title` だけだった。
  const bad = checkWriteFields(ctx.payload, NOTION_PAGE_FIELDS);
  if (bad !== null) throw new Error(describeWriteFieldFailure(bad));
  const { parentPageId, title, body } = ctx.payload as unknown as CreatePagePayload;

  const blocks = body
    ? [
        {
          object: 'block',
          type: 'paragraph',
          paragraph: { rich_text: [{ type: 'text', text: { content: body } }] },
        },
      ]
    : [];

  const res = await jsonFetch<NotionCreatePageResponse>(
    'https://api.notion.com/v1/pages',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${ctx.token}`,
        'Notion-Version': '2022-06-28',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        parent: { page_id: parentPageId },
        properties: {
          title: { title: [{ text: { content: title } }] },
        },
        children: blocks,
      }),
    },
    { fetch: ctx.fetch, serviceId: 'notion' },
  );

  return { id: res.id, url: res.url };
}

export const ACTIONS: ActionMap = {
  'create-page': createPage,
};
