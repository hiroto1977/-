/** @vitest-environment jsdom */
/**
 * **KPI / BEP の画面 —— 3 つの入力欄に名前が在り、記録したことを言い、消した行を戻せる。** (2026-11-20)
 *
 * 売上集計の画面 (`salesFormOnScreen.test.ts`) と同じ直し方を、KPI 実績・予算・貸借対照表の
 * 3 つの欄へ当てた。直す前:
 *   - 欄の名前は欄の中の薄い字だけ (打つと消える)。貸借対照表は 11 欄が名前なしで並ぶ
 *   - 期間は「YYYY-MM」、基準日は「基準日」と書かれた文字の欄 (形式は断られて初めて分かる)
 *   - 記録しても知らせは出ない
 *   - 「×」は押した瞬間に消え、戻す手は無い (実績は 7〜8 欄を打ち直す)
 *
 * 直した後:
 *   - 欄ごとに名前 (欄の上)。期間は月を選ぶ欄・基準日は日付を選ぶ欄・金額は数字のキーボード
 *   - 記録・保存すると、何を記録したかを 1 行で言う
 *   - 「×」の直後は「消しました: …」と「元に戻す」(直前の 1 件だけ)。実績と予算は、戻すときも
 *     追加と同じ判定を通す (同じ期・事業が入っていたら戻さずに言う —— 戻すと合算される)
 */
import 'fake-indexeddb/auto';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { SERVICES } from '../../services';
import { getRecordStore } from '../../data/store';
import { _resetCollectionSubscribersForTests } from '../../data/useCollection';
import { KPI_ACTUALS_COLLECTION, type KpiActual } from '../../data/kpiActuals';
import { KPI_BUDGETS_COLLECTION } from '../../data/budgetVariance';
import { BALANCE_SHEET_COLLECTION, type BalanceSheet } from '../../data/balanceSheet';
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

type Panel = 'actuals' | 'budgets' | 'bs';

let container: HTMLDivElement;
let root: Root | null = null;

beforeEach(async () => {
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
});

const text = (): string => (container.textContent ?? '').replace(/\s+/g, ' ');

const storedOf = async <T extends Record<string, unknown>>(collection: string): Promise<T[]> =>
  (await getRecordStore().list<T>(collection)).map((r) => r.data);

/** 画面を描く。`waitFor` を渡したら、その文が出るまで待つ (置いた記録が一覧に届いた印)。 */
async function mount(waitFor?: string): Promise<void> {
  const def = SERVICES.find((s) => s.id === 'kpi');
  if (!def) throw new Error('kpi service missing');
  root = createRoot(container);
  await act(async () => {
    root!.render(createElement(def.page));
  });
  await waitForElement(() => container.querySelector('[data-kpi-form="actuals"]'), '実績の入力欄');
  if (waitFor !== undefined) await waitForText(text, waitFor);
}

const form = (panel: Panel): Element => {
  const el = container.querySelector(`[data-kpi-form="${panel}"]`);
  if (!el) throw new Error(`入力欄 ${panel} が無い`);
  return el;
};

/** その欄の名前の並び (欄の上の文字)。 */
const labelsOf = (panel: Panel): string[] =>
  Array.from(form(panel).querySelectorAll('label')).map((l) => (l.querySelector('span')?.textContent ?? '').trim());

/** 名前から欄を引く (名前は `<label>` で欄を包む)。 */
function field(panel: Panel, label: string): HTMLInputElement {
  const hit = Array.from(form(panel).querySelectorAll('label')).find(
    (l) => (l.querySelector('span')?.textContent ?? '').trim() === label,
  );
  const control = hit?.querySelector('input');
  if (!control) throw new Error(`${panel}: 名前「${label}」の欄が無い (在るのは ${labelsOf(panel).join(' / ')})`);
  return control;
}

function typeInto(el: HTMLInputElement, value: string): void {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(el, value);
  el.dispatchEvent(new Event('input', { bubbles: true }));
}

function fill(panel: Panel, values: Readonly<Record<string, string>>): void {
  for (const [label, v] of Object.entries(values)) typeInto(field(panel, label), v);
}

function button(label: string): HTMLButtonElement {
  const all = Array.from(container.querySelectorAll('button'));
  const hit = all.find((b) => (b.textContent ?? '').trim() === label);
  if (!hit) throw new Error(`ボタン「${label}」が無い`);
  return hit;
}
async function press(label: string): Promise<void> {
  const b = button(label);
  await act(async () => {
    b.click();
  });
}

