import { describe, expect, it } from 'vitest';
import {
  CONTINUOUS_BASIC_CONTRACT_DUTY,
  DOC1_DOC2_BRACKETS,
  NO_AMOUNT_DUTY,
  RECEIPT_BRACKETS,
  isStampExempt,
  stampDutyAmount,
  type DocumentType,
} from '../taxStampDuty';

// 第1号 (不動産譲渡) と第2号 (請負) は本則税額表が同一。
describe('stampDutyAmount — 第1号文書 (realEstateTransfer)', () => {
  it('is non-taxable (0) below 1万円: 9,999 円', () => {
    expect(stampDutyAmount({ documentType: 'realEstateTransfer', contractAmount: 9_999 })).toBe(0);
  });

  it('charges 200 at exactly 10,000 円 (1万円ちょうど)', () => {
    expect(stampDutyAmount({ documentType: 'realEstateTransfer', contractAmount: 10_000 })).toBe(200);
  });

  it('charges 200 at the 100,000 円 upper bound (10万円以下)', () => {
    expect(stampDutyAmount({ documentType: 'realEstateTransfer', contractAmount: 100_000 })).toBe(200);
  });

  it('charges 400 at 100,001 円 (just over 10万円)', () => {
    expect(stampDutyAmount({ documentType: 'realEstateTransfer', contractAmount: 100_001 })).toBe(400);
  });

  it('charges 400 at the 500,000 円 upper bound (50万円以下)', () => {
    expect(stampDutyAmount({ documentType: 'realEstateTransfer', contractAmount: 500_000 })).toBe(400);
  });

  it('charges 1,000 at 500,001 円 (just over 50万円)', () => {
    expect(stampDutyAmount({ documentType: 'realEstateTransfer', contractAmount: 500_001 })).toBe(1_000);
  });

  it('charges 1,000 at the 1,000,000 円 upper bound (100万円以下)', () => {
    expect(stampDutyAmount({ documentType: 'realEstateTransfer', contractAmount: 1_000_000 })).toBe(1_000);
  });

  it('charges 2,000 at 1,000,001 円 (just over 100万円)', () => {
    expect(stampDutyAmount({ documentType: 'realEstateTransfer', contractAmount: 1_000_001 })).toBe(2_000);
  });

  it('charges 2,000 at the 5,000,000 円 upper bound (500万円以下)', () => {
    expect(stampDutyAmount({ documentType: 'realEstateTransfer', contractAmount: 5_000_000 })).toBe(2_000);
  });

  it('charges 10,000 at 5,000,001 円 (just over 500万円)', () => {
    expect(stampDutyAmount({ documentType: 'realEstateTransfer', contractAmount: 5_000_001 })).toBe(10_000);
  });

  it('charges 10,000 at the 10,000,000 円 upper bound (1,000万円以下)', () => {
    expect(stampDutyAmount({ documentType: 'realEstateTransfer', contractAmount: 10_000_000 })).toBe(10_000);
  });

  it('charges 20,000 at 10,000,001 円 (just over 1,000万円)', () => {
    expect(stampDutyAmount({ documentType: 'realEstateTransfer', contractAmount: 10_000_001 })).toBe(20_000);
  });

  it('charges 20,000 at the 50,000,000 円 upper bound (5,000万円以下)', () => {
    expect(stampDutyAmount({ documentType: 'realEstateTransfer', contractAmount: 50_000_000 })).toBe(20_000);
  });

  it('charges 60,000 at 50,000,001 円 (just over 5,000万円)', () => {
    expect(stampDutyAmount({ documentType: 'realEstateTransfer', contractAmount: 50_000_001 })).toBe(60_000);
  });

  it('charges 60,000 at the 100,000,000 円 upper bound (1億円以下)', () => {
    expect(stampDutyAmount({ documentType: 'realEstateTransfer', contractAmount: 100_000_000 })).toBe(60_000);
  });

  it('charges 100,000 at 100,000,001 円 (just over 1億円)', () => {
    expect(stampDutyAmount({ documentType: 'realEstateTransfer', contractAmount: 100_000_001 })).toBe(100_000);
  });

  it('charges 100,000 at the 500,000,000 円 upper bound (5億円以下)', () => {
    expect(stampDutyAmount({ documentType: 'realEstateTransfer', contractAmount: 500_000_000 })).toBe(100_000);
  });

  it('charges 200,000 at 500,000,001 円 (just over 5億円)', () => {
    expect(stampDutyAmount({ documentType: 'realEstateTransfer', contractAmount: 500_000_001 })).toBe(200_000);
  });

  it('charges 200,000 at the 1,000,000,000 円 upper bound (10億円以下)', () => {
    expect(stampDutyAmount({ documentType: 'realEstateTransfer', contractAmount: 1_000_000_000 })).toBe(200_000);
  });

  it('charges 400,000 at 1,000,000,001 円 (just over 10億円)', () => {
    expect(stampDutyAmount({ documentType: 'realEstateTransfer', contractAmount: 1_000_000_001 })).toBe(400_000);
  });

  it('charges 400,000 at the 5,000,000,000 円 upper bound (50億円以下)', () => {
    expect(stampDutyAmount({ documentType: 'realEstateTransfer', contractAmount: 5_000_000_000 })).toBe(400_000);
  });

  it('charges 600,000 at 5,000,000,001 円 (just over 50億円)', () => {
    expect(stampDutyAmount({ documentType: 'realEstateTransfer', contractAmount: 5_000_000_001 })).toBe(600_000);
  });

  it('charges 600,000 for a very large amount (10兆円)', () => {
    expect(stampDutyAmount({ documentType: 'realEstateTransfer', contractAmount: 10_000_000_000_000 })).toBe(600_000);
  });

  it('charges 200 (記載金額なし) when contractAmount is omitted', () => {
    expect(stampDutyAmount({ documentType: 'realEstateTransfer' })).toBe(NO_AMOUNT_DUTY);
  });

  it('charges the non-taxable 0 at exactly 0 円', () => {
    expect(stampDutyAmount({ documentType: 'realEstateTransfer', contractAmount: 0 })).toBe(0);
  });
});

