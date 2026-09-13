/** @vitest-environment jsdom */
/**
 * **測れない物件を平均の分母に入れず、外したことを画面が述べる。**
 *
 * `computeRealEstatePortfolio` は 2026-09-08 まで、取得価格が読めない物件を
 * **表面利回り 0%** として足しつつ分母は全件だった。`normalizeProperty` は
 * 欄の無い控え (復元・古い版・手で直した JSON) を 0 に倒すので、
 *
 * | 控え | 表示 | 測れた物件だけの平均 |
 * | --- | ---: | ---: |
 * | 3 件そろい | 5.5% | 5.5% |
 * | **+ 取得価格の欄が無い 1 件** | **4.1%** | 5.5% |
 *
 * —— **1 件で全体が 25% 下がる**。入力欄の `parseProperty` は取得価格 1 円以上を
 * 要求するので、この形で入るのは読み取りの経路だけ。
 *
 * 併せて「入居中と記録されているのに家賃が読めない」物件は、入居率 100% に
 * 数えつつ家賃収入には ¥0 を入れる —— **両立しない 2 つのタイル**。
 */
import 'fake-indexeddb/auto';
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { SERVICES } from '../../services';
import { _resetRecordStoreForTests, getRecordStore } from '../../data/store';
import { _resetCollectionSubscribersForTests } from '../../data/useCollection';
import { PROPERTIES_COLLECTION } from '../../data/investments';

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

async function settle(): Promise<void> {
  for (let i = 0; i < 8; i += 1) {
    await act(async () => {
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    });
  }
}

async function mountPage(): Promise<void> {
  const def = SERVICES.find((s) => s.id === 'real-estate');
  if (!def) throw new Error('real-estate service missing');
  root = createRoot(container);
  await act(async () => {
    root!.render(createElement(def.page));
  });
  await settle();
}

/** 画面の文字 (改行・連続空白を畳んだもの)。 */
const text = (): string => (container.textContent ?? '').replace(/\s+/g, ' ');
const scopeBox = (): HTMLElement | null => container.querySelector('[data-portfolio-scope]');

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

describe('不動産投資 — 測れない物件と平均の分母', () => {
  /*
   * **2026-09-12 (パス 187) で見るものを狭めた。**
   *
   * ここは「断りの箱そのものが出ない」を見ていたが、同じ箱に
   * **合計に見本が混ざっていることの断り** (`demoMixNote`) が入るように
   * なったので、箱は常に出る (同梱の見本が 4 件在るため)。
   * この検査の言いたいことは「**利回りの**断りが出ない」なので、
   * 見るのはその文面に絞る (箱の有無ではなく、中の主張)。
   */
  it('★ 対照: 全件そろっていれば利回りの断りは出ない (snapshot だけ)', async () => {
    await mountPage();
    expect(text()).not.toContain('表面利回りの平均から外して');
    expect(text()).not.toContain('家賃が読めないため');
    // 箱は在る —— 合計に見本が混ざっているので、そのことは述べる。
    expect(scopeBox()?.textContent ?? '').toContain('見本');
  });

  it('★ 取得価格の欄が読めない物件を足すと、外したことを画面が述べる', async () => {
    // 欄そのものが無い控え (`normalizeProperty` が 0 に倒す)
    await getRecordStore().insert(PROPERTIES_COLLECTION, { name: '欄の無い物件', type: '区分', monthlyRent: 90_000, occupied: true });
    await mountPage();
    const box = scopeBox();
    expect(box).not.toBeNull();
    const t = (box!.textContent ?? '').replace(/\s+/g, ' ');
    expect(t).toContain('取得価格が読めない 1 件は表面利回りの平均から外しています');
    expect(t).toContain('0% として平均すると全体が下がります');
  });

  it('★ 入居中なのに家賃が読めない物件を足すと、家賃に入っていない旨を述べる', async () => {
    await getRecordStore().insert(PROPERTIES_COLLECTION, { name: '家賃の無い物件', type: '区分', purchasePrice: 20_000_000, occupied: true });
    await mountPage();
    const box = scopeBox();
    expect(box).not.toBeNull();
    const t = (box!.textContent ?? '').replace(/\s+/g, ' ');
    expect(t).toContain('入居中と記録されている 1 件は家賃が読めないため');
    expect(t).toContain('月次家賃収入に含まれていません');
  });

  it('★ 対照: 取得価格も家賃も在る物件を足しても利回りの断りは出ない', async () => {
    await getRecordStore().insert(PROPERTIES_COLLECTION, { name: 'そろった物件', type: '区分', monthlyRent: 90_000, purchasePrice: 20_000_000, occupied: true, monthlyExpenses: 0, monthlyLoan: 0 });
    await mountPage();
    expect(text()).not.toContain('表面利回りの平均から外して');
    // 自分の物件が 1 件在るので、合計との差を述べる (パス 187)。
    expect(scopeBox()?.textContent ?? '').toContain('自分の物件は 1 件');
  });

  /**
   * **パス 54 は平均だけを直して、行を残していた** (2026-09-08 に当てた)。
   * 平均が「測れた物件だけ」で出るなら、一覧の行も測れなかったことを言わないと
   * 「利回り 0% の物件が在る」と読まれる。
   */
  it('★ 一覧の行も、価格が読めなければ利回りを「0.0%」と刷らない', async () => {
    await getRecordStore().insert(PROPERTIES_COLLECTION, { name: '欄の無い物件', type: '区分', monthlyRent: 90_000, occupied: true });
    await mountPage();
    const row = Array.from(container.querySelectorAll('tr')).find((tr) =>
      (tr.querySelector('td')?.textContent ?? '').includes('欄の無い物件'),
    );
    expect(row).toBeDefined();
    const cells = Array.from(row!.querySelectorAll('td')).map((td) => (td.textContent ?? '').trim());
    // 列は 名称 / 種別 / 月額賃料 / 物件価格 / 表面利回り / 実質利回り / 入居 / 操作
    expect(cells[4]).toBe('—');
    expect(cells[5]).toBe('—');
    expect(cells[4]).not.toBe('0.0%');
  });

  it('★ 対照: 価格が読める行は利回りを % で刷る (標本が在ることの確認)', async () => {
    await getRecordStore().insert(PROPERTIES_COLLECTION, { name: 'そろった物件', type: '区分', monthlyRent: 90_000, purchasePrice: 20_000_000, occupied: true, monthlyExpenses: 0, monthlyLoan: 0 });
    await mountPage();
    const row = Array.from(container.querySelectorAll('tr')).find((tr) =>
      (tr.querySelector('td')?.textContent ?? '').includes('そろった物件'),
    );
    expect(row).toBeDefined();
    const cells = Array.from(row!.querySelectorAll('td')).map((td) => (td.textContent ?? '').trim());
    expect(cells[4]).toMatch(/^\d+\.\d%$/);
    expect(cells[5]).toMatch(/^\d+\.\d%$/);
  });
});
