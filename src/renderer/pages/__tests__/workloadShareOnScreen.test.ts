/** @vitest-environment jsdom */
/**
 * **ひとりひとりの負担を、実物の 2 画面で描いて読む** (2026-10-29 · パス 555)。
 *
 * 利用者の依頼「従業員ひとりひとりの仕事の負担率等も見てわかるようにして」。
 * 守る物を画面の側で: ① チーム管理の画面に 1 人 1 行 (名前・直近・平均・負担率の帯) が出る
 * ② 同意していない人は名前が行に出ず、人数だけ ③ 本音 (メモ) は 1 字も出ない
 * ④ 偏りは `role="alert"` で名指し ⑤ 記録の無い人は帯を引かず「まだチェックインがありません」
 * ⑥ 専属カウンセラーの画面と同じ数が出る (判断は 1 つ) ⑦ 誰も居なければ逃げ口を名指しする。
 */
import 'fake-indexeddb/auto';
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { TeamPage } from '../TeamPage';
import { MentorPage } from '../MentorPage';
import { getRecordStore } from '../../data/store';
import { _resetCollectionSubscribersForTests } from '../../data/useCollection';
import { MEMBERS_COLLECTION } from '../../data/members';
import { addCheckIn, emptyMentorSession, MENTOR_COLLECTION, MENTOR_QUESTIONS, type MentorSession } from '../../../shared/mentor';
import { localIsoDate } from '../../../shared/localDate';
import { resetRecordStore } from '../../__tests__/recordStoreHarness';
import { settleUntil, waitForElement } from '../../__tests__/jsdomWait';

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
const TODAY = localIsoDate();

const text = (): string => (container.textContent ?? '').replace(/\s+/g, ' ');

function session(member: string, loads: readonly number[], share: boolean): MentorSession {
  const answers = Object.fromEntries(MENTOR_QUESTIONS.map((q) => [q.key, `${q.key} の答え`]));
  let s: MentorSession = { ...emptyMentorSession(member), answers, shareWithTeam: share };
  const [y, m, d] = TODAY.split('-').map(Number) as [number, number, number];
  loads.forEach((w, i) => {
    const on = new Date(Date.UTC(y, m - 1, d - (loads.length - 1 - i))).toISOString().slice(0, 10);
    s = addCheckIn(s, { on, mood: 3, workload: w, note: `本音のメモ ${member} ${w}` });
  });
  return s;
}

async function seed(sessions: readonly MentorSession[]): Promise<void> {
  const store = getRecordStore();
  await store.insert(MEMBERS_COLLECTION, A);
  await store.insert(MEMBERS_COLLECTION, B);
  for (const s of sessions) await store.insert(MENTOR_COLLECTION, s);
}

/** 負担の表 (または空の文) が描かれるまで待つ。表の節はどちらの画面でも `[data-workload-table]`。 */
async function mount(page: typeof TeamPage | typeof MentorPage, rows: number): Promise<void> {
  root = createRoot(container);
  await act(async () => {
    root!.render(createElement(page));
  });
  await waitForElement(() => container.querySelector('[data-workload-table]'), '負担の表');
  await settleUntil(() => container.querySelectorAll('[data-workload-row]').length === rows, `負担の行が ${rows} 行になる`);
}

const share = (member: string): string | null => container.querySelector(`[data-workload-share="${member}"]`)?.textContent ?? null;

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
  document.body.removeChild(container);
});

