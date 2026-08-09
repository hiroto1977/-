import { describe, expect, it } from 'vitest';
import {
  DEEMED_PURCHASE_RATES,
  TWENTY_PERCENT_RATE,
  type SimplifiedBusinessType,
} from '../taxConsumption';
import { calcSimplifiedTax, calcTwentyPercentTax } from '../taxConsumptionBusiness';

/**
 * 納付税額の算定そのものは `taxConsumptionBusiness.test.ts` が見る。
 * ここは法定の率と事業区分だけを固定する — 率を 1 つ書き間違えると、
 * 計算式が正しくても納付額が丸ごとずれる。
 */
describe('簡易課税のみなし仕入率', () => {
  it('6 区分すべての率が法定どおり', () => {
    expect(DEEMED_PURCHASE_RATES).toEqual({
      wholesale: 0.9,      // 第1種 卸売業
      retail: 0.8,         // 第2種 小売業・飲食料品の譲渡
      manufacturing: 0.7,  // 第3種 製造業・建設業・農林漁業
      other: 0.6,          // 第4種 その他（飲食店業等）
      service: 0.5,        // 第5種 サービス業・金融保険業
      'real-estate': 0.4,  // 第6種 不動産業
    });
  });

  it('区分は 6 つで、増減があれば気づく', () => {
    expect(Object.keys(DEEMED_PURCHASE_RATES)).toHaveLength(6);
  });

  it('率がそのまま納付額に効く（区分ごとに実際の税額で確かめる）', () => {
    // 売上1,000万 × 10% = 100万の売上税額。納付は 100万 × (1 − みなし仕入率)。
    const paid = (type: SimplifiedBusinessType) =>
      calcSimplifiedTax([{ type, sales: { standard: 10_000_000, reduced: 0 } }]);
    expect(paid('wholesale')).toBe(100_000);
    expect(paid('retail')).toBe(200_000);
    expect(paid('manufacturing')).toBe(300_000);
    expect(paid('other')).toBe(400_000);
    expect(paid('service')).toBe(500_000);
    expect(paid('real-estate')).toBe(600_000);
  });
});

describe('2割特例の割合', () => {
  it('売上に係る消費税額の 20%', () => {
    expect(TWENTY_PERCENT_RATE).toBe(0.2);
    expect(calcTwentyPercentTax({ standard: 10_000_000, reduced: 0 })).toBe(200_000);
  });
});
