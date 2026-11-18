/**
 * 養蜂・養殖の保存レコード (2026-11-18)。
 *
 * 水耕栽培 (`hydroponicsSetup.ts`) と同じ持ち方をする:
 * - **一覧** (養蜂の産物・養殖の魚種) は、まるごと 1 レコードに保存し、変更のたびに 1 件足して
 *   **最新の 1 件を採用**する。書き込みは `applyToLatest` (保管層の今の最新に当てる) を通す。
 * - **概算の入力** (群数・尾数・費用) は別の collection に、同じく最新の 1 件を採用する。
 *   欄の状態は `useLatestForm` が持つ (保管層が答えてから開く・保存は開いた時の最新のままなら書く)。
 *
 * どちらの数字も**端末の中だけ**に置く。経営サマリーや書面にはまだ載せていない
 * (`docs/REMAINING_WORK.md` に残した)。
 */
import {
  BEE_PRODUCT_SPEC,
  type BeeProduct,
  type BeekeepingPlan,
} from '../../shared/beekeeping';
import {
  FISH_SPECIES_SPEC,
  type AquaculturePlan,
  type FishSpecies,
} from '../../shared/aquaculture';
import { farmListOrDefault, findFarmItem } from '../../shared/farmProductList';
import { latestRecord } from './latestRecord';

/** 養蜂の産物の一覧。 */
export const BEE_PRODUCTS_COLLECTION = 'beekeeping-products';
/** 養蜂の概算の入力。 */
export const BEE_PLAN_COLLECTION = 'beekeeping-plan';
/** 養殖の魚種の一覧。 */
export const FISH_SPECIES_COLLECTION = 'aquaculture-species';
/** 養殖の概算の入力。 */
export const FISH_PLAN_COLLECTION = 'aquaculture-plan';

/** 保存する産物の一覧。 */
export interface BeeProductListRecord extends Record<string, unknown> {
  readonly products: readonly BeeProduct[];
}

/** 保存する魚種の一覧。 */
export interface FishSpeciesListRecord extends Record<string, unknown> {
  readonly species: readonly FishSpecies[];
}

type StoredRow = { readonly createdAt: number; readonly data: unknown };

/** 最新の 1 件の `key` の欄。レコードの data が物でなくても投げない。 */
function latestField(records: readonly StoredRow[], key: string): unknown {
  return (Object(latestRecord(records)?.data) as Record<string, unknown>)[key];
}

/** 保存レコードから産物の一覧を組む。保存が無い・壊れている・空のときは参考の一覧。 */
export function beeProductsFromRecords(records: readonly StoredRow[]): readonly BeeProduct[] {
  return farmListOrDefault(BEE_PRODUCT_SPEC, latestField(records, 'products'));
}

/** 保存レコードから魚種の一覧を組む。保存が無い・壊れている・空のときは参考の一覧。 */
export function fishSpeciesFromRecords(records: readonly StoredRow[]): readonly FishSpecies[] {
  return farmListOrDefault(FISH_SPECIES_SPEC, latestField(records, 'species'));
}

/** 保存する養蜂の概算の入力。 */
export interface BeekeepingPlanRecord extends Record<string, unknown>, BeekeepingPlan {}

/** 養蜂の概算の欄の鍵 (画面の関門の表と同じ集合)。 */
export const BEE_PLAN_FIELD_KEYS = ['hives', 'costPerHiveYen', 'fixedCostYen'] as const;
export type BeePlanFieldKey = (typeof BEE_PLAN_FIELD_KEYS)[number];
export type BeePlanForm = Readonly<Record<BeePlanFieldKey, string>>;

/**
 * 養蜂の概算の入力欄の初期値。**置き値であって実績ではない** —— 保存するまで概算は出さない。
 */
export const BEE_PLAN_DEFAULTS: BeekeepingPlanRecord = {
  hives: 10,
  costPerHiveYen: 15_000,
  fixedCostYen: 200_000,
};

/** 欄 1 つを文字列へ。保存値が数でなければ置き値。 */
function fieldText(saved: Readonly<Record<string, unknown>> | null, defaults: Readonly<Record<string, unknown>>, key: string): string {
  const v = saved === null ? undefined : saved[key];
  return String(typeof v === 'number' && Number.isFinite(v) ? v : defaults[key]);
}

/** 保存値 → 入力欄。保存値が無ければ置き値から開く。 */
export function beePlanForm(saved: BeekeepingPlanRecord | null): BeePlanForm {
  const out = {} as Record<BeePlanFieldKey, string>;
  for (const k of BEE_PLAN_FIELD_KEYS) out[k] = fieldText(saved, BEE_PLAN_DEFAULTS, k);
  return out;
}

/** 保存する養殖の概算の入力。 */
export interface AquaculturePlanRecord extends Record<string, unknown>, AquaculturePlan {
  /** 魚種 (一覧の id)。 */
  readonly speciesId: string;
}

/** 養殖の概算の数の欄の鍵 (画面の関門の表と同じ集合)。 */
export const FISH_PLAN_FIELD_KEYS = ['stockCount', 'fryYenPerFish', 'feedYenPerKg', 'otherCostYen'] as const;
export type FishPlanFieldKey = (typeof FISH_PLAN_FIELD_KEYS)[number];

export interface FishPlanForm {
  readonly speciesId: string;
  readonly fields: Readonly<Record<FishPlanFieldKey, string>>;
}

/**
 * 養殖の概算の入力欄の初期値。**置き値であって実績ではない** —— 保存するまで概算は出さない。
 */
export const FISH_PLAN_DEFAULTS: AquaculturePlanRecord = {
  speciesId: 'rainbow-trout',
  stockCount: 5000,
  fryYenPerFish: 30,
  feedYenPerKg: 200,
  otherCostYen: 300_000,
};

/** 保存値 → 入力欄。保存値が無ければ置き値から開く。 */
export function fishPlanForm(saved: AquaculturePlanRecord | null): FishPlanForm {
  const fields = {} as Record<FishPlanFieldKey, string>;
  for (const k of FISH_PLAN_FIELD_KEYS) fields[k] = fieldText(saved, FISH_PLAN_DEFAULTS, k);
  const id = saved === null ? undefined : saved.speciesId;
  return { speciesId: typeof id === 'string' ? id : FISH_PLAN_DEFAULTS.speciesId, fields };
}

/**
 * 保存されている魚種の id を、一覧の中の魚種へ寄せる。無ければ一覧の先頭
 * (一覧は空にならない —— `farmListOrDefault`)。
 */
export function resolveSpecies(list: readonly FishSpecies[], id: unknown): FishSpecies {
  return findFarmItem(list, id) ?? list[0]!;
}
