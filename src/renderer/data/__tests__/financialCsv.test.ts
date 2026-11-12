import { describe, expect, it } from 'vitest';
import { ratiosToCsv, statementToCsv, type CsvProvenance } from '../financialCsv';
import { computeFinancialRatios } from '../financialRatios';
import { buildBalanceSheet, buildIncomeStatement, statementEstimateNotes, type StatementLine } from '../financialStatements';
import { deriveBusinessFinancials } from '../businessFinancials';
import { toCsv } from '../csv';

/** 検査用の出所。実際の呼び手 (FinancialAnalysis) は `statementEstimateNotes()` を渡す。 */
const PROV: CsvProvenance = { scope: 'A事業・損益計算書', notes: ['※ 断り 1', '※ 断り 2'] };

describe('ratiosToCsv', () => {
  const a = computeFinancialRatios(deriveBusinessFinancials({ revenue: 1_000_000, variableCost: 400_000, fixedCost: 300_000, profit: 200_000, profitMargin: 20 }));
  const b = computeFinancialRatios(deriveBusinessFinancials({ revenue: 500_000, variableCost: 250_000, fixedCost: 150_000, profit: 50_000, profitMargin: 10 }));

  it('golden: exact header (全17列) + values for one business', () => {
    const expected =
      '事業,自己資本比率(%),流動比率(%),固定長期適合率(%),借入金月商倍率(ヶ月),債務償還年数(年),営業利益率(%),経常利益率(%),当期純利益率(%),当期純利益(円),労働分配率(%),EBITDA(円),EBITDAマージン(%),売上債権回転率(倍),棚卸資産回転率(倍),CCC(日),ROA(%),ROE(%)\r\n' +
      'A事業,50,183.3,64.3,2.21,0.8,20,19.6,13.7,1649088,39.5,2760000,23,8,12,39.5,17.2,34.4';
    expect(ratiosToCsv([{ label: 'A事業', ratios: a }], PROV).split('\r\n').slice(0, 2).join('\r\n')).toBe(expected);
  });

  it('emits a header row + one row per business (出所の 4 行が続く)', () => {
    const csv = ratiosToCsv([{ label: 'A事業', ratios: a }, { label: 'B事業', ratios: b }], PROV);
    const lines = csv.split('\r\n');
    expect(lines).toHaveLength(7); // header + 2 + 空行 + 対象 + 断り 2
    expect(lines[0]!.startsWith('事業,自己資本比率(%)')).toBe(true);
    expect(lines[1]!.startsWith('A事業,')).toBe(true);
    expect(lines[2]!.startsWith('B事業,')).toBe(true);
  });

  it('has 18 columns (事業 + 17 指標)、出所の行も同じ列数', () => {
    const csv = ratiosToCsv([{ label: 'A事業', ratios: a }], PROV);
    const rows = csv.split('\r\n').map((r) => r.split(','));
    expect(rows[0]).toHaveLength(18);
    // 欠けた列を嫌う取り込み側があるので、出所の行も 18 列に揃える。
    for (const row of rows) expect(row).toHaveLength(18);
  });

  it('renders nulls as empty fields', () => {
    const zero = computeFinancialRatios(deriveBusinessFinancials({ revenue: 0, variableCost: 0, fixedCost: 0, profit: 0, profitMargin: 0 }));
    const csv = ratiosToCsv([{ label: 'ゼロ', ratios: zero }], PROV);
    // 売上0 → 多くの比率が null → 連続する空フィールド ",," が現れる
    expect(csv.split('\r\n')[1]).toContain(',,');
  });

  it('quotes a label containing a comma (RFC 4180)', () => {
    const csv = ratiosToCsv([{ label: 'A,B', ratios: a }], PROV);
    expect(csv.split('\r\n')[1]!.startsWith('"A,B",')).toBe(true);
  });

  it('★ 指標 CSV も対象と断り書きを中に持つ', () => {
    const csv = ratiosToCsv([{ label: 'A事業', ratios: a }], PROV);
    expect(csv).toContain('対象: A事業・損益計算書');
    expect(csv).toContain('※ 断り 1');
    expect(csv).toContain('※ 断り 2');
  });
});

