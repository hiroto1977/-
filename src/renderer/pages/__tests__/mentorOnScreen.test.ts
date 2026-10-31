/** @vitest-environment jsdom */
/**
 * **専属カウンセラーの画面を実物で描いて押す** (2026-10-29 · パス 551)。
 *
 * 守る物を画面の側で: ① 聞き取りの答えは 1 人 1 行で保管層へ入り、次の問いへ進む
 * ② 記録に危機の文面が在れば助言は窓口だけになり、AI へは送らない (`invoke` 0 回)
 * ③ 他のメンバーの本音は、別の人の画面にも、AI へ送る文にも、1 字も出ない
 * ④ 同意した人の集計だけがチームの様子に出て、両方の同意で仲介の計画が組まれる
 * ⑤ AI へ送る前の断り (`data-ai-egress`) は送る口より DOM で前に在る。
 */
import 'fake-indexeddb/auto';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MentorPage } from '../MentorPage';
import { getRecordStore } from '../../data/store';
import { _resetCollectionSubscribersForTests } from '../../data/useCollection';
import { MEMBERS_COLLECTION } from '../../data/members';
import { MENTOR_COLLECTION, MENTOR_QUESTIONS, type MentorSession } from '../../../shared/mentor';
import { MAX_ASSISTANT_CONTENT_CHARS } from '../../../shared/assistantLimits';
import { resetRecordStore } from '../../__tests__/recordStoreHarness';
import { settleUntil, waitForElement, waitForText } from '../../__tests__/jsdomWait';

const invoke = vi.fn<(serviceId: string, action: string, payload: unknown) => Promise<unknown>>();

beforeAll(() => {
  (globalThis as unknown as { serviceHub: unknown }).serviceHub = {
    getVersion: () => Promise.resolve('0.1.0-web'),
    listConfigured: () => Promise.resolve([]),
    fetchSnapshot: () => Promise.resolve({ ok: false, code: 'x', message: 'x' }),
    invoke,
    openExternal: () => Promise.resolve(),
    oauthSupported: () => Promise.resolve(false),
    setToken: () => Promise.resolve(),
    clearToken: () => Promise.resolve(),
  };
});

let container: HTMLDivElement;
let root: Root | null = null;

const text = (): string => (container.textContent ?? '').replace(/\s+/g, ' ');

function setValue(el: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement, value: string): void {
  const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : el instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
  if (!setter) throw new Error('value setter not found');
  setter.call(el, value);
  el.dispatchEvent(new Event(el instanceof HTMLSelectElement ? 'change' : 'input', { bubbles: true }));
}

function byLabel<T extends Element>(label: string): T {
  const el = container.querySelector<T>(`[aria-label="${label}"]`);
  if (!el) throw new Error(`aria-label="${label}" not found`);
  return el;
}

async function click(selector: string): Promise<void> {
  const button = container.querySelector<HTMLButtonElement>(selector);
  if (!button) throw new Error(`${selector} not found`);
  await act(async () => {
    button.click();
  });
}

async function mount(): Promise<void> {
  root = createRoot(container);
  await act(async () => {
    root!.render(createElement(MentorPage));
  });
  await settleUntil(() => !text().includes('読み込み中'), '一覧が届く');
}

async function pick(key: string): Promise<void> {
  await act(async () => {
    setValue(byLabel<HTMLSelectElement>('メンバー'), key);
  });
  await waitForElement(() => container.querySelector('[data-mentor-prompt]'), 'カウンセラーの問い');
}

const A = { name: '青木', email: 'a@example.com', role: 'member' as const };
const B = { name: '坂本', email: 'b@example.com', role: 'admin' as const };

async function seedMembers(): Promise<void> {
  await getRecordStore().insert(MEMBERS_COLLECTION, A);
  await getRecordStore().insert(MEMBERS_COLLECTION, B);
}

function session(member: string, extra: Partial<MentorSession>): MentorSession {
  const answers = Object.fromEntries(MENTOR_QUESTIONS.map((q) => [q.key, `${q.key} の答え`]));
  return { member, answers, checkins: [], relations: [], shareWithTeam: false, ...extra };
}

async function storedSessions(): Promise<readonly MentorSession[]> {
  return (await getRecordStore().list<MentorSession>(MENTOR_COLLECTION)).map((r) => r.data);
}

