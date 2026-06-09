import { describe, expect, it } from 'vitest';
import {
  furusatoOneStopEligibility,
  calcFurusatoBreakdown,
  FURUSATO_SELF_PAY,
  FURUSATO_ONE_STOP_MAX_MUNICIPALITIES,
} from '../taxFurusato';

describe('furusatoOneStopEligibility', () => {
  it('is eligible for ≤5 municipalities without a tax return', () => {
    const r = furusatoOneStopEligibility(5, false);
    expect(r.eligible).toBe(true);
    expect(r.reason).toBe('ワンストップ特例の対象です (給与所得者・確定申告不要・5自治体以内)');
  });

  it('is not eligible when filing a tax return', () => {
    const r = furusatoOneStopEligibility(3, true);
    expect(r.eligible).toBe(false);
    expect(r.reason).toBe('確定申告を行う場合はワンストップ特例を使えません (申告に寄附金控除を含めます)');
  });

  it('is not eligible above the 5-municipality limit', () => {
    const r = furusatoOneStopEligibility(6, false);
    expect(r.eligible).toBe(false);
    expect(r.reason).toBe('寄附先が 5 自治体を超えるためワンストップ特例の対象外です (確定申告が必要)');
    expect(FURUSATO_ONE_STOP_MAX_MUNICIPALITIES).toBe(5);
  });

  it('is not eligible with zero donations', () => {
    const r = furusatoOneStopEligibility(0, false);
    expect(r.eligible).toBe(false);
    expect(r.reason).toBe('寄附先がありません');
  });
});

describe('calcFurusatoBreakdown', () => {
  it('returns all zeros at or below the 2,000 self-pay floor', () => {
    const r = calcFurusatoBreakdown(2_000, 300_000, 0.2, false);
    expect(r.eligibleAmount).toBe(0);
    expect(r.totalBenefit).toBe(0);
    expect(r.cappedBySpecialLimit).toBe(false); // empty の BooleanLiteral を固定
    expect(FURUSATO_SELF_PAY).toBe(2_000);
  });

  it('returns the empty breakdown below the floor (donation < 2,000, not negative)', () => {
    // donation 1,000 (<2,000)。早期 return の ConditionalExpression を false 固定する
    // mutant は eligibleAmount=−1,000 等の負値を計算してしまうため、全0で殺せる。
    const r = calcFurusatoBreakdown(1_000, 300_000, 0.2, false);
    expect(r.eligibleAmount).toBe(0);
    expect(r.residentBasic).toBe(0);
    expect(r.totalBenefit).toBe(0);
  });

  it('does NOT flag a cap when special portion exactly equals the cap (> は厳密)', () => {
    // marginalRate=0 → specialRaw = 2,000 × 0.9 = 1,800、cap = 9,000 × 0.2 = 1,800 → 同値。
    // `specialRaw > specialCap` を `>=` にする mutant は cappedBySpecialLimit=true になる。
    const r = calcFurusatoBreakdown(4_000, 9_000, 0, false);
    expect(r.residentSpecial).toBe(1_800);
    expect(r.cappedBySpecialLimit).toBe(false);
  });

  it('splits the deduction across income tax and resident tax when filing a return', () => {
    // donation 52,000, levy 300,000, marginal 0.2 → eligible 50,000
    const r = calcFurusatoBreakdown(52_000, 300_000, 0.2, false);
    const surtaxRate = 0.2 * 1.021;
    expect(r.eligibleAmount).toBe(50_000);
    expect(r.incomeTaxDeduction).toBe(Math.round(50_000 * surtaxRate));
    expect(r.residentBasic).toBe(5_000); // 50,000 × 10%
    expect(r.residentOneStopAddon).toBe(0); // not one-stop
  });

  it('shifts the income-tax portion into resident tax under one-stop, with the same total', () => {
    const filing = calcFurusatoBreakdown(52_000, 300_000, 0.2, false);
    const oneStop = calcFurusatoBreakdown(52_000, 300_000, 0.2, true);
    // one-stop has no income-tax deduction but an addon on the resident side
    expect(oneStop.incomeTaxDeduction).toBe(0);
    expect(oneStop.residentOneStopAddon).toBeGreaterThan(0);
    // the total benefit is the same within a small rounding tolerance
    expect(Math.abs(oneStop.totalBenefit - filing.totalBenefit)).toBeLessThanOrEqual(2);
    // one-stop pushes everything onto the resident side
    expect(oneStop.totalResidentCredit).toBeGreaterThan(filing.totalResidentCredit);
    // 住民税控除合計 = 基本分 + 特例分 + 申告特例控除 (3項とも正)。+ を − にする
    // ArithmeticOperator mutant を、合算の一致で殺す。
    expect(oneStop.residentBasic).toBeGreaterThan(0);
    expect(oneStop.residentSpecial).toBeGreaterThan(0);
    expect(oneStop.totalResidentCredit).toBe(
      oneStop.residentBasic + oneStop.residentSpecial + oneStop.residentOneStopAddon,
    );
  });

  it('caps the special portion at 20% of the resident income levy', () => {
    // huge donation vs small levy → special is capped
    const r = calcFurusatoBreakdown(1_000_000, 100_000, 0.2, false);
    expect(r.cappedBySpecialLimit).toBe(true);
    expect(r.residentSpecial).toBe(Math.round(100_000 * 0.2)); // 20,000
  });

  it('does not flag a cap when the special portion fits', () => {
    const r = calcFurusatoBreakdown(52_000, 1_000_000, 0.2, false);
    expect(r.cappedBySpecialLimit).toBe(false);
  });

  it('one-stop addon shrinks proportionally when the special portion is capped', () => {
    // capped case under one-stop: addon must stay non-negative and finite
    const r = calcFurusatoBreakdown(1_000_000, 100_000, 0.2, true);
    expect(r.residentOneStopAddon).toBeGreaterThanOrEqual(0);
    expect(Number.isFinite(r.residentOneStopAddon)).toBe(true);
  });
});
