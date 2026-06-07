import { describe, it, expect } from 'vitest';
import {
  GIFT_ANNUAL_DEDUCTION,
  GENERAL_GIFT_BRACKETS,
  SPECIAL_GIFT_BRACKETS,
  annualGiftTax,
  settlementGiftTax,
  SETTLEMENT_SPECIAL_DEDUCTION,
  SETTLEMENT_TAX_RATE,
} from '../taxGift';

// 贈与税の概算モジュールのテスト。実例は国税庁タックスアンサーの計算手順で pin。

describe('GIFT_ANNUAL_DEDUCTION (暦年課税の基礎控除)', () => {
  it('110万円', () => {
    expect(GIFT_ANNUAL_DEDUCTION).toBe(1_100_000);
  });
});

describe('GENERAL_GIFT_BRACKETS (一般贈与財産用の速算表)', () => {
  it('8区分ある', () => {
    expect(GENERAL_GIFT_BRACKETS).toHaveLength(8);
  });

  it('最後の区分は上限なし (Infinity) で55%・控除400万', () => {
    const last = GENERAL_GIFT_BRACKETS[GENERAL_GIFT_BRACKETS.length - 1];
    expect(last).toEqual({ upTo: Infinity, rate: 0.55, deduction: 4_000_000 });
  });

  it('全区分のスナップショット (速算表の全リテラルを pin)', () => {
    expect(GENERAL_GIFT_BRACKETS).toEqual([
      { upTo: 2_000_000, rate: 0.1, deduction: 0 },
      { upTo: 3_000_000, rate: 0.15, deduction: 100_000 },
      { upTo: 4_000_000, rate: 0.2, deduction: 250_000 },
      { upTo: 6_000_000, rate: 0.3, deduction: 650_000 },
      { upTo: 10_000_000, rate: 0.4, deduction: 1_250_000 },
      { upTo: 15_000_000, rate: 0.45, deduction: 1_750_000 },
      { upTo: 30_000_000, rate: 0.5, deduction: 2_500_000 },
      { upTo: Infinity, rate: 0.55, deduction: 4_000_000 },
    ]);
  });
});

describe('SPECIAL_GIFT_BRACKETS (特例贈与財産用の速算表)', () => {
  it('8区分ある', () => {
    expect(SPECIAL_GIFT_BRACKETS).toHaveLength(8);
  });

  it('最後の区分は上限なし (Infinity) で55%・控除640万', () => {
    const last = SPECIAL_GIFT_BRACKETS[SPECIAL_GIFT_BRACKETS.length - 1];
    expect(last).toEqual({ upTo: Infinity, rate: 0.55, deduction: 6_400_000 });
  });

  it('全区分のスナップショット (速算表の全リテラルを pin)', () => {
    expect(SPECIAL_GIFT_BRACKETS).toEqual([
      { upTo: 2_000_000, rate: 0.1, deduction: 0 },
      { upTo: 4_000_000, rate: 0.15, deduction: 100_000 },
      { upTo: 6_000_000, rate: 0.2, deduction: 300_000 },
      { upTo: 10_000_000, rate: 0.3, deduction: 900_000 },
      { upTo: 15_000_000, rate: 0.4, deduction: 1_900_000 },
      { upTo: 30_000_000, rate: 0.45, deduction: 2_650_000 },
      { upTo: 45_000_000, rate: 0.5, deduction: 4_150_000 },
      { upTo: Infinity, rate: 0.55, deduction: 6_400_000 },
    ]);
  });
});

describe('annualGiftTax (暦年課税) — 基礎控除', () => {
  it('贈与110万ちょうど: 基礎控除で課税価格0・税0', () => {
    expect(annualGiftTax({ giftAmount: 1_100_000, giftType: 'general' })).toEqual({
      taxableAmount: 0,
      rate: 0,
      tax: 0,
    });
  });

  it('贈与110万+1円: 課税価格1円・速算表第1区分10%', () => {
    const r = annualGiftTax({ giftAmount: 1_100_001, giftType: 'general' });
    expect(r.taxableAmount).toBe(1);
    expect(r.rate).toBe(0.1);
    // 1×10% = 0.1 → round 0 → floor100 = 0
    expect(r.tax).toBe(0);
  });

  it('贈与110万未満: 課税価格0・税0 (負を底打ち)', () => {
    expect(annualGiftTax({ giftAmount: 500_000, giftType: 'special' })).toEqual({
      taxableAmount: 0,
      rate: 0,
      tax: 0,
    });
  });

  it('贈与0円: 課税価格0・税0', () => {
    expect(annualGiftTax({ giftAmount: 0, giftType: 'general' })).toEqual({
      taxableAmount: 0,
      rate: 0,
      tax: 0,
    });
  });
});

