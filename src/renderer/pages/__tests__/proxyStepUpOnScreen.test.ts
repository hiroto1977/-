// @vitest-environment jsdom
/**
 * **BYO プロキシの保存は、保管庫のパスワードで持ち主を確かめてから書く**
 * (2026-10-29 · パス 554 · threat: T-219)。
 *
 * ## 直す前の実測 (jsdom で実物の `ProxySection` を描き、実際に打って押す · ブラウザ版)
 * 「設定する」→ URL と共有秘密を打つ →「保存」の **1 押しで IndexedDB (平文) に入った**。
 * 確認ダイアログも本人確認も無い。main の本人確認 (T-183) は IPC にだけ掛かり、この保存は
 * IPC を通らない。以後、経由する全要求に `Authorization` ごと渡る先が、資格情報を書くより
 * 軽い手で変わっていた。
 *
 * ## この検査が持つもの (振る舞い)
 * 実物の節 + 実物の保管庫 (fake-indexeddb · 初期化済み) で、保存を押しても確認が出るだけで
 * 書かれない / 違うパスワードでは書かれず理由が出る / 合えば書かれる / やめれば書かれない。
 * 削除は今までどおり `confirm` (送り先を増やさない操作)。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import 'fake-indexeddb/auto';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import React from 'react';
import { settleUntil, waitForElement, waitForText } from '../../__tests__/jsdomWait';
import { ProxySection } from '../SettingsPage';
import { setProxyConfig, getProxyConfig } from '../../network/proxy';
import { _resetVaultForTests, getVault } from '../../security/vault';
import { STEP_UP_CANCELLED, STEP_UP_WRONG_PASSWORD } from '../../security/egressStepUp';

const PW = 'correct-horse-battery-9';
const BROWSER = { getVersion: () => Promise.resolve('0.1.0-web') };
let root: Root | null = null;

async function dropDb(name: string): Promise<void> {
  await new Promise<void>((resolve) => {
    const req = indexedDB.deleteDatabase(name);
    req.onsuccess = () => resolve();
    req.onerror = () => resolve();
    req.onblocked = () => resolve();
  });
}

async function mount() {
  (window as unknown as { serviceHub: unknown }).serviceHub = BROWSER;
  const container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root!.render(React.createElement(ProxySection));
  });
  const text = () => container.textContent ?? '';
  await settleUntil(() => /未設定|設定済み/.test(text()), '保管層の読みが届く');
  return { container, text };
}

function buttons(container: HTMLElement): HTMLButtonElement[] {
  return [...container.querySelectorAll('button')];
}

function typeInto(el: HTMLInputElement, value: string): void {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
  if (!setter) throw new Error('value setter missing');
  setter.call(el, value);
  el.dispatchEvent(new Event('input', { bubbles: true }));
}

/** 「設定する」→ 欄を埋めて「保存」→ 確認の段が出る所まで。 */
async function pressSave(container: HTMLElement) {
  const open = buttons(container).find((b) => b.textContent === '設定する');
  expect(open, '「設定する」が出ていない').not.toBeUndefined();
  await act(async () => { open!.click(); });
  const urlIn = await waitForElement<HTMLInputElement>(() => container.querySelector<HTMLInputElement>('input[type="text"]'), 'URL 欄');
  const secIn = await waitForElement<HTMLInputElement>(() => container.querySelector<HTMLInputElement>('input[type="password"]'), '共有秘密の欄');
  typeInto(urlIn, 'https://my-worker.example.com/proxy');
  typeInto(secIn, 'SUPER-SECRET-0123456789');
  const save = buttons(container).find((b) => b.textContent === '保存');
  expect(save?.disabled).toBe(false);
  await act(async () => { save!.click(); });
  const stepUp = await waitForElement<HTMLElement>(() => container.querySelector<HTMLElement>('[data-step-up]'), '持ち主の確認');
  return stepUp;
}

