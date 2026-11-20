/** @vitest-environment jsdom */
/**
 * **A8.net の画面は、見本ではなく利用者が記録した成果だけを集計する** (2026-11-19)。
 *
 * それまでこの画面は同梱の見本 3 件 (「[確定] 動画配信サービス 登録 — ¥1,200」ほか) を
 * 「内蔵サンプル」として並べるだけで、利用者の成果を 1 件も扱えなかった。A8.net に
 * メディア会員向けの公開 API は無いので、つなぐ代わりに端末内の記録にした。
 *
 * ここは**実物の画面**を実物の保管層 (fake-indexeddb) の上で描いて押す:
 * 記録する → 合計に出る → 状態を変える → 合計が動く → 消す、と
 * 「読めない行は合計から外して件数を言い、一覧には出す」こと。
 *
 * 待ちは回数ではなく条件で取る (法則 `wait-for-condition-not-ticks`)。
 */
import 'fake-indexeddb/auto';
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { A8netPage } from '../A8netPage';
import { getRecordStore } from '../../data/store';
import { _resetCollectionSubscribersForTests } from '../../data/useCollection';
import { A8NET_EMPTY_NOTE, A8NET_REWARDS_COLLECTION, type A8netRewardEntry } from '../../data/a8netRewards';
import { resetRecordStore } from '../../__tests__/recordStoreHarness';
import { settleUntil, settleUntilAsync, waitForElement, waitForText } from '../../__tests__/jsdomWait';

let container: HTMLDivElement;
let root: Root | null = null;

beforeAll(() => {
  (globalThis as unknown as { serviceHub: unknown }).serviceHub = {
    getVersion: () => Promise.resolve('0.1.0-web'),
    listConfigured: () => Promise.resolve([]),
    fetchSnapshot: () => Promise.resolve({ ok: true, data: { items: [] } }),
    invoke: () => Promise.resolve({ ok: false, code: 'x', message: 'x' }),
    openExternal: () => Promise.resolve(),
    oauthSupported: () => Promise.resolve(false),
    setToken: () => Promise.resolve(),
    clearToken: () => Promise.resolve(),
  };
});

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

const text = (): string => (container.textContent ?? '').replace(/\s+/g, ' ');
const q = <T extends Element>(sel: string): T | null => container.querySelector<T>(sel);
const field = (label: string): HTMLInputElement => {
  const el = q<HTMLInputElement>(`input[aria-label="${label}"]`);
  if (!el) throw new Error(`入力欄「${label}」が無い`);
  return el;
};
const tile = (name: string): string => (q(`[data-a8net-tile="${name}"]`)?.textContent ?? '').replace(/\s+/g, ' ');
const rewardRows = (): HTMLElement[] => Array.from(container.querySelectorAll<HTMLElement>('[data-a8net-reward]'));

async function mount(): Promise<void> {
  root = createRoot(container);
  await act(async () => {
    root!.render(createElement(A8netPage));
  });
  await waitForElement(() => q('input[aria-label="プログラム名"]'), '成果の入力欄');
}

function setValue(el: HTMLInputElement | HTMLSelectElement, value: string): void {
  const proto = el instanceof window.HTMLSelectElement ? window.HTMLSelectElement.prototype : window.HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
  if (!setter) throw new Error('value setter not found');
  setter.call(el, value);
  el.dispatchEvent(new Event(el instanceof window.HTMLSelectElement ? 'change' : 'input', { bubbles: true }));
}

async function press(label: string): Promise<void> {
  const button = await waitForElement(
    () => Array.from(container.querySelectorAll('button')).find((b) => b.textContent?.includes(label)) ?? null,
    `ボタン「${label}」`,
  );
  await act(async () => {
    button.click();
  });
}

/** 入力欄から 1 件記録する (押した結果は呼び手が待つ)。 */
async function fillAndAdd(month: string, program: string, amount: string, status?: string): Promise<void> {
  await act(async () => {
    setValue(field('発生月'), month);
    setValue(field('プログラム名'), program);
    setValue(field('報酬額'), amount);
    if (status !== undefined) setValue(q<HTMLSelectElement>('select[aria-label="状態"]')!, status);
  });
  await press('＋ 成果を記録');
}

