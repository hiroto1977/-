import { describe, expect, it } from 'vitest';
import {
  detectCharset,
  estimateEntropyBits,
  evaluatePasswordStrength,
  estimateCrackSeconds,
  humanizeCrackTime,
} from '../passwordStrength';

describe('detectCharset', () => {
  it('detects each character class', () => {
    expect(detectCharset('abc')).toEqual({ hasLower: true, hasUpper: false, hasDigit: false, hasSymbol: false });
    expect(detectCharset('Ab1!')).toEqual({ hasLower: true, hasUpper: true, hasDigit: true, hasSymbol: true });
    expect(detectCharset('日本語')).toEqual({ hasLower: false, hasUpper: false, hasDigit: false, hasSymbol: true });
  });
});

describe('estimateEntropyBits', () => {
  it('returns 0 for an empty password', () => {
    expect(estimateEntropyBits('')).toBe(0);
  });

  it('is length × log2(charset size)', () => {
    // 8 lowercase letters → charset 26 → 8 × log2(26)
    expect(estimateEntropyBits('abcdefgh')).toBeCloseTo(8 * Math.log2(26), 1);
    // mixed → larger charset → more entropy for same length
    expect(estimateEntropyBits('Abcdef1!')).toBeGreaterThan(estimateEntropyBits('abcdefgh'));
  });
});

describe('evaluatePasswordStrength', () => {
  it('scores an empty password as 0 / weak', () => {
    const r = evaluatePasswordStrength('');
    expect(r.score).toBe(0);
    expect(r.verdict).toBe('weak');
  });

  it('rates a short single-class password as weak/fair (never good/strong)', () => {
    const r = evaluatePasswordStrength('12345678');
    expect(['weak', 'fair']).toContain(r.verdict);
    expect(r.score).toBeLessThan(60);
    expect(r.charset).toEqual({ hasLower: false, hasUpper: false, hasDigit: true, hasSymbol: false });
  });

  it('rates a long mixed-class passphrase as strong', () => {
    const r = evaluatePasswordStrength('Correct-Horse-Battery-Staple-99');
    expect(r.verdict).toBe('strong');
    expect(r.score).toBeGreaterThanOrEqual(80);
  });

  it('penalizes runs of the same character', () => {
    const withRun = evaluatePasswordStrength('Aaaa1!bcde');
    const without = evaluatePasswordStrength('Axyz1!bcde');
    expect(withRun.score).toBeLessThan(without.score);
  });

  it('more character classes raise the score at equal length', () => {
    const simple = evaluatePasswordStrength('abcdefghijkl');
    const complex = evaluatePasswordStrength('Abc1!efghijk');
    expect(complex.score).toBeGreaterThan(simple.score);
  });
});

describe('estimateCrackSeconds / humanizeCrackTime', () => {
  it('returns 0 for non-positive entropy or rate', () => {
    expect(estimateCrackSeconds(0)).toBe(0);
    expect(estimateCrackSeconds(50, 0)).toBe(0);
  });

  it('grows exponentially with entropy', () => {
    const e40 = estimateCrackSeconds(40);
    const e60 = estimateCrackSeconds(60);
    expect(e60).toBeGreaterThan(e40 * 1000);
  });

  it('humanizes durations across ranges', () => {
    expect(humanizeCrackTime(0.5)).toBe('一瞬');
    expect(humanizeCrackTime(30)).toBe('30秒');
    expect(humanizeCrackTime(7200)).toBe('2時間');
    expect(humanizeCrackTime(86400 * 10)).toBe('10日');
    expect(humanizeCrackTime(1e18)).toBe('事実上解読不能');
  });
});
