/** @vitest-environment jsdom */
/**
 * **読み出せなかったことも、画面に出る** (2026-09-12 · パス 160)。
 *
 * `saveFailureVisible.test.ts` (パス 74) は**書き込み**の失敗が画面に出ることを留めた。
 * ところが同じ 2 画面の**読み**は `catch { return {} }` のままだった:
 *
 * ```
 *   DocstudioPage.loadStore()   → {}   見出しは「入力は端末内に自動保存」のまま
 *   TeamRadarPage.loadDraft()   → {}   同梱の見本のチームが出て「消えない」前提だけ残る
 * ```
 *
 * どちらも「保存できたはずの入力が戻らなかった」を「保存が無い」と同じ見た目に畳む。
 * `saveStore` / `saveDraft` の注記が「画面が嘘をつく」「打ち込ませておいて消えるのが
 * 最悪」と書いている、**その数行上**に在った。
 *
 * 測るのは**画面に出るか**と、**読めていない状態で書き戻さないか** ——
 * 読めなければ画面は空 / 見本から始まるので、そのまま保存すると保存済みの物を消す。
 */
import 'fake-indexeddb/auto';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { SERVICES } from '../../services';
import { _resetRecordStoreForTests } from '../../data/store';
import { _resetCollectionSubscribersForTests } from '../../data/useCollection';
import { _resetNavigationIntentForTests } from '../../navigate';

const DOCSTUDIO_KEY = 'servicehub.docstudio.v1';
const DRAFT_KEY = 'servicehub.teamradar.draft.v1';

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

async function settle(): Promise<void> {
  for (let i = 0; i < 8; i += 1) {
    await act(async () => {
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    });
  }
}

let container: HTMLDivElement;
let root: Root | null = null;

async function mount(serviceId: string): Promise<void> {
  const def = SERVICES.find((s) => s.id === serviceId);
  if (!def) throw new Error(`${serviceId} service missing`);
  root = createRoot(container);
  await act(async () => {
    root!.render(createElement(def.page));
  });
  await settle();
}

/** 読み取りを断る端末を模す。jsdom の `getItem` はプロトタイプ側に在る。 */
function failReads(name = 'SecurityError'): void {
  const err = new Error(name);
  err.name = name;
  vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
    throw err;
  });
}

function text(): string {
  return container.textContent ?? '';
}

beforeEach(() => {
  _resetRecordStoreForTests();
  _resetCollectionSubscribersForTests();
  _resetNavigationIntentForTests();
  localStorage.clear();
  container = document.createElement('div');
  document.body.appendChild(container);
});

afterEach(async () => {
  vi.restoreAllMocks();
  if (root) {
    const r = root;
    root = null;
    await act(async () => {
      r.unmount();
    });
  }
  container.remove();
});

describe('書類スタジオ — 差込値を読み出せない端末 (パス 160)', () => {
  it('★ 見出しが「自動保存」と言わず、読めていないことを言う', async () => {
    failReads();
    await mount('docstudio');
    expect(text()).toContain('保存した入力を読み出せていません');
    expect(text()).not.toContain('入力は端末内に自動保存');
    const band = container.querySelector('[data-store-unreadable]');
    expect(band).not.toBeNull();
    expect(band!.textContent).toContain('プライベートモード');
    expect(band!.textContent).toContain('この端末には残りません');
  });

  it('★ 読めていない間は書き戻さない (保存済みの差込値を消さない)', async () => {
    // **先に本物の値を置いてから**読みだけを壊す —— 書き戻しが起きれば消える。
    localStorage.setItem(DOCSTUDIO_KEY, JSON.stringify({ collection: 'studio', studio: { 'x': { a: 'b' } } }));
    const before = localStorage.getItem(DOCSTUDIO_KEY);
    failReads();
    await mount('docstudio');
    // spy を外して実物を読み直す (書き換えられていないこと)。
    vi.restoreAllMocks();
    expect(localStorage.getItem(DOCSTUDIO_KEY)).toBe(before);
  });

  it('★ 標本: 読める端末では帯が出ず、「自動保存」と言う (規則が空振りしていない)', async () => {
    await mount('docstudio');
    expect(container.querySelector('[data-store-unreadable]')).toBeNull();
    expect(text()).toContain('入力は端末内に自動保存');
  });

  it('読める端末では、保存済みの差込値がフォームに戻る', async () => {
    localStorage.setItem(DOCSTUDIO_KEY, JSON.stringify({ collection: 'studio' }));
    await mount('docstudio');
    // 読めているので帯は出ない (値そのものは docstudioKessanSheets.test.ts が押している)。
    expect(container.querySelector('[data-store-unreadable]')).toBeNull();
  });
});

describe('Team Radar — 下書きを読み出せない端末 (パス 160)', () => {
  it('★ 見出しと帯が「読み出せていない」と言い、見本だと断る', async () => {
    failReads();
    await mount('teamradar');
    expect(text()).toContain('保存した下書きを読み出せていません');
    const band = container.querySelector('[data-draft-unreadable]');
    expect(band).not.toBeNull();
    expect(band!.textContent).toContain('プライベートモード');
    expect(band!.textContent).toContain('同梱の見本');
  });

  it('★ 読めていない間は書き戻さない (保存済みの下書きを見本で上書きしない)', async () => {
    localStorage.setItem(
      DRAFT_KEY,
      JSON.stringify({ title: '営業チーム', members: [{ id: 'm1', name: '山田', scores: [4, 4, 4, 4, 4] }] }),
    );
    const before = localStorage.getItem(DRAFT_KEY);
    failReads();
    await mount('teamradar');
    vi.restoreAllMocks();
    expect(localStorage.getItem(DRAFT_KEY)).toBe(before);
  });

  it('★ 標本: 読める端末では帯が出ず、保存した名前が戻る', async () => {
    localStorage.setItem(
      DRAFT_KEY,
      JSON.stringify({ title: '営業チーム 2026', members: [{ id: 'm1', name: '山田', scores: [4, 4, 4, 4, 4] }] }),
    );
    await mount('teamradar');
    expect(container.querySelector('[data-draft-unreadable]')).toBeNull();
    expect(text()).toContain('営業チーム 2026');
    expect(text()).toContain('山田');
  });
});
