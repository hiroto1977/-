import { describe, it, expect } from 'vitest';
import {
  inheritanceBasicDeduction,
  INHERITANCE_TAX_BRACKETS,
  inheritanceTaxOnShare,
  totalInheritanceTax,
  netTaxableEstate,
  estimateInheritanceTax,
  INHERITANCE_BASIC_DEDUCTION_FIXED,
  INHERITANCE_BASIC_DEDUCTION_PER_HEIR,
} from '../taxInheritance';

// 相続税の概算モジュールのテスト。実例は国税庁タックスアンサーの計算手順で pin。

describe('inheritanceBasicDeduction (基礎控除)', () => {
  it('法定相続人1人: 3,000万 + 600万×1 = 3,600万', () => {
    expect(inheritanceBasicDeduction(1)).toBe(36_000_000);
  });

  it('法定相続人3人: 3,000万 + 600万×3 = 4,800万', () => {
    expect(inheritanceBasicDeduction(3)).toBe(48_000_000);
  });

  it('法定相続人5人: 3,000万 + 600万×5 = 6,000万', () => {
    expect(inheritanceBasicDeduction(5)).toBe(60_000_000);
  });

  it('定数: 定額部分は3,000万円', () => {
    expect(INHERITANCE_BASIC_DEDUCTION_FIXED).toBe(30_000_000);
  });

  it('定数: 1人あたり加算は600万円', () => {
    expect(INHERITANCE_BASIC_DEDUCTION_PER_HEIR).toBe(6_000_000);
  });

  it('0人は throw', () => {
    expect(() => inheritanceBasicDeduction(0)).toThrow(/integer >= 1/);
  });

  it('負の人数は throw', () => {
    expect(() => inheritanceBasicDeduction(-1)).toThrow(/integer >= 1/);
  });

  it('非整数 (小数) は throw', () => {
    expect(() => inheritanceBasicDeduction(2.5)).toThrow(/integer >= 1/);
  });

  it('NaN は throw', () => {
    expect(() => inheritanceBasicDeduction(NaN)).toThrow(/integer >= 1/);
  });

  it('Infinity は throw', () => {
    expect(() => inheritanceBasicDeduction(Infinity)).toThrow(/integer >= 1/);
  });
});

describe('INHERITANCE_TAX_BRACKETS (速算表)', () => {
  it('8区分ある', () => {
    expect(INHERITANCE_TAX_BRACKETS).toHaveLength(8);
  });

  it('最後の区分は上限なし (Infinity) で55%・控除7,200万', () => {
    const last = INHERITANCE_TAX_BRACKETS[INHERITANCE_TAX_BRACKETS.length - 1];
    expect(last).toEqual({ upTo: Infinity, rate: 0.55, deduction: 72_000_000 });
  });

  it('全区分のスナップショット (速算表の全リテラルを pin)', () => {
    expect(INHERITANCE_TAX_BRACKETS).toEqual([
      { upTo: 10_000_000, rate: 0.1, deduction: 0 },
      { upTo: 30_000_000, rate: 0.15, deduction: 500_000 },
      { upTo: 50_000_000, rate: 0.2, deduction: 2_000_000 },
      { upTo: 100_000_000, rate: 0.3, deduction: 7_000_000 },
      { upTo: 200_000_000, rate: 0.4, deduction: 17_000_000 },
      { upTo: 300_000_000, rate: 0.45, deduction: 27_000_000 },
      { upTo: 600_000_000, rate: 0.5, deduction: 42_000_000 },
      { upTo: Infinity, rate: 0.55, deduction: 72_000_000 },
    ]);
  });
});