/** 一覧の表 (見出しで見分ける —— 実績と予算は 3 列目が違い、貸借対照表は 1 列目が「基準日」)。 */
function table(panel: Panel): HTMLTableElement | null {
  for (const t of Array.from(container.querySelectorAll('table'))) {
    const heads = Array.from(t.querySelectorAll('thead th')).map((th) => (th.textContent ?? '').trim());
    if (panel === 'actuals' && heads[0] === '期間' && heads[2] === '売上高') return t;
    if (panel === 'budgets' && heads[0] === '期間' && heads[2] === '売上高(予算)') return t;
    if (panel === 'bs' && heads[0] === '基準日' && heads[1] === '入力') return t;
  }
  return null;
}
const rowCount = (panel: Panel): number => table(panel)?.querySelectorAll('tbody tr').length ?? 0;

/** その一覧の 1 行目の「×」を押す。 */
async function pressRemove(panel: Panel): Promise<void> {
  const b = table(panel)?.querySelector<HTMLButtonElement>('tbody tr button[aria-label="削除"]');
  if (!b) throw new Error(`${panel}: 「×」が無い`);
  await act(async () => {
    b.click();
  });
}

const undoBar = (panel: Panel): Element | null => container.querySelector(`[data-undo-bar="${panel}"]`);
const barText = (panel: Panel): string => (undoBar(panel)?.querySelector('span')?.textContent ?? '').replace(/\s+/g, ' ');
const notice = (panel: Panel): string =>
  (container.querySelector(`[data-kpi-notice="${panel}"]`)?.textContent ?? '').replace(/\s+/g, ' ');

async function pressUndo(panel: Panel): Promise<void> {
  const b = undoBar(panel)?.querySelector('button');
  if (!b) throw new Error(`${panel}: 「元に戻す」が無い`);
  await act(async () => {
    b.click();
  });
}

const ACT: KpiActual = { period: '2026-10', unit: 'QQ事業', revenue: 1_000_000, cogs: 400_000, advertising: 50_000, sga: 200_000, depreciation: 10_000 };
const BS: BalanceSheet = { asOf: '2026-03-31', currentAssets: 1_000_000, fixedAssets: 500_000, currentLiabilities: 300_000, fixedLiabilities: 200_000, netIncome: 100_000 };
const ACT_FORM = { '期間 (月)': '2026-10', '事業名': 'QQ事業', '売上高 (円)': '1000000', '売上原価 (円)': '400000', '広告費 (円)': '50000', '販管費 (円)': '200000', '減価償却費 (円)': '10000' };
const YEN_1M = /[¥￥]1,000,000/;

describe('入力欄の名前と形', () => {
  it('★ 3 つの欄とも、どの入力も名前を持つ (欄の上に出る)', async () => {
    await mount();
    expect(labelsOf('actuals')).toEqual(['期間 (月)', '事業名', '売上高 (円)', '売上原価 (円)', '広告費 (円)', '販管費 (円)', '減価償却費 (円)', '人件費 (円・任意)']);
    expect(labelsOf('budgets')).toEqual(['期間 (月)', '事業名', '売上高の予算 (円)', '売上原価 (円)', '広告費 (円)', '販管費 (円)', '減価償却費 (円)']);
    expect(labelsOf('bs')).toEqual([
      '基準日', '流動資産 (円)', 'うち現預金 (円)', 'うち棚卸資産 (円)', 'うち売上債権 (円)', '固定資産 (円)',
      '流動負債 (円)', 'うち仕入債務 (円)', '固定負債 (円)', 'うち有利子負債 (円)', '当期純利益 (円・赤字は −)',
    ]);
    // 名前の無い入力が 1 つも無い (入力の数 = 名前の数)。
    for (const p of ['actuals', 'budgets', 'bs'] as const) {
      expect(form(p).querySelectorAll('input').length, p).toBe(labelsOf(p).length);
      expect(labelsOf(p).every((l) => l !== ''), p).toBe(true);
    }
  });

  it('★ 期間は月を選ぶ欄・基準日は日付を選ぶ欄・金額は数字のキーボードを出す', async () => {
    await mount();
    expect(field('actuals', '期間 (月)').type).toBe('month');
    expect(field('budgets', '期間 (月)').type).toBe('month');
    expect(field('bs', '基準日').type).toBe('date');
    expect(field('actuals', '売上高 (円)').getAttribute('inputmode')).toBe('numeric');
    expect(field('budgets', '売上高の予算 (円)').getAttribute('inputmode')).toBe('numeric');
    expect(field('bs', '流動資産 (円)').getAttribute('inputmode')).toBe('numeric');
    // 事業名は文字の欄 (数字のキーボードにしない)。
    expect(field('actuals', '事業名').hasAttribute('inputmode')).toBe(false);
    // 当期純利益は赤字 (−) が入るので、数字だけのキーボードにしない。
    expect(field('bs', '当期純利益 (円・赤字は −)').hasAttribute('inputmode')).toBe(false);
  });

  it('★ 月・基準日が空なら、形式の話をせずに「選んでください」と言い、何も保存しない', async () => {
    await mount();
    await press('追加');
    await waitForText(text, '期間 (月) を選んでください。');
    await press('予算を追加');
    await settleUntil(() => text().split('期間 (月) を選んでください。').length - 1 === 2, '予算の欄も同じ文を出す');
    await press('BS を保存');
    await waitForText(text, '基準日を選んでください。');
    expect(await storedOf(KPI_ACTUALS_COLLECTION)).toEqual([]);
    expect(await storedOf(KPI_BUDGETS_COLLECTION)).toEqual([]);
    expect(await storedOf(BALANCE_SHEET_COLLECTION)).toEqual([]);
  });
});

