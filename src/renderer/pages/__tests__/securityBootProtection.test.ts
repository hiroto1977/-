/** @vitest-environment jsdom */
/**
 * 起動の守りの点検 (2026-11-16) —— 実物の Security の画面を描いて、札と説明を読む。
 *
 * 見たいのは 3 つ: ① 端末を見ていないとき (同梱値・古い payload) に警告色を出さない
 * ② 読んで無効だったときだけ警告色 ③ 「取り除けない」という限界と確かめ方が画面に出る。
 */
import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { SecurityPage } from '../SecurityPage';
import { _resetCollectionSubscribersForTests } from '../../data/useCollection';
import { BOOT_CHECK_GUIDES, BOOT_HABITS, BOOT_PROTECTION_LIMITS, bootDetailsLine } from '../../../shared/bootProtection';
import { resetRecordStore } from '../../__tests__/recordStoreHarness';
import { waitForElement } from '../../__tests__/jsdomWait';

let snapshotResult: { ok: boolean; code?: string; message?: string; data?: unknown };

function stubHub(): void {
  (globalThis as unknown as { serviceHub: unknown }).serviceHub = {
    getVersion: () => Promise.resolve('0.1.0'),
    listConfigured: () => Promise.resolve(['security']),
    fetchSnapshot: () => Promise.resolve(snapshotResult),
    invoke: () => Promise.resolve({ ok: false, code: 'not_implemented', message: 'x' }),
    openExternal: () => Promise.resolve(),
    oauthSupported: () => Promise.resolve(false),
    setToken: () => Promise.resolve({ ok: true }),
    clearToken: () => Promise.resolve({ ok: true }),
  };
}

const NORTON = { installed: false, installPath: '', platform: 'linux', details: 'x', detection: 'unsupported' };

function live(boot: unknown): void {
  snapshotResult = {
    ok: true,
    data: { norton: NORTON, ...(boot === undefined ? {} : { boot }), breaches: [], lastUrlScan: null, keysConfigured: { hibp: false, vt: false } },
  };
}

let container: HTMLDivElement;
let root: Root | null = null;

/** 描いて、札が `state` になるまで待つ (同梱値 → 取得した値の入れ替わりを条件で待つ)。 */
async function mount(state: string): Promise<HTMLElement> {
  root = createRoot(container);
  await act(async () => {
    root!.render(createElement(SecurityPage));
  });
  return waitForElement(
    () => container.querySelector<HTMLElement>(`[data-boot-badge="${state}"]`),
    `起動の守りの札が ${state} になる`,
  );
}

const details = (): string => container.querySelector('[data-boot-details]')?.textContent ?? '';

beforeEach(async () => {
  await resetRecordStore();
  _resetCollectionSubscribersForTests();
  localStorage.clear();
  snapshotResult = { ok: false, code: 'not_implemented', message: 'x' };
  container = document.createElement('div');
  document.body.appendChild(container);
  stubHub();
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

describe('起動の守りの点検 (Security の画面)', () => {
  it('★ 同梱値のとき、警告色を出さず「確認できません」と理由を言う', async () => {
    const badge = await mount('unavailable');
    expect(badge.className).toContain('muted');
    expect(badge.className).not.toContain('warn');
    expect(badge.className).not.toContain('ok');
    expect(badge.textContent).toBe('確認できません');
    expect(details()).toBe(bootDetailsLine('unavailable'));
  });

  it('★ 読んで無効だったときだけ警告色', async () => {
    live({ detection: 'disabled' });
    const badge = await mount('disabled');
    expect(badge.className).toContain('warn');
    expect(badge.textContent).toBe('セキュアブート 無効');
    expect(details()).toBe(bootDetailsLine('disabled'));
  });

  it('読んで有効だったときは緑', async () => {
    live({ detection: 'enabled' });
    const badge = await mount('enabled');
    expect(badge.className).toContain('ok');
    expect(badge.className).not.toContain('warn');
    expect(badge.textContent).toBe('セキュアブート 有効');
  });

  it('自動で読まない OS は中立色で「手動で確認」', async () => {
    live({ detection: 'manual' });
    const badge = await mount('manual');
    expect(badge.className).toContain('muted');
    expect(badge.textContent).toBe('手動で確認');
  });

  it('★ 欄の無い payload (古い版の主プロセス) でも画面は落ちず、警告も出さない', async () => {
    live(undefined);
    // 取得した値が届いた印: Norton の札が同梱値 (unavailable) から unsupported に替わる。
    root = createRoot(container);
    await act(async () => {
      root!.render(createElement(SecurityPage));
    });
    await waitForElement(() => container.querySelector('[data-norton-badge="unsupported"]'), '取得した値が届く');
    const badge = container.querySelector<HTMLElement>('[data-boot-badge]');
    expect(badge?.getAttribute('data-boot-badge')).toBe('unavailable');
    expect(badge?.className).toContain('muted');
  });

  it('★ 知らない状態の値は「確認できません」へ倒す (有効とも無効とも言わない)', async () => {
    live({ detection: 'ENABLED' });
    root = createRoot(container);
    await act(async () => {
      root!.render(createElement(SecurityPage));
    });
    await waitForElement(() => container.querySelector('[data-norton-badge="unsupported"]'), '取得した値が届く');
    expect(container.querySelector('[data-boot-badge]')?.getAttribute('data-boot-badge')).toBe('unavailable');
  });

  it('★ 限界 (取り除けない) と、端末ごとの確かめ方・心がけが画面に出る', async () => {
    await mount('unavailable');
    expect(container.querySelector('[data-boot-limits]')?.textContent).toBe(BOOT_PROTECTION_LIMITS);
    const guides = [...container.querySelectorAll('[data-boot-guide]')];
    expect(guides.map((g) => g.getAttribute('data-boot-guide'))).toEqual(BOOT_CHECK_GUIDES.map((g) => g.device));
    for (const [i, g] of BOOT_CHECK_GUIDES.entries()) {
      expect([...guides[i]!.querySelectorAll('li')].map((li) => li.textContent)).toEqual([...g.steps]);
    }
    expect([...container.querySelectorAll('[data-boot-habits] li')].map((li) => li.textContent)).toEqual([...BOOT_HABITS]);
  });

  it('★ この節に押す物は無い (読むだけ —— 設定を変える口を持たない)', async () => {
    await mount('unavailable');
    const card = container.querySelector('[data-boot-limits]')!.closest('.card')!;
    expect(card.querySelectorAll('button, a, input, select, textarea, [role="button"]')).toHaveLength(0);
  });
});
