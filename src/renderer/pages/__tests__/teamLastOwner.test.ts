/** @vitest-environment jsdom */
/**
 * **最後のオーナーを降格させられてはいけない。**
 *
 * 削除の側だけがこの不変条件を守っていた (2026-09-06 実測): × ボタンは
 * `canRemoveMember` で無効になり「最後のオーナーは削除できません。」と言うのに、
 * 役割の `<select>` は全員に 3 つの選択肢を出し `onChangeRole` は素で `edit` を
 * 呼んでいた。オーナー 1 人の組織でその 1 人を「メンバー」にすると
 * **オーナーが 0 人**になり、そこから先は削除の守りごと外れる
 * (`canRemoveMember(*, 0)` は誰でも削除できると答える)。
 *
 * ここは実物の record store (fake-indexeddb) にメンバーを入れて画面を描き、
 * `<select>` を実際に動かす。
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
  for (let i = 0; i < 6; i += 1) {
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

function setNative(el: HTMLSelectElement, value: string): void {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value')?.set;
  if (!setter) throw new Error('value setter not found');
  setter.call(el, value);
  el.dispatchEvent(new Event('change', { bubbles: true }));
}

/** 行の役割 `<select>` を名前で引く。 */
function roleSelectFor(name: string): HTMLSelectElement {
  const row = Array.from(container.querySelectorAll('tr')).find((tr) => tr.textContent?.includes(name));
  const sel = row?.querySelector('select');
  if (!sel) throw new Error(`role select for ${name} not found`);
  return sel as HTMLSelectElement;
}

const text = () => container.textContent ?? '';

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

describe('チーム — 最後のオーナー', () => {
  it('★ オーナーが 1 人のとき、その人を降格できない (断りの文言が出る)', async () => {
    await getRecordStore().insert(MEMBERS_COLLECTION, { name: '一人目', email: 'a@example.com', role: 'owner' });
    await getRecordStore().insert(MEMBERS_COLLECTION, { name: '二人目', email: 'b@example.com', role: 'member' });
    await mount();

    const sel = roleSelectFor('一人目');
    await act(async () => {
      setNative(sel, 'member');
    });
    await settle();

    expect(text()).toContain('最後のオーナーは降格できません');
    // 保存もされていない (実物の store を読み直して確かめる)。
    const rows = await getRecordStore().list<{ name: string; role: string }>(MEMBERS_COLLECTION);
    expect(rows.find((r) => r.data.name === '一人目')?.data.role).toBe('owner');
  });

  it('★ 降格できない選択肢は `<select>` の側でも無効になっている', async () => {
    await getRecordStore().insert(MEMBERS_COLLECTION, { name: '一人目', email: 'a@example.com', role: 'owner' });
    await mount();
    const options = Array.from(roleSelectFor('一人目').querySelectorAll('option'));
    const disabled = options.filter((o) => o.disabled).map((o) => o.value);
    expect(disabled.sort()).toEqual(['admin', 'member']);
  });

  it('対照: オーナーが 2 人なら降格できる (保存され、断りは出ない)', async () => {
    await getRecordStore().insert(MEMBERS_COLLECTION, { name: '一人目', email: 'a@example.com', role: 'owner' });
    await getRecordStore().insert(MEMBERS_COLLECTION, { name: '二人目', email: 'b@example.com', role: 'owner' });
    await mount();

    await act(async () => {
      setNative(roleSelectFor('一人目'), 'member');
    });
    await settle();

    expect(text()).not.toContain('最後のオーナーは降格できません');
    const rows = await getRecordStore().list<{ name: string; role: string }>(MEMBERS_COLLECTION);
    expect(rows.find((r) => r.data.name === '一人目')?.data.role).toBe('member');
  });

  it('対照: メンバーをオーナーへ上げる道は閉じていない', async () => {
    await getRecordStore().insert(MEMBERS_COLLECTION, { name: '一人目', email: 'a@example.com', role: 'owner' });
    await getRecordStore().insert(MEMBERS_COLLECTION, { name: '二人目', email: 'b@example.com', role: 'member' });
    await mount();

    await act(async () => {
      setNative(roleSelectFor('二人目'), 'owner');
    });
    await settle();

    const rows = await getRecordStore().list<{ name: string; role: string }>(MEMBERS_COLLECTION);
    expect(rows.find((r) => r.data.name === '二人目')?.data.role).toBe('owner');
  });
});
