import { describe, expect, it } from 'vitest';
import {
  calcCapitalGainsTax,
  estimatedAcquisitionCost,
  resolveAcquisitionCost,
  ESTIMATED_ACQUISITION_COST_RATE,
  RESIDENTIAL_SPECIAL_DEDUCTION,
  RESIDENTIAL_REDUCED_RATE_CAP,
  isLongTermOwnership,
  qualifiesForReducedRate,
  classifyRealEstateKind,
  inheritanceAcquisitionCostAddition,
  replacementPropertyDeferral,
  LONG_TERM_OWNERSHIP_YEARS,
  REDUCED_RATE_OWNERSHIP_YEARS,
  INHERITANCE_ADDITION_DEADLINE_MONTHS,
} from '../taxCapitalGains';

const SURTAX = 1.021;

describe('calcCapitalGainsTax (譲渡所得・申告分離課税)', () => {
  it('computes long-term real-estate tax (15% income + 5% resident)', () => {
    // 収入5,000万、取得費3,000万、譲渡費用200万 → 譲渡益1,800万
    const r = calcCapitalGainsTax(50_000_000, 30_000_000, 2_000_000, 'real-estate-long');
    expect(r.gain).toBe(18_000_000);
    expect(r.specialDeduction).toBe(0);
    expect(r.taxableGain).toBe(18_000_000);
    expect(r.incomeTax).toBe(Math.round(18_000_000 * 0.15 * SURTAX));
    expect(r.residentTax).toBe(18_000_000 * 0.05);
  });

  it('computes short-term real-estate tax (30% income + 9% resident)', () => {
    const r = calcCapitalGainsTax(50_000_000, 30_000_000, 2_000_000, 'real-estate-short');
    expect(r.incomeTax).toBe(Math.round(18_000_000 * 0.3 * SURTAX));
    expect(r.residentTax).toBe(18_000_000 * 0.09);
    // short-term is heavier than long-term
    const long = calcCapitalGainsTax(50_000_000, 30_000_000, 2_000_000, 'real-estate-long');
    expect(r.totalTax).toBeGreaterThan(long.totalTax);
  });

  it('applies the 3,000万 special deduction for residential property', () => {
    // 譲渡益 2,000万 < 3,000万 → 課税譲渡所得 0
    const r = calcCapitalGainsTax(40_000_000, 19_000_000, 1_000_000, 'residential');
    expect(r.gain).toBe(20_000_000);
    expect(r.specialDeduction).toBe(20_000_000); // capped at the gain
    expect(r.taxableGain).toBe(0);
    expect(r.totalTax).toBe(0);
  });

  it('uses the residential reduced rate (10%/4%) up to 6,000万 after the deduction', () => {
    // 譲渡益 8,000万 − 3,000万控除 = 課税 5,000万 (≤6,000万) → 軽減税率
    const r = calcCapitalGainsTax(100_000_000, 18_000_000, 2_000_000, 'residential');
    expect(r.gain).toBe(80_000_000);
    expect(r.specialDeduction).toBe(30_000_000);
    expect(r.taxableGain).toBe(50_000_000);
    expect(r.incomeTax).toBe(Math.round(50_000_000 * 0.1 * SURTAX));
    expect(r.residentTax).toBe(50_000_000 * 0.04);
  });

  it('splits residential tax at the 6,000万 reduced-rate cap', () => {
    // 課税譲渡所得 9,000万 → 6,000万は10%/4%、3,000万は15%/5%
    // gain = taxable + 3,000万控除 = 9,000万 + 3,000万 = 1.2億の譲渡益
    const r = calcCapitalGainsTax(150_000_000, 28_000_000, 2_000_000, 'residential');
    expect(r.taxableGain).toBe(90_000_000);
    const expectedIncomeBase = 60_000_000 * 0.1 + 30_000_000 * 0.15;
    expect(r.incomeTax).toBe(Math.round(expectedIncomeBase * SURTAX));
    expect(r.residentTax).toBe(60_000_000 * 0.04 + 30_000_000 * 0.05);
  });

  it('computes listed-stock tax at a flat 20.315%', () => {
    const r = calcCapitalGainsTax(3_000_000, 1_000_000, 0, 'listed-stock');
    expect(r.gain).toBe(2_000_000);
    expect(r.incomeTax).toBe(Math.round(2_000_000 * 0.15 * SURTAX));
    expect(r.residentTax).toBe(2_000_000 * 0.05);
  });

  it('returns zero tax for a loss (no gain)', () => {
    const r = calcCapitalGainsTax(10_000_000, 12_000_000, 500_000, 'real-estate-long');
    expect(r.gain).toBe(0);
    expect(r.taxableGain).toBe(0);
    expect(r.totalTax).toBe(0);
    expect(r.takeHome).toBe(10_000_000);
  });

  it('clamps negative inputs to zero', () => {
    const r = calcCapitalGainsTax(-100, -100, -100, 'listed-stock');
    expect(r.gain).toBe(0);
    expect(r.totalTax).toBe(0);
  });

  it('exposes the residential deduction/cap constants', () => {
    expect(RESIDENTIAL_SPECIAL_DEDUCTION).toBe(30_000_000);
    expect(RESIDENTIAL_REDUCED_RATE_CAP).toBe(60_000_000);
  });

  // --- 境界ぴったりのテスト (品質監査チームの提案) ---
  it('residential: a 1-yen taxable gain just over the 3,000万 deduction uses the reduced rate', () => {
    // 譲渡益 30,000,001 − 3,000万控除 = 課税 1 → 軽減税率 (10%/4%)
    const r = calcCapitalGainsTax(30_000_001, 0, 0, 'residential');
    expect(r.taxableGain).toBe(1);
    expect(r.incomeTax).toBe(Math.round(1 * 0.1 * SURTAX));
    expect(r.residentTax).toBe(Math.round(1 * 0.04));
  });

  it('residential: a taxable gain of exactly 6,000万 stays fully in the reduced-rate band', () => {
    // 譲渡益 9,000万 − 3,000万控除 = 課税 6,000万 (上限ちょうど) → 全額 10%/4%
    const r = calcCapitalGainsTax(90_000_000, 0, 0, 'residential');
    expect(r.taxableGain).toBe(60_000_000);
    expect(r.incomeTax).toBe(Math.round(60_000_000 * 0.1 * SURTAX));
    expect(r.residentTax).toBe(60_000_000 * 0.04);
  });

  it('residential: a gain exactly equal to the 3,000万 deduction yields zero tax', () => {
    const r = calcCapitalGainsTax(30_000_000, 0, 0, 'residential');
    expect(r.specialDeduction).toBe(30_000_000);
    expect(r.taxableGain).toBe(0);
    expect(r.totalTax).toBe(0);
  });
});

