/** @vitest-environment jsdom */
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { EmotionsPage } from '../pages/EmotionsPage';
import { StorageProtectionNotice } from '../pages/SettingsPage';
import { CRISIS_MARKERS, SUPPORT_RESOURCES } from '../data/counseling';
import { EVICTION_RECOVERY } from '../../shared/storageDurability';

/*
 * **安全側の断りが、条件が成り立ったときに実際に画面へ出ること** — 2026-09-21 · パス 367。
 *
 * パス 366 で足した法則 `user-facing-claim-held-at-render` を、免責以外の
 * 「出なければ困る物」に当てた。守りを 4 つ潰して全件 (17,895 件) を回した実測:
 *
 * ```
 *   BackupPanel  平文で書き出す前の確認        ✅ plaintextBackupNotice が鳴る
 *   BackupPanel  置換復元の前の確認            ✅ restorePlan が鳴る
 *   EmotionsPage 危機のときの相談窓口          ❌ 誰も鳴らない
 *   SettingsPage 立ち退きの警告 (2 か所とも)   ❌ 誰も鳴らない
 * ```
 *
 * ## ① 危機の相談窓口
 *
 * `counsel()` が `isCrisis` を立てると、画面は「相談できる窓口（日本）」と
 * `SUPPORT_RESOURCES` (いのちの電話ほか) と厚労省へのボタンを出す。
 * **この描画を潰しても 17,895 件すべて緑だった。**
 *
 * `crisisDeliberation.test.ts` と `counseling.test.ts` が見ているのは**判定と語彙**
 * (`predictCategory` / `judge` / `detectCrisis` / `SUPPORT_RESOURCES` の確証) で、
 * **届くかどうかは見ていない**。つらいと打った人に番号が出るかは、判定が正しいことと
 * 別の問題である —— ここが、この repo で繰り返し出ている「決定は測るが配達は測らない」形の
 * 一番重い現れである。
 *
 * ## ② 立ち退きの警告
 *
 * `durability === 'best-effort'` のときだけ出る警告で、文面は
 * 「**控えた 24 語では戻せません** —— 消えたときは暗号化されたトークンごと失われます」。
 * パス 351 は `requestAndReadDurability` の**判断**を、パス 353 は `EVICTION_RECOVERY` の**表**を
 * 機械に載せたが、**出るかどうか**は空いていた。
 *
 * **既存の検査は、出る条件そのものを型で除いていた** —— `settingsProtectionScope.test.ts` の
 * 標本の型は `durability: 'file' | 'persistent'` で、`'best-effort'` が入らない。
 * つまり「出る側の枝」に一度も入っていなかった。
 */

let container: HTMLDivElement;
let root: Root | null = null;

interface Protection {
  encrypted: boolean;
  plainCount: number;
  file: string;
  mechanism?: 'os-keychain' | 'webcrypto-vault' | 'obfuscated';
  durability?: 'file' | 'persistent' | 'best-effort';
}

let protection: Protection = {
  encrypted: true,
  plainCount: 0,
  file: 'IndexedDB (business-hub-vault)',
  mechanism: 'webcrypto-vault',
  durability: 'best-effort',
};

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  (globalThis as unknown as { serviceHub: unknown }).serviceHub = {
    getVersion: () => Promise.resolve('0.1.0-web'),
    listConfigured: () => Promise.resolve([]),
    fetchSnapshot: () => Promise.resolve({ ok: false, code: 'x', message: 'x' }),
    invoke: () => Promise.resolve({ ok: false, code: 'x', message: 'x' }),
    openExternal: () => Promise.resolve(),
    oauthSupported: () => Promise.resolve(false),
    setToken: () => Promise.resolve(),
    clearToken: () => Promise.resolve(),
    storageProtection: () => Promise.resolve(protection),
  };
});

afterEach(async () => {
  if (root) {
    const r = root;
    root = null;
    await act(async () => {
      r.unmount();
    });
  }
  container.remove();
});

