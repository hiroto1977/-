/** @vitest-environment jsdom */
/**
 * **ダブルクリックで同じ銘柄を 2 件保存しない。** (2026-09-09 · パス 124)
 *
 * 追加ボタンの handler は `await addHolding(parsed)` の後でしかフォームを空にしない。
 * `RecordStore.insert` は暗号化と IndexedDB を await し、毎回新しい id を振るので、
 * その間にもう 1 度押すと**同じ入力から 2 件**が保存され、評価額の合計に 2 度入る。
 * `useSubmitGuard` が 2 度目を落とし、押している間はボタンを disabled にする。
 *
 * ここは実物の画面で、同じ tick に 2 度クリックして**保存された件数**を数える。
 */
import 'fake-indexeddb/auto';
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MutualFundsPage } from '../MutualFundsPage';
import { _resetRecordStoreForTests, getRecordStore } from '../../data/store';
import { _resetCollectionSubscribersForTests } from '../../data/useCollection';
import { HOLDINGS_COLLECTION } from '../../data/investments';
import { settleUntil, settleUntilAsync, waitForText } from '../../__tests__/jsdomWait';

let container: HTMLDivElement;
let root: Root | null = null;

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

/**
 * 入力欄が出るまで**条件で**待って描く (2026-09-21 · パス 380)。
 *
 * ここは 2026-09-21 まで固定 8 周の `settle()` だった —— 周回数を 0 にすると
 * 2 件とも落ちる (`npm run audit:tick-sensitivity` の実測)。後ろに在るのは
 * 暗号化と IndexedDB の往復である。
 */
async function mount(): Promise<void> {
  root = createRoot(container);
  await act(async () => {
    root!.render(createElement(MutualFundsPage));
  });
  await settleUntil(
    () => container.querySelector('input[placeholder="例: ニッセイ外国株式"]') !== null,
    '銘柄名の欄が出る',
  );
}

const text = (): string => container.textContent ?? '';

async function holdings(): Promise<number> {
  return (await getRecordStore().list(HOLDINGS_COLLECTION)).length;
}

function changeInput(input: HTMLInputElement, value: string): void {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
  if (!setter) throw new Error('value setter not found');
  setter.call(input, value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
}

function byPlaceholder(placeholder: string): HTMLInputElement {
  const el = container.querySelector<HTMLInputElement>(`input[placeholder="${placeholder}"]`);
  if (!el) throw new Error(`input placeholder="${placeholder}" not found`);
  return el;
}

function addButton(): HTMLButtonElement {
  const button = Array.from(container.querySelectorAll('button')).find((b) => b.textContent?.includes('＋ 銘柄を追加'));
  if (!button) throw new Error('add button not found');
  return button;
}

beforeEach(async () => {
  _resetRecordStoreForTests();
  _resetCollectionSubscribersForTests();
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
  if (root) {
    await act(async () => {
      root!.unmount();
    });
    root = null;
  }
  document.body.removeChild(container);
});

describe('投資信託 — 追加ボタンの二重送信', () => {
  it('★ 同じ tick に 2 度押しても、保存される銘柄は 1 件', async () => {
    await mount();
    await act(async () => {
      changeInput(byPlaceholder('例: ニッセイ外国株式'), '二度押しファンド');
      changeInput(byPlaceholder('空欄=自動計算'), '300000');
    });
    await act(async () => {
      const b = addButton();
      b.click();
      b.click();
    });
    // ★ **ここで「記録が 1 件になるまで」待ってはいけない** —— 関門が壊れていれば
    //   2 件目は後から来るので、1 件を見た瞬間に通って**偽陽性**になる。
    //   待つのは「1 件目が画面に出た」= 保存が解決して一覧が描き直された印で、
    //   件数の主張はその後に置く (`settleUntilAsync` の docblock の後半)。
    await waitForText(text, '二度押しファンド');
    expect(await holdings()).toBe(1);
    expect(text().match(/二度押しファンド/g)?.length ?? 0).toBe(1);
  });

  it('対照: 間を置いて 2 度足せば 2 件 (関門は同時だけを止める)', async () => {
    await mount();
    let want = 0;
    for (const name of ['一件目', '二件目']) {
      await act(async () => {
        changeInput(byPlaceholder('例: ニッセイ外国株式'), name);
        changeInput(byPlaceholder('空欄=自動計算'), '300000');
      });
      await act(async () => {
        addButton().click();
      });
      want += 1;
      // 増える向きの主張なので、記録そのものを非同期の述語で待てる。
      await settleUntilAsync(async () => (await holdings()) === want, `銘柄が ${want} 件になる`);
    }
    expect(await holdings()).toBe(2);
  });
});
