// @vitest-environment jsdom
/**
 * 業務記録の暗号化の画面 (`RecordEncryptionPanel`) と、記録の鍵を開く画面 (`RecordUnlockScreen`) —— 2026-11-21。
 *
 * セキュリティ診断の 5 つの未達 (「この版に無い保護」) を直したときの配線を、実物の保管層 (fake-indexeddb) の上で
 * 実際に打って押して確かめる: 有効化で記録が封緘されること・診断の暗号化と改ざん検知が満たされること・
 * 起動し直すと鍵を開くまで読めないこと・解除で平文に戻ること・診断の助言が名指す画面の名前が実在すること。
 */
import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { waitForElement } from '../../__tests__/jsdomWait';
import { resetRecordStore } from '../../__tests__/recordStoreHarness';
import { getRecordStore, _resetRecordStoreForTests } from '../../data/store';
import { isSealedData } from '../../data/recordCipher';
import { enableEncryption, isEncryptionEnabled, isRecordStoreUnlocked } from '../../data/recordEncryption';
import { currentDbSecurityInputs } from '../../data/dbPosture';
import { buildDbSecurityReport } from '../../../shared/dbSecurityPosture';
import { RecordEncryptionPanel, recordEncryptionRefusal } from '../RecordEncryptionPanel';
import { RecordUnlockScreen, RECORD_UNLOCK_ERASE_CONFIRM } from '../../security/RecordUnlockScreen';
import { EncryptedCopyPanel } from '../EncryptedCopyPanel';
import { MIN_PASSWORD_LENGTH } from '../../security/vault';

const PASS = 'record-key-passphrase';
let container: HTMLElement;

function type(el: HTMLInputElement, value: string): void {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
  if (!setter) throw new Error('value setter missing');
  setter.call(el, value);
  el.dispatchEvent(new Event('input', { bubbles: true }));
}

async function render(el: React.ReactElement) {
  container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(el);
  });
}

async function press(button: HTMLButtonElement) {
  await act(async () => {
    button.click();
  });
}

const q = <T extends Element>(sel: string) => container.querySelector<T>(sel);
const report = () => buildDbSecurityReport(currentDbSecurityInputs());
const ok = (id: string) => report().checks.find((c) => c.id === id)!.ok;

beforeEach(async () => {
  document.body.innerHTML = '';
  localStorage.clear();
  await resetRecordStore();
});

describe('業務記録の暗号化の画面', () => {
  it('★ パスフレーズを 2 度打って押すと記録が封緘され、診断の暗号化と改ざん検知が満たされる', async () => {
    const rec = await getRecordStore().insert('sales-entries', { amount: 777 });
    expect(ok('encryption')).toBe(false);
    expect(ok('integrity')).toBe(false);
    await render(React.createElement(RecordEncryptionPanel));
    expect(q('[data-record-encryption]')?.getAttribute('data-record-encryption')).toBe('disabled');
    type(q<HTMLInputElement>('[data-record-encryption-passphrase]')!, PASS);
    type(q<HTMLInputElement>('[data-record-encryption-confirm]')!, PASS);
    await press(q<HTMLButtonElement>('[data-record-encryption-enable]')!);
    await waitForElement(() => q('[data-record-encryption-result="ok"]'), '暗号化した文', { timeoutMs: 20_000 });
    expect(q('[data-record-encryption]')?.getAttribute('data-record-encryption')).toBe('enabled');
    expect(isEncryptionEnabled()).toBe(true);
    const raw = (await getRecordStore().exportAll()).find((r) => r.id === rec.id)!;
    expect(isSealedData(raw.data)).toBe(true);
    expect(ok('encryption')).toBe(true);
    expect(ok('integrity')).toBe(true);
    expect(q<HTMLInputElement>('[data-record-encryption-passphrase]')!.value).toBe('');
  }, 40_000);

  it('★ 2 つの欄が合わなければ断り、暗号化しない', async () => {
    await render(React.createElement(RecordEncryptionPanel));
    type(q<HTMLInputElement>('[data-record-encryption-passphrase]')!, PASS);
    type(q<HTMLInputElement>('[data-record-encryption-confirm]')!, PASS + 'x');
    await press(q<HTMLButtonElement>('[data-record-encryption-enable]')!);
    await waitForElement(() => q('[data-record-encryption-result="error"]'), '断りの文');
    expect(q('[data-record-encryption-result="error"]')?.textContent).toContain('一致しません');
    expect(isEncryptionEnabled()).toBe(false);
  });

  it('★ 下限より短いパスフレーズは断り、理由に下限を言う', async () => {
    const short = 'a'.repeat(MIN_PASSWORD_LENGTH - 1);
    await render(React.createElement(RecordEncryptionPanel));
    type(q<HTMLInputElement>('[data-record-encryption-passphrase]')!, short);
    type(q<HTMLInputElement>('[data-record-encryption-confirm]')!, short);
    await press(q<HTMLButtonElement>('[data-record-encryption-enable]')!);
    await waitForElement(() => q('[data-record-encryption-result="error"]'), '断りの文');
    expect(q('[data-record-encryption-result="error"]')?.textContent).toContain(`${MIN_PASSWORD_LENGTH} 文字以上`);
    expect(isEncryptionEnabled()).toBe(false);
  });

  it('★ 解除は、違うパスフレーズでは断り、正しいパスフレーズで平文へ戻す', async () => {
    const rec = await getRecordStore().insert('sales-entries', { amount: 5 });
    await enableEncryption(PASS);
    await render(React.createElement(RecordEncryptionPanel));
    type(q<HTMLInputElement>('[data-record-encryption-passphrase]')!, 'wrong-passphrase');
    await press(q<HTMLButtonElement>('[data-record-encryption-disable]')!);
    await waitForElement(() => q('[data-record-encryption-result="error"]'), '断りの文', { timeoutMs: 20_000 });
    expect(q('[data-record-encryption-result="error"]')?.textContent).toContain('パスフレーズが違います');
    expect(isEncryptionEnabled()).toBe(true);
    type(q<HTMLInputElement>('[data-record-encryption-passphrase]')!, PASS);
    await press(q<HTMLButtonElement>('[data-record-encryption-disable]')!);
    await waitForElement(() => q('[data-record-encryption-result="ok"]'), '解除した文', { timeoutMs: 20_000 });
    expect(isEncryptionEnabled()).toBe(false);
    const raw = (await getRecordStore().exportAll()).find((r) => r.id === rec.id)!;
    expect(raw.data).toEqual({ amount: 5 });
  }, 40_000);

  it('断りの判定: 空・不一致・一致', () => {
    expect(recordEncryptionRefusal('', '')).toContain('入力してください');
    expect(recordEncryptionRefusal('a', 'b')).toContain('一致しません');
    expect(recordEncryptionRefusal('same', 'same')).toBeNull();
  });
});

