/** @vitest-environment jsdom */
/**
 * **「経営スコアカード — 総合 0/100（要改善）」を、採点せずに見出しへ掲げない。**
 *
 * 経営サマリーは同じ判定を**4 か所**に出す:
 *
 * | 面 | 直す前の文面 |
 * | --- | --- |
 * | 経営ハイライトの見出し | 総合 **0/100（要改善）** |
 * | 経営スコアカードの見出し | 総合 **0/100（要改善）** |
 * | `bankSubmission.ts` §9 (**金融機関等提出用の書面**) | 総合スコア **0／100** ／ 評価 **要改善** |
 * | `managementReport.ts` (**役員会・銀行・税理士向け Markdown**) | 経営スコア **0 / 100** (要改善) |
 *
 * 出どころは 1 つ —— `buildManagementScorecard` が「採点できたカテゴリが 0 件」の
 * とき `overallScore: 0` を返し、それが `verdict` を通って `'poor'` になっていた。
 *
 * ## 規準は同じファイルの下にあった
 *
 * `weightedOverallScore` (同じモジュールの後半) は同じ条件で
 * `score: null` / `verdict: null` を返すと doc に明記している ——
 * **1 つのファイルの中に正しい形と倒れる形が両方在った** (パス 60 の双子)。
 *
 * ## 到達条件 (実測)
 *
 * 節は `overview.kpi.hasData` で出る = `kpiActuals.length > 0`。
 * 売上 0 の期を 1 件入れると、`operatingMarginPct` などはすべて `null` →
 * `?? undefined` で入力から落ちる → **全カテゴリ null → 未算定**。
 * つまり**売上が立つ前の事業者**がそのまま踏む (パス 71 と同じ入口)。
 */
import 'fake-indexeddb/auto';
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { SERVICES } from '../../services';
import { _resetRecordStoreForTests, getRecordStore } from '../../data/store';
import { _resetCollectionSubscribersForTests } from '../../data/useCollection';
import { KPI_ACTUALS_COLLECTION, type KpiActual } from '../../data/kpiActuals';

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

/** 売上が立つ前 (販管費だけ)。採点できる指標が 1 つも出ない。 */
const NO_REVENUE: KpiActual = {
  period: '2026-04', unit: '全社', revenue: 0, cogs: 0, advertising: 0, sga: 300_000, depreciation: 0,
};
/** 対照: 採点できる事業者 (営業利益率 30% → 収益性が採点される)。 */
const WITH_REVENUE: KpiActual = {
  period: '2026-04', unit: '全社', revenue: 1_000_000, cogs: 400_000, advertising: 0, sga: 300_000, depreciation: 0,
};

async function mountWith(a: KpiActual): Promise<void> {
  await getRecordStore().insert<KpiActual>(KPI_ACTUALS_COLLECTION, a);
  const def = SERVICES.find((s) => s.id === 'overview');
  if (!def) throw new Error('overview service missing');
  root = createRoot(container);
  await act(async () => {
    root!.render(createElement(def.page));
  });
  await settle();
}

/** 「経営スコアカード」で始まる節の見出しの文字列。 */
function scorecardHeading(): string {
  for (const el of Array.from(container.querySelectorAll('*'))) {
    const t = (el.textContent ?? '').trim();
    if (el.children.length === 0 && t.startsWith('経営スコアカード')) return t;
  }
  return '';
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
  container.remove();
});

describe('経営サマリー — 採点できる指標が無いときの見出し', () => {
  it('★ 「総合 0/100（要改善）」ではなく「未算定」と掲げる', async () => {
    await mountWith(NO_REVENUE);
    const h = scorecardHeading();
    expect(h).not.toBe('');
    // 直す前の文面
    expect(h).not.toContain('0/100');
    expect(h).not.toContain('要改善');
    expect(h).toContain('未算定');
    expect(h).toContain('採点できる指標が未入力');
  });

  it('★ 対照: 採点できれば数と判定を掲げる (上の不在の検査が空でない証拠)', async () => {
    await mountWith(WITH_REVENUE);
    const h = scorecardHeading();
    // 営業利益率 30% / 粗利率 60% → 収益性 100 → 総合 100（優良）
    expect(h).toMatch(/総合 \d+\/100（(要改善|注意|良好|優良)）/);
    expect(h).not.toContain('未算定');
  });

  it('★ ページ全体でも「0/100」を刷らない (見出しは 2 か所ある)', async () => {
    // 経営ハイライトの見出しも同じ判定を出す。**片方だけ直すのが
    // パス 66 でやった失敗**なので、ページ全体を見る。
    await mountWith(NO_REVENUE);
    const t = (container.textContent ?? '').replace(/\s+/g, ' ');
    expect(t).not.toContain('総合 0/100');
  });
});
