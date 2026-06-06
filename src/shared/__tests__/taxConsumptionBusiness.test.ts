import { describe, expect, it } from 'vitest';
import {
  calcStandardTax,
  calcSimplifiedTax,
  calcTwentyPercentTax,
  weightedDeemedRate,
  isTaxExempt,
  canUseSimplified,
  compareBusinessTaxMethods,
  EXEMPTION_THRESHOLD,
  SIMPLIFIED_ELIGIBILITY_THRESHOLD,
  type BusinessSegment,
} from '../taxConsumptionBusiness';

describe('constants', () => {
  it('exposes the statutory thresholds', () => {
    expect(EXEMPTION_THRESHOLD).toBe(10_000_000);
    expect(SIMPLIFIED_ELIGIBILITY_THRESHOLD).toBe(50_000_000);
  });
});

describe('calcStandardTax (本則課税・軽減税率混在)', () => {
  it('computes sales tax minus purchase tax across both rates', () => {
    // 売上: 標準1,000万×10% + 軽減500万×8% = 100万 + 40万 = 140万
    // 仕入: 標準800万×10% + 軽減300万×8% = 80万 + 24万 = 104万
    // 納付 = 140万 − 104万 = 36万
    const r = calcStandardTax(
      { standard: 10_000_000, reduced: 5_000_000 },
      { standard: 8_000_000, reduced: 3_000_000 },
    );
    expect(r).toBe(360_000);
  });

  it('returns a negative amount (refund) when purchases exceed sales', () => {
    const r = calcStandardTax({ standard: 1_000_000, reduced: 0 }, { standard: 2_000_000, reduced: 0 });
    expect(r).toBe(-100_000);
  });

  it('ignores the reduced rate when it is zero (8% factor must be exercised)', () => {
    // standard only: 100万×10% = 10万。reduced 分が誤って加算されると壊れる。
    const r = calcStandardTax({ standard: 1_000_000, reduced: 1_000_000 }, { standard: 0, reduced: 0 });
    // 100,000 (standard 10%) + 80,000 (reduced 8%) = 180,000
    expect(r).toBe(180_000);
  });

  it('guards negative / non-finite inputs to 0', () => {
    expect(calcStandardTax({ standard: -100, reduced: -100 }, { standard: 0, reduced: 0 })).toBe(0);
    expect(calcStandardTax({ standard: Infinity, reduced: 0 }, { standard: 0, reduced: 0 })).toBe(0);
    expect(calcStandardTax({ standard: NaN, reduced: 0 }, { standard: 0, reduced: 0 })).toBe(0);
  });
});

describe('weightedDeemedRate (加重平均みなし仕入率)', () => {
  it('returns the single segment rate when only one business', () => {
    expect(weightedDeemedRate([{ type: 'wholesale', sales: { standard: 1_000_000, reduced: 0 } }])).toBe(0.9);
  });

  it('weights by sales tax across two businesses', () => {
    // 卸売(90%) 売上税額 10万 + サービス(50%) 売上税額 10万
    // 加重率 = (10万×0.9 + 10万×0.5) / 20万 = (9万+5万)/20万 = 0.7
    const segs: BusinessSegment[] = [
      { type: 'wholesale', sales: { standard: 1_000_000, reduced: 0 } },
      { type: 'service', sales: { standard: 1_000_000, reduced: 0 } },
    ];
    expect(weightedDeemedRate(segs)).toBeCloseTo(0.7, 10);
  });

  it('weights by tax amount, not raw sales (different rates shift the weight)', () => {
    // 卸売(90%) は軽減税率 標準1,000万→売上税額100万
    // 小売(80%) は標準1,000万→売上税額100万 → 等加重 → 0.85
    const segs: BusinessSegment[] = [
      { type: 'wholesale', sales: { standard: 1_000_000, reduced: 0 } },
      { type: 'retail', sales: { standard: 1_000_000, reduced: 0 } },
    ];
    expect(weightedDeemedRate(segs)).toBeCloseTo(0.85, 10);
  });

  it('returns 0 when total sales tax is zero (分母0ガード)', () => {
    expect(weightedDeemedRate([])).toBe(0);
    expect(weightedDeemedRate([{ type: 'wholesale', sales: { standard: 0, reduced: 0 } }])).toBe(0);
    expect(weightedDeemedRate([{ type: 'wholesale', sales: { standard: -100, reduced: 0 } }])).toBe(0);
  });
});

