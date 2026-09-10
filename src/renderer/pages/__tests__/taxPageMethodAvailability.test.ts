/** @vitest-environment jsdom */
/**
 * **税務ページ ⑩ も、選べない方式を「最も納付が少ない方式」と呼んでいた。**
 *
 * 2026-09-06 の実測。⑩ は 3 方式の最小値をそのまま
 * 「✅ 最も納付が少ない方式」に出しており、可否をどこでも見ていなかった ——
 * すぐ上の説明文が「簡易課税は基準期間の課税売上5,000万円以下」と書いているのに、
 * その水準を超えても簡易課税を勧めるし、2 割特例は**適用期限を過ぎても**勧める。
 * 同じ不整合を経営分析の card で直したとき (`FinancialAnalysis.ctEligibility`)、
 * **こちらは見落としていた**。3 方式の比較は 2 か所にある。
 *
 * ここは 1 つの場面で両方を測る —— 期限を過ぎた時計 + 簡易課税の境目を
 * 既定の課税売上より下に上書きすると、選べるのは本則だけになる。
 * 金額そのものは 3 方式とも今までどおり出る (参考として消さない) ので、
 * 見るのは**どれを勧めているか**と**外した理由が書かれているか**。
 */
import 'fake-indexeddb/auto';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { TaxPage } from '../TaxPage';
import { _resetRecordStoreForTests, getRecordStore } from '../../data/store';
import { _resetCollectionSubscribersForTests } from '../../data/useCollection';
import { PARAMETER_OVERRIDES_COLLECTION } from '../../data/parameterOverrides';
import { compareBusinessTaxMethods } from '../../../shared/taxConsumptionBusiness';
import { jpy } from '../../../shared/formatters';
import type { ParameterOverrides } from '../../../shared/parameters';

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
  for (let i = 0; i < 6; i += 1) {
    await act(async () => {
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    });
  }
}

async function seed(overrides: ParameterOverrides): Promise<void> {
  await getRecordStore().insert(PARAMETER_OVERRIDES_COLLECTION, { values: { ...overrides } });
}

async function mount(): Promise<void> {
  root = createRoot(container);
  await act(async () => {
    root!.render(createElement(TaxPage));
  });
  await settle();
}

const text = (): string => container.textContent ?? '';

/**
 * 事業形態の切替 (節税制度カタログと ⑩ が共有する `entity`・既定は個人事業主)。
 * 2割特例の期限の帯と 3割特例の対象 (個人事業者だけ) がこれで決まる (パス 141)。
 */
async function chooseEntity(label: '個人事業主' | '法人'): Promise<void> {
  const button = Array.from(container.querySelectorAll<HTMLButtonElement>('button[aria-pressed]')).find((b) => b.textContent === label);
  if (!button) throw new Error(`事業形態のボタン ${label} が無い`);
  await act(async () => {
    button.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
  await settle();
}

/** 「✅ 最も納付が少ない方式: ○○」の ○○。 */
function recommended(): string {
  const m = /最も納付が少ない方式:\s*(本則課税|簡易課税|2割特例|3割特例)/.exec(text());
  return m ? m[1]! : '(見つからない)';
}

/**
 * 既定の入力 (課税売上 800 万・課税仕入 300 万・サービス業) の 3 方式。
 * **画面と同じ純関数から出す** — 数字を書き写すと、率が変わったとき検査だけが古くなる。
 */
const DEFAULTS = compareBusinessTaxMethods(
  [{ type: 'service', sales: { standard: 8_000_000, reduced: 0 } }],
  { standard: 3_000_000, reduced: 0 },
);

/** Date だけを差し替える (React の scheduler は本物の setTimeout を使う)。 */
function clockAt(y: number, m: number, d: number): void {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(y, m - 1, d, 12, 0, 0));
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
  vi.useRealTimers();
  if (root) {
    await act(async () => {
      root!.unmount();
    });
    root = null;
  }
  document.body.removeChild(container);
});