describe('stampDutyAmount — 第2号文書 (construction) shares the 第1号 table', () => {
  it('is non-taxable (0) below 1万円: 9,999 円', () => {
    expect(stampDutyAmount({ documentType: 'construction', contractAmount: 9_999 })).toBe(0);
  });

  it('charges 200 at exactly 10,000 円', () => {
    expect(stampDutyAmount({ documentType: 'construction', contractAmount: 10_000 })).toBe(200);
  });

  it('charges 2,000 at the 5,000,000 円 upper bound', () => {
    expect(stampDutyAmount({ documentType: 'construction', contractAmount: 5_000_000 })).toBe(2_000);
  });

  it('charges 600,000 above 50億円', () => {
    expect(stampDutyAmount({ documentType: 'construction', contractAmount: 5_000_000_001 })).toBe(600_000);
  });

  it('charges 200 (記載金額なし) when contractAmount is omitted', () => {
    expect(stampDutyAmount({ documentType: 'construction' })).toBe(NO_AMOUNT_DUTY);
  });
});

describe('stampDutyAmount — 第17号文書 (receipt / 領収書)', () => {
  it('is non-taxable (0) below 5万円: 49,999 円', () => {
    expect(stampDutyAmount({ documentType: 'receipt', contractAmount: 49_999 })).toBe(0);
  });

  it('charges 200 at exactly 50,000 円 (5万円ちょうど)', () => {
    expect(stampDutyAmount({ documentType: 'receipt', contractAmount: 50_000 })).toBe(200);
  });

  it('charges 200 at the 1,000,000 円 upper bound (100万円以下)', () => {
    expect(stampDutyAmount({ documentType: 'receipt', contractAmount: 1_000_000 })).toBe(200);
  });

  it('charges 400 at 1,000,001 円 (just over 100万円)', () => {
    expect(stampDutyAmount({ documentType: 'receipt', contractAmount: 1_000_001 })).toBe(400);
  });

  it('charges 400 at the 2,000,000 円 upper bound (200万円以下)', () => {
    expect(stampDutyAmount({ documentType: 'receipt', contractAmount: 2_000_000 })).toBe(400);
  });

  it('charges 600 at 2,000,001 円 (just over 200万円)', () => {
    expect(stampDutyAmount({ documentType: 'receipt', contractAmount: 2_000_001 })).toBe(600);
  });

  it('charges 600 at the 3,000,000 円 upper bound (300万円以下)', () => {
    expect(stampDutyAmount({ documentType: 'receipt', contractAmount: 3_000_000 })).toBe(600);
  });

  it('charges 1,000 at 3,000,001 円 (just over 300万円)', () => {
    expect(stampDutyAmount({ documentType: 'receipt', contractAmount: 3_000_001 })).toBe(1_000);
  });

  it('charges 1,000 at the 5,000,000 円 upper bound (500万円以下)', () => {
    expect(stampDutyAmount({ documentType: 'receipt', contractAmount: 5_000_000 })).toBe(1_000);
  });

  it('charges 2,000 at 5,000,001 円 (just over 500万円)', () => {
    expect(stampDutyAmount({ documentType: 'receipt', contractAmount: 5_000_001 })).toBe(2_000);
  });

  it('charges 2,000 at the 10,000,000 円 upper bound (1,000万円以下)', () => {
    expect(stampDutyAmount({ documentType: 'receipt', contractAmount: 10_000_000 })).toBe(2_000);
  });

  it('charges 4,000 at 10,000,001 円 (just over 1,000万円)', () => {
    expect(stampDutyAmount({ documentType: 'receipt', contractAmount: 10_000_001 })).toBe(4_000);
  });

  it('charges 4,000 at the 20,000,000 円 upper bound (2,000万円以下)', () => {
    expect(stampDutyAmount({ documentType: 'receipt', contractAmount: 20_000_000 })).toBe(4_000);
  });

  it('charges 6,000 at 20,000,001 円 (just over 2,000万円)', () => {
    expect(stampDutyAmount({ documentType: 'receipt', contractAmount: 20_000_001 })).toBe(6_000);
  });

  it('charges 6,000 at the 30,000,000 円 upper bound (3,000万円以下)', () => {
    expect(stampDutyAmount({ documentType: 'receipt', contractAmount: 30_000_000 })).toBe(6_000);
  });

  it('charges 10,000 at 30,000,001 円 (just over 3,000万円)', () => {
    expect(stampDutyAmount({ documentType: 'receipt', contractAmount: 30_000_001 })).toBe(10_000);
  });

  it('charges 10,000 at the 50,000,000 円 upper bound (5,000万円以下)', () => {
    expect(stampDutyAmount({ documentType: 'receipt', contractAmount: 50_000_000 })).toBe(10_000);
  });

  it('charges 20,000 at 50,000,001 円 (just over 5,000万円)', () => {
    expect(stampDutyAmount({ documentType: 'receipt', contractAmount: 50_000_001 })).toBe(20_000);
  });

  it('charges 20,000 at the 100,000,000 円 upper bound (1億円以下)', () => {
    expect(stampDutyAmount({ documentType: 'receipt', contractAmount: 100_000_000 })).toBe(20_000);
  });

  it('charges 40,000 at 100,000,001 円 (just over 1億円)', () => {
    expect(stampDutyAmount({ documentType: 'receipt', contractAmount: 100_000_001 })).toBe(40_000);
  });

  it('charges 40,000 at the 200,000,000 円 upper bound (2億円以下)', () => {
    expect(stampDutyAmount({ documentType: 'receipt', contractAmount: 200_000_000 })).toBe(40_000);
  });

  it('charges 60,000 at 200,000,001 円 (just over 2億円)', () => {
    expect(stampDutyAmount({ documentType: 'receipt', contractAmount: 200_000_001 })).toBe(60_000);
  });

  it('charges 60,000 at the 300,000,000 円 upper bound (3億円以下)', () => {
    expect(stampDutyAmount({ documentType: 'receipt', contractAmount: 300_000_000 })).toBe(60_000);
  });

  it('charges 100,000 at 300,000,001 円 (just over 3億円)', () => {
    expect(stampDutyAmount({ documentType: 'receipt', contractAmount: 300_000_001 })).toBe(100_000);
  });

  it('charges 100,000 at the 500,000,000 円 upper bound (5億円以下)', () => {
    expect(stampDutyAmount({ documentType: 'receipt', contractAmount: 500_000_000 })).toBe(100_000);
  });

  it('charges 150,000 at 500,000,001 円 (just over 5億円)', () => {
    expect(stampDutyAmount({ documentType: 'receipt', contractAmount: 500_000_001 })).toBe(150_000);
  });

  it('charges 150,000 at the 1,000,000,000 円 upper bound (10億円以下)', () => {
    expect(stampDutyAmount({ documentType: 'receipt', contractAmount: 1_000_000_000 })).toBe(150_000);
  });

  it('charges 200,000 at 1,000,000,001 円 (just over 10億円)', () => {
    expect(stampDutyAmount({ documentType: 'receipt', contractAmount: 1_000_000_001 })).toBe(200_000);
  });

  it('charges 200,000 for a very large receipt (5億万円超)', () => {
    expect(stampDutyAmount({ documentType: 'receipt', contractAmount: 10_000_000_000_000 })).toBe(200_000);
  });

  it('charges 200 (記載金額なし) when contractAmount is omitted', () => {
    expect(stampDutyAmount({ documentType: 'receipt' })).toBe(NO_AMOUNT_DUTY);
  });

  it('is 0 when not business-related (営業に関しないもの) regardless of amount', () => {
    expect(
      stampDutyAmount({ documentType: 'receipt', contractAmount: 10_000_000, isBusinessRelated: false }),
    ).toBe(0);
  });

  it('is 0 when not business-related even with no contractAmount', () => {
    expect(stampDutyAmount({ documentType: 'receipt', isBusinessRelated: false })).toBe(0);
  });

  it('charges normally when explicitly business-related (isBusinessRelated: true)', () => {
    expect(
      stampDutyAmount({ documentType: 'receipt', contractAmount: 1_000_000, isBusinessRelated: true }),
    ).toBe(200);
  });

  it('treats omitted isBusinessRelated as true (charges the duty)', () => {
    expect(stampDutyAmount({ documentType: 'receipt', contractAmount: 1_000_000 })).toBe(200);
  });
});

