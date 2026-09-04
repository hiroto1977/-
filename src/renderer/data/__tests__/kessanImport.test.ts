/**
 * 経営サマリー → 計算書類の取り込み。
 * 事業年度で切り出すこと、内訳の無い額を「その他」に置いて注記すること、
 * 取り込んだ後の貸借対照表が**実際の集計関数で**貸借一致すること (差額 0) を固定する。
 */
import { describe, expect, it } from 'vitest';
import { buildKessanImport, fiscalYearWindow, type KessanImportInput } from '../kessanImport';
import { amountOf, balanceTotals, incomeTotals } from '../statementAccounts';
import { EMPTY_PROFILE, type SubmissionProfile } from '../bankSubmission';
import type { KpiActual } from '../kpiActuals';
import type { BalanceSheet } from '../balanceSheet';

const kpi = (period: string, revenue: number, extra: Partial<KpiActual> = {}): KpiActual => ({
  period, unit: '全社', revenue, cogs: revenue * 0.4, advertising: 100_000, sga: 2_000_000, depreciation: 50_000, laborCost: 1_200_000, ...extra,
});
const KPI: KpiActual[] = [
  kpi('2025-03', 9_999_999), // 前期 (対象外)
  kpi('2025-04', 1_000_000),
  kpi('2025-10', 2_000_000),
  kpi('2026-03', 3_000_000),
  kpi('2026-04', 8_888_888), // 翌期 (対象外)
];
const BS: BalanceSheet = {
  asOf: '2026-03-31', currentAssets: 8_000_000, cash: 3_000_000, inventory: 1_000_000, accountsReceivable: 2_000_000,
  fixedAssets: 4_000_000, currentLiabilities: 5_000_000, accountsPayable: 1_500_000, fixedLiabilities: 3_000_000,
  interestBearingDebt: 2_000_000, netIncome: 600_000,
};
const PROFILE: SubmissionProfile = { companyName: '株式会社テスト', representative: '', address: '', fiscalYearEnd: '2026-03' };

function build(extra: Partial<KessanImportInput> = {}) {
  return buildKessanImport({ kpiActuals: KPI, balanceSheet: BS, profile: PROFILE, existing: {}, ...extra });
}
const rowOf = (r: ReturnType<typeof build>, k: string) => r.rows.find((x) => x.k === k);
const valueOf = (r: ReturnType<typeof build>, k: string) => rowOf(r, k)?.value;
/** 取り込んだ値で貸借対照表を組んだときの差額 (0 なら貸借一致)。 */
function difference(values: Record<string, string>): number {
  const income = incomeTotals(values);
  return balanceTotals(
    values,
    { retainedEarningsOpening: amountOf(values, 'retainedEarningsOpening'), dividends: amountOf(values, 'dividends'), reserveTransfer: amountOf(values, 'reserveTransfer') },
    income.netIncome,
  ).difference;
}

describe('fiscalYearWindow', () => {
  it('決算月から 12 か月さかのぼる', () => {
    expect(fiscalYearWindow('2026-03')).toEqual({ from: '2025-04', to: '2026-03' });
    expect(fiscalYearWindow('2026-12')).toEqual({ from: '2026-01', to: '2026-12' });
    expect(fiscalYearWindow('2026-01')).toEqual({ from: '2025-02', to: '2026-01' });
    expect(fiscalYearWindow('')).toBeNull();
    expect(fiscalYearWindow('2026-13')).toBeNull();
    expect(fiscalYearWindow('2026/03')).toBeNull();
  });
});

