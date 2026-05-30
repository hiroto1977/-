import { describe, expect, it } from 'vitest';
import {
  aggregateByKind,
  barData,
  fundingKindLabel,
  isTaxableFunding,
  monthlyFlow,
  radarScores,
  summarize,
  DEFAULT_EFFECTIVE_TAX_RATE,
  FUNDING_KINDS,
  type FundingItem,
} from '../../../shared/funding';
import { buildFundingSnapshot, fetchFundingSnapshot } from '../funding';

const items: FundingItem[] = [
  { id: 'a', kind: 'subsidy', name: '補助金A', amount: 5_000_000, status: 'approved', month: '2026-06', repayable: false },
  { id: 'b', kind: 'subsidy', name: '補助金B', amount: 1_000_000, status: 'applied', month: '2026-08', repayable: false },
  { id: 'c', kind: 'loan', name: '融資C', amount: 10_000_000, status: 'received', month: '2026-02', repayable: true },
  { id: 'd', kind: 'benefit', name: '給付D', amount: 1_000_000, status: 'received', month: '2026-02', repayable: false },
];

describe('fundingKindLabel', () => {
  it('returns a Japanese label for every kind', () => {
    for (const k of FUNDING_KINDS) {
      expect(fundingKindLabel(k).length).toBeGreaterThan(0);
    }
    expect(fundingKindLabel('jfc')).toBe('日本政策金融公庫');
    expect(fundingKindLabel('crowdfunding')).toBe('クラウドファンディング');
  });
});

describe('aggregateByKind', () => {
  it('returns one entry per kind in FUNDING_KINDS order', () => {
    const agg = aggregateByKind(items);
    expect(agg.map((a) => a.kind)).toEqual([...FUNDING_KINDS]);
  });

  it('secured counts only received/approved; pipeline counts all', () => {
    const subsidy = aggregateByKind(items).find((a) => a.kind === 'subsidy')!;
    expect(subsidy.secured).toBe(5_000_000); // approved only
    expect(subsidy.pipeline).toBe(6_000_000); // approved + applied
    expect(subsidy.count).toBe(2);
  });

  it('treats negative amounts as zero', () => {
    const agg = aggregateByKind([
      { id: 'x', kind: 'grant', name: 'neg', amount: -100, status: 'received', month: '2026-01', repayable: false },
    ]);
    expect(agg.find((a) => a.kind === 'grant')!.secured).toBe(0);
  });
});

describe('radarScores', () => {
  it('normalizes secured amounts to 0..max with the peak at max', () => {
    const agg = aggregateByKind(items);
    const scores = radarScores(agg, 5);
    // loan secured = 10M is the peak → score 5; subsidy 5M → 2.5
    const loanIdx = FUNDING_KINDS.indexOf('loan');
    const subsidyIdx = FUNDING_KINDS.indexOf('subsidy');
    expect(scores[loanIdx]).toBe(5);
    expect(scores[subsidyIdx]).toBe(2.5);
  });

  it('returns all zeros when no secured amounts exist', () => {
    const agg = aggregateByKind([
      { id: 'p', kind: 'subsidy', name: 'pending', amount: 1_000, status: 'applied', month: '2026-01', repayable: false },
    ]);
    expect(radarScores(agg)).toEqual(agg.map(() => 0));
  });
});

