import { describe, expect, it } from 'vitest';
import {
  buildIncomeStatement, buildBalanceSheet, buildCashflowStatement,
  buildVariableCostingStatement, buildComprehensiveIncome, buildEquityChangeStatement, sumFinancialInputs,
  buildQuarterlyStatement, buildNotesStatement, buildSupplementarySchedule, buildAccountBreakdown,
} from '../financialStatements';
import { deriveBusinessFinancials } from '../businessFinancials';
import type { FinancialInputs } from '../financialRatios';

const F: FinancialInputs = {
  revenue: 12_000, cogs: 6_000, operatingProfit: 1_200, ordinaryProfit: 1_100, netProfit: 800,
  depreciation: 300, laborCost: 3_000, interestExpense: 100,
  totalAssets: 10_000, equity: 4_000, currentAssets: 5_000, currentLiabilities: 2_500,
  fixedAssets: 5_000, fixedLiabilities: 3_500, accountsReceivable: 2_000, inventory: 1_000,
  accountsPayable: 1_500, interestBearingDebt: 4_000,
};

function amt(lines: { label: string; amount: number | null }[], label: string): number | null {
  return lines.find((l) => l.label === label)?.amount ?? null;
}

describe('buildIncomeStatement', () => {
  const pl = buildIncomeStatement(F);
  it('computes the PL waterfall', () => {
    expect(amt(pl, '売上高')).toBe(12_000);
    expect(amt(pl, '売上総利益')).toBe(6_000); // 12000-6000
    expect(amt(pl, '販売費及び一般管理費')).toBe(4_800); // grossProfit - operatingProfit
    expect(amt(pl, '営業利益')).toBe(1_200);
    expect(amt(pl, '経常利益')).toBe(1_100);
    expect(amt(pl, '法人税等')).toBe(300); // 1100-800
    expect(amt(pl, '当期純利益')).toBe(800);
  });
});

describe('buildIncomeStatement breakdown lines', () => {
  const pl = buildIncomeStatement(F);
  it('splits SG&A into labor / depreciation / other and shows non-operating interest', () => {
    expect(amt(pl, '（うち 人件費）')).toBe(3_000);
    expect(amt(pl, '（うち 減価償却費）')).toBe(300);
    expect(amt(pl, '（うち その他）')).toBe(1_500); // sga 4800 − 人件費3000 − 減価償却300
    expect(amt(pl, '営業外費用（支払利息）')).toBe(100);
  });
});

describe('buildBalanceSheet', () => {
  it('asset side totals to totalAssets', () => {
    const { assets } = buildBalanceSheet(F);
    expect(amt(assets, '資産合計')).toBe(10_000);
    expect(amt(assets, '現預金')).toBe(2_000); // 5000 - 2000 - 1000
  });
  it('liabilities + equity balances to total assets', () => {
    const { liabilitiesEquity } = buildBalanceSheet(F);
    expect(amt(liabilitiesEquity, '負債・純資産合計')).toBe(10_000);
    expect(amt(liabilitiesEquity, '純資産（自己資本）')).toBe(4_000);
  });
  it('splits debt into short/long term and other liabilities (exact)', () => {
    const { liabilitiesEquity } = buildBalanceSheet(F);
    expect(amt(liabilitiesEquity, '短期借入金')).toBe(750); // 流動負債2500 × 0.3
    expect(amt(liabilitiesEquity, '（その他流動負債）')).toBe(250); // 2500 − 仕入1500 − 750
    expect(amt(liabilitiesEquity, '長期借入金')).toBe(3_250); // 有利子4000 − 短期750
    expect(amt(liabilitiesEquity, '（その他固定負債）')).toBe(250); // 固定3500 − 長期3250
    expect(amt(liabilitiesEquity, '負債合計')).toBe(6_000); // 2500 + 3500
  });
});

describe('buildCashflowStatement', () => {
  it('uses simplified indirect operating CF and FCF', () => {
    const cf = buildCashflowStatement(F);
    expect(amt(cf, '営業活動によるキャッシュフロー')).toBe(1_100); // netProfit 800 + dep 300
    expect(amt(cf, '投資活動によるキャッシュフロー')).toBe(-300);
    expect(amt(cf, 'フリーキャッシュフロー（営業+投資）')).toBe(800);
  });
  it('honors an explicit operatingCashflow', () => {
    const cf = buildCashflowStatement({ ...F, operatingCashflow: 2_000 });
    expect(amt(cf, '営業活動によるキャッシュフロー')).toBe(2_000);
  });
});

