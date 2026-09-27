/** @vitest-environment jsdom */
/**
 * **編集の相手が消えていたら、保存は黙って成功を装わない。** (2026-09-27 · パス 498)
 *
 * `useCollection` の `edit` は `store.update` を呼ぶ。`store.update` は相手の行が**無ければ何も書かずに
 * `null` を返す** (投げない)。ところが `edit` は `Promise<void>` で、その `null` を捨てていた。
 * 呼び手はどれも「書けた」前提で次へ進むので、**別のタブ (や別の画面) で消された行**を編集して
 * 保存すると、何も書かれないのに画面は保存が済んだ形になる:
 *
 * | 画面 | 保存の後 (直す前の実測) |
 * | --- | --- |
 * | 投資信託の銘柄の編集 | フォームが**空になり**、打ち込んだ値は消え、行もどこにも無い。断りは 0 文 |
 * | 不動産の物件の編集 | 同じ |
 * | 士業の連絡先の編集 | 同じ |
 * | 士業の相談の状態 | 選んだ状態は保存されず、行は一覧から消える。断りは 0 文 |
 *
 * 「別のタブ」は `_resetCollectionSubscribersForTests()` で作る —— 画面の購読を外してから
 * 保管層の行を消すと、画面の写しはその削除を知らない (実物の別タブと同じ状態・パス 497)。
 */
import 'fake-indexeddb/auto';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { SERVICES } from '../../services';
import { getRecordStore } from '../../data/store';
import { _resetCollectionSubscribersForTests } from '../../data/useCollection';
import { resetRecordStore } from '../../__tests__/recordStoreHarness';
import { HOLDINGS_COLLECTION, PROPERTIES_COLLECTION, parseHoldingEntry, parsePropertyEntry } from '../../data/investments';
import {
  SHIGYO_CONSULTATIONS_COLLECTION,
  SHIGYO_CONTACTS_COLLECTION,
  parseShigyoConsultation,
  parseShigyoContact,
} from '../../data/shigyoDirectory';
import { MEMBERS_COLLECTION } from '../../data/members';
import { MANUAL_OVERRIDES_COLLECTION } from '../../data/manualData';
import { ManualDataSection } from '../../components/ManualDataSection';
import { settleUntil, settleUntilAsync, waitForElement, waitForText } from '../../__tests__/jsdomWait';

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

const text = (): string => (container.textContent ?? '').replace(/\s+/g, ' ');

