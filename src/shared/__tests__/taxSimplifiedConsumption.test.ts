import { describe, expect, it } from 'vitest';
import {
  chooseLowerBurden,
  DEFAULT_TAX_RATE,
  deemedPurchaseRate,
  simplifiedConsumptionTax,
  TWENTY_PERCENT_RATE,
  twentyPercentSpecialRule,
  type SimplifiedBusinessType,
} from '../taxSimplifiedConsumption';

describe('deemedPurchaseRate (みなし仕入率)', () => {
  it('第1種 卸売業 = 90%', () => {
    expect(deemedPurchaseRate(1)).toBe(0.9);
  });
  it('第2種 小売業 = 80%', () => {
    expect(deemedPurchaseRate(2)).toBe(0.8);
  });
  it('第3種 製造業等 = 70%', () => {
    expect(deemedPurchaseRate(3)).toBe(0.7);
  });
  it('第4種 その他 = 60%', () => {
    expect(deemedPurchaseRate(4)).toBe(0.6);
  });
  it('第5種 サービス業等 = 50%', () => {
    expect(deemedPurchaseRate(5)).toBe(0.5);
  });
  it('第6種 不動産業 = 40%', () => {
    expect(deemedPurchaseRate(6)).toBe(0.4);
  });

  it('ホワイトリスト外の事業区分は throw する (0)', () => {
    expect(() => deemedPurchaseRate(0 as SimplifiedBusinessType)).toThrow(
      '事業区分は 1〜6 で指定してください: 0',
    );
  });
  it('ホワイトリスト外の事業区分は throw する (7)', () => {
    expect(() => deemedPurchaseRate(7 as SimplifiedBusinessType)).toThrow(
      '事業区分は 1〜6 で指定してください: 7',
    );
  });
  it('非整数の事業区分も throw する', () => {
    expect(() => deemedPurchaseRate(2.5 as SimplifiedBusinessType)).toThrow(
      '事業区分は 1〜6 で指定してください: 2.5',
    );
  });
});

describe('DEFAULT_TAX_RATE / TWENTY_PERCENT_RATE 定数', () => {
  it('既定税率は 10%', () => {
    expect(DEFAULT_TAX_RATE).toBe(0.1);
  });
  it('2割特例の割合は 20%', () => {
    expect(TWENTY_PERCENT_RATE).toBe(0.2);
  });
});

