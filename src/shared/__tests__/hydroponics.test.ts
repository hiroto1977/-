/**
 * 水耕栽培モデルの検査。
 *
 * 数値は手計算で置いている。割り切れる値を選んだ固定具 (`CLEAN_CROP`) で
 * 算術そのものを固定し、参考値 (`HYDROPONIC_CROPS`) は「出典どおりか」を別に見る。
 */
import { describe, expect, it } from 'vitest';
import {
  HYDROPONIC_CROPS,
  PANEL_AREA_SQM,
  DAYS_PER_YEAR,
  ENERGY_INTENSITY_KWH_PER_KG_LOW,
  ENERGY_INTENSITY_KWH_PER_KG_HIGH,
  checkNutrientSolution,
  estimateProduction,
  estimateEconomics,
  type HydroponicCrop,
  type FacilityInput,
  type CostInput,
} from '../hydroponics';

/** 割り切れる値だけで組んだ品目。株密度 27 / 0.54 = 50 株/m² ちょうど。 */
const CLEAN_CROP: HydroponicCrop = {
  id: 'leaf-lettuce',
  label: 'テスト用',
  nurseryDays: 20,
  growOutDays: 10,
  harvestWeightG: 100,
  ecLow: 1,
  ecHigh: 2,
  phLow: 5.5,
  phHigh: 6.5,
  plantsPerPanel: 27,
};

/** 床 100m² × 5 段 × 有効率 1.0、歩留まり 80%。日産 2,000 株ちょうどになる。 */
const CLEAN_FACILITY: FacilityInput = {
  floorAreaSqm: 100,
  tiers: 5,
  usableRatio: 1,
  crop: CLEAN_CROP,
  yieldRate: 0.8,
};

const CLEAN_COST: CostInput = {
  unitPriceYen: 100,
  electricityYenPerKwh: 20,
  energyIntensityKwhPerKg: 10,
  seedYenPerPlant: 3,
  nutrientYenPerPlant: 2,
  packagingYenPerPlant: 10,
  laborYenPerMonth: 3_000_000,
  depreciationYenPerMonth: 2_000_000,
  rentYenPerMonth: 500_000,
  otherFixedYenPerMonth: 300_000,
};

// --- 1. 育てる条件 --------------------------------------------------------

describe('品目の参考値', () => {
  it('リーフレタスは出典どおりの値を持つ', () => {
    // ALIC 野菜情報: 育苗棚まで 14 日 + 育苗 10 日 = 24 日、定植後 10 日、
    // 収穫 80〜90g/株、パネル (60cm×90cm) は 6〜8 穴。
    const lettuce = HYDROPONIC_CROPS['leaf-lettuce'];
    expect(lettuce.nurseryDays).toBe(24);
    expect(lettuce.growOutDays).toBe(10);
    expect(lettuce.harvestWeightG).toBeGreaterThanOrEqual(80);
    expect(lettuce.harvestWeightG).toBeLessThanOrEqual(90);
    expect(lettuce.plantsPerPanel).toBeGreaterThanOrEqual(6);
    expect(lettuce.plantsPerPanel).toBeLessThanOrEqual(8);
  });

  it('レタス類の養液は EC 0.8〜1.2 / pH 5.8〜6.3', () => {
    for (const id of ['leaf-lettuce', 'frill-lettuce'] as const) {
      const c = HYDROPONIC_CROPS[id];
      expect({ ecLow: c.ecLow, ecHigh: c.ecHigh }).toEqual({ ecLow: 0.8, ecHigh: 1.2 });
      expect({ phLow: c.phLow, phHigh: c.phHigh }).toEqual({ phLow: 5.8, phHigh: 6.3 });
    }
  });

  it('全品目が矛盾のない範囲を持つ (下限 <= 上限・日数と重量は正)', () => {
    for (const c of Object.values(HYDROPONIC_CROPS)) {
      expect(c.ecLow).toBeLessThanOrEqual(c.ecHigh);
      expect(c.phLow).toBeLessThanOrEqual(c.phHigh);
      expect(c.growOutDays).toBeGreaterThan(0);
      expect(c.nurseryDays).toBeGreaterThan(0);
      expect(c.harvestWeightG).toBeGreaterThan(0);
      expect(c.plantsPerPanel).toBeGreaterThan(0);
    }
  });

  it('パネルは 60cm × 90cm = 0.54 m²、年は 365 日', () => {
    expect(PANEL_AREA_SQM).toBe(0.6 * 0.9);
    expect(DAYS_PER_YEAR).toBe(365);
  });

  it('電力原単位の参考幅は 10〜20 kWh/kg', () => {
    expect(ENERGY_INTENSITY_KWH_PER_KG_LOW).toBe(10);
    expect(ENERGY_INTENSITY_KWH_PER_KG_HIGH).toBe(20);
  });
});