describe('estimatedAcquisitionCost / resolveAcquisitionCost (概算取得費5%特例)', () => {
  it('computes 5% of the proceeds', () => {
    expect(estimatedAcquisitionCost(50_000_000)).toBe(2_500_000);
    expect(estimatedAcquisitionCost(0)).toBe(0);
    expect(estimatedAcquisitionCost(-100)).toBe(0);
    expect(ESTIMATED_ACQUISITION_COST_RATE).toBe(0.05);
  });

  it('uses the larger of actual cost and the 5% estimate', () => {
    // actual 1M < estimate 2.5M → use 2.5M
    expect(resolveAcquisitionCost(50_000_000, 1_000_000)).toBe(2_500_000);
    // actual 10M > estimate 2.5M → use 10M
    expect(resolveAcquisitionCost(50_000_000, 10_000_000)).toBe(10_000_000);
    // unknown cost (0) → estimate
    expect(resolveAcquisitionCost(50_000_000, 0)).toBe(2_500_000);
  });

  it('can disable the estimate (use actual only)', () => {
    expect(resolveAcquisitionCost(50_000_000, 1_000_000, false)).toBe(1_000_000);
    expect(resolveAcquisitionCost(50_000_000, 0, false)).toBe(0);
  });

  it('integrates with calcCapitalGainsTax via resolveAcquisitionCost', () => {
    // unknown cost → 5% estimate (2.5M); proceeds 50M, fee 2M → gain 45.5M
    const cost = resolveAcquisitionCost(50_000_000, 0);
    const r = calcCapitalGainsTax(50_000_000, cost, 2_000_000, 'real-estate-long');
    expect(cost).toBe(2_500_000);
    expect(r.gain).toBe(45_500_000);
  });

  it('totalTax is the sum of income+resident tax and takeHome subtracts it from proceeds', () => {
    // 短期譲渡 2,000万: 所得税 6,126,000 / 住民税 1,800,000 (両方>0で +/- 変異を区別)
    const r = calcCapitalGainsTax(20_000_000, 0, 0, 'real-estate-short');
    expect(r.incomeTax).toBe(6_126_000);
    expect(r.residentTax).toBe(1_800_000);
    expect(r.totalTax).toBe(r.incomeTax + r.residentTax); // = 7,926,000 (合算であり差ではない)
    expect(r.totalTax).toBe(7_926_000);
    expect(r.takeHome).toBe(20_000_000 - r.totalTax); // = 12,074,000 (収入から控除)
    expect(r.takeHome).toBe(12_074_000);
  });
});

