import { jsonFetch, type FetchContext } from './types';

/**
 * BASE (thebase.com) — ネットショップ作成 EC プラットフォーム連携。
 *
 * BASE は公式 OAuth 2.0 API を提供する (https://api.thebase.in/)。ここでは
 * 商品一覧 (/1/items) を取得して在庫ダッシュボードに正規化する。アクセス
 * トークンの取得 (Authorization Code フロー) は `src/main/oauth.ts` の汎用
 * フローで賄える前提で、ここではトークンを受け取って Bearer 送信するだけ。
 */

interface BaseApiItem {
  item_id: number;
  title: string;
  price: number;
  stock: number;
  visible: number; // 1 = 公開, 0 = 非公開
  identifier?: string;
}

interface BaseItemsResponse {
  items?: BaseApiItem[];
}

export interface BaseSnapshot {
  items: { id: string; name: string; price: number; stock: number; visible: boolean }[];
}

export async function fetchBaseSnapshot(ctx: FetchContext): Promise<BaseSnapshot> {
  const fetchCtx = { fetch: ctx.fetch, serviceId: 'base' };
  const headers = { Authorization: `Bearer ${ctx.token}` };

  const data = await jsonFetch<BaseItemsResponse>(
    'https://api.thebase.in/1/items?limit=30&order=created_at&sort=desc',
    { headers },
    fetchCtx,
  );

  return {
    items: (data.items ?? []).map((it) => ({
      id: String(it.item_id),
      name: it.title,
      price: it.price,
      stock: it.stock,
      visible: it.visible === 1,
    })),
  };
}
