/**
 * グーグルアナリティクスの画面の**同梱の見本** (2026-11-22)。架空の数字である。
 *
 * 連携するまで (資格情報が無い・ブラウザ版でプロキシが無い) の画面はこれを出し、バッジが
 * 「サンプル (未連携)」と名乗る (`useServiceData` の `source === 'snapshot'`)。
 * 日付は過去の固定の 28 日で、「今日」を名乗らない。
 *
 * ★ **値だけを持ち、`shared/api/` の関数を呼ばない** —— この見本は `snapshot.ts` から
 * 社外向けのポータルの閉包にも入る。ポータルは外部サービスの API を 1 つも積まない決まり
 * (`portal/__tests__/portalBundleClosure.test.ts`) なので、ここから読むのは**型だけ**
 * (`import type` はビルドで消える)。見本の形が実物の正規化と食い違わないことは
 * `data/__tests__/googleAnalyticsSample.test.ts` が、同じ生の応答を実物の正規化に通して突き合わせる。
 */
import type { GaChannelRow, GaDailyPoint, GoogleAnalyticsSnapshot } from '../../shared/api/googleAnalytics';

/** 見本の 1 日ごとの訪問者数 (2026-10-01 から 28 日)。 */
export const SAMPLE_DAILY_USERS: readonly number[] = [
  96, 104, 88, 71, 65, 112, 118, 121, 109, 97, 74, 69, 125, 131, 127, 116, 102, 80, 76, 134, 140, 138, 129, 111, 85,
  79, 143, 150,
];

/** 見本の期間の訪問者数とセッションの合計 (GA4 の `totals` に当たる値)。 */
export const SAMPLE_TOTAL_USERS = 1830;
export const SAMPLE_TOTAL_SESSIONS = 2450;

/** 見本の流入元 (英語の名前・日本語の名前・セッション・アクティブユーザー)。 */
export const SAMPLE_CHANNELS: readonly (readonly [string, string, number, number])[] = [
  ['Organic Search', '自然検索', 1120, 860],
  ['Direct', '直接', 560, 410],
  ['Organic Social', 'ソーシャル', 380, 300],
  ['Referral', '他のサイトからのリンク', 210, 170],
  ['Paid Search', '有料検索', 120, 100],
  ['Email', 'メール', 60, 45],
];

/** 割合は実物と同じ丸め (小数 1 桁)。 */
function share(sessions: number): number {
  return Math.round((sessions / SAMPLE_TOTAL_SESSIONS) * 1000) / 10;
}

export function buildGoogleAnalyticsSample(): GoogleAnalyticsSnapshot {
  const daily: GaDailyPoint[] = SAMPLE_DAILY_USERS.map((users, i) => ({
    date: `2026-10-${String(i + 1).padStart(2, '0')}`,
    users,
  }));
  const channels: GaChannelRow[] = SAMPLE_CHANNELS.map(([english, label, sessions, users]) => ({
    english,
    label,
    sessions,
    users,
    sharePct: share(sessions),
  }));
  return {
    properties: [{ id: '123456789', name: '見本のサイト', account: '見本のアカウント' }],
    propertiesRead: true,
    report: {
      propertyId: '123456789',
      days: 28,
      totalUsers: SAMPLE_TOTAL_USERS,
      daily,
      dailyRead: true,
      totalSessions: SAMPLE_TOTAL_SESSIONS,
      channels,
      channelsRead: true,
    },
  };
}
