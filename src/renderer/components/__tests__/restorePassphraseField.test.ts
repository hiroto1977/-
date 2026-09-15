/** @vitest-environment jsdom */
/**
 * **暗号化バックアップの合言葉は、マスクされた欄でしか受けない。** (2026-09-09 · パス 131)
 *
 * 2026-09-09 まで、合言葉の欄が空なら `prompt` で訊いていた。prompt は入力を平文で映し
 * (マスクが無い)、Electron の renderer には無い (null を返す) ので、デスクトップ版では
 * その道が必ず「入力されなかった」に落ちていた。ここは実物の設定パネルで: 欄が空なら
 * 断って何も復元せず、問い合わせ (prompt) を**呼ばない** (★)、欄に入れれば復元する (対照)、
 * 平文のバックアップは欄が空でも復元する (対照)。
 */
import 'fake-indexeddb/auto';
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { BackupPanel, ENCRYPTED_RESTORE_NEEDS_FIELD } from '../BackupPanel';
import { _resetRecordStoreForTests, getRecordStore, type StoredRecord } from '../../data/store';
import { _resetCollectionSubscribersForTests } from '../../data/useCollection';
import { SALES_COLLECTION } from '../../data/sales';
import { serializeBackup, serializeEncryptedBackup } from '../../data/backup';

const originalPrompt = window.prompt;
let promptCalls = 0;

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
  };
});

let container: HTMLDivElement;
let root: Root | null = null;

async function settle(): Promise<void> {
  for (let i = 0; i < 10; i += 1) {
    await act(async () => {
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    });
  }
}

async function mount(): Promise<void> {
  root = createRoot(container);
  await act(async () => {
    root!.render(createElement(BackupPanel));
  });
  await settle();
}

function changeInput(input: HTMLInputElement, value: string): void {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
  if (!setter) throw new Error('value setter not found');
  setter.call(input, value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
}

async function fillPassphrase(value: string): Promise<void> {
  const input = container.querySelector<HTMLInputElement>('input[data-backup-passphrase]');
  if (!input) throw new Error('passphrase input not found');
  await act(async () => {
    changeInput(input, value);
  });
}

async function chooseFile(content: string, name: string): Promise<void> {
  const input = container.querySelector('input[type="file"]');
  if (!(input instanceof HTMLInputElement)) throw new Error('file input missing');
  Object.defineProperty(input, 'files', { value: [new File([content], name)], configurable: true });
  await act(async () => {
    input.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await settle();
}

const text = (): string => (container.textContent ?? '').replace(/\s+/g, ' ');

/** 文が出るまで待つ (復号は PBKDF2 60 万回を回すので、settle の数 tick では終わらない)。 */
async function waitForText(needle: string, timeoutMs = 20_000): Promise<void> {
  const started = Date.now();
  while (!text().includes(needle)) {
    if (Date.now() - started > timeoutMs) throw new Error(`timed out waiting for "${needle}"; text: ${text().slice(0, 300)}`);
    await act(async () => {
      await new Promise<void>((resolve) => setTimeout(resolve, 50));
    });
  }
}

const ROW: StoredRecord = {
  id: 'from-backup',
  collection: SALES_COLLECTION,
  createdAt: 1,
  updatedAt: 1,
  data: { date: '2026-04-01', channel: 'amazon', amount: 1000, orders: 1, note: '' },
};
const PASSPHRASE = 'correct-horse-battery';

beforeEach(async () => {
  _resetRecordStoreForTests();
  _resetCollectionSubscribersForTests();
  await new Promise<void>((resolve) => {
    const req = indexedDB.deleteDatabase('business-hub-data');
    req.onsuccess = () => resolve();
    req.onerror = () => resolve();
    req.onblocked = () => resolve();
  });
  container = document.createElement('div');
  document.body.appendChild(container);
  promptCalls = 0;
  // 問い合わせが呼ばれたら数える (呼ばれないことが検査の中身)。
  window.prompt = () => {
    promptCalls += 1;
    return PASSPHRASE;
  };
});

afterEach(async () => {
  window.prompt = originalPrompt;
  if (root) {
    await act(async () => {
      root!.unmount();
    });
    root = null;
  }
  document.body.removeChild(container);
});

describe('バックアップの復元 — 合言葉はマスクされた欄でしか受けない', () => {
  it('★ 欄が空のまま暗号化バックアップを選ぶと、断って何も復元せず、問い合わせ (prompt) を呼ばない', async () => {
    const encrypted = await serializeEncryptedBackup([ROW], PASSPHRASE);
    await mount();
    await chooseFile(encrypted, 'enc.json');
    expect(text()).toContain(ENCRYPTED_RESTORE_NEEDS_FIELD);
    expect(text()).not.toContain('レコードを復元しました');
    expect(promptCalls).toBe(0);
    expect(await getRecordStore().count(SALES_COLLECTION)).toBe(0);
  });

  it('対照: 欄に合言葉を入れれば復元できる', async () => {
    const encrypted = await serializeEncryptedBackup([ROW], PASSPHRASE);
    await mount();
    await fillPassphrase(PASSPHRASE);
    await chooseFile(encrypted, 'enc.json');
    await waitForText('1 件のレコードを復元しました');
    expect(promptCalls).toBe(0);
    expect(await getRecordStore().count(SALES_COLLECTION)).toBe(1);
  });

  it('対照: 平文のバックアップは欄が空でも復元する (断りは暗号化されたファイルにだけ)', async () => {
    const plain = await serializeBackup([ROW]);
    await mount();
    await chooseFile(plain, 'plain.json');
    expect(text()).toContain('1 件のレコードを復元しました');
    expect(text()).not.toContain(ENCRYPTED_RESTORE_NEEDS_FIELD);
    expect(promptCalls).toBe(0);
  });
});
