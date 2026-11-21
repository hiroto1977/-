/** @vitest-environment jsdom */
/**
 * **合計は自分の登録だけから来る** (2026-09-12 · パス 187 → 2026-11-19 · ローカル完結バッチ 3)。
 *
 * 不動産・投資信託のタイルはかつて「snapshot の見本 + 自分の記録」を 1 本の
 * リストで集計し、見本は桁で勝つので自分の分が合計の中で見えなくなっていた
 * (実測: 家賃収入 合計 ¥913,000 に対し自分の分 ¥90,000、実質コスト 5 年累計は
 * 自分の 10 万に対し 83 倍の ¥594,505 を刷っていた)。パス 187 は混ざっている
 * ことの断りを並べて述べる形で対処した。
 *
 * 2026-11-19 のローカル完結バッチ 3 で同梱の見本そのものを外し、画面は
 * **空から始まって自分の登録だけ**を集計するようになった。ここで留めるのは
 * その裏側: 見本の混ざりを述べる断りが**出ない**こと、登録が無ければ合計は
 * 0 であること、登録した数字がそのまま合計に出ること。
 */
import 'fake-indexeddb/auto';
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { SERVICES } from '../../services';
import { _resetRecordStoreForTests, getRecordStore } from '../../data/store';
import { _resetCollectionSubscribersForTests } from '../../data/useCollection';
import { HOLDINGS_COLLECTION, PROPERTIES_COLLECTION } from '../../data/investments';
import { SHIGYO_CONTACTS_COLLECTION } from '../../data/shigyoDirectory';
import type { ServiceId } from '../../../shared/serviceId';
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

/** 画面ぜんぶの文 (改行・連続空白を畳んだもの)。 */
const allText = (): string => (container.textContent ?? '').replace(/\s+/g, ' ');

/**
 * 画面を描き、`waitFor` の文が出るまで**条件で**待つ (法則 `wait-for-condition-not-ticks`)。
 *
 * **錠はその `it` が真に見たい文にする。** この画面の断りは 1 本の template から
 * 組まれるので、置いた記録が届いた瞬間に文ぜんぶが「まだ登録されていません」から
 * 内訳へ入れ替わる —— つまり待てる印は**断りそのもの**に在り、
 * 件数と算定された額 (¥90,000 / 5.3% ほか) は同じ描画で一緒に出る。
 *
 * 2026-09-21 (パス 385) まで固定回数 (8 周) で待っており、周回数を 0 にすると
 * **5 件が落ちた** —— どれも「置いた記録がまだ届いていない」ので、画面は
 * 既定の枝 (見本だけ) を刷る。台帳はこの家系を `text-captured`
 * (「`const t = text();` へ取ってから主張するので待ちに渡せない」) と
 * 説明していたが、**それは偽だった** —— 取る前に待てばよく、
 * 取ったあとの主張 (否定を含む) はそのままでよい。
 */
async function mountPage(id: ServiceId, waitFor: string): Promise<void> {
  const def = SERVICES.find((s) => s.id === id);
  if (!def) throw new Error(`${id} service missing`);
  root = createRoot(container);
  await act(async () => {
    root!.render(createElement(def.page));
  });
  await waitForText(allText, waitFor);
}

/** 指定の目印の要素の文字 (改行・連続空白を畳んだもの)。無ければ null。 */
const noteText = (marker: string): string | null => {
  const el = container.querySelector(`[${marker}]`);
  return el === null ? null : (el.textContent ?? '').replace(/\s+/g, ' ');
};

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

describe('不動産投資 — 合計は自分の登録だけから来る', () => {
  it('★ 何も登録していないとき合計は 0 で、見本の混ざりは述べない', async () => {
    await mountPage('real-estate', '0 物件');
    const all = allText();
    expect(all).toContain('月次 CF ¥0');
    expect(all).not.toContain('同梱の見本');
    expect(noteText('data-portfolio-demo-mix')).toBeNull();
    // 旧見本の数字 (家賃 ¥913,000 / CF +¥248,000) はどこにも出ない。
    expect(all).not.toContain('¥913,000');
    expect(all).not.toContain('¥248,000');
  });

  it('★ 自分の物件を 1 件登録すると、合計は自分の数字そのままになる', async () => {
    await getRecordStore().insert(PROPERTIES_COLLECTION, {
      name: '自分の物件', type: '区分所有',
      monthlyRent: 90_000, purchasePrice: 20_000_000, occupied: true,
      monthlyExpenses: 30_000, monthlyLoan: 55_000,
    });
    // 錠は置いた記録の行そのもの —— 届いた描画で合計の数も一緒に出る。
    await mountPage('real-estate', '自分の物件');
    const all = allText();
    expect(all).toContain('1 物件');
    // 家賃 ¥90,000 − 経費 ¥30,000 − 返済 ¥55,000 = 手残り ¥5,000 がそのまま合計。
    expect(all).toContain('¥90,000');
    expect(all).toContain('¥5,000');
    expect(all).not.toContain('同梱の見本');
    expect(noteText('data-portfolio-demo-mix')).toBeNull();
  });
});

