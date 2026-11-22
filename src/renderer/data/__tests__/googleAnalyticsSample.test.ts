/**
 * グーグルアナリティクスの見本 (2026-11-22) —— 値だけで組んだ見本が、実物の正規化の出力と同じ形・同じ値であること。
 *
 * 見本は社外向けのポータルの閉包に入るので `shared/api/` の関数を呼べない (`googleAnalyticsSample.ts` の注記)。
 * そのぶん「実物の応答を実物の正規化に通した物」と 1 つずつ突き合わせ、形や丸めが食い違った日に落とす。
 */
import { describe, expect, it } from 'vitest';
import { buildGaReport, normalizeGaAccountSummaries } from '../../../shared/api/googleAnalytics';
import {
  SAMPLE_CHANNELS,
  SAMPLE_DAILY_USERS,
  SAMPLE_TOTAL_SESSIONS,
  SAMPLE_TOTAL_USERS,
  buildGoogleAnalyticsSample,
} from '../googleAnalyticsSample';

describe('グーグルアナリティクスの見本', () => {
  it('★ 実物の正規化に生の応答を通した物と、値ごと一致する', () => {
    const list = normalizeGaAccountSummaries({
      accountSummaries: [
        { displayName: '見本のアカウント', propertySummaries: [{ property: 'properties/123456789', displayName: '見本のサイト' }] },
      ],
    });
    const dailyBody = {
      dimensionHeaders: [{ name: 'date' }],
      rows: SAMPLE_DAILY_USERS.map((u, i) => ({
        dimensionValues: [{ value: `202610${String(i + 1).padStart(2, '0')}` }],
        metricValues: [{ value: String(u) }],
      })),
      totals: [{ metricValues: [{ value: String(SAMPLE_TOTAL_USERS) }] }],
    };
    const channelsBody = {
      dimensionHeaders: [{ name: 'sessionDefaultChannelGroup' }],
      rows: SAMPLE_CHANNELS.map(([en, , s, u]) => ({
        dimensionValues: [{ value: en }],
        metricValues: [{ value: String(s) }, { value: String(u) }],
      })),
      totals: [{ metricValues: [{ value: String(SAMPLE_TOTAL_SESSIONS) }, { value: String(SAMPLE_TOTAL_USERS) }] }],
    };
    expect(buildGoogleAnalyticsSample()).toEqual({
      properties: list.properties,
      propertiesRead: list.read,
      report: buildGaReport('123456789', 28, dailyBody, channelsBody),
    });
  });

  it('見本の合計は日ごとの和と矛盾しない桁に在る (28 日・最初の日は 2026-10-01)', () => {
    const r = buildGoogleAnalyticsSample().report!;
    expect(r.daily).toHaveLength(28);
    expect(r.daily[0]!.date).toBe('2026-10-01');
    expect(r.daily[27]!.date).toBe('2026-10-28');
    // 流入元のセッションの和は、宣言した合計と一致する (割合の分母が嘘をつかない)。
    expect(SAMPLE_CHANNELS.reduce((a, [, , s]) => a + s, 0)).toBe(SAMPLE_TOTAL_SESSIONS);
  });
});
