/** @vitest-environment jsdom */
/**
 * **専属カウンセラーの画面に出る保管値は、鍵も天井を通る。** (2026-10-31 · パス 568)
 *
 * パス 419 は 4 画面について「保管した自由文は画面へ出るとき天井を通る」を閉じたが、
 * `MentorPage` (パス 551 以降) はその census (`storedFreeTextCeiling.test.ts`) に入っていなかった。
 * 自由文 (聞き取りの答え・チェックイン / 関係のメモ) は `sanitizeMentorSession` の `readText` が
 * 既に天井を掛ける (長すぎは落とす) が、**メンバー鍵は天井が無かった** —— 2 か所に穴が在った:
 *
 * ## 実測 (2026-10-31 · 直す前・1 欄 200,000 字)
 *
 * | 道 | 素 | 1 欄 200,000 字 |
 * | --- | ---: | ---: |
 * | (a) `relations[].with` が roster 不一致 → `nameOf` の `?? key` fallback | — | 関係行 **200,012** / 画面 **201,163** |
 * | (b) 名前が空で email が長い member → `mentorRoster` の `|| r.data.email` fallback | — | option **200,001** / 画面 **200,571** |
 * | (c) `teamPairs` の `aName`/`bName` (両者同意の mutual) → `?? k` fallback | — | 鍵そのもの (convoluted) |
 *
 * `sanitizeMentorSession` の `readRelation` は `with` に長さを見ない (非空の文字列 + trust + note だけ)。
 * `member` も `memberKeyOf` = trim + lower だけ。届く道は**復元・手編集 JSON・旧版データ** (パス 419 と同じ)。
 *
 * ## 直し —— 同一性の鍵は天井を掛けず、表示だけ天井 (パス 420 の規律)
 *
 * 鍵は join (`byKey.get` / dedup / pair id) に使うので、切ると**別の鍵を指す**。だから天井は**表示の fallback だけ**:
 * - `MentorPage` の `nameOf`: `?? key` → `?? displayField(key)`
 * - `mentorRoster`: `|| r.data.email` → `|| displayField(r.data.email)`
 * - `teamPairs` の `nameOf`: `?? k` → `?? displayField(k)`
 *
 * 正当な値 (roster 名 ≤256・正当なメール鍵 ≤254) は `displayField` の既定 256 未満なので **1 字も変わらない**。
 * 背骨は振る舞い ((a)(b) は実物を描く・(c) は純関数) + 対照 (fallback を生の鍵へ戻すと鳴る)。
 */
import 'fake-indexeddb/auto';
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MentorPage } from '../MentorPage';
import { getRecordStore } from '../../data/store';
import { _resetCollectionSubscribersForTests } from '../../data/useCollection';
import { MEMBERS_COLLECTION } from '../../data/members';
import { MENTOR_COLLECTION, MENTOR_QUESTIONS, teamPairs, type MentorSession, type MentorMember } from '../../../shared/mentor';
import { MAX_DISPLAY_FIELD_CHARS } from '../../../shared/apiResponse';
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

beforeEach(async () => {
  await resetRecordStore();
  _resetCollectionSubscribersForTests();
  container = document.createElement('div');
  document.body.appendChild(container);
});
afterEach(() => {
  if (root) {
    act(() => root!.unmount());
    root = null;
  }
  container.remove();
});

function session(member: string, extra: Partial<MentorSession>): MentorSession {
  const answers = Object.fromEntries(MENTOR_QUESTIONS.map((q) => [q.key, `${q.key} の答え`]));
  return { member, answers, checkins: [], relations: [], shareWithTeam: false, ...extra };
}

async function mount(): Promise<void> {
  root = createRoot(container);
  await act(async () => {
    root!.render(createElement(MentorPage));
  });
}

function selectMember(key: string): Promise<void> {
  const sel = container.querySelector<HTMLSelectElement>('[aria-label="メンバー"]');
  if (!sel) throw new Error('member select not found');
  const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')!.set!;
  return act(async () => {
    setter.call(sel, key);
    sel.dispatchEvent(new Event('change', { bubbles: true }));
  });
}

const LONG = 'z'.repeat(200000);
// 表示の上限 (256) + '…' (1) + 周りの固定文 (信頼度・役割など) の余白。正当な値はここをはるかに下回る。
const DISPLAY_BOUND = MAX_DISPLAY_FIELD_CHARS + 64;