describe('annualGiftTax (暦年課税) — 一般贈与財産 全区間境界', () => {
  // 国税庁例: 一般 310万贈与 → 課税価格200万 → 20万。
  it('国税庁例: 一般310万 → 課税価格200万 → 税20万', () => {
    const r = annualGiftTax({ giftAmount: 3_100_000, giftType: 'general' });
    expect(r.taxableAmount).toBe(2_000_000);
    expect(r.rate).toBe(0.1);
    expect(r.tax).toBe(200_000);
  });

  // 国税庁例: 一般510万贈与 → 課税価格400万 → 55万。
  it('国税庁例: 一般510万 → 課税価格400万 → 税55万', () => {
    const r = annualGiftTax({ giftAmount: 5_100_000, giftType: 'general' });
    expect(r.taxableAmount).toBe(4_000_000);
    expect(r.tax).toBe(550_000);
  });

  // --- 第1区分 (課税価格200万以下 10%) ---
  it('課税価格200万ちょうど (1区分上限): 10% = 20万', () => {
    expect(annualGiftTax({ giftAmount: 3_100_000, giftType: 'general' }).tax).toBe(200_000);
  });

  it('課税価格200万+1円 (2区分へ): 15%−10万、連続で20万', () => {
    const r = annualGiftTax({ giftAmount: 3_100_001, giftType: 'general' });
    expect(r.rate).toBe(0.15);
    expect(r.tax).toBe(200_000);
  });

  // --- 第2区分 (300万以下 15% 控除10万) ---
  it('課税価格300万ちょうど: 15%−10万 = 35万', () => {
    expect(annualGiftTax({ giftAmount: 4_100_000, giftType: 'general' }).tax).toBe(350_000);
  });

  it('課税価格300万+1円: 20%−25万、連続で35万', () => {
    const r = annualGiftTax({ giftAmount: 4_100_001, giftType: 'general' });
    expect(r.rate).toBe(0.2);
    expect(r.tax).toBe(350_000);
  });

  // --- 第3区分 (400万以下 20% 控除25万) ---
  it('課税価格400万ちょうど: 20%−25万 = 55万', () => {
    expect(annualGiftTax({ giftAmount: 5_100_000, giftType: 'general' }).tax).toBe(550_000);
  });

  it('課税価格400万+1円: 30%−65万、連続で55万', () => {
    const r = annualGiftTax({ giftAmount: 5_100_001, giftType: 'general' });
    expect(r.rate).toBe(0.3);
    expect(r.tax).toBe(550_000);
  });

  // --- 第4区分 (600万以下 30% 控除65万) ---
  it('課税価格600万ちょうど: 30%−65万 = 115万', () => {
    expect(annualGiftTax({ giftAmount: 7_100_000, giftType: 'general' }).tax).toBe(1_150_000);
  });

  it('課税価格600万+1円: 40%−125万、連続で115万', () => {
    const r = annualGiftTax({ giftAmount: 7_100_001, giftType: 'general' });
    expect(r.rate).toBe(0.4);
    expect(r.tax).toBe(1_150_000);
  });

  // --- 第5区分 (1,000万以下 40% 控除125万) ---
  it('課税価格1,000万ちょうど: 40%−125万 = 275万', () => {
    expect(annualGiftTax({ giftAmount: 11_100_000, giftType: 'general' }).tax).toBe(2_750_000);
  });

  it('課税価格1,000万+1円: 45%−175万、連続で275万', () => {
    const r = annualGiftTax({ giftAmount: 11_100_001, giftType: 'general' });
    expect(r.rate).toBe(0.45);
    expect(r.tax).toBe(2_750_000);
  });

  // --- 第6区分 (1,500万以下 45% 控除175万) ---
  it('課税価格1,500万ちょうど: 45%−175万 = 500万', () => {
    expect(annualGiftTax({ giftAmount: 16_100_000, giftType: 'general' }).tax).toBe(5_000_000);
  });

  it('課税価格1,500万+1円: 50%−250万、連続で500万', () => {
    const r = annualGiftTax({ giftAmount: 16_100_001, giftType: 'general' });
    expect(r.rate).toBe(0.5);
    expect(r.tax).toBe(5_000_000);
  });

  // --- 第7区分 (3,000万以下 50% 控除250万) ---
  it('課税価格3,000万ちょうど: 50%−250万 = 1,250万', () => {
    expect(annualGiftTax({ giftAmount: 31_100_000, giftType: 'general' }).tax).toBe(12_500_000);
  });

  it('課税価格3,000万+1円: 55%−400万、連続で1,250万', () => {
    const r = annualGiftTax({ giftAmount: 31_100_001, giftType: 'general' });
    expect(r.rate).toBe(0.55);
    expect(r.tax).toBe(12_500_000);
  });

  // --- 第8区分 (3,000万超 55% 控除400万) ---
  it('課税価格4,000万 (最上位区分): 55%−400万 = 1,800万', () => {
    const r = annualGiftTax({ giftAmount: 41_100_000, giftType: 'general' });
    expect(r.rate).toBe(0.55);
    expect(r.tax).toBe(18_000_000);
  });
});

