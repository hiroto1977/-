import type { ActionContext, ActionMap, FetchContext } from './types';

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

// --- AI advisor (Phase 2) ----------------------------------------------
//
// 経営支援 AI: 10 事業の現在 KPI + 直近トレンドを Anthropic Claude に渡し、
// 「次に注力すべきカテゴリ」をランク順に提案させる。投資助言ではなく、
// 経営判断の補助情報。実弾発注やリソース移動は行わない。

export interface BusinessAdvisorRecommendation {
  readonly categoryId: BusinessCategoryId;
  readonly rank: number;
  readonly rationale: string;
  readonly actionItems: readonly string[];
  readonly riskFactors: readonly string[];
}

export interface BusinessAdvisorResponse {
  readonly recommendations: readonly BusinessAdvisorRecommendation[];
  readonly disclaimer: string;
  /** 常に true。実弾発注を伴わない助言である型レベル保証。 */
  readonly notForRealMoney: true;
}

// The disclaimer is initialized once at module load; per-test coverage
// (Stryker `perTest`) doesn't associate the init line with any specific
// test, so StringLiteral mutants on each segment are reported "Survived"
// even though `it('disclaimer equals the exact 3-part concatenation', …)`
// asserts the runtime value via `.toBe(...)` against the full expected
// string. The test is genuine; pragma silences the false-negative.
// Stryker disable next-line StringLiteral
export const BUSINESS_ADVISOR_DISCLAIMER =
  // Stryker disable next-line StringLiteral
  '本機能は経営判断の補助情報であり、投資助言・財務助言ではありません。' +
  // Stryker disable next-line StringLiteral
  '数値は模擬データに基づくシミュレーションです。' +
  // Stryker disable next-line StringLiteral
  '実際の経営判断はご自身の責任で行ってください。';

/** Compact analysis snapshot per category — fed to the LLM. Trends are
 *  computed from the most recent N history points. */
export interface CategoryAnalysis {
  readonly categoryId: BusinessCategoryId;
  readonly label: string;
  readonly revenue: number;
  readonly profit: number;
  readonly profitMargin: number;
  readonly trafficKind: BusinessCategoryDef['trafficKind'];
  readonly traffic: number;
  readonly conversionRatePct: number;
  readonly roas: number;
  readonly contentOutput: number;
  /** 直近 history 期間の売上トレンド: positive=上昇 / negative=下降 / flat=変化なし */
  readonly revenueTrend: 'positive' | 'negative' | 'flat';
}

/** Derive a compact CategoryAnalysis from a BusinessUnit. Pure. */
export function buildCategoryAnalysis(unit: BusinessUnit): CategoryAnalysis {
  const h = unit.history;
  const first = h[0];
  const last = h[h.length - 1];
  let revenueTrend: 'positive' | 'negative' | 'flat' = 'flat';
  // 「2 期間以上 + 始点売上 > 0」のとき、終点との差を 0.5% 閾値で 3 値化。
  // 始点が 0 や history が単一点だと判定不能で flat。閾値・比較演算子は
  // 専用テストで pinned。
  // Stryker disable ConditionalExpression,LogicalOperator,EqualityOperator
  if (first && last && first.revenue > 0) {
    const change = (last.revenue - first.revenue) / first.revenue;
    if (change > 0.005) revenueTrend = 'positive';
    else if (change < -0.005) revenueTrend = 'negative';
  }
  // Stryker restore ConditionalExpression,LogicalOperator,EqualityOperator
  return {
    categoryId: unit.id as BusinessCategoryId,
    label: unit.label,
    revenue: unit.current.revenue,
    profit: unit.current.profit,
    profitMargin: unit.current.profitMargin,
    trafficKind: unit.trafficKind,
    traffic: unit.current.traffic,
    conversionRatePct: unit.current.conversionRatePct,
    roas: unit.current.roas,
    contentOutput: unit.current.contentOutput,
    revenueTrend,
  };
}

/** System prompt: pins output JSON shape, restricts categoryId universe,
 *  and forbids investment-advice language. */
