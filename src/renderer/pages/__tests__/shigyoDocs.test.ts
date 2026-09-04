/** @vitest-environment jsdom */
/**
 * 士業のページ → 書類スタジオ / 経営サマリー。「書類スタジオで作る書類」の節が仕分け表の
 * 逆引きで並び、ボタンが遷移の指示 (どの書類を開くか・何を最初にするか) を届けること。
 */
import 'fake-indexeddb/auto';
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { SERVICES } from '../../services';
import { _resetRecordStoreForTests } from '../../data/store';
import { _resetCollectionSubscribersForTests } from '../../data/useCollection';
import { _resetNavigationIntentForTests, onNavigate, takeNavigationIntent } from '../../navigate';
import { docsForProfessional } from '../../data/businessTriage';

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
  for (let i = 0; i < 6; i += 1) {
    await act(async () => {
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    });
  }
}

let container: HTMLDivElement;
let root: Root | null = null;

async function mount(id: string): Promise<void> {
  const def = SERVICES.find((s) => s.id === id);
  if (!def) throw new Error(`${id} service missing`);
  root = createRoot(container);
  await act(async () => {
    root!.render(createElement(def.page));
  });
  await settle();
}

async function unmount(): Promise<void> {
  if (root) {
    await act(async () => {
      root!.unmount();
    });
    root = null;
  }
}

const q = {
  button: (text: string) => {
    const b = Array.from(container.querySelectorAll('button')).find((el) => el.textContent === text);
    if (!b) throw new Error(`button "${text}" not found`);
    return b;
  },
  hasButton: (text: string) => Array.from(container.querySelectorAll('button')).some((el) => el.textContent === text),
  docRows: () => Array.from(container.querySelectorAll('table[data-shigyo-docs] tbody tr')).map((tr) => ({
    label: tr.querySelectorAll('td')[0]?.textContent ?? '',
    relation: tr.querySelectorAll('td')[1]?.textContent ?? '',
    own: tr.querySelectorAll('td')[2]?.textContent ?? '',
    button: tr.querySelector('button')!,
  })),
};

async function click(el: HTMLElement): Promise<void> {
  await act(async () => {
    el.click();
  });
  await settle();
}

beforeEach(async () => {
  _resetRecordStoreForTests();
  _resetCollectionSubscribersForTests();
  _resetNavigationIntentForTests();
  await new Promise<void>((resolve) => {
    const req = indexedDB.deleteDatabase('business-hub-data');
    req.onsuccess = () => resolve();
    req.onerror = () => resolve();
    req.onblocked = () => resolve();
  });
  container = document.createElement('div');
  document.body.appendChild(container);
});

afterEach(async () => {
  await unmount();
  document.body.removeChild(container);
});

describe('士業のページ — 書類スタジオで作る書類', () => {
  it('税理士: 仕分け表の逆引きどおりに並び、計算書類は経営サマリーの数値から作れる', async () => {
    await mount('tax-accountant');
    const expected = docsForProfessional('tax-accountant');
    const rows = q.docRows();
    expect(rows.map((r) => r.label)).toEqual(expected.map((d) => d.label));
    expect(rows.map((r) => r.label)).toContain('計算書類（4点）');
    const kessan = rows.find((r) => r.label === '計算書類（4点）')!;
    expect(kessan.relation).toBe('相談先');
    expect(kessan.own).toBe('自社で作れる (手順に注意)');

    const seen: string[] = [];
    const off = onNavigate((id) => seen.push(id));
    await click(q.button('経営サマリーの数値から計算書類を作る →'));
    expect(seen).toEqual(['docstudio']);
    expect(takeNavigationIntent('docstudio')).toEqual({ doc: 'kessan', action: 'import-overview' });

    await click(kessan.button);
    expect(seen).toEqual(['docstudio', 'docstudio']);
    expect(takeNavigationIntent('docstudio')).toEqual({ doc: 'kessan' });

    await click(q.button('金融機関等提出用の書面を開く →'));
    expect(seen[2]).toBe('overview');
    expect(takeNavigationIntent('overview')).toEqual({ action: 'bank-sheet' });

    await click(q.button('経営サマリーを開く →'));
    expect(seen[3]).toBe('overview');
    expect(takeNavigationIntent('overview')).toBeNull();
    off();
  });

  it('社労士: 就業規則が独占側で並び、計算書類のボタンは出ない', async () => {
    await mount('labor-consultant');
    const rows = q.docRows();
    const shugyo = rows.find((r) => r.label === '就業規則')!;
    expect(shugyo.relation).toBe('他人のために業として行うと独占業務');
    expect(q.hasButton('経営サマリーの数値から計算書類を作る →')).toBe(false);
    expect(q.hasButton('経営サマリーを開く →')).toBe(true);
    const seen: string[] = [];
    const off = onNavigate((id) => seen.push(id));
    await click(shugyo.button);
    off();
    expect(seen).toEqual(['docstudio']);
    expect(takeNavigationIntent('docstudio')).toEqual({ doc: 'shugyo' });
  });

  it('8 士業すべてに節が出る', async () => {
    for (const id of ['cpa', 'lawyer', 'judicial-scrivener', 'admin-scrivener', 'sme-consultant', 'patent-attorney'] as const) {
      await mount(id);
      expect(q.docRows().length, id).toBeGreaterThan(0);
      await unmount();
    }
  });
});
