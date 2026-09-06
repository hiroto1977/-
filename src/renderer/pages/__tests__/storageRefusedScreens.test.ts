/** @vitest-environment jsdom */
/**
 * **保存領域そのものへ触れられない端末で、画面が生き残るか。**
 *
 * `localStorage` は読むだけで投げる —— サイトデータをブロックしたオリジンで
 * Chrome は `SecurityError: Access is denied for this document.` を返し、
 * プライベートモードでも同じ形になる。`data/localWrite.ts` の冒頭は
 * 「書き込み禁止」を 3 つの現実の理由の 1 つとして数えているのに、
 * **読みの側は誰も見ていなかった** (2026-09-06 実測: 読み 21 か所のうち 3 か所が
 * `try` の外)。
 *
 * いちばん痛かったのが `data/recordEncryption.ts` の `loadMeta()` である。
 * `isEncryptionEnabled()` はそれを呼び、そして `components/BackupPanel.tsx` は
 * **描画中に** `isEncryptionEnabled()` を呼ぶ (`{isEncryptionEnabled() && …}`)。
 * つまり保存領域が怪しい端末に限って**控えを取り出す画面が投げる** ——
 * 画面は `PageErrorBoundary` の文面に置き換わり、**いちばん要るときに
 * バックアップが取れない**。
 *
 * ここでは実物の `BackupPanel` を、投げる `localStorage` の上で描く。
 */
import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { BackupPanel } from '../../components/BackupPanel';
import { _resetRecordStoreForTests } from '../../data/store';

let container: HTMLDivElement | null = null;
let root: Root | null = null;

/** 触れることが投げる `localStorage`。`name` で種別を変えられる。 */
function installRefusingLocalStorage(name = 'SecurityError'): void {
  const boom = (): never => {
    const e = new Error('Access is denied for this document.');
    e.name = name;
    throw e;
  };
  vi.stubGlobal('localStorage', {
    getItem: boom,
    setItem: boom,
    removeItem: boom,
    clear: boom,
    key: boom,
    get length(): number {
      return boom();
    },
  });
}

beforeEach(() => {
  _resetRecordStoreForTests();
  container = document.createElement('div');
  document.body.appendChild(container);
});

afterEach(async () => {
  if (root) {
    const r = root;
    await act(async () => {
      r.unmount();
    });
  }
  root = null;
  container?.remove();
  container = null;
  vi.unstubAllGlobals();
});

async function mountBackupPanel(): Promise<void> {
  root = createRoot(container!);
  const r = root;
  await act(async () => {
    r.render(createElement(BackupPanel));
  });
}

describe('サイトデータをブロックした端末でも控えは取れる', () => {
  it('★ localStorage が触れるだけで投げても BackupPanel は描画される', async () => {
    installRefusingLocalStorage();
    await mountBackupPanel();
    // 見出しが出ていれば、描画が投げていない (投げると境界の文面に化ける)。
    expect(container!.textContent).toContain('SHA-256');
    expect(container!.querySelectorAll('button').length).toBeGreaterThan(0);
  });

  it('★ 「暗号化バックアップ」の警告は出さない (確認できていないので言い切らない)', async () => {
    installRefusingLocalStorage();
    await mountBackupPanel();
    // `isEncryptionEnabled()` は false を返す (投げない)。読めない端末で
    // 「暗号化が有効」と言い切るのはもう 1 つの嘘なので、警告は出さない。
    expect(container!.textContent).not.toContain('復元できないバックアップ');
  });

  it('対照: 触れる端末でも同じ画面が描画される (投げる側だけを測っている)', async () => {
    await mountBackupPanel();
    expect(container!.textContent).toContain('SHA-256');
  });

  it('★ 容量超過 (QuotaExceededError) でも同じ (種別で分けていない)', async () => {
    installRefusingLocalStorage('QuotaExceededError');
    await mountBackupPanel();
    expect(container!.textContent).toContain('SHA-256');
  });
});
