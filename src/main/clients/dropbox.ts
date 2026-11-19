import { jsonFetch, type FetchContext } from './types';
import { fetchDropboxSnapshotWith, type DropboxSnapshot } from '../../shared/api/dropbox';

/**
 * Dropbox — デスクトップ版の入口。**読み取りだけ** (2026-11-19)。
 *
 * アカウント (`POST /2/users/get_current_account`)・容量 (`POST /2/users/get_space_usage`)・
 * 最近のアイテム (`POST /2/files/list_folder`) を読む。
 * **判定と正規化は `src/shared/api/dropbox.ts` に置いてある** —— ブラウザ版は利用者の
 * プロキシ経由で同じモジュールを呼ぶ。ここに残しているのは「Node の fetch を渡す」ことだけである。
 *
 * 通信は共通の `jsonFetch` を通す (締切・応答の大きさの天井・転送に追随しない・失敗文の伏字)。
 * 封筒が物であることも `jsonFetch` が確かめる —— Dropbox の 3 つの応答はどれも物を返す。
 *
 * 2026-11-19 まで、このファイルは同梱の見本をそのまま返す stub だった
 * (`SERVICE_DATA_ORIGIN.dropbox === 'sample'`)。トークンは Dropbox App Console で
 * 作る自前アプリのもの (権限は読み取りだけ) で、利用者が Vault に登録する。
 */

export type { DropboxSnapshot } from '../../shared/api/dropbox';

export async function fetchDropboxSnapshot(ctx: FetchContext): Promise<DropboxSnapshot> {
  const fetchCtx = { fetch: ctx.fetch, serviceId: 'dropbox' };
  return fetchDropboxSnapshotWith((url, init) => jsonFetch<object>(url, init, fetchCtx), ctx.token);
}
