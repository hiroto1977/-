import { jsonFetch, type FetchContext } from './types';
import { fetchAsanaSnapshotWith, type AsanaSnapshot } from '../../shared/api/asana';

/**
 * Asana (タスク管理) — デスクトップ版の入口。**読み取りだけ** (2026-11-18)。
 *
 * 利用者とワークスペース (`GET /users/me`) と、自分に割り当てられた未完了のタスク (`GET /tasks`) を読む。
 * **判定と正規化は `src/shared/api/asana.ts` に置いてある** —— ブラウザ版は利用者の
 * プロキシ経由で同じモジュールを呼ぶ。ここに残しているのは「Node の fetch を渡す」ことだけである。
 *
 * 通信は共通の `jsonFetch` を通す (締切・応答の大きさの天井・転送に追随しない・失敗文の伏字)。
 * 封筒が物であることも `jsonFetch` が確かめる —— Asana の 2 つの応答はどちらも物を返す。
 *
 * 2026-11-17 まで、このファイルは同梱の見本をそのまま返す stub だった
 * (`SERVICE_DATA_ORIGIN.asana === 'sample'`)。
 */

export type { AsanaSnapshot } from '../../shared/api/asana';

export async function fetchAsanaSnapshot(ctx: FetchContext): Promise<AsanaSnapshot> {
  const fetchCtx = { fetch: ctx.fetch, serviceId: 'asana' };
  return fetchAsanaSnapshotWith((url, init) => jsonFetch<object>(url, init, fetchCtx), ctx.token);
}
