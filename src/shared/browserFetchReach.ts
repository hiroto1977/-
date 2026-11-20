/**
 * ブラウザ版で、連携先の実データを取得できる画面とできない画面。
 *
 * `SERVICE_DATA_ORIGIN` が 'remote' の画面は 22 在る。ブラウザ版 (単一 HTML) から実データを読めるのは、
 * 読み取りの実装が共有側に在る 8 つだけ (`renderer/network/liveRead.ts` の `LIVE_READERS`)。
 * 残る 14 (GitHub / WordPress / Atlassian / Notion / Google Drive / Calendar / Gmail / Slack / Canva /
 * Cloudflare / Microsoft 365 / BASE / YouTube / freee) は、取得がデスクトップ版の主プロセスに在る。
 *
 * 2026-11-19 実測 (実 chromium · LITE · 412×915): その 14 画面は「更新」を押すと、資格情報の有無に関わらず
 * **赤い「エラー」+「表示中の数字は同梱のサンプルです」+「ブラウザ版では live fetch を行いません。同梱の snapshot を
 * 使用します。」**を出した。資格情報を保存していると、画面を開いただけで出た。
 * 取得できないのは故障ではなく、この実行形態の仕様である —— 赤で言う事ではない。
 *
 * 直し:
 *   - 画面 (`StatusBar`) は、ブラウザ版でこの 14 画面に**押す前から**灰色の案内を出し、「更新」を出さない。
 *   - 橋 (`web-shim.ts`) は同じ文で `not_implemented` を返し、取得の hook (`useServiceData`) は
 *     それを失敗ではなく `unsupported` として持つ (札は「サンプル（未連携）」のまま)。
 *
 * 読める 8 つの一覧は `LIVE_READERS` の鍵と一致する (`browserFetchReach.test.ts` が両方向に留める)。
 * ここへ写しを置くのは、`StatusBar` が `renderer/network/` を取り込めないため
 * (社外向けポータルの束に網の経路を入れない —— `portalBundleClosure.test.ts`)。
 */

import type { BuildKind } from './buildDestinations';
import type { DataOrigin } from './dataOrigin';

/** ブラウザ版から実データを読める連携先 (`LIVE_READERS` の鍵と同じ集合)。 */
export const BROWSER_LIVE_READ_SERVICES: readonly string[] = Object.freeze([
  'asana',
  'cursor',
  'discord',
  'dropbox',
  'line',
  'linear',
  'sentry',
  'stripe',
]);

/** ブラウザ版で実データを取得できない画面に出す案内。橋が返す文と画面が出す文は、この 1 つ。 */
export const BROWSER_FETCH_UNSUPPORTED_NOTE =
  'ブラウザ版では、この画面の実データを取得できません（取得はデスクトップ版の機能です）。表示しているのは見本です。';

/** ブラウザ版から実データを読める連携先か。 */
export function browserReadsLive(serviceId: string): boolean {
  return BROWSER_LIVE_READ_SERVICES.includes(serviceId);
}

/**
 * この実行形態で、この画面の実データを取得できないときの案内。取得できる・分からないときは `null`。
 *
 * 実行形態が分からないあいだ (`null`) は案内を出さない —— デスクトップ版で一瞬だけ
 * 「取得できません」と出すほうが害が大きい (`useBuildKind` と同じ判断)。
 */
export function browserFetchUnsupportedNote(
  kind: BuildKind | null,
  origin: DataOrigin,
  serviceId: string | undefined,
): string | null {
  if (kind !== 'browser') return null;
  if (origin !== 'remote') return null;
  if (serviceId === undefined) return null;
  if (browserReadsLive(serviceId)) return null;
  return BROWSER_FETCH_UNSUPPORTED_NOTE;
}
