/** @vitest-environment jsdom */
/**
 * **見張りアシスタントの画面** (2026-11-21) —— 貼り付けた文から平日の要約と返信の下書きを、
 * 週ごとの数字から週次レポートを作る。
 *
 * ここは**実物の画面**を実物の保管層 (fake-indexeddb) の上で描いて押す。見るのは:
 * - 文を渡す → 一覧に出る → 要約・下書きが「アシスタントの答え」に並ぶ
 * - ★ この画面は端末の外へ出す口を 1 度も呼ばない (橋の `invoke` / `openExternal` / `fetchSnapshot`)
 * - 週ごとの数字は月曜にそろえて保管層へ入り、同じ週の 2 件目は断る
 * - 読めない行はレポートから外して件数を言い、一覧には出す (× で消せる)
 *
 * 待ちは回数ではなく条件で取る (法則 `wait-for-condition-not-ticks`)。
 */
import 'fake-indexeddb/auto';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { WatchPage } from '../WatchPage';
import { getRecordStore } from '../../data/store';
import { _resetCollectionSubscribersForTests } from '../../data/useCollection';
import { WATCH_REPORT_EMPTY_NOTE, WATCH_WEEKLY_COLLECTION, type WatchWeekEntry } from '../../data/watchWeekly';
import {
  WATCH_DIGEST_EMPTY_NOTE,
  WATCH_OWNER_NOTE,
  WATCH_PRIVACY_NOTE,
  WATCH_SOURCES,
} from '../../../shared/watchAssistant';
import { resetRecordStore } from '../../__tests__/recordStoreHarness';
import { settleUntil, settleUntilAsync, waitForElement, waitForText } from '../../__tests__/jsdomWait';

let container: HTMLDivElement;
let root: Root | null = null;

const bridge = {
  getVersion: vi.fn(() => Promise.resolve('0.1.0-web')),
  listConfigured: vi.fn(() => Promise.resolve([])),
  fetchSnapshot: vi.fn(() => Promise.resolve({ ok: true, data: {} })),
  invoke: vi.fn(() => Promise.resolve({ ok: false, code: 'x', message: 'x' })),
  openExternal: vi.fn(() => Promise.resolve()),
  oauthSupported: vi.fn(() => Promise.resolve(false)),
  setToken: vi.fn(() => Promise.resolve()),
  clearToken: vi.fn(() => Promise.resolve()),
};
const clipboard = { writeText: vi.fn<(text: string) => Promise<void>>(() => Promise.resolve()) };

beforeAll(() => {
  (globalThis as unknown as { serviceHub: unknown }).serviceHub = bridge;
  Object.defineProperty(window.navigator, 'clipboard', { value: clipboard, configurable: true });
});

