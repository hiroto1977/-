import {
  jsonFetch,
  type ActionContext,
  type ActionMap,
  type FetchContext,
} from './types';
import {
  fetchCursorSnapshotWith,
  DEFAULT_USAGE_DAYS,
  type CursorSnapshot,
} from '../../shared/api/cursor';

/**
 * Cursor Admin API クライアント（チーム管理者向け）— デスクトップ版の入口。
 *
 * 認証は管理者が発行する Admin API キー。Cursor 側は Basic 認証（キーを
 * ユーザ名、パスワードは空）も受け付けるが、ここでは同等に扱われる
 * `Authorization: Bearer` を使う（この repo の bearer 系クライアントと同じ形になる）。
 *
 * **判定と正規化は `src/shared/api/cursor.ts` に置いてある。** ブラウザ版は
 * 利用者のプロキシ経由で同じモジュールを呼ぶので、片方だけ直したときに
 * もう片方が古いまま残る、という食い違いが起きない。ここに残しているのは
 * 「Node の fetch を渡す」ことだけである。
 */

// 型と定数は shared から再輸出する (既存の import 元を変えずに済ませる)。
export {
  MAX_USAGE_DAYS,
  toIsoDate,
  acceptRateOf,
  isOverCounted,
  usageWindow,
} from '../../shared/api/cursor';
export type {
  CursorMember,
  CursorUsageDay,
  CursorSpend,
  CursorSnapshot,
} from '../../shared/api/cursor';

/**
 * チーム集計を取得する。通信だけを担い、応答の解釈は shared 側で行う。
 *
 * `jsonFetch` は既存の共通ラッパ (タイムアウト・サイズ上限・エラー整形) を
 * そのまま使う。ここを素の fetch に置き換えると、他のクライアントと
 * 失敗時の振る舞いがずれる。
 */
export async function fetchCursorSnapshot(ctx: FetchContext): Promise<CursorSnapshot> {
  const fetchCtx = { fetch: ctx.fetch, serviceId: 'cursor' };
  return fetchCursorSnapshotWith(
    (url, init) => jsonFetch<unknown>(url, init, fetchCtx),
    ctx.token,
    Date.now(),
    DEFAULT_USAGE_DAYS,
  );
}

// --- write-side actions ------------------------------------------------
// Cursor の Admin API は読み取りが中心で、席の増減や上限変更は
// ダッシュボード側の操作になる。誤って課金に触れないよう、
// この repo からは書き込みを一切行わない。
export const ACTIONS: ActionMap = {};

export type { ActionContext };
