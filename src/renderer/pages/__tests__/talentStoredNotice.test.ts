/** @vitest-environment jsdom */
/**
 * **読めない保存を黙って空にせず、読み込みで落とした項目も言う** (2026-09-09 · パス 121)。
 *
 * 人材ページは開いた直後に保存先を読む (`autoFetch`)。読めなかった・落とした物が在るとき、
 * その注記が画面に出ること —— 保存した・まだ無いときは出ないこと —— を、両ビルドの fetchSnapshot が
 * 返す形 (`buildTalentSnapshot(state, provenance)`) をそのまま流して見る。
 */
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { SERVICES } from '../../services';
import { EMPTY_TALENT_STATE, buildTalentSnapshot, talentProvenance, type StoredTalent } from '../../../shared/talent';

let stored: StoredTalent = { kind: 'none' };

beforeAll(() => {
  (globalThis as unknown as { serviceHub: unknown }).serviceHub = {
    getVersion: () => Promise.resolve('0.1.0-web'),
    listConfigured: () => Promise.resolve([]),
    fetchSnapshot: () => {
      const { state, provenance } = talentProvenance(stored);
      return Promise.resolve({ ok: true, data: buildTalentSnapshot(state, provenance) });
    },
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
  for (let i = 0; i < 8; i += 1) {
    await act(async () => {
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    });
  }
}

async function mountPage(): Promise<void> {
  const def = SERVICES.find((s) => s.id === 'talent');
  if (!def) throw new Error('talent service missing');
  root = createRoot(container);
  await act(async () => {
    root!.render(createElement(def.page));
  });
  await settle();
}

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
});

afterEach(async () => {
  if (root) {
    await act(async () => {
      root!.unmount();
    });
    root = null;
  }
  document.body.removeChild(container);
});

const text = (): string => (container.textContent ?? '').replace(/\s+/g, ' ');

describe('人材ページ — 保存先の 3 状態を注記が言い分ける (パス 121)', () => {
  it('対照: まだ保存していない → 注記は無い', async () => {
    stored = { kind: 'none' };
    await mountPage();
    expect(text()).toContain('5つの企業組織病');
    expect(text()).not.toContain('読めませんでした');
    expect(text()).not.toContain('読み込みで落としました');
  });

  it('対照: 保存した状態 (落とした物なし) → 注記は無い', async () => {
    stored = {
      kind: 'saved',
      state: { ...EMPTY_TALENT_STATE, reports: [{ department: '営業', diseases: ['imprint'] }], updatedAt: '2026-09-09' },
      dropped: null,
    };
    await mountPage();
    expect(text()).toContain('申告 1 部署');
    expect(text()).not.toContain('読めませんでした');
  });

  it('★ 読めなかった保存 → 空を表示しつつ、理由つきの注記を出す (黙って空にしない)', async () => {
    stored = { kind: 'unreadable', reason: 'JSON として読めません' };
    await mountPage();
    expect(text()).toContain('保存した人材育成の状態を読めませんでした (JSON として読めません)');
    expect(text()).toContain('元の保存値は戻りません');
  });

  it('★ 読み込みで落とした項目 → 件数の注記を出す', async () => {
    stored = {
      kind: 'saved',
      state: EMPTY_TALENT_STATE,
      dropped: 'メンバー 1 件 (上限 500 件) は読み込みで落としました (形式が合わないか、上限を超えています)。このまま保存すると、これらは失われます。',
    };
    await mountPage();
    expect(text()).toContain('メンバー 1 件 (上限 500 件) は読み込みで落としました');
  });
});
