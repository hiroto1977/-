/** @vitest-environment jsdom */
/**
 * **「保存時の保護状態」の節は、トークン以外の保存物の状態も言う** (2026-09-09 · パス 135)。
 *
 * それまで節はトークンのことしか言わず、同じ日に封緘 (デスクトップ) / 平文のまま (ブラウザ) と分かれた
 * 気分の記録・人材育成・チームレーダーの状態には触れていなかった。ここは実物の節を 3 つの仕組みで描き、
 * それぞれの文が出ることと、取得に失敗したときは出ないこと (対照) を留める。
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { StorageProtectionNotice } from '../SettingsPage';
import { STATE_STORES } from '../../../shared/atRestInventory';

type Mechanism = 'os-keychain' | 'webcrypto-vault' | 'obfuscated';
interface Protection {
  encrypted: boolean;
  plainCount: number;
  file: string;
  mechanism: Mechanism;
  durability: 'file' | 'persistent';
}
let protection: Protection | Error = new Error('unset');

let container: HTMLDivElement;
let root: Root | null = null;

async function settle(): Promise<void> {
  for (let i = 0; i < 6; i += 1) {
    await act(async () => {
      await new Promise<void>((r) => setTimeout(r, 0));
    });
  }
}

async function mount(): Promise<void> {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root!.render(createElement(StorageProtectionNotice));
  });
  await settle();
}

const text = (): string => (container.textContent ?? '').replace(/\s+/g, ' ');

beforeEach(() => {
  (globalThis as unknown as { serviceHub: unknown }).serviceHub = {
    storageProtection: () => (protection instanceof Error ? Promise.reject(protection) : Promise.resolve(protection)),
  };
});

afterEach(async () => {
  if (root) {
    await act(async () => {
      root!.unmount();
    });
    root = null;
  }
  container.remove();
});

describe('保存時の保護状態 — トークン以外の保存物も言う', () => {
  it('★ OS のキーチェーンがあるデスクトップ: 3 つの状態ファイルも同じ鍵で封緘、と言う', async () => {
    protection = { encrypted: true, plainCount: 0, file: '/home/u/.config/app/service-hub-secrets.json', mechanism: 'os-keychain', durability: 'file' };
    await mount();
    expect(text()).toContain('トークンは暗号化されています');
    for (const s of STATE_STORES) expect(text()).toContain(s.label);
    expect(text()).toContain('同じ OS のキーチェーン由来の鍵で封緘して保存されています');
  });

  it('★ キーチェーンの無いデスクトップ: 3 つも難読化のみ、と言う (トークンの警告は残る)', async () => {
    protection = { encrypted: false, plainCount: 2, file: '/home/u/.config/app/service-hub-secrets.json', mechanism: 'obfuscated', durability: 'file' };
    await mount();
    expect(text()).toContain('トークンを暗号化できません');
    for (const s of STATE_STORES) expect(text()).toContain(s.label);
    expect(text()).toContain('状態ファイルも base64 の難読化のみです');
  });

  it('★ ブラウザ版 (保管庫): 3 つは保管庫の外の localStorage に平文、と言う', async () => {
    protection = { encrypted: true, plainCount: 0, file: 'IndexedDB (business-hub-vault)', mechanism: 'webcrypto-vault', durability: 'persistent' };
    await mount();
    expect(text()).toContain('マスターパスワードから導出した鍵');
    for (const s of STATE_STORES) expect(text()).toContain(s.label);
    expect(text()).toContain('ブラウザの localStorage に平文で保存されています');
    expect(text()).toContain('マスターパスワードでは守られません');
  });

  it('対照: 取得に失敗すれば、その旨だけ言う (保存物の文は上の 3 本で出ることを確かめている)', async () => {
    protection = new Error('bridge down');
    await mount();
    expect(text()).toContain('保護状態を取得できませんでした');
    expect(text()).not.toContain('localStorage に平文');
    expect(text()).not.toContain('封緘して保存されています');
  });
});
