/** @vitest-environment jsdom */
/**
 * **売上集計の画面 —— 欄に見出しが在り、今月の売上が出て、行を直せる。** (2026-11-20)
 *
 * 利用者のスクリーンショット (スマホ幅) では、日付の欄は「YYYY-MM-DD」と書かれた文字の欄で、
 * 欄の名前は欄の中の薄い字だけ、案内は「チャネル横断」「ローカル (IndexedDB)」「列: date, channel, …」だった。
 * 打ち間違えた行は消して入れ直すほか無かった。
 *
 * 直した後:
 *   - 欄は見出しを持つ (日付 / 販売先 / 売上金額 (円) / 注文の数 (件) / メモ)。日付は選ぶ欄で、今日から始まる
 *   - 記録すると、何を記録したかを 1 行で言う
 *   - 「今月の売上」を先頭に出す。今月の記録が無ければ「—」と理由 (0 円とは言わない)
 *   - 月ごとの推移に前月比を出す (暦の 1 つ前の月と比べる。その月の記録が無ければ「—」)
 *   - 明細の行に「直す」が在る。別の画面で書き換えられていた・消されていたときは、書かずに言って入力を残す
 */
import 'fake-indexeddb/auto';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { SalesPage } from '../SalesPage';
import { getRecordStore } from '../../data/store';
import { _resetCollectionSubscribersForTests } from '../../data/useCollection';
import { SALES_COLLECTION, type SalesEntry } from '../../data/sales';
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

/** 今日 (画面の「今月」と日付の初期値はここから決まる)。日付だけを固定し、タイマーは本物のまま。 */
const TODAY = new Date(2026, 10, 18, 12, 0, 0); // 2026-11-18 (端末の時刻)

let container: HTMLDivElement;
let root: Root | null = null;

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(TODAY);
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
  vi.useRealTimers();
});

const text = (): string => (container.textContent ?? '').replace(/\s+/g, ' ');

async function seed(rows: readonly SalesEntry[]): Promise<void> {
  for (const r of rows) await getRecordStore().insert(SALES_COLLECTION, r);
}
const stored = async (): Promise<SalesEntry[]> =>
  (await getRecordStore().list<SalesEntry>(SALES_COLLECTION)).map((r) => r.data);

/** 画面を描く。`waitFor` を渡したら、その文が出るまで待つ (置いた記録が届いた印)。 */
async function mount(waitFor?: string): Promise<void> {
  root = createRoot(container);
  await act(async () => {
    root!.render(createElement(SalesPage));
  });
  if (waitFor !== undefined) await waitForText(text, waitFor);
  else await waitForElement(() => container.querySelector('[data-sales-form]'), '入力欄');
}

/** 見出しの文から欄を引く (見出しは `<label>` で欄を包む)。 */
function field(label: string): HTMLInputElement | HTMLSelectElement {
  const hit = Array.from(container.querySelectorAll('[data-sales-form] label')).find(
    (l) => (l.querySelector('span')?.textContent ?? '').trim() === label,
  );
  const control = hit?.querySelector('input, select');
  if (!control) throw new Error(`見出し「${label}」の欄が無い`);
  return control as HTMLInputElement | HTMLSelectElement;
}

function typeInto(el: HTMLInputElement | HTMLSelectElement, value: string): void {
  const proto = el instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, 'value')!.set!.call(el, value);
  el.dispatchEvent(new Event(el instanceof HTMLSelectElement ? 'change' : 'input', { bubbles: true }));
}

const buttons = (): HTMLButtonElement[] => Array.from(container.querySelectorAll('button'));
const labels = (): string[] => buttons().map((b) => (b.textContent ?? '').trim());
function button(label: string): HTMLButtonElement {
  const hit = buttons().find((b) => (b.textContent ?? '').trim() === label);
  if (!hit) throw new Error(`ボタン「${label}」が無い (在るのは ${labels().join(' / ')})`);
  return hit;
}
async function press(label: string): Promise<void> {
  const b = button(label);
  await act(async () => {
    b.click();
  });
}

/** タイルの値と添え書きを、構造で引く (見出しの div → 値の div → 添え書きの div)。 */
function tile(labelStartsWith: string): { label: string; value: string; sub: string } | null {
  for (const el of Array.from(container.querySelectorAll('div'))) {
    const first = el.firstElementChild;
    // 見出しの div は子要素を持たない (タイルを並べる外側の箱を見出しと取り違えない)。
    if (first === null || el.children.length < 2 || first.children.length > 0) continue;
    const label = (first.textContent ?? '').trim();
    if (!label.startsWith(labelStartsWith)) continue;
    return {
      label,
      value: (el.children[1]?.textContent ?? '').trim(),
      sub: (el.children[2]?.textContent ?? '').trim(),
    };
  }
  return null;
}

