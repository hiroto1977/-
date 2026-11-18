import { describe, expect, it } from 'vitest';
import {
  BEEKEEPING_NOTICE,
  BEE_PRODUCT_FIELDS,
  BEE_PRODUCT_SPEC,
  DEFAULT_BEE_PRODUCTS,
  estimateBeekeeping,
  type BeeProduct,
} from '../beekeeping';
import { addFarmItem, farmItemIssues, removeFarmItem, sanitizeFarmList } from '../farmProductList';

/**
 * 養蜂 —— 産物の一覧の決まりと、年間の収支の概算 (2026-11-18)。
 */
const HONEY: BeeProduct = { id: 'h', label: 'はちみつ', yieldPerHiveKg: 10, pricePerKgYen: 5000 };
const WAX: BeeProduct = { id: 'w', label: '蜜蝋', yieldPerHiveKg: 0.3, pricePerKgYen: 3000 };

describe('産物の一覧の決まり', () => {
  it('参考の産物は 3 件で、どれも自分の決まりを通る', () => {
    expect(DEFAULT_BEE_PRODUCTS.map((p) => p.id)).toEqual(['honey-multifloral', 'honey-acacia', 'beeswax']);
    for (const p of DEFAULT_BEE_PRODUCTS) expect(farmItemIssues(BEE_PRODUCT_SPEC, p)).toEqual([]);
    expect(sanitizeFarmList(BEE_PRODUCT_SPEC, DEFAULT_BEE_PRODUCTS)).toEqual(DEFAULT_BEE_PRODUCTS);
  });

  it('参考の一覧は書き換えられない (凍結)', () => {
    expect(Object.isFrozen(DEFAULT_BEE_PRODUCTS)).toBe(true);
  });

  it('決まりは参考の一覧・欄の並び・呼び名を名乗る', () => {
    expect(BEE_PRODUCT_SPEC.builtins).toBe(DEFAULT_BEE_PRODUCTS);
    expect(BEE_PRODUCT_SPEC.numericFields).toBe(BEE_PRODUCT_FIELDS);
    expect(BEE_PRODUCT_FIELDS).toEqual(['yieldPerHiveKg', 'pricePerKgYen']);
    expect(BEE_PRODUCT_SPEC.noun).toBe('産物');
    expect(BEE_PRODUCT_SPEC.orders).toEqual([]);
    expect(BEE_PRODUCT_SPEC.labels).toEqual({
      yieldPerHiveKg: '1 群あたりの年間採取量 (kg)',
      pricePerKgYen: '単価 (円/kg)',
    });
  });

  it('範囲の端: 採取量 0.01〜500 kg・単価 1〜1,000,000 円', () => {
    const at = (over: Partial<BeeProduct>): string[] => farmItemIssues(BEE_PRODUCT_SPEC, { ...HONEY, ...over });
    expect(at({ yieldPerHiveKg: 0.01 })).toEqual([]);
    expect(at({ yieldPerHiveKg: 500 })).toEqual([]);
    expect(at({ yieldPerHiveKg: 0.009 })).toEqual(['1 群あたりの年間採取量 (kg) は 0.01〜500 の数値で入力してください']);
    expect(at({ yieldPerHiveKg: 500.1 })).toEqual(['1 群あたりの年間採取量 (kg) は 0.01〜500 の数値で入力してください']);
    expect(at({ pricePerKgYen: 1 })).toEqual([]);
    expect(at({ pricePerKgYen: 1_000_000 })).toEqual([]);
    expect(at({ pricePerKgYen: 0.5 })).toEqual(['単価 (円/kg) は 1〜1000000 の数値で入力してください']);
    expect(at({ pricePerKgYen: 1_000_001 })).toEqual(['単価 (円/kg) は 1〜1000000 の数値で入力してください']);
  });

  it('産物を足して消せる (最後の 1 件は消せない)', () => {
    const added = addFarmItem(BEE_PRODUCT_SPEC, DEFAULT_BEE_PRODUCTS, { label: 'ローヤルゼリー', yieldPerHiveKg: 0.2, pricePerKgYen: 50000 });
    expect(added.ok && added.items.map((p) => p.label)).toEqual(['百花蜜', 'アカシア蜜', '蜜蝋', 'ローヤルゼリー']);
    expect(added.ok && added.items[3]).toEqual({ id: 'custom-1', label: 'ローヤルゼリー', yieldPerHiveKg: 0.2, pricePerKgYen: 50000 });
    const removed = removeFarmItem(BEE_PRODUCT_SPEC, DEFAULT_BEE_PRODUCTS, 'beeswax');
    expect(removed.ok && removed.items.map((p) => p.id)).toEqual(['honey-multifloral', 'honey-acacia']);
    expect(removeFarmItem(BEE_PRODUCT_SPEC, [HONEY], 'h')).toMatchObject({ ok: false, refusal: 'last-item' });
  });
});