beforeEach(async () => {
  await resetRecordStore();
  _resetCollectionSubscribersForTests();
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

/** 画面の購読を外す = **別のタブ**。以後の保管層への書き込みを、この画面の写しは知らない。 */
function becomeOtherTab(): void {
  _resetCollectionSubscribersForTests();
}

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

/** `name` を含む表の行 (`<tr>`)。 */
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

/** 断りの文 (直した後に出す物) の綴り。画面ごとの文はこの句を含む。 */
const VANISHED = '既に一覧にありません';

/**
 * **読み直してから書くまでの窓を、時刻ではなく門で作る。** 最初の `update` の直前に相手の行を
 * 保管層から消す (別のタブの削除が、判定の読み直しと書き込みのちょうど間に入った形)。
 * 2 回目からは素通し。判定を保管層の読み直しへ移したパス 497 の後も残る窓で、そこを閉じるのは
 * `edit` の答え (`false`) だけである。
 */
function vanishBeforeFirstUpdate(): void {
  const store = getRecordStore();
  const originalUpdate = store.update.bind(store);
  let fired = false;
  vi.spyOn(store, 'update').mockImplementation((async (id: string, patch: Record<string, unknown>) => {
    if (!fired) {
      fired = true;
      await store.remove(id);
    }
    return originalUpdate(id, patch);
  }) as typeof store.update);
}

describe('投資信託 — 編集中の銘柄が別のタブで消された', () => {
  it('★ 保存は断りを出し、打ち込んだ値を残す (黙ってフォームを空にしない)', async () => {
    const row = await getRecordStore().insert(
      HOLDINGS_COLLECTION,
      parseHoldingEntry({ code: 'VANISH1', name: '消される銘柄', units: '1000', navPerUnit: '10000' }),
    );
    await mountPage('mutual-funds');
    await waitForText(text, '消される銘柄');
    await click(buttonIn(rowWith('消される銘柄'), '編集'));
    await settleUntil(() => byPlaceholder('例: ニッセイ外国株式').value === '消される銘柄', '編集の欄に読み込まれる');
    await act(async () => {
      changeInput(byPlaceholder('例: ニッセイ外国株式'), '書き換えた銘柄');
    });

    becomeOtherTab();
    await getRecordStore().remove(row.id);

    await click(buttonIn(container, '保存 (自動反映)'));
    await waitForText(text, VANISHED);
    // 打ち込んだ値は残る (直す前は空になっていた)。
    expect(byPlaceholder('例: ニッセイ外国株式').value).toBe('書き換えた銘柄');
    // 消された行を黙って作り直さない —— 足すかどうかは利用者が決める。
    expect(await getRecordStore().list(HOLDINGS_COLLECTION)).toEqual([]);
    // 編集の相手が無いので、追加へ切り替わっている (押せば新しい銘柄として保存できる)。
    expect(text()).toContain('＋ 銘柄を追加');
  });

  it('対照: 相手が在れば今までどおり保存してフォームを空にする', async () => {
    await getRecordStore().insert(
      HOLDINGS_COLLECTION,
      parseHoldingEntry({ code: 'KEEP1', name: '残る銘柄', units: '1000', navPerUnit: '10000' }),
    );
    await mountPage('mutual-funds');
    await waitForText(text, '残る銘柄');
    await click(buttonIn(rowWith('残る銘柄'), '編集'));
    await settleUntil(() => byPlaceholder('例: ニッセイ外国株式').value === '残る銘柄', '編集の欄に読み込まれる');
    await act(async () => {
      changeInput(byPlaceholder('例: ニッセイ外国株式'), '直した銘柄');
    });
    await click(buttonIn(container, '保存 (自動反映)'));
    await settleUntilAsync(
      async () => (await getRecordStore().list<{ name: string }>(HOLDINGS_COLLECTION)).some((r) => r.data.name === '直した銘柄'),
      '保存が保管層に届く',
    );
    await settleUntil(() => byPlaceholder('例: ニッセイ外国株式').value === '', 'フォームが空に戻る');
    expect(text()).not.toContain(VANISHED);
  });
});

describe('不動産 — 編集中の物件が別のタブで消された', () => {
  it('★ 保存は断りを出し、打ち込んだ値を残す', async () => {
    const row = await getRecordStore().insert(
      PROPERTIES_COLLECTION,
      parsePropertyEntry({ name: '消される物件', type: '区分所有', monthlyRent: '100000', purchasePrice: '12000000', occupied: true }),
    );
    await mountPage('real-estate');
    await waitForText(text, '消される物件');
    await click(buttonIn(rowWith('消される物件'), '編集'));
    await settleUntil(() => byPlaceholder('例: 福岡市アパート').value === '消される物件', '編集の欄に読み込まれる');
    await act(async () => {
      changeInput(byPlaceholder('例: 福岡市アパート'), '書き換えた物件');
    });

    becomeOtherTab();
    await getRecordStore().remove(row.id);

    await click(buttonIn(container, '保存 (自動反映)'));
    await waitForText(text, VANISHED);
    expect(byPlaceholder('例: 福岡市アパート').value).toBe('書き換えた物件');
    expect(await getRecordStore().list(PROPERTIES_COLLECTION)).toEqual([]);
    expect(text()).toContain('＋ 物件を追加');
  });
});

describe('士業 — 編集中の連絡先・相談が別のタブで消された', () => {
  it('★ 連絡先の保存は断りを出し、打ち込んだ値を残す', async () => {
    const row = await getRecordStore().insert(
      SHIGYO_CONTACTS_COLLECTION,
      parseShigyoContact({ serviceId: 'tax-accountant', name: '消される先生', firm: '', phone: '', email: '' }),
    );
    await mountPage('tax-accountant');
    await waitForText(text, '消される先生');
    await click(buttonIn(rowWith('消される先生'), '編集'));
    await settleUntil(() => byPlaceholder('例: 山田 太郎').value === '消される先生', '編集の欄に読み込まれる');
    await act(async () => {
      changeInput(byPlaceholder('例: 山田 太郎'), '書き換えた先生');
    });

    becomeOtherTab();
    await getRecordStore().remove(row.id);

    await click(buttonIn(container, '保存'));
    await waitForText(text, VANISHED);
    expect(byPlaceholder('例: 山田 太郎').value).toBe('書き換えた先生');
    expect(await getRecordStore().list(SHIGYO_CONTACTS_COLLECTION)).toEqual([]);
  });

  it('★ 相談の状態を変えても、相手が消えていれば断りを出す (黙って一覧から消さない)', async () => {
    const row = await getRecordStore().insert(
      SHIGYO_CONSULTATIONS_COLLECTION,
      parseShigyoConsultation({ serviceId: 'tax-accountant', date: '2026-09-01', topic: '消される相談', status: '相談中' }),
    );
    await mountPage('tax-accountant');
    await waitForText(text, '消される相談');
    const select = await waitForElement<HTMLSelectElement>(
      () => rowWith('消される相談').querySelector<HTMLSelectElement>('select[aria-label="相談ステータスを変更"]'),
      '相談の状態の選択',
    );

    becomeOtherTab();
    await getRecordStore().remove(row.id);

    await act(async () => {
      select.value = '完了';
      select.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await waitForText(text, VANISHED);
    expect(await getRecordStore().list(SHIGYO_CONSULTATIONS_COLLECTION)).toEqual([]);
  });
});

describe('チーム — 役割を変える間に別のタブで消された (読み直しの後・書く前)', () => {
  const memberRows = (): HTMLTableRowElement[] => Array.from(container.querySelectorAll('tbody tr'));

  it('★ 断りを出し、消えたメンバーを作り直さない', async () => {
    await getRecordStore().insert(MEMBERS_COLLECTION, { name: 'A', email: 'a@example.com', role: 'owner' });
    const b = await getRecordStore().insert(MEMBERS_COLLECTION, { name: 'B', email: 'b@example.com', role: 'member' });
    await mountPage('team');
    await settleUntil(() => memberRows().length === 2, 'メンバーが 2 行');
    becomeOtherTab();
    vanishBeforeFirstUpdate();
    const rowB = memberRows().find((tr) => tr.textContent?.includes('b@example.com'))!;
    const select = rowB.querySelector<HTMLSelectElement>('select')!;
    await act(async () => {
      select.value = 'admin';
      select.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await waitForText(text, VANISHED);
    const left = await getRecordStore().list<{ email: string }>(MEMBERS_COLLECTION);
    expect(left.map((r) => r.data.email), '消えたメンバーを作り直している').toEqual(['a@example.com']);
    expect(left.some((r) => r.id === b.id)).toBe(false);
  });

  it('対照: 相手が在れば役割が変わり、断りは出ない', async () => {
    await getRecordStore().insert(MEMBERS_COLLECTION, { name: 'A', email: 'a@example.com', role: 'owner' });
    const b = await getRecordStore().insert(MEMBERS_COLLECTION, { name: 'B', email: 'b@example.com', role: 'member' });
    await mountPage('team');
    await settleUntil(() => memberRows().length === 2, 'メンバーが 2 行');
    const rowB = memberRows().find((tr) => tr.textContent?.includes('b@example.com'))!;
    const select = rowB.querySelector<HTMLSelectElement>('select')!;
    await act(async () => {
      select.value = 'admin';
      select.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await settleUntilAsync(
      async () => (await getRecordStore().get<{ role: string }>(b.id))?.data.role === 'admin',
      '役割が admin になる',
    );
    expect(text()).not.toContain(VANISHED);
  });
});

describe('手入力の置き換え — 置き直す間に別のタブで「自動に戻す」された', () => {
  /**
   * 置き換えは「この欄に、利用者が今打った値を置く」なので、相手の行が消えていても**今保存した値**を
   * 足し直すのが保存の意味である (消された古い値を作り直すのではない)。直す前は `edit` の `null` を
   * 捨て、保存した値は保管層のどこにも入らず、欄は自動の値のまま —— 押せていないのと見分けが付かなかった。
   */
  it('★ 今保存した値が保管層に入る (黙って消えない)', async () => {
    root = createRoot(container);
    await act(async () => {
      root!.render(createElement(ManualDataSection, { scope: 'kpi' }));
    });
    const head = await waitForElement(() => container.querySelector<HTMLButtonElement>('[data-manual-data] > button'), '見出し');
    await click(head);
    const firstRow = await waitForElement(() => container.querySelector<HTMLElement>('[data-override-row]'), '置き換えの行');
    const path = firstRow.getAttribute('data-override-row')!;
    await getRecordStore().insert(MANUAL_OVERRIDES_COLLECTION, { scope: 'kpi', path, value: 111 });
    await waitForElement(
      () => container.querySelector<HTMLElement>(`[data-override-row="${path}"] [data-overridden]`),
      '置き換えの札 (111 が届いた)',
    );
    becomeOtherTab();
    vanishBeforeFirstUpdate();
    const input = firstRow.querySelector<HTMLInputElement>('input')!;
    await act(async () => {
      changeInput(input, '222');
    });
    await click(buttonIn(firstRow, '保存'));
    await settleUntilAsync(async () => {
      const rows = await getRecordStore().list<{ path: string; value: number }>(MANUAL_OVERRIDES_COLLECTION);
      return rows.some((r) => r.data.value === 222);
    }, '222 が保存される (直す前は何も入らなかった)');
    const rows = await getRecordStore().list<{ path: string; value: number }>(MANUAL_OVERRIDES_COLLECTION);
    expect(rows.filter((r) => r.data.path === path).map((r) => r.data.value)).toEqual([222]);
  });
});
