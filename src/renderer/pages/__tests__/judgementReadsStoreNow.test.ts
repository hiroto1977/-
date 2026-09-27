/** @vitest-environment jsdom */
/**
 * **判定と書き込みは、購読の写しではなく保管層を読む。** (2026-09-27 · パス 497)
 *
 * パス 384 は CSV の取り込みと KPI 実績の追加について、判定の相手を購読の写し
 * (`useCollection` の `records`) から保管層の読み直し (`readCollectionNow`) へ移した。
 * 写しは ① 一覧が届く**前**は空 ② 読みが**失敗**しても空のまま ③ **別のタブ**が書いた物を
 * 知らない (通知は同じタブの中にしか届かない —— `collectionChange.ts` に `BroadcastChannel` は無い)。
 *
 * このファイルは、同じ形が残っていた 4 画面を実物で押す:
 *
 * | 画面 | 写しで決めていた物 | 写しが古いと起きること (直す前の実測) |
 * | --- | --- | --- |
 * | KPI の予算 | 同じ期・事業が既に在るか | 2 件目が入り、予算が**合算**される |
 * | チーム | 同じメールが既に在るか / 使った席数 / オーナーが何人か | 同じ人が 2 席 / 席数の上限を超える / **最後のオーナーを降格・削除できる** (オーナー 0 人) |
 * | 水耕栽培の品目 | 今の品目の一覧 (一覧はまるごと 1 記録) | 別のタブで足した品目が**消える** (lost update) |
 * | 手入力の置き換え | その欄の置き換えが既に在るか | 同じ欄に 2 件目が入り、**保存した直後の札が「手入力 111 円」** (古いほう) を出す —— 見出しは「置き換え 2 件」。「自動に戻す」も 1 件しか消さず戻らない |
 *
 * 「別のタブ」は `_resetCollectionSubscribersForTests()` で作る —— 画面の購読を外してから
 * 保管層へ書くと、画面の写しはその書き込みを知らない (実物の別タブと同じ状態)。
 * 画面自身の書き込みは `add` / `edit` / `remove` が自分で読み直すので、写しはそこで追いつく。
 */
import 'fake-indexeddb/auto';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { SERVICES } from '../../services';
import { getRecordStore } from '../../data/store';
import { _resetCollectionSubscribersForTests } from '../../data/useCollection';
import { resetRecordStore } from '../../__tests__/recordStoreHarness';
import { KPI_BUDGETS_COLLECTION } from '../../data/budgetVariance';
import { duplicateActualMessage, type KpiActual } from '../../data/kpiActuals';
import { MEMBERS_COLLECTION } from '../../data/members';
import { PLANS } from '../../../shared/plan';
import { HYDROPONIC_CROPS_COLLECTION, type HydroponicCropListRecord } from '../../data/hydroponicsSetup';
import { latestRecord } from '../../data/latestRecord';
import { DEFAULT_CROP_LIST } from '../../../shared/hydroponicCrops';
import { MANUAL_OVERRIDES_COLLECTION } from '../../data/manualData';
import { ManualDataSection } from '../../components/ManualDataSection';
import { settleUntil, settleUntilAsync, waitForElement, waitForText } from '../../__tests__/jsdomWait';

/**
 * **プランを 1 つの検査の中だけ差し替える。** この製品は `SELF_PRODUCT_ALL_ACCESS = true` で
 * 社内ライセンス (席数無制限) が常に有効なので、席数の上限の判定は既定のままでは**届かない**
 * (有償配布の側の枝)。`plan.tier` が `null` の間は実物の `usePlan` をそのまま返す。
 */
const plan = vi.hoisted(() => ({ tier: null as null | 'business' }));
vi.mock('../../plan/usePlan', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../plan/usePlan')>();
  return {
    ...actual,
    usePlan: () => {
      const real = actual.usePlan();
      return plan.tier === null ? real : { ...real, plan: plan.tier };
    },
  };
});

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
const releases: (() => void)[] = [];

const text = (): string => (container.textContent ?? '').replace(/\s+/g, ' ');

beforeEach(async () => {
  await resetRecordStore();
  _resetCollectionSubscribersForTests();
  localStorage.clear();
  container = document.createElement('div');
  document.body.appendChild(container);
});

