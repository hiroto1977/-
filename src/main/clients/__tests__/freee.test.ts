import { describe, expect, it, vi } from 'vitest';
import {
  fetchFreeeSnapshot,
  aggregateDeals,
  aggregateDealsByMonth,
  freeeCashflowMap,
  type FreeeSnapshot,
} from '../freee';
import { FetchError } from '../types';
import { NO_DEAL_INTAKE } from '../../../shared/freeeIntake';

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
      intake: NO_DEAL_INTAKE,
      fetchedAt: '2026-06-30T00:00:00.000Z',
    };
    const map = freeeCashflowMap(snap);
    expect(map.get('2026-05')).toBe(200_000);
    expect(map.get('2026-06')).toBe(-50_000);
    expect(map.size).toBe(2);
  });
});

/**
 * **落とした取引を数える** (2026-09-12 · パス 153)。
 *
 * 集計の値は 2026-09-12 以前と同じ。変えたのは「黙っているかどうか」だけ ——
 * この月次は経営サマリー経由で銀行提出用書面 §6 の 9 行になるので、
 * 落ちた分を言わないと相手が読む数字が静かに動く。
 */
describe('aggregateDeals の取り込み内訳 (パス 153)', () => {
  it('取引日が読めない取引を数える (集計から外す枝と同じ数)', () => {
    const out = aggregateDeals([
      { id: 1, type: 'income', issue_date: '2026-05-10', amount: 100_000 },
      { id: 2, type: 'income', issue_date: '', amount: 999 },
      { id: 3, type: 'expense', issue_date: '26-5', amount: 50 },
    ]);
    expect(out.monthly.map((m) => m.month)).toEqual(['2026-05']);
    expect(out.intake).toEqual({
      deals: 3,
      skippedNoDate: 2,
      skippedBadAmount: 0,
      clampedNegative: 0,
    });
  });

  it('金額が数として読めない取引を外して数える (NaN を月次へ伝播させない)', () => {
    // `amount` 欠落は `jsonFetch` が形を確かめないので `undefined` のまま届く。
    // 2026-09-12 までは `Math.max(0, undefined)` が NaN になり、その月の net も
    // 営業CF 累計も NaN で**書面に出ていた**。
    const out = aggregateDeals([
      { id: 1, type: 'income', issue_date: '2026-05-10', amount: undefined as unknown as number },
      { id: 2, type: 'income', issue_date: '2026-05-11', amount: 'x' as unknown as number },
      { id: 3, type: 'income', issue_date: '2026-05-12', amount: 200_000 },
    ]);
    expect(out.monthly).toEqual([{ month: '2026-05', income: 200_000, expense: 0, net: 200_000 }]);
    expect(Number.isFinite(out.monthly[0]!.net)).toBe(true);
    expect(out.intake.skippedBadAmount).toBe(2);
  });

  it('★ 対照: 守りを外すと月次が NaN になる (この検査が何を留めているか)', () => {
    // 実装の枝を外した写しで、同じ入力が NaN を作ることを見る。**鳴らない対照は
    // 「合格」ではなく、その検査についての報せである** (CLAUDE.md の規約)。
    const naive = (amount: unknown): number => Math.max(0, amount as number);
    expect(Number.isNaN(naive(undefined))).toBe(true);
    expect(Number.isNaN(naive('x'))).toBe(true);
    // 実装は同じ入力で NaN を返さない (外して数える)。
    expect(aggregateDeals([
      { id: 1, type: 'income', issue_date: '2026-05-10', amount: undefined as unknown as number },
    ]).monthly).toEqual([]);
  });

  it('金額が負の取引は 0 円として数え、その件数を返す (値は据え置き)', () => {
    const out = aggregateDeals([
      { id: 1, type: 'income', issue_date: '2026-05-10', amount: -500 },
      { id: 2, type: 'expense', issue_date: '2026-05-11', amount: -1 },
      { id: 3, type: 'income', issue_date: '2026-05-12', amount: 700 },
    ]);
    expect(out.monthly).toEqual([{ month: '2026-05', income: 700, expense: 0, net: 700 }]);
    expect(out.intake.clampedNegative).toBe(2);
    // **0 は「外した」ではない。** 負の取引は月に残るので skipped には入らない。
    expect(out.intake.skippedNoDate).toBe(0);
    expect(out.intake.skippedBadAmount).toBe(0);
  });

  it('素直に読めた取引だけなら内訳は全部 0 (=画面も書面も何も言わない)', () => {
    const out = aggregateDeals([
      { id: 1, type: 'income', issue_date: '2026-05-10', amount: 100 },
    ]);
    expect(out.intake).toEqual({ deals: 1, skippedNoDate: 0, skippedBadAmount: 0, clampedNegative: 0 });
  });

  it('取引 0 件は NO_DEAL_INTAKE と同じ (見本・未連携と同じ形)', () => {
    expect(aggregateDeals([]).intake).toEqual(NO_DEAL_INTAKE);
  });

  it('aggregateDealsByMonth は aggregateDeals の monthly と同じ (薄い口)', () => {
    const deals = [
      { id: 1, type: 'income' as const, issue_date: '2026-05-10', amount: 100 },
      { id: 2, type: 'expense' as const, issue_date: '', amount: 50 },
    ];
    expect(aggregateDealsByMonth(deals)).toEqual(aggregateDeals(deals).monthly);
  });

  it('スナップショットは内訳を載せる (画面・書面がそこから読む)', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({ companies: [{ id: 7, display_name: 'B' }] }))
      .mockResolvedValueOnce(jsonResponse({
        deals: [
          { id: 1, type: 'income', issue_date: '2026-05-10', amount: 100 },
          { id: 2, type: 'income', issue_date: 'bad', amount: 100 },
          { id: 3, type: 'income', issue_date: '2026-05-11', amount: -5 },
        ],
      }));
    const snap = await fetchFreeeSnapshot({ token: 'tok', fetch: fetchMock });
    expect(snap.intake).toEqual({ deals: 3, skippedNoDate: 1, skippedBadAmount: 0, clampedNegative: 1 });
  });

  it('事業所が 1 つも無いときも内訳の欄は在る (未取得を欠落で表さない)', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({ companies: [] }));
    const snap = await fetchFreeeSnapshot({ token: 'tok', fetch: fetchMock });
    expect(snap.intake).toEqual(NO_DEAL_INTAKE);
  });
});
