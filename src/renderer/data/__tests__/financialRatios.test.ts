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

// === round 68: 精緻化指標 (加算的) ==========================================

describe('computeFinancialRatios — round 68 精緻化指標 (worked example)', () => {
  const r = computeFinancialRatios(SAMPLE);

  it('NOPAT / ROIC (既定実効税率 30%)', () => {
    expect(r.nopat).toBe(840); // 1200 × (1 − 0.30)
    expect(r.roicPct).toBe(10.5); // 840 / (4000 + 4000) × 100
  });

  it('当座比率 / 現金比率', () => {
    expect(r.quickRatioPct).toBe(160); // (5000 − 1000) / 2500 × 100
    expect(r.cashRatioPct).toBe(80); // cash = max(0, 5000−2000−1000)=2000 → 2000/2500
  });

  it('フリーキャッシュフロー (営業CF − 設備投資)', () => {
    expect(r.freeCashflow).toBe(1200); // simpleCf=1200+300=1500, capex≈減価償却=300 → 1500−300
  });

  it('デュポン 3 分解 (積が ROE に一致)', () => {
    expect(r.dupontNetMarginPct).toBe(6.7); // 800/12000
    expect(r.dupontAssetTurnover).toBe(1.2); // 12000/10000
    expect(r.dupontEquityMultiplier).toBe(2.5); // 10000/4000
    // 丸め前: (800/12000) × (12000/10000) × (10000/4000) = 0.20 = ROE 20%
    const exact = (SAMPLE.netProfit / SAMPLE.revenue) * (SAMPLE.revenue / SAMPLE.totalAssets) * (SAMPLE.totalAssets / SAMPLE.equity);
    expect(Math.round(exact * 1000) / 1000).toBe(0.2);
  });

  it('インタレストカバレッジは支払利息が無ければ null', () => {
    expect(r.interestCoverage).toBeNull(); // SAMPLE に interestExpense なし
  });

  it('インタレストカバレッジ = 営業利益 / 支払利息', () => {
    const withInterest = computeFinancialRatios({ ...SAMPLE, interestExpense: 200 });
    expect(withInterest.interestCoverage).toBe(6); // 1200 / 200
  });

  it('明示 capex / 実効税率を尊重する', () => {
    const r2 = computeFinancialRatios({
      ...SAMPLE,
      operatingCashflow: 2000,
      capitalExpenditure: 500,
      effectiveTaxRate: 0.4,
    });
    expect(r2.freeCashflow).toBe(1500); // 2000 − 500
    expect(r2.nopat).toBe(720); // 1200 × (1 − 0.40)
    expect(r2.roicPct).toBe(9); // 720 / 8000 × 100
  });
});

describe('computeFinancialRatios — round 68 境界ガード (分母 0 / 負 / null)', () => {
  const zero: FinancialInputs = {
    revenue: 0, cogs: 0, operatingProfit: 0, ordinaryProfit: 0, netProfit: 0,
    depreciation: 0, laborCost: 0, totalAssets: 0, equity: 0, currentAssets: 0,
    currentLiabilities: 0, fixedAssets: 0, fixedLiabilities: 0,
    accountsReceivable: 0, inventory: 0, accountsPayable: 0, interestBearingDebt: 0,
  };
  const r = computeFinancialRatios(zero);

  it('全 0 入力で比率系は null、金額系は 0', () => {
    expect(r.roicPct).toBeNull(); // 投下資本 0
    expect(r.quickRatioPct).toBeNull(); // 流動負債 0
    expect(r.cashRatioPct).toBeNull(); // 流動負債 0
    expect(r.interestCoverage).toBeNull(); // 支払利息 未指定
    expect(r.dupontNetMarginPct).toBeNull(); // 売上 0
    expect(r.dupontAssetTurnover).toBeNull(); // 総資産 0
    expect(r.dupontEquityMultiplier).toBeNull(); // 自己資本 0
    expect(r.nopat).toBe(0);
    expect(r.freeCashflow).toBe(0);
  });

  it('ROIC: 投下資本が負 (有利子負債 + 自己資本 < 0) なら null', () => {
    // equity を大きな負にして investedCapital を負へ。<=0 ガードを片側で撃墜。
    const neg = computeFinancialRatios({ ...SAMPLE, equity: -5000, interestBearingDebt: 4000 });
    expect(neg.roicPct).toBeNull(); // 4000 + (−5000) = −1000 ≤ 0
  });

  it('ROIC: 投下資本がちょうど 0 でも null (境界)', () => {
    const z = computeFinancialRatios({ ...SAMPLE, equity: -4000, interestBearingDebt: 4000 });
    expect(z.roicPct).toBeNull(); // 4000 + (−4000) = 0
  });

  it('ROIC: 投下資本が正なら算定する (境界の反対側)', () => {
    const pos = computeFinancialRatios({ ...SAMPLE, equity: -3999, interestBearingDebt: 4000 });
    expect(pos.roicPct).not.toBeNull(); // 4000 + (−3999) = 1 > 0
  });

  it('実効税率は 0-1 にクランプ (1 超 → 1, 負 → 0)', () => {
    expect(computeFinancialRatios({ ...SAMPLE, effectiveTaxRate: 2 }).nopat).toBe(0); // 1200 × (1 − 1)
    expect(computeFinancialRatios({ ...SAMPLE, effectiveTaxRate: -1 }).nopat).toBe(1200); // 1200 × (1 − 0)
  });

  it('インタレストカバレッジ: 支払利息 0 は null (ゼロ割回避)', () => {
    expect(computeFinancialRatios({ ...SAMPLE, interestExpense: 0 }).interestCoverage).toBeNull();
  });

  it('現金比率: 現預金は負へクランプしない (流動資産 < 債権+棚卸 → 0)', () => {
    const r2 = computeFinancialRatios({ ...SAMPLE, currentAssets: 1000 }); // 1000 − 2000 − 1000 < 0
    expect(r2.cashRatioPct).toBe(0); // cash=max(0, ...)=0 → 0/2500
  });

  it('当座比率: 棚卸が流動資産を超えても算定 (負値もありうる)', () => {
    const r2 = computeFinancialRatios({ ...SAMPLE, inventory: 6000 }); // (5000 − 6000)/2500
    expect(r2.quickRatioPct).toBe(-40);
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
