import { describe, expect, it } from 'vitest';
import {
  AQUACULTURE_NOTICE,
  DEFAULT_FISH_SPECIES,
  FISH_SPECIES_FIELDS,
  FISH_SPECIES_SPEC,
  WATER_KINDS,
  WATER_KIND_LABELS,
  estimateAquaculture,
  isWaterKind,
  speciesOfWater,
  waterTempNote,
  waterTempVerdict,
  type FishSpecies,
} from '../aquaculture';
import { addFarmItem, farmItemIssues, sanitizeFarmItem, sanitizeFarmList } from '../farmProductList';

/**
 * 養殖 (海水魚・淡水魚) —— 魚種の一覧の決まり、出荷までの収支の概算、水温の点検 (2026-11-18)。
 */
const TROUT: FishSpecies = {
  id: 't', label: 'マス', water: 'fresh',
  growOutDays: 365, harvestWeightG: 200, survivalPct: 80, feedConversion: 1.5, pricePerKgYen: 1200, tempLowC: 8, tempHighC: 18,
};

describe('水の種類', () => {
  it('海水と淡水の 2 つ', () => {
    expect(WATER_KINDS).toEqual(['sea', 'fresh']);
    expect(WATER_KIND_LABELS).toEqual({ sea: '海水魚', fresh: '淡水魚' });
  });

  it.each([['sea', true], ['fresh', true], ['brackish', false], ['', false], [null, false], [1, false]])(
    'isWaterKind(%j) → %j',
    (v, want) => {
      expect(isWaterKind(v)).toBe(want);
    },
  );
});

describe('魚種の一覧の決まり', () => {
  it('参考の魚種は淡水 3・海水 2 で、どれも自分の決まりを通る', () => {
    expect(DEFAULT_FISH_SPECIES.map((s) => [s.id, s.water])).toEqual([
      ['rainbow-trout', 'fresh'],
      ['tilapia', 'fresh'],
      ['honmoroko', 'fresh'],
      ['red-seabream', 'sea'],
      ['flounder', 'sea'],
    ]);
    for (const s of DEFAULT_FISH_SPECIES) expect(farmItemIssues(FISH_SPECIES_SPEC, s)).toEqual([]);
    expect(sanitizeFarmList(FISH_SPECIES_SPEC, DEFAULT_FISH_SPECIES)).toEqual(DEFAULT_FISH_SPECIES);
    expect(Object.isFrozen(DEFAULT_FISH_SPECIES)).toBe(true);
  });

  it('決まりは参考の一覧・欄の並び・呼び名を名乗る', () => {
    expect(FISH_SPECIES_SPEC.builtins).toBe(DEFAULT_FISH_SPECIES);
    expect(FISH_SPECIES_SPEC.numericFields).toBe(FISH_SPECIES_FIELDS);
    expect(FISH_SPECIES_FIELDS).toEqual([
      'growOutDays', 'harvestWeightG', 'survivalPct', 'feedConversion', 'pricePerKgYen', 'tempLowC', 'tempHighC',
    ]);
    expect(FISH_SPECIES_SPEC.noun).toBe('魚種');
    expect(FISH_SPECIES_SPEC.labels).toEqual({
      growOutDays: '出荷までの日数 (日)',
      harvestWeightG: '出荷時の重さ (g/尾)',
      survivalPct: '生残率 (%)',
      feedConversion: '増肉係数 (餌 kg ÷ 増重 kg)',
      pricePerKgYen: '単価 (円/kg)',
      tempLowC: '水温の目安 下限 (℃)',
      tempHighC: '水温の目安 上限 (℃)',
    });
  });

  it.each([
    ['growOutDays', 1, 3650, 0, 3651, '出荷までの日数 (日) は 1〜3650 の整数で入力してください'],
    ['harvestWeightG', 0.1, 500_000, 0.09, 500_001, '出荷時の重さ (g/尾) は 0.1〜500000 の数値で入力してください'],
    ['survivalPct', 1, 100, 0.9, 100.1, '生残率 (%) は 1〜100 の数値で入力してください'],
    ['feedConversion', 0.1, 30, 0.09, 30.1, '増肉係数 (餌 kg ÷ 増重 kg) は 0.1〜30 の数値で入力してください'],
    ['pricePerKgYen', 1, 1_000_000, 0.9, 1_000_001, '単価 (円/kg) は 1〜1000000 の数値で入力してください'],
  ] as const)('%s の範囲の端', (field, min, max, below, above, message) => {
    const at = (v: number): string[] => farmItemIssues(FISH_SPECIES_SPEC, { ...TROUT, [field]: v });
    expect(at(min)).toEqual([]);
    expect(at(max)).toEqual([]);
    expect(at(below)).toEqual([message]);
    expect(at(above)).toEqual([message]);
  });

  it('出荷までの日数は整数だけ (他の欄は小数を通す)', () => {
    expect(farmItemIssues(FISH_SPECIES_SPEC, { ...TROUT, growOutDays: 10.5 })).toEqual([
      '出荷までの日数 (日) は 1〜3650 の整数で入力してください',
    ]);
    expect(farmItemIssues(FISH_SPECIES_SPEC, { ...TROUT, harvestWeightG: 10.5, survivalPct: 80.5, feedConversion: 1.25, pricePerKgYen: 10.5 })).toEqual([]);
  });

  it('水温の目安は 0〜40 ℃ で、下限 ≦ 上限', () => {
    const at = (lo: number, hi: number): string[] => farmItemIssues(FISH_SPECIES_SPEC, { ...TROUT, tempLowC: lo, tempHighC: hi });
    expect(at(0, 40)).toEqual([]);
    expect(at(20, 20)).toEqual([]);
    expect(at(10.5, 20.5)).toEqual([]);
    expect(at(-1, 20)).toEqual(['水温の目安 下限 (℃) は 0〜40 の数値で入力してください']);
    expect(at(20, 41)).toEqual(['水温の目安 上限 (℃) は 0〜40 の数値で入力してください']);
    expect(at(41, 20)).toEqual(['水温の目安 下限 (℃) は 0〜40 の数値で入力してください']);
    expect(at(20, -1)).toEqual(['水温の目安 上限 (℃) は 0〜40 の数値で入力してください']);
    expect(at(25, 20)).toEqual(['水温の目安は下限 ≦ 上限にしてください']);
  });

  it('海水か淡水かを持たない魚種は断る', () => {
    expect(farmItemIssues(FISH_SPECIES_SPEC, { ...TROUT, water: 'brackish' })).toEqual(['海水魚か淡水魚かを選んでください']);
    const { water: _water, ...noWater } = TROUT;
    expect(farmItemIssues(FISH_SPECIES_SPEC, noWater)).toEqual(['海水魚か淡水魚かを選んでください']);
  });

  it('写すときに水の種類も持ち込む (余分な欄は落とす)', () => {
    expect(sanitizeFarmItem(FISH_SPECIES_SPEC, { ...TROUT, water: 'sea', junk: 1 })).toEqual({ ...TROUT, water: 'sea' });
  });

  it('海水魚を足せる', () => {
    const { id: _id, ...draft } = TROUT;
    const r = addFarmItem(FISH_SPECIES_SPEC, DEFAULT_FISH_SPECIES, { ...draft, label: 'ブリ', water: 'sea' });
    expect(r.ok && r.items[5]).toEqual({ ...TROUT, id: 'custom-1', label: 'ブリ', water: 'sea' });
  });

  it('水の種類で一覧を分ける (並びは一覧のまま)', () => {
    expect(speciesOfWater(DEFAULT_FISH_SPECIES, 'fresh').map((s) => s.id)).toEqual(['rainbow-trout', 'tilapia', 'honmoroko']);
    expect(speciesOfWater(DEFAULT_FISH_SPECIES, 'sea').map((s) => s.id)).toEqual(['red-seabream', 'flounder']);
    expect(speciesOfWater([TROUT], 'sea')).toEqual([]);
  });
});

