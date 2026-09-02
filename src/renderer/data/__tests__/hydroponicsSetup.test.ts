/**
 * 入力レコード → 試算 の橋渡しの検査。
 *
 * ここが壊れると、画面で入れた値と経営サマリーに出る数字がずれる。%
 * （画面の単位）と割合（モデルの単位）の変換が主な落とし穴。
 */
import { describe, expect, it } from 'vitest';
import {
  HYDROPONICS_COLLECTION,
  HYDROPONIC_CROPS_COLLECTION,
  HYDROPONICS_DEFAULTS,
  cropListFromRecords,
  resolveCrop,
  toFacilityInput,
  toCostInput,
  economicsFromSetup,
  hydroponicsBusinessUnit,
  HYDROPONICS_UNIT_ID,
  lowPotassiumFromSetup,
  type HydroponicsSetup,
} from '../hydroponicsSetup';
import { buildAxonometric, buildComposition } from '../businessAxonometric';
import { deriveBusinessFinancials } from '../businessFinancials';
import { computeFinancialRatios } from '../financialRatios';
import {
  HYDROPONIC_CROPS,
  ENERGY_INTENSITY_KWH_PER_KG_LOW,
  ENERGY_INTENSITY_KWH_PER_KG_HIGH,
  LOW_K_SWITCH_DAYS_MIN,
  LOW_K_SWITCH_DAYS_MAX,
  type HydroponicCrop,
} from '../../../shared/hydroponics';
import { DEFAULT_CROP_LIST } from '../../../shared/hydroponicCrops';

/** 利用者が足した品目。定植後 5 日なので年 73 回転 (レタスの 36.5 の 2 倍)。 */
const MINE: HydroponicCrop = {
  id: 'custom-1',
  label: 'ミズナ',
  nurseryDays: 10,
  growOutDays: 5,
  harvestWeightG: 50,
  ecLow: 1,
  ecHigh: 1.6,
  phLow: 5.8,
  phHigh: 6.4,
  plantsPerPanel: 8,
};

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
    expect(HYDROPONIC_CROPS_COLLECTION).toBe('hydroponics-crops');
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
  it('既知の id はその品目の実体を返す (一覧を省略すれば参考値の 5 品目)', () => {
    for (const c of Object.values(HYDROPONIC_CROPS)) {
      expect(resolveCrop(c.id)).toBe(c);
    }
  });

  it('壊れた値は一覧の先頭 (リーフレタス) に寄せる (落とさない)', () => {
    for (const bad of ['存在しない品目', undefined, null, 42, {}]) {
      expect(resolveCrop(bad), String(bad)).toBe(HYDROPONIC_CROPS['leaf-lettuce']);
    }
  });

  it('利用者の一覧を渡すとその中で解決し、無ければその一覧の先頭 (参考値の id でも)', () => {
    const mine = [MINE, HYDROPONIC_CROPS.basil];
    expect(resolveCrop('custom-1', mine)).toBe(MINE);
    expect(resolveCrop('basil', mine)).toBe(HYDROPONIC_CROPS.basil);
    expect(resolveCrop('leaf-lettuce', mine)).toBe(MINE);
  });
});