describe('annualGiftTax (暦年課税) — 特例贈与財産 全区間境界', () => {
  // 国税庁例: 特例510万贈与 → 課税価格400万 → 50万。
  it('国税庁例: 特例510万 → 課税価格400万 → 税50万', () => {
    const r = annualGiftTax({ giftAmount: 5_100_000, giftType: 'special' });
    expect(r.taxableAmount).toBe(4_000_000);
    expect(r.rate).toBe(0.15);
    expect(r.tax).toBe(500_000);
  });

  // 国税庁例: 特例1,110万贈与 → 課税価格1,000万 → 210万。
  it('国税庁例: 特例1,110万 → 課税価格1,000万 → 税210万', () => {
    const r = annualGiftTax({ giftAmount: 11_100_000, giftType: 'special' });
    expect(r.taxableAmount).toBe(10_000_000);
    expect(r.rate).toBe(0.3);
    expect(r.tax).toBe(2_100_000);
  });

  // --- 第1区分 (200万以下 10%) ---
  it('課税価格200万ちょうど: 10% = 20万', () => {
    expect(annualGiftTax({ giftAmount: 3_100_000, giftType: 'special' }).tax).toBe(200_000);
  });

  it('課税価格200万+1円: 15%−10万、連続で20万', () => {
    const r = annualGiftTax({ giftAmount: 3_100_001, giftType: 'special' });
    expect(r.rate).toBe(0.15);
    expect(r.tax).toBe(200_000);
  });

  // --- 第2区分 (400万以下 15% 控除10万) ---
  it('課税価格400万ちょうど: 15%−10万 = 50万', () => {
    expect(annualGiftTax({ giftAmount: 5_100_000, giftType: 'special' }).tax).toBe(500_000);
  });

  it('課税価格400万+1円: 20%−30万、連続で50万', () => {
    const r = annualGiftTax({ giftAmount: 5_100_001, giftType: 'special' });
    expect(r.rate).toBe(0.2);
    expect(r.tax).toBe(500_000);
  });

  // --- 第3区分 (600万以下 20% 控除30万) ---
  it('課税価格600万ちょうど: 20%−30万 = 90万', () => {
    expect(annualGiftTax({ giftAmount: 7_100_000, giftType: 'special' }).tax).toBe(900_000);
  });

  it('課税価格600万+1円: 30%−90万、連続で90万', () => {
    const r = annualGiftTax({ giftAmount: 7_100_001, giftType: 'special' });
    expect(r.rate).toBe(0.3);
    expect(r.tax).toBe(900_000);
  });

  // --- 第4区分 (1,000万以下 30% 控除90万) ---
  it('課税価格1,000万ちょうど: 30%−90万 = 210万', () => {
    expect(annualGiftTax({ giftAmount: 11_100_000, giftType: 'special' }).tax).toBe(2_100_000);
  });

  it('課税価格1,000万+1円: 40%−190万、連続で210万', () => {
    const r = annualGiftTax({ giftAmount: 11_100_001, giftType: 'special' });
    expect(r.rate).toBe(0.4);
    expect(r.tax).toBe(2_100_000);
  });

  // --- 第5区分 (1,500万以下 40% 控除190万) ---
  it('課税価格1,500万ちょうど: 40%−190万 = 410万', () => {
    expect(annualGiftTax({ giftAmount: 16_100_000, giftType: 'special' }).tax).toBe(4_100_000);
  });

  it('課税価格1,500万+1円: 45%−265万、連続で410万', () => {
    const r = annualGiftTax({ giftAmount: 16_100_001, giftType: 'special' });
    expect(r.rate).toBe(0.45);
    expect(r.tax).toBe(4_100_000);
  });

  // --- 第6区分 (3,000万以下 45% 控除265万) ---
  it('課税価格3,000万ちょうど: 45%−265万 = 1,085万', () => {
    expect(annualGiftTax({ giftAmount: 31_100_000, giftType: 'special' }).tax).toBe(10_850_000);
  });

  it('課税価格3,000万+1円: 50%−415万、連続で1,085万', () => {
    const r = annualGiftTax({ giftAmount: 31_100_001, giftType: 'special' });
    expect(r.rate).toBe(0.5);
    expect(r.tax).toBe(10_850_000);
  });

  // --- 第7区分 (4,500万以下 50% 控除415万) ---
  it('課税価格4,500万ちょうど: 50%−415万 = 1,835万', () => {
    expect(annualGiftTax({ giftAmount: 46_100_000, giftType: 'special' }).tax).toBe(18_350_000);
  });

  it('課税価格4,500万+1円: 55%−640万、連続で1,835万', () => {
    const r = annualGiftTax({ giftAmount: 46_100_001, giftType: 'special' });
    expect(r.rate).toBe(0.55);
    expect(r.tax).toBe(18_350_000);
  });

  // --- 第8区分 (4,500万超 55% 控除640万) ---
  it('課税価格5,000万 (最上位区分): 55%−640万 = 2,110万', () => {
    const r = annualGiftTax({ giftAmount: 51_100_000, giftType: 'special' });
    expect(r.rate).toBe(0.55);
    expect(r.tax).toBe(21_100_000);
  });
});

