import { describe, expect, it } from 'vitest';
import {
  calcRealEstateYield,
  calcRealEstateLeverage,
  calcNoiYield,
  calcDscr,
  calcBreakEvenOccupancyPct,
  calcNpv,
  calcIrr,
  DSCR_DANGER_THRESHOLD,
  DSCR_CAUTION_THRESHOLD,
  IRR_TOLERANCE,
} from '../realEstateMetrics';

describe('calcRealEstateYield', () => {
  it('computes the gross yield (annual rent / price)', () => {
    // 月16.8万 × 12 = 201.6万 / 4,200万 = 4.8%
    const r = calcRealEstateYield(168_000, 42_000_000);
    expect(r.annualGrossRent).toBe(2_016_000);
    expect(r.grossYieldPct).toBe(4.8);
    // no expenses/occupancy → net equals gross
    expect(r.netYieldPct).toBe(4.8);
  });

  it('reflects occupancy and expenses in the net yield', () => {
    // 入居率75%、年間経費16.8万 → 純収入 = 201.6万×0.75 − 16.8万 = 151.2万 − 16.8万 = 134.4万
    const r = calcRealEstateYield(168_000, 42_000_000, 0.75, 168_000);
    expect(r.annualNetIncome).toBe(1_344_000);
    expect(r.netYieldPct).toBe(3.2); // 1,344,000 / 42,000,000 × 100 = 3.2
  });

  it('includes acquisition cost in the net-yield denominator', () => {
    const r = calcRealEstateYield(168_000, 42_000_000, 1, 0, 3_000_000);
    // gross uses price only; net uses price + acquisition cost
    expect(r.grossYieldPct).toBe(4.8);
    expect(r.netYieldPct).toBe(Math.round((2_016_000 / 45_000_000) * 100 * 100) / 100);
  });

  it('guards against zero or negative purchase price', () => {
    const r = calcRealEstateYield(168_000, 0);
    expect(r.grossYieldPct).toBe(0);
    expect(r.netYieldPct).toBe(0);
    expect(r.annualGrossRent).toBe(2_016_000);
  });

  it('clamps occupancy to [0,1] and negatives to zero', () => {
    expect(calcRealEstateYield(168_000, 42_000_000, 2).netYieldPct).toBe(4.8); // occ clamped to 1
    expect(calcRealEstateYield(-100, 42_000_000).annualGrossRent).toBe(0); // rent clamped to 0
  });

  it('allows a negative net income when expenses exceed rent', () => {
    const r = calcRealEstateYield(100_000, 42_000_000, 1, 2_000_000);
    // 120万 − 200万 = −80万
    expect(r.annualNetIncome).toBe(-800_000);
    expect(r.netYieldPct).toBeLessThan(0);
  });
});

describe('calcRealEstateLeverage (CCR・イールドギャップ)', () => {
  it('computes cash-on-cash return = post-debt cashflow / own equity', () => {
    // 純収入200万 − 返済120万 = 手残り80万; 自己資金1,000万 → CCR 8%
    const r = calcRealEstateLeverage(2_000_000, 10_000_000, 1_200_000, 5.0, 2.0);
    expect(r.annualCashflow).toBe(800_000);
    expect(r.cashOnCashReturnPct).toBe(8);
  });

  it('computes the yield gap = net yield − loan rate', () => {
    const r = calcRealEstateLeverage(2_000_000, 10_000_000, 1_200_000, 5.0, 2.0);
    expect(r.yieldGapPct).toBe(3); // 5.0 − 2.0
  });

  it('flags negative leverage when the loan rate exceeds the net yield', () => {
    const r = calcRealEstateLeverage(1_000_000, 5_000_000, 800_000, 1.5, 3.0);
    expect(r.yieldGapPct).toBe(-1.5);
  });

  it('guards zero own equity (CCR 0, no division by zero)', () => {
    const r = calcRealEstateLeverage(2_000_000, 0, 1_200_000, 5.0, 2.0);
    expect(r.cashOnCashReturnPct).toBe(0);
  });

  it('clamps negative debt service to zero', () => {
    const r = calcRealEstateLeverage(2_000_000, 10_000_000, -100, 5.0, 2.0);
    expect(r.annualDebtService).toBe(0);
    expect(r.annualCashflow).toBe(2_000_000);
  });

  it('produces negative cashflow when debt service exceeds net income', () => {
    const r = calcRealEstateLeverage(1_000_000, 5_000_000, 1_500_000, 3.0, 2.0);
    expect(r.annualCashflow).toBe(-500_000);
    expect(r.cashOnCashReturnPct).toBe(-10); // -500k / 5M
  });
});

