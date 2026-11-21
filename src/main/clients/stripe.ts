import { jsonFetch, type FetchContext } from './types';
import { fetchStripeSnapshotWith, type StripeSnapshot } from '../../shared/api/stripe';

/**
 * Stripe (カード決済) — デスクトップ版の入口。**読み取りだけ** (2026-11-18)。
 *
 * 残高 (`GET /v1/balance`) と最近の入金 (`GET /v1/charges`) を読む。
 * **判定と正規化は `src/shared/api/stripe.ts` に置いてある** —— ブラウザ版は利用者の
 * プロキシ経由で同じモジュールを呼ぶ。ここに残しているのは「Node の fetch を渡す」ことだけである。
 *
 * 通信は共通の `jsonFetch` を通す (締切・応答の大きさの天井・転送に追随しない・失敗文の伏字)。
 * 封筒が物であることも `jsonFetch` が確かめる —— Stripe の 2 つの応答はどちらも物を返す。
 *
 * 2026-11-17 まで、このファイルは同梱の見本をそのまま返す stub だった
 * (`SERVICE_DATA_ORIGIN.stripe === 'sample'`)。
 */

export type { StripeSnapshot } from '../../shared/api/stripe';

export async function fetchStripeSnapshot(ctx: FetchContext): Promise<StripeSnapshot> {
  const fetchCtx = { fetch: ctx.fetch, serviceId: 'stripe' };
  return fetchStripeSnapshotWith((url, init) => jsonFetch<object>(url, init, fetchCtx), ctx.token);
}