describe('stampDutyAmount — 第7号文書 (continuousBasicContract)', () => {
  it('is a flat 4,000 円 for a typical amount', () => {
    expect(stampDutyAmount({ documentType: 'continuousBasicContract', contractAmount: 1_000_000 })).toBe(4_000);
  });

  it('is a flat 4,000 円 even for a tiny amount', () => {
    expect(stampDutyAmount({ documentType: 'continuousBasicContract', contractAmount: 1 })).toBe(4_000);
  });

  it('is a flat 4,000 円 at 0 円', () => {
    expect(stampDutyAmount({ documentType: 'continuousBasicContract', contractAmount: 0 })).toBe(4_000);
  });

  it('is a flat 4,000 円 with no contractAmount', () => {
    expect(stampDutyAmount({ documentType: 'continuousBasicContract' })).toBe(4_000);
  });

  it('matches the CONTINUOUS_BASIC_CONTRACT_DUTY constant', () => {
    expect(stampDutyAmount({ documentType: 'continuousBasicContract' })).toBe(CONTINUOUS_BASIC_CONTRACT_DUTY);
  });

  it('ignores isBusinessRelated for 第7号 (still 4,000)', () => {
    expect(
      stampDutyAmount({ documentType: 'continuousBasicContract', contractAmount: 5_000, isBusinessRelated: false }),
    ).toBe(4_000);
  });
});

