/** @vitest-environment jsdom */
/**
 * **何も繋いでいない利用者に「✅ 連携中」を刷らない。** (2026-09-15 · パス 265)
 *
 * デスクトップの `fetchFundingSnapshot` は Phase 6 の実 API 差込みまで
 * `MOCK_ACCOUNTING` / `MOCK_PORTFOLIO` を必ず渡すので `accountingLinked` /
 * `stocksLinked` は常に真になる。だから「更新」を押すと画面は
 *
 *     会計ソフト連携: ✅ 連携中 ／ 株式投資連携: ✅ 連携中
 *     凡例: 営業CF (会計・実績12か月)
 *
 * を刷っていた —— `isMock: true` を立てたまま。
 *
 * **この枝はそれまで型の上で死んでいた**: 画面の型は
 * `typeof SNAPSHOT.funding` で、`as const` により `accountingLinked` は
 * リテラル `false` に狭まっていたので、「✅ 連携中」側に入る見本を
 * `SNAPSHOT` から組めなかった (パス 79 の家系 · 同じパスで `as boolean` に直した)。
 * だからこの検査は**型を直さないと書けなかった検査**である。
 */
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { settleUntil } from './jsdomWait';
import { FundingPage } from '../pages/FundingPage';
import { SNAPSHOT } from '../data/snapshot';
import { fundingLinkSource, type FundingLinkSource } from '../../shared/funding';

type FundingSnap = typeof SNAPSHOT.funding;

/**
 * 会計CF / 株式評価額を持つか × 見本を名乗るかで、控えを 3 通り作る。
 * 月次の行は 3 通りとも入れる —— **入れないと図が描かれず、取得の前後で
 * 文字が変わらないので「取得できた」を待てない**。
 */
function snapWith(hasData: boolean, isMock: boolean): FundingSnap {
  const source: FundingLinkSource = fundingLinkSource(hasData, isMock);
  const row = (month: string, cf: number, pv: number) => ({
    month,
    funding: 1_000_000,
    fundingAfterTax: 700_000,
    repayment: 0,
    interest: 0,
    interestTaxShield: 0,
    netCashflow: 700_000,
    operatingCashflow: hasData ? cf : 0,
    operatingCashflowKnown: hasData,
    portfolioValue: hasData ? pv : 0,
  });
  return {
    ...SNAPSHOT.funding,
    isMock,
    accountingLinked: hasData,
    accountingSource: source,
    stocksLinked: hasData,
    stocksSource: source,
    monthly: [row('2026-01', 400_000, 500_000), row('2026-02', 450_000, 520_000)],
  };
}

let snapshot: FundingSnap = snapWith(true, true);

beforeAll(() => {
  (globalThis as unknown as { serviceHub: unknown }).serviceHub = {
    getVersion: () => Promise.resolve('0.1.0'),
    listConfigured: () => Promise.resolve([]),
    fetchSnapshot: () => Promise.resolve({ ok: true, data: snapshot }),
    invoke: () => Promise.resolve({ ok: false, code: 'x', message: 'x' }),
    openExternal: () => Promise.resolve(),
    oauthSupported: () => Promise.resolve(false),
    setToken: () => Promise.resolve(),
    clearToken: () => Promise.resolve(),
  };
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
});

let host: HTMLDivElement;
let root: Root | null = null;

beforeEach(() => {
  host = document.createElement('div');
  document.body.appendChild(host);
});

afterEach(() => {
  if (root) {
    const r = root;
    root = null;
    act(() => {
      r.unmount();
    });
  }
  host.remove();
});

/**
 * 描いて → 「更新」を押して → **文字が変わるまで**待つ。
 *
 * `funding` は資格情報を要らないが自動取得もしないので (画面自身が
 * 「「更新」を押すと…読み込みます」と書いている)、押さずに読むと
 * **同梱の控えを見て通ってしまう空の検査**になる。最初にこれを踏んだ ——
 * 「連携中と言わない」が、取得前の画面に対して通っていた。
 */
async function render(snap: FundingSnap): Promise<string> {
  snapshot = snap;
  await act(async () => {
    root = createRoot(host);
    root.render(createElement(FundingPage));
  });
  await settleUntil(() => (host.textContent ?? '').includes('連携'), '資金調達の画面が描かれた');
  const before = host.textContent ?? '';
  const refresh = [...host.querySelectorAll('button')].find(
    (b) => (b.textContent ?? '').trim() === '更新',
  );
  expect(refresh, '「更新」ボタンが在る').toBeTruthy();
  await act(async () => {
    refresh?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
  // 固定回数の settle は待っていない、当てているだけ (パス 169)。
  await settleUntil(() => (host.textContent ?? '') !== before, '取得した控えで描き直された');
  return host.textContent ?? '';
}

describe('資金調達レーダー — 任意連携の名乗り', () => {
  // 凡例 (`accountingCfSeriesLabel`) は図の中に在り、図は別の関門
  // (集計の行が在るか) の内側なので、ここでは見ない ——
  // 文言そのものは `shared/__tests__/fundingLinkSource.test.ts` が留めている。
  // ここが見るのは、**取得できれば必ず出る 1 行**である。

  it('★ 見本の数字しか無いときは「連携中」と言わず、見本だと言う', async () => {
    const text = await render(snapWith(true, true));
    expect(text).toContain('同梱の見本 (未連携)');
    expect(text).not.toContain('連携中');
  });

  it('★ 対照: 実連携 (isMock を降ろす) なら従来どおり「連携中」', async () => {
    const text = await render(snapWith(true, false));
    expect(text).toContain('✅ 連携中');
    expect(text).not.toContain('同梱の見本 (未連携)');
  });

  it('★ 対照: 会計CF も株式評価額も持たないなら「未連携」', async () => {
    const text = await render(snapWith(false, true));
    expect(text).toContain('— 未連携');
    expect(text).not.toContain('連携中');
    expect(text).not.toContain('同梱の見本 (未連携)');
  });
});
