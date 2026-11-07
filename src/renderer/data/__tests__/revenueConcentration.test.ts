import { describe, expect, it } from 'vitest';
import {
  computeRevenueConcentration,
  computeCustomerConcentration,
  classifyConcentration,
  computeTopNConcentration,
  computePareto,
  assessConcentrationRisk,
} from '../revenueConcentration';

const ch = (label: string, amount: number) => ({ label, amount });

describe('computeRevenueConcentration', () => {
  it('returns null when there is no revenue', () => {
    expect(computeRevenueConcentration([])).toBeNull();
    expect(computeRevenueConcentration([ch('Amazon', 0)])).toBeNull();
  });

  it('scores 0 (fully concentrated) for a single channel and flags the risk', () => {
    const c = computeRevenueConcentration([ch('Amazon', 1_000_000)])!;
    expect(c.channelsPresent).toBe(1);
    expect(c.hhi).toBe(1);
    expect(c.effectiveChannels).toBe(1);
    expect(c.topChannel).toBe('Amazon');
    expect(c.topSharePct).toBe(100);
    expect(c.diversityScore).toBe(0);
    expect(c.singleChannelRisk).toBe(true);
  });

  it('scores 50 for an even two-channel split (HHI 0.5)', () => {
    const c = computeRevenueConcentration([ch('Amazon', 500_000), ch('Shopify', 500_000)])!;
    expect(c.channelsPresent).toBe(2);
    expect(c.hhi).toBe(0.5);
    expect(c.effectiveChannels).toBe(2);
    expect(c.topSharePct).toBe(50);
    expect(c.diversityScore).toBe(50);
    expect(c.singleChannelRisk).toBe(false);
  });

  it('identifies the dominant channel and flags single-channel risk above 60%', () => {
    const c = computeRevenueConcentration([ch('Amazon', 800_000), ch('Shopify', 200_000)])!;
    // shares 0.8/0.2 → HHI 0.68 → score 32
    expect(c.hhi).toBe(0.68);
    expect(c.topChannel).toBe('Amazon');
    expect(c.topSharePct).toBe(80);
    expect(c.diversityScore).toBe(32);
    expect(c.singleChannelRisk).toBe(true);
  });

  it('does not flag risk at exactly 60% (strictly greater than)', () => {
    const c = computeRevenueConcentration([ch('A', 600_000), ch('B', 400_000)])!;
    expect(c.topSharePct).toBe(60);
    expect(c.singleChannelRisk).toBe(false);
  });

  it('excludes non-positive channels via the filter (negative amount ignored)', () => {
    // 負のチャネルを除外。filter を外す / 条件を true 固定する mutant は負値を合算へ
    // 含めて HHI/シェアを変えるため、フィルタ有りの結果と一致しないことで殺せる。
    const withNeg = computeRevenueConcentration([ch('A', 800_000), ch('B', 200_000), ch('Bad', -500_000)])!;
    const clean = computeRevenueConcentration([ch('A', 800_000), ch('B', 200_000)])!;
    expect(withNeg.channelsPresent).toBe(2);
    expect(withNeg.hhi).toBe(clean.hhi);
    expect(withNeg.topSharePct).toBe(80);
  });

  it('keeps the first channel as top on an exact share tie (strictly greater)', () => {
    // A と B が同額 → share 同値。`share > topShare` を `>=` にする mutant は後勝ちで
    // topChannel=B になるため、先勝ち (A) を検証して殺す。
    const c = computeRevenueConcentration([ch('A', 500_000), ch('B', 500_000)])!;
    expect(c.topChannel).toBe('A');
    expect(c.topSharePct).toBe(50);
  });
});

// ---------------------------------------------------------------------------
// Round 73 — 取引先 (顧客) 集中度 (0〜10000 スケール HHI / CRn / パレート / リスク)
// ---------------------------------------------------------------------------

describe('classifyConcentration', () => {
  it('classifies low below 1500 (boundary at 1499/1500)', () => {
    expect(classifyConcentration(0)).toBe('low');
    expect(classifyConcentration(1499)).toBe('low');
    expect(classifyConcentration(1500)).toBe('moderate');
  });

  it('classifies moderate in [1500, 2500] inclusive (boundary at 2500/2501)', () => {
    expect(classifyConcentration(1500)).toBe('moderate');
    expect(classifyConcentration(2500)).toBe('moderate');
    expect(classifyConcentration(2501)).toBe('high');
  });

  it('classifies high above 2500', () => {
    expect(classifyConcentration(2501)).toBe('high');
    expect(classifyConcentration(10000)).toBe('high');
  });
});