describe('simplifiedConsumptionTax (簡易課税)', () => {
  it('第1種 卸売 90%: 1,000万円・税率10% → 売上税額100万・控除90万・納付10万', () => {
    expect(
      simplifiedConsumptionTax({ taxableSalesExcludingTax: 10_000_000, businessType: 1 }),
    ).toEqual({ salesTax: 1_000_000, deemedDeduction: 900_000, payable: 100_000 });
  });

  it('第2種 小売 80%: 1,000万円 → 控除80万・納付20万', () => {
    expect(
      simplifiedConsumptionTax({ taxableSalesExcludingTax: 10_000_000, businessType: 2 }),
    ).toEqual({ salesTax: 1_000_000, deemedDeduction: 800_000, payable: 200_000 });
  });

  it('第3種 製造業 70%: 1,000万円 → 控除70万・納付30万', () => {
    expect(
      simplifiedConsumptionTax({ taxableSalesExcludingTax: 10_000_000, businessType: 3 }),
    ).toEqual({ salesTax: 1_000_000, deemedDeduction: 700_000, payable: 300_000 });
  });

  it('第4種 その他 60%: 1,000万円 → 控除60万・納付40万', () => {
    expect(
      simplifiedConsumptionTax({ taxableSalesExcludingTax: 10_000_000, businessType: 4 }),
    ).toEqual({ salesTax: 1_000_000, deemedDeduction: 600_000, payable: 400_000 });
  });

  it('第5種 サービス 50%: 1,000万円 → 控除50万・納付50万', () => {
    expect(
      simplifiedConsumptionTax({ taxableSalesExcludingTax: 10_000_000, businessType: 5 }),
    ).toEqual({ salesTax: 1_000_000, deemedDeduction: 500_000, payable: 500_000 });
  });

  it('第6種 不動産 40%: 1,000万円 → 控除40万・納付60万', () => {
    expect(
      simplifiedConsumptionTax({ taxableSalesExcludingTax: 10_000_000, businessType: 6 }),
    ).toEqual({ salesTax: 1_000_000, deemedDeduction: 400_000, payable: 600_000 });
  });

  it('軽減税率 8% を明示指定できる (第2種 小売)', () => {
    // 売上税額 = floor(1,000万 × 0.08) = 80万、控除 = floor(80万 × 0.8) = 64万、納付 = 16万
    expect(
      simplifiedConsumptionTax({ taxableSalesExcludingTax: 10_000_000, businessType: 2, taxRate: 0.08 }),
    ).toEqual({ salesTax: 800_000, deemedDeduction: 640_000, payable: 160_000 });
  });

  it('売上税額は floor で円未満切捨て (端数あり売上)', () => {
    // 1,234,567 × 0.10 = 123,456.7 → floor 123,456
    // 第5種 50%: floor(123,456 × 0.5) = floor(61,728) = 61,728 → 納付 61,728
    expect(
      simplifiedConsumptionTax({ taxableSalesExcludingTax: 1_234_567, businessType: 5 }),
    ).toEqual({ salesTax: 123_456, deemedDeduction: 61_728, payable: 61_728 });
  });

  it('みなし控除も floor で円未満切捨て (奇数の売上税額)', () => {
    // 1,000,019 × 0.10 = 100,001.9 → floor 100,001 (奇数)
    // 第5種 50%: 100,001 × 0.5 = 50,000.5 → floor 50,000 → 納付 50,001
    expect(
      simplifiedConsumptionTax({ taxableSalesExcludingTax: 1_000_019, businessType: 5 }),
    ).toEqual({ salesTax: 100_001, deemedDeduction: 50_000, payable: 50_001 });
  });

  it('売上0円 → 全額0 (境界、throw しない)', () => {
    expect(
      simplifiedConsumptionTax({ taxableSalesExcludingTax: 0, businessType: 1 }),
    ).toEqual({ salesTax: 0, deemedDeduction: 0, payable: 0 });
  });

  it('税率100% (上限) を許容する', () => {
    // 売上税額 = floor(100 × 1) = 100、第6種 40%: floor(100 × 0.4)=40 → 納付60
    expect(
      simplifiedConsumptionTax({ taxableSalesExcludingTax: 100, businessType: 6, taxRate: 1 }),
    ).toEqual({ salesTax: 100, deemedDeduction: 40, payable: 60 });
  });

  it('売上が負数なら throw する', () => {
    expect(() =>
      simplifiedConsumptionTax({ taxableSalesExcludingTax: -1, businessType: 1 }),
    ).toThrow('課税売上 (税抜) は 0 以上の有限値で指定してください: -1');
  });

  it('売上が NaN なら throw する', () => {
    expect(() =>
      simplifiedConsumptionTax({ taxableSalesExcludingTax: NaN, businessType: 1 }),
    ).toThrow('課税売上 (税抜) は 0 以上の有限値で指定してください: NaN');
  });

  it('売上が Infinity なら throw する', () => {
    expect(() =>
      simplifiedConsumptionTax({ taxableSalesExcludingTax: Infinity, businessType: 1 }),
    ).toThrow('課税売上 (税抜) は 0 以上の有限値で指定してください: Infinity');
  });

  it('税率0 なら throw する (下限外)', () => {
    expect(() =>
      simplifiedConsumptionTax({ taxableSalesExcludingTax: 100, businessType: 1, taxRate: 0 }),
    ).toThrow('税率は 0 超 1 以下で指定してください: 0');
  });

  it('税率が負なら throw する', () => {
    expect(() =>
      simplifiedConsumptionTax({ taxableSalesExcludingTax: 100, businessType: 1, taxRate: -0.1 }),
    ).toThrow('税率は 0 超 1 以下で指定してください: -0.1');
  });

  it('税率が1超なら throw する (上限外)', () => {
    expect(() =>
      simplifiedConsumptionTax({ taxableSalesExcludingTax: 100, businessType: 1, taxRate: 1.1 }),
    ).toThrow('税率は 0 超 1 以下で指定してください: 1.1');
  });

  it('税率が NaN なら throw する', () => {
    expect(() =>
      simplifiedConsumptionTax({ taxableSalesExcludingTax: 100, businessType: 1, taxRate: NaN }),
    ).toThrow('税率は 0 超 1 以下で指定してください: NaN');
  });

  it('事業区分がホワイトリスト外なら throw する', () => {
    expect(() =>
      simplifiedConsumptionTax({ taxableSalesExcludingTax: 100, businessType: 9 as SimplifiedBusinessType }),
    ).toThrow('事業区分は 1〜6 で指定してください: 9');
  });
});