describe('cropListFromRecords — 保存レコードから品目一覧', () => {
  const at = (createdAt: number, data: unknown) => ({ createdAt, data });

  it('保存が無ければ参考値の一覧 (同じ実体)', () => {
    expect(cropListFromRecords([])).toBe(DEFAULT_CROP_LIST);
  });

  it('保存があればその一覧', () => {
    expect(cropListFromRecords([at(1, { crops: [MINE] })])).toEqual([MINE]);
  });

  it('最新は createdAt で選ぶ — 並び順が昇順でも降順でも同じ答え', () => {
    const older = at(1, { crops: [MINE] });
    const newer = at(2, { crops: [HYDROPONIC_CROPS.basil] });
    expect(cropListFromRecords([older, newer])).toEqual([HYDROPONIC_CROPS.basil]);
    expect(cropListFromRecords([newer, older])).toEqual([HYDROPONIC_CROPS.basil]);
  });

  it('壊れた保存 (null / 数値 / crops が配列でない / 空) は参考値へ戻る', () => {
    for (const data of [null, 42, 'x', { crops: 'x' }, { crops: [] }, { crops: [{ id: 'BAD' }] }, {}]) {
      expect(cropListFromRecords([at(1, data)]), JSON.stringify(data)).toBe(DEFAULT_CROP_LIST);
    }
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

  it('利用者の一覧を渡せば、足した品目の実体を渡す', () => {
    const mine = [...DEFAULT_CROP_LIST, MINE];
    expect(toFacilityInput({ ...SETUP, cropId: 'custom-1' }, mine).crop).toBe(MINE);
    // 一覧を渡さなければ参考値にしか解決できず、先頭へ寄る。
    expect(toFacilityInput({ ...SETUP, cropId: 'custom-1' }).crop).toBe(HYDROPONIC_CROPS['leaf-lettuce']);
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

  it('足した品目は利用者の一覧を渡したときだけ試算に効く', () => {
    const mine = [...DEFAULT_CROP_LIST, MINE];
    const withMine = economicsFromSetup({ ...SETUP, cropId: 'custom-1' }, mine)!;
    // 定植後 5 日 → 365 ÷ 5 = 73 回転
    expect(withMine.production.cyclesPerYear).toBe(73);
    // 一覧を渡さないと先頭 (リーフレタス) で計算される
    expect(economicsFromSetup({ ...SETUP, cropId: 'custom-1' })!.production.cyclesPerYear).toBe(36.5);
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

/*
 * 水耕栽培を「事業」として並べる。
 *
 * 別枠の参考値として置くと、全社の数字に入っているのかどうかが画面から
 * 分からない。事業として出す以上、費目の対応がずれていれば営業利益が
 * 静かに違う値になるので、対応をここで固定する。
 */
describe('hydroponicsBusinessUnit', () => {
  it('未入力なら事業として並べない (勝手なサンプルを混ぜない)', () => {
    expect(hydroponicsBusinessUnit(null)).toBeNull();
  });

  it('費目の対応が estimateEconomics の定義と一致する', () => {
    const e = economicsFromSetup(SETUP)!;
    const u = hydroponicsBusinessUnit(e)!;
    const m = e.monthly;
    expect(u.current.revenue).toBe(m.revenue);
    expect(u.current.variableCost).toBe(m.cogs + m.advertising);
    // sga は人件費を内数に含む。足すと二重計上になる。
    expect(u.current.fixedCost).toBe(m.sga + m.depreciation);
    expect(u.current.profit).toBe(m.revenue - u.current.variableCost - u.current.fixedCost);
  });

  it('人件費を二重に数えない', () => {
    const e = economicsFromSetup(SETUP)!;
    const u = hydroponicsBusinessUnit(e)!;
    const doubleCounted = e.monthly.sga + e.monthly.depreciation + e.monthly.laborCost;
    expect(e.monthly.laborCost).toBeGreaterThan(0);
    expect(u.current.fixedCost).toBeLessThan(doubleCounted);
    expect(u.current.fixedCost).toBe(doubleCounted - e.monthly.laborCost);
  });

  it('人件費は実額をそのまま渡す (固定費の半分という置き値に落とさない)', () => {
    const e = economicsFromSetup(SETUP)!;
    const u = hydroponicsBusinessUnit(e)!;
    expect(u.current.laborCost).toBe(e.monthly.laborCost);
    // 置き値だったら固定費の半分になるはず。そうなっていないことを見る。
    expect(u.current.laborCost).not.toBe(u.current.fixedCost / 2);
  });

  it('実額の人件費が労働分配率に効く', () => {
    // 労働分配率は付加価値が正のときにしか定義できない。既定の設備・単価は
    // 赤字なので (下の「既定は赤字」参照)、ここは黒字になる単価で見る。
    const e = economicsFromSetup({ ...SETUP, unitPriceYen: 600 })!;
    const u = hydroponicsBusinessUnit(e)!;
    const withActual = computeFinancialRatios(deriveBusinessFinancials(u.current));
    const { laborCost: _drop, ...withoutActual } = u.current;
    const guessed = computeFinancialRatios(deriveBusinessFinancials(withoutActual));
    expect(withActual.laborSharePct).not.toBeNull();
    expect(guessed.laborSharePct).not.toBeNull();
    expect(withActual.laborSharePct).not.toBe(guessed.laborSharePct);
  });

  it('既定の設備・単価では赤字になる — それを黒字に見せない', () => {
    // 人工光型は電力と償却が重い。既定値 (単価 150 円/株) では固定費を
    // 回収できない。事業として並べる以上、この赤字が全社の数字に効く。
    // ここを黙って落とすと「載せたのに全社の利益が変わらない」ことになる。
    const u = hydroponicsBusinessUnit(economicsFromSetup(SETUP)!)!;
    expect(u.current.profit).toBeLessThan(0);
    expect(economicsFromSetup(SETUP)!.meetsBreakEven).toBe(false);
  });

  it('営業利益率は売上と利益から出す (売上 0 でも 0 除算しない)', () => {
    const e = economicsFromSetup(SETUP)!;
    const u = hydroponicsBusinessUnit(e)!;
    expect(u.current.profitMargin).toBeCloseTo((u.current.profit / u.current.revenue) * 100, 1);

    const zero = economicsFromSetup({ ...SETUP, unitPriceYen: 0 })!;
    const zu = hydroponicsBusinessUnit(zero)!;
    expect(zu.current.revenue).toBe(0);
    expect(zu.current.profitMargin).toBe(0);
    expect(Number.isFinite(zu.current.profitMargin)).toBe(true);
  });

  it('赤字でも事業として並ぶ (黒字だけを見せない)', () => {
    // 単価を原価割れにすると赤字になる。ここで null にして消してしまうと、
    // 全社の数字から赤字の事業が抜けて実態より良く見える。
    const loss = economicsFromSetup({ ...SETUP, unitPriceYen: 1 })!;
    const u = hydroponicsBusinessUnit(loss)!;
    expect(u.current.profit).toBeLessThan(0);
    expect(u.label).toBe('水耕栽培');
  });

  it('履歴は空 (計画の改訂を月次の実績として描かない)', () => {
    const u = hydroponicsBusinessUnit(economicsFromSetup(SETUP)!)!;
    expect(u.history).toEqual([]);
    expect(u.id).toBe(HYDROPONICS_UNIT_ID);
  });

  it('3 軸グラフに当月 1 点の事業として載る', () => {
    const u = hydroponicsBusinessUnit(economicsFromSetup(SETUP)!)!;
    const chart = buildAxonometric([u], 'operatingMargin')!;
    expect(chart.series[0]!.label).toBe('水耕栽培');
    expect(chart.series[0]!.points).toHaveLength(1);
    expect(chart.series[0]!.points[0]!.label).toBe('当月');
    // サンプル扱いにしない — 利用者が入力した実データである。
    expect(chart.series[0]!.sample).toBe(false);
  });

  it('構成比の円にも入る', () => {
    const u = hydroponicsBusinessUnit(economicsFromSetup(SETUP)!)!;
    const c = buildComposition([u], 'revenue');
    expect(c.slices.map((s) => s.label)).toEqual(['水耕栽培']);
    expect(c.slices[0]!.pct).toBe(100);
  });
});

describe('hydroponicsBusinessUnit — 変動費の内訳', () => {
  it('広告費も変動費に足す (引かない)', () => {
    // 今の `estimateEconomics` は広告費を 0 で返すので、足しても引いても
    // 同じ数になる。型は 0 以外を許すので、対応そのものをここで固定する。
    const base = economicsFromSetup(SETUP)!;
    const withAd = {
      ...base,
      monthly: { ...base.monthly, advertising: 120_000 },
    };
    const u = hydroponicsBusinessUnit(withAd)!;
    expect(u.current.variableCost).toBe(base.monthly.cogs + 120_000);
    expect(u.current.variableCost).toBeGreaterThan(hydroponicsBusinessUnit(base)!.current.variableCost);
  });
});