describe('computeCustomerConcentration', () => {
  it('returns null when there is no revenue', () => {
    expect(computeCustomerConcentration([])).toBeNull();
    expect(computeCustomerConcentration([ch('A', 0)])).toBeNull();
  });

  it('returns null when all amounts are non-finite (guarded)', () => {
    expect(computeCustomerConcentration([ch('A', Infinity), ch('B', NaN)])).toBeNull();
  });

  it('returns HHI 10000 (max) and high concentration for a single customer', () => {
    const c = computeCustomerConcentration([ch('Acme', 1_000_000)])!;
    expect(c.customersPresent).toBe(1);
    expect(c.hhi).toBe(10000);
    expect(c.level).toBe('high');
    expect(c.effectiveCustomers).toBe(1);
    expect(c.topCustomer).toBe('Acme');
    expect(c.topSharePct).toBe(100);
  });

  it('returns HHI 5000 (moderate) for an even two-customer split', () => {
    // shares 50/50 → 2500 + 2500 = 5000
    const c = computeCustomerConcentration([ch('A', 500_000), ch('B', 500_000)])!;
    expect(c.customersPresent).toBe(2);
    expect(c.hhi).toBe(5000);
    expect(c.level).toBe('high');
    expect(c.effectiveCustomers).toBe(2);
    expect(c.topSharePct).toBe(50);
  });

  it('returns HHI 2500 (moderate, low concentration boundary) for four even customers', () => {
    // shares 25 each → 625 * 4 = 2500 → moderate (>=1500, not >2500)
    const c = computeCustomerConcentration([
      ch('A', 250),
      ch('B', 250),
      ch('C', 250),
      ch('D', 250),
    ])!;
    expect(c.hhi).toBe(2500);
    expect(c.level).toBe('moderate');
    expect(c.effectiveCustomers).toBe(4);
  });

  it('returns low concentration HHI 1000 for ten even customers', () => {
    // shares 10 each → 100 * 10 = 1000 → low
    const ten = Array.from({ length: 10 }, (_, i) => ch(`C${i}`, 100));
    const c = computeCustomerConcentration(ten)!;
    expect(c.hhi).toBe(1000);
    expect(c.level).toBe('low');
    expect(c.effectiveCustomers).toBe(10);
  });

  it('identifies the dominant customer (80/20 → HHI 6800)', () => {
    // 80²+20² = 6400+400 = 6800
    const c = computeCustomerConcentration([ch('Big', 800), ch('Small', 200)])!;
    expect(c.hhi).toBe(6800);
    expect(c.topCustomer).toBe('Big');
    expect(c.topSharePct).toBe(80);
    expect(c.level).toBe('high');
  });

  it('excludes zero-amount customers from the present count (strictly > 0)', () => {
    // amount===0 を含めても合計/HHI には効かないが customersPresent には数えない。
    // `> 0` を `>= 0` にする mutant は 0 のチャネルを 1 件数えてしまうため殺せる。
    const c = computeCustomerConcentration([ch('A', 500), ch('B', 500), ch('Zero', 0)])!;
    expect(c.customersPresent).toBe(2);
    expect(c.hhi).toBe(5000);
  });

  it('excludes negative amounts and keeps the first customer as top on a tie', () => {
    const c = computeCustomerConcentration([ch('A', 500), ch('B', 500), ch('Bad', -300)])!;
    expect(c.customersPresent).toBe(2);
    expect(c.hhi).toBe(5000);
    // A and B tie at 50; positiveSharesDesc is a stable sort so A precedes B,
    // and `> topShare` keeps the first → topCustomer A.
    expect(c.topCustomer).toBe('A');
  });
});

describe('computeTopNConcentration (CRn)', () => {
  const customers = [ch('A', 500), ch('B', 300), ch('C', 150), ch('D', 50)];

  it('returns null for non-positive or non-integer N', () => {
    expect(computeTopNConcentration(customers, 0)).toBeNull();
    expect(computeTopNConcentration(customers, -1)).toBeNull();
    expect(computeTopNConcentration(customers, 1.5)).toBeNull();
  });

  it('returns null when there is no revenue', () => {
    expect(computeTopNConcentration([], 3)).toBeNull();
    expect(computeTopNConcentration([ch('A', 0)], 1)).toBeNull();
  });

  it('computes CR1 = top single customer share', () => {
    const cr1 = computeTopNConcentration(customers, 1)!;
    expect(cr1.n).toBe(1);
    expect(cr1.countedCustomers).toBe(1);
    expect(cr1.sharePct).toBe(50); // 500/1000
  });

  it('computes CR3 = sum of top 3 shares', () => {
    const cr3 = computeTopNConcentration(customers, 3)!;
    expect(cr3.countedCustomers).toBe(3);
    expect(cr3.sharePct).toBe(95); // (500+300+150)/1000
  });

  it('caps countedCustomers at present count when N exceeds it (totals 100%)', () => {
    const cr10 = computeTopNConcentration(customers, 10)!;
    expect(cr10.n).toBe(10);
    expect(cr10.countedCustomers).toBe(4);
    expect(cr10.sharePct).toBe(100);
  });

  it('sums the largest customers, not input order', () => {
    // Unsorted input: smallest first. CR2 must still pick the two largest (500+300).
    const cr2 = computeTopNConcentration([ch('D', 50), ch('A', 500), ch('B', 300)], 2)!;
    expect(cr2.sharePct).toBe(Math.round((800 / 850) * 1000) / 10);
  });
});

