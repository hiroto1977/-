import { describe, expect, it } from 'vitest';
import {
  parseBalanceSheet,
  computeBalanceSheetMetrics,
  computeBalanceSheetInsights,
  BALANCE_SHEET_COLLECTION,
  type BalanceSheet,
} from '../balanceSheet';

const VALID = { currentAssets: 100, currentLiabilities: 100, fixedAssets: 0, fixedLiabilities: 0, netIncome: 0 };

describe('parseBalanceSheet — validation messages & boundaries', () => {
  it('exposes the balance-sheet collection key', () => {
    expect(BALANCE_SHEET_COLLECTION).toBe('balance-sheet');
  });

  it('defaults asOf to "" when not a string', () => {
    expect(parseBalanceSheet({ ...VALID, asOf: 123 }).asOf).toBe('');
  });

  it('rejects each negative figure with the exact field label', () => {
    const cases: Array<[Record<string, unknown>, string]> = [
      [{ currentAssets: -1 }, '流動資産は 0 以上の数値で入力してください'],
      [{ cash: -1 }, '現預金は 0 以上の数値で入力してください'],
      [{ inventory: -1 }, '棚卸資産は 0 以上の数値で入力してください'],
      [{ accountsReceivable: -1 }, '売上債権は 0 以上の数値で入力してください'],
      [{ currentLiabilities: -1 }, '流動負債は 0 以上の数値で入力してください'],
      [{ accountsPayable: -1 }, '仕入債務は 0 以上の数値で入力してください'],
      [{ fixedAssets: -1 }, '固定資産は 0 以上の数値で入力してください'],
      [{ fixedLiabilities: -1 }, '固定負債は 0 以上の数値で入力してください'],
    ];
    for (const [patch, msg] of cases) {
      expect(() => parseBalanceSheet({ ...VALID, ...patch })).toThrow(msg);
    }
  });

  it('rejects a non-numeric required figure (NaN) and a non-numeric net income', () => {
    expect(() => parseBalanceSheet({ ...VALID, currentAssets: 'abc' })).toThrow('流動資産は 0 以上の数値で入力してください');
    expect(() => parseBalanceSheet({ ...VALID, netIncome: 'abc' })).toThrow('当期純利益は数値で入力してください');
  });

  it('treats an omitted net income (undefined) as 0', () => {
    const { netIncome: _omit, ...noNet } = VALID;
    expect(parseBalanceSheet(noNet).netIncome).toBe(0);
  });

  it('allows a component equal to its cap but rejects exceeding it (strict >)', () => {
    // 上限ちょうどは許容 (> は厳密)。超過は専用メッセージで reject。
    expect(() => parseBalanceSheet({ ...VALID, currentAssets: 100, cash: 100 })).not.toThrow();
    expect(() => parseBalanceSheet({ ...VALID, currentAssets: 100, inventory: 100 })).not.toThrow();
    expect(() => parseBalanceSheet({ ...VALID, currentAssets: 100, accountsReceivable: 100 })).not.toThrow();
    expect(() => parseBalanceSheet({ ...VALID, currentLiabilities: 100, accountsPayable: 100 })).not.toThrow();
    expect(() => parseBalanceSheet({ ...VALID, currentAssets: 100, cash: 101 })).toThrow('現預金は流動資産以下で入力してください');
    expect(() => parseBalanceSheet({ ...VALID, currentAssets: 100, inventory: 101 })).toThrow('棚卸資産は流動資産以下で入力してください');
    expect(() => parseBalanceSheet({ ...VALID, currentAssets: 100, accountsReceivable: 101 })).toThrow('売上債権は流動資産以下で入力してください');
    expect(() => parseBalanceSheet({ ...VALID, currentLiabilities: 100, accountsPayable: 101 })).toThrow('仕入債務は流動負債以下で入力してください');
  });
});