async function typePasswordAndConfirm(container: HTMLElement, pw: string) {
  const pwIn = await waitForElement<HTMLInputElement>(
    () => container.querySelector<HTMLInputElement>('[data-step-up] input[type="password"]'),
    '確認のパスワード欄',
  );
  typeInto(pwIn, pw);
  const ok = [...container.querySelectorAll<HTMLButtonElement>('[data-step-up] button')].find((b) => b.textContent === '確認して変更する');
  expect(ok, '「確認して変更する」が無い').not.toBeUndefined();
  await settleUntil(() => ok!.disabled === false, '確認のボタンが押せる');
  await act(async () => { ok!.click(); });
}

describe('BYO プロキシの保存は持ち主の確認を通る (threat: T-219)', () => {
  beforeEach(async () => {
    document.body.innerHTML = '';
    await setProxyConfig(null);
    _resetVaultForTests();
    await dropDb('business-hub-vault');
    _resetVaultForTests();
    await getVault().initialize(PW);
  });
  afterEach(async () => {
    if (root) { await act(async () => { root!.unmount(); }); root = null; }
    vi.restoreAllMocks();
  });

  it('★ 「保存」を押しただけでは書かれず、確認の段が出る —— 文は送り先のホストを名乗り共有秘密を映さない (threat: T-219)', async () => {
    const { container } = await mount();
    const stepUp = await pressSave(container);
    expect(await getProxyConfig(), '確認の前に書かれている').toBeNull();
    const reason = stepUp.querySelector('[data-step-up-reason]')?.textContent ?? '';
    expect(reason).toContain('my-worker.example.com');
    expect(reason).not.toContain('SUPER-SECRET');
    expect(reason).toContain('保管庫のパスワード');
    expect(buttons(container).find((b) => b.textContent === '保存')?.disabled, '確認中は保存を押せない').toBe(true);
  });

  it('★ 違うパスワードでは書かれず、理由が出る (threat: T-219)', async () => {
    const { container } = await mount();
    await pressSave(container);
    await typePasswordAndConfirm(container, 'wrong-horse-battery-9');
    await waitForText(() => container.querySelector('[data-step-up-error]')?.textContent ?? '', STEP_UP_WRONG_PASSWORD);
    expect(await getProxyConfig()).toBeNull();
    // 確認の段は残り、やり直せる。
    expect(container.querySelector('[data-step-up]')).not.toBeNull();
  });

  it('★ 合うパスワードで初めて書かれ、札が「設定済み」になる', async () => {
    const { container, text } = await mount();
    await pressSave(container);
    await typePasswordAndConfirm(container, PW);
    await waitForText(text, 'プロキシ設定を保存しました');
    expect(await getProxyConfig()).toEqual({ url: 'https://my-worker.example.com/proxy', sharedSecret: 'SUPER-SECRET-0123456789' });
    expect(text()).toContain('設定済み');
    expect(container.querySelector('[data-step-up]'), '書いた後に確認の段が残っている').toBeNull();
  });

  it('やめれば書かれず、やめたことを言う', async () => {
    const { container, text } = await mount();
    await pressSave(container);
    const cancel = [...container.querySelectorAll<HTMLButtonElement>('[data-step-up] button')].find((b) => b.textContent === 'やめる');
    await act(async () => { cancel!.click(); });
    await waitForText(text, STEP_UP_CANCELLED);
    expect(await getProxyConfig()).toBeNull();
    expect(container.querySelector('[data-step-up]')).toBeNull();
  });

  it('削除は今までどおり confirm だけ (送り先を増やさない操作に持ち主の確認は要らない)', async () => {
    await setProxyConfig({ url: 'https://old.example.com/proxy' });
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const { container, text } = await mount();
    const del = buttons(container).find((b) => b.textContent === '削除');
    expect(del).not.toBeUndefined();
    await act(async () => { del!.click(); });
    await waitForText(text, 'プロキシ設定を削除しました');
    expect(await getProxyConfig()).toBeNull();
    expect(container.querySelector('[data-step-up]')).toBeNull();
  });
});