describe('computePareto', () => {
  it('returns null for invalid threshold (<=0, >100, non-finite)', () => {
    expect(computePareto([ch('A', 100)], 0)).toBeNull();
    expect(computePareto([ch('A', 100)], 101)).toBeNull();
    expect(computePareto([ch('A', 100)], NaN)).toBeNull();
  });

  it('returns null when there is no revenue', () => {
    expect(computePareto([])).toBeNull();
    expect(computePareto([ch('A', 0)])).toBeNull();
  });

  it('accepts a threshold of exactly 100% (boundary, > not >=)', () => {
    // threshold 100 は有効。`> 100` を `>= 100` にする mutant は 100 を弾いて null を
    // 返すため、非 null かつ全件カバーで殺せる。
    const p = computePareto([ch('A', 70), ch('B', 30)], 100)!;
    expect(p.thresholdPct).toBe(100);
    expect(p.vitalFewCount).toBe(2);
    expect(p.coveredSharePct).toBe(100);
  });

  it('counts the vital few that reach the 80% cumulative threshold', () => {
    // A=60, B=25, C=10, D=5. Cumulative: 60, 85 (>=80 at 2nd).
    const p = computePareto([ch('A', 60), ch('B', 25), ch('C', 10), ch('D', 5)])!;
    expect(p.thresholdPct).toBe(80);
    expect(p.vitalFewCount).toBe(2);
    expect(p.vitalFewPct).toBe(50); // 2 of 4
    expect(p.coveredSharePct).toBe(85);
  });

  it('reaches the threshold exactly on the boundary (>= not >)', () => {
    // A=80, B=20. Cumulative 80 at first → vitalFewCount 1 (>= 80 includes equality).
    const p = computePareto([ch('A', 80), ch('B', 20)])!;
    expect(p.vitalFewCount).toBe(1);
    expect(p.coveredSharePct).toBe(80);
  });

  it('needs all customers when revenue is perfectly even', () => {
    // 4 even customers, 80% needs 4th (25,50,75,100).
    const p = computePareto([ch('A', 25), ch('B', 25), ch('C', 25), ch('D', 25)])!;
    expect(p.vitalFewCount).toBe(4);
    expect(p.vitalFewPct).toBe(100);
    expect(p.coveredSharePct).toBe(100);
  });

  it('honours a custom threshold and sorts descending first', () => {
    // Unsorted: 10,60,30. Sorted desc 60,30,10. 50% threshold → first alone (60>=50).
    const p = computePareto([ch('S', 10), ch('Big', 60), ch('M', 30)], 50)!;
    expect(p.thresholdPct).toBe(50);
    expect(p.vitalFewCount).toBe(1);
    expect(p.coveredSharePct).toBe(60);
  });

  it('returns 1 vital-few for a single customer at the default threshold', () => {
    const p = computePareto([ch('Solo', 1000)])!;
    expect(p.vitalFewCount).toBe(1);
    expect(p.vitalFewPct).toBe(100);
    expect(p.coveredSharePct).toBe(100);
  });
});

describe('assessConcentrationRisk', () => {
  it('returns null when there is no revenue', () => {
    expect(assessConcentrationRisk([])).toBeNull();
    expect(assessConcentrationRisk([ch('A', 0)])).toBeNull();
  });

  it('reports the top customer, retained share, and flags risk above 30%', () => {
    const r = assessConcentrationRisk([ch('Big', 500), ch('B', 300), ch('C', 200)])!;
    expect(r.topCustomer).toBe('Big');
    expect(r.topSharePct).toBe(50);
    expect(r.retainedSharePctIfLost).toBe(50);
    expect(r.singleCustomerRisk).toBe(true);
  });

  it('does not flag risk at exactly 30% (strictly greater than)', () => {
    // Top share exactly 30% (30 of 100) → not flagged.
    const r = assessConcentrationRisk([ch('A', 30), ch('B', 25), ch('C', 25), ch('D', 20)])!;
    expect(r.topCustomer).toBe('A');
    expect(r.topSharePct).toBe(30);
    expect(r.singleCustomerRisk).toBe(false);
    expect(r.retainedSharePctIfLost).toBe(70);
  });

  it('picks the largest customer regardless of input order', () => {
    const r = assessConcentrationRisk([ch('Small', 100), ch('Big', 900)])!;
    expect(r.topCustomer).toBe('Big');
    expect(r.topSharePct).toBe(90);
    expect(r.retainedSharePctIfLost).toBe(10);
    expect(r.singleCustomerRisk).toBe(true);
  });
});
