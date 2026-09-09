/**
 * 事業カテゴリの id と、事業アドバイザー (`business/advise`) の答えの形 ——
 * **main・ブラウザ版・画面が 1 つを読む。** (2026-09-09 · パス 117)
 *
 * それまで:
 * - id の一覧は main (`clients/business.ts` の `BusinessCategoryId` 10 個の合併型) と
 *   ブラウザ版 (`web-shim.ts` の `ALLOWED_CATEGORY_IDS` 10 個の配列) に**別々に書かれ**、
 *   どちらかを足しても他方は知らない (今日は一致していた)。
 * - 答えの形は main が `categoryId: BusinessCategoryId` で留め、ブラウザ版と `BusinessPage` の
 *   写しは `categoryId: string` に**広がっていた** (写しは必ず広い方へずれる —— パス 62 / 105)。
 *
 * ここは定数 1 つと型と判定 1 つ。表 (`BUSINESS_CATEGORIES`) は main に残る —— 各行の id が
 * この一覧に在ることは型が留め、一覧の各 id に行が在ることは `business.test.ts` が留める。
 */

export const BUSINESS_CATEGORY_IDS = [
  'ec',
  'dropship',
  'oem-odm',
  'blog',
  'blog-affiliate',
  'ppc-affiliate',
  'video-production',
  'video-upload',
  'video-distribution',
  'sns-ops',
] as const;

/** 10 事業カテゴリ ID。 */
export type BusinessCategoryId = (typeof BUSINESS_CATEGORY_IDS)[number];

/**
 * **型の門** —— 一覧に在る id だけを通す。値の門 (`allowed.has()` —— その呼び出しで
 * 許した集合か) とは別に置く。`allowed` に一覧の外の文字列が紛れても、ここで止まる。
 */
export function isBusinessCategoryId(value: unknown): value is BusinessCategoryId {
  return typeof value === 'string' && (BUSINESS_CATEGORY_IDS as readonly string[]).includes(value);
}

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
