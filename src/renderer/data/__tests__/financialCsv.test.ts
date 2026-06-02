import { describe, expect, it } from 'vitest';
import { ratiosToCsv } from '../financialCsv';
import { computeFinancialRatios } from '../financialRatios';
import { deriveBusinessFinancials } from '../businessFinancials';

describe('ratiosToCsv', () => {
  const a = computeFinancialRatios(deriveBusinessFinancials({ revenue: 1_000_000, variableCost: 400_000, fixedCost: 300_000, profit: 200_000, profitMargin: 20 }));
  const b = computeFinancialRatios(deriveBusinessFinancials({ revenue: 500_000, variableCost: 250_000, fixedCost: 150_000, profit: 50_000, profitMargin: 10 }));

  it('emits a header row + one row per business', () => {
    const csv = ratiosToCsv([{ label: 'A事業', ratios: a }, { label: 'B事業', ratios: b }]);
    const lines = csv.split('\r\n');
    expect(lines).toHaveLength(3); // header + 2
    expect(lines[0]!.startsWith('事業,自己資本比率(%)')).toBe(true);
    expect(lines[1]!.startsWith('A事業,')).toBe(true);
    expect(lines[2]!.startsWith('B事業,')).toBe(true);
  });

  it('has 18 columns (事業 + 17 指標)', () => {
    const csv = ratiosToCsv([{ label: 'A事業', ratios: a }]);
    const header = csv.split('\r\n')[0]!.split(',');
    expect(header).toHaveLength(18);
  });

  it('renders nulls as empty fields', () => {
    const zero = computeFinancialRatios(deriveBusinessFinancials({ revenue: 0, variableCost: 0, fixedCost: 0, profit: 0, profitMargin: 0 }));
    const csv = ratiosToCsv([{ label: 'ゼロ', ratios: zero }]);
    // 売上0 → 多くの比率が null → 連続する空フィールド ",," が現れる
    expect(csv.split('\r\n')[1]).toContain(',,');
  });

  it('quotes a label containing a comma (RFC 4180)', () => {
    const csv = ratiosToCsv([{ label: 'A,B', ratios: a }]);
    expect(csv.split('\r\n')[1]!.startsWith('"A,B",')).toBe(true);
  });
});