describe('integration with deriveBusinessFinancials', () => {
  it('BS built from a derived business balances', () => {
    const f = deriveBusinessFinancials({ revenue: 1_000_000, variableCost: 400_000, fixedCost: 300_000, profit: 200_000, profitMargin: 20 });
    const { assets, liabilitiesEquity } = buildBalanceSheet(f);
    expect(amt(assets, '資産合計')).toBe(amt(liabilitiesEquity, '負債・純資産合計'));
  });
});


describe('buildVariableCostingStatement', () => {
  it('computes contribution, fixed cost and BEP', () => {
    const v = buildVariableCostingStatement(F);
    expect(amt(v, '限界利益')).toBe(6_000); // 12000-6000
    expect(amt(v, '固定費')).toBe(4_800); // 6000-1200
    // BEP = fixedCost / contributionRatio = 4800 / 0.5 = 9600
    expect(amt(v, '損益分岐点売上高')).toBe(9_600);
    expect(v.find((l) => l.label === '限界利益率')?.display).toBe('50.0%');
  });
});

describe('buildComprehensiveIncome', () => {
  it('comprehensive income = net profit when OCI is 0', () => {
    const ci = buildComprehensiveIncome(F);
    expect(amt(ci, '当期純利益')).toBe(800);
    expect(amt(ci, '包括利益')).toBe(800);
  });
});

describe('buildEquityChangeStatement', () => {
  it('rolls equity: beginning + netProfit − dividend = ending', () => {
    const s = buildEquityChangeStatement(F, 0.25);
    const beg = amt(s, '当期首 純資産残高')!;
    const end = amt(s, '当期末 純資産残高')!;
    const div = amt(s, '剰余金の配当')!; // negative
    expect(end).toBe(4_000);
    expect(beg + 800 + div).toBe(end);
    expect(div).toBe(-200); // 800 * 0.25
  });
});

describe('buildQuarterlyStatement', () => {
  it('aggregates monthly history into quarters and a full-year total', () => {
    const history = Array.from({ length: 12 }, () => ({ revenue: 100, profit: 10 }));
    const q = buildQuarterlyStatement(history);
    // 4 四半期 → 各四半期 売上 300 / 利益 30
    expect(amt(q, '第1四半期 (3ヶ月)')).toBe(null);
    expect(q.filter((l) => l.label === '売上高').every((l) => l.amount === 300)).toBe(true);
    expect(amt(q, '通期 売上高')).toBe(1_200);
    expect(amt(q, '通期 利益')).toBe(120);
    expect(q.find((l) => l.label === '通期 利益率')?.display).toBe('10.0%');
  });
  it('handles empty history', () => {
    expect(buildQuarterlyStatement([])[0]?.label).toBe('履歴データがありません');
  });
});

describe('buildNotesStatement', () => {
  it('exposes accounting policy notes and balance-sheet figures', () => {
    const n = buildNotesStatement(F);
    expect(n.find((l) => l.label === '固定資産の減価償却の方法')?.display).toBe('定額法（概算）');
    expect(amt(n, '有利子負債の額')).toBe(4_000);
    expect(amt(n, '販管費に含まれる人件費')).toBe(3_000);
  });
});

describe('buildSupplementarySchedule', () => {
  it('breaks debt into short/long term summing to interest-bearing debt', () => {
    const s = buildSupplementarySchedule(F);
    const short = amt(s, '短期借入金')!; // 2500 * 0.3 = 750
    const long = amt(s, '長期借入金')!; // 4000 - 750 = 3250
    expect(short).toBe(750);
    expect(long).toBe(3_250);
    expect(amt(s, '有利子負債 合計')).toBe(4_000);
    expect(amt(s, '有形固定資産（期末残高）')).toBe(5_000);
  });
});

describe('buildAccountBreakdown', () => {
  it('lists major account balances', () => {
    const b = buildAccountBreakdown(F);
    expect(amt(b, '現預金（概算）')).toBe(2_000); // 5000 - 2000 - 1000
    expect(amt(b, '売掛金 期末残高')).toBe(2_000);
    expect(amt(b, '買掛金 期末残高')).toBe(1_500);
    expect(amt(b, '短期借入金')).toBe(750);
  });
});

