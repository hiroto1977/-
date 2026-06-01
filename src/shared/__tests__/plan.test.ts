import { describe, expect, it } from 'vitest';
import {
  PLANS,
  PLAN_ORDER,
  DEFAULT_PLAN,
  isPlanTier,
  getPlan,
  planRank,
  atLeastPlan,
  hasFeature,
  isServiceUnlocked,
  requiredPlanForServiceIndex,
  requiredPlanForFeature,
} from '../plan';

describe('plan model', () => {
  it('orders the paid tiers free → enterprise monotonically, with internal as a $0 all-access tier', () => {
    expect(PLAN_ORDER).toEqual(['free', 'pro', 'business', 'enterprise', 'internal']);
    expect(planRank('free')).toBe(0);
    expect(planRank('enterprise')).toBe(3);
    expect(planRank('internal')).toBe(4);
    // 課金階段 (free→enterprise) は上限・価格が単調増加。
    const paid = ['free', 'pro', 'business', 'enterprise'] as const;
    for (let i = 1; i < paid.length; i++) {
      const prev = PLANS[paid[i - 1]!];
      const cur = PLANS[paid[i]!];
      expect(cur.maxServices).toBeGreaterThanOrEqual(prev.maxServices);
      expect(cur.maxSeats).toBeGreaterThanOrEqual(prev.maxSeats);
      expect(cur.priceMonthlyJpy).toBeGreaterThanOrEqual(prev.priceMonthlyJpy);
    }
    // 社内ライセンス: 無償 (¥0) かつ Enterprise と同等の全機能・上限なし。
    expect(PLANS.internal.priceMonthlyJpy).toBe(0);
    expect(PLANS.internal.maxServices).toBe(PLANS.enterprise.maxServices);
    expect(PLANS.internal.maxSeats).toBe(PLANS.enterprise.maxSeats);
    expect(PLANS.internal.features).toEqual(PLANS.enterprise.features);
  });

  it('isPlanTier guards untrusted input', () => {
    expect(isPlanTier('pro')).toBe(true);
    expect(isPlanTier('platinum')).toBe(false);
    expect(isPlanTier(null)).toBe(false);
    expect(isPlanTier(2)).toBe(false);
  });

  it('getPlan falls back to default for bad input', () => {
    expect(getPlan('business').id).toBe('business');
    expect(getPlan('nope').id).toBe(DEFAULT_PLAN);
    expect(getPlan(undefined).id).toBe(DEFAULT_PLAN);
  });

  it('atLeastPlan compares rank inclusively', () => {
    expect(atLeastPlan('pro', 'pro')).toBe(true);
    expect(atLeastPlan('business', 'pro')).toBe(true);
    expect(atLeastPlan('free', 'pro')).toBe(false);
  });

  it('feature grants widen monotonically with tier', () => {
    expect(hasFeature('free', 'live-fetch')).toBe(true);
    expect(hasFeature('free', 'write-actions')).toBe(false);
    expect(hasFeature('pro', 'write-actions')).toBe(true);
    expect(hasFeature('pro', 'cross-service-sync')).toBe(false);
    expect(hasFeature('business', 'cross-service-sync')).toBe(true);
    expect(hasFeature('business', 'sso')).toBe(false);
    expect(hasFeature('enterprise', 'sso')).toBe(true);
  });

  it('isServiceUnlocked respects the per-plan cap', () => {
    expect(isServiceUnlocked('free', 4)).toBe(true); // index 0..4 = 5 services
    expect(isServiceUnlocked('free', 5)).toBe(false);
    expect(isServiceUnlocked('pro', 14)).toBe(true);
    expect(isServiceUnlocked('pro', 15)).toBe(false);
    // enterprise is unlimited
    expect(isServiceUnlocked('enterprise', 999)).toBe(true);
  });

  it('requiredPlanForServiceIndex returns the lowest unlocking tier', () => {
    expect(requiredPlanForServiceIndex(0)).toBeNull(); // free covers it
    expect(requiredPlanForServiceIndex(4)).toBeNull();
    expect(requiredPlanForServiceIndex(5)).toBe('pro');
    expect(requiredPlanForServiceIndex(15)).toBe('business');
    expect(requiredPlanForServiceIndex(40)).toBe('enterprise');
  });

  it('requiredPlanForFeature returns null when Free already grants it', () => {
    expect(requiredPlanForFeature('live-fetch')).toBeNull();
    expect(requiredPlanForFeature('write-actions')).toBe('pro');
    expect(requiredPlanForFeature('cross-service-sync')).toBe('business');
    expect(requiredPlanForFeature('sso')).toBe('enterprise');
  });
});
