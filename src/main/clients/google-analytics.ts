import { jsonFetch, type ActionContext, type ActionMap, type FetchContext } from './types';
import {
  checkGaReportRequest,
  fetchGoogleAnalyticsReportWith,
  fetchGoogleAnalyticsSnapshotWith,
  type GoogleAnalyticsSnapshot,
} from '../../shared/api/googleAnalytics';
import type { ActionData } from '../../shared/actionData';

/**
 * グーグルアナリティクス (Google Analytics 4) —— デスクトップ版の入口。**読み取りだけ** (2026-11-22)。
 *
 * - 取得 (`fetchSnapshot`) は見られるプロパティの一覧 (`GET analyticsadmin…/accountSummaries`) を読む。
 * - `run-report` は選んだプロパティ・期間 (7 / 28 / 90 日) の訪問者数と流入元を読む
 *   (`POST analyticsdata…/properties/{id}:runReport` を 2 回)。
 *
 * **判定と正規化は `src/shared/api/googleAnalytics.ts` に置いてある** —— ブラウザ版は利用者の
 * プロキシ経由で同じモジュールを呼ぶ。ここに残しているのは「Node の fetch を渡す」ことだけである。
 * 通信は共通の `jsonFetch` を通す (締切・応答の大きさの天井・転送に追随しない・失敗文の伏字)。
 *
 * トークンは OAuth (`main/oauth.ts` の登録・権限は `analytics.readonly` だけ) か、利用者が貼った
 * アクセストークン。プロパティ ID は秘密ではないので資格情報とは別に、画面が端末に覚えて payload で渡す。
 */

export type { GoogleAnalyticsSnapshot } from '../../shared/api/googleAnalytics';

export async function fetchGoogleAnalyticsSnapshot(ctx: FetchContext): Promise<GoogleAnalyticsSnapshot> {
  const fetchCtx = { fetch: ctx.fetch, serviceId: 'google-analytics' };
  return fetchGoogleAnalyticsSnapshotWith((url, init) => jsonFetch<object>(url, init, fetchCtx), ctx.token);
}

/**
 * `run-report` の payload の宣言 (§3.2 の表がこの名前で照合する)。欄の判定は shared の
 * `checkGaReportRequest` が行う (プロパティ ID は数字だけ・期間は 7 / 28 / 90 のどれか)。
 */
export interface RunReportPayload {
  propertyId: string;
  days: number;
}

async function runReport(ctx: ActionContext): Promise<ActionData<'google-analytics/run-report'>> {
  const req = checkGaReportRequest(ctx.payload);
  const fetchCtx = { fetch: ctx.fetch, serviceId: 'google-analytics' };
  return fetchGoogleAnalyticsReportWith(
    (url, init) => jsonFetch<object>(url, init, fetchCtx),
    ctx.token,
    req.propertyId,
    req.days,
  );
}

export const ACTIONS: ActionMap = {
  'run-report': runReport,
};
