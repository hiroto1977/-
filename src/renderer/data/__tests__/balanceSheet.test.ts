import { describe, expect, it, vi } from 'vitest';
import {
  parseBalanceSheet,
  computeBalanceSheetMetrics,
  computeBalanceSheetInsights,
  BALANCE_SHEET_COLLECTION,
  type BalanceSheet,
  normalizeBalanceSheet,
  balanceSheetOrNull,
  balanceSheetAsOfKey,
  compareBalanceSheetRecords,
  currentBalanceSheet,
  balanceSheetChoiceNote,
} from '../balanceSheet';

const VALID = { currentAssets: 100, currentLiabilities: 100, fixedAssets: 0, fixedLiabilities: 0, netIncome: 0 };

describe('parseBalanceSheet — validation messages & boundaries', () => {
  it('exposes the balance-sheet collection key', () => {
    expect(BALANCE_SHEET_COLLECTION).toBe('balance-sheet');
  });

  it('defaults asOf to "" when not a string', () => {
    expect(parseBalanceSheet({ ...VALID, asOf: 123 }).asOf).toBe('');
  });

  it('★ 基準日は暦に在る YYYY-MM-DD / YYYY-MM だけ (空は許す) —— パス 115 までは何も見なかった', () => {
    expect(parseBalanceSheet({ ...VALID, asOf: '' }).asOf).toBe('');
    expect(parseBalanceSheet({ ...VALID, asOf: '2026-03' }).asOf).toBe('2026-03');
    expect(parseBalanceSheet({ ...VALID, asOf: '2026-03-31' }).asOf).toBe('2026-03-31');
    for (const bad of ['2026/3/31', '2026-02-30', '2026-13', '20260331', 'x2026-03-31']) {
      expect(() => parseBalanceSheet({ ...VALID, asOf: bad }), bad).toThrow('基準日は暦に在る日付');
    }
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

  it('treats a blank net income as zero but leaves blank optional items undefined', () => {
    // 当期純利益は**必須**の欄なので空欄 = 0 のまま (損失も 0 も意味が定まる)。
    // 内数の任意欄は「入れていない」を保つ —— 0 に倒すと CCC 0 日が出る (下の対照)。
    const bs = parseBalanceSheet({ ...REQUIRED, netIncome: '' });
    expect(bs.netIncome).toBe(0);
    expect(bs.inventory).toBeUndefined();
    expect(bs.accountsReceivable).toBeUndefined();
    expect(bs.accountsPayable).toBeUndefined();
    expect(bs.cash).toBeUndefined();
  });

  it('★ 対照: 0 と入力すれば 0 が残る (未入力と実測の 0 を取り違えない)', () => {
    const bs = parseBalanceSheet({ ...REQUIRED, inventory: 0, accountsReceivable: '0', accountsPayable: 0, cash: 0 });
    expect(bs.inventory).toBe(0);
    expect(bs.accountsReceivable).toBe(0);
    expect(bs.accountsPayable).toBe(0);
    expect(bs.cash).toBe(0);
  });

  it('空白だけの入力も未入力として扱う (Number("  ")===0 に任せない)', () => {
    const bs = parseBalanceSheet({ ...REQUIRED, inventory: '  ', accountsReceivable: '\t', cash: '' });
    expect(bs.inventory).toBeUndefined();
    expect(bs.accountsReceivable).toBeUndefined();
    expect(bs.cash).toBeUndefined();
  });

  it('内数の上限照合は未入力を飛ばす (空欄で「流動資産を超える」と言わない)', () => {
    // 流動資産 0 の控えでも、内数が未入力なら通る。実測の 0 も通る。1 は落ちる。
    expect(() => parseBalanceSheet({ ...REQUIRED, currentAssets: 0, currentLiabilities: 0 })).not.toThrow();
    expect(() => parseBalanceSheet({ ...REQUIRED, currentAssets: 0, currentLiabilities: 0, inventory: 0, accountsPayable: 0 })).not.toThrow();
    expect(() => parseBalanceSheet({ ...REQUIRED, currentAssets: 0, inventory: 1 })).toThrow('棚卸資産は流動資産以下で入力してください');
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

  it('leaves interest-bearing debt undefined when omitted or blank (0 = 無借金と実測した控えと分ける)', () => {
    expect(parseBalanceSheet(BASE).interestBearingDebt).toBeUndefined();
    expect(parseBalanceSheet({ ...BASE, interestBearingDebt: '' }).interestBearingDebt).toBeUndefined();
    // ★ 対照: 0 と入力すれば 0 が残る。
    expect(parseBalanceSheet({ ...BASE, interestBearingDebt: 0 }).interestBearingDebt).toBe(0);
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

// --- 保存された 1 件を読む境界 -------------------------------------------
//
// 復元の形の検査は `inventory` / `accountsReceivable` / `accountsPayable` も
// **任意**にしている (前方互換)。以前は型が必須と言っていたので、欄の無い控えが
// 復元を通ると足し算が NaN になり、行き先は経営サマリーのタイルと**金融機関等へ
// 出す書面** —— NaN の純資産が印刷された。
//
// 2026-09-07 に型を復元の形へ合わせ、**未入力は `undefined` のまま残す**ように
// した (0 に倒すと「入れていない」と「0 と実測した」が混ざる)。NaN は各指標が
// `undefined` を算定不能として扱うことで防ぐ —— 合計に混ぜない、が下の検査。
describe('normalizeBalanceSheet / balanceSheetOrNull', () => {
  const core = { asOf: '2026-03-31', currentAssets: 5_000_000, fixedAssets: 3_000_000,
    currentLiabilities: 2_000_000, fixedLiabilities: 1_000_000, netIncome: 500_000 };

  it('内数の欄が無い控えは「無い」まま残り、合計は有限のまま (NaN にしない)', () => {
    const bs = normalizeBalanceSheet(core);
    expect(bs.inventory).toBeUndefined();
    expect(bs.accountsReceivable).toBeUndefined();
    expect(bs.accountsPayable).toBeUndefined();
    const m = computeBalanceSheetMetrics(bs);
    for (const [k, v] of Object.entries(m)) {
      if (typeof v === 'number') expect(Number.isFinite(v), k).toBe(true);
    }
    expect(m.netAssets).toBe(5_000_000);
  });

  it('対照: 揃った控えは 1 つも書き換えない', () => {
    const full = { ...core, cash: 1_000_000, inventory: 400_000, accountsReceivable: 900_000,
      accountsPayable: 700_000, interestBearingDebt: 2_500_000 };
    expect(normalizeBalanceSheet(full)).toEqual(full);
  });

  it('任意の欄 (現預金・有利子負債) は無いまま残す (0 を作らない)', () => {
    const bs = normalizeBalanceSheet(core);
    expect(bs.cash).toBeUndefined();
    expect(bs.interestBearingDebt).toBeUndefined();
  });

  it('必須の欄は数でない値・非有限値を 0 に倒し、任意の欄は「無い」に倒す', () => {
    const bs = normalizeBalanceSheet({ ...core, inventory: '400000', currentAssets: Number.NaN,
      netIncome: Number.POSITIVE_INFINITY, cash: 'たくさん', asOf: 42 });
    // 内数は任意なので、文字列で入っていた控えは「無い」として読む (0 を作らない)。
    expect(bs.inventory).toBeUndefined();
    expect(bs.currentAssets).toBe(0);
    expect(bs.netIncome).toBe(0);
    expect(bs.cash).toBeUndefined();
    expect(bs.asOf).toBe('');
  });

  it('任意の欄が NaN / ±∞ の控えも「無い」として扱う (数であるだけでは通さない)', () => {
    // 変異検査が拾った穴: `typeof v === 'number' && Number.isFinite(v)` の `&&` を
    // `||` にしても、上の「文字列の金額」だけでは差が出ない —— NaN は typeof が
    // number なので、`||` だと NaN がそのまま残ってランウェイの計算に流れる。
    for (const bad of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
      const bs = normalizeBalanceSheet({ ...core, cash: bad, interestBearingDebt: bad });
      expect(bs.cash).toBeUndefined();
      expect(bs.interestBearingDebt).toBeUndefined();
    }
  });

  it('未入力 (null / undefined) は null のまま —— ゼロの貸借対照表を作らない', () => {
    expect(balanceSheetOrNull(null)).toBeNull();
    expect(balanceSheetOrNull(undefined)).toBeNull();
    expect(balanceSheetOrNull(core)?.currentAssets).toBe(5_000_000);
  });

  it('物でない引数も落ちずに空の形になる', () => {
    for (const raw of [42, 'x', [] as unknown]) {
      const bs = normalizeBalanceSheet(raw);
      expect(bs.currentAssets).toBe(0);
      expect(Number.isFinite(computeBalanceSheetMetrics(bs).netAssets)).toBe(true);
    }
  });
});

/**
 * **未入力の棚卸資産は、当座比率と流動性段階を緩めない。** (2026-09-07)
 *
 * 当座比率 = (流動資産 − 棚卸資産) ÷ 流動負債 は、流動比率より**厳しい**指標である。
 * 棚卸資産を 0 に倒すと分子が流動資産そのものになり、当座比率が流動比率と同じ値を
 * 名乗る —— 厳しいはずの指標が緩い側の数字になる。流動性段階も同じ形で最良の
 * `strong` に寄る。どちらも空欄で保存した控えでは**必ず**そうなっていた。
 */
describe('未入力の棚卸資産 — 当座比率と流動性段階', () => {
  const CORE = { asOf: '', currentAssets: 200, fixedAssets: 0, currentLiabilities: 100,
    fixedLiabilities: 0, netIncome: 0 } as const;

  it('棚卸資産が未入力なら当座比率は null (流動比率は出る)', () => {
    const m = computeBalanceSheetMetrics(CORE);
    expect(m.currentRatioPct).toBe(200);
    expect(m.quickRatioPct).toBeNull();
  });

  it('★ 対照: 棚卸資産 0 と実測した控えでは当座比率 = 流動比率 200% になる', () => {
    // 0 に倒す実装だと上の検査もこの値を返す —— 見分けが付かないことがまさに欠陥だった。
    const m = computeBalanceSheetMetrics({ ...CORE, inventory: 0 });
    expect(m.quickRatioPct).toBe(200);
  });

  it('棚卸資産が未入力なら strong は主張せず sound に留める', () => {
    expect(computeBalanceSheetInsights(CORE).liquidityStage).toBe('sound');
    // ★ 対照: 0 と実測すれば当座資産 = 流動資産なので strong。
    expect(computeBalanceSheetInsights({ ...CORE, inventory: 0 }).liquidityStage).toBe('strong');
  });

  it('都合の悪い判定 (tight) は棚卸資産が未入力でも落とさない', () => {
    // 流動比率 99% は棚卸資産に依らず判る。判るものは黙らせない。
    const i = computeBalanceSheetInsights({ ...CORE, currentAssets: 99 });
    expect(i.liquidityStage).toBe('tight');
  });
});

/**
 * **定数表そのものを変異検査の射程に入れる (読み直して測る)。** (2026-09-07)
 *
 * module 直下の `const` は**読み込みのときに 1 度だけ**評価されるので、Stryker が
 * 実行時に切り替える仕組みは届かない —— 覆われていても「生存」と報告される
 * (`stryker.config.json` の `_commentIgnoreStatic`)。殺し方は**テスト側で読み直す**
 * こと: `vi.resetModules()` + 動的 `import()` なら変異体が有効な状態で評価される。
 *
 * ここで留めるのは、画面と**金融機関等へ出す書面**が刷る文字そのものである。
 */
describe('読み直して測る — collection 名と比率ヘルパー', () => {
  it('collection 名は読み直しても "balance-sheet"', async () => {
    vi.resetModules();
    const m = await import('../balanceSheet');
    expect(m.BALANCE_SHEET_COLLECTION).toBe('balance-sheet');
  });

  it('読み直しても比率が数で出る (module 直下の pct が空にすり替わっていない)', async () => {
    vi.resetModules();
    const m = await import('../balanceSheet');
    const metrics = m.computeBalanceSheetMetrics({
      asOf: '2026-03-31', currentAssets: 6000, inventory: 2000, accountsReceivable: 1500,
      fixedAssets: 4000, currentLiabilities: 3000, accountsPayable: 1000,
      fixedLiabilities: 2000, netIncome: 1000,
    });
    expect(metrics.equityRatioPct).toBe(50);
    expect(metrics.currentRatioPct).toBe(200);
    expect(metrics.quickRatioPct).toBe(133.3);
    expect(metrics.roaPct).toBe(10);
    // 分母 0 は null (三項の両側を読み直しでも通す)。
    expect(m.computeBalanceSheetMetrics({
      asOf: '', currentAssets: 0, inventory: 0, accountsReceivable: 0, fixedAssets: 0,
      currentLiabilities: 0, accountsPayable: 0, fixedLiabilities: 0, netIncome: 0,
    }).currentRatioPct).toBeNull();
  });
});

describe('どの貸借対照表を「現在」と呼ぶか (パス 127)', () => {
  const rec = (id: string, createdAt: number, asOf: unknown) => ({ id, createdAt, data: { asOf } });

  it('balanceSheetAsOfKey は前後の空白を落とし、文字列でなければ空 (基準日なし)', () => {
    expect(balanceSheetAsOfKey(' 2026-03-31 ')).toBe('2026-03-31');
    expect(balanceSheetAsOfKey('')).toBe('');
    expect(balanceSheetAsOfKey(undefined)).toBe('');
    expect(balanceSheetAsOfKey(20260331)).toBe('');
  });

  it('★ currentBalanceSheet は基準日の新しい控えを選ぶ —— 後から入力した古い基準日ではない', () => {
    const newerAsOfEnteredFirst = rec('a', 100, '2026-03-31');
    const olderAsOfEnteredLater = rec('b', 200, '2025-03-31');
    expect(currentBalanceSheet([newerAsOfEnteredFirst, olderAsOfEnteredLater])?.id).toBe('a');
    expect(currentBalanceSheet([olderAsOfEnteredLater, newerAsOfEnteredFirst])?.id).toBe('a');
  });

  it('同じ基準日なら後に入力した方・基準日なしは最下位・月だけの基準日も並ぶ・空なら null', () => {
    expect(currentBalanceSheet([rec('a', 100, '2026-03-31'), rec('b', 200, '2026-03-31')])?.id).toBe('b');
    expect(currentBalanceSheet([rec('a', 100, ''), rec('b', 50, '2020-01-31'), rec('c', 300, '')])?.id).toBe('b');
    expect(currentBalanceSheet([rec('a', 100, ''), rec('b', 300, '')])?.id).toBe('b');
    expect(currentBalanceSheet([rec('a', 100, '2026-03'), rec('b', 50, '2026-02-28')])?.id).toBe('a');
    expect(currentBalanceSheet([])).toBeNull();
  });

  it('compareBalanceSheetRecords は「現在」を先頭にする順 (sort にそのまま渡せる)', () => {
    const rows = [rec('old', 400, '2024-03-31'), rec('none', 500, ''), rec('new', 100, '2026-03-31'), rec('mid', 200, '2025-03-31')];
    expect([...rows].sort(compareBalanceSheetRecords).map((r) => r.id)).toEqual(['new', 'mid', 'old', 'none']);
  });

  it('★ balanceSheetChoiceNote は、最後に入力した控えと違う控えを使うときだけ、両方の基準日を名指しして言う', () => {
    const a = rec('a', 100, '2026-03-31');
    const b = rec('b', 200, '2025-03-31');
    expect(balanceSheetChoiceNote([a, b], a)).toBe(
      '最後に入力した貸借対照表（基準日 2025-03-31）より新しい基準日の控え（基準日 2026-03-31）があるので、そちらを「現在」として経営サマリー・書面・計算書類に使っています。古い方を消すか、基準日を直してください。',
    );
    expect(balanceSheetChoiceNote([a, rec('c', 300, '')], a)).toContain('（基準日なし）より新しい基準日の控え（基準日 2026-03-31）');
    // 対照: 最後に入力した控えを使っている・控えが無い
    expect(balanceSheetChoiceNote([b, a], currentBalanceSheet([b, a]))).not.toBeNull();
    expect(balanceSheetChoiceNote([rec('x', 100, '2025-03-31'), rec('y', 200, '2026-03-31')], rec('y', 200, '2026-03-31'))).toBeNull();
    expect(balanceSheetChoiceNote([], null)).toBeNull();
  });
});