describe('TaxPage ⑩ — 選べる方式の中から勧める', () => {
  it('前提: 既定の入力では 2割特例 が最も安い (だから可否を見なければ必ず勧められる)', () => {
    expect(DEFAULTS.twentyPercent).toBeLessThan(DEFAULTS.simplified);
    expect(DEFAULTS.simplified).toBeLessThan(DEFAULTS.standard);
  });

  it('対照: 期限内・境目より下の売上なら 2割特例を勧める (今までどおり)', async () => {
    clockAt(2026, 9, 6);
    await mount();
    expect(recommended()).toBe('2割特例');
    // 3割特例はまだ対象年分の前 (令和 9 年分から) なので候補に入らず、その理由だけが書かれる。
    // 簡易課税・2割特例は外していない (対照 —— 外した文面は下の ★ が標本)。
    expect(text()).toContain('3割特例（令和9年分・令和10年分から）');
    // 外した理由の文面そのもので当てる —— 「簡易課税（」「2割特例（」は ⑩ の説明文と
    // 節税制度カタログにも在るので、綴りの断片では**どの場面でも鳴らない**空の検査になる。
    expect(text()).not.toContain('簡易課税（基準期間の課税売上');
    expect(text()).not.toContain('2割特例（適用期限');
  });

  it('★ 適用期限を過ぎた時計では 2割特例を勧めない — 最も安くても (法人: 後継の 3割特例も無い)', async () => {
    clockAt(2027, 9, 30);
    await mount();
    await chooseEntity('法人');
    expect(recommended()).toBe('簡易課税');
    expect(text()).toContain('2割特例（適用期限 令和8年9月30日 経過）');
    expect(text()).toContain('3割特例（法人は対象外）');
    expect(text()).toContain('現在 法人');
  });

  it('★ 個人事業者は令和 9 年分から 3割特例を勧める — 2割特例は終了、簡易課税より安い (パス 141)', async () => {
    clockAt(2027, 9, 30);
    await mount(); // 既定の事業形態は個人事業主
    expect(DEFAULTS.thirtyPercent).toBeLessThan(DEFAULTS.simplified);
    expect(recommended()).toBe('3割特例');
    expect(text()).toContain('2割特例（適用期限 令和8年9月30日 経過）');
    // 3割特例は外していない (外した理由の 3 つの文面のどれも出ない)。
    expect(text()).not.toContain('3割特例（法人は対象外）');
    expect(text()).not.toContain('3割特例（令和9年分・令和10年分から）');
    expect(text()).not.toContain('3割特例（令和9年分・令和10年分で終了）');
    expect(text()).toContain('現在 個人事業主');
  });

  it('★ 簡易課税の境目を超える売上では簡易課税を勧めない', async () => {
    clockAt(2027, 9, 30); // 2割特例も外れる場面にして、残るのが本則だけになるようにする
    await seed({ 'consumptionBusiness.simplifiedEligibilityThreshold': 5_000_000 });
    await mount();
    await chooseEntity('法人'); // 個人事業者なら 3割特例が残る (上の ★)
    expect(recommended()).toBe('本則課税');
    expect(text()).toContain('簡易課税（基準期間の課税売上¥5,000,000超）');
    expect(text()).toContain('2割特例（適用期限 令和8年9月30日 経過）');
  });

  it('個人事業者でも対象年分の後 (2029 年) は 3割特例を勧めない — 残るのは本則だけ', async () => {
    clockAt(2029, 1, 15);
    await seed({ 'consumptionBusiness.simplifiedEligibilityThreshold': 5_000_000 });
    await mount();
    expect(recommended()).toBe('本則課税');
    expect(text()).toContain('3割特例（令和9年分・令和10年分で終了）');
    expect(text()).toContain('2割特例（適用期限 令和8年9月30日 経過）');
  });

  it('★ 外しても 4 方式の金額は出し続ける (参考として消さない)', async () => {
    clockAt(2027, 9, 30);
    await seed({ 'consumptionBusiness.simplifiedEligibilityThreshold': 5_000_000 });
    await mount();
    await chooseEntity('法人');
    expect(text()).toContain(jpy(DEFAULTS.standard));
    expect(text()).toContain(jpy(DEFAULTS.simplified));
    expect(text()).toContain(jpy(DEFAULTS.twentyPercent));
    expect(text()).toContain(jpy(DEFAULTS.thirtyPercent));
  });

  it('期限の文面は定数から作る — 「令和8年分まで」の書き写しを残さない', async () => {
    clockAt(2026, 9, 6);
    await mount();
    expect(text()).toContain('令和8年9月30日を含む課税期間まで');
    expect(text()).not.toContain('令和8年分まで');
  });
});