beforeEach(async () => {
  await resetRecordStore();
  _resetCollectionSubscribersForTests();
  invoke.mockReset();
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

describe('専属カウンセラー — 画面', () => {
  it('メンバーが居なければ、チーム管理へ案内して終わる', async () => {
    await mount();
    expect(container.querySelector('[data-mentor-empty]')?.textContent).toContain('「チーム管理」の画面でメンバーを登録すると');
    expect(container.querySelector('[data-mentor-prompt]')).toBeNull();
  });

  it('★ 聞き取り: 最初の問いが出て、答えると 1 人 1 行で保管層へ入り、次の問いへ進む', async () => {
    await seedMembers();
    await mount();
    await pick('a@example.com');
    expect(container.querySelector('[data-mentor-prompt]')?.textContent).toContain(MENTOR_QUESTIONS[0]!.prompt);
    await act(async () => {
      setValue(byLabel<HTMLTextAreaElement>('カウンセラーへの答え'), '率直に結論から');
    });
    await click('[data-mentor-answer]');
    await waitForText(text, '保存しました');
    await waitForText(text, MENTOR_QUESTIONS[1]!.prompt);
    const rows = await storedSessions();
    expect(rows.length).toBe(1);
    expect(rows[0]).toMatchObject({ member: 'a@example.com', answers: { style: '率直に結論から' }, shareWithTeam: false });
    // 2 問目も同じ行に入る (2 行にならない)
    await act(async () => {
      setValue(byLabel<HTMLTextAreaElement>('カウンセラーへの答え'), '人に感謝されたとき');
    });
    await click('[data-mentor-answer]');
    await waitForText(text, MENTOR_QUESTIONS[2]!.prompt);
    const again = await storedSessions();
    expect(again.length).toBe(1);
    expect(again[0]!.answers).toEqual({ style: '率直に結論から', motivation: '人に感謝されたとき' });
  });

  it('空の答えは断りが出て、保管層には何も入らない', async () => {
    await seedMembers();
    await mount();
    await pick('a@example.com');
    await click('[data-mentor-answer]');
    await waitForText(text, '答えを入力してください');
    expect(await storedSessions()).toEqual([]);
  });

  it('★ 危機の文面が記録に在れば、助言は窓口 1 件だけで、AI へは送らない (invoke 0 回)', async () => {
    await seedMembers();
    await getRecordStore().insert(MENTOR_COLLECTION, session('a@example.com', { checkins: [{ on: '2026-10-28', mood: 1, workload: 5, note: 'もう死にたい' }] }));
    await mount();
    await pick('a@example.com');
    await waitForElement(() => container.querySelector('[data-mentor-advice="crisis"]'), '危機の助言');
    expect(container.querySelectorAll('[data-mentor-advice]').length).toBe(1);
    expect(container.querySelector('[data-crisis-held]')?.textContent).toContain('相談できる窓口');
    expect(text()).toContain('いのちの電話');
    await act(async () => {
      setValue(byLabel<HTMLTextAreaElement>('AI への相談文'), '仕事の進め方を相談したい');
    });
    await click('[data-mentor-ask-ai]');
    await settleUntil(() => container.querySelectorAll('[data-crisis-held]').length === 2, '送る口の側にも窓口が出る');
    expect(invoke).not.toHaveBeenCalled();
  });

  it('★ AI へ送るのは本人の記録と相談文だけ。断りは送る口より前に在り、返答には免責が付く', async () => {
    await seedMembers();
    await getRecordStore().insert(MENTOR_COLLECTION, session('a@example.com', { checkins: [{ on: '2026-10-28', mood: 4, workload: 2, note: 'A のメモ' }] }));
    await getRecordStore().insert(MENTOR_COLLECTION, session('b@example.com', { shareWithTeam: true, checkins: [{ on: '2026-10-28', mood: 1, workload: 5, note: 'B の本音のメモ' }] }));
    invoke.mockResolvedValue({ ok: true, data: { text: '小さな一歩を 3 つ', provider: 'anthropic', model: 'm' } });
    await mount();
    await pick('a@example.com');
    const notice = container.querySelector('[data-ai-egress]');
    const ask = container.querySelector('[data-mentor-ask-ai]');
    expect(notice).not.toBeNull();
    expect(notice!.compareDocumentPosition(ask!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(notice!.textContent).toContain('他のメンバーの記録は送りません');
    await act(async () => {
      setValue(byLabel<HTMLTextAreaElement>('AI への相談文'), '後輩への伝え方');
    });
    await click('[data-mentor-ask-ai]');
    await waitForText(text, '小さな一歩を 3 つ');
    expect(invoke).toHaveBeenCalledTimes(1);
    const [service, action, payload] = invoke.mock.calls[0]!;
    expect(service).toBe('assistant');
    expect(action).toBe('chat');
    const sent = JSON.stringify(payload);
    expect(sent).toContain('A のメモ');
    expect(sent).toContain('後輩への伝え方');
    expect(sent).not.toContain('B の本音');
    expect(container.querySelector('[data-mentor-ai-reply]')?.textContent).toContain('AI の返答は参考であり');
    // B の本音は A の画面のどこにも出ない (同意していても集計だけ)
    expect(text()).not.toContain('B の本音');
    expect(text()).toContain('坂本: 負荷は落ち着いています・気分が下がっています');
  });

  it('★ 相談文が天井 (MAX_ASSISTANT_CONTENT_CHARS) を超えると断り、AI へは送らず、打った文は 1 字も落とさない', async () => {
    await seedMembers();
    await getRecordStore().insert(MENTOR_COLLECTION, session('a@example.com', {}));
    await mount();
    await pick('a@example.com');
    const over = 'あ'.repeat(MAX_ASSISTANT_CONTENT_CHARS + 1);
    await act(async () => {
      setValue(byLabel<HTMLTextAreaElement>('AI への相談文'), over);
    });
    await click('[data-mentor-ask-ai]');
    await waitForText(text, '字超えています');
    expect(invoke).not.toHaveBeenCalled();
    expect(container.querySelector('[data-mentor-ai-error]')?.textContent).toContain(`${MAX_ASSISTANT_CONTENT_CHARS} 字までです`);
    // 超過分は黙って落ちない (打ち止めではなく断り)
    expect(byLabel<HTMLTextAreaElement>('AI への相談文').value.length).toBe(MAX_ASSISTANT_CONTENT_CHARS + 1);
  });

  it('★ 仲介の計画は両方の同意が在るときだけ組まれ、本音は 1 字も出ない', async () => {
    await seedMembers();
    await getRecordStore().insert(MENTOR_COLLECTION, session('a@example.com', { shareWithTeam: true, relations: [{ with: 'b@example.com', trust: 1, note: 'A の本音' }] }));
    await getRecordStore().insert(MENTOR_COLLECTION, session('b@example.com', { shareWithTeam: false, relations: [{ with: 'a@example.com', trust: 1, note: 'B の本音' }] }));
    await mount();
    await settleUntil(() => container.querySelectorAll('[data-mentor-signal]').length === 1, '同意した 1 人の集計');
    expect(container.querySelector('[data-mentor-pair]')).toBeNull();
    expect(text()).not.toContain('B の本音');
    expect(text()).not.toContain('A の本音');
    // B が同意すると組が出て、4 段の計画が組まれる
    const rows = await getRecordStore().list<MentorSession>(MENTOR_COLLECTION);
    const b = rows.find((r) => r.data.member === 'b@example.com')!;
    await getRecordStore().update<MentorSession>(b.id, { shareWithTeam: true });
    await act(async () => {
      root!.unmount();
      root = null;
    });
    _resetCollectionSubscribersForTests();
    await mount();
    await waitForElement(() => container.querySelector('[data-mentor-pair]'), '仲介の組');
    expect(text()).toContain('青木 さんと 坂本 さん — 互いに距離がある');
    expect(container.querySelectorAll('[data-mentor-pair] ol li').length).toBe(4);
    expect(text()).not.toContain('A の本音');
    expect(text()).not.toContain('B の本音');
  });

  it('関係を記録すると本人の行に入り、相手の画面には出ない', async () => {
    await seedMembers();
    await mount();
    await pick('a@example.com');
    await act(async () => {
      setValue(byLabel<HTMLSelectElement>('相手'), 'b@example.com');
      setValue(byLabel<HTMLTextAreaElement>('関係のメモ'), '頼みにくい');
    });
    await click('[data-mentor-relation]');
    await waitForElement(() => container.querySelector('[data-mentor-relation-row]'), '関係の行');
    expect(text()).toContain('坂本: 信頼度 3 — 頼みにくい');
    const rows = await storedSessions();
    expect(rows.length).toBe(1);
    expect(rows[0]!.relations).toEqual([{ with: 'b@example.com', trust: 3, note: '頼みにくい' }]);
    await pick('b@example.com');
    expect(text()).not.toContain('頼みにくい');
  });
});
