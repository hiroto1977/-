/** @vitest-environment jsdom */
/**
 * **チームの画面 —— 招待の欄に名前が在り、招待したことを言い、消したメンバーを戻せる。** (2026-11-20)
 *
 * 売上集計 (`salesFormOnScreen.test.ts`) と KPI / BEP (`kpiFormOnScreen.test.ts`) と同じ直し方を、
 * メンバーの招待と一覧へ当てた。直す前:
 *   - 欄の名前は欄の中の薄い字だけ (打つと消える)
 *   - 招待しても知らせは出ない
 *   - 「×」は押した瞬間に消え、戻す手は無い (氏名・メール・役割を打ち直す)
 *
 * 直した後:
 *   - 欄ごとに名前 (欄の上)。メールの欄はメール用のキーボードを出す
 *   - 招待すると、誰を入れたかを 1 行で言う
 *   - 「×」の直後は「消しました: …」と「元に戻す」(直前の 1 人だけ)。戻すときも招待と同じ判定を通す
 *     (同じメールアドレスの人が入っていたら戻さずに言う・シートが埋まっていたら戻さずに言う)
 */
import 'fake-indexeddb/auto';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { TeamPage } from '../TeamPage';
import { getRecordStore } from '../../data/store';
import { _resetCollectionSubscribersForTests } from '../../data/useCollection';
import { MEMBERS_COLLECTION, type Member } from '../../data/members';
import { resetRecordStore } from '../../__tests__/recordStoreHarness';
import { settleUntil, settleUntilAsync, waitForElement, waitForText } from '../../__tests__/jsdomWait';

/**
 * **プランを 1 つの検査の中だけ差し替える** (`judgementReadsStoreNow.test.ts` と同じ形)。
 * この製品は社内ライセンス (席数無制限) が常に有効なので、席数の上限の判定は既定のままでは届かない。
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

beforeEach(async () => {
  plan.tier = null;
  await resetRecordStore();
  _resetCollectionSubscribersForTests();
  container = document.createElement('div');
  document.body.appendChild(container);
});

afterEach(async () => {
  await act(async () => {
    root?.unmount();
  });
  root = null;
  container.remove();
  vi.restoreAllMocks();
  plan.tier = null;
});

const text = (): string => (container.textContent ?? '').replace(/\s+/g, ' ');

const stored = async (): Promise<Member[]> =>
  (await getRecordStore().list<Member>(MEMBERS_COLLECTION)).map((r) => r.data);

const OWNER: Member = { name: '一人目', email: 'a@example.com', role: 'owner' };
const SECOND: Member = { name: '二人目', email: 'b@example.com', role: 'admin' };

/** 画面を描く。`rows` を渡したら、一覧がその行数になるまで待つ (置いた記録が届いた印)。 */
async function mount(rows?: number): Promise<void> {
  root = createRoot(container);
  await act(async () => {
    root!.render(createElement(TeamPage));
  });
  await waitForElement(() => container.querySelector('[data-member-form]'), '招待の入力欄');
  if (rows !== undefined) await settleUntil(() => rowCount() === rows, `一覧が ${rows} 行になる`);
}

const form = (): Element => {
  const el = container.querySelector('[data-member-form]');
  if (!el) throw new Error('招待の入力欄が無い');
  return el;
};

const labels = (): string[] =>
  Array.from(form().querySelectorAll('label')).map((l) => (l.querySelector('span')?.textContent ?? '').trim());

function field(label: string): HTMLInputElement {
  const hit = Array.from(form().querySelectorAll('label')).find(
    (l) => (l.querySelector('span')?.textContent ?? '').trim() === label,
  );
  const control = hit?.querySelector('input');
  if (!control) throw new Error(`名前「${label}」の欄が無い (在るのは ${labels().join(' / ')})`);
  return control;
}

function typeInto(el: HTMLInputElement, value: string): void {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(el, value);
  el.dispatchEvent(new Event('input', { bubbles: true }));
}