describe('monthlyFlow', () => {
  it('lists every item month ascending and sums only secured funding', () => {
    const flow = monthlyFlow(items);
    // all distinct item months, ascending (incl. applied-only 2026-08)
    expect(flow.map((f) => f.month)).toEqual(['2026-02', '2026-06', '2026-08']);
    // 2026-02 = loan 10M + benefit 1M (both received)
    expect(flow[0]!.funding).toBe(11_000_000);
    // 2026-06 = subsidy 5M (approved)
    expect(flow[1]!.funding).toBe(5_000_000);
    // 2026-08 = subsidy applied (not secured) → 0
    expect(flow[2]!.funding).toBe(0);
  });

  it('merges accounting and portfolio months and defaults missing to 0', () => {
    const flow = monthlyFlow(items, {
      accountingCashflow: new Map([['2026-02', 500_000], ['2026-07', 300_000]]),
      portfolioByMonth: new Map([['2026-02', 900_000]]),
    });
    const feb = flow.find((f) => f.month === '2026-02')!;
    expect(feb.operatingCashflow).toBe(500_000);
    expect(feb.portfolioValue).toBe(900_000);
    const jul = flow.find((f) => f.month === '2026-07')!;
    expect(jul.funding).toBe(0);
    expect(jul.operatingCashflow).toBe(300_000);
    expect(jul.portfolioValue).toBe(0);
  });

  it('computes monthly after-tax funding (taxable taxed, non-taxable kept)', () => {
    const flow = monthlyFlow(items);
    // 2026-02: loan 10M (non-taxable) + benefit 1M (taxable) = 11M pre-tax
    // after-tax = 11M − 1M×0.3 = 10.7M
    const feb = flow.find((f) => f.month === '2026-02')!;
    expect(feb.funding).toBe(11_000_000);
    expect(feb.fundingAfterTax).toBe(10_700_000);
    // 2026-06: subsidy 5M (taxable) → after-tax = 5M − 5M×0.3 = 3.5M
    const jun = flow.find((f) => f.month === '2026-06')!;
    expect(jun.fundingAfterTax).toBe(3_500_000);
  });

  it('keeps compressed-entry funding untaxed in the monthly after-tax line', () => {
    const withCompression: FundingItem[] = [
      { id: 'z', kind: 'subsidy', name: '設備補助・圧縮', amount: 4_000_000, status: 'approved', month: '2026-06', repayable: false, compressedEntry: true },
    ];
    const flow = monthlyFlow(withCompression);
    const jun = flow.find((f) => f.month === '2026-06')!;
    // compressed-entry → not taxed this year → after-tax equals pre-tax
    expect(jun.funding).toBe(4_000_000);
    expect(jun.fundingAfterTax).toBe(4_000_000);
  });

  it('honors a custom effective tax rate for the monthly after-tax line', () => {
    const flow = monthlyFlow(items, { effectiveTaxRate: 0 });
    const jun = flow.find((f) => f.month === '2026-06')!;
    expect(jun.fundingAfterTax).toBe(jun.funding); // no tax
  });
});

describe('isTaxableFunding', () => {
  it('marks subsidy/grant/benefit/crowdfunding taxable and loan/jfc non-taxable', () => {
    expect(isTaxableFunding('subsidy')).toBe(true);
    expect(isTaxableFunding('grant')).toBe(true);
    expect(isTaxableFunding('benefit')).toBe(true);
    expect(isTaxableFunding('crowdfunding')).toBe(true);
    expect(isTaxableFunding('loan')).toBe(false);
    expect(isTaxableFunding('jfc')).toBe(false);
  });
});

