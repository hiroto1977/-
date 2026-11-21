/** @vitest-environment jsdom */
/**
 * **同じ期・同じ事業の KPI 実績を 2 件にしない。** (2026-09-09 · パス 124)
 *
 * 実績は (期間, 事業) が 1 件の単位だが、KPI の画面は同じ組を 2 度入れても断らず、
 * `summarizeFundamentals` / `groupRevenueByPeriod` は**合算**する。実績には「編集」が無く
 * 訂正は入れ直しなので、2026-04 の売上を訂正した利用者は **旧 + 新の合計**を
 * 経営サマリー・経営スコアカード・着地見込み・金融機関等提出用の書面 §1 に見ることになる。
 *
 * ここは実物の画面で 3 面を読む: 同じ組の追加は断られ件数が増えない (訂正の案内つき)・
 * 既に重複が在れば一覧の上に警告が出る・別の事業なら通る (対照)。
 */
import 'fake-indexeddb/auto';
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { SERVICES } from '../../services';
import { _resetRecordStoreForTests, getRecordStore } from '../../data/store';
import { _resetCollectionSubscribersForTests } from '../../data/useCollection';
import { KPI_ACTUALS_COLLECTION, type KpiActual } from '../../data/kpiActuals';
import { settleUntil, waitForElement, waitForText } from '../../__tests__/jsdomWait';

let container: HTMLDivElement;
let root: Root | null = null;

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

/**
 * 実績一覧の行 (見出しが「期間 / 事業 / 売上高」の表)。
 *
 * **予算の表と取り違えない** —— こちらの 3 列目は `売上高(予算)` である
 * (数え上げの取り違えはパス 61 で実際にやった間違い)。
 */
function actualRows(): string[][] {
  for (const table of Array.from(container.querySelectorAll('table'))) {
    const heads = Array.from(table.querySelectorAll('thead th')).map((th) => (th.textContent ?? '').trim());
    if (heads[0] !== '期間' || heads[1] !== '事業' || heads[2] !== '売上高') continue;
    return Array.from(table.querySelectorAll('tbody tr')).map((tr) =>
      Array.from(tr.querySelectorAll('td')).map((td) => (td.textContent ?? '').trim()),
    );
  }
  return [];
}

/**
 * 実績が `n` 行になるまで**条件で**待って描く (2026-09-21 · パス 378)。
 *
 * ここは 2026-09-21 まで固定 8 周の `settle()` だった —— 周回数を 0 にすると
 * 警告の `[role="alert"]` も `[data-unreadable-periods]` も掴めずに落ちる
 * (`npm run audit:tick-sensitivity` の実測)。画面の後ろに在るのは
 * IndexedDB の往復で、**空いている機械では間に合い、全件実行の負荷の下では
 * 間に合わないことがある**。
 *
 * 錠を**一覧の行数**にしているのは、この画面のどの主張も「保存された実績を
 * 読み終えた後」にしか成り立たないからである (警告は読み終えた実績から導く)。
 */
async function mount(rows: number): Promise<void> {
  const def = SERVICES.find((s) => s.id === 'kpi');
  if (!def) throw new Error('kpi service missing');
  root = createRoot(container);
  await act(async () => {
    root!.render(createElement(def.page));
  });
  await settleUntil(() => actualRows().length === rows, `実績の一覧が ${rows} 行になる`);
}