describe('stampDutyAmount — input validation (throws)', () => {
  it('throws for an unknown documentType', () => {
    expect(() =>
      stampDutyAmount({ documentType: 'bogus' as unknown as DocumentType, contractAmount: 100 }),
    ).toThrow(/unknown documentType/);
  });

  it('throws for a negative contractAmount', () => {
    expect(() => stampDutyAmount({ documentType: 'receipt', contractAmount: -1 })).toThrow(/>= 0/);
  });

  it('throws for NaN contractAmount', () => {
    expect(() => stampDutyAmount({ documentType: 'receipt', contractAmount: Number.NaN })).toThrow(/finite/);
  });

  it('throws for Infinity contractAmount', () => {
    expect(() =>
      stampDutyAmount({ documentType: 'receipt', contractAmount: Number.POSITIVE_INFINITY }),
    ).toThrow(/finite/);
  });

  it('throws for -Infinity contractAmount', () => {
    expect(() =>
      stampDutyAmount({ documentType: 'receipt', contractAmount: Number.NEGATIVE_INFINITY }),
    ).toThrow(/finite/);
  });

  it('validates documentType before amount (unknown type + bad amount → type error)', () => {
    expect(() =>
      stampDutyAmount({ documentType: 'bogus' as unknown as DocumentType, contractAmount: -1 }),
    ).toThrow(/unknown documentType/);
  });

  it('validates an unknown documentType even with no contractAmount', () => {
    expect(() => stampDutyAmount({ documentType: 'bogus' as unknown as DocumentType })).toThrow(
      /unknown documentType/,
    );
  });

  it('throws negative-amount error even for 第7号 (validation runs first)', () => {
    expect(() =>
      stampDutyAmount({ documentType: 'continuousBasicContract', contractAmount: -100 }),
    ).toThrow(/>= 0/);
  });
});