describe('summarize', () => {
  it('computes repayable/non-repayable/total/pipeline', () => {
    const s = summarize(items);
    // non-repayable secured: subsidy approved 5M + benefit received 1M = 6M
    expect(s.nonRepayableSecured).toBe(6_000_000);
    // repayable secured: loan received 10M
    expect(s.repayableSecured).toBe(10_000_000);
    expect(s.totalSecured).toBe(16_000_000);
    // pipeline: 5M + 1M + 10M + 1M = 17M
    expect(s.totalPipeline).toBe(17_000_000);
    expect(s.count).toBe(4);
  });

  it('computes taxable secured and after-tax residual at the default rate', () => {
    const s = summarize(items);
    // taxable secured: subsidy approved 5M + benefit received 1M = 6M (loan is non-taxable)
    expect(s.taxableSecured).toBe(6_000_000);
    expect(s.deferredSecured).toBe(0); // no compressed-entry items
    expect(DEFAULT_EFFECTIVE_TAX_RATE).toBe(0.3);
    // after-tax = 16M − 6M×0.3 = 16M − 1.8M = 14.2M
    expect(s.afterTaxSecured).toBe(14_200_000);
  });

  it('defers current-year tax for compressed-entry (圧縮記帳) subsidies', () => {
    const withCompression: FundingItem[] = [
      ...items,
      { id: 'e', kind: 'subsidy', name: '設備補助・圧縮記帳', amount: 4_000_000, status: 'approved', month: '2026-09', repayable: false, compressedEntry: true },
    ];
    const s = summarize(withCompression);
    // deferred: the 4M compressed-entry subsidy
    expect(s.deferredSecured).toBe(4_000_000);
    // taxable stays 6M (compressed-entry excluded from current-year taxable)
    expect(s.taxableSecured).toBe(6_000_000);
    // totalSecured rises by 4M to 20M; after-tax = 20M − 6M×0.3 = 18.2M
    expect(s.totalSecured).toBe(20_000_000);
    expect(s.afterTaxSecured).toBe(18_200_000);
  });

  it('honors a custom effective tax rate and clamps to [0,1]', () => {
    expect(summarize(items, 0).afterTaxSecured).toBe(16_000_000); // no tax
    // rate 0.5 → 16M − 6M×0.5 = 13M
    expect(summarize(items, 0.5).afterTaxSecured).toBe(13_000_000);
    // rate > 1 clamps to 1 → 16M − 6M = 10M
    expect(summarize(items, 2).afterTaxSecured).toBe(10_000_000);
    // negative rate treated as 0
    expect(summarize(items, -1).afterTaxSecured).toBe(16_000_000);
  });
});

describe('barData', () => {
  it('maps each kind to secured + pipeline', () => {
    const bars = barData(aggregateByKind(items));
    expect(bars).toHaveLength(FUNDING_KINDS.length);
    const subsidyBar = bars[FUNDING_KINDS.indexOf('subsidy')]!;
    expect(subsidyBar.secured).toBe(5_000_000);
    expect(subsidyBar.pipeline).toBe(6_000_000);
  });
});

describe('buildFundingSnapshot', () => {
  it('assembles all four chart datasets and link flags', () => {
    const snap = buildFundingSnapshot(items, {
      accounting: new Map([['2026-02', 500_000]]),
      portfolio: new Map([['2026-02', 900_000]]),
      isMock: true,
      fetchedAt: '2026-05-30T00:00:00.000Z',
    });
    expect(snap.byKind).toHaveLength(FUNDING_KINDS.length);
    expect(snap.radar).toHaveLength(FUNDING_KINDS.length);
    expect(snap.bars).toHaveLength(FUNDING_KINDS.length);
    expect(snap.monthly.length).toBeGreaterThan(0);
    expect(snap.accountingLinked).toBe(true);
    expect(snap.stocksLinked).toBe(true);
    expect(snap.summary.totalSecured).toBe(16_000_000);
    expect(snap.fetchedAt).toBe('2026-05-30T00:00:00.000Z');
  });

  it('flags links false when no optional data provided', () => {
    const snap = buildFundingSnapshot(items);
    expect(snap.accountingLinked).toBe(false);
    expect(snap.stocksLinked).toBe(false);
  });
});

describe('fetchFundingSnapshot', () => {
  it('returns a mock snapshot with non-empty items and linked sources', async () => {
    const snap = await fetchFundingSnapshot({ token: '' });
    expect(snap.isMock).toBe(true);
    expect(snap.items.length).toBeGreaterThan(0);
    expect(snap.accountingLinked).toBe(true);
    expect(snap.stocksLinked).toBe(true);
    expect(snap.summary.totalSecured).toBeGreaterThan(0);
    // radar peak should be exactly 5 (some secured amount exists)
    expect(Math.max(...snap.radar)).toBe(5);
  });
});
