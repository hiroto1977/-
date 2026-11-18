import { jsonFetch, type FetchContext } from './types';
import { fetchLinearSnapshotWith, type LinearSnapshot } from '../../shared/api/linear';

/**
 * Linear (課題管理) — デスクトップ版の入口。**読み取りだけ** (2026-11-18)。
 *
 * 自分に割り当てられた未完了の課題を、GraphQL の照会 1 つ (`POST /graphql` · 本文は固定) で読む。
 * **判定と正規化は `src/shared/api/linear.ts` に置いてある** —— ブラウザ版は利用者の
 * プロキシ経由で同じモジュールを呼ぶ。ここに残しているのは「Node の fetch を渡す」ことだけである。
 *
 * 通信は共通の `jsonFetch` を通す (締切・応答の大きさの天井・転送に追随しない・失敗文の伏字)。
 * 封筒が物であることも `jsonFetch` が確かめる —— GraphQL の応答は物を返す。
 *
 * 2026-11-18 まで、このファイルは同梱の見本をそのまま返す stub だった
 * (`SERVICE_DATA_ORIGIN.linear === 'sample'`)。
 */

export type { LinearSnapshot } from '../../shared/api/linear';

export async function fetchLinearSnapshot(ctx: FetchContext): Promise<LinearSnapshot> {
  const fetchCtx = { fetch: ctx.fetch, serviceId: 'linear' };
  return fetchLinearSnapshotWith((url, init) => jsonFetch<object>(url, init, fetchCtx), ctx.token);
}