afterEach(async () => {
  plan.tier = null;
  for (const r of releases.splice(0)) r();
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

/**
 * **一覧が届く前の窓を、時刻ではなく門で作る。** `collection` の最初の `list` だけを
 * 門の後ろで待たせ、2 回目からは素通しにする —— 画面の購読 (最初の読み) は届かず、
 * 判定の読み直し (2 回目) は届く。門は `afterEach` が必ず開ける。
 */
function holdFirstList(collection: string): void {
  const store = getRecordStore();
  const original = store.list.bind(store);
  let held = false;
  let open: () => void = () => {};
  const gate = new Promise<void>((r) => {
    open = r;
  });
  releases.push(() => open());
  vi.spyOn(store, 'list').mockImplementation((async (c: string) => {
    if (c === collection && !held) {
      held = true;
      await gate;
    }
    return original(c);
  }) as typeof store.list);
}

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

function buttonExact(label: string, scope: ParentNode = container): HTMLButtonElement {
  const b = Array.from(scope.querySelectorAll('button')).find((x) => x.textContent?.trim() === label);
  if (!b) throw new Error(`button "${label}" not found`);
  return b as HTMLButtonElement;
}

async function click(el: HTMLElement): Promise<void> {
  await act(async () => {
    el.click();
  });
}

async function count(collection: string): Promise<number> {
  return (await getRecordStore().list(collection)).length;
}

// --- KPI の予算 -----------------------------------------------------------

const BUDGET: KpiActual = { period: '2026-04', unit: '全社', revenue: 1_000_000, cogs: 0, advertising: 0, sga: 0, depreciation: 0 };
const BUDGET_FORM: Record<string, string> = {
  'YYYY-MM': '2026-04', '事業名': '全社', '売上高(予算)': '1000000',
  '売上原価': '0', '広告費': '0', '販管費': '0', '減価償却費': '0',
};

async function addBudgetFromForm(): Promise<void> {
  const add = await waitForElement(
    () => Array.from(container.querySelectorAll('button')).find((b) => b.textContent?.trim() === '予算を追加') ?? null,
    '「予算を追加」のボタン',
  );
  const panel = add.parentElement!;
  await act(async () => {
    for (const [ph, v] of Object.entries(BUDGET_FORM)) {
      const el = panel.querySelector<HTMLInputElement>(`input[placeholder="${ph}"]`);
      if (!el) throw new Error(`予算の欄 ${ph} が無い`);
      changeInput(el, v);
    }
  });
  await click(add);
}

describe('KPI の予算 — 同じ期・事業の 2 件目を、写しではなく保管層で断る', () => {
  const refusal = duplicateActualMessage('予算', BUDGET);

  it('★ 一覧が届く前に追加しても断られる (件数は 1 のまま)', async () => {
    await getRecordStore().insert(KPI_BUDGETS_COLLECTION, BUDGET);
    holdFirstList(KPI_BUDGETS_COLLECTION);
    await mountPage('kpi');
    await waitForText(text, '予算を入力すると、実績との差異 (BVA) が算出されます。');
    await addBudgetFromForm();
    await waitForText(text, refusal);
    expect(await count(KPI_BUDGETS_COLLECTION)).toBe(1);
  });

  it('★ 別のタブが入れた予算も断る (写しはそれを知らない)', async () => {
    await mountPage('kpi');
    await waitForText(text, '予算を入力すると、実績との差異 (BVA) が算出されます。');
    becomeOtherTab();
    await getRecordStore().insert(KPI_BUDGETS_COLLECTION, BUDGET);
    await addBudgetFromForm();
    await waitForText(text, refusal);
    expect(await count(KPI_BUDGETS_COLLECTION)).toBe(1);
  });

  it('対照: 保管層に無ければ入る (断りは出ない)', async () => {
    await mountPage('kpi');
    await waitForText(text, '予算を入力すると、実績との差異 (BVA) が算出されます。');
    await addBudgetFromForm();
    await settleUntilAsync(async () => (await count(KPI_BUDGETS_COLLECTION)) === 1, '予算が 1 件入る');
    expect(text()).not.toContain(refusal);
  });
});

// --- チーム ---------------------------------------------------------------

async function invite(name: string, email: string): Promise<void> {
  const name$ = await waitForElement(() => container.querySelector<HTMLInputElement>('input[placeholder="氏名"]'), '氏名の欄');
  const email$ = container.querySelector<HTMLInputElement>('input[placeholder="メールアドレス"]')!;
  await act(async () => {
    changeInput(name$, name);
    changeInput(email$, email);
  });
  await click(buttonExact('招待'));
}

const memberRows = (): HTMLTableRowElement[] => Array.from(container.querySelectorAll('tbody tr'));

describe('チーム — 同じメールと最後のオーナーを、写しではなく保管層で断る', () => {
  it('★ 一覧が届く前に同じメールで招待しても断られる', async () => {
    await getRecordStore().insert(MEMBERS_COLLECTION, { name: '太郎', email: 'taro@example.com', role: 'owner' });
    holdFirstList(MEMBERS_COLLECTION);
    await mountPage('team');
    await waitForText(text, 'まだメンバーがいません');
    await invite('太郎 (再)', 'taro@example.com');
    await waitForText(text, 'taro@example.com は「太郎」として既に登録されています');
    expect(await count(MEMBERS_COLLECTION)).toBe(1);
  });

  it('★ 一覧が届く前に招待しても、シートの上限を超えない (Business は 25 席)', async () => {
    // チームの招待が開くのは Business 以上 (Free / Pro は案内だけを出す)。
    plan.tier = 'business';
    const seats = PLANS.business.maxSeats;
    await getRecordStore().insertMany(
      MEMBERS_COLLECTION,
      Array.from({ length: seats }, (_, i) => ({ name: `M${i}`, email: `m${i}@example.com`, role: i === 0 ? 'owner' : 'member' })),
    );
    holdFirstList(MEMBERS_COLLECTION);
    await mountPage('team');
    await waitForText(text, 'まだメンバーがいません');
    await invite('花子', 'hanako@example.com');
    await waitForText(text, `シート上限 (${seats}) に達しています`);
    expect(await count(MEMBERS_COLLECTION)).toBe(seats);
  });

  it('★ 別のタブでオーナーが 1 人に減った後、画面の写しが 2 人と思っていても最後のオーナーは降格できない', async () => {
    const a = await getRecordStore().insert(MEMBERS_COLLECTION, { name: 'A', email: 'a@example.com', role: 'owner' });
    const b = await getRecordStore().insert(MEMBERS_COLLECTION, { name: 'B', email: 'b@example.com', role: 'owner' });
    await mountPage('team');
    await settleUntil(() => memberRows().length === 2, 'メンバーが 2 行');
    becomeOtherTab();
    await getRecordStore().update(b.id, { role: 'member' });
    const rowA = memberRows().find((tr) => tr.textContent?.includes('a@example.com'))!;
    const select = rowA.querySelector<HTMLSelectElement>('select')!;
    // 写しはまだ「オーナー 2 人」なので、画面は降格の選択肢を開けている。
    expect(select.querySelector<HTMLOptionElement>('option[value="member"]')!.disabled).toBe(false);
    await act(async () => {
      select.value = 'member';
      select.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await waitForText(text, '最後のオーナーは降格できません');
    const stored = await getRecordStore().get<{ role: string }>(a.id);
    expect(stored?.data.role).toBe('owner');
  });

  it('★ 別のタブでオーナーが 1 人に減った後、画面の写しが 2 人と思っていても最後のオーナーは消せない', async () => {
    const a = await getRecordStore().insert(MEMBERS_COLLECTION, { name: 'A', email: 'a@example.com', role: 'owner' });
    const b = await getRecordStore().insert(MEMBERS_COLLECTION, { name: 'B', email: 'b@example.com', role: 'owner' });
    await mountPage('team');
    await settleUntil(() => memberRows().length === 2, 'メンバーが 2 行');
    becomeOtherTab();
    await getRecordStore().remove(b.id);
    // 画面はまだ 2 行 (写しは B が居ると思っている)。
    expect(memberRows()).toHaveLength(2);
    const rowA = memberRows().find((tr) => tr.textContent?.includes('a@example.com'))!;
    await click(rowA.querySelector<HTMLButtonElement>('button[aria-label="削除"]')!);
    await waitForText(text, '最後のオーナーは削除できません。');
    const left = await getRecordStore().list(MEMBERS_COLLECTION);
    expect(left.map((r) => r.id)).toEqual([a.id]);
  });
});

// --- 水耕栽培の品目 ---------------------------------------------------------

const cropLabelInput = (): HTMLInputElement | null => container.querySelector<HTMLInputElement>('input[aria-label="品目名"]');

async function latestCropLabels(): Promise<string[]> {
  const rows = await getRecordStore().list<HydroponicCropListRecord>(HYDROPONIC_CROPS_COLLECTION);
  return latestRecord(rows)?.data.crops.map((c) => c.label) ?? [];
}

describe('水耕栽培の品目 — 別のタブで足した品目を、次の追加が消さない', () => {
  it('★ 別のタブが「ミズナ」を足した後にこの画面で「ホウレンソウ」を足しても、ミズナは残る', async () => {
    await mountPage('overview');
    await waitForElement(cropLabelInput, '品目名の欄');
    becomeOtherTab();
    // 別のタブの追加: 既定の 5 品目 + ミズナ を 1 記録として足す (画面の保存と同じ形)。
    await getRecordStore().insert(HYDROPONIC_CROPS_COLLECTION, {
      crops: [...DEFAULT_CROP_LIST, { ...DEFAULT_CROP_LIST[0]!, id: 'custom-1', label: 'ミズナ' }],
    });
    await act(async () => {
      changeInput(cropLabelInput()!, 'ホウレンソウ');
    });
    await click(buttonExact('この品目を足す'));
    await waitForText(() => container.querySelector('[role="status"]')?.textContent ?? '', 'ホウレンソウ');
    const labels = await latestCropLabels();
    expect(labels).toContain('ホウレンソウ');
    expect(labels, '別のタブで足した品目が消えている (lost update)').toContain('ミズナ');
  });
});

// --- 手入力の置き換え -------------------------------------------------------

describe('手入力の置き換え — 同じ欄に 2 件目を作らない', () => {
  it('★ 別のタブが置いた欄をこの画面で置き直しても 1 件のまま (「自動に戻す」で本当に戻る)', async () => {
    root = createRoot(container);
    await act(async () => {
      root!.render(createElement(ManualDataSection, { scope: 'kpi' }));
    });
    const head = await waitForElement(() => container.querySelector<HTMLButtonElement>('[data-manual-data] > button'), '見出し');
    await click(head);
    const firstRow = await waitForElement(() => container.querySelector<HTMLElement>('[data-override-row]'), '置き換えの行');
    const path = firstRow.getAttribute('data-override-row')!;
    becomeOtherTab();
    await getRecordStore().insert(MANUAL_OVERRIDES_COLLECTION, { scope: 'kpi', path, value: 111 });
    const input = firstRow.querySelector<HTMLInputElement>('input')!;
    await act(async () => {
      changeInput(input, '222');
    });
    await click(buttonExact('保存', firstRow));
    await settleUntilAsync(async () => {
      const rows = await getRecordStore().list<{ path: string; value: number }>(MANUAL_OVERRIDES_COLLECTION);
      return rows.some((r) => r.data.value === 222);
    }, '222 が保存される');
    const rows = await getRecordStore().list<{ path: string; value: number }>(MANUAL_OVERRIDES_COLLECTION);
    expect(rows.filter((r) => r.data.path === path), '同じ欄に置き換えが 2 件ある').toHaveLength(1);
    // 保存した値が**画面の札**にも出る (2 件あると適用も札も古いほうを勝たせ、「手入力 111」と出た)。
    const badge = await waitForElement(
      () => container.querySelector<HTMLElement>(`[data-override-row="${path}"] [data-overridden]`),
      '置き換えの札',
    );
    await settleUntil(() => (badge.textContent ?? '').includes('222'), '札が保存した値 (222) を出す');
  });

  it('★ 前から同じ欄に 2 件ある控えでも、「自動に戻す」1 回でその欄の置き換えが消える', async () => {
    root = createRoot(container);
    await act(async () => {
      root!.render(createElement(ManualDataSection, { scope: 'kpi' }));
    });
    const head = await waitForElement(() => container.querySelector<HTMLButtonElement>('[data-manual-data] > button'), '見出し');
    await click(head);
    const firstRow = await waitForElement(() => container.querySelector<HTMLElement>('[data-override-row]'), '置き換えの行');
    const path = firstRow.getAttribute('data-override-row')!;
    // 直す前の欠陥が残した形: 同じ欄に 2 件 (別のタブが置いた後に、この画面の写しが 2 件目を足した)。
    await getRecordStore().insert(MANUAL_OVERRIDES_COLLECTION, { scope: 'kpi', path, value: 111 });
    await getRecordStore().insert(MANUAL_OVERRIDES_COLLECTION, { scope: 'kpi', path, value: 222 });
    const clear = await waitForElement(
      () => Array.from(firstRow.querySelectorAll('button')).find((b) => b.textContent?.trim() === '自動に戻す') ?? null,
      '「自動に戻す」',
    );
    await click(clear);
    await settleUntilAsync(async () => {
      const rows = await getRecordStore().list<{ path: string }>(MANUAL_OVERRIDES_COLLECTION);
      return rows.every((r) => r.data.path !== path);
    }, 'その欄の置き換えが 1 件も残らない');
    await settleUntil(
      () => container.querySelector(`[data-override-row="${path}"] [data-overridden]`) === null,
      '札が消える (自動の値に戻った)',
    );
  });
});
