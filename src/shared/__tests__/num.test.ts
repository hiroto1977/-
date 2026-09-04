import { describe, expect, it } from 'vitest';
import { assertNonNegativeFinite, floorHundred, nonNeg, round1, round2, yen } from '../num';

describe('yen', () => {
  it('円未満を四捨五入する', () => {
    expect(yen(100.4)).toBe(100);
    expect(yen(100.5)).toBe(101);
    expect(yen(-100.5)).toBe(-100); // Math.round は正の無限大方向へ丸める
    expect(yen(0)).toBe(0);
  });

  it('非有限値はそのまま伝播させる（黙って 0 にしない）', () => {
    expect(yen(NaN)).toBeNaN();
    expect(yen(Infinity)).toBe(Infinity);
  });
});

describe('round1 / round2', () => {
  it('指定桁で丸める', () => {
    expect(round1(1.24)).toBe(1.2);
    expect(round1(1.25)).toBe(1.3);
    expect(round2(1.234)).toBe(1.23);
    expect(round2(1.235)).toBe(1.24);
  });

  it('丸める桁が違う', () => {
    expect(round1(1.05)).toBe(1.1);
    expect(round2(1.05)).toBe(1.05);
  });
});

describe('nonNeg', () => {
  it('負値と非有限値を 0 にする', () => {
    expect(nonNeg(5)).toBe(5);
    expect(nonNeg(0)).toBe(0);
    expect(nonNeg(-1)).toBe(0);
    expect(nonNeg(NaN)).toBe(0);
    expect(nonNeg(Infinity)).toBe(0);
    expect(nonNeg(-Infinity)).toBe(0);
  });
});

describe('floorHundred', () => {
  it('100円未満を切り捨てる', () => {
    expect(floorHundred(1099)).toBe(1000);
    expect(floorHundred(1100)).toBe(1100);
    expect(floorHundred(99)).toBe(0);
    expect(floorHundred(0)).toBe(0);
  });

  it('負値は下方向へ切り捨てる（Math.floor の定義どおり）', () => {
    expect(floorHundred(-1)).toBe(-100);
  });
});

describe('assertNonNegativeFinite', () => {
  it('0 以上の有限数は通す', () => {
    expect(() => assertNonNegativeFinite(0, 'x')).not.toThrow();
    expect(() => assertNonNegativeFinite(1_000_000, 'x')).not.toThrow();
  });

  it('負値・非有限値は名前つきで投げる', () => {
    expect(() => assertNonNegativeFinite(-1, 'sales')).toThrow(/sales must be a finite number >= 0 \(got -1\)/);
    expect(() => assertNonNegativeFinite(NaN, 'sales')).toThrow(/got NaN/);
    expect(() => assertNonNegativeFinite(Infinity, 'sales')).toThrow(/got Infinity/);
  });
});