describe('記録した知らせ', () => {
  it('★ 実績を追加すると、何を記録したかを 1 行で言い、欄は空に戻る', async () => {
    await mount();
    fill('actuals', ACT_FORM);
    await press('追加');
    await settleUntil(() => notice('actuals') !== '', '実績の知らせ');
    expect(notice('actuals')).toMatch(/^記録しました: 2026-10 · QQ事業 · 売上高 [¥￥]1,000,000$/);
    expect(await storedOf<KpiActual>(KPI_ACTUALS_COLLECTION)).toEqual([ACT]);
    expect(field('actuals', '売上高 (円)').value).toBe('');
    expect(field('actuals', '事業名').value).toBe('');
  });

  it('★ 予算を追加すると「予算を記録しました」と言う (実績の欄の知らせは出ない)', async () => {
    await mount();
    fill('budgets', { '期間 (月)': '2026-10', '事業名': 'QQ事業', '売上高の予算 (円)': '1000000', '売上原価 (円)': '0', '広告費 (円)': '0', '販管費 (円)': '0', '減価償却費 (円)': '0' });
    await press('予算を追加');
    await settleUntil(() => notice('budgets') !== '', '予算の知らせ');
    expect(notice('budgets')).toMatch(/^予算を記録しました: 2026-10 · QQ事業 · 売上高 [¥￥]1,000,000$/);
    expect(notice('actuals')).toBe('');
    expect(await storedOf(KPI_BUDGETS_COLLECTION)).toHaveLength(1);
  });

  it('★ 貸借対照表を保存すると、基準日つきで「保存しました」と言う', async () => {
    await mount();
    fill('bs', { '基準日': '2026-03-31', '流動資産 (円)': '1000000', '固定資産 (円)': '500000', '流動負債 (円)': '300000', '固定負債 (円)': '200000', '当期純利益 (円・赤字は −)': '-100000' });
    await press('BS を保存');
    await settleUntil(() => notice('bs') !== '', '貸借対照表の知らせ');
    expect(notice('bs')).toBe('保存しました: 基準日 2026-03-31');
    const saved = await storedOf<BalanceSheet>(BALANCE_SHEET_COLLECTION);
    expect(saved).toHaveLength(1);
    // 赤字 (−) はそのまま入る。
    expect(saved[0]?.netIncome).toBe(-100_000);
  });

  it('★ 断られたとき (同じ期・事業が既に在る) は「記録しました」と言わない', async () => {
    await getRecordStore().insert(KPI_ACTUALS_COLLECTION, ACT);
    await mount('QQ事業');
    fill('actuals', ACT_FORM);
    await press('追加');
    await waitForText(text, '既に入力されています');
    expect(notice('actuals')).toBe('');
    expect(await storedOf(KPI_ACTUALS_COLLECTION)).toHaveLength(1);
  });
});

