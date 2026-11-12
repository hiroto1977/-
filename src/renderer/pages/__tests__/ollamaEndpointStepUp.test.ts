// @vitest-environment jsdom
/**
 * **Ollama の接続先を同じ端末の外へ向けるときは、保管庫のパスワードで持ち主を確かめてから書く**
 * (2026-10-29 · パス 554 · threat: T-219)。
 *
 * 直す前の実測: 「接続テスト」の 1 押しで `localStorage` に書かれた (https のトンネル = 会話の
 * 本文が端末の外へ行く先でも同じ)。同じ端末 (ポート番号だけ) は今までどおり 1 押し —— 本文は
 * 端末を出ないので重さが違う。デスクトップ版は main が loopback に固定なので掛けない。
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import 'fake-indexeddb/auto';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { ConnectionSetup } from '../OllamaPage';
import { OLLAMA_ENDPOINT_KEY } from '../../network/ollamaWeb';
import { settleUntil, waitForElement, waitForText } from '../../__tests__/jsdomWait';
import { _resetVaultForTests, getVault } from '../../security/vault';
import { STEP_UP_WRONG_PASSWORD } from '../../security/egressStepUp';

const PW = 'correct-horse-battery-9';
let container: HTMLDivElement;
let root: Root | null = null;

async function dropDb(name: string): Promise<void> {
  await new Promise<void>((resolve) => {
    const req = indexedDB.deleteDatabase(name);
    req.onsuccess = () => resolve();
    req.onerror = () => resolve();
    req.onblocked = () => resolve();
  });
}

function typeInto(el: HTMLInputElement, value: string): void {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
  if (!setter) throw new Error('value setter missing');
  setter.call(el, value);
  el.dispatchEvent(new Event('input', { bubbles: true }));
}

async function mount(bridge: unknown) {
  (window as unknown as { serviceHub: unknown }).serviceHub = bridge;
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root!.render(createElement(ConnectionSetup, { running: false, errorMessage: 'CORS', onReconnect: () => {} }));
  });
  const endpoint = await waitForElement<HTMLInputElement>(() => container.querySelector<HTMLInputElement>('input[aria-label="Ollama の接続先"]'), '接続先の欄');
  const test = () => [...container.querySelectorAll('button')].find((b) => b.textContent === '接続テスト')!;
  return { endpoint, test, text: () => container.textContent ?? '' };
}

describe('Ollama の接続先: 端末の外へ向けるときは持ち主の確認 (threat: T-219)', () => {
  beforeEach(async () => {
    localStorage.clear();
    _resetVaultForTests();
    await dropDb('business-hub-vault');
    _resetVaultForTests();
    await getVault().initialize(PW);
  });
  afterEach(async () => {
    if (root) { await act(async () => { root!.unmount(); }); root = null; }
    container.remove();
  });

  it('同じ端末 (ポート番号だけ) は今までどおり 1 押しで書かれる', async () => {
    const { endpoint, test } = await mount({ getVersion: () => Promise.resolve('0.1.0-web') });
    await settleUntil(() => test().disabled === false, '接続テストが押せる');
    typeInto(endpoint, '11435');
    await act(async () => { test().click(); });
    expect(localStorage.getItem(OLLAMA_ENDPOINT_KEY)).toBe('11435');
    expect(container.querySelector('[data-step-up]')).toBeNull();
  });

  it('★ https のトンネルは押しただけでは書かれず、確認の段が出る —— 違うパスワードでは書かれない (threat: T-219)', async () => {
    const { endpoint, test } = await mount({ getVersion: () => Promise.resolve('0.1.0-web') });
    // 実行形態が分かるまで待つ (分かる前は確認を掛けない設計なので、ここで待たないと測る物が違う)。
    await settleUntil(() => test().disabled === false, '接続テストが押せる');
    typeInto(endpoint, 'https://abc.trycloudflare.com');
    await act(async () => { test().click(); });
    const stepUp = await waitForElement<HTMLElement>(() => container.querySelector<HTMLElement>('[data-step-up]'), '持ち主の確認');
    expect(localStorage.getItem(OLLAMA_ENDPOINT_KEY)).toBeNull();
    expect(stepUp.querySelector('[data-step-up-reason]')?.textContent ?? '').toContain('abc.trycloudflare.com');
    const pwIn = stepUp.querySelector<HTMLInputElement>('input[type="password"]')!;
    typeInto(pwIn, 'wrong-horse-battery-9');
    const ok = [...stepUp.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent === '確認して変更する')!;
    await settleUntil(() => ok.disabled === false, '確認のボタンが押せる');
    await act(async () => { ok.click(); });
    await waitForText(() => container.querySelector('[data-step-up-error]')?.textContent ?? '', STEP_UP_WRONG_PASSWORD);
    expect(localStorage.getItem(OLLAMA_ENDPOINT_KEY)).toBeNull();
  });

  it('★ 合うパスワードで初めて書かれる', async () => {
    const { endpoint, test, text } = await mount({ getVersion: () => Promise.resolve('0.1.0-web') });
    await settleUntil(() => test().disabled === false, '接続テストが押せる');
    typeInto(endpoint, 'https://abc.trycloudflare.com');
    await act(async () => { test().click(); });
    const stepUp = await waitForElement<HTMLElement>(() => container.querySelector<HTMLElement>('[data-step-up]'), '持ち主の確認');
    typeInto(stepUp.querySelector<HTMLInputElement>('input[type="password"]')!, PW);
    const ok = [...stepUp.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent === '確認して変更する')!;
    await settleUntil(() => ok.disabled === false, '確認のボタンが押せる');
    await act(async () => { ok.click(); });
    await waitForText(text, 'ポートを保存して再接続しました');
    expect(localStorage.getItem(OLLAMA_ENDPOINT_KEY)).toBe('https://abc.trycloudflare.com');
    expect(container.querySelector('[data-step-up]')).toBeNull();
  });

  it('デスクトップ版では掛けない (main が loopback に固定で、この欄は効かない)', async () => {
    const { endpoint, test } = await mount({ getVersion: () => Promise.resolve('0.1.0') });
    // 実行形態が「desktop」と分かるまで待つ —— 分かる前に押すと「分からないあいだは掛けない」側を測ることになる。
    await settleUntil(() => test().disabled === false, '接続テストが押せる');
    await new Promise((r) => setTimeout(r, 20));
    typeInto(endpoint, 'https://abc.trycloudflare.com');
    await act(async () => { test().click(); });
    expect(container.querySelector('[data-step-up]')).toBeNull();
    expect(localStorage.getItem(OLLAMA_ENDPOINT_KEY)).toBe('https://abc.trycloudflare.com');
  });
});