beforeEach(async () => {
  await resetRecordStore();
  _resetCollectionSubscribersForTests();
  for (const fn of Object.values(bridge)) fn.mockClear();
  clipboard.writeText.mockReset();
  clipboard.writeText.mockImplementation(() => Promise.resolve());
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

const text = (): string => (container.textContent ?? '').replace(/\s+/g, ' ');
const q = <T extends Element>(sel: string): T | null => container.querySelector<T>(sel);
const all = <T extends Element>(sel: string): T[] => Array.from(container.querySelectorAll<T>(sel));
const answers = (): string[] => all<HTMLElement>('[data-watch-answer-text]').map((el) => el.textContent ?? '');
const items = (): HTMLElement[] => all<HTMLElement>('[data-watch-item]');
const weeks = (): HTMLElement[] => all<HTMLElement>('[data-watch-week]');

function control<T extends HTMLElement>(tag: string, label: string): T {
  const el = q<T>(`${tag}[aria-label="${label}"]`);
  if (!el) throw new Error(`${tag}「${label}」が無い`);
  return el;
}

async function mount(): Promise<void> {
  root = createRoot(container);
  await act(async () => {
    root!.render(createElement(WatchPage));
  });
  await waitForElement(() => q('textarea[aria-label="本文"]'), '本文の欄');
}

function setValue(el: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement, value: string): void {
  const proto =
    el instanceof window.HTMLSelectElement
      ? window.HTMLSelectElement.prototype
      : el instanceof window.HTMLTextAreaElement
        ? window.HTMLTextAreaElement.prototype
        : window.HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
  if (!setter) throw new Error('value setter not found');
  setter.call(el, value);
  el.dispatchEvent(new Event(el instanceof window.HTMLSelectElement ? 'change' : 'input', { bubbles: true }));
}

async function press(label: string): Promise<void> {
  const button = await waitForElement(
    () => all<HTMLButtonElement>('button').find((b) => b.textContent?.trim() === label) ?? null,
    `ボタン「${label}」`,
  );
  await act(async () => {
    button.click();
  });
}

async function pressNamed(ariaLabel: string): Promise<void> {
  const button = await waitForElement(() => q<HTMLButtonElement>(`button[aria-label="${ariaLabel}"]`), `ボタン「${ariaLabel}」`);
  await act(async () => {
    button.click();
  });
}

/** 文を 1 件渡す。 */
async function give(source: string, from: string, subject: string, body: string): Promise<void> {
  await act(async () => {
    setValue(control<HTMLSelectElement>('select', '材料の種類'), source);
    setValue(control<HTMLInputElement>('input', '相手の名前'), from);
    setValue(control<HTMLInputElement>('input', '件名'), subject);
    setValue(control<HTMLTextAreaElement>('textarea', '本文'), body);
  });
  await press('＋ 材料を渡す');
}

/** 週ごとの数字を入れて「この週を記録」を押す (結果は呼び手が待つ)。 */
async function saveWeek(week: string, values: Readonly<Record<string, string>>): Promise<void> {
  await act(async () => {
    setValue(control<HTMLInputElement>('input', '週の日付'), week);
    for (const [label, value] of Object.entries(values)) setValue(control<HTMLInputElement>('input', label), value);
  });
  await press('＋ この週を記録');
}

const stored = async (): Promise<WatchWeekEntry[]> =>
  (await getRecordStore().list<WatchWeekEntry>(WATCH_WEEKLY_COLLECTION)).map((r) => r.data);

describe('見張りアシスタント —— 開いた直後', () => {
  it('持ち主への断り・見張る 6 つの先・空の案内を出す', async () => {
    await mount();
    expect(q('[data-watch-owner-note]')?.textContent).toBe(WATCH_OWNER_NOTE);
    expect(all('[data-watch-sources] li').map((li) => li.textContent)).toEqual(WATCH_SOURCES.map((s) => `${s.label} — ${s.how}`));
    expect(text()).toContain(WATCH_PRIVACY_NOTE);
    expect(q('[data-watch-items-empty]')?.textContent).toBe(WATCH_DIGEST_EMPTY_NOTE);
    expect(q('[data-watch-answers-empty]')).not.toBeNull();
    expect(items()).toHaveLength(0);
    expect(answers()).toHaveLength(0);
  });

  it('材料が無いまま要約・レポートを押すと、案内を答える', async () => {
    await mount();
    await press('平日の要約を作る');
    await waitForText(text, WATCH_DIGEST_EMPTY_NOTE.slice(0, 12));
    expect(answers()).toEqual([WATCH_DIGEST_EMPTY_NOTE]);
    await press('週次レポートを作る');
    await settleUntil(() => answers().length === 2, '2 つ目の答え');
    expect(answers()[1]).toBe(WATCH_REPORT_EMPTY_NOTE);
  });
});

describe('見張りアシスタント —— 文を渡して要約と下書きを作る', () => {
  it('渡した文が一覧に出て、読み取れた事が添えられる (本文の欄は空に戻り、種類は残る)', async () => {
    await mount();
    await give('slack', '田中', '', '来週の打ち合わせ、いつが良いですか？');
    await settleUntil(() => items().length === 1, '材料が 1 件');
    const row = (items()[0]?.textContent ?? '').replace(/\s+/g, ' ');
    expect(row).toContain('スラック');
    expect(row).toContain('田中 — 来週の打ち合わせ、いつが良いですか？');
    expect(row).toContain('要返信 / 日程の相談 / 期限らしき表記: 来週');
    expect(control<HTMLTextAreaElement>('textarea', '本文').value).toBe('');
    expect(control<HTMLInputElement>('input', '相手の名前').value).toBe('');
    expect(control<HTMLSelectElement>('select', '材料の種類').value).toBe('slack');
    // 読み取った合図から、返信の方向が選ばれている (日程の相談 → 日程を調整する)。
    expect(control<HTMLSelectElement>('select', '「来週の打ち合わせ、いつが良いですか？」への返信の方向').value).toBe('schedule');
  });

  it('本文が空なら断り、材料は増えない', async () => {
    await mount();
    await press('＋ 材料を渡す');
    const alert = await waitForElement(() => q('[data-watch-item-error]'), '断り');
    expect(alert.textContent).toBe('本文が未入力です（メールやスラックの文を貼り付けてください）');
    expect(alert.getAttribute('role')).toBe('alert');
    expect(items()).toHaveLength(0);
  });

  it('平日の要約: 渡した文を並びごとにまとめた答えが出る', async () => {
    await mount();
    await give('mail', 'A 社', 'お見積りの件', '至急ご確認ください。');
    await settleUntil(() => items().length === 1, '材料 1 件');
    await give('calendar', '', '', '15:00 歯医者');
    await settleUntil(() => items().length === 2, '材料 2 件');
    await press('平日の要約を作る');
    await waitForText(text, '【平日の要約】');
    const answer = answers()[0] ?? '';
    expect(answer).toContain('材料 2 件 (メール 1 / スラック 0 / 予定 1)');
    expect(answer).toContain('■ 至急 (1 件)');
    expect(answer).toContain('・[メール] A 社 — お見積りの件 (至急 / 要返信 / お金の話)');
    expect(answer).toContain('■ 予定・期限 (1 件)');
    expect(answer).toContain('・[予定] 相手の名前なし — 15:00 歯医者');
  });

  it('返信の下書き: 選んだ方向の文が出て、書き換える箇所と持ち主への断りを添える', async () => {
    await mount();
    await give('mail', 'A 社 山田', 'お見積りの件', 'ご確認をお願いします。');
    await settleUntil(() => items().length === 1, '材料 1 件');
    await pressNamed('「お見積りの件」への返信の下書きを作る');
    await waitForText(text, '件名: Re: お見積りの件');
    expect(answers()[0]).toContain('A 社 山田 様');
    expect(answers()[0]).toContain('確認のうえ【いつまでに】あらためてご連絡いたします。');
    const bubble = (q('[data-watch-answer]')?.textContent ?? '').replace(/\s+/g, ' ');
    expect(bubble).toContain('返信の下書き (確認して後で答える)');
    expect(bubble).toContain('【 】の箇所が 3 か所あります。');
    expect(bubble).toContain(WATCH_OWNER_NOTE);

    // 方向を替えて作り直すと、文が替わる。
    await act(async () => {
      setValue(control<HTMLSelectElement>('select', '「お見積りの件」への返信の方向'), 'decline');
    });
    await pressNamed('「お見積りの件」への返信の下書きを作る');
    await settleUntil(() => answers().length === 2, '2 つ目の答え');
    expect(answers()[1]).toContain('お受けすることが難しい状況です。');
  });

  it('予定には返信の下書きの操作子を出さない (メールには出す)', async () => {
    await mount();
    await give('calendar', '', '', '15:00 歯医者');
    await settleUntil(() => items().length === 1, '材料 1 件');
    expect(q('button[aria-label="「15:00 歯医者」への返信の下書きを作る"]')).toBeNull();
    await give('mail', '', '', 'お知らせです');
    await settleUntil(() => items().length === 2, '材料 2 件');
    expect(q('button[aria-label="「お知らせです」への返信の下書きを作る"]')).not.toBeNull();
  });

  it('× で材料を消す・「答えを消す」で答えを消す', async () => {
    await mount();
    await give('mail', '', '件名A', '本文');
    await settleUntil(() => items().length === 1, '材料 1 件');
    await press('平日の要約を作る');
    await settleUntil(() => answers().length === 1, '答え 1 つ');
    await pressNamed('材料「件名A」を消す');
    await settleUntil(() => items().length === 0, '材料 0 件');
    await press('答えを消す');
    await settleUntil(() => answers().length === 0, '答え 0');
    expect(q('[data-watch-answers-empty]')).not.toBeNull();
  });

  it('コピー: 答えの全文を渡す・できなければそう言う', async () => {
    await mount();
    await give('mail', '', '件名A', '本文');
    await settleUntil(() => items().length === 1, '材料 1 件');
    await press('平日の要約を作る');
    await settleUntil(() => answers().length === 1, '答え 1 つ');
    await pressNamed('「平日の要約」をコピー');
    await waitForText(text, 'コピーしました。');
    expect(clipboard.writeText).toHaveBeenCalledTimes(1);
    expect(clipboard.writeText).toHaveBeenCalledWith(answers()[0]);

    clipboard.writeText.mockImplementation(() => Promise.reject(new Error('denied')));
    await pressNamed('「平日の要約」をコピー');
    await waitForText(text, 'コピーできませんでした。文を長押しして選び、コピーしてください。');
  });

  it('★ 端末の外へ出す口を 1 度も呼ばない (渡す・要約・下書き・レポート・記録のどれでも)', async () => {
    await mount();
    await give('mail', 'A 社', 'お見積りの件', '至急ご確認ください。https://example.com/x');
    await settleUntil(() => items().length === 1, '材料 1 件');
    await press('平日の要約を作る');
    await pressNamed('「お見積りの件」への返信の下書きを作る');
    await saveWeek('2026-11-18', { 'エックス (X)の投稿数': '12' });
    await waitForText(text, '2026-11-16 の週を記録しました。');
    await press('週次レポートを作る');
    await settleUntil(() => answers().length === 3, '答え 3 つ');
    expect(bridge.invoke).not.toHaveBeenCalled();
    expect(bridge.openExternal).not.toHaveBeenCalled();
    expect(bridge.fetchSnapshot).not.toHaveBeenCalled();
    expect(bridge.setToken).not.toHaveBeenCalled();
    // 画面にリンクも置かない (貼り付けた文の中の URL を押せる形にしない)。
    expect(all('a')).toHaveLength(0);
  });
});

describe('見張りアシスタント —— 週ごとの数字と週次レポート', () => {
  it('入力した数字だけを、月曜にそろえて保管層へ入れる', async () => {
    await mount();
    await saveWeek('2026-11-18', {
      'エックス (X)の投稿数': '12',
      'グーグル広告 (Google Ads)の広告費': '30,000',
      'アナリティクス (Google Analytics)の訪問数': '2400',
    });
    const saved = await waitForElement(() => q('[data-watch-week-saved]'), '記録した知らせ');
    expect(saved.textContent).toBe('2026-11-16 の週を記録しました。');
    expect(saved.getAttribute('role')).toBe('status');
    expect(await stored()).toEqual([{ week: '2026-11-16', xPosts: 12, adCost: 30000, gaSessions: 2400 }]);
    await settleUntil(() => weeks().length === 1, '記録した週 1 件');
    expect((weeks()[0]?.textContent ?? '').replace(/\s+/g, ' ')).toContain('2026-11-16 の週 — 数字 3 個');
    // 数字の欄は空に戻る。
    expect(control<HTMLInputElement>('input', 'エックス (X)の投稿数').value).toBe('');
  });

  it('★ 同じ週の 2 件目は断り、保管層は 1 件のまま', async () => {
    await mount();
    await saveWeek('2026-11-16', { 'エックス (X)の投稿数': '12' });
    await waitForText(text, '2026-11-16 の週を記録しました。');
    // 同じ週の別の日 (金曜) で入れても、同じ週として断る。
    await saveWeek('2026-11-20', { 'エックス (X)の投稿数': '99' });
    const alert = await waitForElement(() => q('[data-watch-week-error]'), '断り');
    expect(alert.textContent).toBe('2026-11-16 の週は記録済みです。直すときは、下の一覧の × で消してから入れ直してください。');
    expect(await stored()).toEqual([{ week: '2026-11-16', xPosts: 12 }]);
    expect(q('[data-watch-week-saved]')).toBeNull();
  });

  it('読めない数字は欄を名指しして断り、何も入れない', async () => {
    await mount();
    await saveWeek('2026-11-16', { 'グーグル広告 (Google Ads)のクリック数': '千回' });
    const alert = await waitForElement(() => q('[data-watch-week-error]'), '断り');
    expect(alert.textContent).toBe('グーグル広告 (Google Ads)のクリック数は 0 以上 100,000,000,000 以下の整数で入力してください');
    expect(await stored()).toEqual([]);
  });

  it('週次レポート: 前の週と比べた答えが出る', async () => {
    await getRecordStore().insert<WatchWeekEntry>(WATCH_WEEKLY_COLLECTION, { week: '2026-11-09', xPosts: 10 });
    await getRecordStore().insert<WatchWeekEntry>(WATCH_WEEKLY_COLLECTION, { week: '2026-11-16', xPosts: 12 });
    await mount();
    await settleUntil(() => weeks().length === 2, '記録した週 2 件');
    await press('週次レポートを作る');
    await waitForText(text, '【週次レポート】2026-11-16 の週');
    expect(answers()[0]).toContain('・投稿数: 12 件 (前の週 10 件 / +20.0%)');
    expect(answers()[0]).toContain('・エックス (X)の投稿数が前の週より +20.0% (10 → 12 件)');
  });

  it('× で週の記録を消す', async () => {
    await getRecordStore().insert<WatchWeekEntry>(WATCH_WEEKLY_COLLECTION, { week: '2026-11-16', xPosts: 12 });
    await mount();
    await settleUntil(() => weeks().length === 1, '記録した週 1 件');
    await pressNamed('2026-11-16 の週の記録を削除');
    await settleUntilAsync(async () => (await stored()).length === 0, '保管層が 0 件');
    await settleUntil(() => weeks().length === 0, '一覧が 0 件');
  });

  it('★ 週の日付が読めない行は、レポートから外して件数を言い、一覧には出す (× で消せる)', async () => {
    await getRecordStore().insert(WATCH_WEEKLY_COLLECTION, { week: 'こわれた日付', xPosts: 1000 });
    await getRecordStore().insert<WatchWeekEntry>(WATCH_WEEKLY_COLLECTION, { week: '2026-11-16', xPosts: 12 });
    await mount();
    const warn = await waitForElement(() => q('[data-watch-week-unreadable]'), '読めない行の断り');
    expect(warn.textContent).toContain('週の日付が読めない記録が 1 件あります。');
    expect(weeks()).toHaveLength(2);
    await press('週次レポートを作る');
    await waitForText(text, '【週次レポート】2026-11-16 の週');
    expect(answers()[0]).toContain('・投稿数: 12 件');
    expect(answers()[0]).not.toContain('1,000');
    await pressNamed('こわれた日付 の週の記録を削除');
    await settleUntil(() => weeks().length === 1, '一覧が 1 件');
    expect(q('[data-watch-week-unreadable]')).toBeNull();
  });

  it('★ 保管した週の綴りが長くても、一覧は膨らまない (天井と「…」)', async () => {
    await getRecordStore().insert(WATCH_WEEKLY_COLLECTION, { week: 'x'.repeat(200_000), xPosts: 1 });
    await mount();
    await settleUntil(() => weeks().length === 1, '記録した週 1 件');
    expect(text().length).toBeLessThan(20_000);
    expect(weeks()[0]?.textContent).toContain(`${'x'.repeat(16)}…`);
  });
});
