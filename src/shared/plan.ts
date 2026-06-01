// Plan-tier entitlement model — the single source of truth for "個人事業主〜
// 大企業" scaling. Pure, dependency-free, and shared by main + renderer so
// entitlement decisions are identical everywhere.
//
// The model is deliberately small: a plan grants (a) a cap on how many
// services can be active at once and (b) a set of feature flags. The sidebar
// and pages read these to lock/unlock capability. Billing is out of scope —
// the plan is chosen locally and persisted (see renderer/plan/usePlan.ts).

export type PlanTier = 'free' | 'pro' | 'business' | 'enterprise' | 'internal';

/** Capability flags a plan can grant. Kept coarse on purpose. */
export type PlanFeature =
  | 'live-fetch' // swap snapshot → live REST fetch
  | 'write-actions' // serviceHub.invoke() write-side actions
  | 'cross-service-sync' // e.g. Shopify → Slack/Gmail connectors
  | 'ai-advisor' // AI 経営アドバイザー (advise actions)
  | 'team-seats' // more than one seat / member
  | 'audit-log' // action history retention
  | 'sso'; // SSO / enterprise auth

export interface PlanDefinition {
  readonly id: PlanTier;
  readonly label: string;
  /** Short audience hint shown in the UI. */
  readonly audience: string;
  /** Max simultaneously-active services. `Infinity` = unlimited. */
  readonly maxServices: number;
  /** Max member seats. `Infinity` = unlimited. */
  readonly maxSeats: number;
  /** Indicative monthly price in JPY (0 = free). */
  readonly priceMonthlyJpy: number;
  readonly features: ReadonlySet<PlanFeature>;
}

/** Lowest → highest. Also defines rank for `atLeastPlan`. */
export const PLAN_ORDER: readonly PlanTier[] = ['free', 'pro', 'business', 'enterprise', 'internal'];

export const PLANS: Readonly<Record<PlanTier, PlanDefinition>> = {
  free: {
    id: 'free',
    label: 'Free',
    audience: '個人事業主・お試し',
    maxServices: 5,
    maxSeats: 1,
    priceMonthlyJpy: 0,
    features: new Set<PlanFeature>(['live-fetch']),
  },
  pro: {
    id: 'pro',
    label: 'Pro',
    audience: '個人〜小規模事業者',
    maxServices: 15,
    maxSeats: 3,
    priceMonthlyJpy: 2_980,
    features: new Set<PlanFeature>(['live-fetch', 'write-actions', 'ai-advisor']),
  },
  business: {
    id: 'business',
    label: 'Business',
    audience: '中小企業・チーム',
    maxServices: 40,
    maxSeats: 25,
    priceMonthlyJpy: 19_800,
    features: new Set<PlanFeature>([
      'live-fetch',
      'write-actions',
      'cross-service-sync',
      'ai-advisor',
      'team-seats',
      'audit-log',
    ]),
  },
  enterprise: {
    id: 'enterprise',
    label: 'Enterprise',
    audience: '大企業・全機能',
    maxServices: Infinity,
    maxSeats: Infinity,
    priceMonthlyJpy: 98_000,
    features: new Set<PlanFeature>([
      'live-fetch',
      'write-actions',
      'cross-service-sync',
      'ai-advisor',
      'team-seats',
      'audit-log',
      'sso',
    ]),
  },
  // 社内ライセンス — 自社商品として、招待コードを持つオーナー・社員・招待者は
  // 全機能を無償 (¥0) で利用できる。Enterprise と同等の上限なし・全機能に加え、
  // 価格 0。招待コードでの有効化は `internalLicense.ts` が担う。
  internal: {
    id: 'internal',
    label: '社内ライセンス',
    audience: '自社・招待者 (全機能無償)',
    maxServices: Infinity,
    maxSeats: Infinity,
    priceMonthlyJpy: 0,
    features: new Set<PlanFeature>([
      'live-fetch',
      'write-actions',
      'cross-service-sync',
      'ai-advisor',
      'team-seats',
      'audit-log',
      'sso',
    ]),
  },
};

export const DEFAULT_PLAN: PlanTier = 'free';

/** Type guard for untrusted input (e.g. a value read from localStorage). */
export function isPlanTier(value: unknown): value is PlanTier {
  return typeof value === 'string' && (PLAN_ORDER as readonly string[]).includes(value);
}

/** Resolve a definition, falling back to the default for unknown input. */
export function getPlan(tier: unknown): PlanDefinition {
  return isPlanTier(tier) ? PLANS[tier] : PLANS[DEFAULT_PLAN];
}

/** 0-based rank within PLAN_ORDER (free = 0). */
export function planRank(tier: PlanTier): number {
  return PLAN_ORDER.indexOf(tier);
}

/** True when `tier` is at least as high as `min`. */
export function atLeastPlan(tier: PlanTier, min: PlanTier): boolean {
  return planRank(tier) >= planRank(min);
}

/** Whether a plan grants a feature. */
export function hasFeature(tier: PlanTier, feature: PlanFeature): boolean {
  return getPlan(tier).features.has(feature);
}

/**
 * Whether the service at position `index` (0-based, in sidebar order) is
 * usable under `tier`. Services beyond the plan's `maxServices` cap are
 * locked. Index-based gating keeps this decoupled from the (renderer-only)
 * service list so the rule lives in one pure place.
 */
export function isServiceUnlocked(tier: PlanTier, index: number): boolean {
  return index < getPlan(tier).maxServices;
}

/** The lowest plan that unlocks a service at `index`, or null if every plan
 *  already covers it. Used to render "Upgrade to X" hints. */
export function requiredPlanForServiceIndex(index: number): PlanTier | null {
  for (const tier of PLAN_ORDER) {
    if (isServiceUnlocked(tier, index)) return tier === DEFAULT_PLAN ? null : tier;
  }
  return 'enterprise';
}

/** The lowest plan that grants `feature`, or null if even Free has it. */
export function requiredPlanForFeature(feature: PlanFeature): PlanTier | null {
  for (const tier of PLAN_ORDER) {
    if (hasFeature(tier, feature)) return tier === DEFAULT_PLAN ? null : tier;
  }
  return null;
}
