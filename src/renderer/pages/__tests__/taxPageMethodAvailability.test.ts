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

/** 「✅ 最も納付が少ない方式: ○○」の ○○。 */
function recommended(): string {
  const m = /最も納付が少ない方式:\s*(本則課税|簡易課税|2割特例)/.exec(text());
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
    expect(text()).not.toContain('選べない方式は比較から外しています');
  });

  it('★ 適用期限を過ぎた時計では 2割特例を勧めない — 最も安くても', async () => {
    clockAt(2027, 9, 30);
    await mount();
    expect(recommended()).toBe('簡易課税');
    expect(text()).toContain('2割特例（適用期限 令和8年9月30日 経過）');
  });

  it('★ 簡易課税の境目を超える売上では簡易課税を勧めない', async () => {
    clockAt(2027, 9, 30); // 2割特例も外れる場面にして、残るのが本則だけになるようにする
    await seed({ 'consumptionBusiness.simplifiedEligibilityThreshold': 5_000_000 });
    await mount();
    expect(recommended()).toBe('本則課税');
    expect(text()).toContain('簡易課税（基準期間の課税売上¥5,000,000超）');
    expect(text()).toContain('2割特例（適用期限 令和8年9月30日 経過）');
  });

  it('★ 外しても 3 方式の金額は出し続ける (参考として消さない)', async () => {
    clockAt(2027, 9, 30);
    await seed({ 'consumptionBusiness.simplifiedEligibilityThreshold': 5_000_000 });
    await mount();
    expect(text()).toContain(jpy(DEFAULTS.standard));
    expect(text()).toContain(jpy(DEFAULTS.simplified));
    expect(text()).toContain(jpy(DEFAULTS.twentyPercent));
  });

  it('期限の文面は定数から作る — 「令和8年分まで」の書き写しを残さない', async () => {
    clockAt(2026, 9, 6);
    await mount();
    expect(text()).toContain('令和8年9月30日を含む課税期間まで');
    expect(text()).not.toContain('令和8年分まで');
  });
});