// ===========================================================================
// 加算的な精緻化 (round 80)
// ===========================================================================

describe('所有期間境界ヘルパー (5年/10年)', () => {
  it('exposes the ownership-period threshold constants', () => {
    expect(LONG_TERM_OWNERSHIP_YEARS).toBe(5);
    expect(REDUCED_RATE_OWNERSHIP_YEARS).toBe(10);
  });

  it('isLongTermOwnership: 5年ちょうどは短期、5年超は長期', () => {
    expect(isLongTermOwnership(4)).toBe(false);
    expect(isLongTermOwnership(5)).toBe(false); // 境界ちょうどは短期
    expect(isLongTermOwnership(5.0001)).toBe(true);
    expect(isLongTermOwnership(6)).toBe(true);
  });

  it('isLongTermOwnership: 0・負・非有限は短期 (false)', () => {
    expect(isLongTermOwnership(0)).toBe(false);
    expect(isLongTermOwnership(-3)).toBe(false);
    expect(isLongTermOwnership(NaN)).toBe(false);
    expect(isLongTermOwnership(Infinity)).toBe(false);
    expect(isLongTermOwnership(-Infinity)).toBe(false);
  });

  it('qualifiesForReducedRate: 10年ちょうどは対象外、10年超は対象', () => {
    expect(qualifiesForReducedRate(9)).toBe(false);
    expect(qualifiesForReducedRate(10)).toBe(false); // 境界ちょうどは対象外
    expect(qualifiesForReducedRate(10.0001)).toBe(true);
    expect(qualifiesForReducedRate(11)).toBe(true);
  });

  it('qualifiesForReducedRate: 0・負・非有限は false', () => {
    expect(qualifiesForReducedRate(0)).toBe(false);
    expect(qualifiesForReducedRate(-1)).toBe(false);
    expect(qualifiesForReducedRate(NaN)).toBe(false);
    expect(qualifiesForReducedRate(Infinity)).toBe(false);
  });

  it('classifyRealEstateKind: 5年以下は短期、5年超は長期', () => {
    expect(classifyRealEstateKind(3)).toBe('real-estate-short');
    expect(classifyRealEstateKind(5)).toBe('real-estate-short');
    expect(classifyRealEstateKind(6)).toBe('real-estate-long');
    expect(classifyRealEstateKind(0)).toBe('real-estate-short');
    expect(classifyRealEstateKind(NaN)).toBe('real-estate-short');
  });
});

