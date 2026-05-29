import { describe, expect, it } from 'vitest';
import {
  isValidPeriod,
  parseKpiActual,
  summarizeFundamentals,
  computeKpiMetrics,
  type KpiActual,
} from '../kpiActuals';

const BASE = {
  period: '2026-05',
  unit: 'EC',
  revenue: '1000000',
  cogs: '400000',
  advertising: '100000',
  sga: '200000',
  depreciation: '50000',
};

describe('isValidPeriod', () => {
  it('accepts YYYY-MM with a valid month', () => {
    expect(isValidPeriod('2026-01')).toBe(true);
    expect(isValidPeriod('2026-12')).toBe(true);
  });
  it('rejects bad shapes and out-of-range months', () => {
    expect(isValidPeriod('2026-13')).toBe(false);
    expect(isValidPeriod('2026-00')).toBe(false);
    expect(isValidPeriod('2026/05')).toBe(false);
    expect(isValidPeriod('26-05')).toBe(false);
    expect(isValidPeriod(202605)).toBe(false);
  });
});

describe('parseKpiActual', () => {
  it('coerces string numbers and trims the unit', () => {
    const a = parseKpiActual({ ...BASE, unit: '  EC  ' });
    expect(a).toEqual({
      period: '2026-05',
      unit: 'EC',
      revenue: 1_000_000,
      cogs: 400_000,
      advertising: 100_000,
      sga: 200_000,
      depreciation: 50_000,
    });
  });

  it('rejects an invalid period', () => {
    expect(() => parseKpiActual({ ...BASE, period: '2026-99' })).toThrow(/YYYY-MM/);
  });

  it('rejects an empty or oversized unit', () => {
    expect(() => parseKpiActual({ ...BASE, unit: '   ' })).toThrow(/事業名/);
    expect(() => parseKpiActual({ ...BASE, unit: 'x'.repeat(65) })).toThrow(/事業名/);
  });

  it('rejects negative or non-finite figures', () => {
    expect(() => parseKpiActual({ ...BASE, revenue: -1 })).toThrow(/売上高/);
    expect(() => parseKpiActual({ ...BASE, cogs: 'abc' })).toThrow(/売上原価/);
    expect(() => parseKpiActual({ ...BASE, sga: Infinity })).toThrow(/販管費/);
  });
});

describe('summarizeFundamentals', () => {
  it('returns zeros for an empty set', () => {
    expect(summarizeFundamentals([])).toEqual({
      revenue: 0,
      cogs: 0,
      advertising: 0,
      sga: 0,
      depreciation: 0,
    });
  });

  it('sums across actuals', () => {
    const rows: KpiActual[] = [
      { period: '2026-04', unit: 'EC', revenue: 100, cogs: 40, advertising: 10, sga: 20, depreciation: 5 },
      { period: '2026-05', unit: 'EC', revenue: 200, cogs: 80, advertising: 20, sga: 40, depreciation: 10 },
    ];
    expect(summarizeFundamentals(rows)).toEqual({
      revenue: 300,
      cogs: 120,
      advertising: 30,
      sga: 60,
      depreciation: 15,
    });
  });
});

describe('computeKpiMetrics', () => {
  it('computes break-even indicators on a profitable unit', () => {
    const m = computeKpiMetrics({ revenue: 1000, cogs: 400, advertising: 100, sga: 200, depreciation: 50 });
    expect(m.variableCost).toBe(500);
    expect(m.fixedCost).toBe(250);
    expect(m.contribution).toBe(500);
    expect(m.contributionRatio).toBeCloseTo(50);
    expect(m.bep).toBeCloseTo(500); // fixed / contribution * revenue = 250/500*1000
    expect(m.bepRatio).toBeCloseTo(50);
    expect(m.safetyMargin).toBeCloseTo(50);
    expect(m.operatingProfit).toBe(250);
  });

  it('marks BEP as Infinity when contribution is non-positive', () => {
    const m = computeKpiMetrics({ revenue: 100, cogs: 100, advertising: 50, sga: 10, depreciation: 0 });
    expect(m.contribution).toBeLessThanOrEqual(0);
    expect(m.bep).toBe(Infinity);
    expect(m.bepRatio).toBe(Infinity);
    expect(m.safetyMargin).toBe(0);
  });

  it('returns zeroed ratios for a zero-revenue unit', () => {
    const m = computeKpiMetrics({ revenue: 0, cogs: 0, advertising: 0, sga: 100, depreciation: 0 });
    expect(m.contributionRatio).toBe(0);
    expect(m.bep).toBe(Infinity);
    expect(m.operatingProfit).toBe(-100);
  });
});
