import { useCallback, useEffect, useState } from 'react';
import { DEFAULT_PLAN, isPlanTier, type PlanTier } from '../../shared/plan';

/**
 * Local plan persistence. The chosen tier lives in `localStorage` (no
 * server, no billing yet — matches the "まずローカル保存で拡張" decision).
 * A storage event keeps multiple tabs / windows in sync.
 */
const STORAGE_KEY = 'servicehub.plan';

export function readStoredPlan(): PlanTier {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return isPlanTier(raw) ? raw : DEFAULT_PLAN;
  } catch {
    return DEFAULT_PLAN;
  }
}

export function usePlan(): { plan: PlanTier; setPlan: (tier: PlanTier) => void } {
  const [plan, setPlanState] = useState<PlanTier>(readStoredPlan);

  const setPlan = useCallback((tier: PlanTier) => {
    setPlanState(tier);
    try {
      localStorage.setItem(STORAGE_KEY, tier);
    } catch {
      // Persistence is best-effort; ignore quota/availability errors.
    }
  }, []);

  // Cross-tab sync: adopt changes made in another tab.
  useEffect(() => {
    function onStorage(e: StorageEvent) {
      if (e.key === STORAGE_KEY && isPlanTier(e.newValue)) setPlanState(e.newValue);
    }
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  return { plan, setPlan };
}
