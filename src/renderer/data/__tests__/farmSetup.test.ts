import { describe, expect, it } from 'vitest';
import {
  BEE_PLAN_COLLECTION,
  BEE_PLAN_DEFAULTS,
  BEE_PLAN_FIELD_KEYS,
  BEE_PRODUCTS_COLLECTION,
  FISH_PLAN_COLLECTION,
  FISH_PLAN_DEFAULTS,
  FISH_PLAN_FIELD_KEYS,
  FISH_SPECIES_COLLECTION,
  beePlanForm,
  beeProductsFromRecords,
  fishPlanForm,
  fishSpeciesFromRecords,
  resolveSpecies,
} from '../farmSetup';
import { DEFAULT_BEE_PRODUCTS } from '../../../shared/beekeeping';
import { DEFAULT_FISH_SPECIES } from '../../../shared/aquaculture';

/**
 * 養蜂・養殖の保存レコードの読み (2026-11-18)。
 */
const HONEY = { id: 'custom-1', label: 'そば蜜', yieldPerHiveKg: 8, pricePerKgYen: 6000 };
const EEL = {
  id: 'custom-1', label: 'ウナギ', water: 'fresh',
  growOutDays: 400, harvestWeightG: 250, survivalPct: 85, feedConversion: 1.8, pricePerKgYen: 4000, tempLowC: 25, tempHighC: 30,
};

describe('collection の名前', () => {
  it('4 つとも別の名前', () => {
    expect([BEE_PRODUCTS_COLLECTION, BEE_PLAN_COLLECTION, FISH_SPECIES_COLLECTION, FISH_PLAN_COLLECTION]).toEqual([
      'beekeeping-products', 'beekeeping-plan', 'aquaculture-species', 'aquaculture-plan',
    ]);
  });
});

describe('一覧を保存レコードから組む', () => {
  it('保存が無ければ参考の一覧', () => {
    expect(beeProductsFromRecords([])).toBe(DEFAULT_BEE_PRODUCTS);
    expect(fishSpeciesFromRecords([])).toBe(DEFAULT_FISH_SPECIES);
  });

  it('最新の 1 件 (createdAt が最大) の一覧を採用する', () => {
    const rows = [
      { createdAt: 1, data: { products: [{ ...HONEY, label: '古い' }] } },
      { createdAt: 3, data: { products: [HONEY] } },
      { createdAt: 2, data: { products: [{ ...HONEY, label: '中' }] } },
    ];
    expect(beeProductsFromRecords(rows)).toEqual([HONEY]);
    const fish = [
      { createdAt: 5, data: { species: [EEL] } },
      { createdAt: 4, data: { species: [{ ...EEL, label: '古い' }] } },
    ];
    expect(fishSpeciesFromRecords(fish)).toEqual([EEL]);
  });

  it.each([
    ['data が null', null],
    ['data が文字列', 'x'],
    ['欄が無い', {}],
    ['配列でない', { products: 'x', species: 5 }],
    ['空の配列', { products: [], species: [] }],
    ['形の通らない品目だけ', { products: [{ id: 'a' }], species: [{ id: 'a' }] }],
  ])('%s なら参考の一覧 (投げない)', (_n, data) => {
    expect(beeProductsFromRecords([{ createdAt: 1, data }])).toBe(DEFAULT_BEE_PRODUCTS);
    expect(fishSpeciesFromRecords([{ createdAt: 1, data }])).toBe(DEFAULT_FISH_SPECIES);
  });

  it('産物の欄と魚種の欄を取り違えない', () => {
    expect(beeProductsFromRecords([{ createdAt: 1, data: { species: [HONEY] } }])).toBe(DEFAULT_BEE_PRODUCTS);
    expect(fishSpeciesFromRecords([{ createdAt: 1, data: { products: [EEL] } }])).toBe(DEFAULT_FISH_SPECIES);
  });
});

describe('養蜂の概算の入力欄', () => {
  it('欄の鍵は 3 つ', () => {
    expect(BEE_PLAN_FIELD_KEYS).toEqual(['hives', 'costPerHiveYen', 'fixedCostYen']);
  });

  it('保存が無ければ置き値から開く', () => {
    expect(BEE_PLAN_DEFAULTS).toEqual({ hives: 10, costPerHiveYen: 15_000, fixedCostYen: 200_000 });
    expect(beePlanForm(null)).toEqual({ hives: '10', costPerHiveYen: '15000', fixedCostYen: '200000' });
  });

  it('保存値から開く (0 も保存値として開く)', () => {
    expect(beePlanForm({ hives: 3, costPerHiveYen: 0, fixedCostYen: 12_345 })).toEqual({
      hives: '3', costPerHiveYen: '0', fixedCostYen: '12345',
    });
  });

  it('数でない・非有限の保存値の欄は置き値で開く', () => {
    const broken = { hives: '7', costPerHiveYen: Number.NaN, fixedCostYen: Number.POSITIVE_INFINITY } as unknown as Parameters<typeof beePlanForm>[0];
    expect(beePlanForm(broken)).toEqual({ hives: '10', costPerHiveYen: '15000', fixedCostYen: '200000' });
  });
});

describe('養殖の概算の入力欄', () => {
  it('数の欄の鍵は 4 つ', () => {
    expect(FISH_PLAN_FIELD_KEYS).toEqual(['stockCount', 'fryYenPerFish', 'feedYenPerKg', 'otherCostYen']);
  });

  it('保存が無ければ置き値から開く', () => {
    expect(FISH_PLAN_DEFAULTS).toEqual({
      speciesId: 'rainbow-trout', stockCount: 5000, fryYenPerFish: 30, feedYenPerKg: 200, otherCostYen: 300_000,
    });
    expect(fishPlanForm(null)).toEqual({
      speciesId: 'rainbow-trout',
      fields: { stockCount: '5000', fryYenPerFish: '30', feedYenPerKg: '200', otherCostYen: '300000' },
    });
  });

  it('保存値から開く', () => {
    expect(fishPlanForm({ speciesId: 'flounder', stockCount: 100, fryYenPerFish: 0, feedYenPerKg: 250, otherCostYen: 1 })).toEqual({
      speciesId: 'flounder',
      fields: { stockCount: '100', fryYenPerFish: '0', feedYenPerKg: '250', otherCostYen: '1' },
    });
  });

  it('魚種の id が文字列でなければ置き値の魚種、数でない欄は置き値', () => {
    const broken = { speciesId: 42, stockCount: 'x', fryYenPerFish: 5, feedYenPerKg: Number.NaN, otherCostYen: 9 } as unknown as Parameters<typeof fishPlanForm>[0];
    expect(fishPlanForm(broken)).toEqual({
      speciesId: 'rainbow-trout',
      fields: { stockCount: '5000', fryYenPerFish: '5', feedYenPerKg: '200', otherCostYen: '9' },
    });
  });
});

describe('resolveSpecies — 保存した id を一覧の魚種へ寄せる', () => {
  it('一覧に在ればその魚種、無ければ先頭', () => {
    expect(resolveSpecies(DEFAULT_FISH_SPECIES, 'flounder').label).toBe('ヒラメ');
    expect(resolveSpecies(DEFAULT_FISH_SPECIES, 'gone').label).toBe('ニジマス');
    expect(resolveSpecies(DEFAULT_FISH_SPECIES, undefined).label).toBe('ニジマス');
  });
});
