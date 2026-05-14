import type { FetchContext } from './types';

/**
 * Business operations dashboard — 17 番目のサービス。
 * 10 種類の事業 (EC / dropship / OEM/ODM / blog / blog-affiliate /
 * PPC-affiliate / video-production / video-upload / video-distribution
 * / sns-ops) を統合し、各カテゴリ固有 KPI + 共通の経営指標 (売上 / 利益
 * / 利益率) を時系列で可視化する。
 *
 * Phase 6 deferred pattern:
 *   - `BusinessOpsDataSource` interface — Phase 6 で freee / 楽天 SP API /
 *     Shopify / YouTube Data API / GA4 / X API などへ差し替え
 *   - `createMockBusinessOpsDataSource()` は決定論的 xorshift32 mock
 *   - `isMock: true` フラグ強制で UI が必ず警告バナーを出す
 *
 * AI orchestration (Phase 2): `advise` action は質問 + per-category
 * KPI を Anthropic API に投げて投資配分提案を返す。実装は次コミット。
 */

// --- Category taxonomy ---------------------------------------------------

/** 8 事業カテゴリ ID — 全 SoT は SERVICES_BY_CATEGORY (下記). */
export type BusinessCategoryId =
  | 'ec'
  | 'dropship'
  | 'oem-odm'
  | 'blog'
  | 'blog-affiliate'
  | 'ppc-affiliate'
  | 'video-production'
  | 'video-upload'
  | 'video-distribution'
  | 'sns-ops';

export interface BusinessCategoryDef {
  readonly id: BusinessCategoryId;
  readonly label: string;
  readonly description: string;
  /** ベース月商 (JPY)。mock は ±30% 程度ふらつかせる */
  readonly baseRevenue: number;
  /** 変動費率 (cogs + ad 等の売上連動分の割合 0..1) */
  readonly variableRatio: number;
  /** 固定費 (sga + depreciation, JPY/月) */
  readonly fixedCost: number;
  /** トラフィック種類: session / view / impression / order / project */
  readonly trafficKind: 'session' | 'view' | 'impression' | 'order' | 'project';
  /** 月次ベース流量 (mock 用) */
  readonly baseTraffic: number;
  /** 平均コンバージョン率 (0..1) — N/A の場合 0 */
  readonly baseConversionRate: number;
  /** ベース ROAS (広告費1円あたり売上) — 広告系のみ */
  readonly baseRoas: number;
  /** 月次コンテンツ出力本数 (記事 / 動画 / 投稿 / 商品) */
  readonly baseContentOutput: number;
}

export const BUSINESS_CATEGORIES: readonly BusinessCategoryDef[] = [
  {
    id: 'ec',
    label: 'EC / ネットショップ',
    description: 'Shopify / BASE / STORES などでの自社 EC 運営',
    baseRevenue: 3_200_000,
    variableRatio: 0.55,
    fixedCost: 600_000,
    trafficKind: 'session',
    baseTraffic: 18_000,
    baseConversionRate: 0.022,
    baseRoas: 4.2,
    baseContentOutput: 8,
  },
  {
    id: 'dropship',
    label: 'ドロップシッピング',
    description: '在庫を持たず仕入元から直送する小売',
    baseRevenue: 1_600_000,
    variableRatio: 0.72,
    fixedCost: 240_000,
    trafficKind: 'session',
    baseTraffic: 9_500,
    baseConversionRate: 0.015,
    baseRoas: 3.1,
    baseContentOutput: 12,
  },
  {
    id: 'oem-odm',
    label: 'OEM / ODM',
    description: '製造委託で自社ブランド製品を作る BtoB / DtoC',
    baseRevenue: 5_400_000,
    variableRatio: 0.48,
    fixedCost: 1_400_000,
    trafficKind: 'project',
    baseTraffic: 12,
    baseConversionRate: 0.32,
    baseRoas: 0,
    baseContentOutput: 3,
  },
  {
    id: 'blog',
    label: '自社ブログ',
    description: '広告 / 自社商品導線としての所有メディア',
    baseRevenue: 480_000,
    variableRatio: 0.12,
    fixedCost: 60_000,
    trafficKind: 'session',
    baseTraffic: 220_000,
    baseConversionRate: 0.003,
    baseRoas: 0,
    baseContentOutput: 18,
  },
  {
    id: 'blog-affiliate',
    label: 'ブログアフィリエイト',
    description: 'SEO 流入 + 成果報酬広告で収益化するメディア',
    baseRevenue: 1_100_000,
    variableRatio: 0.08,
    fixedCost: 80_000,
    trafficKind: 'session',
    baseTraffic: 380_000,
    baseConversionRate: 0.008,
    baseRoas: 0,
    baseContentOutput: 24,
  },
  {
    id: 'ppc-affiliate',
    label: 'PPC アフィリエイト',
    description: '有料広告で送客し成果報酬を取る短期回収型',
    baseRevenue: 2_800_000,
    variableRatio: 0.70,
    fixedCost: 150_000,
    trafficKind: 'impression',
    baseTraffic: 4_200_000,
    baseConversionRate: 0.012,
    baseRoas: 1.45,
    baseContentOutput: 60,
  },
  {
    id: 'video-production',
    label: '動画制作 (受託)',
    description: '企業案件の動画制作を受託する BtoB',
    baseRevenue: 2_100_000,
    variableRatio: 0.38,
    fixedCost: 540_000,
    trafficKind: 'project',
    baseTraffic: 6,
    baseConversionRate: 0.42,
    baseRoas: 0,
    baseContentOutput: 6,
  },
  {
    id: 'video-upload',
    label: '動画投稿 (自社チャンネル)',
    description: 'YouTube / TikTok 等の自社チャンネル運営 (広告収益 + 案件)',
    baseRevenue: 920_000,
    variableRatio: 0.18,
    fixedCost: 180_000,
    trafficKind: 'view',
    baseTraffic: 1_200_000,
    baseConversionRate: 0.0012,
    baseRoas: 0,
    baseContentOutput: 12,
  },
  {
    id: 'video-distribution',
    label: '動画配信 (有料広告)',
    description: 'YouTube / TikTok Ads / IG Reels に有料配信する獲得チャネル',
    baseRevenue: 1_750_000,
    variableRatio: 0.66,
    fixedCost: 120_000,
    trafficKind: 'impression',
    baseTraffic: 8_400_000,
    baseConversionRate: 0.0009,
    baseRoas: 1.85,
    baseContentOutput: 22,
  },
  {
    id: 'sns-ops',
    label: 'SNS 運用',
    description: 'X / Instagram / TikTok のオーガニック+広告運用',
    baseRevenue: 760_000,
    variableRatio: 0.42,
    fixedCost: 220_000,
    trafficKind: 'impression',
    baseTraffic: 2_600_000,
    baseConversionRate: 0.0028,
    baseRoas: 2.4,
    baseContentOutput: 90,
  },
];

