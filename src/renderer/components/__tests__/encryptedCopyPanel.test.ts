// @vitest-environment jsdom
/**
 * 暗号化した控えのパネル (`components/EncryptedCopyPanel.tsx` · 2026-11-11)。
 *
 * 実物のパネルを実物の記録の保管層 (fake-indexeddb) の上で描き、実際に打って押す。
 * 保存先フォルダだけ偽物 (メモリの Map) —— `fs/fsa.ts` の 3 つの口を差し替える。
 * 判定の細部は `data/__tests__/encryptedCopy.test.ts` が持つ。ここは配線:
 * 鮮度が画面に出ること・書いた物が暗号文であること・書いたあと「最新」に変わること・
 * 断りが出たときに 1 字も書かないこと・フォルダが無い / 使えないときにそう言うこと。
 */
import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { settleUntil, waitForElement } from '../../__tests__/jsdomWait';
import { resetRecordStore } from '../../__tests__/recordStoreHarness';
import { getRecordStore } from '../../data/store';
import { isEncryptedBackup, parseBackupFile } from '../../data/backup';
import { ENCRYPTED_COPY_MARKER_KEY } from '../../data/encryptedCopy';
import { MAX_BACKUP_IMPORT_BYTES } from '../../data/importFile';

const folder = vi.hoisted(() => ({
  supported: true,
  hasHandle: true,
  loadThrows: false,
  writeThrows: false,
  files: new Map<string, string>(),
  /** 読み戻すファイルが名乗る大きさ (null なら中身の長さ)。 */
  readSize: null as number | null,
  /** 読み戻しで本文を読んだ回数。 */
  textReads: 0,
}));

vi.mock('../../fs/fsa', () => ({
  isFsaSupported: () => folder.supported,
  loadFolderHandle: async () => {
    if (folder.loadThrows) throw new Error('InvalidStateError');
    if (!folder.hasHandle) return null;
    return {
      permission: 'granted',
      handle: {
        name: '同期フォルダ',
        getFileHandle: async (name: string) => ({
          getFile: async () => {
            const text = folder.files.get(name);
            if (text === undefined) throw new Error('NotFoundError');
            return {
              size: folder.readSize ?? text.length,
              text: async () => {
                folder.textReads += 1;
                return text;
              },
            };
          },
        }),
      },
    };
  },
  writeBlobToFolder: async (_handle: unknown, name: string, blob: Blob) => {
    if (folder.writeThrows) throw new Error('フォルダへの書き込み権限が拒否されています');
    folder.files.set(name, await blob.text());
  },
}));

import { EncryptedCopyPanel } from '../EncryptedCopyPanel';

const PASS = 'correct horse battery';
let container: HTMLElement;

async function seed(n: number) {
  const store = getRecordStore();
  for (let i = 0; i < n; i += 1) {
    await store.insert('sales-entries', { date: '2026-11-01', channel: 'shopify', amount: 123_456 + i, orders: 1 });
  }
}

async function mount(readyState: string) {
  container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(React.createElement(EncryptedCopyPanel));
  });
  await waitForElement(() => container.querySelector(`[data-copy-freshness="${readyState}"]`), `鮮度の印 ${readyState}`);
}

function type(el: HTMLInputElement, value: string): void {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
  if (!setter) throw new Error('value setter missing');
  setter.call(el, value);
  el.dispatchEvent(new Event('input', { bubbles: true }));
}

async function fields() {
  const pass = await waitForElement(() => container.querySelector<HTMLInputElement>('[data-copy-passphrase]'), 'パスフレーズの欄');
  const confirm = await waitForElement(
    () => container.querySelector<HTMLInputElement>('[data-copy-passphrase-confirm]'),
    'パスフレーズ (確認) の欄',
  );
  const button = await waitForElement(() => container.querySelector<HTMLButtonElement>('[data-copy-write]'), '書くボタン');
  return { pass, confirm, button };
}

async function press(button: HTMLButtonElement) {
  await act(async () => {
    button.click();
  });
}

