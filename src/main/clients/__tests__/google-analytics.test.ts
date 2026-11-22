import { describe, expect, it, vi } from 'vitest';
import { ACTIONS, fetchGoogleAnalyticsSnapshot } from '../google-analytics';

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

describe('fetchGoogleAnalyticsSnapshot (プロパティの一覧)', () => {
  it('Admin API の accountSummaries を Bearer で読み、数字の ID だけを一覧にする', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValueOnce(
      json({
        accountSummaries: [
          {
            displayName: '見本のアカウント',
            propertySummaries: [
              { property: 'properties/123456789', displayName: '見本のサイト' },
              { property: 'properties/../evil', displayName: '壊れた行' },
            ],
          },
        ],
      }),
    );
    const snap = await fetchGoogleAnalyticsSnapshot({ token: 'ya29.x', fetch: fetchMock });
    expect(snap.properties).toEqual([{ id: '123456789', name: '見本のサイト', account: '見本のアカウント' }]);
    expect(snap.propertiesRead).toBe(true);
    expect(snap.report).toBeNull();
    const call = fetchMock.mock.calls[0]!;
    expect(String(call[0])).toBe('https://analyticsadmin.googleapis.com/v1beta/accountSummaries?pageSize=200');
    const headers = (call[1] as RequestInit).headers as Record<string, string>;
    expect(headers.Authorization).toBe('Bearer ya29.x');
  });

  it('封筒が配列でないときは「読めなかった」(0 件と混ぜない)', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValueOnce(json({ accountSummaries: 'x' }));
    const snap = await fetchGoogleAnalyticsSnapshot({ token: 't', fetch: fetchMock });
    expect(snap.properties).toEqual([]);
    expect(snap.propertiesRead).toBe(false);
  });
});

describe("ACTIONS['run-report']", () => {
  it('日ごと・流入元の 2 つの照会を同じプロパティの runReport へ POST し、レポートを組む', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        json({
          dimensionHeaders: [{ name: 'date' }],
          rows: [{ dimensionValues: [{ value: '20261101' }], metricValues: [{ value: '12' }] }],
          totals: [{ metricValues: [{ value: '12' }] }],
        }),
      )
      .mockResolvedValueOnce(
        json({
          dimensionHeaders: [{ name: 'sessionDefaultChannelGroup' }],
          rows: [{ dimensionValues: [{ value: 'Direct' }], metricValues: [{ value: '20' }, { value: '12' }] }],
        }),
      );
    const run = ACTIONS['run-report']!;
    const report = (await run({ token: 'ya29.x', fetch: fetchMock, payload: { propertyId: '123', days: 7 } })) as {
      totalUsers: number | null;
      channels: { label: string; sharePct: number | null }[];
    };
    expect(report.totalUsers).toBe(12);
    expect(report.channels).toEqual([expect.objectContaining({ label: '直接', sharePct: 100 })]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    for (const call of fetchMock.mock.calls) {
      expect(String(call[0])).toBe('https://analyticsdata.googleapis.com/v1beta/properties/123:runReport');
      expect((call[1] as RequestInit).method).toBe('POST');
    }
    const body = JSON.parse(String((fetchMock.mock.calls[0]![1] as RequestInit).body)) as {
      dateRanges: { startDate: string }[];
    };
    expect(body.dateRanges[0]!.startDate).toBe('6daysAgo');
  });

  it('形の違うプロパティ ID と期間は、網へ出る前に断る', async () => {
    const fetchMock = vi.fn<typeof fetch>();
    const run = ACTIONS['run-report']!;
    await expect(run({ token: 't', fetch: fetchMock, payload: { propertyId: '12/../34', days: 7 } })).rejects.toThrow(
      'プロパティ ID は数字だけ',
    );
    await expect(run({ token: 't', fetch: fetchMock, payload: { propertyId: '123', days: 30 } })).rejects.toThrow(
      '期間は 7 日・28 日・90 日',
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