describe('calcNoiYield (NOI 実質利回り)', () => {
  it('computes NOI = gross − vacancy − opex and the NOI yield', () => {
    // 満室家賃240万、入居率90% → 空室損24万、運営費60万 → NOI = 240 − 24 − 60 = 156万
    // 総取得費 = 4,000万 + 200万 = 4,200万 → NOI 利回り = 156万 / 4,200万 = 3.71%
    const r = calcNoiYield(2_400_000, 0.9, 600_000, 40_000_000, 2_000_000);
    expect(r.vacancyLoss).toBe(240_000);
    expect(r.noi).toBe(1_560_000);
    expect(r.totalAcquisition).toBe(42_000_000);
    expect(r.noiYieldPct).toBe(3.71);
  });

  it('treats full occupancy as zero vacancy loss', () => {
    const r = calcNoiYield(2_400_000, 1, 600_000, 40_000_000);
    expect(r.vacancyLoss).toBe(0);
    expect(r.noi).toBe(1_800_000); // 240 − 0 − 60
    expect(r.totalAcquisition).toBe(40_000_000); // purchaseCost defaults to 0
    expect(r.noiYieldPct).toBe(4.5);
  });

  it('returns null NOI yield when total acquisition is zero (no division by zero)', () => {
    const r = calcNoiYield(2_400_000, 1, 600_000, 0, 0);
    expect(r.totalAcquisition).toBe(0);
    expect(r.noiYieldPct).toBeNull();
    // NOI itself is still computed.
    expect(r.noi).toBe(1_800_000);
  });

  it('clamps occupancy above 1 to full and below 0 to vacant', () => {
    expect(calcNoiYield(2_400_000, 2, 0, 40_000_000).vacancyLoss).toBe(0); // occ clamped to 1
    expect(calcNoiYield(2_400_000, -1, 0, 40_000_000).vacancyLoss).toBe(2_400_000); // occ clamped to 0
  });

  it('clamps negative gross rent, opex, price and cost to zero', () => {
    const r = calcNoiYield(-100, 1, -50, -10, -20);
    expect(r.noi).toBe(0);
    expect(r.totalAcquisition).toBe(0);
    expect(r.noiYieldPct).toBeNull();
  });

  it('allows a negative NOI (and negative yield) when opex exceeds rent', () => {
    const r = calcNoiYield(1_000_000, 1, 1_500_000, 40_000_000);
    expect(r.noi).toBe(-500_000);
    expect(r.noiYieldPct).toBeLessThan(0);
  });
});

