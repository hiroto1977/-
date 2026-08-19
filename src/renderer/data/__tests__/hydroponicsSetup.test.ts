/**
 * 入力レコード → 試算 の橋渡しの検査。
 *
 * ここが壊れると、画面で入れた値と経営サマリーに出る数字がずれる。%
 * （画面の単位）と割合（モデルの単位）の変換が主な落とし穴。
 */
import { describe, expect, it } from 'vitest';
import {
  HYDROPONICS_COLLECTION,
  HYDROPONICS_DEFAULTS,
  resolveCrop,
  toFacilityInput,
  toCostInput,
  economicsFromSetup,
  type HydroponicsSetup,
} from '../hydroponicsSetup';
import {
  HYDROPONIC_CROPS,
  ENERGY_INTENSITY_KWH_PER_KG_LOW,
  ENERGY_INTENSITY_KWH_PER_KG_HIGH,
} from '../../../shared/hydroponics';

const SETUP: HydroponicsSetup = {
  ...HYDROPONICS_DEFAULTS,
  floorAreaSqm: 100,
  tiers: 5,
  usableRatioPct: 100,
  yieldRatePct: 80,
  cropId: 'leaf-lettuce',
};

describe('コレクション名と初期値', () => {
  it('コレクション名は固定 (変わると保存済みの入力が読めなくなる)', () => {
    expect(HYDROPONICS_COLLECTION).toBe('hydroponics-setup');
  });

  it('電力原単位の初期値は参考幅のちょうど中央', () => {
    expect(HYDROPONICS_DEFAULTS.energyIntensityKwhPerKg).toBe(
      (ENERGY_INTENSITY_KWH_PER_KG_LOW + ENERGY_INTENSITY_KWH_PER_KG_HIGH) / 2,
    );
    expect(HYDROPONICS_DEFAULTS.energyIntensityKwhPerKg).toBe(15);
  });

  it('初期値は全項目が正の数 (空欄のまま保存しても 0 除算にしない)', () => {
    for (const [key, v] of Object.entries(HYDROPONICS_DEFAULTS)) {
      if (key === 'cropId') continue;
      expect(typeof v).toBe('number');
      expect(v as number).toBeGreaterThan(0);
    }
  });
});

describe('resolveCrop', () => {
  it('既知の id はそのまま返す', () => {
    for (const id of Object.keys(HYDROPONIC_CROPS)) {
      expect(resolveCrop(id)).toBe(id);
    }
  });

  it('壊れた値はリーフレタスに寄せる (落とさない)', () => {
    expect(resolveCrop('存在しない品目')).toBe('leaf-lettuce');
    expect(resolveCrop(undefined)).toBe('leaf-lettuce');
    expect(resolveCrop(null)).toBe('leaf-lettuce');
    expect(resolveCrop(42)).toBe('leaf-lettuce');
    expect(resolveCrop({})).toBe('leaf-lettuce');
  });
});

describe('% から割合への変換', () => {
  it('有効率と歩留まりは 100 で割って渡す', () => {
    const f = toFacilityInput({ ...SETUP, usableRatioPct: 70, yieldRatePct: 85 });
    expect(f.usableRatio).toBeCloseTo(0.7, 10);
    expect(f.yieldRate).toBeCloseTo(0.85, 10);
  });

  it('品目は参考値の実体を渡す', () => {
    expect(toFacilityInput(SETUP).crop).toBe(HYDROPONIC_CROPS['leaf-lettuce']);
    expect(toFacilityInput({ ...SETUP, cropId: 'basil' }).crop).toBe(HYDROPONIC_CROPS.basil);
  });

  it('費用はそのまま渡す (単位変換なし)', () => {
    const c = toCostInput({ ...SETUP, unitPriceYen: 180, laborYenPerMonth: 1_234_567 });
    expect(c.unitPriceYen).toBe(180);
    expect(c.laborYenPerMonth).toBe(1_234_567);
  });
});

describe('economicsFromSetup', () => {
  it('未入力なら null (経営サマリーに節を出さない)', () => {
    expect(economicsFromSetup(null)).toBeNull();
  });

  it('入力から試算を組む', () => {
    // リーフレタス: パネル 8 穴 ÷ 0.54 = 14.81 株/m²、定植後 10 日 → 36.5 回転
    // 栽培面積 100 × 5 × 1.0 = 500 m² → 在圃 7,407 株
    const e = economicsFromSetup(SETUP);
    expect(e).not.toBeNull();
    expect(e!.production.cultivationAreaSqm).toBe(500);
    expect(e!.production.standingPlants).toBe(7_407);
    expect(e!.production.cyclesPerYear).toBe(36.5);
    // 7,407 × 36.5 = 270,355.5 → 270,355 株、× 0.8 = 216,284 株
    expect(e!.production.potentialPlantsPerYear).toBe(270_355);
    expect(e!.production.shippedPlantsPerYear).toBe(216_284);
  });

  it('歩留まりを下げると売上だけ下がり、電力量は変わらない', () => {
    const full = economicsFromSetup({ ...SETUP, yieldRatePct: 100 })!;
    const half = economicsFromSetup({ ...SETUP, yieldRatePct: 50 })!;
    expect(half.energyKwhPerYear).toBe(full.energyKwhPerYear);
    expect(half.electricityYenPerYear).toBe(full.electricityYenPerYear);
    expect(half.monthly.revenue).toBeLessThan(full.monthly.revenue);
    // 販管費（電気代を含む）は変わらない
    expect(half.monthly.sga).toBe(full.monthly.sga);
  });

  it('品目を変えると回転数と重量が変わる', () => {
    const lettuce = economicsFromSetup({ ...SETUP, cropId: 'leaf-lettuce' })!;
    const basil = economicsFromSetup({ ...SETUP, cropId: 'basil' })!;
    // バジルは定植後 18 日なので回転が遅い
    expect(basil.production.cyclesPerYear).toBeLessThan(lettuce.production.cyclesPerYear);
    expect(basil.production.shippedPlantsPerYear).toBeLessThan(lettuce.production.shippedPlantsPerYear);
  });
});