describe('ひとりひとりの負担 — チーム管理の画面', () => {
  it('★ 同意した人は 1 人 1 行で、直近・平均・負担率の帯が出る。同意していない人は名前が行に出ず人数だけ', async () => {
    await seed([session(A.email, [5, 4], true), session(B.email, [1], false)]);
    await mount(TeamPage, 1);
    const row = container.querySelector('[data-workload-row="a@example.com"]')!;
    expect(row.getAttribute('data-workload-level')).toBe('high');
    expect(row.textContent).toContain('青木');
    expect(row.textContent).toContain('4 / 5'); // 直近
    expect(row.textContent).toContain('4.5（2 回）'); // 平均
    expect(share('a@example.com')).toBe('100%');
    const bar = container.querySelector<HTMLElement>('[data-workload-bar="a@example.com"]')!;
    expect(bar.style.width).toBe('100%');
    // 同意していない坂本は行にならない。名前はメンバー一覧には在るが、負担の表の中には無い。
    expect(container.querySelector('[data-workload-row="b@example.com"]')).toBeNull();
    expect(container.querySelector('[data-workload-table]')!.textContent).not.toContain('坂本');
    expect(container.querySelector('[data-workload-without-consent]')!.textContent).toContain('1 人');
    // 針が的に当たる標本: メンバー一覧 (別の節) には坂本が居る。
    expect(text()).toContain('坂本');
  });

  it('★ 本音のメモは画面の 1 字にも出ない (同意していても)', async () => {
    await seed([session(A.email, [5], true), session(B.email, [2], true)]);
    await mount(TeamPage, 2);
    expect(text()).not.toContain('本音のメモ');
    // 標本: 保管層にはメモが在る。
    const stored = await getRecordStore().list<MentorSession>(MENTOR_COLLECTION);
    expect(JSON.stringify(stored)).toContain('本音のメモ');
  });

  it('★ 偏りは role="alert" で、負っている人だけを名指しする', async () => {
    await seed([session(A.email, [5], true), session(B.email, [1], true)]);
    await mount(TeamPage, 2);
    const alert = container.querySelector('[data-workload-imbalance]')!;
    expect(alert.getAttribute('role')).toBe('alert');
    expect(alert.textContent).toContain('青木 さんに負担が偏っています');
    expect(alert.textContent).toContain('均等なら 50% のところ 83.3%');
    expect(alert.textContent).not.toContain('坂本');
    expect(share('a@example.com')).toBe('83.3%');
    expect(share('b@example.com')).toBe('16.7%');
    // 均等との差。
    expect(container.querySelector('[data-workload-row="a@example.com"]')!.textContent).toContain('+33.3 pt');
    expect(container.querySelector('[data-workload-row="b@example.com"]')!.textContent).toContain('-33.3 pt');
  });

  it('★ 記録の無い人 (同意はした) は帯を引かず「まだチェックインがありません」と言い、分母に入らない', async () => {
    await seed([session(A.email, [3], true), session(B.email, [], true)]);
    await mount(TeamPage, 2);
    const b = container.querySelector('[data-workload-row="b@example.com"]')!;
    expect(b.getAttribute('data-workload-level')).toBe('unknown');
    expect(b.textContent).toContain('まだチェックインがありません');
    expect(b.textContent).toContain('記録なし');
    expect(container.querySelector('[data-workload-bar="b@example.com"]')).toBeNull();
    expect(share('b@example.com')).toBe('—');
    expect(share('a@example.com')).toBe('100%');
    expect(container.querySelector('[data-workload-imbalance]')).toBeNull();
  });

  it('★ 誰の記録も無ければ、逃げ口 (専属カウンセラーの画面) を名指しする', async () => {
    await seed([]);
    await mount(TeamPage, 0);
    const empty = container.querySelector('[data-workload-empty]')!;
    expect(empty.textContent).toContain('「専属カウンセラー」の画面で本人が週 1 のチェックイン');
    expect(container.querySelector('[data-workload-without-consent]')!.textContent).toContain('2 人');
  });
});

describe('ひとりひとりの負担 — 専属カウンセラーの画面も同じ数を出す', () => {
  it('★ 2 画面の負担率は同じ (判断は workloadDistribution 1 つ)', async () => {
    await seed([session(A.email, [5, 3], true), session(B.email, [2, 2, 2], true)]);
    await mount(TeamPage, 2);
    const team = { a: share('a@example.com'), b: share('b@example.com') };
    await act(async () => {
      root!.unmount();
    });
    root = null;
    _resetCollectionSubscribersForTests();
    await mount(MentorPage, 2);
    expect({ a: share('a@example.com'), b: share('b@example.com') }).toEqual(team);
    expect(team).toEqual({ a: '66.7%', b: '33.3%' });
  });
});