function changeInput(input: HTMLInputElement, value: string): void {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
  if (!setter) throw new Error('value setter not found');
  setter.call(input, value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
}

function byPlaceholder(placeholder: string): HTMLInputElement {
  const el = container.querySelector<HTMLInputElement>(`input[placeholder="${placeholder}"]`);
  if (!el) throw new Error(`input placeholder="${placeholder}" not found`);
  return el;
}

/** 文字がちょうど一致するボタン (「予算を追加」を「追加」と取り違えない)。 */
async function clickButtonExact(label: string): Promise<void> {
  const button = Array.from(container.querySelectorAll('button')).find((b) => b.textContent?.trim() === label);
  if (!button) throw new Error(`button "${label}" not found`);
  await act(async () => {
    button.click();
  });
}

const text = (): string => (container.textContent ?? '').replace(/\s+/g, ' ');

async function fillActual(period: string, unit: string, revenue: string): Promise<void> {
  await act(async () => {
    changeInput(byPlaceholder('YYYY-MM'), period);
    changeInput(byPlaceholder('事業名'), unit);
    changeInput(byPlaceholder('売上高'), revenue);
    changeInput(byPlaceholder('売上原価'), '0');
    changeInput(byPlaceholder('広告費'), '0');
    changeInput(byPlaceholder('販管費'), '0');
    changeInput(byPlaceholder('減価償却費'), '0');
  });
}

const ROW: KpiActual = { period: '2026-04', unit: '全社', revenue: 1_000_000, cogs: 0, advertising: 0, sga: 0, depreciation: 0 };

async function countActuals(): Promise<number> {
  return (await getRecordStore().list(KPI_ACTUALS_COLLECTION)).length;
}

beforeEach(async () => {
  _resetRecordStoreForTests();
  _resetCollectionSubscribersForTests();
  await new Promise<void>((resolve) => {
    const req = indexedDB.deleteDatabase('business-hub-data');
    req.onsuccess = () => resolve();
    req.onerror = () => resolve();
    req.onblocked = () => resolve();
  });
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

describe('KPI 実績 — 同じ期・事業を 2 件にしない', () => {
  it('★ 同じ (期間, 事業) の追加は断られ、件数は増えず、訂正の案内が出る', async () => {
    await getRecordStore().insert(KPI_ACTUALS_COLLECTION, ROW);
    await mount(1);
    expect(await countActuals()).toBe(1);
    await fillActual('2026-04', '全社', '2000000');
    await clickButtonExact('追加');
    // **断りが出たことを先に待つ。** 「件数が増えていない」は押した直後なら
    // 何も起きていなくても当たるので、肯定の前提を先に置く (パス 377 と同じ形)。
    await waitForText(text, '2026-04 の「全社」の実績は既に入力されています');
    await waitForText(text, '一覧の × で消してから入れ直してください');
    expect(await countActuals()).toBe(1);
    expect(actualRows()).toHaveLength(1);
    // 合算されなかった (実績合計は 1 件分のまま。¥ は環境で全角/半角が揺れる)
    expect(text()).toMatch(/[¥￥]1,000,000/);
    expect(text()).not.toMatch(/[¥￥]3,000,000/);
  });

  it('対照: 別の事業なら同じ期でも通る (複数事業は正当)', async () => {
    await getRecordStore().insert(KPI_ACTUALS_COLLECTION, ROW);
    await mount(1);
    await fillActual('2026-04', 'EC', '500000');
    await clickButtonExact('追加');
    // 一覧が 2 行になるまで待つ —— 保存の完了は画面に出る (`useCollection`)。
    await settleUntil(() => actualRows().length === 2, '実績の一覧が 2 行になる');
    expect(await countActuals()).toBe(2);
    expect(text()).not.toContain('既に入力されています');
  });

  it('★ 既に重複が在れば、一覧の上で「合算されている」と警告する', async () => {
    await getRecordStore().insert(KPI_ACTUALS_COLLECTION, ROW);
    await getRecordStore().insert(KPI_ACTUALS_COLLECTION, { ...ROW, revenue: 1_200_000 });
    await mount(2);
    const alert = await waitForElement(
      () => Array.from(container.querySelectorAll('[role="alert"]')).find((el) => (el.textContent ?? '').includes('合算')),
      'role="alert" の合算の警告',
    );
    const t = (alert.textContent ?? '').replace(/\s+/g, ' ');
    expect(t).toContain('同じ期・事業の実績が 1 組重複しており、合算されています');
    expect(t).toContain('2026-04 全社 ×2');
  });

  it('対照: 重複が無ければ警告は出ない', async () => {
    await getRecordStore().insert(KPI_ACTUALS_COLLECTION, ROW);
    await getRecordStore().insert(KPI_ACTUALS_COLLECTION, { ...ROW, period: '2026-05' });
    await mount(2);
    expect(text()).not.toContain('合算されています');
  });
});

/**
 * **期 (YYYY-MM) が読めない実績は集計から除き、除いたことを言う** (2026-09-14 · パス 225)。
 *
 * パス 224 で「復元は期の**型**だけ見る」と裁定したので、`period: '全社'` の控えは
 * 復元を通る。2026-09-14 まで画面は**その行を合計に入れながら、期間・成長率からは
 * 外していた** —— 合計だけが膨らみ、月商が 3 倍になる (`kpiActuals.ts` の実測表)。
 *
 * ここは実物の画面で 2 面を読む: 合計に入らない・除いた件数が `role="alert"` で出る。
 */
describe('KPI 画面 — 期が読めない実績 (パス 225)', () => {
  it('★ 合計に入れず、除いた件数を警告に出す', async () => {
    await getRecordStore().insert(KPI_ACTUALS_COLLECTION, ROW); // 2026-04 / 100 万
    await getRecordStore().insert(KPI_ACTUALS_COLLECTION, { ...ROW, period: '全社', revenue: 9_000_000 });
    await mount(2);
    const alert = await waitForElement(
      () => container.querySelector('[data-unreadable-periods]'),
      '読めない期の断り',
    );
    expect(alert.getAttribute('data-unreadable-periods')).toBe('1');
    expect(alert.getAttribute('role')).toBe('alert');
    const t = (alert.textContent ?? '').replace(/\s+/g, ' ');
    expect(t).toContain('1 件');
    expect(t).toContain('YYYY-MM');
    // 合計は読める 1 行だけ (¥1,000,000)。900 万は入らない。
    expect(text()).not.toMatch(/[¥￥]10,000,000/);
  });

  it('対照: 期がすべて読めれば断りは出ない', async () => {
    await getRecordStore().insert(KPI_ACTUALS_COLLECTION, ROW);
    await getRecordStore().insert(KPI_ACTUALS_COLLECTION, { ...ROW, period: '2026-05' });
    await mount(2);
    expect(container.querySelector('[data-unreadable-periods]')).toBeNull();
  });
});
