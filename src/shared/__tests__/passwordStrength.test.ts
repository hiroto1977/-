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
  it('returns 0 for an empty password (guard is load-bearing)', () => {
    // 早期 return を外すと size=0 → log2(0)=-Infinity → NaN になるため、0 を厳密確認。
    expect(estimateEntropyBits('')).toBe(0);
  });

  it('pins the charset size per class (length × log2(size))', () => {
    // 各文字種を単独で与え、charsetSize の各 if / += を golden 値で固定する。
    // いずれかの分岐を反転・符号変更すると size が変わり (or 負→NaN) 値がずれる。
    expect(estimateEntropyBits('abcd')).toBe(18.8); // lower only → size 26
    expect(estimateEntropyBits('ABCD')).toBe(18.8); // upper only → size 26
    expect(estimateEntropyBits('1234')).toBe(13.29); // digit only → size 10
    expect(estimateEntropyBits('!@#$')).toBe(20); // symbol only → size 32
    expect(estimateEntropyBits('ab12')).toBe(20.68); // lower+digit → size 36
    expect(estimateEntropyBits('aA1!')).toBe(26.22); // 4 classes → size 94
  });

  it('grows with a larger charset at equal length', () => {
    expect(estimateEntropyBits('Abcdef1!')).toBeGreaterThan(estimateEntropyBits('abcdefgh'));
  });
});

describe('evaluatePasswordStrength', () => {
  it('scores an empty password as 0 / weak', () => {
    const r = evaluatePasswordStrength('');
    expect(r).toEqual({
      score: 0,
      verdict: 'weak',
      entropyBits: 0,
      charset: { hasLower: false, hasUpper: false, hasDigit: false, hasSymbol: false },
      length: 0,
    });
  });

  it('computes exact scores for short passwords (length & entropy terms unsaturated)', () => {
    // 短いパスワードは lengthScore / entropyScore が満点未満なので、Math.min↔max・
    // length/16 や entropyBits/80 の演算子変異がスコアに表れる → golden 値で固定。
    const a = evaluatePasswordStrength('abcd'); // lower×4
    expect(a.score).toBe(25);
    expect(a.entropyBits).toBe(18.8);
    expect(a.length).toBe(4);
    expect(evaluatePasswordStrength('1234').score).toBe(22); // digit×4
  });

  it('maps the verdict thresholds at the exact boundary scores', () => {
    // 量子化で到達する exact スコア: 22(weak) / 50(fair) / 60(good) / 80,89(strong)。
    // strong/good の >= 境界 (60,80) を strict に検証 (> に変えると 1 段下がる)。
    expect(evaluatePasswordStrength('1234')).toMatchObject({ score: 22, verdict: 'weak' });
    // ちょうど 35 点 (10桁数字 + 連続ペナルティ) → fair。`>= 35` を `> 35` にすると weak に落ちる。
    expect(evaluatePasswordStrength('2223456789')).toMatchObject({ score: 35, verdict: 'fair' });
    expect(evaluatePasswordStrength('Zn6!')).toMatchObject({ score: 50, verdict: 'fair' });
    expect(evaluatePasswordStrength('dK7!fM')).toMatchObject({ score: 60, verdict: 'good' });
    expect(evaluatePasswordStrength('dK7!fM5%hO')).toMatchObject({ score: 80, verdict: 'strong' });
    expect(evaluatePasswordStrength('Abc1!efghijk')).toMatchObject({ score: 89, verdict: 'strong' });
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

describe('estimateCrackSeconds', () => {
  it('returns 0 for non-positive entropy or rate', () => {
    expect(estimateCrackSeconds(0)).toBe(0);
    expect(estimateCrackSeconds(50, 0)).toBe(0);
  });

  it('is 2^(entropy-1) / guessesPerSecond (exact)', () => {
    // 試行回数 2^(40-1)=2^39、/1e10 → 54.9755813888。entropy±1 や ÷↔× の変異で大きくずれる。
    expect(estimateCrackSeconds(40)).toBeCloseTo(54.9755813888, 6);
    expect(estimateCrackSeconds(40, 1e9)).toBeCloseTo(549.755813888, 4); // rate を 1/10 にすると 10 倍
  });

  it('grows exponentially with entropy', () => {
    expect(estimateCrackSeconds(60)).toBeGreaterThan(estimateCrackSeconds(40) * 1000);
  });
});

describe('humanizeCrackTime', () => {
  it('labels each magnitude range', () => {
    expect(humanizeCrackTime(0.5)).toBe('一瞬');
    expect(humanizeCrackTime(30)).toBe('30秒');
    expect(humanizeCrackTime(600)).toBe('10分');
    expect(humanizeCrackTime(7200)).toBe('2時間');
    expect(humanizeCrackTime(86400 * 10)).toBe('10日');
    expect(humanizeCrackTime(31536000 * 500)).toBe('500年');
    expect(humanizeCrackTime(31536000 * 5000)).toBe('5千年');
    expect(humanizeCrackTime(31536000 * 5e6)).toBe('5百万年');
    expect(humanizeCrackTime(1e18)).toBe('事実上解読不能');
  });

  it('switches label exactly at each upper boundary (strict <, not <=)', () => {
    // 各しきい値ちょうどの入力は「次の単位」に繰り上がる。< を <= にする mutant は
    // 手前の単位に留まり値が変わるため kill。
    expect(humanizeCrackTime(1)).toBe('1秒'); // 1秒 (< 1 でない)
    expect(humanizeCrackTime(60)).toBe('1分'); // 60秒 → 1分 (< 60 でない)
    expect(humanizeCrackTime(3600)).toBe('1時間'); // 3600秒 → 1時間
    expect(humanizeCrackTime(86400)).toBe('1日'); // 1日
    expect(humanizeCrackTime(31536000)).toBe('1年'); // 1年
    expect(humanizeCrackTime(31536000 * 1000)).toBe('1千年'); // 1000年 → 1千年
    expect(humanizeCrackTime(31536000 * 1e6)).toBe('1百万年'); // 1e6年 → 1百万年
    expect(humanizeCrackTime(31536000 * 1e9)).toBe('事実上解読不能'); // 1e9年 → 解読不能
  });
});