const NOV: SalesEntry = { date: '2026-11-02', channel: 'amazon', amount: 31_000, orders: 4, note: 'まとめ買い' };
const OCT: SalesEntry = { date: '2026-10-03', channel: 'base', amount: 12_000, orders: 3 };
const AUG: SalesEntry = { date: '2026-08-20', channel: 'shopify', amount: 24_000, orders: 2 };

describe('入力欄', () => {
  it('★ どの欄も見出しを持つ。日付は選ぶ欄で今日から始まり、金額と件数は数字のキーボードを出す', async () => {
    await mount();
    const date = field('日付') as HTMLInputElement;
    expect(date.type).toBe('date');
    expect(date.value).toBe('2026-11-18');
    expect(field('販売先').tagName).toBe('SELECT');
    expect((field('売上金額 (円)') as HTMLInputElement).inputMode).toBe('numeric');
    expect((field('注文の数 (件)') as HTMLInputElement).inputMode).toBe('numeric');
    expect(field('メモ').tagName).toBe('INPUT');
    expect(labels()).toContain('追加');
    expect(labels()).not.toContain('更新');
    expect(labels()).not.toContain('やめる');
  });

  it('記録が無い間の案内は、内部の言葉 (IndexedDB・チャネル横断・列の英字の並び) を出さない', async () => {
    await mount();
    const empty = await waitForElement(() => container.querySelector('[data-sales-empty]'), '記録が無いときの案内');
    expect(empty.textContent).toContain('まだ記録がありません');
    const t = text();
    for (const word of ['IndexedDB', 'チャネル横断', 'ローカル保存', '列: date']) expect(t, word).not.toContain(word);
    // 標本: 言葉の針は、直す前の文に当たる (空の主張にしない)。
    const before = '売上を記録 — チャネル横断 (ローカル保存) データはこの端末のローカル (IndexedDB) に保存されます。 列: date, channel, amount, orders, note';
    for (const word of ['IndexedDB', 'チャネル横断', 'ローカル保存', '列: date']) expect(before).toContain(word);
  });

  it('★ 記録すると、何を記録したかを 1 行で言う。金額・件数・メモの欄は空に戻り、日付と販売先は残る', async () => {
    await mount();
    typeInto(field('販売先'), 'base');
    typeInto(field('売上金額 (円)'), '23,000');
    typeInto(field('注文の数 (件)'), '5');
    typeInto(field('メモ'), 'まとめ買い');
    await press('追加');
    const notice = await waitForElement(() => container.querySelector('[data-sales-notice]'), '記録した知らせ');
    expect(notice.textContent).toBe('記録しました: 2026-11-18 · BASE · ￥23,000');
    expect(await stored()).toEqual([{ date: '2026-11-18', channel: 'base', amount: 23_000, orders: 5, note: 'まとめ買い' }]);
    expect((field('売上金額 (円)') as HTMLInputElement).value).toBe('');
    expect((field('注文の数 (件)') as HTMLInputElement).value).toBe('');
    expect((field('メモ') as HTMLInputElement).value).toBe('');
    expect((field('日付') as HTMLInputElement).value).toBe('2026-11-18');
    expect((field('販売先') as HTMLSelectElement).value).toBe('base');
  });

  it('対照: 金額が空なら断り、記録しない (知らせも出さない)', async () => {
    await mount();
    typeInto(field('注文の数 (件)'), '1');
    await press('追加');
    await waitForText(text, '売上金額が未入力です');
    expect(await stored()).toEqual([]);
    expect(container.querySelector('[data-sales-notice]')).toBeNull();
  });
});

describe('今月の売上', () => {
  it('★ 今月も先月も記録が在れば、今月の額・先月の額・先月比を出す', async () => {
    await seed([NOV, OCT]);
    await mount('￥31,000');
    expect(tile('今月の売上')).toEqual({
      label: '今月の売上 (2026年11月)',
      value: '￥31,000',
      sub: '先月 ￥12,000 ・ 先月比 +158%',
    });
  });

  it('★ 今月の記録が無ければ「—」と理由を出す (0 円とは言わない)', async () => {
    await seed([OCT]);
    await mount('￥12,000');
    const t = tile('今月の売上');
    expect(t?.value).toBe('—');
    expect(t?.sub).toBe('今月の記録はまだありません');
    expect(t?.value).not.toBe('￥0');
  });

  it('★ 先月の記録が無ければ、先月比を作らずにそう言う (2 か月前と比べない)', async () => {
    await seed([NOV, AUG]);
    await mount('￥31,000');
    expect(tile('今月の売上')).toEqual({
      label: '今月の売上 (2026年11月)',
      value: '￥31,000',
      sub: '先月の記録はありません',
    });
  });

  it('対照: 全期間の合計のタイルは今までどおり出る', async () => {
    await seed([NOV, OCT]);
    await mount('￥43,000');
    expect(tile('総売上')?.value).toBe('￥43,000');
    expect(tile('総注文件数')?.value).toBe('7');
    expect(tile('販売先の数')?.value).toBe('2');
  });
});