describe('inheritanceTaxOnShare (速算表の1人分)', () => {
  it('取得金額0は税額0', () => {
    expect(inheritanceTaxOnShare(0)).toBe(0);
  });

  // --- 第1区分 (1,000万円以下 10%) ---
  it('500万 (1区分内): 500万×10% = 50万', () => {
    expect(inheritanceTaxOnShare(5_000_000)).toBe(500_000);
  });

  it('1,000万ちょうど (1区分の上限): 10% = 100万', () => {
    expect(inheritanceTaxOnShare(10_000_000)).toBe(1_000_000);
  });

  it('1,000万+1円 (2区分へ): 15%−50万、境界で連続し100万', () => {
    expect(inheritanceTaxOnShare(10_000_001)).toBe(1_000_000);
  });

  // --- 第2区分 (3,000万円以下 15% 控除50万) ---
  it('3,000万ちょうど: 15%−50万 = 400万', () => {
    expect(inheritanceTaxOnShare(30_000_000)).toBe(4_000_000);
  });

  it('3,000万+1円: 20%−200万、連続で400万', () => {
    expect(inheritanceTaxOnShare(30_000_001)).toBe(4_000_000);
  });

  // --- 第3区分 (5,000万円以下 20% 控除200万) ---
  it('5,000万ちょうど: 20%−200万 = 800万', () => {
    expect(inheritanceTaxOnShare(50_000_000)).toBe(8_000_000);
  });

  it('5,000万+1円: 30%−700万、連続で800万', () => {
    expect(inheritanceTaxOnShare(50_000_001)).toBe(8_000_000);
  });

  // --- 第4区分 (1億円以下 30% 控除700万) ---
  it('1億ちょうど: 30%−700万 = 2,300万', () => {
    expect(inheritanceTaxOnShare(100_000_000)).toBe(23_000_000);
  });

  it('1億+1円: 40%−1,700万、連続で2,300万', () => {
    expect(inheritanceTaxOnShare(100_000_001)).toBe(23_000_000);
  });

  // --- 第5区分 (2億円以下 40% 控除1,700万) ---
  it('2億ちょうど: 40%−1,700万 = 6,300万', () => {
    expect(inheritanceTaxOnShare(200_000_000)).toBe(63_000_000);
  });

  it('2億+1円: 45%−2,700万、連続で6,300万', () => {
    expect(inheritanceTaxOnShare(200_000_001)).toBe(63_000_000);
  });

  // --- 第6区分 (3億円以下 45% 控除2,700万) ---
  it('3億ちょうど: 45%−2,700万 = 1億800万', () => {
    expect(inheritanceTaxOnShare(300_000_000)).toBe(108_000_000);
  });

  it('3億+1円: 50%−4,200万 = 1億800万0001円', () => {
    expect(inheritanceTaxOnShare(300_000_001)).toBe(108_000_001);
  });

  // --- 第7区分 (6億円以下 50% 控除4,200万) ---
  it('6億ちょうど: 50%−4,200万 = 2億5,800万', () => {
    expect(inheritanceTaxOnShare(600_000_000)).toBe(258_000_000);
  });

  it('6億+1円: 55%−7,200万 = 2億5,800万0001円', () => {
    expect(inheritanceTaxOnShare(600_000_001)).toBe(258_000_001);
  });

  // --- 第8区分 (6億円超 55% 控除7,200万) ---
  it('7億 (最上位区分): 55%−7,200万 = 3億1,300万', () => {
    expect(inheritanceTaxOnShare(700_000_000)).toBe(313_000_000);
  });

  it('負の取得金額は throw (ラベル taxableShare を含む)', () => {
    expect(() => inheritanceTaxOnShare(-1)).toThrow(
      /taxableShare must be a finite number >= 0/,
    );
  });

  it('NaN は throw (ラベル taxableShare を含む)', () => {
    expect(() => inheritanceTaxOnShare(NaN)).toThrow(
      /taxableShare must be a finite number >= 0/,
    );
  });

  it('Infinity は throw (ラベル taxableShare を含む)', () => {
    expect(() => inheritanceTaxOnShare(Infinity)).toThrow(
      /taxableShare must be a finite number >= 0/,
    );
  });
});

describe('netTaxableEstate (課税遺産総額・基礎控除後)', () => {
  it('課税価格1億・相続人3人: 1億 − 4,800万 = 5,200万', () => {
    expect(
      netTaxableEstate({ grossEstate: 100_000_000, legalHeirsCount: 3 }),
    ).toBe(52_000_000);
  });

  it('債務・葬式費用を控除: 1億 − 200万 − 100万 − 4,800万 = 4,900万', () => {
    expect(
      netTaxableEstate({
        grossEstate: 100_000_000,
        debts: 2_000_000,
        funeralExpenses: 1_000_000,
        legalHeirsCount: 3,
      }),
    ).toBe(49_000_000);
  });

  it('課税価格が基礎控除以下なら0 (負を底打ち)', () => {
    expect(
      netTaxableEstate({ grossEstate: 40_000_000, legalHeirsCount: 2 }),
    ).toBe(0);
  });

  it('基礎控除ちょうどで0', () => {
    // 相続人2人 → 基礎控除4,200万。課税価格4,200万 → 0。
    expect(
      netTaxableEstate({ grossEstate: 42_000_000, legalHeirsCount: 2 }),
    ).toBe(0);
  });

  it('債務・葬式費用の既定は0 (省略時は控除なし)', () => {
    expect(
      netTaxableEstate({ grossEstate: 100_000_000, legalHeirsCount: 1 }),
    ).toBe(64_000_000); // 1億 − 3,600万
  });

  it('grossEstate 負値は throw', () => {
    expect(() =>
      netTaxableEstate({ grossEstate: -1, legalHeirsCount: 1 }),
    ).toThrow(/grossEstate/);
  });

  it('grossEstate 非有限は throw', () => {
    expect(() =>
      netTaxableEstate({ grossEstate: Infinity, legalHeirsCount: 1 }),
    ).toThrow(/grossEstate/);
  });

  it('debts 負値は throw', () => {
    expect(() =>
      netTaxableEstate({ grossEstate: 100_000_000, debts: -1, legalHeirsCount: 1 }),
    ).toThrow(/debts/);
  });

  it('funeralExpenses 負値は throw', () => {
    expect(() =>
      netTaxableEstate({
        grossEstate: 100_000_000,
        funeralExpenses: -1,
        legalHeirsCount: 1,
      }),
    ).toThrow(/funeralExpenses/);
  });

  it('legalHeirsCount 0 は throw (基礎控除経由)', () => {
    expect(() =>
      netTaxableEstate({ grossEstate: 100_000_000, legalHeirsCount: 0 }),
    ).toThrow(/integer >= 1/);
  });
});

