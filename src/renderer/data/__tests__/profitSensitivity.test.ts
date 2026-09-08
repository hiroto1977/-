import { describe, expect, it } from 'vitest';
import { profitSensitivity, breakEvenDeltaPct, requiredRevenueForTarget, operatingLeverage } from '../profitSensitivity';
import type { KpiFundamentals } from '../kpiActuals';

// revenue 1000, variable (cogs+adv) 500 → rate 0.5, fixed (sga+dep) 250 → OP 250
const base: KpiFundamentals = { revenue: 1000, cogs: 400, advertising: 100, sga: 200, depreciation: 50 };

describe('profitSensitivity', () => {
  it('returns one row per delta, with the baseline at 0%', () => {
    const rows = profitSensitivity(base);
    expect(rows.map((r) => r.deltaPct)).toEqual([-10, -5, 0, 5, 10]);
    const baseRow = rows.find((r) => r.deltaPct === 0)!;
    expect(baseRow.revenue).toBe(1000);
    expect(baseRow.operatingProfit).toBe(250); // 1000 - 500 - 250
  });

  it('flexes operating profit by the contribution on the revenue swing', () => {
    const rows = profitSensitivity(base);
    // +10%: revenue 1100, variable 550, fixed 250 → OP 300 (contribution rate 0.5 × 100 extra)
    expect(rows.find((r) => r.deltaPct === 10)!.operatingProfit).toBe(300);
    // -10%: revenue 900, variable 450 → OP 200
    expect(rows.find((r) => r.deltaPct === -10)!.operatingProfit).toBe(200);
  });

  it('honours a custom delta set', () => {
    const rows = profitSensitivity(base, [0, 20]);
    expect(rows.map((r) => r.deltaPct)).toEqual([0, 20]);
    expect(rows[1]!.operatingProfit).toBe(350); // rev 1200, var 600, fixed 250
  });

  /**
   * **★ 売上 0 の期に「営業利益率 0.0%」を刷らない (2026-09-08)。**
   *
   * この検査は 2026-09-08 まで `operatingMarginPct === 0` を主張していた。
   * コメントに理由まで書いてあった —— 「NaN/Inf にしない mutant を kill」。
   * **変異体を殺すために書いた等式が、欠陥を仕様として固定していた** ——
   * 同じ行が「営業利益 −100 ／ 営業利益率 0.0%」を並べる形である。
   *
   * `toBeNull()` は**同じ変異体を同じように殺す** (`revenue > 0` の関門を
   * 外すと −Infinity になり、`null` ではないので落ちる)。
   * **「NaN にしない」を主張するのに、間違った値を固定する必要はなかった。**
   */
  it('★ 売上 0 の期は営業利益率を算定不能 (null) として返す', () => {
    const rows = profitSensitivity({ revenue: 0, cogs: 0, advertising: 0, sga: 100, depreciation: 0 });
    expect(rows.every((r) => r.revenue === 0)).toBe(true);
    expect(rows.every((r) => r.operatingProfit === -100)).toBe(true); // 0 - 0 - 100
    // 直す前は 0 だった。**営業利益が赤字なのに利益率 0% は同時に真であり得ない。**
    expect(rows.every((r) => r.operatingMarginPct === null)).toBe(true);
    // 関門を外した変異体 (−Infinity) も、この主張で落ちる。
    expect(rows.every((r) => r.operatingMarginPct !== 0)).toBe(true);
  });

  it('computes the operating margin per scenario', () => {
    const rows = profitSensitivity(base);
    expect(rows.find((r) => r.deltaPct === 0)!.operatingMarginPct).toBe(25); // 250/1000
  });
});

describe('breakEvenDeltaPct', () => {
  it('is negative when the business is profitable (room before hitting BEP)', () => {
    // BEP revenue = fixed / contributionRate = 250 / 0.5 = 500 → (500-1000)/1000 = -50%
    expect(breakEvenDeltaPct(base)).toBe(-50);
  });

  it('is positive when the business is loss-making (revenue must grow to break even)', () => {
    // revenue 400, variable 200 (rate 0.5), fixed 250 → BEP rev 500 → +25%
    const loss: KpiFundamentals = { revenue: 400, cogs: 150, advertising: 50, sga: 200, depreciation: 50 };
    expect(breakEvenDeltaPct(loss)).toBe(25);
  });

  it('returns null when revenue is zero or contribution is non-positive', () => {
    expect(breakEvenDeltaPct({ revenue: 0, cogs: 0, advertising: 0, sga: 100, depreciation: 0 })).toBeNull();
    // variable cost >= revenue → contribution rate <= 0
    expect(breakEvenDeltaPct({ revenue: 100, cogs: 100, advertising: 20, sga: 10, depreciation: 0 })).toBeNull();
    // contributionRate === 0 ちょうど (変動費=売上)。<= を < にする mutant はゼロ除算へ進む。
    expect(breakEvenDeltaPct({ revenue: 100, cogs: 100, advertising: 0, sga: 10, depreciation: 0 })).toBeNull();
  });
});