describe('estimateAquaculture — 1 回の出荷までの概算', () => {
  const PLAN = { stockCount: 1000, fryYenPerFish: 30, feedYenPerKg: 200, otherCostYen: 50_000 };

  it('式のとおりに出す', () => {
    const e = estimateAquaculture(PLAN, TROUT);
    // 出荷 800 尾 × 200 g = 160 kg。売上 160 × 1200 = 192,000。餌 160 × 1.5 = 240 kg = 48,000 円。
    // 種苗 1000 × 30 = 30,000。費用 48,000 + 30,000 + 50,000 = 128,000。差引 64,000。
    expect(e).toEqual({
      harvestCount: 800,
      harvestKg: 160,
      revenueYen: 192_000,
      feedKg: 240,
      feedCostYen: 48_000,
      fryCostYen: 30_000,
      costYen: 128_000,
      profitYen: 64_000,
      growOutDays: 365,
      profitPerYearYen: 64_000,
    });
  });

  it('出荷尾数の端数は切り捨てる (四捨五入しない)', () => {
    expect(estimateAquaculture({ ...PLAN, stockCount: 9 }, { ...TROUT, survivalPct: 75 }).harvestCount).toBe(6);
    expect(estimateAquaculture({ ...PLAN, stockCount: 3 }, { ...TROUT, survivalPct: 99 }).harvestCount).toBe(2);
  });

  it('1 年あたりは 差引 × 365 ÷ 出荷までの日数', () => {
    expect(estimateAquaculture(PLAN, { ...TROUT, growOutDays: 730 }).profitPerYearYen).toBe(32_000);
    expect(estimateAquaculture(PLAN, { ...TROUT, growOutDays: 100 }).profitPerYearYen).toBe(233_600);
    expect(estimateAquaculture(PLAN, { ...TROUT, growOutDays: 100 }).growOutDays).toBe(100);
  });

  it('出荷までの日数が読めなければ、1 年あたりは null (0 円と言わない)', () => {
    expect(estimateAquaculture(PLAN, { ...TROUT, growOutDays: 0 }).profitPerYearYen).toBeNull();
    expect(estimateAquaculture(PLAN, { ...TROUT, growOutDays: Number.NaN }).profitPerYearYen).toBeNull();
    expect(estimateAquaculture(PLAN, { ...TROUT, growOutDays: -3 }).growOutDays).toBe(0);
  });

  it('赤字は負のまま出す', () => {
    const e = estimateAquaculture({ ...PLAN, otherCostYen: 500_000 }, TROUT);
    expect(e.profitYen).toBe(-386_000);
    expect(e.profitPerYearYen).toBe(-386_000);
  });

  it('量は 0.1 kg まで、金額は丸める前の量から出して円に丸める', () => {
    const e = estimateAquaculture(
      { stockCount: 7, fryYenPerFish: 0.4, feedYenPerKg: 3, otherCostYen: 0.6 },
      { ...TROUT, survivalPct: 100, harvestWeightG: 55, feedConversion: 1.3, pricePerKgYen: 333 },
    );
    // 7 尾 × 55 g = 0.385 kg → 0.4 kg。売上 0.385 × 333 = 128.2 → 128 円。
    // 餌 0.385 × 1.3 = 0.5005 kg → 0.5 kg。餌の費用 0.5005 × 3 = 1.5015 → 2 円。
    // 種苗 7 × 0.4 = 2.8 → 3 円。その他 0.6 → 1 円。費用 2 + 3 + 1 = 6。
    expect(e.harvestKg).toBe(0.4);
    expect(e.revenueYen).toBe(128);
    expect(e.feedKg).toBe(0.5);
    expect(e.feedCostYen).toBe(2);
    expect(e.fryCostYen).toBe(3);
    expect(e.costYen).toBe(6);
    expect(e.profitYen).toBe(122);
  });

  it.each([
    ['負の尾数', { ...PLAN, stockCount: -10 }],
    ['NaN の尾数', { ...PLAN, stockCount: Number.NaN }],
  ])('%s は 0 尾として扱う (床)', (_n, plan) => {
    const e = estimateAquaculture(plan, TROUT);
    expect(e.harvestCount).toBe(0);
    expect(e.revenueYen).toBe(0);
    expect(e.fryCostYen).toBe(0);
    expect(e.costYen).toBe(50_000);
  });

  it('負・非有限の費用と魚種の値は 0 として扱う (床)', () => {
    const e = estimateAquaculture(
      { stockCount: 1000, fryYenPerFish: -1, feedYenPerKg: Number.NaN, otherCostYen: Number.NEGATIVE_INFINITY },
      TROUT,
    );
    expect([e.feedCostYen, e.fryCostYen, e.costYen]).toEqual([0, 0, 0]);
    const broken = estimateAquaculture(PLAN, { ...TROUT, survivalPct: -5, harvestWeightG: Number.NaN, feedConversion: -1, pricePerKgYen: -1 });
    expect([broken.harvestCount, broken.harvestKg, broken.revenueYen, broken.feedKg]).toEqual([0, 0, 0, 0]);
    const noWeight = estimateAquaculture(PLAN, { ...TROUT, harvestWeightG: -1 });
    expect([noWeight.harvestCount, noWeight.harvestKg]).toEqual([800, 0]);
    const noPrice = estimateAquaculture(PLAN, { ...TROUT, pricePerKgYen: Number.NaN });
    expect([noPrice.harvestKg, noPrice.revenueYen]).toEqual([160, 0]);
    const noFcr = estimateAquaculture(PLAN, { ...TROUT, feedConversion: Number.NaN });
    expect([noFcr.feedKg, noFcr.feedCostYen]).toEqual([0, 0]);
  });
});

