/** @vitest-environment jsdom */
/**
 * LockScreen「閲覧のみ」スキップのテスト。
 *
 * ブラウザ版は起動時に Vault ロック画面が全画面表示され、初回はマスター
 * パスワード設定が必須になっている。ダッシュボードを見るだけのユーザー向けに
 * `onSkip` を渡すと「パスワードなしで開く（閲覧のみ）」ボタンが現れ、
 * Vault を初期化せずアプリへ入れる。ここではその表示と発火を検証する。
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { LockScreen } from '../LockScreen';

// Vault を「未初期化」に固定（初回設定画面 = skip ボタンが出る状態）。
vi.mock('../vault', () => ({
  getVault: () => ({
    status: () => Promise.resolve('uninitialized'),
    lock: () => undefined,
  }),
}));

const SKIP_LABEL = 'パスワードなしで開く（閲覧のみ）';

afterEach(() => {
  document.body.innerHTML = '';
  vi.clearAllMocks();
});

async function mount(props: { onUnlocked: () => void; onSkip?: () => void }) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(createElement(LockScreen, props));
    // useEffect の getVault().status() Promise を解決させる。
    await Promise.resolve();
  });
  return { container, root };
}

function findButton(container: HTMLElement, label: string): HTMLButtonElement | undefined {
  return [...container.querySelectorAll('button')].find((b) => b.textContent === label) as
    | HTMLButtonElement
    | undefined;
}

describe('LockScreen skip (閲覧のみ)', () => {
  it('onSkip 未指定ならスキップボタンは表示されない', async () => {
    const { container } = await mount({ onUnlocked: () => undefined });
    expect(findButton(container, SKIP_LABEL)).toBeUndefined();
  });

  it('onSkip 指定でスキップボタンが表示され、クリックで onSkip が呼ばれる', async () => {
    const onSkip = vi.fn();
    const { container } = await mount({ onUnlocked: () => undefined, onSkip });
    const btn = findButton(container, SKIP_LABEL);
    expect(btn).toBeDefined();
    await act(async () => {
      btn!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(onSkip).toHaveBeenCalledTimes(1);
  });
});
