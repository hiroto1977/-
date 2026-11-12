/** @vitest-environment jsdom */
/**
 * **欄を開いた後に別のタブが書き換えた行を、古い欄の値で黙って上書きしない** (2026-09-27 · パス 499)。
 *
 * 実体を丸ごと編集する 3 画面 (投資信託の銘柄・不動産の物件・士業の連絡先) は、保存で**全部の欄**を
 * 書く。直す前は `edit` (= `store.update`) で書いていたので、欄を開いた後に別のタブが直した欄まで、
 * 開いた時の値へ戻した。実測 (2026-09-27 · 直す前・実 chromium の 2 タブ):
 *
 * | 手順 | 保管層の評価額 |
 * | --- | --- |
 * | B が銘柄の「編集」を押す (評価額 300,000 が欄に入る) | 300,000 |
 * | A が同じ銘柄の評価額を 500,000 に直して保存 | 500,000 |
 * | B が名前だけ直して保存 | **300,000** —— A の直しが黙って消える。どちらの画面も何も言わない |
 *
 * 直した後は `editIfUnchanged` で「欄を開いた時の中身のままなら」書く。違えば**書かずに**断り、
 * 入力を残し、比較の基準を今の行へ移す —— 利用者は知ったうえで「もう一度押して上書き」か
 * 「一覧の編集で今の内容から始め直す」を選べる。
 *
 * 「別のタブ」は 2 通りで作る:
 *  - 書き換え: 画面の購読を残したまま保管層へ書く (このタブの写しがそれを知っていても、
 *    **欄に入っているのは開いた時の値**なので、欠陥の形は同じ)。
 *  - 表示: 保管層へ**素の IndexedDB で**書き (このモジュールの知らせを通さない = 別のタブの書き込み)、
 *    別の BroadcastChannel から合図を流す。画面の一覧がそれを拾えば、知らせは別のタブへも届いている。
 */
import 'fake-indexeddb/auto';
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { SERVICES } from '../../services';
import { getRecordStore } from '../../data/store';
import { _resetCollectionSubscribersForTests } from '../../data/useCollection';
import { RECORD_CHANGE_CHANNEL, RECORD_CHANGE_MESSAGE } from '../../data/collectionChange';
import { RECORD_DB_NAME, resetRecordStore } from '../../__tests__/recordStoreHarness';
import {
  HOLDINGS_COLLECTION,
  PROPERTIES_COLLECTION,
  parseHoldingEntry,
  parsePropertyEntry,
  type HoldingEntry,
  type PropertyEntry,
} from '../../data/investments';
import { SHIGYO_CONTACTS_COLLECTION, parseShigyoContact, type ShigyoContactEntry } from '../../data/shigyoDirectory';
import { settleUntil, settleUntilAsync, waitForText } from '../../__tests__/jsdomWait';

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

let container: HTMLDivElement;
let root: Root | null = null;
const channels: BroadcastChannel[] = [];

const text = (): string => (container.textContent ?? '').replace(/\s+/g, ' ');

beforeEach(async () => {
  await resetRecordStore();
  _resetCollectionSubscribersForTests();
  localStorage.clear();
  container = document.createElement('div');
  document.body.appendChild(container);
});

afterEach(async () => {
  for (const c of channels.splice(0)) c.close();
  if (root) {
    const r = root;
    root = null;
    await act(async () => {
      r.unmount();
    });
  }
  container.remove();
  _resetCollectionSubscribersForTests();
});

