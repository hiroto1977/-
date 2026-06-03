import { describe, expect, it } from 'vitest';
import { computeFinancialRatios, radarAxes, type FinancialInputs } from '../financialRatios';

const SAMPLE: FinancialInputs = {
  revenue: 12_000,
  cogs: 6_000,
  operatingProfit: 1_200,
  ordinaryProfit: 1_100,
  netProfit: 800,
  depreciation: 300,
  laborCost: 3_000,
  totalAssets: 10_000,
  equity: 4_000,
  currentAssets: 5_000,
  currentLiabilities: 2_500,
  fixedAssets: 5_000,
  fixedLiabilities: 3_000,
  accountsReceivable: 2_000,
  inventory: 1_000,
  accountsPayable: 1_500,
  interestBearingDebt: 4_000,
};

describe('computeFinancialRatios — worked example', () => {
  const r = computeFinancialRatios(SAMPLE);
  it('balance-sheet ratios', () => {
    expect(r.equityRatioPct).toBe(40); // 4000/10000
    expect(r.currentRatioPct).toBe(200); // 5000/2500
    expect(r.fixedLongTermFitPct).toBe(71.4); // 5000/7000
  });
  it('debt metrics', () => {
    expect(r.debtToMonthlySalesRatio).toBe(4); // 4000/(12000/12)
    expect(r.debtRepaymentYears).toBe(2.67); // 4000/(1200+300)
  });
  it('profitability margins', () => {
    expect(r.operatingMarginPct).toBe(10);
    expect(r.ordinaryMarginPct).toBe(9.2);
    expect(r.netProfit).toBe(800);
    expect(r.netMarginPct).toBe(6.7);
    expect(r.ebitda).toBe(1_500);
    expect(r.ebitdaMarginPct).toBe(12.5);
  });
  it('labor share over value-added', () => {
    expect(r.laborSharePct).toBe(66.7); // 3000/(1200+3000+300)
  });
  it('turnover + CCC', () => {
    expect(r.receivablesTurnover).toBe(6);
    expect(r.inventoryTurnover).toBe(6);
    expect(r.cccDays).toBe(30.4); // 60.83 + 60.83 - 91.25
  });
  it('returns on assets / equity', () => {
    expect(r.roaPct).toBe(8);
    expect(r.roePct).toBe(20);
  });
});

describe('computeFinancialRatios — null guards (zero denominators)', () => {
  const zero: FinancialInputs = {
    revenue: 0, cogs: 0, operatingProfit: 0, ordinaryProfit: 0, netProfit: 0,
    depreciation: 0, laborCost: 0, totalAssets: 0, equity: 0, currentAssets: 0,
    currentLiabilities: 0, fixedAssets: 0, fixedLiabilities: 0,
    accountsReceivable: 0, inventory: 0, accountsPayable: 0, interestBearingDebt: 0,
  };
  const r = computeFinancialRatios(zero);
  it('does not divide by zero', () => {
    expect(r.equityRatioPct).toBeNull();
    expect(r.currentRatioPct).toBeNull();
    expect(r.debtToMonthlySalesRatio).toBeNull();
    expect(r.debtRepaymentYears).toBeNull();
    expect(r.receivablesTurnover).toBeNull();
    expect(r.inventoryTurnover).toBeNull();
    expect(r.cccDays).toBeNull();
    expect(r.roaPct).toBeNull();
    expect(r.roePct).toBeNull();
    expect(r.laborSharePct).toBeNull();
  });

  // CCC のガード `revenue === 0 || cogs === 0` を片側ずつ突いて mutation を殺す。
  // 両方 0 の SAMPLE では || / && / 各 === の差が出ないため、片側のみ 0 の入力が要る。
  it('cccDays は revenue=0 (cogs>0) でも null', () => {
    expect(computeFinancialRatios({ ...SAMPLE, revenue: 0 }).cccDays).toBeNull();
  });

  it('cccDays は cogs=0 (revenue>0) でも null', () => {
    expect(computeFinancialRatios({ ...SAMPLE, cogs: 0 }).cccDays).toBeNull();
  });
});

describe('computeFinancialRatios — operatingCashflow override', () => {
  it('uses provided operating CF for debt repayment years', () => {
    const r = computeFinancialRatios({ ...SAMPLE, operatingCashflow: 2_000 });
    expect(r.debtRepaymentYears).toBe(2); // 4000/2000
  });
});