describe('養液の判定', () => {
  const crop = HYDROPONIC_CROPS['leaf-lettuce']; // EC 0.8〜1.2 / pH 5.8〜6.3

  it('両端を含む (ちょうどは範囲内)', () => {
    expect(checkNutrientSolution(crop, 0.8, 5.8)).toEqual({ ecInRange: true, phInRange: true, ok: true });
    expect(checkNutrientSolution(crop, 1.2, 6.3)).toEqual({ ecInRange: true, phInRange: true, ok: true });
  });

  it('1 目盛り外れると範囲外', () => {
    expect(checkNutrientSolution(crop, 0.7, 6.0).ecInRange).toBe(false);
    expect(checkNutrientSolution(crop, 1.3, 6.0).ecInRange).toBe(false);
    expect(checkNutrientSolution(crop, 1.0, 5.7).phInRange).toBe(false);
    expect(checkNutrientSolution(crop, 1.0, 6.4).phInRange).toBe(false);
  });

  it('ok は両方が範囲内のときだけ true', () => {
    expect(checkNutrientSolution(crop, 1.0, 6.0).ok).toBe(true);
    expect(checkNutrientSolution(crop, 2.0, 6.0).ok).toBe(false); // EC だけ外れ
    expect(checkNutrientSolution(crop, 1.0, 7.0).ok).toBe(false); // pH だけ外れ
  });

  it('読み取れない値は範囲外あつかい (NaN を「範囲内」にしない)', () => {
    expect(checkNutrientSolution(crop, Number.NaN, 6.0).ecInRange).toBe(false);
    expect(checkNutrientSolution(crop, 1.0, Number.NaN).phInRange).toBe(false);
  });
});

// --- 2. どれだけ採れるか --------------------------------------------------

describe('生産量の見積り', () => {
  it('床面積 × 段数 × 有効率 が栽培面積、パネル穴数 ÷ 面積 が株密度', () => {
    const p = estimateProduction(CLEAN_FACILITY);
    expect(p.cultivationAreaSqm).toBe(500); // 100 × 5 × 1.0
    expect(p.plantsPerSqm).toBe(50); // 27 ÷ 0.54
    expect(p.standingPlants).toBe(25_000); // 500 × 50
  });

  it('回転数は 365 ÷ 定植後日数、年産は在圃株数 × 回転数', () => {
    const p = estimateProduction(CLEAN_FACILITY);
    expect(p.cyclesPerYear).toBe(36.5); // 365 ÷ 10
    expect(p.potentialPlantsPerYear).toBe(912_500); // 25,000 × 36.5
  });

  it('歩留まりは出荷株数にだけ掛かる (上限は減らない)', () => {
    const p = estimateProduction(CLEAN_FACILITY);
    expect(p.shippedPlantsPerYear).toBe(730_000); // 912,500 × 0.8
    expect(p.shippedKgPerYear).toBe(73_000); // 730,000 × 100g
    expect(p.shippedPlantsPerDay).toBe(2_000); // 730,000 ÷ 365
    // 歩留まりを 100% にしても上限は同じ。増えるのは出荷だけ。
    const full = estimateProduction({ ...CLEAN_FACILITY, yieldRate: 1 });
    expect(full.potentialPlantsPerYear).toBe(p.potentialPlantsPerYear);
    expect(full.shippedPlantsPerYear).toBe(912_500);
  });

  it('有効率と歩留まりは 0..1 に収める', () => {
    const over = estimateProduction({ ...CLEAN_FACILITY, usableRatio: 1.5, yieldRate: 1.5 });
    expect(over.cultivationAreaSqm).toBe(500); // 1.5 は 1.0 に丸める
    expect(over.shippedPlantsPerYear).toBe(912_500); // 歩留まりも 1.0 まで
    const under = estimateProduction({ ...CLEAN_FACILITY, usableRatio: -1, yieldRate: -1 });
    expect(under.cultivationAreaSqm).toBe(0);
    expect(under.shippedPlantsPerYear).toBe(0);
    const nan = estimateProduction({ ...CLEAN_FACILITY, usableRatio: Number.NaN });
    expect(nan.cultivationAreaSqm).toBe(0);
  });

  it('定植後日数が 0 なら回転しない (0 除算で Infinity を出さない)', () => {
    const p = estimateProduction({ ...CLEAN_FACILITY, crop: { ...CLEAN_CROP, growOutDays: 0 } });
    expect(p.cyclesPerYear).toBe(0);
    expect(p.potentialPlantsPerYear).toBe(0);
    expect(p.shippedPlantsPerYear).toBe(0);
    expect(Number.isFinite(p.cyclesPerYear)).toBe(true);
  });

  it('段数を倍にすると栽培面積も出荷も倍になる', () => {
    const one = estimateProduction({ ...CLEAN_FACILITY, tiers: 5 });
    const two = estimateProduction({ ...CLEAN_FACILITY, tiers: 10 });
    expect(two.cultivationAreaSqm).toBe(one.cultivationAreaSqm * 2);
    expect(two.shippedPlantsPerYear).toBe(one.shippedPlantsPerYear * 2);
  });

  it('参考値どおりの設備規模が出典の桁と合う (100坪・10段で日産 3,000 株規模)', () => {
    // 出典: 100坪 (330 m²) に 10 段で日産およそ 3,000 株。
    // 有効率 70%・歩留まり 90% を置くとその桁に収まる。
    const p = estimateProduction({
      floorAreaSqm: 330,
      tiers: 10,
      usableRatio: 0.7,
      crop: HYDROPONIC_CROPS['leaf-lettuce'],
      yieldRate: 0.9,
    });
    expect(p.shippedPlantsPerDay).toBeGreaterThan(2_500);
    expect(p.shippedPlantsPerDay).toBeLessThan(3_500);
  });
});