describe('投資信託 — 合計は自分の登録だけから来る', () => {
  it('★ 何も登録していないとき合計は 0 で、見本の混ざりは述べない', async () => {
    await mountPage('mutual-funds', '0 銘柄');
    const all = allText();
    expect(all).toContain('評価額 ¥0');
    expect(all).not.toContain('同梱の見本');
    expect(noteText('data-fund-demo-mix')).toBeNull();
    expect(noteText('data-fund-cost-user-only')).toBeNull();
    // 旧見本の数字 (評価額 ¥8,340,140) はどこにも出ない。
    expect(all).not.toContain('¥8,340,140');
  });

  it('★ 自分の銘柄を 1 件登録すると、合計は自分の数字そのままになる', async () => {
    await getRecordStore().insert(HOLDINGS_COLLECTION, {
      code: 'MINE0001', name: '自分の銘柄',
      valuation: 100_000, acquisitionCost: 95_000, ytdReturnPct: 4,
    });
    await mountPage('mutual-funds', '自分の銘柄');
    const all = allText();
    expect(all).toContain('1 銘柄');
    expect(all).toContain('¥100,000');
    expect(all).toContain('¥95,000');
    expect(all).toContain('¥5,000');
    expect(all).toContain('5.3%');
    expect(all).not.toContain('同梱の見本');
    expect(noteText('data-fund-demo-mix')).toBeNull();
  });

  it('★ 実質コストの元本は自分の評価額だけ (旧見本込みの 83 倍にはならない)', async () => {
    await getRecordStore().insert(HOLDINGS_COLLECTION, {
      code: 'MINE0001', name: '自分の銘柄',
      valuation: 100_000, acquisitionCost: 95_000, ytdReturnPct: 4,
    });
    await mountPage('mutual-funds', '評価額 ¥100,000 を元本とし');
    const all = allText();
    // 既定の入力 (信託報酬 1.0% / 隠れ 0.2% / 想定年率 5% / 保有 5 年) での実測。
    // 元本が自分の ¥100,000 だけなので、累計の蝕み効果は ¥7,128 (旧: 見本込み ¥594,505)。
    expect(all).toContain('¥7,128');
    expect(all).not.toContain('¥594,505');
    expect(noteText('data-fund-cost-user-only')).toBeNull();
  });
});

/**
 * 士業コンソールは 8 画面で共有されている —— 2026-11-18 のローカル化までは、見出しの
 * 「連携 N 名 · 顧問料 ¥X/月」が同梱の見本 (snapshot) と自分の登録を混ぜていた
 * (連携先ごとの顧問料の欄が無く、顧問料は見本の値だった)。土台が見本を持たなく
 * なった今、見出しの数は**自分の登録だけ**から来る。ここで留めるのはその裏側:
 * 見本の混ざりを述べる断りが**出ない**こと、登録が無ければ「未登録」と言うこと、
 * 登録した顧問料がそのまま見出しに出ること。
 */
describe('士業コンソール — 見出しの数は自分の登録だけから来る', () => {
  it('★ 何も登録していないとき「未登録」と述べ、見本の混ざりは述べない (税理士)', async () => {
    await mountPage('tax-accountant', '連携先が未登録です');
    expect(allText()).toContain('連携 0 名');
    expect(allText()).toContain('顧問料 ¥0/月');
    expect(allText()).not.toContain('同梱の見本');
    expect(noteText('data-shigyo-demo-mix')).toBeNull();
  });

  it('★ 自分の連携先を 1 名登録すると、見出しの顧問料は自分の登録の額になる', async () => {
    await getRecordStore().insert(SHIGYO_CONTACTS_COLLECTION, {
      serviceId: 'tax-accountant', name: '自分の税理士', firm: '', phone: '', email: '', monthlyFee: 33000, outstandingInvoice: 0,
    });
    // 錠は置いた記録の行そのもの —— 届いた描画で見出しの数も一緒に出る。
    await mountPage('tax-accountant', '自分の税理士');
    expect(allText()).toContain('連携 1 名');
    expect(allText()).toContain('顧問料 ¥33,000/月');
    expect(allText()).not.toContain('同梱の見本');
    expect(noteText('data-shigyo-demo-mix')).toBeNull();
  });

  it('★ 8 士業のどれでも同じ (共有部品なので 1 つ直せば全部に効くこと)', async () => {
    for (const id of ['labor-consultant', 'lawyer'] as const) {
      await mountPage(id, '連携先が未登録です');
      expect(allText(), id).toContain('連携 0 名');
      expect(allText(), id).not.toContain('同梱の見本');
      if (root) {
        await act(async () => { root!.unmount(); });
        root = null;
      }
    }
  });
});