describe('buildKessanImport — 揃った入力', () => {
  it('会社名・事業年度は提出者情報から、損益は事業年度の 12 か月だけを合算する', () => {
    const r = build();
    expect(r.window).toEqual({ from: '2025-04', to: '2026-03' });
    expect(valueOf(r, 'company')).toBe('株式会社テスト');
    expect(rowOf(r, 'company')?.source).toBe('提出者情報');
    expect(valueOf(r, 'fyStart')).toBe('2025年4月1日');
    expect(valueOf(r, 'fyEnd')).toBe('2026年3月31日');
    expect(rowOf(r, 'fyEnd')?.source).toBe('提出者情報の決算期');
    // 1,000,000 + 2,000,000 + 3,000,000 (前期・翌期は入らない)
    expect(valueOf(r, 'sales')).toBe('6000000');
    expect(valueOf(r, 'purchases')).toBe('2400000');
    expect(valueOf(r, 'advertising')).toBe('300000');
    expect(valueOf(r, 'depreciation')).toBe('150000');
    expect(valueOf(r, 'salaries')).toBe('3600000');
    expect(valueOf(r, 'miscSga')).toBe('2400000'); // 販管費 6,000,000 − 人件費 3,600,000
    expect(rowOf(r, 'sales')?.source).toBe('KPI 実績 (2025年4月〜2026年3月)');
    expect(rowOf(r, 'sales')?.label).toBe('売上高');
    expect(r.notes).toContain('売上原価は当期商品仕入高に置いた。期首・期末の商品棚卸高は入っていないので、棚卸があるなら分けること。');
    expect(r.notes.some((n) => n.includes('雑費に置いた'))).toBe(true);
    expect(r.skipped).toEqual([]);
    expect(rowOf(r, 'fyStart')).toEqual({ k: 'fyStart', label: '事業年度（自）', value: '2025年4月1日', source: '提出者情報の決算期' });
    expect(rowOf(r, 'fyEnd')).toEqual({ k: 'fyEnd', label: '事業年度（至）', value: '2026年3月31日', source: '提出者情報の決算期' });
    // 注記は置き方の説明だけ (矛盾・現預金なし・法人税の逆算はこの入力では出ない)
    expect(r.notes).toEqual([
      '売上原価は当期商品仕入高に置いた。期首・期末の商品棚卸高は入っていないので、棚卸があるなら分けること。',
      '人件費以外の販管費は内訳が無いので雑費に置いた。役員報酬・地代家賃・支払手数料などの科目へ振り分け直すこと。',
      '固定資産は内訳が無いのでその他の固定資産に置いた。建物・機械装置・土地などへ振り分け、減価償却累計額を入れること。',
      '有利子負債は固定負債に収まる分を長期借入金、残りを短期借入金に置いた。返済期限で分け直すこと。',
      '貸借対照表の当期純利益が KPI 実績の営業利益以上なので、法人税等は逆算していない (営業外収益などを入れること)。',
      '繰越利益剰余金 (期首残高) は貸借を合わせるための逆算値。資本金・資本剰余金・利益準備金を入れ直したら、もう一度取り込むこと。',
    ]);
  });
  it('貸借対照表の合計値を「その他」に置き、借入金は固定負債に収まる分を長期にする', () => {
    const r = build();
    expect(valueOf(r, 'cash')).toBe('3000000');
    expect(valueOf(r, 'accountsReceivable')).toBe('2000000');
    expect(valueOf(r, 'inventory')).toBe('1000000');
    expect(valueOf(r, 'otherCurrentAsset')).toBe('2000000');
    expect(valueOf(r, 'otherFixedAsset')).toBe('4000000');
    expect(valueOf(r, 'accountsPayable')).toBe('1500000');
    expect(valueOf(r, 'longTermDebt')).toBe('2000000');
    expect(valueOf(r, 'shortTermDebt')).toBe('0');
    expect(valueOf(r, 'otherCurrentLiability')).toBe('3500000');
    expect(valueOf(r, 'otherFixedLiability')).toBe('1000000');
    expect(rowOf(r, 'cash')?.source).toBe('貸借対照表 (2026-03-31 時点)');
    expect(r.notes.some((n) => n.includes('その他の固定資産に置いた'))).toBe(true);
    expect(r.notes.some((n) => n.includes('長期借入金'))).toBe(true);
  });
  it('法人税等は KPI の営業利益と貸借対照表の当期純利益の差', () => {
    const r = build();
    // 営業利益 = 6,000,000 − 2,400,000 − 300,000 − 6,000,000 − 150,000 = −2,850,000 → 純利益 600,000 より小さいので逆算しない
    expect(rowOf(r, 'incomeTax')).toBeUndefined();
    expect(r.notes.some((n) => n.includes('法人税等は逆算していない'))).toBe(true);
    const profitable = build({ kpiActuals: KPI.map((k) => ({ ...k, sga: 100_000, laborCost: 50_000 })) });
    // 営業利益 = 6,000,000 − 2,400,000 − 300,000 − 300,000 − 150,000 = 2,850,000 → 税 2,250,000
    expect(rowOf(profitable, 'incomeTax')).toEqual({ k: 'incomeTax', label: '法人税、住民税及び事業税', value: '2250000', source: '逆算 (KPI の営業利益 − 貸借対照表の当期純利益)' });
    expect(profitable.notes).toContain('法人税、住民税及び事業税は KPI 実績の営業利益と貸借対照表の当期純利益の差から逆算した。営業外損益・特別損益があるなら直すこと。');
    // 差がちょうど 0 なら逆算しない (0 の税額を書かない)
    const exact = build({ kpiActuals: KPI.map((k) => ({ ...k, sga: 100_000, laborCost: 50_000 })), balanceSheet: { ...BS, netIncome: 2_850_000 } });
    expect(rowOf(exact, 'incomeTax')).toBeUndefined();
    expect(exact.notes.some((n) => n.includes('法人税等は逆算していない'))).toBe(true);
  });
  it('取り込んだ値で組んだ貸借対照表は貸借が合う (差額 0)。資本金・配当・積立を入れてあっても合う', () => {
    const r = build();
    expect(difference(r.values)).toBe(0);
    expect(rowOf(r, 'retainedEarningsOpening')?.source).toContain('逆算');
    const withEquity = build({ existing: { capitalStock: '1000000', capitalSurplus: '200000', legalReserve: '50000', dividends: '100000', reserveTransfer: '10000', rent: '480000' } });
    expect(difference(withEquity.values)).toBe(0);
    expect(withEquity.values.capitalStock).toBe('1000000');
    expect(withEquity.values.rent).toBe('480000');
    expect(withEquity.values.retainedEarningsOpening).not.toBe(r.values.retainedEarningsOpening);
    expect(withEquity.notes.some((n) => n.includes('繰越利益剰余金 (期首残高) は貸借を合わせるための逆算値'))).toBe(true);
  });
  it('取り込む行はすべて values に載り、既存の無関係な値は残る', () => {
    const r = build({ existing: { officerComp: '3600000', inventoryPolicy: '最終仕入原価法' } });
    for (const row of r.rows) expect(r.values[row.k]).toBe(row.value);
    expect(r.values.officerComp).toBe('3600000');
    expect(r.values.inventoryPolicy).toBe('最終仕入原価法');
  });
});