const stored = async (): Promise<A8netRewardEntry[]> =>
  (await getRecordStore().list<A8netRewardEntry>(A8NET_REWARDS_COLLECTION)).map((r) => r.data);

describe('A8.net —— 記録が無いとき', () => {
  it('見本を 1 件も出さず、案内を出す (合計のタイルも月の表も無い)', async () => {
    await mount();
    await waitForElement(() => q('[data-a8net-empty]'), '記録が無いときの案内');
    expect(q('[data-a8net-empty]')?.textContent).toBe(A8NET_EMPTY_NOTE);
    expect(text()).toContain('A8.net · 記録 0 件');
    expect(rewardRows()).toHaveLength(0);
    expect(q('[data-a8net-tile]')).toBeNull();
    // かつての同梱見本の文面は出ない (標本: 直す前の画面はこの 3 つを並べていた)。
    const OLD_SAMPLES = ['動画配信サービス 登録', 'クレジットカード発行', '格安SIM 申込'];
    for (const s of OLD_SAMPLES) expect(text()).not.toContain(s);
    expect('[確定] 動画配信サービス 登録 — ¥1,200').toContain(OLD_SAMPLES[0]);
  });
});

describe('A8.net —— 記録する・状態を変える・消す', () => {
  it('★ 記録した成果がそのまま合計になる (確定と未確定を分ける)', async () => {
    await mount();
    await fillAndAdd('2026-11', '自分の案件A', '1,200', 'confirmed');
    await waitForText(text, '自分の案件A');
    await fillAndAdd('2026-11', '自分の案件B', '3000', 'pending');
    await waitForText(text, '自分の案件B');

    await waitForText(text, 'A8.net · 確定 ¥1,200 / 未確定 ¥3,000');
    expect(tile('confirmed')).toBe('確定報酬¥1,2001 件');
    expect(tile('pending')).toBe('未確定報酬¥3,0001 件');
    expect(tile('rejected')).toBe('否認 (合計に入れない)¥00 件');
    expect(q('[data-a8net-month="2026-11"]')?.textContent).toBe('2026-11¥1,200¥3,000');
    expect(q('[data-a8net-empty]')).toBeNull();
    expect(await stored()).toEqual(
      expect.arrayContaining([
        { month: '2026-11', program: '自分の案件A', amount: 1200, status: 'confirmed' },
        { month: '2026-11', program: '自分の案件B', amount: 3000, status: 'pending' },
      ]),
    );
    expect(await stored()).toHaveLength(2);
    // 記録した後、プログラム名と報酬額の欄は空に戻り、発生月は残る。
    expect(field('プログラム名').value).toBe('');
    expect(field('報酬額').value).toBe('');
    expect(field('発生月').value).toBe('2026-11');
  });

  it('★ 一覧で状態を「確定」に変えると、未確定から確定へ金額が移る', async () => {
    await mount();
    await fillAndAdd('2026-10', '審査待ちの案件', '5000', 'pending');
    await waitForText(text, 'A8.net · 確定 ¥0 / 未確定 ¥5,000');

    const select = q<HTMLSelectElement>('select[aria-label="成果「審査待ちの案件」の状態を変更"]');
    expect(select?.value).toBe('pending');
    await act(async () => {
      setValue(select!, 'confirmed');
    });
    await waitForText(text, 'A8.net · 確定 ¥5,000 / 未確定 ¥0');
    expect(tile('confirmed')).toBe('確定報酬¥5,0001 件');
    expect(tile('pending')).toBe('未確定報酬¥00 件');
    expect(await stored()).toEqual([{ month: '2026-10', program: '審査待ちの案件', amount: 5000, status: 'confirmed' }]);
  });

  it('× で消すと一覧からも保管層からも消え、案内に戻る', async () => {
    await mount();
    await fillAndAdd('2026-11', '消す案件', '100', 'confirmed');
    await waitForText(text, '消す案件');
    const del = q<HTMLButtonElement>('button[aria-label="成果「消す案件」を削除"]');
    expect(del).not.toBeNull();
    await act(async () => {
      del!.click();
    });
    await waitForElement(() => q('[data-a8net-empty]'), '記録が無いときの案内');
    expect(rewardRows()).toHaveLength(0);
    expect(await stored()).toEqual([]);
  });

  it('入力の誤りは保存せずに理由を言い、入力を残す', async () => {
    await mount();
    await fillAndAdd('2026-11', '金額を入れ忘れた案件', '');
    await waitForElement(() => q('[data-a8net-error]'), '入力の断り');
    expect(q('[data-a8net-error]')?.textContent).toBe('報酬額が未入力です（0 円なら 0 と入力してください）');
    expect(field('プログラム名').value).toBe('金額を入れ忘れた案件');
    expect(await stored()).toEqual([]);

    // 直して押すと保存され、断りは消える。
    await act(async () => {
      setValue(field('報酬額'), '800');
    });
    await press('＋ 成果を記録');
    await waitForText(text, 'A8.net · 確定 ¥0 / 未確定 ¥800');
    expect(q('[data-a8net-error]')).toBeNull();
  });
});