describe('inheritanceAcquisitionCostAddition (相続財産の取得費加算特例)', () => {
  it('exposes the 3年10ヶ月 deadline constant', () => {
    expect(INHERITANCE_ADDITION_DEADLINE_MONTHS).toBe(46);
  });

  it('按分: 相続税 × (譲渡資産評価額 / 課税価格全体)', () => {
    // 相続税 1,000万 × (譲渡資産 4,000万 / 課税価格 1億) = 400万
    // 譲渡益 (上限) 5,000万 > 400万 なので満額加算。
    const add = inheritanceAcquisitionCostAddition(
      10_000_000,
      40_000_000,
      100_000_000,
      50_000_000,
      12,
    );
    expect(add).toBe(4_000_000);
  });

  it('譲渡益を上限とする (取得費加算で損は作らない)', () => {
    // 按分額 400万 だが譲渡益が 300万 → 上限 300万。
    const add = inheritanceAcquisitionCostAddition(
      10_000_000,
      40_000_000,
      100_000_000,
      3_000_000,
      12,
    );
    expect(add).toBe(3_000_000);
  });

  it('譲渡益ちょうどに等しい按分額はそのまま (境界)', () => {
    // 按分額 = 400万、譲渡益 = 400万 → 400万。
    const add = inheritanceAcquisitionCostAddition(
      10_000_000,
      40_000_000,
      100_000_000,
      4_000_000,
      12,
    );
    expect(add).toBe(4_000_000);
  });

  it('期限 (46ヶ月) ちょうどは適用可、超過は0', () => {
    const within = inheritanceAcquisitionCostAddition(
      10_000_000,
      40_000_000,
      100_000_000,
      50_000_000,
      INHERITANCE_ADDITION_DEADLINE_MONTHS,
    );
    expect(within).toBe(4_000_000);
    const over = inheritanceAcquisitionCostAddition(
      10_000_000,
      40_000_000,
      100_000_000,
      50_000_000,
      INHERITANCE_ADDITION_DEADLINE_MONTHS + 1,
    );
    expect(over).toBe(0);
  });

  it('分母0 (課税価格0) はゼロ除算せず0を返す', () => {
    expect(
      inheritanceAcquisitionCostAddition(10_000_000, 40_000_000, 0, 50_000_000, 12),
    ).toBe(0);
  });

  it('負入力はクランプ (譲渡資産評価額が負なら加算0)', () => {
    expect(
      inheritanceAcquisitionCostAddition(10_000_000, -1, 100_000_000, 50_000_000, 12),
    ).toBe(0);
    // 相続税が負 → 加算0
    expect(
      inheritanceAcquisitionCostAddition(-5, 40_000_000, 100_000_000, 50_000_000, 12),
    ).toBe(0);
    // 譲渡益が負 → 上限0 → 加算0
    expect(
      inheritanceAcquisitionCostAddition(10_000_000, 40_000_000, 100_000_000, -1, 12),
    ).toBe(0);
  });

  it('非有限入力は0を返す', () => {
    expect(
      inheritanceAcquisitionCostAddition(NaN, 40_000_000, 100_000_000, 50_000_000, 12),
    ).toBe(0);
    expect(
      inheritanceAcquisitionCostAddition(10_000_000, Infinity, 100_000_000, 50_000_000, 12),
    ).toBe(0);
    expect(
      inheritanceAcquisitionCostAddition(10_000_000, 40_000_000, NaN, 50_000_000, 12),
    ).toBe(0);
    expect(
      inheritanceAcquisitionCostAddition(10_000_000, 40_000_000, 100_000_000, Infinity, 12),
    ).toBe(0);
    expect(
      inheritanceAcquisitionCostAddition(10_000_000, 40_000_000, 100_000_000, 50_000_000, NaN),
    ).toBe(0);
  });

  it('四捨五入する (端数)', () => {
    // 1,000万 × (1 / 3) = 3,333,333.33 → 3,333,333
    const add = inheritanceAcquisitionCostAddition(10_000_000, 1, 3, 50_000_000, 12);
    expect(add).toBe(Math.round(10_000_000 / 3));
  });
});

