/** @vitest-environment jsdom */
/**
 * 士業のページ — 「書類スタジオで作る書類」の担当列。
 * 担当仕分け (professionalDocMap) の主担当・副担当が、根拠とともに
 * 実際の画面に出ること。並びと遷移は shigyoDocs.test.ts が見る。
 */
import 'fake-indexeddb/auto';
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { SERVICES } from '../../services';
import { _resetRecordStoreForTests } from '../../data/store';
import { _resetCollectionSubscribersForTests } from '../../data/useCollection';
import { _resetNavigationIntentForTests } from '../../navigate';

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

/** 書類名 → 担当列 (主担当/副担当 + 根拠) の文。 */
function assignmentCell(label: string): string {
  const row = Array.from(container.querySelectorAll('table[data-shigyo-docs] tbody tr')).find(
    (tr) => tr.querySelectorAll('td')[0]?.textContent === label,
  );
  if (!row) throw new Error(`row "${label}" not found`);
  return row.querySelectorAll('td')[3]?.textContent ?? '';
}

function rowCount(): number {
  return container.querySelectorAll('table[data-shigyo-docs] tbody tr').length;
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

describe('士業のページ — 担当列 (主担当・副担当)', () => {
  it('税理士: 計算書類は主担当として、根拠つきで出る', async () => {
    await mount('tax-accountant');
    const cell = assignmentCell('計算書類（4点）');
    expect(cell).toContain('主担当');
    expect(cell).toContain('法定監査は公認会計士の独占');
    expect(assignmentCell('請求書（適格請求書・インボイス対応）')).toContain('主担当');
  });

  it('公認会計士: 主担当は無く、計算書類が副担当として 1 行だけ出る', async () => {
    await mount('cpa');
    expect(rowCount()).toBe(1);
    const cell = assignmentCell('計算書類（4点）');
    expect(cell).toContain('副担当');
    expect(cell).not.toContain('主担当として');
  });

  it('弁理士: 秘密保持契約書が副担当として 1 行だけ出る', async () => {
    await mount('patent-attorney');
    expect(rowCount()).toBe(1);
    const cell = assignmentCell('秘密保持契約書（相互・NDA）');
    expect(cell).toContain('副担当');
    expect(cell).toContain('弁理士も関わる');
  });
});
