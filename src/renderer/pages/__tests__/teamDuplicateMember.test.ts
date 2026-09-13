/** @vitest-environment jsdom */
/**
 * **同じメールアドレスのメンバーを 2 度招待しない。** (2026-09-09 · パス 125)
 *
 * メンバーはメールアドレスが 1 人の単位だが、チームの画面は同じ人を 2 度招待しても断らず、
 * `members.length` が 1 増える —— シートを 2 つ使い、一人当たりの金額 (売上高・営業利益・
 * 人件費 = 累計 ÷ 従業員数) が薄まり、金融機関等提出用の書面 §3「従業員数」まで届く。
 * 氏名に「編集」は無く (役割だけ一覧で変えられる)、訂正は × で消してから入れ直す —— 先に
 * 入れ直すと 2 人になる。
 *
 * ここは実物の画面で 3 面を読む: 同じメール (大文字・前後の空白違い) の招待は断られ件数が
 * 増えない (訂正の案内つき)・既に重複が在れば一覧の上に警告が出る・別のメールなら通る (対照)。
 */
import 'fake-indexeddb/auto';
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { TeamPage } from '../TeamPage';
import { _resetRecordStoreForTests, getRecordStore } from '../../data/store';
import { _resetCollectionSubscribersForTests } from '../../data/useCollection';
import { MEMBERS_COLLECTION } from '../../data/members';

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

async function settle(): Promise<void> {
  for (let i = 0; i < 8; i += 1) {
    await act(async () => {
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    });
  }
}

async function mount(): Promise<void> {
  root = createRoot(container);
  await act(async () => {
    root!.render(createElement(TeamPage));
  });
  await settle();
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

/** 文字がちょうど一致するボタン。 */
async function clickButtonExact(label: string): Promise<void> {
  const button = Array.from(container.querySelectorAll('button')).find((b) => b.textContent?.trim() === label);
  if (!button) throw new Error(`button "${label}" not found`);
  await act(async () => {
    button.click();
  });
  await settle();
}

const text = (): string => (container.textContent ?? '').replace(/\s+/g, ' ');

async function invite(name: string, email: string): Promise<void> {
  await act(async () => {
    changeInput(byPlaceholder('氏名'), name);
    changeInput(byPlaceholder('メールアドレス'), email);
  });
  await clickButtonExact('招待');
}

async function countMembers(): Promise<number> {
  return (await getRecordStore().list(MEMBERS_COLLECTION)).length;
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

describe('チーム — 同じメールアドレスを 2 人にしない', () => {
  it('★ 同じメール (大文字・前後の空白違い) の招待は断られ、件数は増えず、訂正の案内が出る', async () => {
    await getRecordStore().insert(MEMBERS_COLLECTION, { name: '太郎', email: 'taro@example.com', role: 'owner' });
    await mount();
    expect(await countMembers()).toBe(1);
    await invite('太郎 (再)', '  TARO@Example.com ');
    expect(await countMembers()).toBe(1);
    expect(text()).toContain('taro@example.com は「太郎」として既に登録されています');
    expect(text()).toContain('一覧の × で消してから入れ直してください');
    // 一覧にも 1 行だけ (シートの表示も 1)
    expect((text().match(/taro@example\.com/gi) ?? []).length).toBeGreaterThanOrEqual(1);
    expect(container.querySelectorAll('tbody tr').length).toBe(1);
  });

  it('対照: 別のメールなら通る (件数が増え、断りは出ない)', async () => {
    await getRecordStore().insert(MEMBERS_COLLECTION, { name: '太郎', email: 'taro@example.com', role: 'owner' });
    await mount();
    await invite('花子', 'hanako@example.com');
    expect(await countMembers()).toBe(2);
    expect(text()).not.toContain('既に登録されています');
    expect(container.querySelectorAll('tbody tr').length).toBe(2);
  });

  it('★ 既に重複が在れば、一覧の上で「2 度数えられている」と警告する', async () => {
    await getRecordStore().insert(MEMBERS_COLLECTION, { name: '太郎', email: 'taro@example.com', role: 'owner' });
    await getRecordStore().insert(MEMBERS_COLLECTION, { name: '太郎 (再)', email: 'Taro@example.com', role: 'member' });
    await mount();
    const alert = Array.from(container.querySelectorAll('[role="alert"]')).find((el) => (el.textContent ?? '').includes('重複'));
    expect(alert, 'role="alert" に重複の警告が無い').toBeDefined();
    const t = (alert!.textContent ?? '').replace(/\s+/g, ' ');
    expect(t).toContain('同じメールアドレスのメンバーが 1 組重複しており、従業員数に 2 度数えられています');
    expect(t).toContain('taro@example.com ×2');
  });

  it('対照: 重複が無ければ警告は出ない', async () => {
    await getRecordStore().insert(MEMBERS_COLLECTION, { name: '太郎', email: 'taro@example.com', role: 'owner' });
    await getRecordStore().insert(MEMBERS_COLLECTION, { name: '花子', email: 'hanako@example.com', role: 'member' });
    await mount();
    expect(text()).not.toContain('重複');
  });
});