describe('A8.net —— 保管層に読めない行が在るとき', () => {
  async function seed(rows: readonly Record<string, unknown>[]): Promise<void> {
    for (const r of rows) await getRecordStore().insert(A8NET_REWARDS_COLLECTION, r);
  }

  it('★ 読めない行は合計から外して件数を言い、一覧には出す (× で消せる)', async () => {
    await seed([
      { month: '2026-11', program: '読める案件', amount: 1000, status: 'confirmed' },
      { month: 'bad', program: '月が読めない案件', amount: 9_999_999, status: 'confirmed' },
    ]);
    await mount();
    await waitForText(text, '月が読めない案件');
    expect(text()).toContain('A8.net · 確定 ¥1,000 / 未確定 ¥0');
    expect(tile('confirmed')).toBe('確定報酬¥1,0001 件');
    expect(q('[data-a8net-unreadable]')?.textContent).toBe(
      '発生月・報酬額・状態のいずれかが読めない記録が 1 件あります。合計には入れていません。その行も下の一覧に出ています —— 一覧の × で消して、入れ直してください。',
    );
    expect(rewardRows()).toHaveLength(2);

    // 名指しした逃げ口 (一覧の ×) で実際に消せて、断りが消える。
    const del = q<HTMLButtonElement>('button[aria-label="成果「月が読めない案件」を削除"]');
    await act(async () => {
      del!.click();
    });
    await settleUntil(() => q('[data-a8net-unreadable]') === null, '読めない行の断りが消える');
    expect(rewardRows()).toHaveLength(1);
    await settleUntilAsync(async () => (await stored()).length === 1, '保管層から 1 件消える');
  });

  it('読める行が 1 件も無ければ、合計は ¥0 ではなく「—」', async () => {
    await seed([{ month: '2026-11', program: '状態が読めない案件', amount: 500, status: '確定' }]);
    await mount();
    await waitForText(text, '状態が読めない案件');
    expect(text()).toContain('A8.net · 記録 1 件');
    expect(tile('confirmed')).toBe('確定報酬—0 件');
    expect(tile('pending')).toBe('未確定報酬—0 件');
    // 状態の欄は「読めません」を出し、選び直せば読める行になる。
    const select = q<HTMLSelectElement>('select[aria-label="成果「状態が読めない案件」の状態を変更"]');
    expect(select?.value).toBe('');
    expect(select?.options[0]?.textContent).toBe('読めません');
    await act(async () => {
      setValue(select!, 'confirmed');
    });
    await waitForText(text, 'A8.net · 確定 ¥500 / 未確定 ¥0');
    expect(q('[data-a8net-unreadable]')).toBeNull();
  });

  it('欄が物・配列・長大な文字列の行でも画面は投げず、長い名前は天井で切る', async () => {
    await seed([
      { month: { z: 1 }, program: ['x'], amount: { a: 1 }, status: { s: 1 } },
      { month: '2026-11', program: 'あ'.repeat(200_000), amount: 100, status: 'confirmed' },
    ]);
    await mount();
    await settleUntil(() => rewardRows().length === 2, '2 行とも一覧に出る');
    expect(text().length).toBeLessThan(5_000);
    expect(text()).toContain(`${'あ'.repeat(60)}…`);
    expect(text()).toContain('A8.net · 確定 ¥100 / 未確定 ¥0');
  });
});
