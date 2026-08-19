import { describe, expect, it } from 'vitest';
import {
  calcStandardTax,
  calcStandardTaxDetailed,
  compareInputCreditMethods,
  taxableSalesRatio,
  canDeductFully,
  itemizedInputCredit,
  proportionalInputCredit,
  FULL_CREDIT_RATIO_THRESHOLD,
  FULL_CREDIT_SALES_THRESHOLD,
  type PurchaseByUse,
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

// --- 本則課税の仕入控除税額 (全額控除 / 個別対応 / 一括比例配分) ---------
//
// `calcStandardTax` は「全額控除できる」前提の式で、成り立つのは課税売上割合
// 95% 以上かつ課税売上高 5億円以下のときだけ。非課税売上 (住宅家賃・利子等) が
// あると按分が要る。按分せずに全額を引くと**納付が過少に出る**。

describe('課税売上割合', () => {
  it('免税売上 (輸出) は分子にも分母にも入る', () => {
    // 課税 800万 + 免税 200万 = 1,000万、非課税 0 → 100%
    expect(taxableSalesRatio(10_000_000, 0)).toBe(1);
    // 課税等 800万 / (800万 + 非課税 200万) = 80%
    expect(taxableSalesRatio(8_000_000, 2_000_000)).toBeCloseTo(0.8, 10);
  });

  it('売上が無ければ按分できないので 0 (weightedDeemedRate と同じ約束)', () => {
    expect(taxableSalesRatio(0, 0)).toBe(0);
  });

  it('非有限・負は 0 とみなす', () => {
    expect(taxableSalesRatio(Number.NaN, 1_000_000)).toBe(0);
    expect(taxableSalesRatio(-5_000_000, 5_000_000)).toBe(0);
    expect(taxableSalesRatio(5_000_000, Number.POSITIVE_INFINITY)).toBe(1);
  });
});

describe('全額控除の要件', () => {
  it('割合ちょうど 95% は全額控除できる (境界は「以上」)', () => {
    // 課税等 9,500万 / 1億 = ちょうど 95%
    expect(taxableSalesRatio(95_000_000, 5_000_000)).toBe(FULL_CREDIT_RATIO_THRESHOLD);
    expect(canDeductFully(95_000_000, 5_000_000)).toBe(true);
    // 1 円でも非課税が増えると 95% を割る
    expect(canDeductFully(95_000_000, 5_000_001)).toBe(false);
  });

  it('課税売上高ちょうど 5億円は全額控除できる (境界は「以下」)', () => {
    expect(canDeductFully(FULL_CREDIT_SALES_THRESHOLD, 0)).toBe(true);
    expect(canDeductFully(FULL_CREDIT_SALES_THRESHOLD + 1, 0)).toBe(false);
  });

  it('割合が 100% でも 5億円超なら按分が要る', () => {
    // 非課税ゼロ = 割合 100% でも、規模の要件で外れる
    expect(taxableSalesRatio(600_000_000, 0)).toBe(1);
    expect(canDeductFully(600_000_000, 0)).toBe(false);
  });
});

describe('個別対応方式と一括比例配分方式', () => {
  /** 課税売上対応 500万 / 非課税売上対応 300万 / 共通 200万 (すべて標準税率)。 */
  const purchases: PurchaseByUse = {
    taxableOnly: { standard: 5_000_000, reduced: 0 },
    exemptOnly: { standard: 3_000_000, reduced: 0 },
    common: { standard: 2_000_000, reduced: 0 },
  };

  it('個別対応方式: 課税売上対応分 + 共通対応分 × 課税売上割合', () => {
    // 50万 + 20万 × 0.8 = 66万
    expect(itemizedInputCredit(purchases, 0.8)).toBe(660_000);
  });

  it('一括比例配分方式: 仕入税額の合計 × 課税売上割合', () => {
    // (50万 + 30万 + 20万) × 0.8 = 80万
    expect(proportionalInputCredit(purchases, 0.8)).toBe(800_000);
  });

  it('非課税売上対応の仕入れは個別対応方式では 1 円も引けない', () => {
    const onlyExempt: PurchaseByUse = {
      taxableOnly: { standard: 0, reduced: 0 },
      exemptOnly: { standard: 3_000_000, reduced: 0 },
      common: { standard: 0, reduced: 0 },
    };
    expect(itemizedInputCredit(onlyExempt, 0.8)).toBe(0);
    // 一括比例配分方式では按分されて残る — ここが 2 方式の差
    expect(proportionalInputCredit(onlyExempt, 0.8)).toBe(240_000);
  });

  it('割合は 0..1 に収める (実績以外の値を渡されても壊さない)', () => {
    expect(itemizedInputCredit(purchases, -0.5)).toBe(500_000); // 共通分は 0 倍
    expect(itemizedInputCredit(purchases, 1.5)).toBe(700_000); // 共通分は 1 倍まで
    expect(proportionalInputCredit(purchases, 1.5)).toBe(1_000_000);
    expect(proportionalInputCredit(purchases, Number.NaN)).toBe(0);
  });

  it('控除が多い方を有利とし、同額なら継続適用の縛りが無い個別対応方式', () => {
    // 上の例では一括比例配分 80万 > 個別対応 66万
    const c = compareInputCreditMethods(purchases, 8_000_000, 2_000_000);
    expect(c.ratio).toBeCloseTo(0.8, 10);
    expect(c.fullyDeductible).toBe(false);
    expect(c).toMatchObject({ itemized: 660_000, proportional: 800_000, better: 'proportional' });

    // 共通対応分だけなら 2 方式は必ず同額 → 縛りの無い個別対応方式
    const commonOnly: PurchaseByUse = {
      taxableOnly: { standard: 0, reduced: 0 },
      exemptOnly: { standard: 0, reduced: 0 },
      common: { standard: 2_000_000, reduced: 0 },
    };
    const tie = compareInputCreditMethods(commonOnly, 8_000_000, 2_000_000);
    expect(tie.itemized).toBe(tie.proportional);
    expect(tie.better).toBe('itemized');
  });
});

describe('calcStandardTaxDetailed', () => {
  const purchases: PurchaseByUse = {
    taxableOnly: { standard: 5_000_000, reduced: 0 },
    exemptOnly: { standard: 3_000_000, reduced: 0 },
    common: { standard: 2_000_000, reduced: 0 },
  };

  it('全額控除できるときは method の指定によらず全額引く', () => {
    // 非課税ゼロ → 割合 100%・5億円以下 → 全額控除
    const r = calcStandardTaxDetailed({
      taxableSales: { standard: 10_000_000, reduced: 0 },
      purchases,
      method: 'proportional', // 指定しても無視される
    });
    expect(r.method).toBe('full');
    expect(r.fullyDeductible).toBe(true);
    expect(r.inputCredit).toBe(1_000_000); // 仕入 1,000万 × 10%
    expect(r.payable).toBe(0); // 売上税額 100万 − 控除 100万
  });

  it('非課税売上があると按分され、納付が増える', () => {
    // 課税 800万 (税額 80万)・非課税 200万 → 割合 80%
    const base = {
      taxableSales: { standard: 8_000_000, reduced: 0 },
      exemptSales: 2_000_000,
      purchases,
    } as const;

    const itemized = calcStandardTaxDetailed({ ...base, method: 'itemized' });
    expect(itemized.ratio).toBeCloseTo(0.8, 10);
    expect(itemized.fullyDeductible).toBe(false);
    expect(itemized.method).toBe('itemized');
    expect(itemized.inputCredit).toBe(660_000);
    expect(itemized.payable).toBe(140_000); // 80万 − 66万

    const proportional = calcStandardTaxDetailed({ ...base, method: 'proportional' });
    expect(proportional.inputCredit).toBe(800_000);
    expect(proportional.payable).toBe(0); // 80万 − 80万

    // 按分しないと控除 100万 → 納付 −20万 (還付) と出てしまう。
    // 実際には 14万 か 0 円の納付。按分の有無で符号まで変わる。
    expect(calcStandardTax({ standard: 8_000_000, reduced: 0 }, { standard: 10_000_000, reduced: 0 }))
      .toBe(-200_000);
  });

  it('方式の既定は個別対応方式', () => {
    const r = calcStandardTaxDetailed({
      taxableSales: { standard: 8_000_000, reduced: 0 },
      exemptSales: 2_000_000,
      purchases,
    });
    expect(r.method).toBe('itemized');
  });

  it('輸出売上は割合を押し上げ、全額控除に届かせることがある', () => {
    // 課税 100万・免税 (輸出) 850万・非課税 50万 → (100+850)/1000 = 95%
    const r = calcStandardTaxDetailed({
      taxableSales: { standard: 1_000_000, reduced: 0 },
      exportSales: 8_500_000,
      exemptSales: 500_000,
      purchases,
    });
    expect(r.ratio).toBe(0.95);
    expect(r.method).toBe('full');
    // 輸出そのものには消費税が乗らないので売上税額は課税 100万分だけ
    expect(r.salesTax).toBe(100_000);
    expect(r.inputCredit).toBe(1_000_000);
    expect(r.payable).toBe(-900_000); // 還付見込み
  });

  it('軽減税率が混ざっても税率別に積む', () => {
    const r = calcStandardTaxDetailed({
      taxableSales: { standard: 5_000_000, reduced: 5_000_000 },
      purchases: {
        taxableOnly: { standard: 1_000_000, reduced: 1_000_000 },
        exemptOnly: { standard: 0, reduced: 0 },
        common: { standard: 0, reduced: 0 },
      },
    });
    expect(r.salesTax).toBe(900_000); // 500万×10% + 500万×8%
    expect(r.inputTaxTotal).toBe(180_000); // 100万×10% + 100万×8%
    expect(r.payable).toBe(720_000);
  });

  it('割合の分母は標準税率と軽減税率の売上を足したもの', () => {
    // 標準 600万 + 軽減 200万 = 課税 800万、非課税 200万 → 割合 80%。
    // 2 つを引き算していると 400万/600万 = 66.7% になり、控除額がずれる。
    const r = calcStandardTaxDetailed({
      taxableSales: { standard: 6_000_000, reduced: 2_000_000 },
      exemptSales: 2_000_000,
      purchases,
      method: 'proportional',
    });
    expect(r.ratio).toBeCloseTo(0.8, 10);
    expect(r.salesTax).toBe(760_000); // 600万×10% + 200万×8%
    expect(r.inputCredit).toBe(800_000); // 仕入税額 100万 × 0.8
    expect(r.payable).toBe(-40_000); // 還付見込み
  });

  it('売上が無ければ割合 0 — 仕入があっても控除は 0 になる', () => {
    const r = calcStandardTaxDetailed({
      taxableSales: { standard: 0, reduced: 0 },
      purchases,
      method: 'proportional',
    });
    expect(r.ratio).toBe(0);
    expect(r.fullyDeductible).toBe(false);
    expect(r.inputCredit).toBe(0);
    expect(r.payable).toBe(0);
  });
});
