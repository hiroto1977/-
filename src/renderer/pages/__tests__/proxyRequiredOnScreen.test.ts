/** @vitest-environment jsdom */
/**
 * **断りは押す前に出て、フォームは消えない** (2026-09-25 · パス 459)。
 *
 * 母集団と配線は `renderer/__tests__/proxyRequiredNoticeCensus.test.ts` が持つ。
 * ここは**振る舞いの背骨** —— 実物の `CloudflarePage` を 3 つの実行形態で描き、
 * 開いたフォームの中で断りが**最初の入力欄より前**に在ることと、
 * デスクトップ版・まだ分からないあいだは 1 文も出ないことを見る。
 *
 * `CloudflarePage` を選んだのは**プロキシを通る書き込みを 2 つ持つ唯一の画面**で、
 * しかも同じ画面に「Cloudflare プロキシを通す（オレンジ雲）」という
 * **別の意味の「プロキシ」**が在るため —— 綴りだけを数える検査では
 * 満たされてしまう所を、DOM の位置で見る。
 */
import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { SERVICES } from '../../services';
import { resetRecordStore } from '../../__tests__/recordStoreHarness';
import { _resetCollectionSubscribersForTests } from '../../data/useCollection';
import { _resetNavigationIntentForTests } from '../../navigate';
import { settleUntil, waitForElement } from '../../__tests__/jsdomWait';

type Kind = 'browser' | 'desktop' | 'unknown';

const ZONE = { id: 'zone-abc123', name: 'example.com' };

/**
 * **橋の代役は必ず `getVersion` を持つ** —— `isBrowserBuild()` の `catch` は
 * デスクトップ版へ倒れるので、持たない代役は「デスクトップ版を試した」ことになる
 * (パス 454 / 455 で 2 度踏んだ形)。`unknown` は**解決しない約束**で表す。
 */
function stubHub(kind: Kind): void {
  const version =
    kind === 'unknown' ? new Promise<string>(() => {})
    : Promise.resolve(kind === 'browser' ? '0.1.0-web' : '0.1.0');
  (globalThis as unknown as { serviceHub: unknown }).serviceHub = {
    getVersion: () => version,
    listConfigured: () => Promise.resolve(['cloudflare']),
    fetchSnapshot: () =>
      Promise.resolve({
        ok: true,
        data: {
          user: { email: 'ops@example.com', id: 'u1' },
          zones: [{
            id: ZONE.id,
            name: ZONE.name,
            status: 'active',
            plan: 'Free',
            accountName: 'Acme',
            nameServers: ['ns1.example.net', 'ns2.example.net'],
            devModeRemainingSec: 0,
          }],
        },
      }),
    invoke: () => Promise.resolve({ ok: true, data: {} }),
    openExternal: () => Promise.resolve(),
    openPath: () => Promise.resolve({ ok: true }),
    revealInFolder: () => Promise.resolve({ ok: true }),
    oauthSupported: () => Promise.resolve(false),
    setToken: () => Promise.resolve({ ok: true }),
    clearToken: () => Promise.resolve({ ok: true }),
  };
}

let container: HTMLDivElement;
let root: Root | null = null;

async function mount(kind: Kind): Promise<void> {
  stubHub(kind);
  const def = SERVICES.find((s) => s.id === 'cloudflare');
  if (!def) throw new Error('cloudflare service missing from the sidebar');
  root = createRoot(container);
  await act(async () => {
    root!.render(createElement(def.page));
  });
  // 錠は**ゾーンが届いたこと** (見出しは届く前から出ている)。
  await waitForElement(() => container.querySelector('button:not([disabled])'), 'ゾーンが届く');
}

function buttonsWith(text: string): HTMLButtonElement[] {
  return Array.from(container.querySelectorAll('button')).filter(
    (b) => (b.textContent ?? '').trim() === text,
  );
}

async function openForms(): Promise<void> {
  for (const b of buttonsWith('作成').concat(buttonsWith('パージ'))) {
    await act(async () => {
      b.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
  }
  await settleUntil(
    () => container.querySelectorAll('.card input, .card select').length >= 2,
    '2 つのフォームが開く',
  );
}

function notes(): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>('[data-proxy-required]'));
}

beforeEach(async () => {
  // **共有の後始末を通す** —— `_resetRecordStoreForTests()` は singleton を捨てる
  // だけで IndexedDB は残るので、隣の `it` が書いた行が見える
  // (`__tests__/recordStoreIsolation.test.ts` がその母集団を持ち、
  //  このファイルを書いたその場で捕まえた)。
  await resetRecordStore();
  _resetCollectionSubscribersForTests();
  _resetNavigationIntentForTests();
  container = document.createElement('div');
  document.body.appendChild(container);
});

afterEach(async () => {
  if (root) await act(async () => root!.unmount());
  root = null;
  container.remove();
  delete (globalThis as unknown as { serviceHub?: unknown }).serviceHub;
});

describe('プロキシの前提は、ブラウザ版で打ち始める前に出る', () => {
  it('★ ブラウザ版: 2 つのフォームのどちらにも出て、最初の入力欄より前に在る', async () => {
    await mount('browser');
    await openForms();
    const found = notes();
    expect(found.length, '2 つのフォームのどちらかに断りが無い').toBe(2);
    for (const note of found) {
      expect(note.textContent ?? '').toContain('プロキシ (Cloudflare Worker) の登録が要ります');
      const card = note.closest('.card');
      expect(card, '断りがフォームの外に居る').not.toBeNull();
      const first = card!.querySelector('input, select, textarea');
      expect(first, 'フォームに入力欄が無い').not.toBeNull();
      // **DOM の順序で**前に在ること (押した後ではなく、打ち始める前に読ませる)。
      expect(
        note.compareDocumentPosition(first!) & Node.DOCUMENT_POSITION_FOLLOWING,
        '断りが最初の入力欄より後ろに在る',
      ).toBeTruthy();
    }
  });

  it('★ ブラウザ版: 押す口は消えない (逃げ口は開いたまま)', async () => {
    await mount('browser');
    await openForms();
    expect(buttonsWith('レコードを作成').length + buttonsWith('パージ実行').length)
      .toBeGreaterThanOrEqual(1);
  });

  it('★ デスクトップ版: 1 文も出ない (main は直接つなぐので前提が偽になる)', async () => {
    await mount('desktop');
    await openForms();
    expect(notes()).toHaveLength(0);
    expect(container.textContent ?? '').not.toContain('プロキシ (Cloudflare Worker) の登録が要ります');
    // 針の標本 —— 同じ画面に在る**別の意味の**「プロキシ」は残っている。
    expect(container.textContent ?? '').toContain('Cloudflare プロキシを通す');
  });

  it('★ まだ分からないあいだ (null) も出さない', async () => {
    await mount('unknown');
    await openForms();
    expect(notes()).toHaveLength(0);
  });
});