describe('estimateBeekeeping — 年間の収支の概算', () => {
  it('産物ごとに 群数 × 採取量 × 単価 を出し、全部を合算する', () => {
    const e = estimateBeekeeping({ hives: 10, costPerHiveYen: 15_000, fixedCostYen: 200_000 }, [HONEY, WAX]);
    expect(e.rows).toEqual([
      { id: 'h', label: 'はちみつ', volumeKg: 100, revenueYen: 500_000 },
      { id: 'w', label: '蜜蝋', volumeKg: 3, revenueYen: 9_000 },
    ]);
    expect(e.revenueYen).toBe(509_000);
    expect(e.costYen).toBe(350_000);
    expect(e.profitYen).toBe(159_000);
  });

  it('費用が売上を超えれば差引は負 (赤字を 0 に倒さない)', () => {
    const e = estimateBeekeeping({ hives: 1, costPerHiveYen: 15_000, fixedCostYen: 200_000 }, [HONEY]);
    expect(e.revenueYen).toBe(50_000);
    expect(e.costYen).toBe(215_000);
    expect(e.profitYen).toBe(-165_000);
  });

  it('量は 0.1 kg まで、金額は円に丸める (丸める前の量で売上を出す)', () => {
    const e = estimateBeekeeping(
      { hives: 3, costPerHiveYen: 0.4, fixedCostYen: 0.4 },
      [{ id: 'x', label: 'x', yieldPerHiveKg: 0.55, pricePerKgYen: 333 }],
    );
    // 3 × 0.55 = 1.65 kg → 1.7 kg (0.1 kg まで)。売上は 1.65 × 333 = 549.45 → 549 円。
    expect(e.rows[0]).toEqual({ id: 'x', label: 'x', volumeKg: 1.7, revenueYen: 549 });
    // 費用: 3 × 0.4 + 0.4 = 1.6 → 2 円 (足してから丸める)。
    expect(e.costYen).toBe(2);
  });

  it('産物が 0 件なら売上は 0 で、費用だけが残る', () => {
    const e = estimateBeekeeping({ hives: 2, costPerHiveYen: 100, fixedCostYen: 50 }, []);
    expect(e).toEqual({ rows: [], revenueYen: 0, costYen: 250, profitYen: -250 });
  });

  it.each([
    ['負の群数', { hives: -5, costPerHiveYen: 100, fixedCostYen: 50 }, 0, 50],
    ['NaN の群数', { hives: Number.NaN, costPerHiveYen: 100, fixedCostYen: 50 }, 0, 50],
    ['負の費用', { hives: 2, costPerHiveYen: -100, fixedCostYen: -50 }, 100_000, 0],
    ['非有限の固定費', { hives: 2, costPerHiveYen: 100, fixedCostYen: Number.POSITIVE_INFINITY }, 100_000, 200],
  ])('%s は 0 として扱う (床)', (_n, plan, revenue, cost) => {
    const e = estimateBeekeeping(plan, [HONEY]);
    expect(e.revenueYen).toBe(revenue);
    expect(e.costYen).toBe(cost);
    expect(e.profitYen).toBe(revenue - cost);
  });

  it('産物の値が壊れていても非有限を出さない (床)', () => {
    const e = estimateBeekeeping(
      { hives: 2, costPerHiveYen: 0, fixedCostYen: 0 },
      [{ id: 'b', label: 'b', yieldPerHiveKg: Number.NaN, pricePerKgYen: 100 }, { id: 'c', label: 'c', yieldPerHiveKg: 5, pricePerKgYen: -1 }],
    );
    expect(e.rows.map((r) => [r.volumeKg, r.revenueYen])).toEqual([[0, 0], [10, 0]]);
    expect(e.revenueYen).toBe(0);
  });
});

describe('届出の案内', () => {
  it('法律の名前と、確かめる窓口を名乗る (要否は判定しない)', () => {
    expect(BEEKEEPING_NOTICE).toBe(
      '蜜蜂を飼うときは、養蜂振興法にもとづく都道府県への飼育届が要ります (趣味で飼う場合も対象になることがあります)。' +
        '巣箱を置く場所や時期の決まりは都道府県ごとに違うので、始める前に都道府県の畜産の窓口で確かめてください。',
    );
  });
});
