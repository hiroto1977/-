import { jsonFetch, type FetchContext } from './types';
import { displayField, finiteNumberOf, objectRows } from '../../shared/apiResponse';

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
  /**
   * `price` / `stock` が `number | null` なのは**相手が返さないことが在る**ため
   * (2026-09-22 · パス 410)。宣言を `number` にすると画面が `.toLocaleString` を
   * 呼べてしまい、1 件の欠落で BASE の画面が丸ごと落ちる —— 実測した当の形である。
   */
  items: { id: string; name: string; price: number | null; stock: number | null; visible: boolean }[];
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
    items: objectRows<BaseApiItem>(data.items).map((it) => ({
      id: displayField(String(it.item_id)),
      // **画面の欄へ入る第三者の文字列は天井を通る** (2026-09-22 · パス 415)。
      // 実測 (直す前): 商品名に 200,000 字を入れると `BasePage` の
      // 総文字数が **200,050 字**になった。
      name: displayField(it.title),
      // 数として読めなければ `null` —— **0 に倒さない** (「¥0 の商品」「在庫切れ」
      // という嘘になり、壊れていることが画面から消える · パス 395 / 408)。
      price: finiteNumberOf(it.price),
      stock: finiteNumberOf(it.stock),
      visible: it.visible === 1,
    })),
  };
}