describe('記録の鍵を開く画面 (起動し直したとき)', () => {
  async function encryptAndRestart() {
    const rec = await getRecordStore().insert('sales-entries', { amount: 9 });
    await enableEncryption(PASS);
    _resetRecordStoreForTests(); // 次の起動 (鍵はメモリにしか無い)
    return rec;
  }

  it('★ 違うパスフレーズでは開かず、正しいパスフレーズで開いて画面を通す', async () => {
    const rec = await encryptAndRestart();
    expect(isRecordStoreUnlocked()).toBe(false);
    const onUnlocked = vi.fn();
    await render(React.createElement(RecordUnlockScreen, { onUnlocked }));
    type(q<HTMLInputElement>('[data-record-unlock-passphrase]')!, 'wrong-passphrase');
    await press(q<HTMLButtonElement>('[data-record-unlock-submit]')!);
    await waitForElement(() => q('[data-record-unlock-error]'), '断りの文', { timeoutMs: 20_000 });
    expect(q('[data-record-unlock-error]')?.textContent).toContain('パスフレーズが違います');
    expect(onUnlocked).not.toHaveBeenCalled();
    type(q<HTMLInputElement>('[data-record-unlock-passphrase]')!, PASS);
    await press(q<HTMLButtonElement>('[data-record-unlock-submit]')!);
    await vi.waitFor(() => expect(onUnlocked).toHaveBeenCalledTimes(1), { timeout: 20_000 });
    expect(isRecordStoreUnlocked()).toBe(true);
    expect((await getRecordStore().get(rec.id))?.data).toEqual({ amount: 9 });
  }, 40_000);

  it('空のまま押しても鍵を作りに行かず、入力を求める', async () => {
    await encryptAndRestart();
    await render(React.createElement(RecordUnlockScreen, { onUnlocked: () => undefined }));
    await press(q<HTMLButtonElement>('[data-record-unlock-submit]')!);
    await waitForElement(() => q('[data-record-unlock-error]'), '断りの文');
    expect(q('[data-record-unlock-error]')?.textContent).toContain('入力してください');
  });

  it('★ パスフレーズを忘れたときの逃げ口: 確かめてから、設定と同じ橋で全部消す (断れば何もしない)', async () => {
    await encryptAndRestart();
    const eraseAll = vi.fn(async () => ({ kind: 'desktop' as const, removed: [], failed: [], restarting: true }));
    (window as unknown as { serviceHub: unknown }).serviceHub = { eraseAll };
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValueOnce(false).mockReturnValueOnce(true);
    try {
      await render(React.createElement(RecordUnlockScreen, { onUnlocked: () => undefined }));
      const erase = q<HTMLButtonElement>('[data-record-unlock-erase]')!;
      await press(erase);
      expect(confirmSpy).toHaveBeenLastCalledWith(RECORD_UNLOCK_ERASE_CONFIRM);
      expect(eraseAll).not.toHaveBeenCalled();
      await press(erase);
      await vi.waitFor(() => expect(eraseAll).toHaveBeenCalledTimes(1));
      expect(RECORD_UNLOCK_ERASE_CONFIRM).toContain('元に戻せません');
    } finally {
      confirmSpy.mockRestore();
      delete (window as unknown as { serviceHub?: unknown }).serviceHub;
    }
  });
});

describe('★ 診断の助言が名指す設定の画面は実在する', () => {
  it('「業務記録の暗号化」と「暗号化した控え」の見出しが、助言の綴りと同じ', async () => {
    const recs = report().checks.map((c) => c.recommendation).join('\n');
    await render(React.createElement(RecordEncryptionPanel));
    expect(container.textContent).toContain('業務記録の暗号化');
    expect(recs).toContain('設定の「業務記録の暗号化」');
    document.body.innerHTML = '';
    await render(React.createElement(EncryptedCopyPanel));
    await waitForElement(() => q('[data-copy-freshness]'), '控えの鮮度');
    expect(container.textContent).toContain('暗号化した控え');
    expect(recs).toContain('設定の「暗号化した控え」');
  });
});