describe('parseBalanceSheet', () => {
  it('coerces string inputs and allows a negative net income (loss)', () => {
    const bs = parseBalanceSheet({
      asOf: ' 2026-03-31 ',
      currentAssets: '5000',
      inventory: '1000',
      fixedAssets: '5000',
      currentLiabilities: '2000',
      fixedLiabilities: '3000',
      netIncome: '-500',
    });
    expect(bs.asOf).toBe('2026-03-31');
    expect(bs.currentAssets).toBe(5000);
    expect(bs.netIncome).toBe(-500);
  });

  const REQUIRED = { currentAssets: 100, fixedAssets: 0, currentLiabilities: 0, fixedLiabilities: 0, netIncome: 0 };

  it('rejects negative asset/liability figures', () => {
    expect(() => parseBalanceSheet({ ...REQUIRED, currentAssets: -1 })).toThrow(/流動資産/);
  });

  it('rejects inventory larger than current assets', () => {
    expect(() => parseBalanceSheet({ ...REQUIRED, currentAssets: 100, inventory: 200 })).toThrow(/棚卸資産/);
  });

  it('rejects accounts payable larger than current liabilities', () => {
    expect(() => parseBalanceSheet({ ...REQUIRED, currentLiabilities: 100, accountsPayable: 200 })).toThrow(/仕入債務/);
  });

  it('treats a blank net income and blank optional items as zero', () => {
    const bs = parseBalanceSheet({ ...REQUIRED, netIncome: '' });
    expect(bs.netIncome).toBe(0);
    expect(bs.inventory).toBe(0);
    expect(bs.accountsReceivable).toBe(0);
    expect(bs.accountsPayable).toBe(0);
  });
});

