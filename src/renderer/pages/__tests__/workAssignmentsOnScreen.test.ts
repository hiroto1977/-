/** @vitest-environment jsdom */
/**
 * **業務の割当と、時間で見た負担を、実物のチーム管理の画面で描いて押す** (2026-10-29 · パス 556)。
 *
 * 守る物を画面の側で: ① 1 人 1 行で週の時間・法定労働時間に対する割合 (帯)・チーム内の比率が出る
 * ② 割当の記録が無い人は帯を引かず「割当の記録なし」③ 法定超え・偏りは `role="alert"` で名指し
 * ④ 画面から割当を足せる (空欄は 0 にせず断り、何も書かない) ⑤ 名簿から消えた人への割当は集計から外し、
 * その件数を言い、一覧の × で消せる ⑥ 選んだ人が別の画面で消されていたら書かずに断る (保管層の今の名簿で決める)。
 */
import 'fake-indexeddb/auto';
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { TeamPage } from '../TeamPage';
import { getRecordStore } from '../../data/store';
import { _resetCollectionSubscribersForTests } from '../../data/useCollection';
import { MEMBERS_COLLECTION } from '../../data/members';
import { WORK_ASSIGNMENTS_COLLECTION } from '../../../shared/workAssignment';
import { resetRecordStore } from '../../__tests__/recordStoreHarness';
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

const A = { name: '青木', email: 'a@example.com', role: 'owner' as const };
const B = { name: '坂本', email: 'b@example.com', role: 'member' as const };
const C = { name: '千葉', email: 'c@example.com', role: 'member' as const };

const text = (): string => (container.textContent ?? '').replace(/\s+/g, ' ');
const q = (sel: string): Element | null => container.querySelector(sel);

function setValue(el: HTMLInputElement | HTMLSelectElement, value: string): void {
  const proto = el instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
  if (!setter) throw new Error('value setter not found');
  setter.call(el, value);
  el.dispatchEvent(new Event(el instanceof HTMLSelectElement ? 'change' : 'input', { bubbles: true }));
}

function byLabel<T extends HTMLInputElement | HTMLSelectElement>(label: string): T {
  const el = container.querySelector<T>(`[aria-label="${label}"]`);
  if (!el) throw new Error(`aria-label="${label}" not found`);
  return el;
}

async function press(name: string): Promise<void> {
  const button = [...container.querySelectorAll('button')].find((b) => b.textContent === name);
  if (!button) throw new Error(`button "${name}" not found`);
  await act(async () => {
    button.click();
  });
}

async function seed(assignments: readonly Record<string, unknown>[], members = [A, B, C]): Promise<void> {
  const store = getRecordStore();
  for (const m of members) await store.insert(MEMBERS_COLLECTION, m);
  for (const a of assignments) await store.insert(WORK_ASSIGNMENTS_COLLECTION, a);
}

async function storedAssignments(): Promise<readonly Record<string, unknown>[]> {
  return (await getRecordStore().list<Record<string, unknown>>(WORK_ASSIGNMENTS_COLLECTION)).map((r) => r.data);
}

/** 割当の表が描かれ、名簿の人数ぶんの行と、割当の一覧の件数が揃うまで待つ。 */
async function mount(rows: number, items: number): Promise<void> {
  root = createRoot(container);
  await act(async () => {
    root!.render(createElement(TeamPage));
  });
  await waitForElement(() => q('[data-assignment-table]'), '割当の表');
  await settleUntil(() => container.querySelectorAll('[data-assignment-row]').length === rows, `割当の表が ${rows} 行になる`);
  await settleUntil(() => container.querySelectorAll('[data-assignment-item]').length === items, `割当の一覧が ${items} 件になる`);
}

const utilization = (member: string): string | null => q(`[data-assignment-utilization="${member}"]`)?.textContent ?? null;
const shareOf = (member: string): string | null => q(`[data-assignment-share="${member}"]`)?.textContent ?? null;

beforeEach(async () => {
  await resetRecordStore();
  _resetCollectionSubscribersForTests();
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
  container.remove();
});