describe('requiredRevenueForTarget', () => {
  // base: revenue 1000, variable rate 0.5, fixed 250 → contributionRate 0.5
  it('computes the revenue needed to reach a target operating profit', () => {
    // required = (fixed + target) / contributionRate = (250 + 500) / 0.5 = 1500
    const r = requiredRevenueForTarget(base, 500);
    expect(r.targetOperatingProfit).toBe(500);
    expect(r.requiredRevenue).toBe(1500);
    expect(r.upliftPct).toBe(50); // (1500-1000)/1000
  });

  it('returns the current operating profit target as roughly the current revenue', () => {
    // target = current OP 250 → required = (250+250)/0.5 = 1000 → uplift 0%
    const r = requiredRevenueForTarget(base, 250);
    expect(r.requiredRevenue).toBe(1000);
    expect(r.upliftPct).toBe(0);
  });

  it('yields a negative uplift for a target below the current profit', () => {
    const r = requiredRevenueForTarget(base, 0); // break-even: (250+0)/0.5 = 500 → -50%
    expect(r.requiredRevenue).toBe(500);
    expect(r.upliftPct).toBe(-50);
  });

  it('returns null uplift when revenue is zero or contribution is non-positive', () => {
    expect(requiredRevenueForTarget({ revenue: 0, cogs: 0, advertising: 0, sga: 100, depreciation: 0 }, 100).upliftPct).toBeNull();
    expect(requiredRevenueForTarget({ revenue: 100, cogs: 100, advertising: 20, sga: 10, depreciation: 0 }, 100).upliftPct).toBeNull();
    // contributionRate === 0 ちょうど。<= を < にする mutant はゼロ除算へ進む。
    expect(requiredRevenueForTarget({ revenue: 100, cogs: 100, advertising: 0, sga: 10, depreciation: 0 }, 100).upliftPct).toBeNull();
  });

  /**
   * **★ 必要売上も同じ return の中で `null` に揃える (2026-09-08)。**
   *
   * `upliftPct` は最初から `null` だったのに `requiredRevenue` だけが `0` に
   * 倒れていた —— **「目標利益 100 を得るのに必要な売上は 0」**は、
   * 算定不能に対して最も安心させる嘘である
   * (パス 67 の `switchWindowOk` / パス 69 の `accumulationRisk` と同じ位置関係)。
   *
   * **画面には出ていなかった** —— `OverviewPage` は `upliftPct === null` で
   * 節ごと差し替えていたので、この 0 は表に現れない (パス 52 の
   * 「規則が関門にしか無い」形)。契約の側を揃えるのがここの目的で、
   * 併せて画面の関門も**刷る値そのもの**を見るようにした。
   */
  it('★ 算定不能なら必要売上も null (同じ return の 2 欄が揃っている)', () => {
    const zero = requiredRevenueForTarget({ revenue: 0, cogs: 0, advertising: 0, sga: 100, depreciation: 0 }, 100);
    // 直す前は 0 だった
    expect(zero.requiredRevenue).toBeNull();
    expect(zero.upliftPct).toBeNull();
    // 打ち込んだ目標は控えとして残る (オブジェクト全体を null にしない理由)。
    expect(zero.targetOperatingProfit).toBe(100);

    const noContribution = requiredRevenueForTarget({ revenue: 100, cogs: 100, advertising: 20, sga: 10, depreciation: 0 }, 100);
    expect(noContribution.requiredRevenue).toBeNull();
    expect(noContribution.upliftPct).toBeNull();
    expect(noContribution.targetOperatingProfit).toBe(100);
  });

  it('★ 対照: 算定できるときは 2 欄とも数で出る (床が邪魔をしない)', () => {
    const r = requiredRevenueForTarget(base, 500);
    expect(r.requiredRevenue).toBe(1500);
    expect(r.upliftPct).toBe(50);
  });
});

describe('operatingLeverage (DOL)', () => {
  it('computes contribution / operating profit', () => {
    // base: contribution 500, OP 250 → DOL 2.0
    expect(operatingLeverage(base)).toBe(2);
  });

  it('is higher when fixed costs dominate (more leverage)', () => {
    // contribution 500, fixed 450 → OP 50 → DOL 10
    const highFixed: KpiFundamentals = { revenue: 1000, cogs: 400, advertising: 100, sga: 450, depreciation: 0 };
    expect(operatingLeverage(highFixed)).toBe(10);
  });

  it('returns null when operating profit is zero or negative', () => {
    // contribution 500, fixed 500 → OP 0
    expect(operatingLeverage({ revenue: 1000, cogs: 400, advertising: 100, sga: 500, depreciation: 0 })).toBeNull();
    // loss
    expect(operatingLeverage({ revenue: 400, cogs: 150, advertising: 50, sga: 200, depreciation: 50 })).toBeNull();
  });

  it('rounds to two decimals', () => {
    // contribution 700, OP 300 → 2.333... → 2.33
    const f: KpiFundamentals = { revenue: 1000, cogs: 250, advertising: 50, sga: 400, depreciation: 0 };
    expect(operatingLeverage(f)).toBe(2.33);
  });
});