describe('calcDscr (返済余裕率)', () => {
  it('computes DSCR = NOI / annual debt service', () => {
    const r = calcDscr(1_800_000, 1_500_000);
    expect(r.dscr).toBe(1.2);
    expect(r.band).toBe('healthy');
  });

  it('flags the danger band when DSCR is below 1.0', () => {
    const r = calcDscr(1_400_000, 1_500_000); // ≈0.93
    expect(r.dscr).toBe(0.93);
    expect(r.band).toBe('danger');
  });

  it('treats exactly the danger threshold (1.0) as caution, not danger', () => {
    const r = calcDscr(1_500_000, 1_500_000); // exactly 1.0
    expect(r.dscr).toBe(DSCR_DANGER_THRESHOLD);
    expect(r.band).toBe('caution');
  });

  it('treats exactly the caution threshold (1.2) as healthy, not caution', () => {
    const r = calcDscr(1_800_000, 1_500_000); // exactly 1.2
    expect(r.dscr).toBe(DSCR_CAUTION_THRESHOLD);
    expect(r.band).toBe('healthy');
  });

  it('just below the caution threshold stays caution', () => {
    const r = calcDscr(1_790_000, 1_500_000); // ≈1.19
    expect(r.dscr).toBe(1.19);
    expect(r.band).toBe('caution');
  });

  it('returns null when annual debt service is zero (no division by zero)', () => {
    const r = calcDscr(1_800_000, 0);
    expect(r.dscr).toBeNull();
    expect(r.band).toBeNull();
  });

  it('returns null when annual debt service is negative', () => {
    const r = calcDscr(1_800_000, -100);
    expect(r.dscr).toBeNull();
    expect(r.band).toBeNull();
  });

  it('flags danger for a negative NOI', () => {
    const r = calcDscr(-500_000, 1_500_000);
    expect(r.dscr).toBeLessThan(0);
    expect(r.band).toBe('danger');
  });
});

describe('calcBreakEvenOccupancyPct (損益分岐入居率 BER)', () => {
  it('computes BER = (opex + debt) / gross rent', () => {
    // (60万 + 150万) / 300万 = 70%
    expect(calcBreakEvenOccupancyPct(600_000, 1_500_000, 3_000_000)).toBe(70);
  });

  it('can exceed 100% when costs alone exceed full rent', () => {
    expect(calcBreakEvenOccupancyPct(2_000_000, 1_500_000, 3_000_000)).toBeGreaterThan(100);
  });

  it('returns null when gross rent is zero (no division by zero)', () => {
    expect(calcBreakEvenOccupancyPct(600_000, 1_500_000, 0)).toBeNull();
  });

  it('returns null when gross rent is negative', () => {
    expect(calcBreakEvenOccupancyPct(600_000, 1_500_000, -1)).toBeNull();
  });

  it('clamps negative opex and debt to zero (BER 0 when both non-positive)', () => {
    expect(calcBreakEvenOccupancyPct(-100, -200, 3_000_000)).toBe(0);
  });
});

describe('calcNpv', () => {
  it('discounts each future cashflow by (1+r)^t', () => {
    // CF: [-1000, 600, 600] at 10% → -1000 + 545.45 + 495.87 = 41.32 → 41 (rounded)
    expect(calcNpv([-1000, 600, 600], 0.1)).toBe(41);
  });

  it('equals the simple sum when the discount rate is zero', () => {
    expect(calcNpv([-1000, 600, 600], 0)).toBe(200);
  });

  it('returns a negative NPV when discounted inflows fall short of the outlay', () => {
    expect(calcNpv([-1000, 300, 300], 0.1)).toBeLessThan(0);
  });

  it('returns null for an empty cashflow array', () => {
    expect(calcNpv([], 0.1)).toBeNull();
  });

  it('returns null when the discount rate is -1 (denominator collapses)', () => {
    expect(calcNpv([-1000, 600], -1)).toBeNull();
  });

  it('returns null at rate -1 even for a single period-0 cashflow (guards <= vs <)', () => {
    // (1 + -1)^0 = 1 would yield a finite 500 if the guard were `< -1`;
    // the `<= -1` guard must reject -1 outright.
    expect(calcNpv([500], -1)).toBeNull();
  });

  it('returns null when the discount rate is below -1', () => {
    expect(calcNpv([-1000, 600], -1.5)).toBeNull();
  });

  it('returns null when the discount rate is not finite', () => {
    expect(calcNpv([-1000, 600], Number.NaN)).toBeNull();
    expect(calcNpv([-1000, 600], Number.POSITIVE_INFINITY)).toBeNull();
  });

  it('returns null when a cashflow value is not finite', () => {
    expect(calcNpv([-1000, Number.NaN, 600], 0.1)).toBeNull();
  });

  it('returns null when the discounted sum overflows to a non-finite value', () => {
    // Two MAX_VALUE-scale inflows at rate 0 overflow the float sum to Infinity.
    expect(calcNpv([Number.MAX_VALUE, Number.MAX_VALUE], 0)).toBeNull();
  });
});

