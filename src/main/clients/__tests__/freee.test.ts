import { describe, expect, it, vi } from 'vitest';
import {
  fetchFreeeSnapshot,
  aggregateDealsByMonth,
  freeeCashflowMap,
  type FreeeSnapshot,
} from '../freee';
import { FetchError } from '../types';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('aggregateDealsByMonth', () => {
  it('sums income and expense per month and computes the net', () => {
    const rows = aggregateDealsByMonth([
      { id: 1, type: 'income', issue_date: '2026-05-10', amount: 300_000 },
      { id: 2, type: 'expense', issue_date: '2026-05-20', amount: 120_000 },
      { id: 3, type: 'income', issue_date: '2026-06-01', amount: 200_000 },
    ]);
    expect(rows).toEqual([
      { month: '2026-05', income: 300_000, expense: 120_000, net: 180_000 },
      { month: '2026-06', income: 200_000, expense: 0, net: 200_000 },
    ]);
  });

  it('sorts months ascending and skips malformed dates', () => {
    const rows = aggregateDealsByMonth([
      { id: 1, type: 'income', issue_date: '2026-07-01', amount: 100_000 },
      { id: 2, type: 'income', issue_date: '', amount: 999 },
      { id: 3, type: 'income', issue_date: '2026-03-15', amount: 50_000 },
    ]);
    expect(rows.map((r) => r.month)).toEqual(['2026-03', '2026-07']);
  });

  it('clamps negative amounts to zero', () => {
    const rows = aggregateDealsByMonth([
      { id: 1, type: 'income', issue_date: '2026-05-10', amount: -500 },
    ]);
    expect(rows[0]!.income).toBe(0);
  });

  it('returns an empty array for no deals', () => {
    expect(aggregateDealsByMonth([])).toEqual([]);
  });
});

describe('fetchFreeeSnapshot', () => {
  it('fetches the first company then its deals, normalized to monthly cashflow', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({ companies: [{ id: 42, display_name: '株式会社テスト' }] }))
      .mockResolvedValueOnce(
        jsonResponse({
          deals: [
            { id: 1, type: 'income', issue_date: '2026-05-10', amount: 300_000 },
            { id: 2, type: 'expense', issue_date: '2026-05-20', amount: 100_000 },
          ],
        }),
      );

    const snap = await fetchFreeeSnapshot({ token: 'tok', fetch: fetchMock });

    expect(snap.companyName).toBe('株式会社テスト');
    expect(snap.monthly).toEqual([{ month: '2026-05', income: 300_000, expense: 100_000, net: 200_000 }]);
    // first call: companies, with bearer auth
    expect(fetchMock.mock.calls[0]![0]).toBe('https://api.freee.co.jp/api/1/companies');
    const headers = (fetchMock.mock.calls[0]![1] as RequestInit).headers as Record<string, string>;
    expect(headers.Authorization).toBe('Bearer tok');
    // second call: deals scoped to the company id
    expect(fetchMock.mock.calls[1]![0]).toContain('company_id=42');
  });

  it('returns empty monthly data when there is no company', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValueOnce(jsonResponse({ companies: [] }));
    const snap = await fetchFreeeSnapshot({ token: 'tok', fetch: fetchMock });
    expect(snap.companyName).toBe('');
    expect(snap.monthly).toEqual([]);
    // should NOT call the deals endpoint without a company
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('throws a FetchError on a non-200 response', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValueOnce(jsonResponse({ message: 'unauthorized' }, 401));
    await expect(fetchFreeeSnapshot({ token: 'bad', fetch: fetchMock })).rejects.toBeInstanceOf(FetchError);
  });

  it('falls back to name when display_name is absent', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({ companies: [{ id: 7, name: 'フォールバック商店' }] }))
      .mockResolvedValueOnce(jsonResponse({ deals: [] }));
    const snap = await fetchFreeeSnapshot({ token: 'tok', fetch: fetchMock });
    expect(snap.companyName).toBe('フォールバック商店');
  });
});

describe('freeeCashflowMap', () => {
  it('converts a snapshot into a Map<YYYY-MM, net> for the funding radar', () => {
    const snap: FreeeSnapshot = {
      companyName: 'X',
      monthly: [
        { month: '2026-05', income: 300_000, expense: 100_000, net: 200_000 },
        { month: '2026-06', income: 150_000, expense: 200_000, net: -50_000 },
      ],
      fetchedAt: '2026-06-30T00:00:00.000Z',
    };
    const map = freeeCashflowMap(snap);
    expect(map.get('2026-05')).toBe(200_000);
    expect(map.get('2026-06')).toBe(-50_000);
    expect(map.size).toBe(2);
  });
});