function fill(name: string, email: string): void {
  typeInto(field('氏名'), name);
  typeInto(field('メールアドレス'), email);
}

async function pressInvite(): Promise<void> {
  const b = Array.from(container.querySelectorAll('button')).find((x) => (x.textContent ?? '').trim() === '招待');
  if (!b) throw new Error('「招待」が無い');
  await act(async () => {
    b.click();
  });
}

const rows = (): HTMLTableRowElement[] =>
  Array.from(container.querySelectorAll<HTMLTableRowElement>('[data-member-list] tbody tr'));
const rowCount = (): number => rows().length;

/** 名前を含む行の「×」を押す。 */
async function pressRemove(name: string): Promise<void> {
  const row = rows().find((tr) => (tr.textContent ?? '').includes(name));
  const b = row?.querySelector<HTMLButtonElement>('button[aria-label="削除"]');
  if (!b) throw new Error(`「${name}」の行の × が無い`);
  await act(async () => {
    b.click();
  });
}

const undoBar = (): HTMLElement | null => container.querySelector<HTMLElement>('[data-undo-bar="members"]');
const barText = (): string => (undoBar()?.querySelector('span')?.textContent ?? '').trim();
async function pressUndo(): Promise<void> {
  const b = undoBar()?.querySelector('button');
  if (!b) throw new Error('「元に戻す」が無い');
  await act(async () => {
    b.click();
  });
}
const notice = (): string => (container.querySelector('[data-member-notice]')?.textContent ?? '').trim();

describe('チーム — 入力欄の名前と形', () => {
  it('★ 招待の欄は 3 つとも名前を持つ (欄の上に出る)', async () => {
    await mount();
    expect(labels()).toEqual(['氏名', 'メールアドレス', '役割']);
  });

  it('★ メールの欄はメール用のキーボードを出し、役割は選ぶ欄', async () => {
    await mount();
    expect(field('メールアドレス').type).toBe('email');
    expect(field('氏名').type).toBe('text');
    const role = form().querySelector('select');
    expect(role?.getAttribute('aria-label')).toBe('追加するメンバーの役割');
  });
});

describe('チーム — 招待した知らせ', () => {
  it('★ 招待すると、誰を入れたかを 1 行で言い、欄は空に戻る', async () => {
    await mount();
    fill('山田', 'yamada@example.com');
    await pressInvite();
    await settleUntil(() => notice() !== '', '招待した知らせ');
    expect(notice()).toBe('招待しました: 山田 (yamada@example.com) · メンバー');
    expect(field('氏名').value).toBe('');
    expect(field('メールアドレス').value).toBe('');
    expect(await stored()).toEqual([{ name: '山田', email: 'yamada@example.com', role: 'member' }]);
  });

  it('★ 断られたとき (メールの形が違う) は「招待しました」と言わない', async () => {
    await mount();
    fill('山田', 'not-an-email');
    await pressInvite();
    await waitForText(text, 'メールアドレスの形式が正しくありません');
    expect(notice()).toBe('');
    expect(await stored()).toEqual([]);
  });

  it('★ 断られたとき (同じメールアドレスが既に在る) は「招待しました」と言わない', async () => {
    await getRecordStore().insert(MEMBERS_COLLECTION, OWNER);
    await mount(1);
    fill('別名', 'A@Example.com');
    await pressInvite();
    await waitForText(text, '既に登録されています');
    expect(notice()).toBe('');
    expect(await stored()).toHaveLength(1);
  });

  it('★ 次の操作で、前の知らせは消える (古い「招待しました」を残さない)', async () => {
    await mount();
    fill('山田', 'yamada@example.com');
    await pressInvite();
    await settleUntil(() => notice() !== '', '招待した知らせ');
    fill('鈴木', 'bad');
    await pressInvite();
    await waitForText(text, 'メールアドレスの形式が正しくありません');
    expect(notice()).toBe('');
  });
});

