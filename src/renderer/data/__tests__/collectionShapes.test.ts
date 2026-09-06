/**
 * record store の中身の形 (`data/collectionShapes.ts`) —— 復元が封筒しか見ていなかった穴。
 *
 * collection ごとに「書く側の形の標本」を置き、必須の欄は壊す/消すと落ち、任意の欄は
 * 消すと通り・型違いと null は落ちる、を機械的に回す。列挙値は書く側の一覧を参照するので
 * 一覧の外の値を 1 つずつ当てる。既知の collection が台帳から漏れていないことは
 * `*_COLLECTION` 定数の走査で留める (走査が 0 件なら空振りとして落とす)。
 */
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { COLLECTION_SHAPES, hasCollectionShape } from '../collectionShapes';

interface Sample {
  readonly good: Record<string, unknown>;
  readonly required: readonly string[];
  readonly optional: readonly string[];
  /** 列挙の欄と、一覧の外の値。 */
  readonly enumOut?: readonly (readonly [string, string])[];
}

const KPI = {
  good: { period: '2026-04', unit: '全社', revenue: 1000, cogs: 100, advertising: 10, sga: 50, depreciation: 5, laborCost: 30 },
  required: ['period', 'unit', 'revenue', 'cogs', 'advertising', 'sga', 'depreciation'],
  optional: ['laborCost'],
} as const satisfies Sample;

