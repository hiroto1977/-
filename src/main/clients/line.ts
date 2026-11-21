import { jsonFetch, type FetchContext } from './types';
import { fetchLineSnapshotWith, type LineSnapshot } from '../../shared/api/line';

/**
 * LINE 公式アカウント (Messaging API) — デスクトップ版の入口。**読み取りだけ** (2026-11-18)。
 *
 * アカウントの情報 (`GET /v2/bot/info`)・配信の上限 (`GET /v2/bot/message/quota`)・
 * 今月の配信数 (`GET /v2/bot/message/quota/consumption`) を読む。
 * **判定と正規化は `src/shared/api/line.ts` に置いてある** —— ブラウザ版は利用者の
 * プロキシ経由で同じモジュールを呼ぶ。ここに残しているのは「Node の fetch を渡す」ことだけである。
 *
 * 通信は共通の `jsonFetch` を通す (締切・応答の大きさの天井・転送に追随しない・失敗文の伏字)。
 * 封筒が物であることも `jsonFetch` が確かめる —— LINE の 3 つの応答はどれも物を返す。
 *
 * 2026-11-17 まで、このファイルは同梱の見本をそのまま返す stub だった
 * (`SERVICE_DATA_ORIGIN.line === 'sample'`)。
 */

export type { LineSnapshot } from '../../shared/api/line';

export async function fetchLineSnapshot(ctx: FetchContext): Promise<LineSnapshot> {
  const fetchCtx = { fetch: ctx.fetch, serviceId: 'line' };
  return fetchLineSnapshotWith((url, init) => jsonFetch<object>(url, init, fetchCtx), ctx.token);
}