describe('annualGiftTax (暦年課税) — 100円未満切捨', () => {
  it('一般・課税価格2,000,055 → 200,008.25 → round 200,008 → floor100 = 200,000', () => {
    // 贈与額 = 110万 + 2,000,055 = 3,100,055。課税価格は第2区分 (300万以下 15%−10万)。
    const r = annualGiftTax({ giftAmount: 3_100_055, giftType: 'general' });
    expect(r.taxableAmount).toBe(2_000_055);
    expect(r.tax).toBe(200_000);
  });
});

describe('annualGiftTax (暦年課税) — エラーパス', () => {
  it('giftAmount 負値は throw (ラベル giftAmount)', () => {
    expect(() => annualGiftTax({ giftAmount: -1, giftType: 'general' })).toThrow(
      /giftAmount must be a finite number >= 0/,
    );
  });

  it('giftAmount NaN は throw (ラベル giftAmount)', () => {
    expect(() => annualGiftTax({ giftAmount: NaN, giftType: 'general' })).toThrow(
      /giftAmount must be a finite number >= 0/,
    );
  });

  it('giftAmount Infinity は throw (ラベル giftAmount)', () => {
    expect(() => annualGiftTax({ giftAmount: Infinity, giftType: 'general' })).toThrow(
      /giftAmount must be a finite number >= 0/,
    );
  });

  it('giftType ホワイトリスト外は throw', () => {
    expect(() =>
      // @ts-expect-error 不正な giftType を意図的に渡す
      annualGiftTax({ giftAmount: 3_100_000, giftType: 'invalid' }),
    ).toThrow(/giftType must be one of general \| special/);
  });
});