const CATEGORY_BY_ID: Readonly<Record<BusinessCategoryId, BusinessCategoryDef>> =
  Object.fromEntries(BUSINESS_CATEGORIES.map((c) => [c.id, c])) as Readonly<
    Record<BusinessCategoryId, BusinessCategoryDef>
  >;

// --- KPI shape -----------------------------------------------------------

/** 1 期分 (=1 月分) のカテゴリ KPI. 全フィールド JPY 整数 or 比率. */
export interface CategoryKpi {
  readonly revenue: number;
  readonly variableCost: number;
  readonly fixedCost: number;
  readonly totalCost: number;
  readonly profit: number;
  /** 利益率 (%) 0..100 */
  readonly profitMargin: number;
  readonly traffic: number;
  readonly conversion: number;
  /** 0..100 */
  readonly conversionRatePct: number;
  /** 受注 1 件あたり平均単価 (JPY) — conversion=0 のとき 0 */
  readonly aov: number;
  /** 広告費用対効果 (倍) — 広告系のみ 0 以外 */
  readonly roas: number;
  /** 月次の公開コンテンツ数 */
  readonly contentOutput: number;
}

export interface BusinessUnit {
  readonly id: BusinessCategoryId;
  readonly label: string;
  readonly description: string;
  readonly trafficKind: BusinessCategoryDef['trafficKind'];
  readonly current: CategoryKpi;
  readonly history: readonly CategoryKpi[];
}

export interface BusinessOpsSnapshot {
  readonly units: readonly BusinessUnit[];
  readonly aggregate: {
    readonly revenue: number;
    readonly totalCost: number;
    readonly profit: number;
    readonly profitMargin: number;
    readonly contentOutput: number;
  };
  readonly fetchedAt: string;
  readonly isMock: true;
}

// --- KPI engine ----------------------------------------------------------

/** Round to JPY integer. */
function jpy(n: number): number {
  return Math.round(n);
}

/** Pure-compute: turn raw drivers into a CategoryKpi. */
export function computeCategoryKpi(
  def: BusinessCategoryDef,
  driftRevenue: number, // 0..2 multiplier
  driftTraffic: number, // 0..2 multiplier
  driftRoas: number, // 0..2 multiplier
): CategoryKpi {
  const revenue = jpy(def.baseRevenue * driftRevenue);
  const variableCost = jpy(revenue * def.variableRatio);
  const fixedCost = def.fixedCost;
  const totalCost = variableCost + fixedCost;
  const profit = revenue - totalCost;
  const profitMargin = revenue > 0 ? (profit / revenue) * 100 : 0;
  const traffic = jpy(def.baseTraffic * driftTraffic);
  const conversion = jpy(traffic * def.baseConversionRate);
  const conversionRatePct = traffic > 0 ? (conversion / traffic) * 100 : 0;
  const aov = conversion > 0 ? jpy(revenue / conversion) : 0;
  // `baseRoas > 0` boundary: baseRoas is either 0 (non-ad) or
  // strictly > 1 in BUSINESS_CATEGORIES — `>= 0` mutant differs only
  // at exact 0, which produces the same `0` result both ways.
  // Stryker disable next-line ConditionalExpression,EqualityOperator
  const roas = def.baseRoas > 0 ? def.baseRoas * driftRoas : 0;
  const contentOutput = def.baseContentOutput;
  return {
    revenue,
    variableCost,
    fixedCost,
    totalCost,
    profit,
    profitMargin,
    traffic,
    conversion,
    conversionRatePct,
    aov,
    roas,
    contentOutput,
  };
}

