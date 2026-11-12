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
 *
 * ## 待ちは回数ではなく条件で (2026-09-21 · パス 383)
 *
 * `audit:tick-sensitivity` の台帳はこのファイルを `setup-flush` と分類し、
 * 「落ちるのは主張ではなく**操作**の側」「条件で待っても、遷移が起きていなければ
 * 待てない」と `why` に書いていた。**測ると偽だった** —— 周回数を 0 にすると
 * 4 件すべてが `roleSelectFor(…)` の `role select for 一人目 not found` で
 * 落ちる。つまり落ちているのは**行がまだ描かれていないのに探していること**で、
 * それは条件で待てる (`waitForElement`)。
 *
 * ★ **`why` が「道具では無理」と言っていたら、まず測る** —— パス 380 と 382 に
 * 続いて **3 度目**に台帳の `why` が実物と違っていた。分類は*見た形*であって
 * *測った原因*ではない。
 */
import 'fake-indexeddb/auto';
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { TeamPage } from '../TeamPage';
import { _resetRecordStoreForTests, getRecordStore } from '../../data/store';
import { _resetCollectionSubscribersForTests } from '../../data/useCollection';
import { MEMBERS_COLLECTION } from '../../data/members';
import { settleUntilAsync, waitForElement, waitForText } from '../../__tests__/jsdomWait';

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

async function mount(): Promise<void> {
  root = createRoot(container);
  await act(async () => {
    root!.render(createElement(TeamPage));
  });
  // 一覧は保管層 (IndexedDB) の往復のあとに描かれる。行が出るまで待つ ——
  // 待たずに `roleSelectFor` を呼ぶと「見つからない」で死ぬ (0 周で実測)。
  await waitForElement(() => memberRow('一人目'), '「一人目」の行');
}

/** 名前を含む行。まだ無ければ `null` (待ちに渡せる形)。 */
function memberRow(name: string): HTMLTableRowElement | null {
  return Array.from(container.querySelectorAll('tr')).find(
    (tr) => tr.textContent?.includes(name),
  ) ?? null;
}

function setNative(el: HTMLSelectElement, value: string): void {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value')?.set;
  if (!setter) throw new Error('value setter not found');
  setter.call(el, value);
  el.dispatchEvent(new Event('change', { bubbles: true }));
}

/**
 * 行の役割 `<select>` を名前で引く。**出るまで待つ** —— 待たずに引くと
 * 「見つからない」という**待ちとは無関係な言い方**で死ぬ (パス 169 の教訓)。
 */
async function roleSelectFor(name: string): Promise<HTMLSelectElement> {
  return waitForElement(
    () => memberRow(name)?.querySelector('select') ?? null,
    `「${name}」の役割の select`,
  );
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

    const sel = await roleSelectFor('一人目');
    await act(async () => {
      setNative(sel, 'member');
    });
    // 押した後は待たない —— 見たい物 (断りの文) で待つ。
    await waitForText(text, '最後のオーナーは降格できません');
    // 保存もされていない (実物の store を読み直して確かめる)。
    const rows = await getRecordStore().list<{ name: string; role: string }>(MEMBERS_COLLECTION);
    expect(rows.find((r) => r.data.name === '一人目')?.data.role).toBe('owner');
  });

  it('★ 降格できない選択肢は `<select>` の側でも無効になっている', async () => {
    await getRecordStore().insert(MEMBERS_COLLECTION, { name: '一人目', email: 'a@example.com', role: 'owner' });
    await mount();
    const options = Array.from((await roleSelectFor('一人目')).querySelectorAll('option'));
    const disabled = options.filter((o) => o.disabled).map((o) => o.value);
    expect(disabled.sort()).toEqual(['admin', 'member']);
  });

  it('対照: オーナーが 2 人なら降格できる (保存され、断りは出ない)', async () => {
    await getRecordStore().insert(MEMBERS_COLLECTION, { name: '一人目', email: 'a@example.com', role: 'owner' });
    await getRecordStore().insert(MEMBERS_COLLECTION, { name: '二人目', email: 'b@example.com', role: 'owner' });
    await mount();

    const sel = await roleSelectFor('一人目');
    await act(async () => {
      setNative(sel, 'member');
    });
    /*
     * **否定を見る前に、起きたことを条件で待つ** (パス 377 の 2 段)。
     * 錠は保管層の値 —— この画面は降格しても文を出さないので、DOM に
     * 待てる印が無い。`settleUntilAsync` は**増える一方の値**にだけ使う
     * 決まりで、ここは 'owner' → 'member' の一方向なので当てはまる。
     */
    await settleUntilAsync(
      async () => {
        const saved = await getRecordStore().list<{ name: string; role: string }>(MEMBERS_COLLECTION);
        return saved.find((r) => r.data.name === '一人目')?.data.role === 'member';
      },
      '「一人目」が member として保存される',
    );
    expect(text()).not.toContain('最後のオーナーは降格できません');
  });

  it('対照: メンバーをオーナーへ上げる道は閉じていない', async () => {
    await getRecordStore().insert(MEMBERS_COLLECTION, { name: '一人目', email: 'a@example.com', role: 'owner' });
    await getRecordStore().insert(MEMBERS_COLLECTION, { name: '二人目', email: 'b@example.com', role: 'member' });
    await mount();

    const sel = await roleSelectFor('二人目');
    await act(async () => {
      setNative(sel, 'owner');
    });
    await settleUntilAsync(
      async () => {
        const saved = await getRecordStore().list<{ name: string; role: string }>(MEMBERS_COLLECTION);
        return saved.find((r) => r.data.name === '二人目')?.data.role === 'owner';
      },
      '「二人目」が owner として保存される',
    );
  });
});