describe('replacementPropertyDeferral (特定居住用財産の買換え特例)', () => {
  it('全額買換 (収入≦買換取得価額) は全額繰延・課税0', () => {
    // 収入 5,000万、取得費 2,000万、譲渡費用 0 → 譲渡益 3,000万
    // 買換 6,000万 (収入以上) → 全額繰延。
    const r = replacementPropertyDeferral(50_000_000, 20_000_000, 0, 60_000_000);
    expect(r.gain).toBe(30_000_000);
    expect(r.taxableGain).toBe(0);
    expect(r.deferredGain).toBe(30_000_000);
  });

  it('買換取得価額が収入ちょうど (境界) は全額繰延', () => {
    const r = replacementPropertyDeferral(50_000_000, 20_000_000, 0, 50_000_000);
    expect(r.taxableGain).toBe(0);
    expect(r.deferredGain).toBe(30_000_000);
  });

  it('一部買換: 超過収入を按分して課税部分を算定', () => {
    // 収入 5,000万、取得費 2,000万、費用 0 → 譲渡益 3,000万
    // 買換 3,000万 → 収入超過 2,000万。比率 2,000/5,000 = 0.4。
    // 課税譲渡益 = 3,000万 × 0.4 = 1,200万、繰延 = 1,800万。
    const r = replacementPropertyDeferral(50_000_000, 20_000_000, 0, 30_000_000);
    expect(r.gain).toBe(30_000_000);
    expect(r.taxableGain).toBe(12_000_000);
    expect(r.deferredGain).toBe(18_000_000);
  });

  it('買換なし (取得価額0) は譲渡益全額が課税 (按分比率1)', () => {
    const r = replacementPropertyDeferral(50_000_000, 20_000_000, 0, 0);
    expect(r.taxableGain).toBe(30_000_000);
    expect(r.deferredGain).toBe(0);
  });

  it('譲渡損 (益≦0) は課税0・繰延0', () => {
    const r = replacementPropertyDeferral(20_000_000, 25_000_000, 1_000_000, 30_000_000);
    expect(r.gain).toBe(0);
    expect(r.taxableGain).toBe(0);
    expect(r.deferredGain).toBe(0);
  });

  it('収入0 (分母0) は課税0・繰延0', () => {
    const r = replacementPropertyDeferral(0, 0, 0, 10_000_000);
    expect(r.gain).toBe(0);
    expect(r.taxableGain).toBe(0);
    expect(r.deferredGain).toBe(0);
  });

  it('負入力をクランプする', () => {
    // 収入 -100 → 0 扱い → gain 0。
    const r = replacementPropertyDeferral(-100, -100, -100, -100);
    expect(r.gain).toBe(0);
    expect(r.taxableGain).toBe(0);
    expect(r.deferredGain).toBe(0);
  });

  it('課税 + 繰延 = 譲渡益 が常に成立 (端数四捨五入後も)', () => {
    // 譲渡益 1,000万、収入 3,000万、買換 2,000万 → 超過 1,000万、比率 1/3。
    // 課税 = round(1,000万 × 1/3) = 3,333,333、繰延 = 6,666,667。
    const r = replacementPropertyDeferral(30_000_000, 20_000_000, 0, 20_000_000);
    expect(r.gain).toBe(10_000_000);
    expect(r.taxableGain).toBe(Math.round(10_000_000 / 3));
    expect(r.taxableGain + r.deferredGain).toBe(r.gain);
  });

  it('譲渡費用も取得費に合算して譲渡益を算定', () => {
    // 収入 5,000万、取得費 2,000万、費用 1,000万 → 譲渡益 2,000万
    // 買換 0 → 全額課税。
    const r = replacementPropertyDeferral(50_000_000, 20_000_000, 10_000_000, 0);
    expect(r.gain).toBe(20_000_000);
    expect(r.taxableGain).toBe(20_000_000);
  });
});