describe('(a) relations[].with を roster が知らないとき', () => {
  it('長い鍵は天井を通って描かれる (生の鍵を素で出さない)', async () => {
    await getRecordStore().insert(MEMBERS_COLLECTION, { name: '青木', email: 'a@example.com', role: 'member' });
    await getRecordStore().insert(MENTOR_COLLECTION, session('a@example.com', {
      relations: [{ with: LONG, trust: 3, note: 'メモ' }],
    }));
    await mount();
    await waitForElement<HTMLSelectElement>(() => container.querySelector<HTMLSelectElement>('[aria-label="メンバー"]'), 'メンバー選択');
    await selectMember('a@example.com');
    await settleUntil(() => container.querySelector('[data-mentor-relation-row]') !== null, '関係行');
    const row = container.querySelector('[data-mentor-relation-row]')?.textContent ?? '';
    expect(row.length).toBeLessThan(DISPLAY_BOUND);
    expect(row).toContain('…'); // 切ったことを述べる
    expect(row).toContain('信頼度 3'); // 周りの正当な内容は残る
    expect((container.textContent ?? '').length).toBeLessThan(DISPLAY_BOUND + 4000);
  });

  it('正当な短い鍵 (退team したメンバー) は全文そのまま (…を付けない)', async () => {
    await getRecordStore().insert(MEMBERS_COLLECTION, { name: '青木', email: 'a@example.com', role: 'member' });
    // 'left@example.com' は roster に居ない (退team) が正当なメール鍵 ≤254
    await getRecordStore().insert(MENTOR_COLLECTION, session('a@example.com', {
      relations: [{ with: 'left@example.com', trust: 2, note: '' }],
    }));
    await mount();
    await waitForElement<HTMLSelectElement>(() => container.querySelector<HTMLSelectElement>('[aria-label="メンバー"]'), 'メンバー選択');
    await selectMember('a@example.com');
    await settleUntil(() => container.querySelector('[data-mentor-relation-row]') !== null, '関係行');
    const row = container.querySelector('[data-mentor-relation-row]')?.textContent ?? '';
    expect(row).toContain('left@example.com');
    expect(row).not.toContain('…');
  });
});

describe('(b) member の名前が空で email が長いとき', () => {
  it('roster 名は天井を通る (option に生の email を素で出さない)', async () => {
    const LONGEMAIL = 'z'.repeat(199990) + '@x.co';
    await getRecordStore().insert(MEMBERS_COLLECTION, { name: '', email: LONGEMAIL, role: 'member' });
    await mount();
    const sel = await waitForElement<HTMLSelectElement>(() => container.querySelector<HTMLSelectElement>('[aria-label="メンバー"]'), 'メンバー選択');
    const opt = sel.querySelector('option:not([value=""])')?.textContent ?? '';
    expect(opt.length).toBeLessThan(DISPLAY_BOUND);
    expect(opt).toContain('…');
    expect((container.textContent ?? '').length).toBeLessThan(DISPLAY_BOUND + 4000);
  });

  it('名前が在れば roster 名をそのまま出す (email の fallback を使わない)', async () => {
    await getRecordStore().insert(MEMBERS_COLLECTION, { name: '鈴木', email: 's@example.com', role: 'member' });
    await mount();
    const sel = await waitForElement<HTMLSelectElement>(() => container.querySelector<HTMLSelectElement>('[aria-label="メンバー"]'), 'メンバー選択');
    const opt = sel.querySelector('option:not([value=""])')?.textContent ?? '';
    expect(opt).toContain('鈴木');
    expect(opt).not.toContain('…');
  });
});

describe('(c) teamPairs の aName / bName (純関数)', () => {
  // roster に居ない長い member 鍵を持つ 2 つの session が互いを低く見て両方同意すると、
  // aName / bName は fallback で鍵そのものになる。
  const sessions: readonly MentorSession[] = [
    { member: 'a' + LONG, answers: {}, checkins: [], shareWithTeam: true, relations: [{ with: 'b' + LONG, trust: 1, note: '' }] },
    { member: 'b' + LONG, answers: {}, checkins: [], shareWithTeam: true, relations: [{ with: 'a' + LONG, trust: 1, note: '' }] },
  ];

  it('roster 不一致の長い鍵は天井を通る', () => {
    const pairs = teamPairs(sessions, []);
    expect(pairs).toHaveLength(1);
    expect(pairs[0]!.aName.length).toBeLessThanOrEqual(MAX_DISPLAY_FIELD_CHARS + 1);
    expect(pairs[0]!.bName.length).toBeLessThanOrEqual(MAX_DISPLAY_FIELD_CHARS + 1);
    expect(pairs[0]!.aName).toContain('…');
  });

  it('roster に居れば名前をそのまま出す (fallback を使わない)', () => {
    const members: readonly MentorMember[] = [
      { key: 'a' + LONG, name: '田中', role: 'member' },
      { key: 'b' + LONG, name: '佐藤', role: 'member' },
    ];
    const pairs = teamPairs(sessions, members);
    expect(pairs).toHaveLength(1);
    expect([pairs[0]!.aName, pairs[0]!.bName].sort()).toEqual(['佐藤', '田中']);
    expect(pairs[0]!.aName).not.toContain('…');
  });
});