describe('totalInheritanceTax (相続税の総額・法定相続分課税方式)', () => {
  it('国税庁例: 課税遺産総額1億5,200万・配偶者1/2+子1/4×2 → 2,700万', () => {
    // 配偶者: 7,600万 → 30%−700万 = 1,580万
    // 子each: 3,800万 → 20%−200万 = 560万
    // 合計 = 1,580万 + 560万 + 560万 = 2,700万
    expect(
      totalInheritanceTax({
        taxableEstate: 152_000_000,
        legalShares: [0.5, 0.25, 0.25],
      }),
    ).toBe(27_000_000);
  });

  it('配偶者1/2+子1/2 (相続人2人)・課税遺産総額5,800万 → 770万', () => {
    // each 2,900万 → 15%−50万 = 385万。合計770万。
    expect(
      totalInheritanceTax({
        taxableEstate: 58_000_000,
        legalShares: [0.5, 0.5],
      }),
    ).toBe(7_700_000);
  });

  it('単独相続 (share 1.0): 速算表をそのまま適用', () => {
    expect(
      totalInheritanceTax({ taxableEstate: 50_000_000, legalShares: [1] }),
    ).toBe(8_000_000); // 5,000万 → 20%−200万 = 800万
  });

  it('100円未満切捨: 単独相続9,999,950 → 999,995 → 999,900', () => {
    expect(
      totalInheritanceTax({ taxableEstate: 9_999_950, legalShares: [1] }),
    ).toBe(999_900);
  });

  it('課税遺産総額0なら総額0', () => {
    expect(
      totalInheritanceTax({ taxableEstate: 0, legalShares: [0.5, 0.5] }),
    ).toBe(0);
  });

  it('taxableEstate 負値は throw', () => {
    expect(() =>
      totalInheritanceTax({ taxableEstate: -1, legalShares: [1] }),
    ).toThrow(/taxableEstate/);
  });

  it('taxableEstate 非有限は throw', () => {
    expect(() =>
      totalInheritanceTax({ taxableEstate: NaN, legalShares: [1] }),
    ).toThrow(/taxableEstate/);
  });

  it('legalShares 空配列は throw', () => {
    expect(() =>
      totalInheritanceTax({ taxableEstate: 50_000_000, legalShares: [] }),
    ).toThrow(/must not be empty/);
  });

  it('legalShares 合計≠1.0 は throw', () => {
    expect(() =>
      totalInheritanceTax({ taxableEstate: 50_000_000, legalShares: [0.5, 0.4] }),
    ).toThrow(/sum to 1.0/);
  });

  it('legalShares 合計>1.0 は throw', () => {
    expect(() =>
      totalInheritanceTax({ taxableEstate: 50_000_000, legalShares: [0.6, 0.6] }),
    ).toThrow(/sum to 1.0/);
  });

  it('legalShares 要素が負は legalShares element で throw (要素ガード)', () => {
    expect(() =>
      totalInheritanceTax({ taxableEstate: 50_000_000, legalShares: [-0.5, 1.5] }),
    ).toThrow(/legalShares element must be a finite number >= 0/);
  });

  it('legalShares 要素が非有限は legalShares element で throw (要素ガード)', () => {
    expect(() =>
      totalInheritanceTax({ taxableEstate: 50_000_000, legalShares: [NaN, 1] }),
    ).toThrow(/legalShares element must be a finite number >= 0/);
  });

  it('legalShares 要素0は許容 (取得なしの相続人。throw しない)', () => {
    // [0, 1] は合計1.0・要素は非負。要素ガードの `< 0` 境界 (0 は有効) を pin。
    expect(
      totalInheritanceTax({ taxableEstate: 50_000_000, legalShares: [0, 1] }),
    ).toBe(8_000_000); // 0円分=0 + 5,000万→800万
  });

  it('浮動小数の和の誤差は許容 (1/2+1/4+1/4 を分数で渡しても throw しない)', () => {
    expect(() =>
      totalInheritanceTax({
        taxableEstate: 152_000_000,
        legalShares: [1 / 2, 1 / 4, 1 / 4],
      }),
    ).not.toThrow();
  });
});