describe('settlementGiftTax (相続時精算課税)', () => {
  it('定数: 特別控除は2,500万円', () => {
    expect(SETTLEMENT_SPECIAL_DEDUCTION).toBe(25_000_000);
  });

  it('定数: 超過部分の税率は20%', () => {
    expect(SETTLEMENT_TAX_RATE).toBe(0.2);
  });

  it('贈与110万ちょうど: 年110万基礎控除で課税価格0・税0', () => {
    expect(settlementGiftTax({ giftAmount: 1_100_000 })).toEqual({
      taxableAmount: 0,
      tax: 0,
    });
  });

  it('贈与110万+1円: 課税価格1円・特別控除内で税0', () => {
    const r = settlementGiftTax({ giftAmount: 1_100_001 });
    expect(r.taxableAmount).toBe(1);
    expect(r.tax).toBe(0);
  });

  it('贈与2,610万: 課税価格2,500万ちょうど (特別控除使い切り)・税0', () => {
    const r = settlementGiftTax({ giftAmount: 26_100_000 });
    expect(r.taxableAmount).toBe(25_000_000);
    expect(r.tax).toBe(0);
  });

  it('贈与3,610万: 課税価格3,500万・特別控除超過1,000万×20% = 200万', () => {
    const r = settlementGiftTax({ giftAmount: 36_100_000 });
    expect(r.taxableAmount).toBe(35_000_000);
    expect(r.tax).toBe(2_000_000);
  });

  it('累計: 過去2,500万使い切り済み + 本年1,110万 → 課税価格1,000万全額が超過 → 200万', () => {
    const r = settlementGiftTax({
      giftAmount: 11_100_000,
      cumulativePriorGifts: 25_000_000,
    });
    expect(r.taxableAmount).toBe(10_000_000);
    expect(r.tax).toBe(2_000_000);
  });

  it('累計: 過去既に特別控除超過 (累計3,000万) + 本年1,110万 → 本年負担分は課税価格1,000万のみ → 200万', () => {
    // 過去 priorOver = 3,000万 − 2,500万 = 500万、合算 totalOver = (3,000万+1,000万)−2,500万 = 1,500万。
    // 本年負担 = 1,500万 − 500万 = 1,000万 → 200万。本年分だけが課税される (過去分の二重課税なし)。
    const r = settlementGiftTax({
      giftAmount: 11_100_000,
      cumulativePriorGifts: 30_000_000,
    });
    expect(r.taxableAmount).toBe(10_000_000);
    expect(r.tax).toBe(2_000_000);
  });

  it('累計: 過去2,000万 + 本年1,110万 (課税価格1,000万) → 超過500万×20% = 100万', () => {
    const r = settlementGiftTax({
      giftAmount: 11_100_000,
      cumulativePriorGifts: 20_000_000,
    });
    expect(r.taxableAmount).toBe(10_000_000);
    expect(r.tax).toBe(1_000_000);
  });

  it('cumulativePriorGifts 既定は0 (省略時は累計なし)', () => {
    // 課税価格3,500万・累計なし → 超過1,000万 → 200万。上の3,610万例と同値であることで既定0を pin。
    expect(settlementGiftTax({ giftAmount: 36_100_000 }).tax).toBe(2_000_000);
  });

  it('100円未満切捨: 過去2,500万 + 本年(110万+1,000,003) → 超過1,000,003×20% = 200,000.6 → round 200,001 → floor100 = 200,000', () => {
    const r = settlementGiftTax({
      giftAmount: 1_100_000 + 1_000_003,
      cumulativePriorGifts: 25_000_000,
    });
    expect(r.taxableAmount).toBe(1_000_003);
    expect(r.tax).toBe(200_000);
  });

  it('giftAmount 負値は throw (ラベル giftAmount)', () => {
    expect(() => settlementGiftTax({ giftAmount: -1 })).toThrow(
      /giftAmount must be a finite number >= 0/,
    );
  });

  it('giftAmount NaN は throw (ラベル giftAmount)', () => {
    expect(() => settlementGiftTax({ giftAmount: NaN })).toThrow(
      /giftAmount must be a finite number >= 0/,
    );
  });

  it('giftAmount Infinity は throw (ラベル giftAmount)', () => {
    expect(() => settlementGiftTax({ giftAmount: Infinity })).toThrow(
      /giftAmount must be a finite number >= 0/,
    );
  });

  it('cumulativePriorGifts 負値は throw (ラベル cumulativePriorGifts)', () => {
    expect(() =>
      settlementGiftTax({ giftAmount: 11_100_000, cumulativePriorGifts: -1 }),
    ).toThrow(/cumulativePriorGifts must be a finite number >= 0/);
  });

  it('cumulativePriorGifts 非有限は throw (ラベル cumulativePriorGifts)', () => {
    expect(() =>
      settlementGiftTax({ giftAmount: 11_100_000, cumulativePriorGifts: Infinity }),
    ).toThrow(/cumulativePriorGifts must be a finite number >= 0/);
  });
});
