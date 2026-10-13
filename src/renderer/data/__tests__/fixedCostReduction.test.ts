import { describe, expect, it } from 'vitest';
import { fixedCostReductionImpact } from '../profitSensitivity';
import type { KpiFundamentals } from '../kpiActuals';

// revenue 1000, variable 500 → contribution 500, fixed 250 → OP 250
const base: KpiFundamentals = { revenue: 1000, cogs: 400, advertising: 100, sga: 200, depreciation: 50 };

describe('fixedCostReductionImpact', () => {
  it('returns one row per reduction with default [5,10,20]', () => {
    const rows = fixedCostReductionImpact(base);
    expect(rows.map((r) => r.reductionPct)).toEqual([5, 10, 20]);
  });

  it('improves operating profit by exactly the fixed-cost cut', () => {
    const rows = fixedCostReductionImpact(base);
    // 10% of fixed 250 = 25 → new fixed 225, new OP 275, improvement 25
    const r10 = rows.find((r) => r.reductionPct === 10)!;
    expect(r10.newFixedCost).toBe(225);
    expect(r10.newOperatingProfit).toBe(275);
    expect(r10.profitImprovement).toBe(25);
  });

  it('20% reduction halves the gap differently and stacks correctly', () => {
    const r20 = fixedCostReductionImpact(base).find((r) => r.reductionPct === 20)!;
    expect(r20.newFixedCost).toBe(200); // 250 * 0.8
    expect(r20.newOperatingProfit).toBe(300); // contribution 500 - 200
    expect(r20.profitImprovement).toBe(50);
  });

  it('honours a custom reduction set', () => {
    const rows = fixedCostReductionImpact(base, [0, 100]);
    expect(rows[0]!.profitImprovement).toBe(0); // 0% → no change
    expect(rows[1]!.newFixedCost).toBe(0); // 100% → fixed eliminated
    expect(rows[1]!.newOperatingProfit).toBe(500); // = contribution
  });

  it('works when the business is currently loss-making', () => {
    // revenue 400, variable 200 → contribution 200, fixed 250 → OP -50
    const loss: KpiFundamentals = { revenue: 400, cogs: 150, advertising: 50, sga: 200, depreciation: 50 };
    const r20 = fixedCostReductionImpact(loss, [20])[0]!;
    expect(r20.newFixedCost).toBe(200); // 250*0.8
    expect(r20.newOperatingProfit).toBe(0); // 200 - 200 → break-even
  });
});