describe('sumFinancialInputs (連結)', () => {
  it('sums every field across entities', () => {
    const a = deriveBusinessFinancials({ revenue: 1_000_000, variableCost: 400_000, fixedCost: 300_000, profit: 200_000, profitMargin: 20 });
    const b = deriveBusinessFinancials({ revenue: 500_000, variableCost: 250_000, fixedCost: 150_000, profit: 50_000, profitMargin: 10 });
    const sum = sumFinancialInputs([a, b]);
    expect(sum.revenue).toBe(a.revenue + b.revenue);
    expect(sum.totalAssets).toBe(a.totalAssets + b.totalAssets);
    // 連結 BS も均衡する (各社が均衡しているため)。
    const { assets, liabilitiesEquity } = buildBalanceSheet(sum);
    expect(amt(assets, '資産合計')).toBe(amt(liabilitiesEquity, '負債・純資産合計'));
  });
});

describe('golden: exact statement structures (kills label/flag/amount mutants)', () => {
  it('buildBalanceSheet 資産の部 / 負債・純資産の部', () => {
    const bs = buildBalanceSheet(F);
    expect(JSON.stringify(bs.assets)).toBe('[{"label":"流動資産","amount":5000,"emphasis":true},{"label":"現預金","amount":2000,"indent":1},{"label":"売上債権","amount":2000,"indent":1},{"label":"棚卸資産","amount":1000,"indent":1},{"label":"固定資産","amount":5000,"emphasis":true},{"label":"資産合計","amount":10000,"emphasis":true}]');
    expect(JSON.stringify(bs.liabilitiesEquity)).toBe('[{"label":"流動負債","amount":2500,"emphasis":true},{"label":"仕入債務","amount":1500,"indent":1},{"label":"短期借入金","amount":750,"indent":1},{"label":"（その他流動負債）","amount":250,"indent":1},{"label":"固定負債","amount":3500,"emphasis":true},{"label":"長期借入金","amount":3250,"indent":1},{"label":"（その他固定負債）","amount":250,"indent":1},{"label":"負債合計","amount":6000,"emphasis":true},{"label":"純資産（自己資本）","amount":4000,"emphasis":true},{"label":"負債・純資産合計","amount":10000,"emphasis":true}]');
  });
  it('buildCashflowStatement', () => {
    expect(JSON.stringify(buildCashflowStatement(F))).toBe('[{"label":"営業活動によるキャッシュフロー","amount":1100,"emphasis":true},{"label":"当期純利益","amount":800,"indent":1},{"label":"減価償却費","amount":300,"indent":1},{"label":"投資活動によるキャッシュフロー","amount":-300,"emphasis":true},{"label":"（維持投資 ≈ 減価償却費 と仮定）","amount":null,"indent":1},{"label":"財務活動によるキャッシュフロー","amount":0,"emphasis":true},{"label":"（借入増減データ無し → 概算0）","amount":null,"indent":1},{"label":"フリーキャッシュフロー（営業+投資）","amount":800,"emphasis":true}]');
  });
  it('buildVariableCostingStatement', () => {
    expect(JSON.stringify(buildVariableCostingStatement(F))).toBe('[{"label":"売上高","amount":12000,"emphasis":true},{"label":"変動費","amount":6000},{"label":"限界利益","amount":6000,"emphasis":true},{"label":"限界利益率","amount":null,"display":"50.0%"},{"label":"固定費","amount":4800},{"label":"営業利益","amount":1200,"emphasis":true},{"label":"損益分岐点売上高","amount":9600,"emphasis":true}]');
  });
  it('buildComprehensiveIncome', () => {
    expect(JSON.stringify(buildComprehensiveIncome(F))).toBe('[{"label":"当期純利益","amount":800,"emphasis":true},{"label":"その他の包括利益","amount":0},{"label":"（データ無しのため 0 と仮定）","amount":null,"indent":1},{"label":"包括利益","amount":800,"emphasis":true}]');
  });
  it('buildEquityChangeStatement (dividendRate 0.25)', () => {
    expect(JSON.stringify(buildEquityChangeStatement(F, 0.25))).toBe('[{"label":"当期首 純資産残高","amount":3400,"emphasis":true},{"label":"当期純利益","amount":800,"indent":1},{"label":"剰余金の配当","amount":-200,"indent":1},{"label":"当期末 純資産残高","amount":4000,"emphasis":true}]');
  });
  it('buildNotesStatement', () => {
    expect(JSON.stringify(buildNotesStatement(F))).toBe('[{"label":"1. 重要な会計方針に係る事項","amount":null,"emphasis":true},{"label":"固定資産の減価償却の方法","amount":null,"display":"定額法（概算）","indent":1},{"label":"棚卸資産の評価基準・方法","amount":null,"display":"原価法","indent":1},{"label":"消費税等の会計処理","amount":null,"display":"税抜方式","indent":1},{"label":"2. 貸借対照表に関する注記","amount":null,"emphasis":true},{"label":"有利子負債の額","amount":4000,"indent":1},{"label":"減価償却累計額（概算）","amount":900,"indent":1},{"label":"3. 損益計算書に関する注記","amount":null,"emphasis":true},{"label":"販管費に含まれる人件費","amount":3000,"indent":1},{"label":"4. 注記","amount":null,"emphasis":true},{"label":"本注記は概算値・テンプレートであり、財務助言ではありません。","amount":null,"indent":1}]');
  });
  it('buildSupplementarySchedule', () => {
    expect(JSON.stringify(buildSupplementarySchedule(F))).toBe('[{"label":"① 有形固定資産及び減価償却累計額の明細","amount":null,"emphasis":true},{"label":"有形固定資産（期末残高）","amount":5000,"indent":1},{"label":"当期減価償却費","amount":300,"indent":1},{"label":"減価償却累計額（概算）","amount":900,"indent":1},{"label":"② 借入金等明細","amount":null,"emphasis":true},{"label":"短期借入金","amount":750,"indent":1},{"label":"長期借入金","amount":3250,"indent":1},{"label":"有利子負債 合計","amount":4000,"indent":1},{"label":"③ 引当金の明細","amount":null,"emphasis":true},{"label":"引当金（データ無しのため 0 と仮定）","amount":0,"indent":1}]');
  });
  it('buildAccountBreakdown', () => {
    expect(JSON.stringify(buildAccountBreakdown(F))).toBe('[{"label":"現預金及び預貯金の内訳","amount":null,"emphasis":true},{"label":"現預金（概算）","amount":2000,"indent":1},{"label":"売掛金（売上債権）の内訳","amount":null,"emphasis":true},{"label":"売掛金 期末残高","amount":2000,"indent":1},{"label":"棚卸資産の内訳","amount":null,"emphasis":true},{"label":"商品・製品・原材料 等","amount":1000,"indent":1},{"label":"買掛金（仕入債務）の内訳","amount":null,"emphasis":true},{"label":"買掛金 期末残高","amount":1500,"indent":1},{"label":"借入金の内訳","amount":null,"emphasis":true},{"label":"短期借入金","amount":750,"indent":1},{"label":"長期借入金","amount":3250,"indent":1}]');
  });
  it('buildQuarterlyStatement (4ヶ月→2四半期)', () => {
    const q = buildQuarterlyStatement([{ revenue: 100, profit: 10 }, { revenue: 100, profit: 10 }, { revenue: 100, profit: 10 }, { revenue: 200, profit: 20 }]);
    expect(JSON.stringify(q)).toBe('[{"label":"第1四半期 (3ヶ月)","amount":null,"emphasis":true},{"label":"売上高","amount":300,"indent":1},{"label":"利益","amount":30,"indent":1},{"label":"利益率","amount":null,"display":"10.0%","indent":1},{"label":"第2四半期 (1ヶ月)","amount":null,"emphasis":true},{"label":"売上高","amount":200,"indent":1},{"label":"利益","amount":20,"indent":1},{"label":"利益率","amount":null,"display":"10.0%","indent":1},{"label":"通期 売上高","amount":500,"emphasis":true},{"label":"通期 利益","amount":50,"emphasis":true},{"label":"通期 利益率","amount":null,"display":"10.0%","emphasis":true}]');
  });
});

