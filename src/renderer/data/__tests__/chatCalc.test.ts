import { describe, expect, it } from 'vitest';
import { parseAmountJa, parseCalcQuery, runCalcQuery, formatCalcAnswer } from '../chatCalc';

describe('parseAmountJa', () => {
  it('parses 万 notation, plain yen, commas, decimals, and full-width digits', () => {
    expect(parseAmountJa('40万')).toBe(400_000);
    expect(parseAmountJa('40万円')).toBe(400_000);
    expect(parseAmountJa('40.5万')).toBe(405_000);
    expect(parseAmountJa('400000')).toBe(400_000);
    expect(parseAmountJa('400,000円')).toBe(400_000);
    expect(parseAmountJa('４０万')).toBe(400_000); // 全角は NFKC で半角化
  });

  it('rounds fractional yen and rejects zero / no-number input', () => {
    expect(parseAmountJa('0.00005万')).toBe(1); // 0.5円 → 四捨五入で1円
    expect(parseAmountJa('0万')).toBeNull();
    expect(parseAmountJa('0')).toBeNull();
    expect(parseAmountJa('額面の手取り')).toBeNull();
  });

  it('allows whitespace before 万 and keeps multi-digit decimals', () => {
    expect(parseAmountJa('40 万')).toBe(400_000); // 数字と万の間の空白を許容
    expect(parseAmountJa('40.55万')).toBe(405_500); // 小数2桁
  });

  it('does not attach 万 across an intervening non-space character', () => {
    // '40.万' は小数部が無いので '40' (円) として読む — 万 は数字に隣接していない。
    expect(parseAmountJa('40.万')).toBe(40);
  });

  it('rejects astronomically long digit strings (parseFloat → Infinity)', () => {
    expect(parseAmountJa(`1${'0'.repeat(309)}`)).toBeNull();
  });
});

describe('parseCalcQuery', () => {
  it('returns null without the 手取り keyword or without an amount', () => {
    expect(parseCalcQuery('額面40万の税金は？')).toBeNull();
    expect(parseCalcQuery('手取りを増やしたい')).toBeNull();
  });

  it('parses gross → take-home (amount not adjacent to 手取り)', () => {
    expect(parseCalcQuery('額面40万の手取りは？')).toEqual({ kind: 'take-home', amount: 400_000 });
    expect(parseCalcQuery('月給500000円だと手取りいくら')).toEqual({
      kind: 'take-home',
      amount: 500_000,
    });
  });

  it('parses 手取り<金額> → required-gross (を/が/で の助詞も許容)', () => {
    expect(parseCalcQuery('手取り30万に必要な額面は')).toEqual({
      kind: 'required-gross',
      amount: 300_000,
    });
    expect(parseCalcQuery('手取りを44万円にしたい')).toEqual({
      kind: 'required-gross',
      amount: 440_000,
    });
    expect(parseCalcQuery('手取りで26.5万欲しい')).toEqual({
      kind: 'required-gross',
      amount: 265_000,
    });
    expect(parseCalcQuery('手取りが35万になる額面は')).toEqual({
      kind: 'required-gross',
      amount: 350_000,
    });
  });

  it('returns null when the amount right after 手取り is zero', () => {
    expect(parseCalcQuery('手取り0万円')).toBeNull();
  });

  it('treats whitespace after 手取り as adjacency (逆算) but later digits as gross (順算)', () => {
    // 空白を挟んだ直後の数字 → 逆算。
    expect(parseCalcQuery('手取り 30万に必要な額面')).toEqual({
      kind: 'required-gross',
      amount: 300_000,
    });
    // 数字が直後でなければ (文中の後方にあれば) 額面→手取りの順算。
    expect(parseCalcQuery('手取りはどうなる？額面40万で')).toEqual({
      kind: 'take-home',
      amount: 400_000,
    });
  });

  it('parses a long plain-yen amount right after 手取り without truncation', () => {
    expect(parseCalcQuery('手取り265000円にしたい')).toEqual({
      kind: 'required-gross',
      amount: 265_000,
    });
  });
});

describe('runCalcQuery', () => {
  it('computes take-home with the welfareScheme exact values (額面40万)', () => {
    const a = runCalcQuery({ kind: 'take-home', amount: 400_000 });
    expect(a.comp).toEqual({
      gross: 400_000,
      employeeSocialInsurance: 60_415,
      incomeTax: 10_380,
      residentTax: 19_125,
      takeHome: 310_080,
      employerSocialInsurance: 63_015,
    });
    expect(a.query.kind).toBe('take-home');
  });

  it('solves required gross for a target take-home (手取り44万 → 額面585,123)', () => {
    const a = runCalcQuery({ kind: 'required-gross', amount: 440_000 });
    expect(a.comp.gross).toBe(585_123); // designWelfareScheme normal と同一の逆算値
    expect(a.comp.takeHome).toBe(440_000);
  });
});

describe('formatCalcAnswer', () => {
  it('renders the take-home breakdown with exact yen strings', () => {
    const text = formatCalcAnswer(runCalcQuery({ kind: 'take-home', amount: 400_000 }));
    expect(text).toContain('¥400,000');
    expect(text).toContain('¥60,415');
    expect(text).toContain('¥310,080');
    expect(text).toContain('概算');
  });

  it('renders the required-gross headline with the solved gross', () => {
    const text = formatCalcAnswer(runCalcQuery({ kind: 'required-gross', amount: 440_000 }));
    expect(text).toContain('手取り ¥440,000/月 に必要な額面');
    expect(text).toContain('¥585,123');
  });
});