// --- 3. いくらになるか ----------------------------------------------------

describe('収支の見積り', () => {
  it('電力は歩留まり前の生産量で決まる (売れなくても照明は動く)', () => {
    const e = estimateEconomics(CLEAN_FACILITY, CLEAN_COST);
    // 上限 912,500 株 × 100g = 91,250kg × 10kWh = 912,500 kWh
    expect(e.energyKwhPerYear).toBe(912_500);
    expect(e.electricityYenPerYear).toBe(18_250_000); // × 20 円/kWh

    // 歩留まりを半分にしても電力量は変わらない。売上だけ減る。
    const half = estimateEconomics({ ...CLEAN_FACILITY, yieldRate: 0.4 }, CLEAN_COST);
    expect(half.energyKwhPerYear).toBe(e.energyKwhPerYear);
    expect(half.monthly.revenue).toBeLessThan(e.monthly.revenue);
  });

  it('月次の損益を経営サマリーと同じ項目名で返す', () => {
    const e = estimateEconomics(CLEAN_FACILITY, CLEAN_COST);
    // 出荷 730,000 株 ÷ 12 = 60,833.33 株/月
    expect(e.shippedPlantsPerMonth).toBe(60_833);
    expect(e.monthly.revenue).toBe(6_083_333); // × 100 円
    expect(e.monthly.cogs).toBe(912_500); // × (3+2+10) 円
    expect(e.monthly.advertising).toBe(0);
    expect(e.monthly.depreciation).toBe(2_000_000);
    expect(e.monthly.laborCost).toBe(3_000_000);
    // 販管費 = 人件費 300万 + 電気代 1,520,833.33 + 家賃 50万 + その他 30万
    expect(e.monthly.sga).toBe(5_320_833);
  });

  it('電気代は販管費に入れる (限界利益を大きく見せない)', () => {
    const e = estimateEconomics(CLEAN_FACILITY, CLEAN_COST);
    // 株あたり変動費は種苗+肥料+包装だけ。電気代は入らない。
    expect(e.contributionPerPlantYen).toBe(85); // 100 − 15
    // 電気代を 0 にしても限界利益は変わらず、販管費だけが減る。
    const noPower = estimateEconomics(CLEAN_FACILITY, { ...CLEAN_COST, electricityYenPerKwh: 0 });
    expect(noPower.contributionPerPlantYen).toBe(85);
    expect(noPower.monthly.sga).toBe(3_800_000); // 300万 + 50万 + 30万
  });

  it('損益分岐 — 100 円では届かず、200 円なら届く', () => {
    const cheap = estimateEconomics(CLEAN_FACILITY, CLEAN_COST);
    // 固定費 = 販管費 5,320,833.33 + 減価償却 200万 = 7,320,833.33
    // ÷ 限界利益 85 円 = 86,127.45 → 切り上げ 86,128 株
    expect(cheap.breakEvenPlantsPerMonth).toBe(86_128);
    expect(cheap.meetsBreakEven).toBe(false); // 出荷 60,833 株では足りない

    const dear = estimateEconomics(CLEAN_FACILITY, { ...CLEAN_COST, unitPriceYen: 200 });
    expect(dear.contributionPerPlantYen).toBe(185);
    expect(dear.breakEvenPlantsPerMonth).toBe(39_573); // 7,320,833.33 ÷ 185 の切り上げ
    expect(dear.meetsBreakEven).toBe(true);
  });

  it('分岐点ちょうどは「回収できている」あつかい (境界は以上)', () => {
    // 床 96m² × 5 段 × 有効率 1.0 = 480m² → 在圃 24,000 株 × 36.5 回転
    // = 876,000 株/年 = 73,000 株/月（歩留まり 100%）。
    // 限界利益 185 円 × 73,000 株 = 13,505,000 円 を固定費に合わせると
    // 分岐点はちょうど 73,000 株になる。
    const e = estimateEconomics(
      { ...CLEAN_FACILITY, floorAreaSqm: 96, yieldRate: 1 },
      {
        ...CLEAN_COST,
        unitPriceYen: 200,
        electricityYenPerKwh: 0, // 端数を出さないため電気代は 0 円にする
        laborYenPerMonth: 13_000_000,
        depreciationYenPerMonth: 505_000,
        rentYenPerMonth: 0,
        otherFixedYenPerMonth: 0,
      },
    );
    expect(e.shippedPlantsPerMonth).toBe(73_000);
    expect(e.breakEvenPlantsPerMonth).toBe(73_000);
    // ちょうど到達 = 利益 0 円。回収できていないとは言わない。
    expect(e.meetsBreakEven).toBe(true);
    expect(e.monthly.revenue - (e.monthly.cogs + e.monthly.sga + e.monthly.depreciation)).toBe(0);
  });

  it('単価が変動費以下なら分岐点は無い (何株売っても回収できない)', () => {
    const e = estimateEconomics(CLEAN_FACILITY, { ...CLEAN_COST, unitPriceYen: 15 });
    expect(e.contributionPerPlantYen).toBe(0);
    expect(e.breakEvenPlantsPerMonth).toBeNull();
    expect(e.meetsBreakEven).toBe(false);

    const below = estimateEconomics(CLEAN_FACILITY, { ...CLEAN_COST, unitPriceYen: 10 });
    expect(below.contributionPerPlantYen).toBe(-5);
    expect(below.breakEvenPlantsPerMonth).toBeNull();
    expect(below.meetsBreakEven).toBe(false);
  });

  it('出荷 1 株あたり原価は変動費と固定費の両方を背負う', () => {
    const e = estimateEconomics(CLEAN_FACILITY, CLEAN_COST);
    // (912,500 + 7,320,833.33) ÷ 60,833.33 = 135.34 円
    expect(e.costPerShippedPlantYen).toBeCloseTo(135.34, 2);
    // 単価 100 円では 1 株売るごとに赤字。
    expect(e.costPerShippedPlantYen).toBeGreaterThan(CLEAN_COST.unitPriceYen);
  });

  it('出荷が 0 なら 1 株あたり原価は 0 (0 除算を出さない)', () => {
    const e = estimateEconomics({ ...CLEAN_FACILITY, yieldRate: 0 }, CLEAN_COST);
    expect(e.shippedPlantsPerMonth).toBe(0);
    expect(e.monthly.revenue).toBe(0);
    expect(e.costPerShippedPlantYen).toBe(0);
    expect(Number.isFinite(e.costPerShippedPlantYen)).toBe(true);
    // 棚は動いているので電気代は出ていく。
    expect(e.electricityYenPerYear).toBe(18_250_000);
  });

  it('負の入力は 0 に落とす (費用を負にして利益を作らない)', () => {
    const e = estimateEconomics(CLEAN_FACILITY, {
      ...CLEAN_COST,
      seedYenPerPlant: -100,
      laborYenPerMonth: -1_000_000,
      depreciationYenPerMonth: -1,
      rentYenPerMonth: Number.NaN,
      otherFixedYenPerMonth: -5,
    });
    expect(e.monthly.laborCost).toBe(0);
    expect(e.monthly.depreciation).toBe(0);
    // 種苗費が 0 になるので変動費は 2 + 10 = 12 円
    expect(e.contributionPerPlantYen).toBe(88);
    expect(e.monthly.sga).toBe(1_520_833); // 電気代のみ
  });
});