describe('golden: PL structure + sumFinancialInputs all-fields', () => {
  it('buildIncomeStatement の全行 (emphasis フラグ含む)', () => {
    expect(JSON.stringify(buildIncomeStatement(F))).toBe('[{"label":"売上高","amount":12000,"emphasis":true},{"label":"売上原価","amount":6000},{"label":"売上総利益","amount":6000,"emphasis":true},{"label":"販売費及び一般管理費","amount":4800},{"label":"（うち 人件費）","amount":3000,"indent":1},{"label":"（うち 減価償却費）","amount":300,"indent":1},{"label":"（うち その他）","amount":1500,"indent":1},{"label":"営業利益","amount":1200,"emphasis":true},{"label":"営業外費用（支払利息）","amount":100},{"label":"経常利益","amount":1100,"emphasis":true},{"label":"法人税等","amount":300},{"label":"当期純利益","amount":800,"emphasis":true}]');
  });
  it('sumFinancialInputs が全18フィールドを正しく合算する', () => {
    const a = deriveBusinessFinancials({ revenue: 1_000_000, variableCost: 400_000, fixedCost: 300_000, profit: 200_000, profitMargin: 20 });
    const b = deriveBusinessFinancials({ revenue: 500_000, variableCost: 250_000, fixedCost: 150_000, profit: 50_000, profitMargin: 10 });
    expect(JSON.stringify(sumFinancialInputs([a, b]))).toBe('{"revenue":18000000,"cogs":7800000,"operatingProfit":3000000,"ordinaryProfit":2927040,"netProfit":2048928,"depreciation":540000,"laborCost":2700000,"interestExpense":72960,"totalAssets":14400000,"equity":6720000,"currentAssets":7920000,"currentLiabilities":4320000,"fixedAssets":6480000,"fixedLiabilities":3360000,"accountsReceivable":2250000,"inventory":650000,"accountsPayable":780000,"interestBearingDebt":3648000}');
  });
});

