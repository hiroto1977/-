import { useCallback, useEffect, useState } from 'react';
import { DEFAULT_PLAN, isPlanTier, type PlanTier } from '../../shared/plan';
import {
  hasInternalLicense,
  activateInternalLicense,
  deactivateInternalLicense,
} from './internalLicense';

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

export interface UsePlan {
  /** 実効プラン。社内ライセンスが有効なら常に 'internal' (全機能無償)。 */
  readonly plan: PlanTier;
  /** 手動でプランを切り替える (社内ライセンス有効時は内部の選択のみ保持)。 */
  readonly setPlan: (tier: PlanTier) => void;
  /** 社内ライセンス (全機能無償) が有効か。 */
  readonly internalUnlocked: boolean;
  /** 招待コードで社内ライセンスを有効化。成功で true。 */
  readonly redeemInvite: (code: string, holder?: string) => boolean;
  /** 社内ライセンスを解除し Free に戻す。 */
  readonly revokeInvite: () => void;
}

export function usePlan(): UsePlan {
  const [stored, setStoredState] = useState<PlanTier>(readStoredPlan);
  const [internalUnlocked, setInternalUnlocked] = useState<boolean>(hasInternalLicense);

  const setPlan = useCallback((tier: PlanTier) => {
    setStoredState(tier);
    try {
      localStorage.setItem(STORAGE_KEY, tier);
    } catch {
      // Persistence is best-effort; ignore quota/availability errors.
    }
  }, []);

  const redeemInvite = useCallback((code: string, holder = ''): boolean => {
    const ok = activateInternalLicense(code, holder);
    if (ok) setInternalUnlocked(true);
    return ok;
  }, []);

  const revokeInvite = useCallback(() => {
    deactivateInternalLicense();
    setInternalUnlocked(false);
  }, []);

  // Cross-tab sync: adopt changes made in another tab.
  useEffect(() => {
    function onStorage(e: StorageEvent) {
      if (e.key === STORAGE_KEY && isPlanTier(e.newValue)) setStoredState(e.newValue);
      if (e.key === 'servicehub.internalLicense') setInternalUnlocked(hasInternalLicense());
    }
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  // 社内ライセンスが有効なら全機能無償 = internal を実効プランとする。
  const plan: PlanTier = internalUnlocked ? 'internal' : stored;
  return { plan, setPlan, internalUnlocked, redeemInvite, revokeInvite };
}
