/** @vitest-environment jsdom */
/**
 * **業務記録を暗号化した端末では、記録の鍵を開くまで殻を出さず、施錠で鍵を落とす** (2026-11-21)。
 *
 * 記録の鍵はメモリにしか無い (`data/recordEncryption.ts`)。鍵の無いまま殻を出すと、記録を読むどの画面も
 * 「暗号化されたレコードです」で投げる。保管庫を施錠しても記録の鍵が残っていれば、施錠の画面の裏で記録は
 * 読めるままになる。ここは `App` を丸ごと動かして 3 つを留める:
 *
 *   - 起動し直した端末では、保管庫を開いた後に「業務記録の鍵を開く」が出る (殻は出ない)
 *   - 正しいパスフレーズで殻へ進み、記録が読める
 *   - 施錠すると記録の鍵も落ちる
 *
 * 対照: 暗号化していない端末では、この画面は出ない。
 */
import 'fake-indexeddb/auto';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { webcrypto } from 'node:crypto';
import { App } from '../App';
import { _resetVaultForTests, getVault } from '../security/vault';
import { _resetLockSubscribersForTests, lockEverywhere } from '../security/lockWorkspace';
import { getRecordStore, _resetRecordStoreForTests } from '../data/store';
import { enableEncryption, isRecordStoreUnlocked } from '../data/recordEncryption';
import { waitForElement } from './jsdomWait';

if (!('subtle' in globalThis.crypto)) {
  Object.defineProperty(globalThis, 'crypto', { value: webcrypto, configurable: true });
}

const PASSWORD = 'correct-horse-battery-staple';
const RECORD_PASS = 'record-key-passphrase';

beforeAll(() => {
  (globalThis as unknown as { serviceHub: unknown }).serviceHub = {
    getVersion: () => Promise.resolve('0.1.0-web'),
    listConfigured: () => Promise.resolve([]),
    fetchSnapshot: () => Promise.resolve({ ok: false, code: 'x', message: 'x' }),
    invoke: () => Promise.resolve({ ok: false, code: 'x', message: 'x' }),
    openExternal: () => Promise.resolve(),
    oauthSupported: () => Promise.resolve(false),
    setToken: () => Promise.resolve(),
    clearToken: () => Promise.resolve(),
    storageProtection: () => Promise.resolve({ mechanism: 'os-keychain' }),
  };
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
});

function clearIdb(name: string): Promise<void> {
  return new Promise((resolve) => {
    const req = indexedDB.deleteDatabase(name);
    req.onsuccess = () => resolve();
    req.onerror = () => resolve();
    req.onblocked = () => resolve();
  });
}

let container: HTMLDivElement;
let root: Root | null = null;

async function mountApp() {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root!.render(createElement(App));
  });
}

const unlockScreen = () => container.querySelector('[data-record-unlock]');

beforeEach(async () => {
  localStorage.clear();
  _resetVaultForTests();
  _resetLockSubscribersForTests();
  _resetRecordStoreForTests();
  await clearIdb('business-hub-vault');
  await clearIdb('business-hub-data');
  await getVault().initialize(PASSWORD); // 保管庫は開いた状態 (ロック画面は出ない)
});

afterEach(async () => {
  if (root) {
    await act(async () => {
      root!.unmount();
    });
    root = null;
  }
  container.remove();
  _resetLockSubscribersForTests();
});

describe('App — 業務記録の鍵', () => {
  it('対照: 暗号化していない端末では、記録の鍵を開く画面は出ない', async () => {
    await mountApp();
    await waitForElement(() => container.querySelector('nav, aside, [data-village-shell], main'), '殻');
    expect(unlockScreen()).toBeNull();
  });

  it('★ 起動し直した端末では、鍵を開くまで殻を出さず、正しいパスフレーズで殻へ進む', async () => {
    const rec = await getRecordStore().insert('sales-entries', { amount: 42 });
    await enableEncryption(RECORD_PASS);
    _resetRecordStoreForTests(); // 次の起動 (記録の鍵はメモリにしか無い)
    await mountApp();
    const screen = await waitForElement(() => unlockScreen(), '記録の鍵を開く画面');
    expect(screen.textContent).toContain('業務記録の鍵を開く');
    const input = container.querySelector<HTMLInputElement>('[data-record-unlock-passphrase]')!;
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!;
    setter.call(input, RECORD_PASS);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    await act(async () => {
      container.querySelector<HTMLButtonElement>('[data-record-unlock-submit]')!.click();
    });
    await vi.waitFor(() => expect(unlockScreen()).toBeNull(), { timeout: 20_000 });
    expect(isRecordStoreUnlocked()).toBe(true);
    expect((await getRecordStore().get(rec.id))?.data).toEqual({ amount: 42 });
  }, 40_000);

  it('★ 施錠すると、記録の鍵もメモリから落ちる', async () => {
    await enableEncryption(RECORD_PASS);
    await mountApp();
    expect(unlockScreen()).toBeNull();
    expect(isRecordStoreUnlocked()).toBe(true);
    await act(async () => {
      lockEverywhere();
    });
    await vi.waitFor(() => expect(isRecordStoreUnlocked()).toBe(false));
    expect(getVault().isUnlocked()).toBe(false);
  }, 40_000);
});