async function mountPage(id: string): Promise<void> {
  const def = SERVICES.find((s) => s.id === id);
  if (!def) throw new Error(`service ${id} missing`);
  root = createRoot(container);
  await act(async () => {
    root!.render(createElement(def.page));
  });
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

function buttonIn(scope: ParentNode, label: string): HTMLButtonElement {
  const b = Array.from(scope.querySelectorAll('button')).find((x) => (x.textContent ?? '').trim() === label);
  if (!b) throw new Error(`button "${label}" not found`);
  return b;
}

function rowWith(name: string): HTMLTableRowElement {
  const tr = Array.from(container.querySelectorAll('tr')).find((r) => (r.textContent ?? '').includes(name));
  if (!tr) throw new Error(`row "${name}" not found`);
  return tr;
}

async function click(el: HTMLElement): Promise<void> {
  await act(async () => {
    el.click();
  });
}

/** 断りの句 (画面ごとの文はこの句を含む)。 */
const CHANGED = '編集を始めた後に別の画面で書き換えられています';

/**
 * 別のタブの書き込み —— **このモジュールの store も知らせも通さず**、素の IndexedDB で 1 行を置き、
 * 別の BroadcastChannel から合図を流す (実物の別のタブがすることと同じ 2 手)。
 */
async function writeFromOtherTab(collection: string, data: Record<string, unknown>): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const req = indexedDB.open(RECORD_DB_NAME);
    req.onerror = () => reject(req.error);
    req.onsuccess = () => {
      const db = req.result;
      const tx = db.transaction('records', 'readwrite');
      const now = Date.now();
      tx.objectStore('records').put({ id: `other-tab-${now}`, collection, createdAt: now, updatedAt: now, data });
      tx.oncomplete = () => {
        db.close();
        resolve();
      };
      tx.onerror = () => reject(tx.error);
    };
  });
  const other = new BroadcastChannel(RECORD_CHANGE_CHANNEL);
  channels.push(other);
  other.postMessage(RECORD_CHANGE_MESSAGE);
}

describe('投資信託 — 欄を開いた後に、別のタブが同じ銘柄を書き換えた', () => {
  async function openEditor(): Promise<{ id: string }> {
    const row = await getRecordStore().insert(
      HOLDINGS_COLLECTION,
      parseHoldingEntry({ code: 'RACE1', name: '競る銘柄', units: '1000', navPerUnit: '10000' }),
    );
    await mountPage('mutual-funds');
    await waitForText(text, '競る銘柄');
    await click(buttonIn(rowWith('競る銘柄'), '編集'));
    await settleUntil(() => byPlaceholder('例: ニッセイ外国株式').value === '競る銘柄', '編集の欄に読み込まれる');
    await act(async () => {
      changeInput(byPlaceholder('例: ニッセイ外国株式'), 'このタブで直した名前');
    });
    return { id: row.id };
  }

  it('★ 保存は書かずに断り、入力を残し、別のタブの値を消さない', async () => {
    const { id } = await openEditor();
    // 別のタブが口数を 1000 → 2500 に直した。
    await getRecordStore().update<HoldingEntry>(id, { units: 2500 });

    await click(buttonIn(container, '保存 (自動反映)'));
    await waitForText(text, CHANGED);
    expect(text()).toContain('保存していません');
    // 入力は残る。
    expect(byPlaceholder('例: ニッセイ外国株式').value).toBe('このタブで直した名前');
    // 別のタブの 2500 は残り、このタブの名前は書かれていない。
    const stored = (await getRecordStore().get<HoldingEntry>(id))?.data;
    expect(stored?.units).toBe(2500);
    expect(stored?.name).toBe('競る銘柄');
    // 編集の相手は外れない (もう一度押せば上書きできる) —— ボタンの label で見る
    // (断りの文も「保存 (自動反映)」を名指しするので、画面の文では区別できない)。
    expect(buttonIn(container, '保存 (自動反映)')).toBeTruthy();
    expect(() => buttonIn(container, '＋ 銘柄を追加')).toThrow();
  });

  it('★ 断りの後にもう一度押せば、知ったうえで上書きする (基準は今の行へ移っている)', async () => {
    const { id } = await openEditor();
    await getRecordStore().update<HoldingEntry>(id, { units: 2500 });
    await click(buttonIn(container, '保存 (自動反映)'));
    await waitForText(text, CHANGED);

    await click(buttonIn(container, '保存 (自動反映)'));
    await settleUntilAsync(
      async () => (await getRecordStore().get<HoldingEntry>(id))?.data.name === 'このタブで直した名前',
      '2 度目の保存が保管層に届く',
    );
    // 欄の値 (口数 1000) で上書きした —— 利用者は断りでそれを知らされている。
    expect((await getRecordStore().get<HoldingEntry>(id))?.data.units).toBe(1000);
    await settleUntil(() => byPlaceholder('例: ニッセイ外国株式').value === '', 'フォームが空に戻る');
  });

  it('断りの後に一覧の「編集」を押せば、今の内容から始め直す', async () => {
    const { id } = await openEditor();
    await getRecordStore().update<HoldingEntry>(id, { name: '別のタブの名前' });
    await click(buttonIn(container, '保存 (自動反映)'));
    await waitForText(text, CHANGED);
    await click(buttonIn(rowWith('別のタブの名前'), '編集'));
    await settleUntil(() => byPlaceholder('例: ニッセイ外国株式').value === '別のタブの名前', '今の内容が欄に入る');
  });

  it('対照: 欄を開いた後に誰も書き換えていなければ、今までどおり保存する', async () => {
    const { id } = await openEditor();
    await click(buttonIn(container, '保存 (自動反映)'));
    await settleUntilAsync(
      async () => (await getRecordStore().get<HoldingEntry>(id))?.data.name === 'このタブで直した名前',
      '保存が保管層に届く',
    );
    await settleUntil(() => byPlaceholder('例: ニッセイ外国株式').value === '', 'フォームが空に戻る');
    expect(text()).not.toContain(CHANGED);
  });

  it('★ 別のタブが足した銘柄が、開いたままの一覧に届く (再読込しなくても)', async () => {
    await mountPage('mutual-funds');
    await settleUntil(() => text().length > 200, '画面が描かれる');
    await writeFromOtherTab(
      HOLDINGS_COLLECTION,
      parseHoldingEntry({ code: 'OTHER1', name: '別のタブが足した銘柄', units: '100', navPerUnit: '10000' }),
    );
    await waitForText(text, '別のタブが足した銘柄');
  });
});

