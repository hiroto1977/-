/** @vitest-environment jsdom */
/**
 * **不動産の「月次キャッシュフロー内訳」の 4 行は、画面に出た数のまま足し引きが合う**
 * (2026-09-27 · パス 493j)。
 *
 * `docs/REMAINING_WORK.md` は 2026-09 から「利用者が小数の円を入れたときだけ、表示の丸めで
 * 1 円ずれうる (`83,333.33` は年額 ÷ 12 として現実に打たれうる)」と残していた。その前提は
 * 「金額は `Intl` が円へ丸める」だったが、**今の画面は共有の `jpy` (`shared/formatters.ts`) を
 * 通り、円へ丸めない** —— 行ごとに丸めないので、出た数のまま `家賃 − 経費 − 返済 = 手残り` が
 * 成り立つ (2026-09-27 実測)。ここはその事実を実物の画面で留める。
 *
 * **行ごとに円へ丸める書式へ戻した日に鳴る** —— 標本は、行ごとに丸めると合わなくなる端数
 * (.33 / .6 / .7) を選んである (同じ `it` の中でそれを確かめる)。直し方を「行を先に円へ丸め、
 * 合計はその和で作る」(投資信託の形) へ替えるなら、この不変条件はそのまま通る。
 */
import 'fake-indexeddb/auto';
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { SERVICES } from '../../services';
import { _resetRecordStoreForTests, getRecordStore } from '../../data/store';
import { _resetCollectionSubscribersForTests } from '../../data/useCollection';
import { PROPERTIES_COLLECTION } from '../../data/investments';
import { waitForText } from '../../__tests__/jsdomWait';

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
  container.remove();
});

const text = (): string => (container.textContent ?? '').replace(/\s+/g, ' ');

async function mountPage(waitFor: string): Promise<void> {
  const def = SERVICES.find((s) => s.id === 'real-estate');
  if (!def) throw new Error('real-estate service missing');
  root = createRoot(container);
  await act(async () => {
    root!.render(createElement(def.page));
  });
  await waitForText(text, waitFor);
}

const LABELS = ['家賃収入 (実績、空室除外)', '運営費用', 'ローン返済', '純キャッシュフロー'] as const;

/** 内訳の表の 4 行の金額の欄 (画面に出た文字のまま)。 */
function breakdownCells(): Record<(typeof LABELS)[number], string> {
  const rows = Array.from(container.querySelectorAll('tr'));
  const out = {} as Record<(typeof LABELS)[number], string>;
  for (const label of LABELS) {
    const row = rows.find((tr) => tr.querySelector('td')?.textContent === label);
    const cell = row?.querySelectorAll('td')[1];
    if (!cell) throw new Error(`内訳の行「${label}」が見つからない`);
    out[label] = (cell.textContent ?? '').trim();
  }
  return out;
}

/** 画面の金額の文字を数へ (`−¥1,234.5` / `¥-1,234.5` / `¥1,234`)。行の頭の「−」は差し引く印。 */
function yenOf(s: string): number {
  const deducted = s.startsWith('−');
  const n = Number(s.replace(/^−/, '').replace(/^¥/, '').replace(/,/g, ''));
  if (!Number.isFinite(n)) throw new Error(`金額として読めない: ${JSON.stringify(s)}`);
  return deducted ? -n : n;
}

describe('不動産投資 — 月次キャッシュフロー内訳は、出た数のまま合う', () => {
  it('★ 小数の円を含む物件を足しても、家賃 − 経費 − 返済 = 手残り (画面の数のまま)', async () => {
    // 年額 ÷ 12 の家賃 (83,333.33) と、端数の経費・返済。どれも入力欄が受ける形 (0 以上の数)。
    await getRecordStore().insert(PROPERTIES_COLLECTION, {
      name: '端数の物件',
      type: '区分',
      monthlyRent: 83_333.33,
      purchasePrice: 20_000_000,
      occupied: true,
      monthlyExpenses: 20_000.6,
      monthlyLoan: 30_000.7,
    });
    await mountPage('自分の物件は 1 件');
    const c = breakdownCells();
    const rent = yenOf(c['家賃収入 (実績、空室除外)']);
    const expenses = yenOf(c['運営費用']);
    const loan = yenOf(c['ローン返済']);
    const net = yenOf(c['純キャッシュフロー']);
    expect(expenses).toBeLessThan(0); // 差し引く行は「−」で出る (読み方の確認)
    expect(loan).toBeLessThan(0);
    // 出た数のまま足すと、手残りの行と一致する (表示は千分の一円までなので、その精度で比べる)
    expect(Math.abs(rent + expenses + loan - net)).toBeLessThan(0.0005);
    // 標本が的に当たる: 行ごとに円へ丸めると、同じ 4 行は合わない (この検査が空でない)
    expect(Math.round(rent) + Math.round(expenses) + Math.round(loan)).not.toBe(Math.round(net));
    // 見出しのタイルと内訳の手残りは同じ値を同じ書式で言う
    await waitForText(text, `月次キャッシュフロー${c['純キャッシュフロー']}`);
  });

  it('対照: 整数の円だけなら、今までどおり合う (見本 4 件のみ)', async () => {
    await mountPage('見本');
    const c = breakdownCells();
    const [rent, expenses, loan, net] = LABELS.map((l) => yenOf(c[l]));
    expect(rent! + expenses! + loan!).toBe(net);
    for (const l of LABELS) expect(c[l], l).not.toContain('.'); // 見本は整数の円
  });
});