describe('radarAxes', () => {
  const axes = radarAxes(computeFinancialRatios(SAMPLE));
  it('produces 15 axes with 0-100 scores', () => {
    expect(axes).toHaveLength(15);
    for (const a of axes) {
      expect(a.score).toBeGreaterThanOrEqual(0);
      expect(a.score).toBeLessThanOrEqual(100);
      expect(typeof a.label).toBe('string');
    }
  });
  it('scores a healthy equity ratio (40%) at the top of its band', () => {
    const eq = axes.find((a) => a.key === 'equityRatio')!;
    expect(eq.raw).toBe(40);
    expect(eq.score).toBe(80); // linScore(40, bad=0, good=50) = 80
  });
  it('golden: scores every axis against its health benchmark', () => {
    const byKey = Object.fromEntries(axes.map((a) => [a.key, a.score]));
    expect(byKey).toEqual({
      equityRatio: 80, currentRatio: 100, fixedLongTermFit: 100, debtToMonthlySales: 40,
      debtRepaymentYears: 100, operatingMargin: 60, ordinaryMargin: 57, netMargin: 59,
      laborShare: 33, ebitdaMargin: 50, receivablesTurnover: 10, inventoryTurnover: 10,
      ccc: 66, roa: 80, roe: 100,
    });
  });
  it('treats null raw as score 0', () => {
    const zeroAxes = radarAxes(
      computeFinancialRatios({ ...SAMPLE, totalAssets: 0, equity: 0 }),
    );
    expect(zeroAxes.find((a) => a.key === 'roe')!.score).toBe(0);
  });

  it('null raw は反転軸 (bad>good) でも score 0 — linScore の null ガード', () => {
    // roe は bad=0 のため null→ガード除去でも (0-0)/15=0 で区別できない。
    // debtToMonthlySales は bad=6>good=1 で、null ガードを外す mutant は
    // (0-6)/(1-6)=1.2 → クランプ後 100 になる。score===0 でこれを殺す。
    const axes0 = radarAxes(computeFinancialRatios({ ...SAMPLE, revenue: 0 }));
    expect(axes0.find((a) => a.key === 'debtToMonthlySales')!.raw).toBeNull();
    expect(axes0.find((a) => a.key === 'debtToMonthlySales')!.score).toBe(0);
  });

  it('golden: exact 15-axis structure (key/label/unit/raw/score)', () => {
    expect(JSON.stringify(axes)).toBe('[{"key":"equityRatio","label":"自己資本比率","unit":"%","raw":40,"score":80},{"key":"currentRatio","label":"流動比率","unit":"%","raw":200,"score":100},{"key":"fixedLongTermFit","label":"固定長期適合率","unit":"%","raw":71.4,"score":100},{"key":"debtToMonthlySales","label":"借入金月商倍率","unit":"ヶ月","raw":4,"score":40},{"key":"debtRepaymentYears","label":"債務償還年数","unit":"年","raw":2.67,"score":100},{"key":"operatingMargin","label":"営業利益率","unit":"%","raw":10,"score":60},{"key":"ordinaryMargin","label":"経常利益率","unit":"%","raw":9.2,"score":57},{"key":"netMargin","label":"当期純利益率","unit":"%","raw":6.7,"score":59},{"key":"laborShare","label":"労働分配率","unit":"%","raw":66.7,"score":33},{"key":"ebitdaMargin","label":"EBITDAマージン","unit":"%","raw":12.5,"score":50},{"key":"receivablesTurnover","label":"売上債権回転率","unit":"倍","raw":6,"score":10},{"key":"inventoryTurnover","label":"棚卸資産回転率","unit":"倍","raw":6,"score":10},{"key":"ccc","label":"CCC","unit":"日","raw":30.4,"score":66},{"key":"roa","label":"ROA","unit":"%","raw":8,"score":80},{"key":"roe","label":"ROE","unit":"%","raw":20,"score":100}]');
  });
});

describe('computeFinancialRatios — CCC partial-null guards', () => {
  it('returns null CCC when any component is undefined (revenue=0 or cogs=0)', () => {
    expect(computeFinancialRatios({ ...SAMPLE, cogs: 0 }).cccDays).toBeNull(); // 棚卸/仕入回転日数が算定不能
    expect(computeFinancialRatios({ ...SAMPLE, revenue: 0 }).cccDays).toBeNull(); // 売上債権回転日数が算定不能
  });
  it('computes CCC when receivables are 0 (arDays=0, still defined)', () => {
    expect(computeFinancialRatios({ ...SAMPLE, accountsReceivable: 0 }).cccDays).toBe(-30.4); // 0 + 60.83 − 91.25
  });
});