describe('buildKessanImport — 欠けた入力', () => {
  it('決算期が無ければ KPI の全期間を合算し、そのことを注記する', () => {
    const r = build({ profile: { ...PROFILE, fiscalYearEnd: '' } });
    expect(r.window).toEqual({ from: '2025-03', to: '2026-04' });
    expect(valueOf(r, 'sales')).toBe(String(9_999_999 + 1_000_000 + 2_000_000 + 3_000_000 + 8_888_888));
    expect(valueOf(r, 'fyStart')).toBe('2025年3月1日');
    expect(valueOf(r, 'fyEnd')).toBe('2026年4月30日');
    expect(rowOf(r, 'fyEnd')?.source).toBe('KPI 実績の期');
    expect(r.notes.some((n) => n.startsWith('決算期が未設定のため、KPI 実績の全期間 (2025年3月〜2026年4月) を合算した'))).toBe(true);
  });
  it('決算期の 12 か月に KPI が無ければ全期間へ倒し、そのことを注記する', () => {
    const r = build({ profile: { ...PROFILE, fiscalYearEnd: '2030-03' } });
    expect(r.window).toEqual({ from: '2025-03', to: '2026-04' });
    expect(r.notes.some((n) => n.startsWith('決算期 (2030年3月期) の 12 か月に KPI 実績が無いため'))).toBe(true);
    expect(rowOf(r, 'fyStart')).toEqual({ k: 'fyStart', label: '事業年度（自）', value: '2025年3月1日', source: 'KPI 実績の期' });
    expect(rowOf(r, 'fyEnd')).toEqual({ k: 'fyEnd', label: '事業年度（至）', value: '2026年4月30日', source: 'KPI 実績の期' });
  });
  it('KPI の並び順に依らず最初と最後の期を取る', () => {
    const r = build({ kpiActuals: [kpi('2026-04', 1), kpi('2025-03', 2), kpi('2025-10', 3)], profile: { ...PROFILE, fiscalYearEnd: '' } });
    expect(r.window).toEqual({ from: '2025-03', to: '2026-04' });
  });
  it('KPI が無ければ損益は取り込まず、事業年度は決算期から入れる。法人税等も逆算しない', () => {
    const r = build({ kpiActuals: [] });
    expect(r.window).toBeNull();
    expect(rowOf(r, 'sales')).toBeUndefined();
    expect(rowOf(r, 'incomeTax')).toBeUndefined();
    expect(valueOf(r, 'fyStart')).toBe('2025年4月1日');
    expect(valueOf(r, 'fyEnd')).toBe('2026年3月31日');
    expect(r.skipped).toContain('損益 (売上高・売上原価・販管費): KPI 実績が未入力');
    expect(rowOf(r, 'fyStart')).toEqual({ k: 'fyStart', label: '事業年度（自）', value: '2025年4月1日', source: '提出者情報の決算期' });
    expect(r.notes.some((n) => n.includes('法人税等'))).toBe(false);
    expect(difference(r.values)).toBe(0);
  });
  it('KPI も決算期も無ければ事業年度も入れない', () => {
    const r = build({ kpiActuals: [], profile: EMPTY_PROFILE });
    expect(rowOf(r, 'fyStart')).toBeUndefined();
    expect(rowOf(r, 'company')).toBeUndefined();
    expect(r.skipped[0]).toContain('会社名');
  });
  it('貸借対照表が無ければ資産・負債は取り込まず、期首残高の逆算もしない', () => {
    const r = build({ balanceSheet: null });
    expect(rowOf(r, 'cash')).toBeUndefined();
    expect(rowOf(r, 'retainedEarningsOpening')).toBeUndefined();
    expect(r.skipped).toContain('資産・負債 (現預金・売掛金・買掛金・借入金…): 貸借対照表が未入力');
    expect(valueOf(r, 'sales')).toBe('6000000');
  });
  it('何も無ければ行は空で、足りない物が並ぶ', () => {
    const r = build({ kpiActuals: [], balanceSheet: null, profile: EMPTY_PROFILE });
    expect(r.rows).toEqual([]);
    expect(r.notes).toEqual([]);
    expect(r.skipped).toEqual([
      '会社名: 提出者情報の商号が未設定 (経営サマリー → 金融機関等提出用の書式 → 提出者情報)',
      '損益 (売上高・売上原価・販管費): KPI 実績が未入力',
      '資産・負債 (現預金・売掛金・買掛金・借入金…): 貸借対照表が未入力',
    ]);
    expect(r.values).toEqual({});
  });
});

