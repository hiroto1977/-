import { jsonFetch, FetchError, type ActionContext, type ActionMap, type FetchContext } from './types';
import { displayField, objectRows, optionalString } from '../../shared/apiResponse';
import { CANVA_API, CANVA_FOLDERS_PATH, canvaFolderInit, checkFolder, parseCreatedFolder } from '../../shared/api/canva';
import type { ActionData } from '../../shared/actionData';

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
    // brand-kits requires the brandkit:read scope which not all tokens
    // grant; swallow ONLY the predictable "endpoint disabled / missing
    // scope" responses (403/404) so the rest of the snapshot still
    // works, but propagate auth/rate-limit failures so the user sees
    // them.
    jsonFetch<CanvaBrandKitsResponse>(
      'https://api.canva.com/rest/v1/brand-kits',
      { headers },
      fetchCtx,
    ).catch((err: unknown): CanvaBrandKitsResponse => {
      if (err instanceof FetchError && (err.status === 403 || err.status === 404)) {
        // 中身は下の `brandKitsRes.items ?? []` が吸うので、ここで空配列を
        // 入れても入れなくても結果は変わらない (型を満たすために置いている)。
        // Stryker disable next-line ObjectLiteral: 下流の `?? []` と重なる (単独では観測不能)
        return { items: [] };
      }
      throw err;
    }),
  ]);

  return {
    brandKits: objectRows<CanvaBrandKit>(brandKitsRes.items).map((b) => ({ id: displayField(b.id) })),
    designs: objectRows<CanvaDesign>(designsRes.items).slice(0, 12).map((d) => ({
      id: displayField(d.id),
      // **画面の欄へ入る第三者の文字列は天井を通る** (2026-09-22 · パス 415)。
      // 実測 (直す前): デザイン名に 200,000 字を入れると `CanvaPage` の
      // 総文字数が **200,181 字**になった (パス 410 はこの欄の**型**を直したが、
      // **長さ**は据え置かれていた)。
      title: displayField(d.title) || '(無題のデザイン)',
      updatedAt: d.updated_at ?? 0,
      pageCount: d.page_count ?? 1,
      /*
       * `?? ''` は **null / undefined しか受けない** ので、`thumbnail: {url: 42}`
       * がそのまま `thumbnailUrl` に入り、`safeImageSrc` が `url.replace is not a
       * function` で投げて**画面が丸ごと落ちていた** (2026-09-22 · 実測 · パス 410)。
       * 関門の側にも床を置いたが、**境界で型を確かめるのが先**である。
       */
      thumbnailUrl:
        d.thumbnail !== null && typeof d.thumbnail === 'object'
          ? optionalString(d.thumbnail as unknown as Record<string, unknown>, 'url') ?? ''
          : '',
      viewUrl: d.urls?.view_url ?? `https://www.canva.com/design/${d.id}`,
    })),
  };
}

// --- write-side actions --------------------------------------------------

/**
 * `create-folder` の payload の宣言 (§3.2 の表がこの名前で照合する)。欄の判定は
 * shared の `checkFolder` (`CanvaFolderFields` = 欄が unknown の受け口) が行う。
 */
export interface CreateFolderPayload {
  name: string;
  parentFolderId?: string; // omitted → "root"
}

async function createFolder(ctx: ActionContext): Promise<ActionData<'canva/create-folder'>> {
  // 欄の判定・URL・要求・応答の読みは shared/api/canva.ts の 1 つ (ブラウザ版も同じ関数 · 2026-09-18)。
  const folder = checkFolder(ctx.payload);
  const res = await jsonFetch<Record<string, unknown>>(
    `${CANVA_API}${CANVA_FOLDERS_PATH}`,
    canvaFolderInit(folder, ctx.token),
    { fetch: ctx.fetch, serviceId: 'canva' },
  );
  return parseCreatedFolder(res);
}

export const ACTIONS: ActionMap = {
  'create-folder': createFolder,
};