describe('computeBalanceSheetMetrics', () => {
  const bs = {
    asOf: '2026-03-31',
    currentAssets: 6000,
    inventory: 2000,
    accountsReceivable: 1500,
    fixedAssets: 4000,
    currentLiabilities: 3000,
    accountsPayable: 1000,
    fixedLiabilities: 2000,
    netIncome: 1000,
  };

  it('derives totals, equity and the standard ratios', () => {
    const m = computeBalanceSheetMetrics(bs);
    expect(m.totalAssets).toBe(10000);
    expect(m.totalLiabilities).toBe(5000);
    expect(m.netAssets).toBe(5000);
    expect(m.equityRatioPct).toBe(50); // 5000/10000
    expect(m.currentRatioPct).toBe(200); // 6000/3000
    expect(m.quickRatioPct).toBeCloseTo(133.3); // (6000-2000)/3000
    expect(m.roaPct).toBe(10); // 1000/10000
    expect(m.roePct).toBe(20); // 1000/5000
    expect(m.fixedRatioPct).toBe(80); // 4000/5000
    expect(m.insolvent).toBe(false);
  });

  it('flags insolvency and nulls ROE / fixed ratio when net assets are negative', () => {
    const m = computeBalanceSheetMetrics({
      ...bs,
      currentLiabilities: 8000,
      fixedLiabilities: 5000, // liabilities 13000 > assets 10000 → netAssets -3000
    });
    expect(m.netAssets).toBe(-3000);
    expect(m.insolvent).toBe(true);
    expect(m.equityRatioPct).toBe(-30);
    expect(m.roePct).toBeNull();
    expect(m.fixedRatioPct).toBeNull();
  });

  it('nulls ratios whose denominator is zero', () => {
    const m = computeBalanceSheetMetrics({
      asOf: '', currentAssets: 0, inventory: 0, accountsReceivable: 0, fixedAssets: 0,
      currentLiabilities: 0, accountsPayable: 0, fixedLiabilities: 0, netIncome: 0,
    });
    expect(m.equityRatioPct).toBeNull(); // total assets 0
    expect(m.currentRatioPct).toBeNull(); // current liabilities 0
    expect(m.roaPct).toBeNull();
  });

  it('treats exactly zero net assets as not insolvent and nulls ROE / fixed ratio (> strict)', () => {
    // totalAssets===totalLiabilities → netAssets 0。> 0 を >=0 / 常に true にする mutant
    // (roePct/fixedRatioPct が非nullになる) と < 0 を <= 0 にする mutant (insolvent) を kill。
    const m = computeBalanceSheetMetrics({
      asOf: '', currentAssets: 100, inventory: 0, accountsReceivable: 0, fixedAssets: 0,
      currentLiabilities: 100, accountsPayable: 0, fixedLiabilities: 0, netIncome: 50,
    });
    expect(m.netAssets).toBe(0);
    expect(m.insolvent).toBe(false);
    expect(m.roePct).toBeNull();
    expect(m.fixedRatioPct).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// round 74: 精緻化指標 (computeBalanceSheetInsights) — 加算的
// ---------------------------------------------------------------------------

/** 完全な BS を作るヘルパ (任意項目はデフォルト)。 */
function mkBS(over: Partial<BalanceSheet>): BalanceSheet {
  return {
    asOf: '',
    currentAssets: 0,
    cash: 0,
    inventory: 0,
    accountsReceivable: 0,
    fixedAssets: 0,
    currentLiabilities: 0,
    accountsPayable: 0,
    fixedLiabilities: 0,
    interestBearingDebt: 0,
    netIncome: 0,
    ...over,
  };
}

describe('parseBalanceSheet — interest-bearing debt (round 74)', () => {
  const BASE = { currentAssets: 100, fixedAssets: 0, currentLiabilities: 60, fixedLiabilities: 40, netIncome: 0 };

  it('defaults interest-bearing debt to 0 when omitted or blank', () => {
    expect(parseBalanceSheet(BASE).interestBearingDebt).toBe(0);
    expect(parseBalanceSheet({ ...BASE, interestBearingDebt: '' }).interestBearingDebt).toBe(0);
  });

  it('rejects a negative interest-bearing debt with the exact label', () => {
    expect(() => parseBalanceSheet({ ...BASE, interestBearingDebt: -1 })).toThrow(
      '有利子負債は 0 以上の数値で入力してください',
    );
  });

  it('allows debt equal to total liabilities but rejects exceeding it (strict >)', () => {
    // 負債合計 = 60 + 40 = 100。ちょうどは許容、超過は専用メッセージ。
    expect(() => parseBalanceSheet({ ...BASE, interestBearingDebt: 100 })).not.toThrow();
    expect(() => parseBalanceSheet({ ...BASE, interestBearingDebt: 101 })).toThrow(
      '有利子負債は負債合計以下で入力してください',
    );
  });

  it('coerces a string interest-bearing debt', () => {
    expect(parseBalanceSheet({ ...BASE, interestBearingDebt: '50' }).interestBearingDebt).toBe(50);
  });
});

describe('computeBalanceSheetInsights — working capital', () => {
  it('computes working capital and its ratio (positive)', () => {
    const i = computeBalanceSheetInsights(mkBS({ currentAssets: 1000, currentLiabilities: 400 }));
    expect(i.workingCapital).toBe(600); // 1000 - 400
    expect(i.workingCapitalRatioPct).toBe(60); // 600 / 1000
  });

  it('computes negative working capital and its (negative) ratio', () => {
    const i = computeBalanceSheetInsights(mkBS({ currentAssets: 400, currentLiabilities: 1000 }));
    expect(i.workingCapital).toBe(-600); // 400 - 1000
    expect(i.workingCapitalRatioPct).toBe(-150); // -600 / 400
  });

  it('nulls the working-capital ratio when current assets are 0', () => {
    const i = computeBalanceSheetInsights(mkBS({ currentAssets: 0, currentLiabilities: 100 }));
    expect(i.workingCapital).toBe(-100);
    expect(i.workingCapitalRatioPct).toBeNull();
  });
});

describe('computeBalanceSheetInsights — equity health grade boundaries', () => {
  // 自己資本比率 = netAssets / totalAssets。totalAssets を 100 に固定し netAssets で操作。
  const grade = (netAssets: number, totalAssets = 100): string =>
    computeBalanceSheetInsights(
      mkBS({ currentAssets: totalAssets, currentLiabilities: totalAssets - netAssets }),
    ).equityHealth;

  it('grades excellent at exactly 50% and above', () => {
    expect(grade(50)).toBe('excellent'); // boundary 50 → >=50
    expect(grade(80)).toBe('excellent');
  });
  it('grades good in [30,50)', () => {
    expect(grade(49)).toBe('good');
    expect(grade(30)).toBe('good'); // boundary 30
  });
  it('grades adequate in [10,30)', () => {
    expect(grade(29)).toBe('adequate');
    expect(grade(10)).toBe('adequate'); // boundary 10
  });
  it('grades thin in (0,10)', () => {
    expect(grade(9)).toBe('thin');
    expect(grade(1)).toBe('thin');
  });
  it('grades insolvent at exactly 0% and below', () => {
    expect(grade(0)).toBe('insolvent'); // boundary 0 → <=0
    expect(grade(-10)).toBe('insolvent');
  });
  it('grades insolvent when equity ratio is unknown (total assets 0)', () => {
    const i = computeBalanceSheetInsights(mkBS({ currentAssets: 0, fixedAssets: 0 }));
    expect(i.equityHealth).toBe('insolvent');
  });
});

describe('computeBalanceSheetInsights — fixed long-term fit', () => {
  it('computes the ratio against net assets + fixed liabilities', () => {
    // fixedAssets 800 / (netAssets 600 + fixedLiabilities 200) = 800/800 = 100%
    const i = computeBalanceSheetInsights(
      mkBS({ currentAssets: 800, fixedAssets: 800, currentLiabilities: 800, fixedLiabilities: 200 }),
    );
    // totalAssets 1600, totalLiabilities 1000 → netAssets 600; long-term capital 800
    expect(i.fixedLongTermFitPct).toBe(100);
  });

  it('nulls the fit ratio when long-term capital is 0 or negative', () => {
    // netAssets negative and fixedLiabilities 0 → denom <= 0 → null
    const i = computeBalanceSheetInsights(
      mkBS({ currentAssets: 100, fixedAssets: 100, currentLiabilities: 300, fixedLiabilities: 0 }),
    );
    // netAssets = 200 - 300 = -100; long-term capital = -100 → null
    expect(i.fixedLongTermFitPct).toBeNull();
  });
});

describe('computeBalanceSheetInsights — debt structure', () => {
  it('computes interest-bearing debt ratio and D/E ratio', () => {
    const i = computeBalanceSheetInsights(
      mkBS({
        currentAssets: 600,
        fixedAssets: 400, // totalAssets 1000
        currentLiabilities: 200,
        fixedLiabilities: 200, // totalLiabilities 400 → netAssets 600
        interestBearingDebt: 300,
      }),
    );
    expect(i.interestBearingDebtRatioPct).toBe(30); // 300/1000
    expect(i.debtToEquityPct).toBe(66.7); // 400/600 → 66.66.. → 66.7
  });

  it('nulls interest-bearing debt ratio when total assets are 0', () => {
    const i = computeBalanceSheetInsights(mkBS({ interestBearingDebt: 0 }));
    expect(i.interestBearingDebtRatioPct).toBeNull();
  });

  it('nulls D/E ratio when net assets are 0 or negative', () => {
    const zero = computeBalanceSheetInsights(mkBS({ currentAssets: 100, currentLiabilities: 100 }));
    expect(zero.debtToEquityPct).toBeNull(); // netAssets 0
    const neg = computeBalanceSheetInsights(mkBS({ currentAssets: 100, currentLiabilities: 300 }));
    expect(neg.debtToEquityPct).toBeNull(); // netAssets -200
  });

  it('treats missing interest-bearing debt (undefined) as 0', () => {
    const bs: BalanceSheet = {
      asOf: '', currentAssets: 100, inventory: 0, accountsReceivable: 0, fixedAssets: 0,
      currentLiabilities: 50, accountsPayable: 0, fixedLiabilities: 0, netIncome: 0,
    };
    const i = computeBalanceSheetInsights(bs);
    expect(i.interestBearingDebtRatioPct).toBe(0); // 0/100
    expect(i.netDebt).toBe(0); // 0 - 0
  });
});

describe('computeBalanceSheetInsights — net debt / net cash', () => {
  it('computes positive net debt (more debt than cash)', () => {
    const i = computeBalanceSheetInsights(
      mkBS({ currentAssets: 500, cash: 100, currentLiabilities: 0, fixedLiabilities: 400, interestBearingDebt: 400 }),
    );
    expect(i.netDebt).toBe(300); // 400 - 100
    expect(i.netCashPositive).toBe(false);
  });

  it('treats exactly zero net debt as net-cash positive (<= boundary)', () => {
    const i = computeBalanceSheetInsights(
      mkBS({ currentAssets: 500, cash: 400, currentLiabilities: 0, fixedLiabilities: 400, interestBearingDebt: 400 }),
    );
    expect(i.netDebt).toBe(0); // 400 - 400
    expect(i.netCashPositive).toBe(true);
  });

  it('computes negative net debt (net cash) and flags it positive', () => {
    const i = computeBalanceSheetInsights(
      mkBS({ currentAssets: 500, cash: 400, currentLiabilities: 0, fixedLiabilities: 100, interestBearingDebt: 100 }),
    );
    expect(i.netDebt).toBe(-300); // 100 - 400
    expect(i.netCashPositive).toBe(true);
  });
});

describe('computeBalanceSheetInsights — liquidity stage', () => {
  it('is strong when quick ratio reaches 100% (boundary)', () => {
    // currentAssets 200, inventory 100, currentLiabilities 100 → quick = (200-100)/100 = 100%
    const i = computeBalanceSheetInsights(
      mkBS({ currentAssets: 200, inventory: 100, currentLiabilities: 100 }),
    );
    expect(i.liquidityStage).toBe('strong');
  });

  it('is sound when current ratio >= 100% but quick ratio < 100%', () => {
    // currentAssets 200, inventory 150, currentLiabilities 100 → current 200%, quick 50%
    const i = computeBalanceSheetInsights(
      mkBS({ currentAssets: 200, inventory: 150, currentLiabilities: 100 }),
    );
    expect(i.liquidityStage).toBe('sound');
  });

  it('is sound at current ratio exactly 100% (boundary) with low quick', () => {
    // currentAssets 100, inventory 100, currentLiabilities 100 → current 100%, quick 0%
    const i = computeBalanceSheetInsights(
      mkBS({ currentAssets: 100, inventory: 100, currentLiabilities: 100 }),
    );
    expect(i.liquidityStage).toBe('sound');
  });

  it('is tight when current ratio < 100%', () => {
    // currentAssets 99, currentLiabilities 100 → current 99%
    const i = computeBalanceSheetInsights(mkBS({ currentAssets: 99, currentLiabilities: 100 }));
    expect(i.liquidityStage).toBe('tight');
  });

  it('is unknown when current liabilities are 0', () => {
    const i = computeBalanceSheetInsights(mkBS({ currentAssets: 100, currentLiabilities: 0 }));
    expect(i.liquidityStage).toBe('unknown');
  });

  it('does not treat null quick ratio as strong (quick null guard)', () => {
    // currentLiabilities 0 makes both null → unknown, but to isolate the quick-null guard
    // we use a case where current ratio exists but quick is null is impossible (same denom).
    // Instead verify that strong requires a real quick value: large current, large inventory.
    const i = computeBalanceSheetInsights(
      mkBS({ currentAssets: 1000, inventory: 1000, currentLiabilities: 100 }),
    );
    // current 1000%, quick (1000-1000)/100 = 0% → not strong, sound.
    expect(i.liquidityStage).toBe('sound');
  });
});

describe('computeBalanceSheetInsights — net asset quality', () => {
  it('is sound when net assets are positive', () => {
    const i = computeBalanceSheetInsights(mkBS({ currentAssets: 100, currentLiabilities: 40 }));
    expect(i.netAssetQuality).toBe('sound');
  });
  it('is breakeven when net assets are exactly 0', () => {
    const i = computeBalanceSheetInsights(mkBS({ currentAssets: 100, currentLiabilities: 100 }));
    expect(i.netAssetQuality).toBe('breakeven');
  });
  it('is insolvent when net assets are negative', () => {
    const i = computeBalanceSheetInsights(mkBS({ currentAssets: 100, currentLiabilities: 300 }));
    expect(i.netAssetQuality).toBe('insolvent');
  });
});

describe('computeBalanceSheetInsights — substantive insolvency risk', () => {
  it('does NOT flag risk when net debt exactly equals positive net assets (strict >)', () => {
    const i = computeBalanceSheetInsights(
      mkBS({
        currentAssets: 200, cash: 0, currentLiabilities: 100, fixedLiabilities: 0,
        interestBearingDebt: 100, fixedAssets: 0,
      }),
    );
    // totalAssets 200, totalLiabilities 100 → netAssets 100; netDebt 100 - 0 = 100 → NOT > 100
    expect(i.netDebt).toBe(100);
    expect(i.substantiveInsolvencyRisk).toBe(false);
  });

  it('flags risk when net debt strictly exceeds positive net assets', () => {
    const risky = computeBalanceSheetInsights(
      mkBS({
        currentAssets: 100, cash: 0, fixedAssets: 110, currentLiabilities: 0, fixedLiabilities: 150,
        interestBearingDebt: 150,
      }),
    );
    // totalAssets 210, totalLiabilities 150 → netAssets 60; netDebt 150; 150 > 60 → risk
    expect(risky.substantiveInsolvencyRisk).toBe(true);
  });

  it('does not flag risk when net assets are exactly 0 even if net debt is positive (strict > 0)', () => {
    const i = computeBalanceSheetInsights(
      mkBS({
        currentAssets: 100, cash: 0, currentLiabilities: 100, fixedLiabilities: 0,
        interestBearingDebt: 50,
      }),
    );
    // netAssets 0; netDebt 50 - 0 = 50 > 0 but netAssets not > 0 → no risk
    expect(i.netAssetQuality).toBe('breakeven');
    expect(i.netDebt).toBe(50);
    expect(i.substantiveInsolvencyRisk).toBe(false);
  });

  it('does not flag risk when net assets are negative (insolvent handled separately)', () => {
    const i = computeBalanceSheetInsights(
      mkBS({ currentAssets: 100, currentLiabilities: 300, interestBearingDebt: 200, fixedLiabilities: 0 }),
    );
    // netAssets -200 → not > 0 → risk false
    expect(i.netAssetQuality).toBe('insolvent');
    expect(i.substantiveInsolvencyRisk).toBe(false);
  });

  it('does not flag risk in a net-cash company', () => {
    const i = computeBalanceSheetInsights(
      mkBS({ currentAssets: 1000, cash: 500, currentLiabilities: 100, interestBearingDebt: 100, fixedLiabilities: 0 }),
    );
    // netDebt 100 - 500 = -400 → not > netAssets → no risk
    expect(i.netDebt).toBe(-400);
    expect(i.substantiveInsolvencyRisk).toBe(false);
  });
});