describe('チーム管理 — 業務の割当と、時間で見た負担', () => {
  it('★ 1 人 1 行で週の時間・法定労働時間に対する割合・チーム内の比率が出て、記録の無い人は帯を引かない', async () => {
    await seed([
      { member: A.email, title: '月次決算', hoursPerWeek: 20 },
      { member: A.email, title: '請求書の発行', hoursPerWeek: 10 },
      { member: B.email, title: '問い合わせ対応', hoursPerWeek: 10 },
    ]);
    await mount(3, 3);
    const order = [...container.querySelectorAll('[data-assignment-row]')].map((r) => r.getAttribute('data-assignment-row'));
    expect(order).toEqual([A.email, B.email, C.email]);
    expect(utilization(A.email)).toBe('75%');
    expect(shareOf(A.email)).toBe('75%');
    expect(shareOf(B.email)).toBe('25%');
    expect(q(`[data-assignment-row="${A.email}"]`)?.textContent).toContain('30 時間');
    // 記録の無い人: 帯は無く、割合は名乗らず「割当の記録なし」。
    expect(q(`[data-assignment-bar="${C.email}"]`)).toBeNull();
    expect(q(`[data-assignment-row="${C.email}"]`)?.getAttribute('data-assignment-level')).toBe('none');
    expect(q(`[data-assignment-row="${C.email}"]`)?.textContent).toContain('割当の記録なし');
    expect(utilization(C.email)).toBe('—');
    expect(q(`[data-assignment-bar="${A.email}"]`)).not.toBeNull();
    // 偏り (75% ≧ 均等 50% × 1.5) は名指しする。
    expect(q('[data-assignment-imbalance]')?.getAttribute('role')).toBe('alert');
    expect(q('[data-assignment-imbalance]')?.textContent).toContain('青木 さんに割当の時間が偏っています');
    expect(q('[data-assignment-over]')).toBeNull();
  });

  it('★ 法定労働時間を超える人は「法定超え」で、36 協定を名指しする alert が出る', async () => {
    await seed([{ member: B.email, title: '受注の処理', hoursPerWeek: 46 }]);
    await mount(3, 1);
    expect(q(`[data-assignment-row="${B.email}"]`)?.getAttribute('data-assignment-level')).toBe('over');
    expect(utilization(B.email)).toBe('115%');
    const over = q('[data-assignment-over]');
    expect(over?.getAttribute('role')).toBe('alert');
    expect(over?.textContent).toContain('坂本 さん（週 46 時間）は、この割当どおりに働くと週の法定労働時間（40 時間）を超えます。');
    expect(over?.textContent).toContain('36 協定（労働基準法36条）');
    // 帯は枠の幅までで止まる (100% を超えて枠の外へ出ない)。
    expect((q(`[data-assignment-bar="${B.email}"]`) as HTMLElement | null)?.style.width).toBe('100%');
  });

  it('★ 画面から割当を足すと保管層に入り、表の時間が増える', async () => {
    await seed([{ member: B.email, title: '問い合わせ対応', hoursPerWeek: 10 }]);
    await mount(3, 1);
    await act(async () => {
      setValue(byLabel<HTMLSelectElement>('割り当てるメンバー'), B.email);
      setValue(byLabel<HTMLInputElement>('業務名'), '在庫の棚卸');
      setValue(byLabel<HTMLInputElement>('週の時間'), '5');
    });
    await press('割当を追加');
    await settleUntil(() => container.querySelectorAll('[data-assignment-item]').length === 2, '一覧が 2 件になる');
    await waitForText(text, '15 時間');
    expect(await storedAssignments()).toContainEqual({ member: B.email, title: '在庫の棚卸', hoursPerWeek: 5 });
    // 入力欄は空に戻る。
    expect(byLabel<HTMLInputElement>('業務名').value).toBe('');
  });

  it('★ 週の時間の空欄は 0 にせず断り、何も書かない', async () => {
    await seed([]);
    await mount(3, 0);
    await act(async () => {
      setValue(byLabel<HTMLSelectElement>('割り当てるメンバー'), A.email);
      setValue(byLabel<HTMLInputElement>('業務名'), '月次決算');
    });
    await press('割当を追加');
    await waitForElement(() => q('[data-assignment-error]'), '断りの文');
    expect(q('[data-assignment-error]')?.textContent).toBe('週の時間が未入力です');
    expect(await storedAssignments()).toEqual([]);
  });

  it('★ 名簿から消えた人への割当は集計から外して件数を言い、一覧の × で消せる', async () => {
    await seed([
      { member: A.email, title: '月次決算', hoursPerWeek: 10 },
      { member: 'gone@example.com', title: '退職した人の業務', hoursPerWeek: 6 },
    ]);
    await mount(3, 2);
    expect(shareOf(A.email)).toBe('100%');
    expect(q('[data-assignment-excluded]')?.textContent).toBe(
      '名簿に居ないメンバーへの割当 1 件（週 6 時間）は集計から外しています。下の割当の一覧の × で消せます。',
    );
    const orphanRow = [...container.querySelectorAll('[data-assignment-item]')].find((r) => r.textContent?.includes('退職した人の業務'));
    expect(orphanRow?.textContent).toContain('（名簿に居ないメンバー）');
    await act(async () => {
      orphanRow!.querySelector('button')!.click();
    });
    await settleUntil(() => container.querySelectorAll('[data-assignment-item]').length === 1, '一覧が 1 件になる');
    await settleUntil(() => q('[data-assignment-excluded]') === null, '外した物の断りが消える');
    expect(await storedAssignments()).toEqual([{ member: A.email, title: '月次決算', hoursPerWeek: 10 }]);
  });

  it('★ 選んだ人が別の画面で消されていたら、保管層の今の名簿で断り、書かない', async () => {
    await seed([]);
    await mount(3, 0);
    await act(async () => {
      setValue(byLabel<HTMLSelectElement>('割り当てるメンバー'), C.email);
      setValue(byLabel<HTMLInputElement>('業務名'), '月次決算');
      setValue(byLabel<HTMLInputElement>('週の時間'), '8');
    });
    // 別の画面 (別のタブ) で C を消す —— 選択肢の写しはまだ C を持っていてよい。
    const store = getRecordStore();
    const c = (await store.list<{ email: string }>(MEMBERS_COLLECTION)).find((r) => r.data.email === C.email)!;
    await store.remove(c.id);
    await press('割当を追加');
    await waitForElement(() => q('[data-assignment-error]'), '断りの文');
    expect(q('[data-assignment-error]')?.textContent).toContain('選んだメンバーは名簿に居ません');
    await settleUntilAsync(async () => (await storedAssignments()).length === 0, '何も書いていない');
  });

  it('メンバーが居なければ、表は招待の節を名指しし、追加のボタンは押せない', async () => {
    await seed([], []);
    root = createRoot(container);
    await act(async () => {
      root!.render(createElement(TeamPage));
    });
    await waitForElement(() => q('[data-assignment-empty]'), '空の表の文');
    expect(q('[data-assignment-empty]')?.textContent).toContain('「メンバー招待」');
    const button = [...container.querySelectorAll('button')].find((b) => b.textContent === '割当を追加');
    expect(button?.disabled).toBe(true);
  });
});
