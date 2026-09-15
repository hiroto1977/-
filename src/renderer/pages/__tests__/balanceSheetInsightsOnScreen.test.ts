/** @vitest-environment jsdom */
/**
 * **貸借対照表の分析 101 行が、検査からしか呼ばれていなかった。** (2026-09-10)
 *
 * `computeBalanceSheetInsights` と `BalanceSheetInsights` の 10 欄は production から
 * **1 度も呼ばれておらず**、参照は検査 39 か所だけだった。`mutate` 台帳に載っているので
 * 変異体は 100% のスコアに算入され、**利用者が届かない範囲を測って「守られている」ように
 * 見せている**状態 (無言の pragma と同じ形)。
 *
 * 配線する前に、モジュールの申し送りが挙げていた 2 つを先に済ませた:
 *
 *   1. `interestBearingDebt` の**入力欄がどの画面にも無かった** → KPI の BS フォームに足した
 *   2. `?? 0` が「未入力」を「借入なし」に畳んでいた → `null` = 算定不能にした
 *
 * ここで留めるのは「画面に届いていること」と「届いた先で嘘を言わないこと」である。
 */
import 'fake-indexeddb/auto';
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { KpiPage } from '../KpiPage';
import { getRecordStore } from '../../data/store';
import { _resetCollectionSubscribersForTests } from '../../data/useCollection';
import { BALANCE_SHEET_COLLECTION } from '../../data/balanceSheet';
import { resetRecordStore } from '../../__tests__/recordStoreHarness';

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

async function settle(): Promise<void> {
  for (let i = 0; i < 6; i += 1) {
    await act(async () => {
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    });
  }
}

let container: HTMLDivElement;
let root: Root | null = null;

beforeEach(async () => {
  localStorage.clear();
  _resetCollectionSubscribersForTests();
  await resetRecordStore();
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

const text = () => container.textContent ?? '';

/** ネットデットのタイルが「実質無借金」と**判定した**ときだけ出る副題。 */
const NET_CASH_CLAIM = '実質無借金 (現預金が上回る)';

/** 基本形 (資産 1,000 / 負債 400 → 純資産 600)。上書きしたい欄だけ渡す。 */
async function seedBs(extra: Record<string, unknown>): Promise<void> {
  await getRecordStore().insert(BALANCE_SHEET_COLLECTION, {
    asOf: '2026-08-31',
    currentAssets: 600, inventory: 100, accountsReceivable: 100,
    fixedAssets: 400, currentLiabilities: 200, accountsPayable: 100,
    fixedLiabilities: 200, netIncome: 50,
    ...extra,
  });
}

async function mountKpi(): Promise<void> {
  root = createRoot(container);
  await act(async () => {
    root!.render(createElement(KpiPage));
  });
  await settle();
}

describe('KPI — 貸借対照表の分析が画面に出る', () => {
  it('★ 有利子負債と現預金を入れると、ネットデット・有利子負債比率が出る', async () => {
    await seedBs({ cash: 150, interestBearingDebt: 300 });
    await mountKpi();
    const body = text();
    expect(body).toContain('ネットデット');
    expect(body).toContain('有利子負債比率');
    // 300 − 150 = 150 / 300 ÷ 1,000 = 30%
    expect(body).toContain('30%');
    expect(body).not.toContain('有利子負債が未入力のため');
  });

  it('★ 有利子負債が未入力なら「—」と、算定していない理由を出す (実質無借金と言わない)', async () => {
    await seedBs({ cash: 150 });
    await mountKpi();
    const body = text();
    expect(body).toContain('ネットデット');
    expect(body).toContain('有利子負債が未入力のため');
    expect(body).toContain('借入が無いなら 0 と入力してください');
    // 未入力を「実質無借金」と**判定として**言わない。
    // **綴りだけで見てはいけない** —— フォームの説明文が「空欄を『借入なし』と読むと
    // 『実質無借金』という都合の良い答えが出る」と書いており、その語を含む
    // (パス 98 で 1 度踏んだ「自分の説明文を欠陥として数える」形)。
    // 判定はタイルの副題なので、その文面ごと見る。
    expect(body).not.toContain(NET_CASH_CLAIM);
  });

  it('★ 0 と入力したときは算定し、実質無借金と言ってよい', async () => {
    await seedBs({ cash: 150, interestBearingDebt: 0 });
    await mountKpi();
    const body = text();
    expect(body).toContain(NET_CASH_CLAIM);
    expect(body).not.toContain('有利子負債が未入力のため');
  });

  it('★ 実質債務超過の懸念は、算定できたときだけ警告する', async () => {
    // 純資産 600 に対しネットデット 800 − 50 = 750 > 600。
    await seedBs({ cash: 50, interestBearingDebt: 800 });
    await mountKpi();
    expect(text()).toContain('実質債務超過の懸念');
  });

  it('対照: 懸念が無い形では警告を出さない', async () => {
    await seedBs({ cash: 150, interestBearingDebt: 300 });
    await mountKpi();
    expect(text()).not.toContain('実質債務超過の懸念');
  });

  it('入力欄そのものが在る (それまでどの画面にも無かった)', async () => {
    await mountKpi();
    const has = Array.from(container.querySelectorAll('input')).some(
      (el) => el.getAttribute('placeholder') === '有利子負債',
    );
    expect(has, '「有利子負債」の入力欄が見つからない').toBe(true);
  });
});
