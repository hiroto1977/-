import { jsonFetch, type ActionContext, type ActionMap, type FetchContext } from './types';

interface CanvaDesign {
  id: string;
  title?: string;
  thumbnail?: { url: string };
  urls?: { view_url?: string; edit_url?: string };
  updated_at?: number;
  page_count?: number;
}

interface CanvaDesignsResponse {
  items: CanvaDesign[];
}

interface CanvaBrandKit {
  id: string;
  name?: string;
}

interface CanvaBrandKitsResponse {
  items: CanvaBrandKit[];
}

export interface CanvaSnapshot {
  brandKits: { id: string }[];
  designs: {
    id: string;
    title: string;
    updatedAt: number;
    pageCount: number;
    thumbnailUrl: string;
    viewUrl: string;
  }[];
}

export async function fetchCanvaSnapshot(ctx: FetchContext): Promise<CanvaSnapshot> {
  const fetchCtx = { fetch: ctx.fetch, serviceId: 'canva' };
  const headers = { Authorization: `Bearer ${ctx.token}` };

  const [designsRes, brandKitsRes] = await Promise.all([
    jsonFetch<CanvaDesignsResponse>(
      'https://api.canva.com/rest/v1/designs?ownership=any&sort_by=modified_descending',
      { headers },
      fetchCtx,
    ),
    jsonFetch<CanvaBrandKitsResponse>('https://api.canva.com/rest/v1/brand-kits', { headers }, fetchCtx).catch(
      () => ({ items: [] as CanvaBrandKit[] }),
    ),
  ]);

  return {
    brandKits: (brandKitsRes.items ?? []).map((b) => ({ id: b.id })),
    designs: (designsRes.items ?? []).slice(0, 12).map((d) => ({
      id: d.id,
      title: d.title ?? '(無題のデザイン)',
      updatedAt: d.updated_at ?? 0,
      pageCount: d.page_count ?? 1,
      thumbnailUrl: d.thumbnail?.url ?? '',
      viewUrl: d.urls?.view_url ?? `https://www.canva.com/design/${d.id}`,
    })),
  };
}

// --- write-side actions --------------------------------------------------

interface CreateFolderPayload {
  name: string;
  parentFolderId?: string; // omitted → "root"
}

interface CanvaCreateFolderResponse {
  folder: {
    id: string;
    name: string;
  };
}

async function createFolder(ctx: ActionContext): Promise<{ id: string; name: string }> {
  const { name, parentFolderId } = ctx.payload as unknown as CreateFolderPayload;
  if (!name) throw new Error('name is required');

  const res = await jsonFetch<CanvaCreateFolderResponse>(
    'https://api.canva.com/rest/v1/folders',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${ctx.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name,
        parent_folder_id: parentFolderId ?? 'root',
      }),
    },
    { fetch: ctx.fetch, serviceId: 'canva' },
  );

  return { id: res.folder.id, name: res.folder.name };
}

export const ACTIONS: ActionMap = {
  'create-folder': createFolder,
};
