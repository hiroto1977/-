import { jsonFetchAny, type FetchContext } from './types';
import { fetchSentrySnapshotWith, type SentrySnapshot } from '../../shared/api/sentry';

/**
 * Sentry (エラー監視) — デスクトップ版の入口。**読み取りだけ** (2026-11-18)。
 *
 * 組織の一覧と、1 つ目の組織の未解決の問題を読む (`GET` 2 つ)。
 * **判定と正規化は `src/shared/api/sentry.ts` に置いてある** —— ブラウザ版は利用者の
 * プロキシ経由で同じモジュールを呼ぶ。ここに残しているのは「Node の fetch を渡す」ことだけである。
 *
 * 通信は共通の口を通す (締切・応答の大きさの天井・転送に追随しない・失敗文の伏字)。
 * **`jsonFetch<T>` ではなく `jsonFetchAny` を使う** —— Sentry の 2 つの照会は配列を直接返すので、
 * 封筒が物であることを要求する口では正しい応答まで断ってしまう。配列でない応答は shared 側が
 * 「読めなかった」と述べる (`SentryJsonFetch` は `Promise<unknown>` を契約として宣言する)。
 *
 * 2026-11-18 まで、このファイルは同梱の見本をそのまま返す stub だった
 * (`SERVICE_DATA_ORIGIN.sentry === 'sample'`)。
 */

export type { SentrySnapshot } from '../../shared/api/sentry';

export async function fetchSentrySnapshot(ctx: FetchContext): Promise<SentrySnapshot> {
  const fetchCtx = { fetch: ctx.fetch, serviceId: 'sentry' };
  return fetchSentrySnapshotWith((url, init) => jsonFetchAny(url, init, fetchCtx), ctx.token);
}