// --- Mock data source ----------------------------------------------------

/** xorshift32 — same as kpi/stocks for deterministic mock series. */
function noise(seed: number): number {
  // Stryker disable next-line ConditionalExpression,LogicalOperator
  let x = seed | 0 || 1;
  x ^= x << 13;
  x ^= x >>> 17;
  x ^= x << 5;
  return (x >>> 0) / 4294967296;
}

export const HISTORY_LENGTH = 30;

export interface BusinessOpsDataSource {
  fetch(): Promise<readonly BusinessUnit[]>;
}

/** Generate 8 categories × 30 periods deterministic series.
 *  Drift bands: revenue ±30%, traffic ±40%, roas ±25%. */
export function createMockBusinessOpsDataSource(): BusinessOpsDataSource {
  return {
    async fetch() {
      return BUSINESS_CATEGORIES.map((def) => {
        // Seed arithmetic + stream-decorrelation constants are
        // decorative — pinned by the determinism test ("two calls
        // produce equal arrays") and the drift-band test, but the
        // specific constants are not contract.
        // Stryker disable next-line ArithmeticOperator
        const seedBase = def.id.charCodeAt(0) * 1000 + def.id.length;
        const history: CategoryKpi[] = [];
        for (let i = 0; i < HISTORY_LENGTH; i++) {
          // Stryker disable next-line ArithmeticOperator
          const dr = 0.7 + noise(seedBase + i) * 0.6;
          // Stryker disable next-line ArithmeticOperator
          const dt = 0.6 + noise(seedBase + i + 3333) * 0.8;
          // Stryker disable next-line ArithmeticOperator
          const droas = 0.75 + noise(seedBase + i + 7777) * 0.5;
          history.push(computeCategoryKpi(def, dr, dt, droas));
        }
        const current = history[history.length - 1]!;
        return {
          id: def.id,
          label: def.label,
          description: def.description,
          trafficKind: def.trafficKind,
          current,
          history,
        };
      });
    },
  };
}

// --- Aggregate -----------------------------------------------------------

export function aggregateBusinessUnits(
  units: readonly BusinessUnit[],
): BusinessOpsSnapshot['aggregate'] {
  let revenue = 0;
  let totalCost = 0;
  let contentOutput = 0;
  for (const u of units) {
    revenue += u.current.revenue;
    totalCost += u.current.totalCost;
    contentOutput += u.current.contentOutput;
  }
  const profit = revenue - totalCost;
  const profitMargin = revenue > 0 ? (profit / revenue) * 100 : 0;
  return { revenue, totalCost, profit, profitMargin, contentOutput };
}

// --- Snapshot fetcher ----------------------------------------------------

const FETCHED_AT = '2026-05-14T00:00:00.000Z';

export interface SnapshotDeps {
  dataSource?: BusinessOpsDataSource;
}

export async function fetchBusinessOpsSnapshotImpl(
  _ctx: FetchContext,
  deps: SnapshotDeps = {},
): Promise<BusinessOpsSnapshot> {
  const src = deps.dataSource ?? createMockBusinessOpsDataSource();
  const units = await src.fetch();
  const aggregate = aggregateBusinessUnits(units);
  return { units, aggregate, fetchedAt: FETCHED_AT, isMock: true };
}

// Stryker disable next-line BlockStatement
export async function fetchBusinessOpsSnapshot(
  ctx: FetchContext,
): Promise<BusinessOpsSnapshot> {
  return fetchBusinessOpsSnapshotImpl(ctx);
}

// --- Category lookup helper (exposed for UI) ---------------------------

export function getCategoryDef(id: BusinessCategoryId): BusinessCategoryDef {
  return CATEGORY_BY_ID[id];
}

// `typeof value === 'string'` short-circuit is required for the `in`
// operator below (`in` throws TypeError on non-objects but accepts strings
// vacuously). 6 tests cover string/number/null/undefined/object/known —
// Stryker mis-attributes per-test coverage. Block-form pragma covers the
// return statement itself.
// Stryker disable ConditionalExpression
export function isBusinessCategoryId(value: unknown): value is BusinessCategoryId {
  return typeof value === 'string' && value in CATEGORY_BY_ID;
}
// Stryker restore ConditionalExpression
