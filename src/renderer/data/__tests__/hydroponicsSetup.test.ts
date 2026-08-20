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
  lowPotassiumFromSetup,
  type HydroponicsSetup,
} from '../hydroponicsSetup';
import {
  HYDROPONIC_CROPS,
  ENERGY_INTENSITY_KWH_PER_KG_LOW,
  ENERGY_INTENSITY_KWH_PER_KG_HIGH,
  LOW_K_SWITCH_DAYS_MIN,
  LOW_K_SWITCH_DAYS_MAX,
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

  /** 設備・費用の欄。0 だと計算が壊れるので初期値は必ず正。 */
  const NUMERIC_SETUP_KEYS = [
    'floorAreaSqm', 'tiers', 'usableRatioPct', 'yieldRatePct', 'unitPriceYen',
    'electricityYenPerKwh', 'energyIntensityKwhPerKg', 'seedYenPerPlant',
    'nutrientYenPerPlant', 'packagingYenPerPlant', 'laborYenPerMonth',
    'depreciationYenPerMonth', 'rentYenPerMonth', 'otherFixedYenPerMonth',
  ] as const;

  it('設備・費用の初期値は全項目が正の数 (空欄のまま保存しても 0 除算にしない)', () => {
    for (const key of NUMERIC_SETUP_KEYS) {
      const v = HYDROPONICS_DEFAULTS[key];
      expect(typeof v, key).toBe('number');
      expect(v as number, key).toBeGreaterThan(0);
    }
  });

  it('実測値の初期値は 0 = 未測定 (埋めやすさのための置き値を入れない)', () => {
    // ここだけ他と逆にしてある。置き値がそのまま「測った」ことにされると、
    // カリウムを排泄できない方の食事に直接影響する。
    expect(HYDROPONICS_DEFAULTS.measuredPotassiumMgPer100g).toBe(0);
    expect(HYDROPONICS_DEFAULTS.measuredSodiumMgPer100g).toBe(0);
    // 低カリウム栽培は既定で「扱わない」。名乗るのは利用者が選んだときだけ。
    expect(HYDROPONICS_DEFAULTS.lowPotassium).toBe(false);
  });

  it('切替日数の初期値は目安の範囲内', () => {
    const d = HYDROPONICS_DEFAULTS.switchDaysBeforeHarvest!;
    expect(d).toBeGreaterThanOrEqual(LOW_K_SWITCH_DAYS_MIN);
    expect(d).toBeLessThanOrEqual(LOW_K_SWITCH_DAYS_MAX);
  });

  it('設備・費用の欄を数え漏らしていない (項目が増えたら気付く)', () => {
    const lowKKeys = ['lowPotassium', 'switchDaysBeforeHarvest', 'measuredPotassiumMgPer100g', 'measuredSodiumMgPer100g'];
    const counted = new Set<string>([...NUMERIC_SETUP_KEYS, 'cropId', ...lowKKeys]);
    expect(Object.keys(HYDROPONICS_DEFAULTS).filter((k) => !counted.has(k))).toEqual([]);
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

describe('lowPotassiumFromSetup — 低カリウム栽培の橋渡し', () => {
  const withLowK: HydroponicsSetup = {
    ...SETUP,
    lowPotassium: true,
    switchDaysBeforeHarvest: 8,
    measuredPotassiumMgPer100g: 89,
    measuredSodiumMgPer100g: 100,
  };

  it('未入力なら null', () => {
    expect(lowPotassiumFromSetup(null)).toBeNull();
  });

  it('低カリウムとして扱っていなければ null', () => {
    expect(lowPotassiumFromSetup({ ...withLowK, lowPotassium: false })).toBeNull();
    expect(lowPotassiumFromSetup({ ...withLowK, lowPotassium: undefined })).toBeNull();
    // true 以外は扱わない (真値らしきものを通さない)
    expect(lowPotassiumFromSetup({ ...withLowK, lowPotassium: 1 as unknown as boolean })).toBeNull();
  });

  it('実測値をそのまま評価へ渡す', () => {
    const a = lowPotassiumFromSetup(withLowK)!;
    expect(a.measured).toBe(true);
    expect(a.potassiumMgPer100g).toBe(89);
    expect(a.switchWindowOk).toBe(true);
    // Na 100mg → 食塩相当量 0.25g
    expect(a.saltEquivalentGPer100g).toBe(0.25);
  });

  it('ナトリウム 0 は「未測定」として扱う (0mg の野菜は無い)', () => {
    expect(lowPotassiumFromSetup({ ...withLowK, measuredSodiumMgPer100g: 0 })!.saltEquivalentGPer100g).toBeNull();
    expect(lowPotassiumFromSetup({ ...withLowK, measuredSodiumMgPer100g: undefined })!.saltEquivalentGPer100g).toBeNull();
  });

  it('カリウム未測定なら measured は false のまま (節は出すが名乗らせない)', () => {
    expect(lowPotassiumFromSetup({ ...withLowK, measuredPotassiumMgPer100g: 0 })!.measured).toBe(false);
    expect(lowPotassiumFromSetup({ ...withLowK, measuredPotassiumMgPer100g: undefined })!.measured).toBe(false);
  });

  it('切替日数が未指定なら範囲外として扱う (既定で「合っている」ことにしない)', () => {
    expect(lowPotassiumFromSetup({ ...withLowK, switchDaysBeforeHarvest: undefined })!.switchWindowOk).toBe(false);
    expect(lowPotassiumFromSetup({ ...withLowK, switchDaysBeforeHarvest: 20 })!.switchWindowOk).toBe(false);
  });
});