describe('financialStatements — mutation edge cases', () => {
  it('変動損益: 売上0なら限界利益率は — / BEP は null (revenue===0 ガード)', () => {
    const v = buildVariableCostingStatement({ ...F, revenue: 0 });
    expect(v.find((l) => l.label === '限界利益率')?.display).toBe('—');
    expect(amt(v, '損益分岐点売上高')).toBe(null);
  });

  it('変動損益: 限界利益=0 (売上=変動費) でも BEP は null (> 0 と >= 0 を区別)', () => {
    const v = buildVariableCostingStatement({ ...F, cogs: 12_000 }); // contribution = 12000 − 12000 = 0
    expect(amt(v, '限界利益')).toBe(0);
    expect(amt(v, '損益分岐点売上高')).toBe(null);
  });

  it('株主資本変動: 配当0は +0 で −0 ではない (dividend===0 分岐)', () => {
    const s = buildEquityChangeStatement(F); // 既定 dividendRate=0 → dividend=0
    const div = s.find((l) => l.label === '剰余金の配当')!.amount;
    // toBe は Object.is 判定なので、mutant の −0 はここで弾かれる。
    expect(div).toBe(0);
  });

  it('四半期: 13ヶ月以上でも直近12ヶ月のみ集計する (slice(-12))', () => {
    // 先頭に大きな月を1つ足して 13ヶ月に。slice を外す mutant は通期売上が変わる。
    const history = [
      { revenue: 9_999, profit: 9_999 },
      ...Array.from({ length: 12 }, () => ({ revenue: 100, profit: 10 })),
    ];
    const q = buildQuarterlyStatement(history);
    expect(amt(q, '通期 売上高')).toBe(1_200); // 直近12ヶ月のみ (先頭 9999 は除外)
    expect(amt(q, '通期 利益')).toBe(120);
  });

  it('四半期: 売上0の四半期は利益率が — (rev===0 / margin==null)', () => {
    const q = buildQuarterlyStatement([
      { revenue: 0, profit: 0 }, { revenue: 0, profit: 0 }, { revenue: 0, profit: 0 },
    ]);
    expect(q.filter((l) => l.label === '利益率').every((l) => l.display === '—')).toBe(true);
  });

  it('四半期: 通期売上0なら通期利益率も — (totRev===0 / totMargin==null)', () => {
    const q = buildQuarterlyStatement([{ revenue: 0, profit: 0 }, { revenue: 0, profit: 0 }]);
    expect(q.find((l) => l.label === '通期 利益率')?.display).toBe('—');
  });

  it('BS: assets/liabilitiesEquity を返す (空ボディ mutant を殺す)', () => {
    const bs = buildBalanceSheet(F);
    expect(bs.assets).toHaveLength(6);
    expect(bs.liabilitiesEquity).toHaveLength(10);
  });
});