const SAMPLES: Readonly<Record<string, Sample>> = {
  'sales-entries': {
    good: { date: '2026-04-01', channel: 'amazon', amount: 1000, orders: 1, note: 'x' },
    required: ['date', 'channel', 'amount', 'orders'],
    optional: ['note'],
    enumOut: [['channel', 'nope']],
  },
  'kpi-actuals': KPI,
  'kpi-budgets': KPI,
  'balance-sheet': {
    good: {
      asOf: '2026-03-31', currentAssets: 8, cash: 3, inventory: 1, accountsReceivable: 2, fixedAssets: 4,
      currentLiabilities: 5, accountsPayable: 1, fixedLiabilities: 3, interestBearingDebt: 2, netIncome: 1,
    },
    required: ['asOf', 'currentAssets', 'fixedAssets', 'currentLiabilities', 'fixedLiabilities', 'netIncome'],
    optional: ['cash', 'inventory', 'accountsReceivable', 'accountsPayable', 'interestBearingDebt'],
  },
  'team-members': {
    good: { name: '山田', email: 'y@example.com', role: 'member' },
    required: ['name', 'email', 'role'],
    optional: [],
    enumOut: [['role', 'god']],
  },
  'business-units': {
    good: { name: 'EC', category: '小売', startedOn: '2026-01', note: 'n', revenue: 100, variableCost: 10, fixedCost: 5 },
    required: ['name'],
    optional: ['category', 'startedOn', 'note', 'revenue', 'variableCost', 'fixedCost'],
  },
  'bank-submission-settings': {
    good: { profile: { companyName: 'X' }, format: { unit: 'yen' } },
    required: [],
    optional: ['profile', 'format'],
  },
  'shigyo-contacts': {
    good: { serviceId: 'tax-accountant', name: '田中', firm: '事務所', phone: '03', email: 't@example.com' },
    required: ['serviceId', 'name'],
    optional: ['firm', 'phone', 'email'],
  },
  'shigyo-consultations': {
    good: { serviceId: 'tax-accountant', date: '2026-04-01', topic: '決算', status: '相談予約' },
    required: ['serviceId', 'date', 'topic', 'status'],
    optional: [],
    enumOut: [['status', '不明']],
  },
  'realestate-properties': {
    good: { name: 'A', type: 'apartment', monthlyRent: 100, purchasePrice: 1000, occupied: true, monthlyExpenses: 1, monthlyLoan: 2 },
    required: ['name', 'type', 'monthlyRent', 'purchasePrice', 'occupied'],
    optional: ['monthlyExpenses', 'monthlyLoan'],
  },
  'mutualfund-holdings': {
    good: { code: '1234', name: 'F', units: 10, navPerUnit: 10000, valuation: 10000, valuationMode: 'auto', acquisitionCost: 9000, ytdReturnPct: 1 },
    required: ['name', 'units', 'navPerUnit', 'valuation'],
    optional: ['code', 'valuationMode', 'acquisitionCost', 'ytdReturnPct'],
    enumOut: [['valuationMode', 'guess']],
  },
  'parameter-overrides': {
    good: { values: { 'tax.rate': 0.1 } },
    required: [],
    optional: ['values'],
  },
  'manual-metrics': {
    good: { scope: 'all', label: 'L', value: 1, unit: 'yen', note: 'n', businessId: 'b1' },
    required: ['scope', 'label', 'value', 'unit'],
    optional: ['note', 'businessId'],
    enumOut: [['unit', 'kg']],
  },
  'manual-overrides': {
    good: { scope: 'all', path: 'a.b', value: 1 },
    required: ['scope', 'path', 'value'],
    optional: [],
  },
  'hydroponics-setup': {
    good: {
      floorAreaSqm: 100, tiers: 4, usableRatioPct: 70, cropId: 'lettuce', yieldRatePct: 90, unitPriceYen: 150,
      electricityYenPerKwh: 30, energyIntensityKwhPerKg: 10, seedYenPerPlant: 5, nutrientYenPerPlant: 3,
      packagingYenPerPlant: 10, laborYenPerMonth: 200000, depreciationYenPerMonth: 50000, rentYenPerMonth: 80000,
      otherFixedYenPerMonth: 10000, lowPotassium: true, switchDaysBeforeHarvest: 7, measuredPotassiumMgPer100g: 120,
      measuredSodiumMgPer100g: 10,
    },
    required: ['floorAreaSqm', 'tiers', 'usableRatioPct', 'cropId'],
    optional: [
      'yieldRatePct', 'unitPriceYen', 'electricityYenPerKwh', 'energyIntensityKwhPerKg', 'seedYenPerPlant',
      'nutrientYenPerPlant', 'packagingYenPerPlant', 'laborYenPerMonth', 'depreciationYenPerMonth', 'rentYenPerMonth',
      'otherFixedYenPerMonth', 'lowPotassium', 'switchDaysBeforeHarvest', 'measuredPotassiumMgPer100g', 'measuredSodiumMgPer100g',
    ],
  },
  'hydroponics-crops': { good: { crops: [] }, required: [], optional: ['crops'] },
  'highlight-settings': {
    good: { declineWarnStreak: 2, declineCriticalStreak: 3, laborShareWarnPct: 60, singleChannelWarnPct: 60 },
    required: [],
    optional: ['declineWarnStreak', 'declineCriticalStreak', 'laborShareWarnPct', 'singleChannelWarnPct'],
  },
  'overview-overrides': { good: { path: 'a', value: 1, note: 'n' }, required: ['path', 'value'], optional: ['note'] },
  'overview-custom-metrics': {
    good: { label: 'L', value: 1, unit: 'pct', note: 'n' },
    required: ['label', 'value', 'unit'],
    optional: ['note'],
    enumOut: [['unit', 'kg']],
  },
  'connector-output': { good: { connectorId: 'c', key: 'k', payload: { anything: [1, 'x'] } }, required: ['connectorId', 'key'], optional: [] },
};

/** 同じ欄に「型の違う値」を作る。 */
function wrongTyped(value: unknown): unknown {
  if (typeof value === 'string') return 123;
  if (typeof value === 'number') return 'x';
  if (typeof value === 'boolean') return 'yes';
  return 'x'; // object / array
}

const without = (rec: Record<string, unknown>, key: string): Record<string, unknown> => {
  const copy = { ...rec };
  delete copy[key];
  return copy;
};