describe('calcSimplifiedTax (簡易課税・複数事業)', () => {
  it('applies the deemed rate for a single wholesale business', () => {
    // 売上1,000万×10% = 100万売上税額、第1種卸売90% → 納付 100万×10% = 10万
    expect(calcSimplifiedTax([{ type: 'wholesale', sales: { standard: 10_000_000, reduced: 0 } }])).toBe(100_000);
  });

  it('applies the deemed rate for real-estate (第6種 40%)', () => {
    // 100万売上税額 × (1−0.4) = 60万
    expect(calcSimplifiedTax([{ type: 'real-estate', sales: { standard: 10_000_000, reduced: 0 } }])).toBe(600_000);
  });

  it('uses the weighted rate across two businesses', () => {
    // 卸売 売上税額10万 + サービス 売上税額10万、加重率0.7
    // 納付 = 20万 × (1−0.7) = 6万
    const segs: BusinessSegment[] = [
      { type: 'wholesale', sales: { standard: 1_000_000, reduced: 0 } },
      { type: 'service', sales: { standard: 1_000_000, reduced: 0 } },
    ];
    expect(calcSimplifiedTax(segs)).toBe(60_000);
  });

  it('returns 0 for empty / zero sales', () => {
    expect(calcSimplifiedTax([])).toBe(0);
    expect(calcSimplifiedTax([{ type: 'service', sales: { standard: 0, reduced: 0 } }])).toBe(0);
  });
});

describe('calcTwentyPercentTax (2割特例)', () => {
  it('charges 20% of the sales tax', () => {
    // 1,000万×10% = 100万売上税額 → 20% = 20万
    expect(calcTwentyPercentTax({ standard: 10_000_000, reduced: 0 })).toBe(200_000);
  });

  it('handles mixed standard / reduced sales', () => {
    // 標準1,000万×10% + 軽減1,000万×8% = 100万 + 80万 = 180万 → 20% = 36万
    expect(calcTwentyPercentTax({ standard: 10_000_000, reduced: 10_000_000 })).toBe(360_000);
  });

  it('returns 0 for non-positive sales', () => {
    expect(calcTwentyPercentTax({ standard: 0, reduced: 0 })).toBe(0);
    expect(calcTwentyPercentTax({ standard: -50, reduced: -50 })).toBe(0);
  });
});

describe('isTaxExempt (免税判定)', () => {
  it('is exempt at or below 10M (境界)', () => {
    expect(isTaxExempt(10_000_000)).toBe(true);
    expect(isTaxExempt(9_999_999)).toBe(true);
    expect(isTaxExempt(0)).toBe(true);
  });

  it('is NOT exempt above 10M (境界 + 1)', () => {
    expect(isTaxExempt(10_000_001)).toBe(false);
  });

  it('treats negative / non-finite as 0 (exempt)', () => {
    expect(isTaxExempt(-1)).toBe(true);
    expect(isTaxExempt(NaN)).toBe(true);
    expect(isTaxExempt(Infinity)).toBe(true);
  });
});

describe('canUseSimplified (簡易課税の選択可否)', () => {
  it('is eligible at or below 50M (境界)', () => {
    expect(canUseSimplified(50_000_000)).toBe(true);
    expect(canUseSimplified(49_999_999)).toBe(true);
  });

  it('is NOT eligible above 50M (境界 + 1)', () => {
    expect(canUseSimplified(50_000_001)).toBe(false);
  });

  it('treats non-finite as 0 (eligible)', () => {
    expect(canUseSimplified(Infinity)).toBe(true);
  });
});