describe('statementToCsv', () => {
  const f = deriveBusinessFinancials({ revenue: 1_000_000, variableCost: 400_000, fixedCost: 300_000, profit: 200_000, profitMargin: 20 });

  it('golden: exact PL CSV incl. indented breakdown rows and the provenance block', () => {
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
      ',',
      '対象: A事業・損益計算書,',
      '※ 断り 1,',
      '※ 断り 2,',
    ].join('\r\n');
    expect(statementToCsv(buildIncomeStatement(f), PROV)).toBe(expected);
  });

  it('emits 項目,金額 with one row per line (+ 出所 4 行)', () => {
    const csv = statementToCsv(buildIncomeStatement(f), PROV);
    const lines = csv.split('\r\n');
    expect(lines[0]).toBe('項目,金額');
    expect(lines).toHaveLength(buildIncomeStatement(f).length + 1 + 4);
    expect(lines[1]!.startsWith('売上高,')).toBe(true);
  });

  it('preserves indent with full-width spaces and uses display for non-amount rows', () => {
    const sample: StatementLine[] = [
      { label: '限界利益率', amount: null, display: '50.0%' },
      { label: '内訳', amount: 100, indent: 1 },
    ];
    const lines = statementToCsv(sample, PROV).split('\r\n');
    expect(lines[1]).toBe('限界利益率,50.0%');
    expect(lines[2]).toBe('　内訳,100');
  });

  it('amount も display も無い行は空フィールドになる (?? "" フォールバック)', () => {
    // value = amount!=null ? String(amount) : (display ?? '') の '' 側を通す。
    // '' を別文字に変える mutant は "空行," 以外を出力するため殺せる。
    const sample: StatementLine[] = [{ label: '空行', amount: null }];
    const lines = statementToCsv(sample, PROV).split('\r\n');
    expect(lines[1]).toBe('空行,');
  });
});

/**
 * 出所の同梱 —— **これが無いと、書き出した貸借対照表が会社の実物として読める。**
 *
 * 2026-09-07 の実測: 諸表 CSV / 指標 CSV はどちらも断り書きを 1 行も持たず、
 * 中身 (`businessFinancials.ts` の概算) は現預金・売上債権・棚卸資産・仕入債務・
 * 短期借入金・長期借入金がどの画面でも入力されていない模型だった。
 */
describe('CsvProvenance — 概算の断りが書き出したファイルに残る', () => {
  const f = deriveBusinessFinancials({ revenue: 1_000_000, variableCost: 400_000, fixedCost: 300_000, profit: 200_000, profitMargin: 20 });
  const bs = buildBalanceSheet(f);
  const real: CsvProvenance = { scope: 'A事業・単体・貸借対照表', notes: statementEstimateNotes() };

  it('★ 標本: 実際の断り書き (画面と同じ文) が貸借対照表 CSV の中に在る', () => {
    const csv = statementToCsv([...bs.assets, ...bs.liabilitiesEquity], real);
    // 「概算である」と「BS は売上・収益性から生成した」の両方が要る。
    expect(csv).toContain('概算であり財務助言ではありません');
    expect(csv).toContain('事業別の貸借対照表データが無いため');
    expect(csv).toContain('対象: A事業・単体・貸借対照表');
  });

  it('★ 対照: 直す前の出力 (表だけ) には「概算」と読める語が 1 つも無い', () => {
    // 守っている物を**実際に組み直して**対照にする。2026-09-07 まで
    // `statementToCsv` は次の 1 行そのものだった。
    const lines = [...bs.assets, ...bs.liabilitiesEquity];
    const before = toCsv([
      ['項目', '金額'],
      ...lines.map((l) => ['　'.repeat(l.indent ?? 0) + l.label, l.amount != null ? String(l.amount) : (l.display ?? '')]),
    ]);
    expect(before).toContain('資産合計,'); // 表は同じ物を作れている (標本)
    expect(before).not.toContain('概算であり財務助言ではありません');
    expect(before).not.toContain('事業別の貸借対照表データが無いため');
    // 直した後は、その出力を**そのまま先頭に含み**、後ろに出所が付くだけ。
    const after = statementToCsv(lines, real);
    expect(after.startsWith(before)).toBe(true);
    expect(after.length).toBeGreaterThan(before.length);
  });

  it('表の後ろに置く (見出し行は 1 行目・出所は末尾)', () => {
    const csv = statementToCsv(buildIncomeStatement(f), real);
    const lines = csv.split('\r\n');
    expect(lines[0]).toBe('項目,金額');
    expect(lines[lines.length - 1]!.startsWith(statementEstimateNotes()[1]!)).toBe(true);
    // 空行 1 行 → 対象 → 断り書き の順。
    expect(lines[buildIncomeStatement(f).length + 1]).toBe(',');
    expect(lines[buildIncomeStatement(f).length + 2]).toBe('対象: A事業・単体・貸借対照表,');
  });

  it('対象が空なら投げる (文脈を書いたことになっている空欄を作らない)', () => {
    expect(() => statementToCsv(buildIncomeStatement(f), { scope: '   ', notes: ['※ x'] })).toThrow(/scope が空/);
    expect(() => ratiosToCsv([], { scope: '', notes: ['※ x'] })).toThrow(/scope が空/);
  });

  it('断り書きが空なら投げる (空文字だけを詰めた配列も含む)', () => {
    expect(() => statementToCsv(buildIncomeStatement(f), { scope: 'A', notes: [] })).toThrow(/notes が空/);
    expect(() => ratiosToCsv([], { scope: 'A', notes: [] })).toThrow(/notes が空/);
    expect(() => statementToCsv(buildIncomeStatement(f), { scope: 'A', notes: ['  '] })).toThrow(/notes が空/);
    // 対照: 1 つでも中身が在れば通る。
    expect(() => statementToCsv(buildIncomeStatement(f), { scope: 'A', notes: ['※ x'] })).not.toThrow();
  });
});
