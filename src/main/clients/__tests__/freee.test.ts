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

  it('skips a deal with a missing issue_date (?? "" fallback → length 0 skip)', () => {
    // issue_date 欠落時の `?? ''` を別文字列にする mutant は "Stryker"(len7) を月扱いして
    // しまうため、欠落取引が出力に出ないことを確認して撃墜。
    const rows = aggregateDealsByMonth([
      { id: 1, type: 'income', issue_date: undefined as unknown as string, amount: 5000 },
      { id: 2, type: 'income', issue_date: '2026-05-10', amount: 1000 },
    ]);
    expect(rows.map((r) => r.month)).toEqual(['2026-05']);
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
    // first call: companies, with bearer auth + json accept header
    expect(fetchMock.mock.calls[0]![0]).toBe('https://api.freee.co.jp/api/1/companies');
    const headers = (fetchMock.mock.calls[0]![1] as RequestInit).headers as Record<string, string>;
    expect(headers.Authorization).toBe('Bearer tok');
    expect(headers.accept).toBe('application/json'); // accept ヘッダ値の StringLiteral を撃墜
    // second call: deals scoped to the company id, still authenticated
    expect(fetchMock.mock.calls[1]![0]).toContain('company_id=42');
    const dealsHeaders = (fetchMock.mock.calls[1]![1] as RequestInit).headers as Record<string, string>;
    expect(dealsHeaders.Authorization).toBe('Bearer tok'); // deals 取得の { headers } を {} にする ObjectLiteral を撃墜
  });

  it('returns empty monthly data when there is no company', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValueOnce(jsonResponse({ companies: [] }));
    const snap = await fetchFreeeSnapshot({ token: 'tok', fetch: fetchMock });
    expect(snap.companyName).toBe('');
    expect(snap.monthly).toEqual([]);
    // should NOT call the deals endpoint without a company
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('throws a FetchError tagged with the freee serviceId on a non-200 response', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValueOnce(jsonResponse({ message: 'unauthorized' }, 401));
    const err = await fetchFreeeSnapshot({ token: 'bad', fetch: fetchMock }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(FetchError);
    expect((err as FetchError).serviceId).toBe('freee'); // serviceId: 'freee' を '' にする StringLiteral を撃墜
  });

  it('falls back to name when display_name is absent', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({ companies: [{ id: 7, name: 'フォールバック商店' }] }))
      .mockResolvedValueOnce(jsonResponse({ deals: [] }));
    const snap = await fetchFreeeSnapshot({ token: 'tok', fetch: fetchMock });
    expect(snap.companyName).toBe('フォールバック商店');
  });

  it('uses an empty company name when neither display_name nor name is present', async () => {
    // `company.display_name ?? company.name ?? ''` の最終 '' を別文字列にする mutant を撃墜。
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({ companies: [{ id: 9 }] }))
      .mockResolvedValueOnce(jsonResponse({ deals: [] }));
    const snap = await fetchFreeeSnapshot({ token: 'tok', fetch: fetchMock });
    expect(snap.companyName).toBe('');
  });

  it('yields empty monthly data when the deals response omits the deals array', async () => {
    // `deals.deals ?? []` の [] を別配列にする ArrayDeclaration mutant を撃墜。
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({ companies: [{ id: 3, display_name: 'A' }] }))
      .mockResolvedValueOnce(jsonResponse({})); // deals フィールド無し
    const snap = await fetchFreeeSnapshot({ token: 'tok', fetch: fetchMock });
    expect(snap.monthly).toEqual([]);
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
