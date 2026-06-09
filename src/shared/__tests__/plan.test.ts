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

  it('exposes the exact metadata and feature set per tier', () => {
    // 各プランの id/label/audience/上限/価格 と features を固定し、PLANS 定義内の
    // StringLiteral / Set 要素の変異を撃墜する。
    expect(PLANS.free).toMatchObject({ id: 'free', label: 'Free', audience: '個人事業主・お試し', maxServices: 5, maxSeats: 1, priceMonthlyJpy: 0 });
    expect(PLANS.free.features).toEqual(new Set(['live-fetch']));
    expect(PLANS.pro).toMatchObject({ id: 'pro', label: 'Pro', audience: '個人〜小規模事業者', maxServices: 15, maxSeats: 3, priceMonthlyJpy: 2_980 });
    expect(PLANS.pro.features).toEqual(new Set(['live-fetch', 'write-actions', 'ai-advisor']));
    expect(PLANS.business).toMatchObject({ id: 'business', label: 'Business', audience: '中小企業・チーム', maxServices: 40, maxSeats: 25, priceMonthlyJpy: 19_800 });
    expect(PLANS.business.features).toEqual(new Set(['live-fetch', 'write-actions', 'cross-service-sync', 'ai-advisor', 'team-seats', 'audit-log']));
    expect(PLANS.enterprise).toMatchObject({ id: 'enterprise', label: 'Enterprise', audience: '大企業・全機能', maxServices: Infinity, maxSeats: Infinity, priceMonthlyJpy: 98_000 });
    expect(PLANS.enterprise.features).toEqual(new Set(['live-fetch', 'write-actions', 'cross-service-sync', 'ai-advisor', 'team-seats', 'audit-log', 'sso']));
    expect(PLANS.internal).toMatchObject({ id: 'internal', label: '社内ライセンス', audience: '自社・招待者 (全機能無償)', maxServices: Infinity, maxSeats: Infinity, priceMonthlyJpy: 0 });
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