describe('isStampExempt', () => {
  it('is true for 第1号 below 1万円 (9,999)', () => {
    expect(isStampExempt({ documentType: 'realEstateTransfer', contractAmount: 9_999 })).toBe(true);
  });

  it('is false for 第1号 at exactly 1万円 (10,000)', () => {
    expect(isStampExempt({ documentType: 'realEstateTransfer', contractAmount: 10_000 })).toBe(false);
  });

  it('is true for 第2号 below 1万円 (9,999)', () => {
    expect(isStampExempt({ documentType: 'construction', contractAmount: 9_999 })).toBe(true);
  });

  it('is false for 第2号 at exactly 1万円 (10,000)', () => {
    expect(isStampExempt({ documentType: 'construction', contractAmount: 10_000 })).toBe(false);
  });

  it('is true for a receipt below 5万円 (49,999)', () => {
    expect(isStampExempt({ documentType: 'receipt', contractAmount: 49_999 })).toBe(true);
  });

  it('is false for a receipt at exactly 5万円 (50,000)', () => {
    expect(isStampExempt({ documentType: 'receipt', contractAmount: 50_000 })).toBe(false);
  });

  it('is true for a non-business receipt regardless of amount', () => {
    expect(
      isStampExempt({ documentType: 'receipt', contractAmount: 10_000_000, isBusinessRelated: false }),
    ).toBe(true);
  });

  it('is false for a 第7号 contract (flat 4,000 is never exempt)', () => {
    expect(isStampExempt({ documentType: 'continuousBasicContract', contractAmount: 0 })).toBe(false);
  });

  it('is false for a 記載金額なし 第1号 (200 is not exempt)', () => {
    expect(isStampExempt({ documentType: 'realEstateTransfer' })).toBe(false);
  });

  it('is false for a 記載金額なし receipt (200 is not exempt)', () => {
    expect(isStampExempt({ documentType: 'receipt' })).toBe(false);
  });

  it('propagates validation errors (unknown documentType throws)', () => {
    expect(() => isStampExempt({ documentType: 'bogus' as unknown as DocumentType })).toThrow(
      /unknown documentType/,
    );
  });

  it('propagates validation errors (negative amount throws)', () => {
    expect(() => isStampExempt({ documentType: 'receipt', contractAmount: -5 })).toThrow(/>= 0/);
  });
});

describe('exported tables (本則税額表の整合)', () => {
  it('第1号/第2号表は upTo 昇順で末尾が Infinity', () => {
    const ups = DOC1_DOC2_BRACKETS.map((b) => b.upTo);
    const sorted = [...ups].sort((a, b) => a - b);
    expect(ups).toEqual(sorted);
    expect(DOC1_DOC2_BRACKETS.at(-1)?.upTo).toBe(Infinity);
  });

  it('領収書表は upTo 昇順で末尾が Infinity', () => {
    const ups = RECEIPT_BRACKETS.map((b) => b.upTo);
    const sorted = [...ups].sort((a, b) => a - b);
    expect(ups).toEqual(sorted);
    expect(RECEIPT_BRACKETS.at(-1)?.upTo).toBe(Infinity);
  });

  it('第1号/第2号表の最初の区間は 9,999 円以下が非課税 (duty 0)', () => {
    expect(DOC1_DOC2_BRACKETS[0]).toEqual({ upTo: 9_999, duty: 0 });
  });

  it('領収書表の最初の区間は 49,999 円以下が非課税 (duty 0)', () => {
    expect(RECEIPT_BRACKETS[0]).toEqual({ upTo: 49_999, duty: 0 });
  });
});
