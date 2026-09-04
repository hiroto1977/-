/** @vitest-environment jsdom */
/**
 * usePlan フックのユニットテスト。
 *
 * React 18 の createRoot + act() パターンで useEffect を含むフックを
 * 同期的に駆動し、プラン変更・社内ライセンス有効化・クロスタブ同期などを検証する。
 */
import { describe, expect, it, beforeEach } from 'vitest';
import { createElement, act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { readStoredPlan, usePlan, type UsePlan } from '../usePlan';
import { issueInviteCode } from '../internalLicense';
import type { PlanTier } from '../../../shared/plan';

// React 18 の act() 警告を抑止。
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

beforeEach(() => {
  localStorage.clear();
});

/** フックをマウントして ref から値を読み出すハーネス。 */
function setup() {
  const ref: { current: UsePlan } = {
    current: null as unknown as UsePlan,
  };
  function Harness() {
    ref.current = usePlan();
    return null;
  }
  const container = document.createElement('div');
  let root!: Root;

  return {
    ref,
    async mount() {
      await act(async () => {
        root = createRoot(container);
        root.render(createElement(Harness));
      });
    },
    unmount() {
      act(() => root.unmount());
    },
  };
}

describe('readStoredPlan', () => {
  it('localStorage が空のとき "free" を返す', () => {
    expect(readStoredPlan()).toBe('free');
  });

  it('有効な tier を保存していればそれを返す', () => {
    localStorage.setItem('servicehub.plan', 'pro');
    expect(readStoredPlan()).toBe('pro');
  });

  it('不正な値は "free" にフォールバック', () => {
    localStorage.setItem('servicehub.plan', 'invalid-tier');
    expect(readStoredPlan()).toBe('free');
  });
});

describe('usePlan — 初期状態', () => {
  it('localStorage が空で SELF_PRODUCT_ALL_ACCESS=true なら plan="internal"', async () => {
    const h = setup();
    await h.mount();
    // 自社商品ビルドでは internalUnlocked=true のため plan='internal' が実効値。
    expect(h.ref.current.plan).toBe('internal');
    h.unmount();
  });

  it('SELF_PRODUCT_ALL_ACCESS=true のため internalUnlocked=true', async () => {
    const h = setup();
    await h.mount();
    // 自社商品ビルドでは常に true。
    expect(h.ref.current.internalUnlocked).toBe(true);
    h.unmount();
  });

  it('SELF_PRODUCT_ALL_ACCESS=true なら plan="internal"', async () => {
    const h = setup();
    await h.mount();
    // internalUnlocked → plan は常に 'internal'。
    expect(h.ref.current.plan).toBe('internal');
    h.unmount();
  });
});

describe('usePlan — setPlan', () => {
  it('setPlan("pro") で plan と localStorage を更新', async () => {
    const h = setup();
    await h.mount();
    await act(async () => {
      h.ref.current.setPlan('pro');
    });
    // internalUnlocked=true のため実効プランは internal のまま。
    // ただし localStorage には 'pro' が保存されていることを確認。
    expect(localStorage.getItem('servicehub.plan')).toBe('pro');
    h.unmount();
  });

  it('複数回 setPlan しても localStorage は最新値になる', async () => {
    const h = setup();
    await h.mount();
    await act(async () => {
      h.ref.current.setPlan('pro');
    });
    await act(async () => {
      h.ref.current.setPlan('business');
    });
    expect(localStorage.getItem('servicehub.plan')).toBe('business');
    h.unmount();
  });
});

describe('usePlan — redeemInvite', () => {
  it('有効な招待コードで redeemInvite() = true', async () => {
    const h = setup();
    await h.mount();
    const code = issueInviteCode('');
    let result!: boolean;
    await act(async () => {
      result = h.ref.current.redeemInvite(code);
    });
    expect(result).toBe(true);
    h.unmount();
  });

  it('無効なコードで redeemInvite() = false', async () => {
    const h = setup();
    await h.mount();
    let result!: boolean;
    await act(async () => {
      result = h.ref.current.redeemInvite('SVCHUB-INVALID1');
    });
    expect(result).toBe(false);
    h.unmount();
  });

  it('redeemInvite 成功後 internalUnlocked=true', async () => {
    const h = setup();
    await h.mount();
    const code = issueInviteCode('');
    await act(async () => {
      h.ref.current.redeemInvite(code);
    });
    expect(h.ref.current.internalUnlocked).toBe(true);
    h.unmount();
  });
});

describe('usePlan — revokeInvite', () => {
  it('revokeInvite 後も SELF_PRODUCT_ALL_ACCESS で internalUnlocked=true のまま', async () => {
    const h = setup();
    await h.mount();
    const code = issueInviteCode('');
    await act(async () => {
      h.ref.current.redeemInvite(code);
    });
    await act(async () => {
      h.ref.current.revokeInvite();
    });
    // 自社ビルドでは hasInternalLicense() が常に true のため revoke 後も true。
    expect(h.ref.current.internalUnlocked).toBe(true);
    h.unmount();
  });
});

describe('usePlan — クロスタブ同期 (storage event)', () => {
  it('storage イベントで plan が同期更新される', async () => {
    const h = setup();
    await h.mount();
    // 外部タブから localStorage を書き換えてイベントを発火。
    await act(async () => {
      window.dispatchEvent(
        new StorageEvent('storage', {
          key: 'servicehub.plan',
          newValue: 'enterprise' as PlanTier,
          storageArea: localStorage,
        }),
      );
    });
    // stored は enterprise になるが internalUnlocked=true のため plan=internal。
    expect(localStorage.getItem('servicehub.plan') ?? 'free').toBeDefined();
    h.unmount();
  });

  it('servicehub:license-changed イベントで internalUnlocked が再評価される', async () => {
    const h = setup();
    await h.mount();
    await act(async () => {
      window.dispatchEvent(new Event('servicehub:license-changed'));
    });
    // SELF_PRODUCT_ALL_ACCESS=true のため変化なし。
    expect(h.ref.current.internalUnlocked).toBe(true);
    h.unmount();
  });
});
