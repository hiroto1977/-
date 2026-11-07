/** @vitest-environment jsdom */
/**
 * **背骨は振る舞い** —— 実物の保管層へ壊れた控えを入れて、実物の不動産ページを描く
 * (2026-09-24 · パス 446)。
 *
 * `renderer/data/__tests__/unreadablePropertyFields.test.ts` が名簿と算術を留め、
 * ここは**利用者が実際に読む面**を留める。閉じた欠陥は 3 つ:
 *
 * 1. **月次経費・月次返済が数として読めないと黙って 0 に倒れ、月次キャッシュフローが
 *    過大に出る** (実測 ¥70,000 → ¥90,000 / ¥80,000・断り 0 文)。
 * 2. **家賃が読めない物件が表面利回りの平均に 0% として入る** (実測 5.50% → 4.13%)。
 *    空室ならどの断りにも現れない。
 * 3. **入居中で家賃 0 円の物件に「家賃が読めないため」と述べていた** ——
 *    家賃 0 は入力欄が受け付ける値なので、0 と打ち込んだ利用者にとって偽である。
 *
 * 面は 1 つ (`RealEstatePage` の `[data-portfolio-scope]`) —— `computeRealEstatePortfolio`
 * とこの 3 つの断りを読む所は木全体でここだけである (走査で確かめた)。
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

/** 正しい控え 1 件 —— 家賃 10 万・取得 2,000 万・経費 2 万・返済 1 万。 */
const GOOD = {
  name: '一棟目',
  type: 'アパート',
  monthlyRent: 100_000,
  purchasePrice: 20_000_000,
  occupied: true,
  monthlyExpenses: 20_000,
  monthlyLoan: 10_000,
};

/**
 * **錠は構造で取る** —— 「自分の物件は 1 件」は見本が混ざっていることの断りで、
 * 控えが届いたときだけ出る。文面 (「月次経費」など) で待つと、直す前でも直した後でも
 * 通る空の検査になったり、見出しや案内文に先に当たったりする (パス 442 / 376 の罠)。
 */
async function mount(): Promise<void> {
  const def = SERVICES.find((s) => s.id === 'real-estate');
  if (!def) throw new Error('real-estate service missing');
  root = createRoot(container);
  await act(async () => {
    root!.render(createElement(def.page));
  });
  await waitForText(() => scope()?.textContent ?? '', '自分の物件は 1 件');
}

const scope = (): HTMLElement | null => container.querySelector('[data-portfolio-scope]');
const scopeText = (): string => (scope()?.textContent ?? '').replace(/\s+/g, ' ');
/** 画面の文字 (改行・連続空白を畳んだもの)。 */
const text = (): string => (container.textContent ?? '').replace(/\s+/g, ' ');

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

describe('保管した物件の欄が数として読めないとき、画面が述べる', () => {
  it('★ 対照: 正しい控えなら 3 つの断りは 1 文も出ない', async () => {
    await getRecordStore().insert(PROPERTIES_COLLECTION, GOOD);
    await mount();
    const t = scopeText();
    expect(t).not.toContain('月次経費・月次返済が数として読めない');
    expect(t).not.toContain('表面利回りの平均から外しています');
    expect(t).not.toContain('月次家賃収入に含まれていません');
  });

  it('★ 月次経費が読めないと、手残りが過大に出ていることを画面が述べる', async () => {
    await getRecordStore().insert(PROPERTIES_COLLECTION, { ...GOOD, monthlyExpenses: '20000' });
    await mount();
    await waitForText(() => scope()?.textContent ?? '', '月次経費・月次返済が数として読めない 1 件');
    const t = scopeText();
    expect(t).toContain('月次キャッシュフローはその分だけ過大に出ています');
    // **逃げ口を名指しする** —— 一覧の × では消せない欄なので、点検パネルへ送る。
    expect(t).toContain('形式の合わないレコード');
    // 断りは専用の箱に載る (画面がこの 1 文を描いていることの構造の錠)。
    expect(container.querySelector('[data-portfolio-cost-unreadable]')).not.toBeNull();
  });

  it('★ 月次返済額が読めないときも同じ 1 文が出る', async () => {
    await getRecordStore().insert(PROPERTIES_COLLECTION, { ...GOOD, monthlyLoan: '10000' });
    await mount();
    await waitForText(() => scope()?.textContent ?? '', '月次経費・月次返済が数として読めない 1 件');
    expect(container.querySelector('[data-portfolio-cost-unreadable]')).not.toBeNull();
  });

  it('★ 空室で家賃が読めない物件も、利回りの平均から外したことを述べる', async () => {
    await getRecordStore().insert(PROPERTIES_COLLECTION, { ...GOOD, monthlyRent: '100000', occupied: false });
    await mount();
    await waitForText(() => scope()?.textContent ?? '', '家賃が数として読めない 1 件は表面利回りの平均から外しています');
    const t = scopeText();
    // 空室なので「入居中と記録されている」の断りは出ない —— この 1 文が唯一の面である。
    expect(t).not.toContain('入居中と記録されている');
  });

  it('★ 入居中で家賃が読めないと、原因を「読めない」と述べる (0 円とは言わない)', async () => {
    await getRecordStore().insert(PROPERTIES_COLLECTION, { ...GOOD, monthlyRent: '100000' });
    await mount();
    await waitForText(() => scope()?.textContent ?? '', '入居中と記録されている 1 件は家賃が数として読めないため');
    const t = scopeText();
    expect(t).not.toContain('家賃が 0 円のため');
    expect(t).toContain('家賃が数として読めない 1 件は表面利回りの平均から外しています');
  });

  it('★ 入居中で家賃が本当に 0 円なら、原因を「0 円」と述べ、入力を促す', async () => {
    await getRecordStore().insert(PROPERTIES_COLLECTION, { ...GOOD, monthlyRent: 0 });
    await mount();
    await waitForText(() => scope()?.textContent ?? '', '入居中と記録されている 1 件は家賃が 0 円のため');
    const t = scopeText();
    expect(t).toContain('空室でないなら家賃を入力してください');
    expect(t).not.toContain('家賃が数として読めない');
    // 本当に 0 円なら利回りの平均には入る (既存の判断を変えていない)。
    expect(t).not.toContain('表面利回りの平均から外しています');
  });

  it('★ 断りが出ても一覧の行は残る (行ごと落とすと家賃も入居率も消える)', async () => {
    await getRecordStore().insert(PROPERTIES_COLLECTION, { ...GOOD, name: '経費の読めない物件', monthlyExpenses: '20000' });
    await mount();
    await waitForText(() => container.textContent ?? '', '経費の読めない物件');
    expect(text()).toContain('経費の読めない物件');
  });
});