async function settle(): Promise<void> {
  for (let i = 0; i < 6; i += 1) {
    await act(async () => {
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    });
  }
}

async function mount(node: Parameters<Root['render']>[0]): Promise<void> {
  root = createRoot(container);
  await act(async () => {
    root!.render(node);
  });
  await settle();
}

/** メモ欄 (placeholder で引く) に打つ。 */
async function typeNote(text: string): Promise<void> {
  const area = Array.from(container.querySelectorAll('textarea, input')).find((el) =>
    (el.getAttribute('placeholder') ?? '').startsWith('メモ (任意)'),
  ) as HTMLTextAreaElement | HTMLInputElement | undefined;
  if (!area) throw new Error('メモ欄が見つからない (placeholder が変わった?)');
  // **`.value = x` では React が気付かない。** 値の tracker を通すため、prototype の
  // setter を呼んでから `input` を投げる (`assistantCredsSave.test.ts` と同じ形)。
  const proto = area instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
  if (!setter) throw new Error('value setter が取れない');
  await act(async () => {
    setter.call(area, text);
    area.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await settle();
}

const CRISIS_HEADING = '相談できる窓口（日本）';

describe('危機のときの相談窓口 — つらいと打った人に番号が出る', () => {
  it('★ 標本: 使う語が実物の危機マーカーに在る (針が製品と揃っている)', () => {
    expect(CRISIS_MARKERS).toContain('消えたい');
    expect(SUPPORT_RESOURCES.length).toBeGreaterThan(1);
  });

  it('★ 危機のメモを打つと窓口の見出しと窓口が全部出る', async () => {
    await mount(createElement(EmotionsPage));
    await typeNote('もう消えたい');
    const text = container.textContent ?? '';
    expect(text, '危機の見出しが出ていない').toContain(CRISIS_HEADING);
    for (const r of SUPPORT_RESOURCES) {
      expect(text, `窓口 ${r.label} が出ていない`).toContain(r.label);
      expect(text, `窓口 ${r.label} の連絡先が出ていない`).toContain(r.detail);
    }
  });

  it('★ 危機でないメモでは窓口を出さない (上の主張は空でない)', async () => {
    await mount(createElement(EmotionsPage));
    await typeNote('今日は打ち合わせがうまくいった');
    expect(container.textContent ?? '').not.toContain(CRISIS_HEADING);
  });
});

describe('立ち退きの警告 — 消えうる領域だと言う', () => {
  const NOTICE = 'この保管庫は「消えうる」領域にあります';
  const PHRASE = '控えた 24 語では戻せません';

  it('★ best-effort なら警告が出て、24 語では戻せないと言う (暗号化されている場合)', async () => {
    protection = {
      encrypted: true,
      plainCount: 0,
      file: 'IndexedDB (business-hub-vault)',
      mechanism: 'webcrypto-vault',
      durability: 'best-effort',
    };
    await mount(createElement(StorageProtectionNotice));
    const text = container.textContent ?? '';
    expect(text).toContain(NOTICE);
    expect(text).toContain(PHRASE);
    for (const row of EVICTION_RECOVERY) {
      expect(text, `${row.what} が出ていない`).toContain(row.what);
    }
  });

  it('★ 暗号化されていない枝でも同じ警告が出る (2 か所目の描画)', async () => {
    protection = {
      encrypted: false,
      plainCount: 2,
      file: 'IndexedDB (business-hub-vault)',
      mechanism: 'obfuscated',
      durability: 'best-effort',
    };
    await mount(createElement(StorageProtectionNotice));
    const text = container.textContent ?? '';
    expect(text).toContain(NOTICE);
    expect(text).toContain(PHRASE);
  });

  it('★ persistent では出さない (上の主張は空でない)', async () => {
    protection = {
      encrypted: true,
      plainCount: 0,
      file: 'IndexedDB (business-hub-vault)',
      mechanism: 'webcrypto-vault',
      durability: 'persistent',
    };
    await mount(createElement(StorageProtectionNotice));
    expect(container.textContent ?? '').not.toContain(NOTICE);
  });
});