describe('チーム — 消したメンバーを元に戻す', () => {
  async function seedTwo(): Promise<void> {
    await getRecordStore().insert(MEMBERS_COLLECTION, OWNER);
    await getRecordStore().insert(MEMBERS_COLLECTION, SECOND);
    await mount(2);
  }

  it('★ 「×」の直後に「消しました」と「元に戻す」が出て、押すと同じ中身 (役割も) で戻る', async () => {
    await seedTwo();
    await pressRemove('二人目');
    await waitForElement(undoBar, '「元に戻す」');
    expect(barText()).toBe('消しました: 二人目 (b@example.com) · 管理者');
    expect(await stored()).toEqual([OWNER]);
    await pressUndo();
    await settleUntil(() => notice() !== '', '戻した知らせ');
    expect(notice()).toBe('元に戻しました: 二人目 (b@example.com) · 管理者');
    expect(undoBar()).toBeNull();
    const back = await stored();
    expect(back).toHaveLength(2);
    expect(back).toContainEqual(SECOND);
    expect(back).toContainEqual(OWNER);
  });

  it('★ 消した後に同じメールアドレスの人が入っていたら、戻さずに言う (戻すと 2 度数えられる)', async () => {
    await seedTwo();
    await pressRemove('二人目');
    await waitForElement(undoBar, '「元に戻す」');
    // 別の画面 (別のタブ) が同じメールアドレスの人を入れた。
    await getRecordStore().insert(MEMBERS_COLLECTION, { name: '後から', email: 'B@example.com', role: 'member' });
    await pressUndo();
    await waitForText(text, '既に登録されています');
    expect(notice()).toBe('');
    expect(undoBar()).toBeNull();
    const now = await stored();
    expect(now).toHaveLength(2);
    expect(now.filter((m) => m.email.toLowerCase() === 'b@example.com')).toHaveLength(1);
  });

  it('★ 「元に戻す」を続けて 2 度押しても、戻るのは 1 人', async () => {
    await seedTwo();
    await pressRemove('二人目');
    await waitForElement(undoBar, '「元に戻す」');
    const b = undoBar()!.querySelector('button')!;
    await act(async () => {
      b.click();
      b.click();
    });
    await settleUntil(() => notice() !== '', '戻した知らせ');
    await settleUntilAsync(async () => (await stored()).length === 2, '2 人に戻る');
    expect(await stored()).toHaveLength(2);
  });

  it('★ 次に招待したら「元に戻す」は消える (戻せるのは直前の 1 人だけ)', async () => {
    await seedTwo();
    await pressRemove('二人目');
    await waitForElement(undoBar, '「元に戻す」');
    fill('山田', 'yamada@example.com');
    await pressInvite();
    await settleUntil(() => notice() !== '', '招待した知らせ');
    expect(undoBar()).toBeNull();
  });

  it('★ 入力が断られただけでは「元に戻す」は消えない', async () => {
    await seedTwo();
    await pressRemove('二人目');
    await waitForElement(undoBar, '「元に戻す」');
    fill('山田', 'bad');
    await pressInvite();
    await waitForText(text, 'メールアドレスの形式が正しくありません');
    expect(undoBar()).not.toBeNull();
  });

  it('★ 消せなかったとき (保存先が断った) は「元に戻す」を出さない', async () => {
    await seedTwo();
    const quota = new DOMException('quota', 'QuotaExceededError');
    const spy = vi.spyOn(getRecordStore(), 'remove').mockRejectedValue(quota);
    await pressRemove('二人目');
    await settleUntil(() => spy.mock.calls.length >= 1, '削除が保存先まで届く');
    await act(async () => {
      await Promise.resolve();
    });
    expect(undoBar()).toBeNull();
    expect(await stored()).toHaveLength(2);
  });

  it('★ 一覧が読めないときは、戻さずに言い、「元に戻す」は残る (読めたら押し直せる)', async () => {
    await seedTwo();
    await pressRemove('二人目');
    await waitForElement(undoBar, '「元に戻す」');
    vi.spyOn(getRecordStore(), 'list').mockRejectedValueOnce(new Error('unreadable'));
    await pressUndo();
    await waitForText(text, 'メンバーの一覧');
    expect(notice()).toBe('');
    expect(undoBar()).not.toBeNull();
    expect(await stored()).toEqual([OWNER]);
    await pressUndo();
    await settleUntil(() => notice() !== '', '戻した知らせ');
    expect(await stored()).toHaveLength(2);
  });

  it('★ シートが埋まっていたら、戻さずに言い、「元に戻す」は残る (有償配布の枝)', async () => {
    plan.tier = 'business';
    await getRecordStore().insert(MEMBERS_COLLECTION, OWNER);
    for (let i = 0; i < 24; i += 1) {
      await getRecordStore().insert(MEMBERS_COLLECTION, { name: `人${i}`, email: `m${i}@example.com`, role: 'member' });
    }
    await mount(25);
    await pressRemove('人0');
    await waitForElement(undoBar, '「元に戻す」');
    // 別の画面が空いた 1 席を埋めた。
    await getRecordStore().insert(MEMBERS_COLLECTION, { name: '後から', email: 'late@example.com', role: 'member' });
    await pressUndo();
    await waitForText(text, 'シート上限 (25) に達しています');
    expect(notice()).toBe('');
    expect(undoBar()).not.toBeNull();
    expect(await stored()).toHaveLength(25);
  });

  it('★ 極端に長い氏名の人を消しても、知らせは天井に収まる。戻る中身は切らない', async () => {
    const long = 'x'.repeat(200_000);
    await getRecordStore().insert(MEMBERS_COLLECTION, OWNER);
    await getRecordStore().insert(MEMBERS_COLLECTION, { name: long, email: 'long@example.com', role: 'member' });
    await mount(2);
    await pressRemove('long@example.com');
    await waitForElement(undoBar, '「元に戻す」');
    expect(barText().length).toBeLessThan(500);
    expect(barText()).toContain('…');
    await pressUndo();
    await settleUntil(() => notice() !== '', '戻した知らせ');
    expect(notice().length).toBeLessThan(500);
    const back = await stored();
    expect(back.find((m) => m.email === 'long@example.com')?.name).toBe(long);
  });

  it('★ 氏名・メール・役割が読めない行を消したときは、読めないことをそのまま言い、戻せる (投げない)', async () => {
    const broken = { name: 42, email: { a: 1 }, role: 'x' } as unknown as Member;
    await getRecordStore().insert(MEMBERS_COLLECTION, OWNER);
    await getRecordStore().insert(MEMBERS_COLLECTION, broken);
    await mount(2);
    const row = rows().find((tr) => !(tr.textContent ?? '').includes('一人目'));
    const b = row?.querySelector<HTMLButtonElement>('button[aria-label="削除"]');
    if (!b) throw new Error('読めない行の × が無い');
    await act(async () => {
      b.click();
    });
    await waitForElement(undoBar, '「元に戻す」');
    expect(barText()).toBe('消しました: 氏名なし (メールなし) · 役割不明');
    await pressUndo();
    await settleUntil(() => notice() !== '', '戻した知らせ');
    expect(await stored()).toHaveLength(2);
  });

  it('★ 一覧にメールが読めない行が在っても、別の人を戻せる (突き合わせで投げない)', async () => {
    const broken = { name: '壊れ', email: 42, role: 'member' } as unknown as Member;
    await getRecordStore().insert(MEMBERS_COLLECTION, OWNER);
    await getRecordStore().insert(MEMBERS_COLLECTION, broken);
    await getRecordStore().insert(MEMBERS_COLLECTION, SECOND);
    await mount(3);
    await pressRemove('二人目');
    await waitForElement(undoBar, '「元に戻す」');
    await pressUndo();
    await settleUntil(() => notice() !== '', '戻した知らせ');
    expect(notice()).toBe('元に戻しました: 二人目 (b@example.com) · 管理者');
    expect(await stored()).toHaveLength(3);
  });
});