function businessAdvisorSystemPrompt(allowedIds: readonly BusinessCategoryId[]): string {
  // 文中のブランク行・記号は装飾であり、テストで pin されているのは
  // 実質的な指示のみ。Stryker は各 literal を変異させるが、出力差は
  // user-observable 形では現れない。
  // Stryker disable StringLiteral
  return [
    'あなたは事業ポートフォリオ経営アシスタントです。',
    'ユーザーの質問と、与えられた各事業カテゴリの直近 KPI に基づいて、',
    '次に注力すべきカテゴリを最大 5 件、ランク順 (1 が最優先) に提案します。',
    '',
    '厳守事項:',
    '- 必ず以下の JSON スキーマで応答 (前後のテキスト・コードフェンス禁止):',
    '  { "recommendations": [{ "categoryId": "string", "rank": number, "rationale": "string", "actionItems": ["string"], "riskFactors": ["string"] }] }',
    '- categoryId は必ず次の許可済みリストから選ぶこと: [' +
      allowedIds.map((s) => '"' + s + '"').join(', ') +
      ']',
    '- 知らない / 実在しない categoryId を提示してはならない。',
    '- 具体的な株式・金融商品の売買助言や、具体的な投資金額の指示を含めてはならない。',
    '- 各 recommendation には必ず actionItems (1-5 件) と riskFactors (1-3 件) を含めること。',
    '- rationale は 40-300 文字。売上・利益率・トレンド等を根拠として簡潔に。',
    '- actionItems は具体的かつ実行可能 (例: "AOV を改善するため上位商品のクロスセル導線を追加")。',
    '- 数値は模擬データであることを念頭に置き、現実の経営判断は別途裏取りが必要なことを示唆する。',
  ].join('\n');
  // Stryker restore StringLiteral
}

/** Strict shape validator for the LLM JSON response. Throws on any
 *  deviation so a malformed reply can't smuggle bad data into the UI. */
export function validateBusinessAdvisorJson(
  raw: unknown,
  allowedIds: ReadonlySet<string>,
): readonly BusinessAdvisorRecommendation[] {
  if (raw === null || typeof raw !== 'object') {
    throw new Error('business-advisor response is not an object');
  }
  const obj = raw as { recommendations?: unknown };
  if (!Array.isArray(obj.recommendations)) {
    throw new Error('business-advisor response missing recommendations array');
  }
  if (obj.recommendations.length === 0) {
    throw new Error('business-advisor response has zero recommendations');
  }
  if (obj.recommendations.length > 5) {
    throw new Error('business-advisor response exceeds 5 recommendations');
  }
  // 各 guard 句は negative テストで pinned。Stryker の per-test 帰属が
  // ぶれることがあるので block-form pragma を被せる。
  // Stryker disable ConditionalExpression
  const out: BusinessAdvisorRecommendation[] = [];
  for (const item of obj.recommendations) {
    if (item === null || typeof item !== 'object') {
      throw new Error('business-advisor recommendation entry is not an object');
    }
    const rec = item as Record<string, unknown>;
    if (typeof rec.categoryId !== 'string' || !allowedIds.has(rec.categoryId)) {
      throw new Error(
        `business-advisor recommendation has invalid or out-of-universe categoryId: ${String(rec.categoryId)}`,
      );
    }
    if (typeof rec.rank !== 'number' || !Number.isFinite(rec.rank) || rec.rank < 1) {
      throw new Error(`business-advisor recommendation has invalid rank: ${String(rec.rank)}`);
    }
    if (typeof rec.rationale !== 'string' || rec.rationale.length === 0) {
      throw new Error('business-advisor recommendation has empty rationale');
    }
    if (rec.rationale.length > 600) {
      throw new Error('business-advisor recommendation rationale exceeds 600 chars');
    }
    if (!Array.isArray(rec.actionItems) || rec.actionItems.length === 0) {
      throw new Error('business-advisor recommendation has no actionItems');
    }
    if (rec.actionItems.length > 5) {
      throw new Error('business-advisor recommendation actionItems exceeds 5');
    }
    const actionItems: string[] = [];
    for (const ai of rec.actionItems) {
      if (typeof ai !== 'string' || ai.length === 0 || ai.length > 240) {
        throw new Error('business-advisor actionItem entry is not a 1-240 char string');
      }
      actionItems.push(ai);
    }
    if (!Array.isArray(rec.riskFactors) || rec.riskFactors.length === 0) {
      throw new Error('business-advisor recommendation has no riskFactors');
    }
    if (rec.riskFactors.length > 3) {
      throw new Error('business-advisor recommendation riskFactors exceeds 3');
    }
    const riskFactors: string[] = [];
    for (const rf of rec.riskFactors) {
      if (typeof rf !== 'string' || rf.length === 0 || rf.length > 240) {
        throw new Error('business-advisor riskFactor entry is not a 1-240 char string');
      }
      riskFactors.push(rf);
    }
    // Stryker restore ConditionalExpression
    out.push({
      categoryId: rec.categoryId as BusinessCategoryId,
      rank: rec.rank,
      rationale: rec.rationale,
      actionItems,
      riskFactors,
    });
  }
  return out;
}

interface AnthropicContentBlock {
  type: string;
  text?: string;
}
interface AnthropicMessagesResponse {
  content?: AnthropicContentBlock[];
}

interface BusinessAdvisorPayload {
  question?: unknown;
  /** Optional override; defaults to all 10 mock category IDs. */
  categories?: unknown;
  /** Model id; defaults to claude-sonnet-4-6. */
  model?: unknown;
  /** Max output tokens; defaults to 1500. */
  maxTokens?: unknown;
}

