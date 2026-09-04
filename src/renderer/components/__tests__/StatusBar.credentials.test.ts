/** @vitest-environment jsdom */
/**
 * StatusBar — 資格情報の保存 / 認証の失敗が **画面に出る**ことのテスト。
 *
 * SSR (StatusBar.render.test.ts) では useEffect もクリックも動かないので、
 * 失敗経路はここで jsdom + react-dom/client で見る。
 */
import { describe, expect, it } from 'vitest';
import { createElement, act } from 'react';
import { createRoot } from 'react-dom/client';
import { StatusBar } from '../StatusBar';

// react-dom/client + act の連携を有効化 (act 警告の抑止)。
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/**
 * React の制御 input へ値を入れる。`input.value = …` だけでは React が値の変化を
 * 追跡できず onChange が走らないため、プロトタイプ側の setter を使う。
 */
function typeInto(input: HTMLInputElement, value: string): void {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
  setter?.call(input, value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
}

describe('StatusBar — 資格情報の保存 / 認証の失敗', () => {
  /**
   * 監査前の姿:
   * - `saveToken` は `setToken` の戻り値を見ず、入力欄を閉じて `onRefresh()` まで
   *   呼んでいた。main は上限超えを `return;` で黙って捨てるので、**保存されて
   *   いないのに保存したように見えた**。
   * - `browserAuth` は失敗を `console.error` にだけ出していた (コメントは
   *   「errorMessage スロットに出す」と書いてあったが、`errorMessage` は prop
   *   なのでここからは書けない)。同意拒否・通信失敗・成功が区別できなかった。
   */
  const setup = { label: 'API トークン', placeholder: 'Bearer token' } as const;

  function mount(hub: Record<string, unknown>) {
    (window as unknown as { serviceHub: unknown }).serviceHub = hub;
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    return { container, root };
  }

  it('保存が拒否されたら理由を出し、入力欄を閉じない', async () => {
    const { container, root } = mount({
      oauthSupported: () => Promise.resolve(false),
      setToken: () => Promise.resolve({ ok: false, code: 'invalid_token', message: '資格情報が長すぎます' }),
      clearToken: () => Promise.resolve(),
    });
    await act(async () => {
      root.render(createElement(StatusBar, { who: 'GitHub', serviceId: 'github', tokenSetup: setup }));
    });
    const edit = [...container.querySelectorAll('button')].find((b) => b.textContent === setup.label);
    await act(async () => edit?.click());
    const input = container.querySelector('input[type=password]') as HTMLInputElement;
    await act(async () => {
      typeInto(input, 'x'.repeat(10));
    });
    const save = [...container.querySelectorAll('button')].find((b) => b.textContent === '保存');
    await act(async () => {
      save?.click();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(container.querySelector('[data-credential-error]')?.textContent).toContain('保存できませんでした');
    expect(container.querySelector('[data-credential-error]')?.textContent).toContain('長すぎます');
    // 入力欄は開いたまま — 打ち直せるようにする。
    expect(container.querySelector('input[type=password]')).not.toBeNull();
    act(() => root.unmount());
    container.remove();
  });

  it('保存が通れば理由は出ず、入力欄を閉じる', async () => {
    const { container, root } = mount({
      oauthSupported: () => Promise.resolve(false),
      setToken: () => Promise.resolve({ ok: true }),
      clearToken: () => Promise.resolve(),
    });
    await act(async () => {
      root.render(createElement(StatusBar, { who: 'GitHub', serviceId: 'github', tokenSetup: setup }));
    });
    const edit = [...container.querySelectorAll('button')].find((b) => b.textContent === setup.label);
    await act(async () => edit?.click());
    const input = container.querySelector('input[type=password]') as HTMLInputElement;
    await act(async () => {
      typeInto(input, 'ghp_ok');
    });
    const save = [...container.querySelectorAll('button')].find((b) => b.textContent === '保存');
    await act(async () => {
      save?.click();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(container.querySelector('[data-credential-error]')).toBeNull();
    expect(container.querySelector('input[type=password]')).toBeNull();
    act(() => root.unmount());
    container.remove();
  });

  it('OAuth の失敗を画面に出す (console だけに出さない)', async () => {
    const { container, root } = mount({
      oauthSupported: () => Promise.resolve(true),
      authorize: () => Promise.resolve({ ok: false, code: 'authorize_failed', message: '同意が拒否されました' }),
      setToken: () => Promise.resolve({ ok: true }),
      clearToken: () => Promise.resolve(),
    });
    await act(async () => {
      root.render(createElement(StatusBar, { who: 'Drive', serviceId: 'drive', tokenSetup: setup }));
    });
    const auth = [...container.querySelectorAll('button')].find((b) => b.textContent?.includes('ブラウザで認証'));
    expect(auth).not.toBeUndefined();
    await act(async () => {
      auth?.click();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(container.querySelector('[data-credential-error]')?.textContent).toContain('認証できませんでした');
    expect(container.querySelector('[data-credential-error]')?.textContent).toContain('拒否されました');
    act(() => root.unmount());
    container.remove();
  });

  it('OAuth が通れば理由は出ない', async () => {
    const { container, root } = mount({
      oauthSupported: () => Promise.resolve(true),
      authorize: () => Promise.resolve({ ok: true, data: {} }),
      setToken: () => Promise.resolve({ ok: true }),
      clearToken: () => Promise.resolve(),
    });
    await act(async () => {
      root.render(createElement(StatusBar, { who: 'Drive', serviceId: 'drive', tokenSetup: setup }));
    });
    const auth = [...container.querySelectorAll('button')].find((b) => b.textContent?.includes('ブラウザで認証'));
    await act(async () => {
      auth?.click();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(container.querySelector('[data-credential-error]')).toBeNull();
    act(() => root.unmount());
    container.remove();
  });
});
