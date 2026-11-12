/** @vitest-environment jsdom */
/**
 * **KPI ページの貸借対照表パネルも、倒した欄を原因ごとに述べる。** (2026-09-24 · パス 445)
 *
 * 背骨は**振る舞い** —— 実物の保管層へ入れて実物の画面を描く。
 *
 * パス 444 は名簿 (`unreadableFields`) を 4 つの面へ配線した (書面 §4 の caption・
 * 書面 §5・経営ハイライト・経営サマリーの画面)。**5 つ目が抜けていた** ——
 * 貸借対照表を打ち込む当の画面である。実測 (2026-09-24 · 直す前):
 *
 * | 壊した欄 | 自己資本比率 | 純資産 | 流動比率 | パネルの断り |
 * | --- | ---: | ---: | ---: | --- |
 * | (正しい控え) | 33.3% | ￥4,000,000 | 160% | 無し |
 * | **有利子負債 (任意)** | 33.3% | ￥4,000,000 | 160% | **「有利子負債が未入力のため…借入が無いなら 0 と入力してください」** |
 * | **現預金 (任意)** | 33.3% | ￥4,000,000 | 160% | **「現預金が未入力のため…借入が無いなら 0 と入力してください」** |
 * | 有利子負債 (本当に未入力) | 33.3% | ￥4,000,000 | 160% | **同じ文** |
 * | **流動資産 (必須)** | **-100%** | **-￥4,000,000** | **0%** | **無し** |
 *
 * ★ 2 行目と 4 行目は**1 字も違わなかった** —— 打ち込んだ利用者にとって偽である。
 * ★ しかも「0 と入力してください」に従うと 5,000,000 が 0 に置き換わり、
 *   ネットデットが「—」から**確信のある誤った数**に変わる (パス 388 の家系)。
 * ★ 5 行目は理由 1 文も無しで債務超過の数字を出していた (パス 444(A) の 5 つ目の面)。
 */
import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { KpiPage } from '../KpiPage';
import { BALANCE_SHEET_COLLECTION } from '../../data/balanceSheet';
import { getRecordStore } from '../../data/store';
import { _resetCollectionSubscribersForTests } from '../../data/useCollection';
import { _resetNavigationIntentForTests } from '../../navigate';
import { installPageRenderGlobals } from '../../__tests__/pageRenderHarness';
import { resetRecordStore } from '../../__tests__/recordStoreHarness';
import { waitForElement } from '../../__tests__/jsdomWait';

/** 形が拒む 5 形 —— どれも `structuredClone` が通すので保管値として実在しうる。 */
const NON_NUMBERS: readonly [string, unknown][] = [
  ['10進の文字列', '9000000'],
  ['物', { z: 1 }],
  ['配列', [1]],
  ['真偽', true],
  ['null', null],
];

/** 健全な控え —— 自己資本比率 33.3% / 流動比率 160%。 */
const GOOD_BS: Readonly<Record<string, unknown>> = {
  asOf: '2026-03-31',
  currentAssets: 8_000_000,
  cash: 3_000_000,
  inventory: 2_000_000,
  accountsReceivable: 1_500_000,
  fixedAssets: 4_000_000,
  currentLiabilities: 5_000_000,
  accountsPayable: 1_000_000,
  fixedLiabilities: 3_000_000,
  interestBearingDebt: 2_000_000,
  netIncome: 600_000,
};

let container: HTMLDivElement;
let root: Root | null = null;

beforeEach(async () => {
  installPageRenderGlobals((name) => {
    vi.spyOn(console, name).mockImplementation(() => undefined);
  });
  await resetRecordStore();
  _resetCollectionSubscribersForTests();
  _resetNavigationIntentForTests();
  container = document.createElement('div');
  document.body.appendChild(container);
});

afterEach(() => {
  if (root) {
    const r = root;
    root = null;
    act(() => {
      r.unmount();
    });
  }
  container.remove();
  vi.restoreAllMocks();
});

/**
 * 控えを 1 件入れて実物の KPI ページを描き、画面の全文を返す。
 *
 * ★ **錠は構造で取る** —— 「自己資本比率」は入力欄の上の案内文にも出るので、
 *   綴りで待つと**行が届く前の姿**を測ってしまう (パス 442 / 376 で 3 度踏んだ罠)。
 *   `[data-bs-insights]` は貸借対照表が届いたときだけ描かれる。
 */