describe('消した行を元に戻す', () => {
  it('★ 実績: 「×」の直後に「消しました」と「元に戻す」が出て、押すと同じ中身で戻る', async () => {
    await getRecordStore().insert(KPI_ACTUALS_COLLECTION, ACT);
    await mount('QQ事業');
    await pressRemove('actuals');
    await waitForElement(() => undoBar('actuals'), '実績の「元に戻す」');
    expect(barText('actuals')).toMatch(/^消しました: 2026-10 · QQ事業 · 売上高 [¥￥]1,000,000$/);
    expect(await storedOf(KPI_ACTUALS_COLLECTION)).toEqual([]);
    await pressUndo('actuals');
    await settleUntil(() => notice('actuals') !== '', '戻した知らせ');
    expect(notice('actuals')).toMatch(/^元に戻しました: 2026-10 · QQ事業 · 売上高 /);
    expect(notice('actuals')).toMatch(YEN_1M);
    expect(await storedOf<KpiActual>(KPI_ACTUALS_COLLECTION)).toEqual([ACT]);
    expect(undoBar('actuals')).toBeNull();
    expect(rowCount('actuals')).toBe(1);
  });

  it('★ 実績: 消した後に同じ期・事業が入っていたら、戻さずに言う (戻すと合算される)', async () => {
    await getRecordStore().insert(KPI_ACTUALS_COLLECTION, ACT);
    await mount('QQ事業');
    await pressRemove('actuals');
    await waitForElement(() => undoBar('actuals'), '実績の「元に戻す」');
    // 別の画面が同じ期・事業の実績を入れた。
    const other: KpiActual = { ...ACT, revenue: 2_000_000 };
    await act(async () => {
      await getRecordStore().insert(KPI_ACTUALS_COLLECTION, other);
    });
    await pressUndo('actuals');
    await waitForText(text, '既に入力されています');
    expect(await storedOf<KpiActual>(KPI_ACTUALS_COLLECTION)).toEqual([other]);
    expect(undoBar('actuals')).toBeNull();
    expect(notice('actuals')).toBe('');
  });

  it('★ 予算: 「×」→「元に戻す」で同じ中身が戻る (実績の一覧には触らない)', async () => {
    await getRecordStore().insert(KPI_BUDGETS_COLLECTION, ACT);
    await mount('QQ事業');
    await pressRemove('budgets');
    await waitForElement(() => undoBar('budgets'), '予算の「元に戻す」');
    expect(undoBar('actuals')).toBeNull();
    expect(await storedOf(KPI_BUDGETS_COLLECTION)).toEqual([]);
    await pressUndo('budgets');
    await settleUntil(() => notice('budgets') !== '', '戻した知らせ');
    expect(await storedOf<KpiActual>(KPI_BUDGETS_COLLECTION)).toEqual([ACT]);
    expect(await storedOf(KPI_ACTUALS_COLLECTION)).toEqual([]);
    expect(undoBar('budgets')).toBeNull();
  });

  it('★ 貸借対照表: 「×」→「元に戻す」で同じ控えが戻る', async () => {
    await getRecordStore().insert(BALANCE_SHEET_COLLECTION, BS);
    await mount('2026-03-31');
    await pressRemove('bs');
    await waitForElement(() => undoBar('bs'), '貸借対照表の「元に戻す」');
    expect(barText('bs')).toBe('消しました: 基準日 2026-03-31');
    expect(await storedOf(BALANCE_SHEET_COLLECTION)).toEqual([]);
    await pressUndo('bs');
    await settleUntil(() => notice('bs') !== '', '戻した知らせ');
    expect(notice('bs')).toBe('元に戻しました: 基準日 2026-03-31');
    expect(await storedOf<BalanceSheet>(BALANCE_SHEET_COLLECTION)).toEqual([BS]);
    expect(undoBar('bs')).toBeNull();
  });

  it('★ 「元に戻す」を続けて 2 度押しても、戻るのは 1 件', async () => {
    await getRecordStore().insert(KPI_ACTUALS_COLLECTION, ACT);
    await mount('QQ事業');
    await pressRemove('actuals');
    const bar = await waitForElement(() => undoBar('actuals'), '実績の「元に戻す」');
    const b = bar.querySelector('button')!;
    await act(async () => {
      b.click();
      b.click();
    });
    await settleUntil(() => notice('actuals') !== '', '戻した知らせ');
    await settleUntilAsync(async () => (await storedOf(KPI_ACTUALS_COLLECTION)).length >= 1, '1 件戻る');
    expect(await storedOf(KPI_ACTUALS_COLLECTION)).toHaveLength(1);
    expect(rowCount('actuals')).toBe(1);
  });

  it('★ 次に記録したら「元に戻す」は消える (戻せるのは直前の 1 件だけ)', async () => {
    await getRecordStore().insert(KPI_ACTUALS_COLLECTION, ACT);
    await mount('QQ事業');
    await pressRemove('actuals');
    await waitForElement(() => undoBar('actuals'), '実績の「元に戻す」');
    fill('actuals', { ...ACT_FORM, '期間 (月)': '2026-11' });
    await press('追加');
    await settleUntil(() => notice('actuals') !== '', '記録した知らせ');
    expect(undoBar('actuals')).toBeNull();
    expect((await storedOf<KpiActual>(KPI_ACTUALS_COLLECTION)).map((r) => r.period)).toEqual(['2026-11']);
  });

  it('★ 入力が断られただけでは「元に戻す」は消えない', async () => {
    await getRecordStore().insert(KPI_ACTUALS_COLLECTION, ACT);
    await mount('QQ事業');
    await pressRemove('actuals');
    await waitForElement(() => undoBar('actuals'), '実績の「元に戻す」');
    await press('追加'); // 月が空
    await waitForText(text, '期間 (月) を選んでください。');
    expect(undoBar('actuals')).not.toBeNull();
  });

  it('★ 消せなかったとき (保存先が断った) は「元に戻す」を出さない', async () => {
    await getRecordStore().insert(KPI_ACTUALS_COLLECTION, ACT);
    await mount('QQ事業');
    const quota = Object.assign(new Error('quota'), { name: 'QuotaExceededError' });
    const spy = vi.spyOn(getRecordStore(), 'remove').mockRejectedValue(quota);
    await pressRemove('actuals');
    await settleUntil(() => spy.mock.calls.length >= 1, '削除が呼ばれる');
    // 断られた後の描き直しを待つ (行は残る)。
    await settleUntil(() => rowCount('actuals') === 1, '行は残る');
    expect(undoBar('actuals')).toBeNull();
    expect(await storedOf(KPI_ACTUALS_COLLECTION)).toHaveLength(1);
  });

  it('★ 一覧が読めないときは、戻さずに言い、「元に戻す」は残る (読めたら押し直せる)', async () => {
    await getRecordStore().insert(KPI_ACTUALS_COLLECTION, ACT);
    await mount('QQ事業');
    await pressRemove('actuals');
    await waitForElement(() => undoBar('actuals'), '実績の「元に戻す」');
    vi.spyOn(getRecordStore(), 'list').mockRejectedValueOnce(new Error('unreadable'));
    await pressUndo('actuals');
    await waitForText(text, 'KPI 実績の一覧');
    expect(undoBar('actuals')).not.toBeNull();
    expect(await storedOf(KPI_ACTUALS_COLLECTION)).toEqual([]);
    // 読めるようになったら、もう一度押して戻せる。
    await pressUndo('actuals');
    await settleUntil(() => notice('actuals') !== '', '戻した知らせ');
    expect(await storedOf<KpiActual>(KPI_ACTUALS_COLLECTION)).toEqual([ACT]);
  });

  it('★ 極端に長い事業名の行を消しても、知らせは天井に収まる。戻る中身は切らない', async () => {
    const long = 'x'.repeat(200_000);
    const row = { ...ACT, unit: long };
    await getRecordStore().insert(KPI_ACTUALS_COLLECTION, row);
    await mount('2026-10');
    await pressRemove('actuals');
    await waitForElement(() => undoBar('actuals'), '実績の「元に戻す」');
    expect(barText('actuals').length).toBeLessThan(400);
    expect(barText('actuals')).toContain('…');
    await pressUndo('actuals');
    await settleUntil(() => notice('actuals') !== '', '戻した知らせ');
    expect(notice('actuals').length).toBeLessThan(400);
    const back = await storedOf<KpiActual>(KPI_ACTUALS_COLLECTION);
    expect(back).toHaveLength(1);
    expect(back[0]?.unit).toBe(long);
  });

  it('★ 極端に長い基準日の控えを消しても、知らせと画面は天井に収まる', async () => {
    const long = '9'.repeat(200_000);
    await getRecordStore().insert(BALANCE_SHEET_COLLECTION, { ...BS, asOf: long });
    await mount();
    await settleUntil(() => rowCount('bs') === 1, '控えが一覧に出る');
    expect(text().length, '一覧の基準日が天井を通っていない').toBeLessThan(20_000);
    await pressRemove('bs');
    await waitForElement(() => undoBar('bs'), '貸借対照表の「元に戻す」');
    expect(barText('bs').length).toBeLessThan(400);
    expect(barText('bs')).toContain('…');
    expect(text().length).toBeLessThan(20_000);
  });

  it('★ 期・事業名・金額が読めない行を消したときは、読めないことをそのまま言う (投げない)', async () => {
    const broken = { ...ACT, period: { a: 1 }, unit: 42, revenue: '1000' } as unknown as KpiActual;
    await getRecordStore().insert(KPI_ACTUALS_COLLECTION, broken);
    await mount();
    await settleUntil(() => rowCount('actuals') === 1, '読めない行も一覧に出る');
    await pressRemove('actuals');
    await waitForElement(() => undoBar('actuals'), '実績の「元に戻す」');
    expect(barText('actuals')).toBe('消しました: 期間不明 · 事業名なし · 売上高 —');
  });
});