describe('collection ごとの中身の形', () => {
  it('標本は 20 collection ぶんある (空振りでない)', () => {
    expect(Object.keys(SAMPLES).length).toBeGreaterThanOrEqual(20);
    expect(Object.keys(COLLECTION_SHAPES).sort()).toEqual(Object.keys(SAMPLES).sort());
  });

  for (const [collection, sample] of Object.entries(SAMPLES)) {
    describe(collection, () => {
      it('書く側の形は通る', () => {
        expect(hasCollectionShape(collection, sample.good)).toBe(true);
      });

      it('知らない欄が足されていても通る (新しい版の記録)', () => {
        expect(hasCollectionShape(collection, { ...sample.good, futureField: { deep: true } })).toBe(true);
      });

      for (const key of sample.required) {
        it(`必須 ${key}: 型が違えば落ち、無くても落ちる`, () => {
          expect(hasCollectionShape(collection, { ...sample.good, [key]: wrongTyped(sample.good[key]) })).toBe(false);
          expect(hasCollectionShape(collection, without(sample.good, key))).toBe(false);
        });
      }

      for (const key of sample.optional) {
        it(`任意 ${key}: 無ければ通り、型が違えば落ち、null も落ちる`, () => {
          expect(hasCollectionShape(collection, without(sample.good, key))).toBe(true);
          expect(hasCollectionShape(collection, { ...sample.good, [key]: wrongTyped(sample.good[key]) })).toBe(false);
          expect(hasCollectionShape(collection, { ...sample.good, [key]: null })).toBe(false);
        });
      }

      for (const [key, out] of sample.enumOut ?? []) {
        it(`列挙 ${key}: 一覧の外の値 '${out}' は落ちる`, () => {
          expect(hasCollectionShape(collection, { ...sample.good, [key]: out })).toBe(false);
        });
      }
    });
  }

  it('数値の欄は NaN / Infinity も落ちる (Number.isFinite)', () => {
    expect(hasCollectionShape('sales-entries', { ...SAMPLES['sales-entries']!.good, amount: NaN })).toBe(false);
    expect(hasCollectionShape('sales-entries', { ...SAMPLES['sales-entries']!.good, amount: Infinity })).toBe(false);
  });

  it('列挙は一覧の**全部**が通る (1 つだけ通る形に縮んでいないこと)', () => {
    for (const mode of ['auto', 'manual']) expect(hasCollectionShape('mutualfund-holdings', { ...SAMPLES['mutualfund-holdings']!.good, valuationMode: mode }), mode).toBe(true);
    for (const unit of ['yen', 'pct', 'count', 'days', 'months']) expect(hasCollectionShape('manual-metrics', { ...SAMPLES['manual-metrics']!.good, unit }), unit).toBe(true);
    for (const role of ['member', 'admin', 'owner']) expect(hasCollectionShape('team-members', { ...SAMPLES['team-members']!.good, role }), role).toBe(true);
    for (const status of ['相談予約', '相談中', '対応中', '完了']) expect(hasCollectionShape('shigyo-consultations', { ...SAMPLES['shigyo-consultations']!.good, status }), status).toBe(true);
    // 列挙の欄に文字列以外 (数値・null) が来ても投げずに落ちる
    expect(hasCollectionShape('sales-entries', { ...SAMPLES['sales-entries']!.good, channel: 1 })).toBe(false);
    expect(hasCollectionShape('sales-entries', { ...SAMPLES['sales-entries']!.good, channel: null })).toBe(false);
  });

  it('parameter-overrides.values は値が全部数値のときだけ通る', () => {
    expect(hasCollectionShape('parameter-overrides', { values: { a: 1, b: 2.5 } })).toBe(true);
    expect(hasCollectionShape('parameter-overrides', { values: { a: 1, b: '2' } })).toBe(false);
    expect(hasCollectionShape('parameter-overrides', { values: [1, 2] })).toBe(false);
  });

  it('知らない collection は通す (前方互換)。`constructor` も名前として合法で、判定関数扱いにならない', () => {
    expect(hasCollectionShape('some-future-collection', { anything: 1 })).toBe(true);
    expect(hasCollectionShape('constructor', { anything: 1 })).toBe(true);
    expect(hasCollectionShape('hasOwnProperty', {})).toBe(true);
  });
});

describe('台帳の網羅 — `*_COLLECTION` 定数はすべて登録されている', () => {
  it('src/renderer/data/*.ts の定数を走査する (0 件なら走査の死)', () => {
    const dir = path.resolve(__dirname, '..');
    const names = new Set<string>();
    for (const file of readdirSync(dir)) {
      if (!file.endsWith('.ts')) continue;
      const src = readFileSync(path.join(dir, file), 'utf8');
      for (const m of src.matchAll(/^export const [A-Z_]*COLLECTION[A-Z_]* = '([a-z0-9-]+)'/gm)) names.add(m[1]!);
    }
    expect(names.size).toBeGreaterThanOrEqual(20);
    const missing = [...names].filter((n) => !Object.hasOwn(COLLECTION_SHAPES, n));
    expect(missing, `台帳に無い collection: ${missing.join(', ')}`).toEqual([]);
  });
});