describe('水温の点検', () => {
  it('目安の内側・外側・境目ちょうど', () => {
    expect(waterTempVerdict(TROUT, 7.9)).toBe('low');
    expect(waterTempVerdict(TROUT, 8)).toBe('ok');
    expect(waterTempVerdict(TROUT, 13)).toBe('ok');
    expect(waterTempVerdict(TROUT, 18)).toBe('ok');
    expect(waterTempVerdict(TROUT, 18.1)).toBe('high');
  });

  it('文は、測った値と、比べた目安の幅を名乗る', () => {
    expect(waterTempNote(TROUT, 5)).toBe(
      '水温 5 ℃ はマスの目安 8〜18 ℃より低いです。餌を食べる量が落ちやすいので、給餌の量を見直してください。',
    );
    expect(waterTempNote(TROUT, 22)).toBe(
      '水温 22 ℃ はマスの目安 8〜18 ℃より高いです。酸素が不足しやすいので、ばっ気 (エアレーション) と換水を確かめ、給餌を控えめにしてください。',
    );
    expect(waterTempNote(TROUT, 12)).toBe('水温 12 ℃ はマスの目安 8〜18 ℃の範囲内です。');
  });
});

describe('許可・届出の案内', () => {
  it('例と、確かめる窓口を名乗る (要否は判定しない)', () => {
    expect(AQUACULTURE_NOTICE).toBe(
      '養殖を事業として始めるときは、許可や届出が要る場合があります (例: うなぎの養殖は許可制、陸上の養殖は届出制、海面の養殖は漁業権)。' +
        '魚種と場所で決まりが違うので、始める前に都道府県の水産の窓口で確かめてください。',
    );
  });
});