describe('compareBusinessTaxMethods (有利判定)', () => {
  it('picks 2割特例 for a service business with few purchases', () => {
    // service 第5種 (50%): simplified = 100万×50% = 50万
    // 2割特例 = 100万×20% = 20万 ← cheapest
    // 本則 (仕入わずか): 100万 − 10万 = 90万
    const c = compareBusinessTaxMethods(
      [{ type: 'service', sales: { standard: 10_000_000, reduced: 0 } }],
      { standard: 1_000_000, reduced: 0 },
    );
    expect(c.standard).toBe(900_000);
    expect(c.simplified).toBe(500_000);
    expect(c.twentyPercent).toBe(200_000);
    expect(c.best).toBe('twenty-percent');
    expect(c.bestAmount).toBe(200_000);
    expect(c.appliedDeemedRate).toBe(0.5);
  });

  it('picks 本則 when purchases are large', () => {
    const c = compareBusinessTaxMethods(
      [{ type: 'wholesale', sales: { standard: 10_000_000, reduced: 0 } }],
      { standard: 9_500_000, reduced: 0 },
    );
    // standard = 100万 − 95万 = 5万 ← cheapest
    expect(c.standard).toBe(50_000);
    expect(c.best).toBe('standard');
    expect(c.bestAmount).toBe(50_000);
  });

  it('picks 簡易 when it is the strict minimum (wholesale, no purchases)', () => {
    // wholesale 第1種 (90%): simplified = 100万×10% = 10万 ← cheapest
    const c = compareBusinessTaxMethods(
      [{ type: 'wholesale', sales: { standard: 10_000_000, reduced: 0 } }],
      { standard: 0, reduced: 0 },
    );
    expect(c.simplified).toBe(100_000);
    expect(c.twentyPercent).toBe(200_000);
    expect(c.standard).toBe(1_000_000);
    expect(c.best).toBe('simplified');
    expect(c.bestAmount).toBe(100_000);
  });

  it('keeps 本則 on a standard==simplified tie (< は厳密、<= ではない)', () => {
    // 本則 = 100万 − 90万 = 10万、simplified(wholesale 90%) = 10万 → 同値。
    const c = compareBusinessTaxMethods(
      [{ type: 'wholesale', sales: { standard: 10_000_000, reduced: 0 } }],
      { standard: 9_000_000, reduced: 0 },
    );
    expect(c.standard).toBe(100_000);
    expect(c.simplified).toBe(100_000);
    expect(c.best).toBe('standard');
  });

  it('keeps 本則 on a standard==twentyPercent tie (< は厳密、<= ではない)', () => {
    // 本則 = 100万 − 80万 = 20万、2割特例 = 20万 → 同値。simplified(other 60%)=40万。
    const c = compareBusinessTaxMethods(
      [{ type: 'other', sales: { standard: 10_000_000, reduced: 0 } }],
      { standard: 8_000_000, reduced: 0 },
    );
    expect(c.standard).toBe(200_000);
    expect(c.twentyPercent).toBe(200_000);
    expect(c.simplified).toBe(400_000);
    expect(c.best).toBe('standard');
  });

  it('keeps 簡易 over 2割特例 when simplified is already the minimum (二段目の代入を奪わない)', () => {
    // simplified が standard より小さく best='simplified' になった後、
    // twentyPercent (20万) > bestAmount (10万) なので best/ bestAmount を奪わない。
    // 二段目の `twentyPercent < bestAmount` 比較・代入ブロックを kill する。
    const c = compareBusinessTaxMethods(
      [{ type: 'wholesale', sales: { standard: 10_000_000, reduced: 0 } }],
      { standard: 0, reduced: 0 },
    );
    expect(c.simplified).toBe(100_000);
    expect(c.twentyPercent).toBe(200_000);
    expect(c.best).toBe('simplified');
    expect(c.bestAmount).toBe(100_000);
  });

  it('sums the reduced-rate sales across segments (+ ではなく − の mutant を kill)', () => {
    // 2 区分とも軽減税率売上のみ。reduced を加算 (+) でなく減算 (−) すると
    // 合計が 0 → 本則/2割特例が 0 になり best が変わる。
    // 各区分 軽減1,000万×8% = 80万。合計売上税額 = 160万。
    // 本則(仕入0)=160万、2割特例=32万、simplified: 加重率 (80万×0.5+80万×0.6)/160万=0.55 → 160万×0.45=72万
    const c = compareBusinessTaxMethods(
      [
        { type: 'service', sales: { standard: 0, reduced: 10_000_000 } },
        { type: 'other', sales: { standard: 0, reduced: 10_000_000 } },
      ],
      { standard: 0, reduced: 0 },
    );
    expect(c.standard).toBe(1_600_000);
    expect(c.twentyPercent).toBe(320_000);
    expect(c.simplified).toBe(720_000);
    expect(c.best).toBe('twenty-percent');
  });

  it('aggregates multi-segment sales for 本則 and 2割特例', () => {
    // 卸売 標準1,000万 + 小売 標準1,000万 = 標準2,000万 → 売上税額200万
    // 本則 (仕入0) = 200万、2割特例 = 40万
    // simplified: 加重率 (100万×0.9 + 100万×0.8)/200万 = 0.85 → 200万×0.15 = 30万
    const c = compareBusinessTaxMethods(
      [
        { type: 'wholesale', sales: { standard: 10_000_000, reduced: 0 } },
        { type: 'retail', sales: { standard: 10_000_000, reduced: 0 } },
      ],
      { standard: 0, reduced: 0 },
    );
    expect(c.standard).toBe(2_000_000);
    expect(c.twentyPercent).toBe(400_000);
    expect(c.simplified).toBe(300_000);
    expect(c.appliedDeemedRate).toBeCloseTo(0.85, 10);
    expect(c.best).toBe('simplified');
  });
});