async function mount(bs: Record<string, unknown>): Promise<{ all: string; panel: string }> {
  await getRecordStore().insert(BALANCE_SHEET_COLLECTION, bs);
  root = createRoot(container);
  const r = root;
  await act(async () => {
    r.render(createElement(KpiPage));
  });
  const el = await waitForElement<HTMLElement>(
    () => container.querySelector<HTMLElement>('[data-bs-insights]'),
    'BS パネル',
  );
  return { all: container.textContent ?? '', panel: el.textContent ?? '' };
}

/** 欄そのものを落とした控え (**本当に未入力**)。 */
function without(key: string): Record<string, unknown> {
  const copy: Record<string, unknown> = { ...GOOD_BS };
  delete copy[key];
  return copy;
}

describe('KPI ページの貸借対照表パネル — 欄が読めない (パス 445)', () => {
  it('★ 正しい控えなら断りは 1 文も出ない (答えも変わらない)', async () => {
    const { all, panel } = await mount({ ...GOOD_BS });
    expect(all).toContain('33.3%');
    expect(all).toContain('160%');
    expect(all).not.toContain('数として読めない');
    expect(panel).not.toContain('算定していません');
  });

  it.each(NON_NUMBERS)('★ 有利子負債が %s なら「読めない」と言い、0 を入れろとは言わない', async (_name, bad) => {
    const { panel } = await mount({ ...GOOD_BS, interestBearingDebt: bad });
    expect(panel).toContain('有利子負債が数として読めないため');
    expect(panel).toContain('形式の合わないレコード');
    // 打ち込んだ人に「未入力」と言わない・直す手を取り違えない (パス 388)。
    expect(panel).not.toContain('有利子負債が未入力のため');
    expect(panel).not.toContain('0 と入力してください');
  });

  it.each(NON_NUMBERS)('★ 現預金が %s なら「読めない」と言う', async (_name, bad) => {
    const { panel } = await mount({ ...GOOD_BS, cash: bad });
    expect(panel).toContain('現預金が数として読めないため');
    expect(panel).not.toContain('現預金が未入力のため');
    expect(panel).not.toContain('0 と入力してください');
  });

  it('★ 本当に未入力なら今までどおり「未入力のため…0 と入力してください」', async () => {
    const { panel } = await mount(without('interestBearingDebt'));
    expect(panel).toContain('有利子負債が未入力のため');
    expect(panel).toContain('0 と入力してください');
    expect(panel).not.toContain('数として読めない');
  });

  it('★ 対照: 読めない控えと本当に未入力の控えは、同じ文を出さない', async () => {
    const broken = await mount({ ...GOOD_BS, interestBearingDebt: '9000000' });
    root?.unmount();
    root = null;
    container.remove();
    container = document.createElement('div');
    document.body.appendChild(container);
    await resetRecordStore();
    _resetCollectionSubscribersForTests();
    const absent = await mount(without('interestBearingDebt'));
    // 直す前は 1 字も違わなかった。
    expect(broken.panel).not.toBe(absent.panel);
  });

  it.each(NON_NUMBERS)('★ 必須の欄 (流動資産) が %s なら、倒したことを画面が述べる', async (_name, bad) => {
    const { all } = await mount({ ...GOOD_BS, currentAssets: bad });
    // 直す前は理由 1 文も無しでこの数字を出していた。
    expect(all).toContain('-100%');
    const alert = container.querySelector('[data-bs-unreadable]');
    expect(alert).not.toBeNull();
    expect(alert?.getAttribute('role')).toBe('alert');
    expect(alert?.textContent).toContain('流動資産が数として読めないため 0 円として計算しています');
    expect(alert?.textContent).toContain('形式の合わないレコード');
  });

  it('★ 任意の欄が読めないときも、名簿の断りは出る (倒した先が違うので文も違う)', async () => {
    const { all } = await mount({ ...GOOD_BS, interestBearingDebt: '9000000' });
    const alert = container.querySelector('[data-bs-unreadable]');
    expect(alert?.textContent).toContain('未入力として扱っています');
    expect(alert?.textContent).not.toContain('0 円として計算しています');
    // 答えは 1 つも変わらない (任意の欄なので比率には効かない)。
    expect(all).toContain('33.3%');
  });
});