describe('calcIrr (二分法)', () => {
  it('finds the rate where NPV is zero for a known cashflow', () => {
    // [-1000, 1100] → IRR = 10%.
    const irr = calcIrr([-1000, 1100]);
    expect(irr).not.toBeNull();
    expect(irr).toBeCloseTo(0.1, 6);
  });

  it('solves a multi-period investment converging to the true IRR', () => {
    // [-10000, 3000, 4200, 6800] has IRR ≈ 16.34% (independently verified).
    const irr = calcIrr([-10000, 3000, 4200, 6800]);
    expect(irr).not.toBeNull();
    // Verify the solution: NPV at the returned rate must be ~0.
    expect(Math.abs(calcNpv([-10000, 3000, 4200, 6800], irr as number) as number)).toBeLessThan(1);
    expect(irr).toBeCloseTo(0.1634, 3);
  });

  it('returns null when all cashflows are positive (no sign change)', () => {
    expect(calcIrr([1000, 600, 600])).toBeNull();
  });

  it('returns null when all cashflows are negative (no sign change)', () => {
    expect(calcIrr([-1000, -600, -600])).toBeNull();
  });

  it('returns null for fewer than two cashflows', () => {
    expect(calcIrr([])).toBeNull();
    expect(calcIrr([-1000])).toBeNull();
  });

  it('returns null when a cashflow is not finite (NPV uncomputable)', () => {
    expect(calcIrr([-1000, Number.NaN])).toBeNull();
  });

  it('returns null when an endpoint NPV overflows to non-finite', () => {
    // At IRR_RATE_LOW = -0.9999 the t=1 term divides by 1e-4, so a MAX_VALUE
    // late cashflow overflows the low-end NPV to Infinity → cannot bracket.
    expect(calcIrr([-1, Number.MAX_VALUE])).toBeNull();
  });

  it('returns null when the low-end NPV is -Infinity but the high-end is finite (sign-change would otherwise bisect)', () => {
    // [MAX, -MAX]: NPV(-0.9999) = -Infinity, NPV(10) = +finite. The signs differ,
    // so without the finiteness guard the bisection would run on an infinite
    // bracket and return a bogus rate. The guard must reject it as null.
    expect(calcIrr([Number.MAX_VALUE, -Number.MAX_VALUE])).toBeNull();
  });

  it('finds a root sitting exactly at the high end of the search range', () => {
    // [-11, 121] has NPV(10) = -11 + 121/11 = 0 → IRR = 10 (1000%), the bracket
    // high end. The high-end sign must be treated as non-positive (zero) so the
    // sign change is detected and the root at r=10 is returned, not rejected.
    const irr = calcIrr([-11, 121]);
    expect(irr).not.toBeNull();
    expect(irr).toBeCloseTo(10, 3);
  });

  it('handles a negative IRR when total inflows are below the outlay', () => {
    // [-1000, 500, 400] → returns are below the principal → IRR negative.
    const irr = calcIrr([-1000, 500, 400]);
    expect(irr).not.toBeNull();
    expect(irr as number).toBeLessThan(0);
    expect(Math.abs(calcNpv([-1000, 500, 400], irr as number) as number)).toBeLessThan(1);
  });

  it('converges within the tolerance (NPV at the IRR is near zero)', () => {
    const cf = [-5000, 1500, 1500, 1500, 1500];
    const irr = calcIrr(cf) as number;
    const npvAtIrr = calcNpv(cf, irr) as number;
    // bisection refines to integer-rounded NPV; assert well within ¥1.
    expect(Math.abs(npvAtIrr)).toBeLessThanOrEqual(1);
    expect(IRR_TOLERANCE).toBeLessThan(1e-6);
  });
});