const freshness = () => container.querySelector('[data-copy-freshness]');
const result = (kind: 'ok' | 'error') => container.querySelector(`[data-copy-result="${kind}"]`);

describe('暗号化した控えのパネル', () => {
  beforeEach(async () => {
    document.body.innerHTML = '';
    localStorage.clear();
    folder.supported = true;
    folder.hasHandle = true;
    folder.loadThrows = false;
    folder.writeThrows = false;
    folder.readSize = null;
    folder.textReads = 0;
    folder.files.clear();
    await resetRecordStore();
  });

  it('★ 記録が在って 1 度も控えていなければ、警告として言う', async () => {
    await seed(2);
    await mount('never');
    expect(freshness()?.getAttribute('role')).toBe('alert');
    expect(freshness()?.textContent).toBe('⚠ この端末の記録 2 件は、まだ 1 度も控えていません。端末が壊れると失われます。');
  });

  it('記録が無ければ、控える物が無いと言う (警告にしない)', async () => {
    await mount('no-records');
    expect(freshness()?.getAttribute('role')).toBe('status');
    expect(freshness()?.textContent).toBe('控える記録がまだありません。');
  });

  it('★ 打って押すと、保存先フォルダに暗号文が書かれ、鮮度が「最新」に変わる', async () => {
    await seed(2);
    await mount('never');
    const { pass, confirm, button } = await fields();
    type(pass, PASS);
    type(confirm, PASS);
    await press(button);
    await settleUntil(() => result('ok') !== null || result('error') !== null, '書いた結果の文', { timeoutMs: 20_000 });
    expect(result('error')).toBeNull();
    expect(result('ok')?.textContent).toContain('読み戻してそのパスフレーズで開けることを確かめました');
    expect([...folder.files.keys()]).toHaveLength(1);
    const [name, text] = [...folder.files.entries()][0] ?? ['', ''];
    expect(name).toMatch(/^service-hub-copy-\d{4}-\d{2}-\d{2}-encrypted\.json$/);
    expect(isEncryptedBackup(text)).toBe(true);
    expect(text).not.toContain('123456');
    expect((await parseBackupFile(text, PASS)).records).toHaveLength(2);
    await waitForElement(() => container.querySelector('[data-copy-freshness="current"]'), '鮮度が最新');
    expect(freshness()?.getAttribute('role')).toBe('status');
    expect(freshness()?.textContent).toContain('今の記録と一致しています');
    // 打ったパスフレーズは欄に残さない。
    expect(pass.value).toBe('');
    expect(confirm.value).toBe('');
    expect(localStorage.getItem(ENCRYPTED_COPY_MARKER_KEY)).not.toBeNull();
  }, 40_000);

  it('★ 控えたあとに記録が変わっていれば、開き直したとき「古い」と警告する', async () => {
    await seed(1);
    await mount('never');
    const { pass, confirm, button } = await fields();
    type(pass, PASS);
    type(confirm, PASS);
    await press(button);
    await waitForElement(() => container.querySelector('[data-copy-freshness="current"]'), '鮮度が最新', { timeoutMs: 20_000 });
    await seed(1);
    document.body.innerHTML = '';
    await mount('stale');
    expect(freshness()?.getAttribute('role')).toBe('alert');
    expect(freshness()?.textContent).toContain('のあとに記録が変わっています (今は 2 件)');
  }, 40_000);

  it('★ 2 つの欄が一致しなければ断り、1 字も書かず、鮮度も変えない', async () => {
    await seed(1);
    await mount('never');
    const { pass, confirm, button } = await fields();
    type(pass, PASS);
    type(confirm, PASS + 'x');
    await press(button);
    await waitForElement(() => result('error'), '断りの文');
    expect(result('error')?.textContent).toBe('パスフレーズが 2 つの欄で一致しません。打ち間違えた控えは、あとで開けません。');
    expect(result('ok')).toBeNull();
    expect(folder.files.size).toBe(0);
    expect(freshness()?.getAttribute('data-copy-freshness')).toBe('never');
    expect(localStorage.getItem(ENCRYPTED_COPY_MARKER_KEY)).toBeNull();
    // 断ったときは打った物を消さない (打ち直せるように)。
    expect(pass.value).toBe(PASS);
  });

  it('フォルダへ書けなかったら理由を出し、鮮度は変えない', async () => {
    folder.writeThrows = true;
    await seed(1);
    await mount('never');
    const { pass, confirm, button } = await fields();
    type(pass, PASS);
    type(confirm, PASS);
    await press(button);
    await waitForElement(() => result('error'), '失敗の文', { timeoutMs: 20_000 });
    expect(result('error')?.textContent).toBe('控えを書けませんでした (フォルダへの書き込み権限が拒否されています)。');
    expect(freshness()?.getAttribute('data-copy-freshness')).toBe('never');
  }, 40_000);

  it('★ 読み戻すファイルが復元の上限より大きければ、本文を読まずに断り、鮮度は変えない', async () => {
    folder.readSize = MAX_BACKUP_IMPORT_BYTES + 1;
    await seed(1);
    await mount('never');
    const { pass, confirm, button } = await fields();
    type(pass, PASS);
    type(confirm, PASS);
    await press(button);
    await waitForElement(() => result('error'), '失敗の文', { timeoutMs: 20_000 });
    expect(result('error')?.textContent).toBe(
      '控えを書きましたが、読み戻して確かめられませんでした (控えが大きすぎます (256.0 MB。上限 256.0 MB))。',
    );
    expect(folder.textReads).toBe(0);
    expect(freshness()?.getAttribute('data-copy-freshness')).toBe('never');
    expect(localStorage.getItem(ENCRYPTED_COPY_MARKER_KEY)).toBeNull();
  }, 40_000);

  it('対照: 上限ちょうどの大きさを名乗るファイルは読む', async () => {
    folder.readSize = MAX_BACKUP_IMPORT_BYTES;
    await seed(1);
    await mount('never');
    const { pass, confirm, button } = await fields();
    type(pass, PASS);
    type(confirm, PASS);
    await press(button);
    await waitForElement(() => result('ok'), '書けた文', { timeoutMs: 20_000 });
    expect(folder.textReads).toBe(1);
  }, 40_000);

  it('保存先フォルダが未設定なら、設定する場所を名指しし、書く口を出さない', async () => {
    folder.hasHandle = false;
    await seed(1);
    await mount('never');
    const note = await waitForElement(() => container.querySelector('[data-copy-folder="none"]'), '未設定の文');
    expect(note.textContent).toContain('「PC のフォルダに同期」');
    expect(container.querySelector('[data-copy-write]')).toBeNull();
    expect(container.querySelector('[data-copy-passphrase]')).toBeNull();
  });

  it('保存先フォルダに対応していないブラウザでは、働く道 (書き出して置く) を名指しする', async () => {
    folder.supported = false;
    await seed(1);
    await mount('never');
    const note = await waitForElement(() => container.querySelector('[data-copy-folder="unsupported"]'), '非対応の文');
    expect(note.textContent).toContain('「バックアップ / 復元」');
    expect(container.querySelector('[data-copy-write]')).toBeNull();
  });

  it('保存先フォルダの設定を読めなければ、未設定と言わず、読めないと言う', async () => {
    folder.loadThrows = true;
    await seed(1);
    await mount('never');
    const note = await waitForElement(() => container.querySelector('[data-copy-folder="unreadable"]'), '読めない文');
    expect(note.getAttribute('role')).toBe('alert');
    expect(container.querySelector('[data-copy-folder="none"]')).toBeNull();
    expect(note.textContent).not.toContain('InvalidStateError');
  });

  it('目印が読めない端末では、最新とも古いとも言わない', async () => {
    await seed(1);
    const original = Storage.prototype.getItem;
    Storage.prototype.getItem = () => {
      throw new DOMException('blocked', 'SecurityError');
    };
    try {
      await mount('unreadable');
      expect(freshness()?.getAttribute('role')).toBe('alert');
      expect(freshness()?.textContent).toContain('確かめられません');
    } finally {
      Storage.prototype.getItem = original;
    }
  });
});
