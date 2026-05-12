import { jsonFetch, type ActionContext, type ActionMap, type FetchContext } from './types';

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

  const pages = (search.results ?? []).map((p) => ({
    id: p.id,
    title: extractTitle(p),
    url: p.url,
    lastEditedTime: p.last_edited_time,
    kind: p.object,
  }));

  return {
    teams: [],
    note: pages.length === 0 ? 'インテグレーションに共有されたページなし' : `${pages.length} 件取得`,
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

async function createPage(ctx: ActionContext): Promise<{ id: string; url: string }> {
  const { parentPageId, title, body } = ctx.payload as unknown as CreatePagePayload;
  if (!parentPageId || !title) throw new Error('parentPageId and title are required');

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