describe('buildKessanImport — 内訳の矛盾は 0 にして注記する', () => {
  it('人件費が販管費を超える', () => {
    const r = build({ kpiActuals: [kpi('2025-06', 1_000_000, { sga: 100_000, laborCost: 300_000 })] });
    expect(valueOf(r, 'miscSga')).toBe('0');
    expect(valueOf(r, 'salaries')).toBe('300000');
    expect(r.notes.some((n) => n.startsWith('人件費が販管費を超えている'))).toBe(true);
  });
  it('人件費と販管費がちょうど同じなら雑費 0 で、超えている注記は出ない', () => {
    const r = build({ kpiActuals: [kpi('2025-06', 1_000_000, { sga: 300_000, laborCost: 300_000 })] });
    expect(valueOf(r, 'miscSga')).toBe('0');
    expect(r.notes.some((n) => n.startsWith('人件費が販管費を超えている'))).toBe(false);
    expect(r.notes.some((n) => n.includes('雑費に置いた'))).toBe(true);
  });
  it('内訳がちょうど合計と同じなら「その他」は 0 で、超えている注記は出ない', () => {
    const r = build({ balanceSheet: { ...BS, currentAssets: 6_000_000, currentLiabilities: 1_500_000, interestBearingDebt: 0 } });
    expect(valueOf(r, 'otherCurrentAsset')).toBe('0');
    expect(valueOf(r, 'otherCurrentLiability')).toBe('0');
    expect(r.notes.some((n) => n.includes('超えている'))).toBe(false);
    expect(r.notes.some((n) => n.includes('現預金が無い'))).toBe(false);
    expect(difference(r.values)).toBe(0);
  });
  it('人件費が 0 なら給料手当の行は作らない', () => {
    const r = build({ kpiActuals: [kpi('2025-06', 1_000_000, { laborCost: 0 })] });
    expect(rowOf(r, 'salaries')).toBeUndefined();
    expect(valueOf(r, 'miscSga')).toBe('2000000');
  });
  it('現預金が未入力なら 0 として注記する', () => {
    const { cash: _omit, ...noCash } = BS;
    const r = build({ balanceSheet: noCash as BalanceSheet });
    expect(valueOf(r, 'cash')).toBe('0');
    expect(valueOf(r, 'otherCurrentAsset')).toBe('5000000');
    expect(r.notes.some((n) => n.includes('現預金が無い'))).toBe(true);
    expect(difference(r.values)).toBe(0);
  });
  it('内訳が合計を超えたら「その他」は 0', () => {
    const r = build({ balanceSheet: { ...BS, currentAssets: 5_000_000, currentLiabilities: 1_000_000, interestBearingDebt: 4_000_000 } });
    expect(valueOf(r, 'otherCurrentAsset')).toBe('0');
    expect(valueOf(r, 'longTermDebt')).toBe('3000000');
    expect(valueOf(r, 'shortTermDebt')).toBe('1000000');
    expect(valueOf(r, 'otherCurrentLiability')).toBe('0');
    expect(valueOf(r, 'otherFixedLiability')).toBe('0');
    expect(r.notes.some((n) => n.startsWith('現預金・売掛金・棚卸資産の合計が流動資産を超えている'))).toBe(true);
    expect(r.notes.some((n) => n.startsWith('買掛金と短期借入金の合計が流動負債を超えている'))).toBe(true);
    expect(difference(r.values)).toBe(0);
  });
  it('有利子負債が無ければ借入金の注記は出ない', () => {
    const { interestBearingDebt: _omit, ...noDebt } = BS;
    const r = build({ balanceSheet: noDebt as BalanceSheet });
    expect(valueOf(r, 'longTermDebt')).toBe('0');
    expect(valueOf(r, 'shortTermDebt')).toBe('0');
    expect(r.notes.some((n) => n.includes('長期借入金'))).toBe(false);
  });
  it('読めない期は無視する', () => {
    const r = build({ kpiActuals: [kpi('bad', 5), kpi('2025-06', 1_000_000)], profile: { ...PROFILE, fiscalYearEnd: '' } });
    expect(r.window).toEqual({ from: '2025-06', to: '2025-06' });
    expect(valueOf(r, 'sales')).toBe('1000000');
  });
});