describe('月ごとの推移', () => {
  it('★ 月の呼び名・額・前月比を並べる。前の月の記録が無い行の前月比は「—」', async () => {
    await seed([NOV, OCT, AUG]);
    await mount('2026年8月');
    const rows = Array.from(container.querySelectorAll('[data-sales-trend] tbody tr')).map((tr) =>
      Array.from(tr.querySelectorAll('td')).map((td) => (td.textContent ?? '').trim()),
    );
    expect(rows).toEqual([
      ['2026年11月', '', '￥31,000', '+158%'],
      ['2026年10月', '', '￥12,000', '—'],
      ['2026年8月', '', '￥24,000', '—'],
    ]);
  });

  it('棒の長さは、いちばん売れた月を 100% とする', async () => {
    await seed([NOV, OCT]);
    await mount('2026年10月');
    const widths = Array.from(container.querySelectorAll<HTMLElement>('[data-sales-trend] tbody tr td:nth-child(2) > div > div')).map(
      (d) => Number.parseFloat(d.style.width),
    );
    expect(widths[0]).toBe(100);
    expect(widths[1]).toBeCloseTo((12_000 / 31_000) * 100, 3);
  });
});

describe('明細の行を直す', () => {
  it('明細のメモは販売先の下に出る (列にしない)', async () => {
    await seed([NOV]);
    await mount('まとめ買い');
    const note = container.querySelector('[data-sales-note]');
    expect(note?.textContent).toBe('まとめ買い');
    expect(note?.closest('td')?.textContent).toContain('Amazon');
  });

  it('★ 「直す」を押すと、その行が欄に入り、ボタンが「更新」と「やめる」になる', async () => {
    await seed([NOV]);
    await mount('まとめ買い');
    await press('直す');
    await settleUntil(() => labels().includes('更新'), '「更新」が出る');
    expect((field('日付') as HTMLInputElement).value).toBe('2026-11-02');
    expect((field('販売先') as HTMLSelectElement).value).toBe('amazon');
    expect((field('売上金額 (円)') as HTMLInputElement).value).toBe('31000');
    expect((field('注文の数 (件)') as HTMLInputElement).value).toBe('4');
    expect((field('メモ') as HTMLInputElement).value).toBe('まとめ買い');
    expect(labels()).toContain('やめる');
    expect(labels()).not.toContain('追加');
    expect(text()).toContain('記録を直す');
  });

  it('★ 直して「更新」を押すと、同じ行が書き換わる (行は増えない)。何を直したかを言い、ボタンは「追加」へ戻る', async () => {
    await seed([NOV]);
    await mount('まとめ買い');
    await press('直す');
    await settleUntil(() => labels().includes('更新'), '「更新」が出る');
    typeInto(field('売上金額 (円)'), '35000');
    typeInto(field('販売先'), 'rakuten');
    await press('更新');
    const notice = await waitForElement(() => container.querySelector('[data-sales-notice]'), '直した知らせ');
    expect(notice.textContent).toBe('直しました: 2026-11-02 · 楽天市場 · ￥35,000');
    expect(await stored()).toEqual([{ date: '2026-11-02', channel: 'rakuten', amount: 35_000, orders: 4, note: 'まとめ買い' }]);
    expect(labels()).toContain('追加');
    expect(labels()).not.toContain('更新');
    expect(labels()).not.toContain('やめる');
    expect(text()).toContain('売上を記録する');
  });

  it('★ メモを消して更新すると、メモが消える (重ね書きで古いメモが残らない)', async () => {
    await seed([NOV]);
    await mount('まとめ買い');
    await press('直す');
    await settleUntil(() => labels().includes('更新'), '「更新」が出る');
    typeInto(field('メモ'), '');
    await press('更新');
    await waitForElement(() => container.querySelector('[data-sales-notice]'), '直した知らせ');
    const rows = await stored();
    expect(rows).toHaveLength(1);
    expect(rows[0]!.note).toBe('');
    expect(container.querySelector('[data-sales-note]')?.textContent).toBe('');
    expect(text()).not.toContain('まとめ買い');
  });

  it('対照: メモが元から無い行を直しても、メモの欄を作らない', async () => {
    await seed([OCT]);
    await mount('￥12,000');
    await press('直す');
    await settleUntil(() => labels().includes('更新'), '「更新」が出る');
    typeInto(field('売上金額 (円)'), '13000');
    await press('更新');
    await waitForElement(() => container.querySelector('[data-sales-notice]'), '直した知らせ');
    expect(await stored()).toEqual([{ date: '2026-10-03', channel: 'base', amount: 13_000, orders: 3 }]);
  });

  it('★ 「やめる」を押すと、何も書かずに欄が空へ戻る (日付は今日・販売先は残る)', async () => {
    await seed([NOV]);
    await mount('まとめ買い');
    await press('直す');
    await settleUntil(() => labels().includes('更新'), '「更新」が出る');
    typeInto(field('売上金額 (円)'), '99999');
    await press('やめる');
    await settleUntil(() => labels().includes('追加'), '「追加」へ戻る');
    expect(await stored()).toEqual([NOV]);
    expect((field('売上金額 (円)') as HTMLInputElement).value).toBe('');
    expect((field('メモ') as HTMLInputElement).value).toBe('');
    expect((field('日付') as HTMLInputElement).value).toBe('2026-11-18');
    expect((field('販売先') as HTMLSelectElement).value).toBe('amazon');
    expect(labels()).not.toContain('やめる');
  });

  it('★ 直している間に別の画面で書き換えられていたら、書かずに言い、入力を残す。もう一度押すと上書きする', async () => {
    await seed([NOV]);
    await mount('まとめ買い');
    await press('直す');
    await settleUntil(() => labels().includes('更新'), '「更新」が出る');
    typeInto(field('売上金額 (円)'), '35000');
    // 別の画面の書き込み (この画面の入力欄は開いたまま)。
    const [row] = await getRecordStore().list<SalesEntry>(SALES_COLLECTION);
    await act(async () => {
      await getRecordStore().update<SalesEntry>(row!.id, { orders: 9 });
    });
    await press('更新');
    await waitForText(text, '保存していません');
    expect(text()).toContain('直していた記録は、編集を始めた後に別の画面で書き換えられています');
    expect(text()).toContain('もう一度「更新」を押してください');
    expect(text()).toContain('一覧の「直す」を押してください');
    expect((await stored())[0]).toMatchObject({ amount: 31_000, orders: 9 }); // 書いていない
    expect((field('売上金額 (円)') as HTMLInputElement).value).toBe('35000'); // 入力は残る
    expect(labels()).toContain('更新'); // 直す相手は外れていない
    expect(container.querySelector('[data-sales-notice]')).toBeNull();

    await press('更新'); // 知ったうえで上書き
    await waitForElement(() => container.querySelector('[data-sales-notice]'), '直した知らせ');
    expect((await stored())[0]).toMatchObject({ amount: 35_000, orders: 4 });
  });

  it('★ 直している間に別の画面で消されていたら、作り直さずに言い、入力を残す。ボタンは「追加」へ戻る', async () => {
    await seed([NOV]);
    await mount('まとめ買い');
    await press('直す');
    await settleUntil(() => labels().includes('更新'), '「更新」が出る');
    typeInto(field('売上金額 (円)'), '35000');
    const [row] = await getRecordStore().list<SalesEntry>(SALES_COLLECTION);
    await act(async () => {
      await getRecordStore().remove(row!.id);
    });
    await press('更新');
    await waitForText(text, '既に一覧にありません');
    expect(text()).toContain('新しい記録として入れるなら「追加」を押してください');
    expect(await stored()).toEqual([]); // 黙って作り直さない
    expect((field('売上金額 (円)') as HTMLInputElement).value).toBe('35000');
    await settleUntil(() => labels().includes('追加'), '「追加」へ戻る');
    expect(labels()).not.toContain('更新');
    expect(container.querySelector('[data-sales-notice]')).toBeNull();
  });

  it('対照: 「×」は今までどおり、その行だけを消す', async () => {
    await seed([NOV, OCT]);
    await mount('￥43,000');
    const del = buttons().filter((b) => b.getAttribute('aria-label') === '削除');
    expect(del).toHaveLength(2);
    await act(async () => {
      del[0]!.click();
    });
    await settleUntilAsync(async () => (await stored()).length === 1, '1 行だけ残る');
    expect(labels().filter((l) => l === '直す')).toHaveLength(1);
  });
});
