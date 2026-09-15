/** @vitest-environment jsdom */
/**
 * **短い合言葉で「暗号化済み」のバックアップを作らない。** (2026-09-09 · パス 128)
 *
 * 保管庫のマスターパスワードは 12 文字以上を強制しているのに、同じデータを外へ持ち出す暗号化
 * バックアップは 1 文字でも「暗号化済み」を名乗っていた。ここは実物の設定パネルで、3 文字の
 * 合言葉では断り (書き出しの成功文が出ない)、12 文字なら書き出せることを読む。
 */
import 'fake-indexeddb/auto';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { BackupPanel } from '../BackupPanel';
import { _resetRecordStoreForTests } from '../../data/store';
import { _resetCollectionSubscribersForTests } from '../../data/useCollection';

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
  // jsdom には Blob URL が無い。書き出しは `a.click()` まで行くので、その手前を差し替える。
  const url = globalThis.URL as unknown as { createObjectURL?: unknown; revokeObjectURL?: unknown };
  url.createObjectURL = vi.fn(() => 'blob:service-hub-test');
  url.revokeObjectURL = vi.fn();
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

async function exportWith(passphrase: string): Promise<void> {
  const input = container.querySelector<HTMLInputElement>('input[data-backup-passphrase]');
  if (!input) throw new Error('passphrase input not found');
  await act(async () => {
    changeInput(input, passphrase);
  });
  const button = Array.from(container.querySelectorAll('button')).find((b) => b.textContent?.trim() === 'バックアップを書き出す');
  if (!button) throw new Error('export button not found');
  await act(async () => {
    button.click();
  });
  await settle();
}

const text = (): string => (container.textContent ?? '').replace(/\s+/g, ' ');

/** 文が出るまで待つ (暗号化は PBKDF2 60 万回を回すので、settle の数 tick では終わらない)。 */
async function waitForText(needle: string, timeoutMs = 20_000): Promise<void> {
  const started = Date.now();
  while (!text().includes(needle)) {
    if (Date.now() - started > timeoutMs) throw new Error(`timed out waiting for "${needle}"; text: ${text().slice(0, 300)}`);
    await act(async () => {
      await new Promise<void>((resolve) => setTimeout(resolve, 50));
    });
  }
}

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
  // jsdom は <a download> の click で航行しようとして警告を出す (中身は無い)。
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
});

afterEach(async () => {
  vi.restoreAllMocks();
  if (root) {
    await act(async () => {
      root!.unmount();
    });
    root = null;
  }
  document.body.removeChild(container);
});

describe('バックアップ — 暗号化の合言葉の下限', () => {
  it('★ 3 文字の合言葉では断り、「バックアップしました」は出ない (下限は保管庫と同じ 12 文字)', async () => {
    await mount();
    await exportWith('abc');
    await waitForText('12 文字以上で設定してください');
    expect(text()).toContain('暗号化バックアップのパスワードは 12 文字以上で設定してください');
    expect(text()).not.toContain('件のレコードをバックアップしました');
  });

  it('対照: 12 文字なら書き出せる (暗号化済み)', async () => {
    await mount();
    await exportWith('correct-horse');
    await waitForText('件のレコードをバックアップしました');
    expect(text()).toContain('件のレコードをバックアップしました（暗号化済み）');
    expect(text()).not.toContain('12 文字以上で設定してください');
  });

  it('対照: 空欄 (暗号化しない) は従来どおり平文で書き出す', async () => {
    await mount();
    await exportWith('');
    await waitForText('件のレコードをバックアップしました');
    expect(text()).toContain('件のレコードをバックアップしました');
    expect(text()).not.toContain('暗号化済み');
  });
});
