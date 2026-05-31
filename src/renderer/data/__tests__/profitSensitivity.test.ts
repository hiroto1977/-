import { describe, expect, it } from 'vitest';
import { profitSensitivity, breakEvenDeltaPct } from '../profitSensitivity';
import type { KpiFundamentals } from '../kpiActuals';

// revenue 1000, variable (cogs+adv) 500 → rate 0.5, fixed (sga+dep) 250 → OP 250
const base: KpiFundamentals = { revenue: 1000, cogs: 400, advertising: 100, sga: 200, depreciation: 50 };

describe('profitSensitivity', () => {
  it('returns one row per delta, with the baseline at 0%', () => {
    const rows = profitSensitivity(base);
    expect(rows.map((r) => r.deltaPct)).toEqual([-10, -5, 0, 5, 10]);
    const baseRow = rows.find((r) => r.deltaPct === 0)!;
    expect(baseRow.revenue).toBe(1000);
    expect(baseRow.operatingProfit).toBe(250); // 1000 - 500 - 250
  });

  it('flexes operating profit by the contribution on the revenue swing', () => {
    const rows = profitSensitivity(base);
    // +10%: revenue 1100, variable 550, fixed 250 → OP 300 (contribution rate 0.5 × 100 extra)
    expect(rows.find((r) => r.deltaPct === 10)!.operatingProfit).toBe(300);
    // -10%: revenue 900, variable 450 → OP 200
    expect(rows.find((r) => r.deltaPct === -10)!.operatingProfit).toBe(200);
  });

  it('honours a custom delta set', () => {
    const rows = profitSensitivity(base, [0, 20]);
    expect(rows.map((r) => r.deltaPct)).toEqual([0, 20]);
    expect(rows[1]!.operatingProfit).toBe(350); // rev 1200, var 600, fixed 250
  });

  it('keeps every scenario at the baseline revenue when base revenue is zero', () => {
    const rows = profitSensitivity({ revenue: 0, cogs: 0, advertising: 0, sga: 100, depreciation: 0 });
    expect(rows.every((r) => r.revenue === 0)).toBe(true);
    expect(rows.every((r) => r.operatingProfit === -100)).toBe(true); // 0 - 0 - 100
  });

  it('computes the operating margin per scenario', () => {
    const rows = profitSensitivity(base);
    expect(rows.find((r) => r.deltaPct === 0)!.operatingMarginPct).toBe(25); // 250/1000
  });
});

describe('breakEvenDeltaPct', () => {
  it('is negative when the business is profitable (room before hitting BEP)', () => {
    // BEP revenue = fixed / contributionRate = 250 / 0.5 = 500 → (500-1000)/1000 = -50%
    expect(breakEvenDeltaPct(base)).toBe(-50);
  });

  it('is positive when the business is loss-making (revenue must grow to break even)', () => {
    // revenue 400, variable 200 (rate 0.5), fixed 250 → BEP rev 500 → +25%
    const loss: KpiFundamentals = { revenue: 400, cogs: 150, advertising: 50, sga: 200, depreciation: 50 };
    expect(breakEvenDeltaPct(loss)).toBe(25);
  });

  it('returns null when revenue is zero or contribution is non-positive', () => {
    expect(breakEvenDeltaPct({ revenue: 0, cogs: 0, advertising: 0, sga: 100, depreciation: 0 })).toBeNull();
    // variable cost >= revenue → contribution rate <= 0
    expect(breakEvenDeltaPct({ revenue: 100, cogs: 100, advertising: 20, sga: 10, depreciation: 0 })).toBeNull();
  });
});