describe('estimateInheritanceTax (統合)', () => {
  it('課税価格1億・債務200万・葬式100万・配偶者1/2+子1/4×2', () => {
    const r = estimateInheritanceTax({
      grossEstate: 100_000_000,
      debts: 2_000_000,
      funeralExpenses: 1_000_000,
      legalShares: [0.5, 0.25, 0.25],
    });
    // 基礎控除 = 3,000万 + 600万×3 = 4,800万
    expect(r.basicDeduction).toBe(48_000_000);
    // 課税遺産総額 = (1億−200万−100万) − 4,800万 = 4,900万
    expect(r.taxableEstate).toBe(49_000_000);
    // 配偶者: 2,450万 → 15%−50万 = 317.5万、子each 1,225万 → 15%−50万 = 133.75万
    // 合計 = 3,175,000 + 1,337,500 + 1,337,500 = 5,850,000
    expect(r.totalTax).toBe(5_850_000);
  });

  it('国税庁標準例: 課税価格2億・配偶者1/2+子1/4×2 → 総額2,700万', () => {
    const r = estimateInheritanceTax({
      grossEstate: 200_000_000,
      legalShares: [0.5, 0.25, 0.25],
    });
    expect(r.basicDeduction).toBe(48_000_000);
    expect(r.taxableEstate).toBe(152_000_000);
    expect(r.totalTax).toBe(27_000_000);
  });

  it('課税価格が基礎控除以下なら課税遺産総額0・総額0', () => {
    const r = estimateInheritanceTax({
      grossEstate: 40_000_000,
      legalShares: [0.5, 0.5],
    });
    expect(r.basicDeduction).toBe(42_000_000); // 相続人2人
    expect(r.taxableEstate).toBe(0);
    expect(r.totalTax).toBe(0);
  });

  it('債務・葬式費用の既定は0 (単独相続)', () => {
    const r = estimateInheritanceTax({
      grossEstate: 100_000_000,
      legalShares: [1],
    });
    expect(r.basicDeduction).toBe(36_000_000); // 相続人1人
    expect(r.taxableEstate).toBe(64_000_000); // 1億 − 3,600万
    // 6,400万 → 30%−700万 = 1,220万
    expect(r.totalTax).toBe(12_200_000);
  });

  it('legalShares 空配列は throw', () => {
    expect(() =>
      estimateInheritanceTax({ grossEstate: 100_000_000, legalShares: [] }),
    ).toThrow(/must not be empty/);
  });

  it('legalShares 合計≠1.0 は throw', () => {
    expect(() =>
      estimateInheritanceTax({ grossEstate: 100_000_000, legalShares: [0.5, 0.4] }),
    ).toThrow(/sum to 1.0/);
  });

  it('legalShares 要素が負は throw', () => {
    expect(() =>
      estimateInheritanceTax({
        grossEstate: 100_000_000,
        legalShares: [-0.5, 1.5],
      }),
    ).toThrow(/legalShares element must be a finite number >= 0/);
  });

  it('grossEstate 負値は throw', () => {
    expect(() =>
      estimateInheritanceTax({ grossEstate: -1, legalShares: [1] }),
    ).toThrow(/grossEstate/);
  });

  it('debts 負値は throw', () => {
    expect(() =>
      estimateInheritanceTax({
        grossEstate: 100_000_000,
        debts: -1,
        legalShares: [1],
      }),
    ).toThrow(/debts/);
  });

  it('funeralExpenses 非有限は throw', () => {
    expect(() =>
      estimateInheritanceTax({
        grossEstate: 100_000_000,
        funeralExpenses: Infinity,
        legalShares: [1],
      }),
    ).toThrow(/funeralExpenses/);
  });
});
