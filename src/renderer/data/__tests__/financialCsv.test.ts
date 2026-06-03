import { describe, expect, it } from 'vitest';
import { ratiosToCsv, statementToCsv } from '../financialCsv';
import { computeFinancialRatios } from '../financialRatios';
import { buildIncomeStatement, type StatementLine } from '../financialStatements';
import { deriveBusinessFinancials } from '../businessFinancials';

describe('ratiosToCsv', () => {
  const a = computeFinancialRatios(deriveBusinessFinancials({ revenue: 1_000_000, variableCost: 400_000, fixedCost: 300_000, profit: 200_000, profitMargin: 20 }));
  const b = computeFinancialRatios(deriveBusinessFinancials({ revenue: 500_000, variableCost: 250_000, fixedCost: 150_000, profit: 50_000, profitMargin: 10 }));

  it('golden: exact header (全17列) + values for one business', () => {
    const expected =
      '事業,自己資本比率(%),流動比率(%),固定長期適合率(%),借入金月商倍率(ヶ月),債務償還年数(年),営業利益率(%),経常利益率(%),当期純利益率(%),当期純利益(円),労働分配率(%),EBITDA(円),EBITDAマージン(%),売上債権回転率(倍),棚卸資産回転率(倍),CCC(日),ROA(%),ROE(%)\r\n' +
      'A事業,50,183.3,64.3,2.21,0.8,20,19.6,13.7,1649088,39.5,2760000,23,8,12,39.5,17.2,34.4';
    expect(ratiosToCsv([{ label: 'A事業', ratios: a }])).toBe(expected);
  });

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

describe('statementToCsv', () => {
  it('golden: exact PL CSV incl. indented breakdown rows', () => {
    const f = deriveBusinessFinancials({ revenue: 1_000_000, variableCost: 400_000, fixedCost: 300_000, profit: 200_000, profitMargin: 20 });
    const expected = [
      '項目,金額',
      '売上高,12000000',
      '売上原価,4800000',
      '売上総利益,7200000',
      '販売費及び一般管理費,4800000',
      '　（うち 人件費）,1800000',
      '　（うち 減価償却費）,360000',
      '　（うち その他）,2640000',
      '営業利益,2400000',
      '営業外費用（支払利息）,44160',
      '経常利益,2355840',
      '法人税等,706752',
      '当期純利益,1649088',
    ].join('\r\n');
    expect(statementToCsv(buildIncomeStatement(f))).toBe(expected);
  });

  it('emits 項目,金額 with one row per line', () => {
    const f = deriveBusinessFinancials({ revenue: 1_000_000, variableCost: 400_000, fixedCost: 300_000, profit: 200_000, profitMargin: 20 });
    const csv = statementToCsv(buildIncomeStatement(f));
    const lines = csv.split('\r\n');
    expect(lines[0]).toBe('項目,金額');
    expect(lines).toHaveLength(buildIncomeStatement(f).length + 1);
    expect(lines[1]!.startsWith('売上高,')).toBe(true);
  });

  it('preserves indent with full-width spaces and uses display for non-amount rows', () => {
    const sample: StatementLine[] = [
      { label: '限界利益率', amount: null, display: '50.0%' },
      { label: '内訳', amount: 100, indent: 1 },
    ];
    const lines = statementToCsv(sample).split('\r\n');
    expect(lines[1]).toBe('限界利益率,50.0%');
    expect(lines[2]).toBe('　内訳,100');
  });
});
