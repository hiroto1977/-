import { useCallback, useEffect, useState } from 'react';
import { DEFAULT_PLAN, isPlanTier, type PlanTier } from '../../shared/plan';
import {
  activateInternalLicense,
  allAccessSource,
  deactivateInternalLicense,
  hasInternalLicense,
  type AllAccessSource,
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
  /**
   * **なぜ**開いているか (パス 158)。画面はこれを見て文面と操作を決める ——
   * `build` のときに「解除」を出すと、押しても何も起きない操作になる。
   */
  readonly licenseSource: AllAccessSource;
  /** 招待コードで社内ライセンスを有効化。成功で true。 */
  readonly redeemInvite: (code: string, holder?: string) => boolean;
  /** 社内ライセンスを解除し Free に戻す。**戻せたときだけ true** (パス 158)。 */
  readonly revokeInvite: () => boolean;
}

export function usePlan(): UsePlan {
  const [stored, setStoredState] = useState<PlanTier>(readStoredPlan);
  const [internalUnlocked, setInternalUnlocked] = useState<boolean>(hasInternalLicense);
  const [licenseSource, setLicenseSource] = useState<AllAccessSource>(allAccessSource);

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
    if (ok) {
      setInternalUnlocked(true);
      setLicenseSource(allAccessSource());
      // 他の usePlan インスタンス (App など) にも即時反映させる。
      window.dispatchEvent(new Event('servicehub:license-changed'));
    }
    return ok;
  }, []);

  /*
   * **効いたかどうかを返す** (パス 158)。以前は `setInternalUnlocked(false)` を
   * 呼んでから同じ tick で `servicehub:license-changed` を投げており、その
   * listener が `hasInternalLicense()` (自社ビルドでは常に true) で
   * **直後に true へ戻していた** —— React が 1 回の描画に畳むので、押しても
   * 画面は何も変わらなかった。現物を読み直して返す。
   */
  const revokeInvite = useCallback((): boolean => {
    const freed = deactivateInternalLicense();
    setInternalUnlocked(hasInternalLicense());
    setLicenseSource(allAccessSource());
    window.dispatchEvent(new Event('servicehub:license-changed'));
    return freed;
  }, []);

  // Cross-tab sync (storage event) + same-tab sync (custom event) so every
  // usePlan instance reflects a license change immediately.
  useEffect(() => {
    function onStorage(e: StorageEvent) {
      if (e.key === STORAGE_KEY && isPlanTier(e.newValue)) setStoredState(e.newValue);
      if (e.key === 'servicehub.internalLicense') {
        setInternalUnlocked(hasInternalLicense());
        setLicenseSource(allAccessSource());
      }
    }
    function onLicenseChanged() {
      setInternalUnlocked(hasInternalLicense());
      setLicenseSource(allAccessSource());
    }
    window.addEventListener('storage', onStorage);
    window.addEventListener('servicehub:license-changed', onLicenseChanged);
    return () => {
      window.removeEventListener('storage', onStorage);
      window.removeEventListener('servicehub:license-changed', onLicenseChanged);
    };
  }, []);

  // 社内ライセンスが有効なら全機能無償 = internal を実効プランとする。
  const plan: PlanTier = internalUnlocked ? 'internal' : stored;
  return { plan, setPlan, internalUnlocked, licenseSource, redeemInvite, revokeInvite };
}