describe('不動産 — 欄を開いた後に、別のタブが同じ物件を書き換えた', () => {
  it('★ 保存は書かずに断り、入力を残し、別のタブの値を消さない', async () => {
    const row = await getRecordStore().insert(
      PROPERTIES_COLLECTION,
      parsePropertyEntry({ name: '競る物件', type: '区分所有', monthlyRent: '100000', purchasePrice: '12000000', occupied: true }),
    );
    await mountPage('real-estate');
    await waitForText(text, '競る物件');
    await click(buttonIn(rowWith('競る物件'), '編集'));
    await settleUntil(() => byPlaceholder('例: 福岡市アパート').value === '競る物件', '編集の欄に読み込まれる');
    await act(async () => {
      changeInput(byPlaceholder('例: 福岡市アパート'), 'このタブで直した物件');
    });
    // 別のタブが家賃を 100,000 → 120,000 に直した。
    await getRecordStore().update<PropertyEntry>(row.id, { monthlyRent: 120000 });

    await click(buttonIn(container, '保存 (自動反映)'));
    await waitForText(text, CHANGED);
    expect(byPlaceholder('例: 福岡市アパート').value).toBe('このタブで直した物件');
    const stored = (await getRecordStore().get<PropertyEntry>(row.id))?.data;
    expect(stored?.monthlyRent).toBe(120000);
    expect(stored?.name).toBe('競る物件');
  });
});

describe('士業 — 欄を開いた後に、別のタブが同じ連絡先を書き換えた', () => {
  it('★ 保存は書かずに断り、入力を残し、別のタブの値を消さない', async () => {
    const row = await getRecordStore().insert(
      SHIGYO_CONTACTS_COLLECTION,
      parseShigyoContact({ serviceId: 'tax-accountant', name: '競る先生', firm: '', phone: '', email: '' }),
    );
    await mountPage('tax-accountant');
    await waitForText(text, '競る先生');
    await click(buttonIn(rowWith('競る先生'), '編集'));
    await settleUntil(() => byPlaceholder('例: 山田 太郎').value === '競る先生', '編集の欄に読み込まれる');
    await act(async () => {
      changeInput(byPlaceholder('例: 山田 太郎'), 'このタブで直した先生');
    });
    // 別のタブが事務所名を入れた。
    await getRecordStore().update<ShigyoContactEntry>(row.id, { firm: '別のタブの事務所' });

    await click(buttonIn(container, '保存'));
    await waitForText(text, CHANGED);
    expect(byPlaceholder('例: 山田 太郎').value).toBe('このタブで直した先生');
    const stored = (await getRecordStore().get<ShigyoContactEntry>(row.id))?.data;
    expect(stored?.firm).toBe('別のタブの事務所');
    expect(stored?.name).toBe('競る先生');
  });
});