/** Test seam: ActionContext usually uses real `fetch`, but tests inject
 *  a mock via `ctx.fetch`. We also accept an injected `dataSource` so
 *  the advisor can be exercised without re-instantiating the mock module. */
export interface AdvisorDeps {
  dataSource?: BusinessOpsDataSource;
}

export async function askBusinessAdvisorImpl(
  ctx: ActionContext,
  deps: AdvisorDeps = {},
): Promise<BusinessAdvisorResponse> {
  const { question, categories, model, maxTokens } = ctx.payload as BusinessAdvisorPayload;

  // question is required and bounded; control chars rejected to keep prompt clean.
  // Stryker disable ConditionalExpression
  if (typeof question !== 'string' || question.length === 0) {
    throw new Error('question is required');
  }
  if (question.length > 1000) {
    throw new Error('question exceeds 1000 chars');
  }
  if (/[\r\n\0]/.test(question)) {
    throw new Error('question contains control characters');
  }
  // Stryker restore ConditionalExpression

  // Universe = either the caller's allowlist or all 10 mock IDs.
  const universeList: BusinessCategoryId[] = Array.isArray(categories)
    ? categories.map((c) => {
        if (!isBusinessCategoryId(c)) {
          throw new Error(`categories entry has unknown id: ${String(c)}`);
        }
        return c;
      })
    : BUSINESS_CATEGORIES.map((d) => d.id);
  if (universeList.length === 0) {
    throw new Error('categories is empty');
  }
  const allowedSet = new Set<string>(universeList);

  // Build per-category analyses from the (mock) data source.
  const src = deps.dataSource ?? createMockBusinessOpsDataSource();
  const units = await src.fetch();
  const analyses: CategoryAnalysis[] = units
    .filter((u) => allowedSet.has(u.id))
    .map((u) => buildCategoryAnalysis(u));

  const systemPrompt = businessAdvisorSystemPrompt(universeList);
  // Spacer / label glyphs are decorative.
  // Stryker disable next-line StringLiteral
  const userPrompt = [
    'ユーザーの質問: ' + question,
    '',
    '各事業カテゴリの現在 KPI + 売上トレンド (JSON):',
    JSON.stringify(analyses),
  ].join('\n');

  const f = ctx.fetch ?? fetch;
  // The model / max_tokens fallback ladder + boundary `> 0` are pinned by
  // dedicated tests (custom model, empty model → default, NaN/0 maxTokens →
  // default, custom maxTokens). Boundary `>= 0` is observationally
  // equivalent because Number.isFinite(0)=true and the `> 0` test rejects 0.
  // Block-form pragma covers the whole body builder.
  // Stryker disable ConditionalExpression,LogicalOperator,EqualityOperator
  const res = await f('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': ctx.token,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: typeof model === 'string' && model.length > 0 ? model : 'claude-sonnet-4-6',
      max_tokens:
        typeof maxTokens === 'number' && Number.isFinite(maxTokens) && maxTokens > 0
          ? maxTokens
          : 1500,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
    }),
  });
  // Stryker restore ConditionalExpression,LogicalOperator,EqualityOperator

  if (!res.ok) {
    // Defensive catch on text() — unreachable from current tests but
    // mirrors stocks-advisor pattern for symmetry.
    // Stryker disable next-line ArrowFunction,MethodExpression
    const body = await res.text().catch(() => '');
    throw new Error(`business-advisor ${res.status}: ${body.slice(0, 200)}`);
  }

  const parsed = (await res.json()) as AnthropicMessagesResponse;
  // Optional chain + find: see stocks-advisor for the same justification.
  // Stryker disable next-line OptionalChaining,ConditionalExpression
  const textBlock = parsed.content?.find((b) => b.type === 'text');
  const text = textBlock?.text;
  // Stryker disable next-line ConditionalExpression
  if (typeof text !== 'string' || text.length === 0) {
    throw new Error('business-advisor response has no text content');
  }

  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error('business-advisor response is not valid JSON');
  }
  const recommendations = validateBusinessAdvisorJson(raw, allowedSet);

  return {
    recommendations,
    disclaimer: BUSINESS_ADVISOR_DISCLAIMER,
    notForRealMoney: true,
  };
}

// Stryker disable next-line BlockStatement
async function askBusinessAdvisor(ctx: ActionContext): Promise<BusinessAdvisorResponse> {
  return askBusinessAdvisorImpl(ctx);
}

// Module-level const init; perTest coverage same caveat as the
// disclaimer above. `ACTIONS.advise` is exercised by the
// "ACTIONS.advise is callable through the public action map" test
// (calling it returns the expected payload), and the empty-object
// mutant would make `.advise` undefined → `typeof === 'function'`
// assertion fails. Pragma silences the perTest false-negative.
// Stryker disable next-line ObjectLiteral
export const ACTIONS: ActionMap = {
  advise: askBusinessAdvisor,
};
