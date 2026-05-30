import { describe, expect, it } from 'vitest';
import {
  aggregateByKind,
  barData,
  fundingKindLabel,
  monthlyFlow,
  radarScores,
  summarize,
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