describe('twentyPercentSpecialRule (2割特例)', () => {
  it('1,000万円・税率10% → 売上税額100万・納付20万', () => {
    expect(twentyPercentSpecialRule({ taxableSalesExcludingTax: 10_000_000 })).toEqual({
      salesTax: 1_000_000,
      payable: 200_000,
    });
  });

  it('軽減税率 8% を明示指定できる', () => {
    // 売上税額 = floor(1,000万 × 0.08) = 80万、納付 = floor(80万 × 0.2) = 16万
    expect(
      twentyPercentSpecialRule({ taxableSalesExcludingTax: 10_000_000, taxRate: 0.08 }),
    ).toEqual({ salesTax: 800_000, payable: 160_000 });
  });

  it('納付は floor で円未満切捨て', () => {
    // 1,000,005 × 0.10 = 100,000.5 → floor 100,000、20% = 20,000 → 納付 20,000
    // 端数を作るため: 1,000,055 × 0.10 = 100,005.5 → floor 100,005、×0.2 = 20,001 → floor 20,001
    expect(twentyPercentSpecialRule({ taxableSalesExcludingTax: 1_000_055 })).toEqual({
      salesTax: 100_005,
      payable: 20_001,
    });
  });

  it('売上税額×20% の小数を floor する (5円単位の端数)', () => {
    // 売上税額を 5 の倍数+α にして ×0.2 が整数にならないケース
    // 1,000,003 × 0.10 = 100,000.3 → floor 100,000、×0.2 = 20,000 → 納付 20,000
    // ↑これは整数。端数になる例: salesTax=20,003 → ×0.2 = 4,000.6 → floor 4,000
    // 200,033 × 0.10 = 20,003.3 → floor 20,003、×0.2 = 4,000.6 → floor 4,000
    expect(twentyPercentSpecialRule({ taxableSalesExcludingTax: 200_033 })).toEqual({
      salesTax: 20_003,
      payable: 4_000,
    });
  });

  it('売上0円 → 全額0 (境界)', () => {
    expect(twentyPercentSpecialRule({ taxableSalesExcludingTax: 0 })).toEqual({
      salesTax: 0,
      payable: 0,
    });
  });

  it('売上が負数なら throw する', () => {
    expect(() => twentyPercentSpecialRule({ taxableSalesExcludingTax: -100 })).toThrow(
      '課税売上 (税抜) は 0 以上の有限値で指定してください: -100',
    );
  });

  it('税率が範囲外なら throw する', () => {
    expect(() =>
      twentyPercentSpecialRule({ taxableSalesExcludingTax: 100, taxRate: 2 }),
    ).toThrow('税率は 0 超 1 以下で指定してください: 2');
  });
});

describe('chooseLowerBurden (簡易課税 vs 2割特例 有利判定)', () => {
  it('卸売 (第1種 90%) は簡易課税が有利 (納付が少ない)', () => {
    // 簡易: 1,000万→売上税額100万・控除90万・納付10万
    // 2割特例: 売上税額100万・納付20万
    // 10万 < 20万 → 簡易課税
    const r = chooseLowerBurden({ taxableSalesExcludingTax: 10_000_000, businessType: 1 });
    expect(r).toEqual({
      method: '簡易課税',
      payable: 100_000,
      simplifiedPayable: 100_000,
      twentyPercentPayable: 200_000,
    });
  });

  it('サービス業 (第5種 50%) は2割特例が有利', () => {
    // 簡易: 控除50万・納付50万、2割特例: 納付20万 → 20万 < 50万 → 2割特例
    const r = chooseLowerBurden({ taxableSalesExcludingTax: 10_000_000, businessType: 5 });
    expect(r).toEqual({
      method: '2割特例',
      payable: 200_000,
      simplifiedPayable: 500_000,
      twentyPercentPayable: 200_000,
    });
  });

  it('不動産業 (第6種 40%) は2割特例が大幅に有利', () => {
    // 簡易: 控除40万・納付60万、2割特例: 納付20万 → 2割特例
    const r = chooseLowerBurden({ taxableSalesExcludingTax: 10_000_000, businessType: 6 });
    expect(r.method).toBe('2割特例');
    expect(r.payable).toBe(200_000);
  });

  it('第2種 小売 80% は簡易課税が有利 (納付20万 = 2割特例と同額 → 同額は簡易課税)', () => {
    // 簡易(第2種): 控除80万・納付20万、2割特例: 納付20万 → 同額 → 簡易課税を採用 (< の厳密比較)
    const r = chooseLowerBurden({ taxableSalesExcludingTax: 10_000_000, businessType: 2 });
    expect(r).toEqual({
      method: '簡易課税',
      payable: 200_000,
      simplifiedPayable: 200_000,
      twentyPercentPayable: 200_000,
    });
  });

  it('2割特例が1円でも少なければ2割特例を選ぶ (厳密 < の境界)', () => {
    // 第3種 70%: 売上税額100万・控除70万・納付30万、2割特例 20万 → 2割特例
    const r = chooseLowerBurden({ taxableSalesExcludingTax: 10_000_000, businessType: 3 });
    expect(r.method).toBe('2割特例');
    expect(r.twentyPercentPayable).toBeLessThan(r.simplifiedPayable);
  });

  it('税率8% でも有利判定が機能する (第1種 → 簡易課税)', () => {
    // 簡易(第1種 90%, 8%): 売上税額80万・控除72万・納付8万、2割特例: 80万×0.2=16万 → 簡易課税
    const r = chooseLowerBurden({ taxableSalesExcludingTax: 10_000_000, businessType: 1, taxRate: 0.08 });
    expect(r).toEqual({
      method: '簡易課税',
      payable: 80_000,
      simplifiedPayable: 80_000,
      twentyPercentPayable: 160_000,
    });
  });

  it('入力検証を委譲する (負の売上は throw)', () => {
    expect(() =>
      chooseLowerBurden({ taxableSalesExcludingTax: -1, businessType: 1 }),
    ).toThrow('課税売上 (税抜) は 0 以上の有限値で指定してください: -1');
  });
});
