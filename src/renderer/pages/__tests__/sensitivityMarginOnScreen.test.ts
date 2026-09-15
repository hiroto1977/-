/** @vitest-environment jsdom */
/**
 * **売上 0 の期に「営業利益 −300,000円 ／ 営業利益率 0.0%」を同じ行に並べない。**
 *
 * 経営サマニーの損益感度分析は 4 列の表を出す。売上 0・固定費ありの控えでは
 * 2026-09-08 まで、どの行も次のようになっていた:
 *
 * | 売上変動 | 売上高 | 営業利益 | 営業利益率 |
 * | --- | ---: | ---: | ---: |
 * | −10% | ¥0 | **−¥300,000** (赤) | **0.0%** |
 * | 0% (現状) | ¥0 | **−¥300,000** (赤) | **0.0%** |
 * | +10% | ¥0 | **−¥300,000** (赤) | **0.0%** |
 *
 * **同時に真であり得ない 2 つの数字が隣り合っている** (パス 33 と同じ形)。
 *
 * ## 規準は「すぐ上の表」に在った
 *
 * 同じページの**月次推移**の表は、**同じ列名 (営業利益率) を同じ書式関数
 * (`pct1OrDash`) で刷る**が、値の出どころ `monthlyTrend` は
 * 「売上 0 → 割れない」で `null` を返すので「—」になる。
 * `overview.ts` の `pctOfRevenue` の注記が列挙する 5 か所も同じ規準で、
 * **`profitSensitivity.ts` だけが 6 か所目として取り残されていた**
 * (別モジュールなのでパス 52 の走査が届いていなかった)。
 *
 * ## 到達条件 (実測)
 *
 * `hasKpi = input.kpiActuals.length > 0` —— **売上は問わない。**
 * KPI 実績を 1 件でも入れれば節が出るので、**売上が立つ前の事業者
 * (販管費だけを記録している)** がそのまま踏む。
 *
 * ここは**実物の record store** (fake-indexeddb) に KPI 実績を 1 件入れて、
 * 実物の経営サマリーを描き、表の行を読む。
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

/** 売上が立つ前の事業者 (販管費 300,000 だけ)。 */
const NO_REVENUE: KpiActual = {
  period: '2026-04', unit: '全社', revenue: 0, cogs: 0, advertising: 0, sga: 300_000, depreciation: 0,
};
/** 売上 0 の 2 期目 (月次推移の節は 2 期以上でしか出ない)。 */
const NO_REVENUE_2: KpiActual = { ...NO_REVENUE, period: '2026-05' };
/** 対照: 売上が在る事業者 (限界利益率 60% / 営業利益率 30%)。 */
const WITH_REVENUE: KpiActual = {
  period: '2026-04', unit: '全社', revenue: 1_000_000, cogs: 400_000, advertising: 0, sga: 300_000, depreciation: 0,
};

async function seed(a: KpiActual): Promise<void> {
  await getRecordStore().insert<KpiActual>(KPI_ACTUALS_COLLECTION, a);
}

async function mountOverview(): Promise<void> {
  const def = SERVICES.find((s) => s.id === 'overview');
  if (!def) throw new Error('overview service missing');
  root = createRoot(container);
  await act(async () => {
    root!.render(createElement(def.page));
  });
  await settle();
}

/**
 * 損益感度分析の表の行を読む (`売上変動 / 売上高 / 営業利益 / 営業利益率`)。
 *
 * 月次推移の表も同じ 4〜5 列を持つので、**見出しで表を選ぶ** ——
 * 1 列目の見出しが「売上変動」の `table` だけを見る
 * (数え上げの取り違えは、パス 61 で実際にやった間違い)。
 */
function sensitivityRows(): string[][] {
  for (const table of Array.from(container.querySelectorAll('table'))) {
    const heads = Array.from(table.querySelectorAll('thead th')).map((th) => (th.textContent ?? '').trim());
    if (heads[0] !== '売上変動') continue;
    return Array.from(table.querySelectorAll('tbody tr')).map((tr) =>
      Array.from(tr.querySelectorAll('td')).map((td) => (td.textContent ?? '').trim()),
    );
  }
  return [];
}

/** 月次推移の表 (規準の側)。1 列目の見出しは「期間」。 */
function trendRows(): string[][] {
  for (const table of Array.from(container.querySelectorAll('table'))) {
    const heads = Array.from(table.querySelectorAll('thead th')).map((th) => (th.textContent ?? '').trim());
    if (heads[0] !== '期間') continue;
    return Array.from(table.querySelectorAll('tbody tr')).map((tr) =>
      Array.from(tr.querySelectorAll('td')).map((td) => (td.textContent ?? '').trim()),
    );
  }
  return [];
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

describe('経営サマリー 損益感度分析 — 売上 0 の期', () => {
  it('★ 対照: 売上が在れば 4 列すべて数で出る (表そのものが生きている)', async () => {
    await seed(WITH_REVENUE);
    await mountOverview();
    const rows = sensitivityRows();
    expect(rows.length).toBeGreaterThanOrEqual(5); // 既定 5 シナリオ
    const baseline = rows.find((r) => r[0]?.startsWith('0%'));
    expect(baseline).toBeDefined();
    // 売上 100 万・変動費 40 万・固定費 30 万 → 営業利益 30 万 → 30.0%
    expect(baseline![3]).toBe('30.0%');
  });

  it('★ 売上 0 の期は「0.0%」ではなく「—」を刷る', async () => {
    await seed(NO_REVENUE);
    await mountOverview();
    const rows = sensitivityRows();
    expect(rows.length).toBeGreaterThanOrEqual(5);
    for (const r of rows) {
      // 直す前は全行が '0.0%' だった
      expect(r[3]).toBe('—');
      expect(r[3]).not.toBe('0.0%');
    }
  });

  it('★ 同じ行の営業利益は赤字の額をそのまま出す (率だけが算定不能)', async () => {
    // **「率が出せない」と「額が分からない」は別**。固定費だけの赤字額は言える。
    await seed(NO_REVENUE);
    await mountOverview();
    const rows = sensitivityRows();
    for (const r of rows) {
      expect(r[2]).toContain('300,000');
      expect(r[2]).toContain('-'); // マイナス符号 (書式は Intl 依存なので符号だけ見る)
    }
  });

  it('★ すぐ上の月次推移表と答え方が一致する (ページ内の規準)', async () => {
    // 規準はこの表に最初から在った (`monthlyTrend` は売上 0 で null を返す)。
    // **同じページの同じ列名で違う答えを出さない** (パス 61 と同じ規則)。
    // 月次推移の節は `monthlyTrend.length >= 2` でしか出ないので 2 期入れる。
    await seed(NO_REVENUE);
    await seed(NO_REVENUE_2);
    await mountOverview();
    const trend = trendRows();
    const sens = sensitivityRows();
    expect(trend).toHaveLength(2);
    expect(sens.length).toBeGreaterThanOrEqual(5);
    const marginCells = new Set([...trend.map((r) => r[3]), ...sens.map((r) => r[3])]);
    expect(marginCells).toEqual(new Set(['—']));
  });

  it('★ 目標利益の逆算は「算定できません」と述べ、必要売上 0 円を刷らない', async () => {
    await seed(NO_REVENUE);
    await mountOverview();
    const input = container.querySelector<HTMLInputElement>('input[placeholder="目標営業利益 (円)"]');
    expect(input).not.toBeNull();
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
    await act(async () => {
      setter?.call(input!, '1000000');
      input!.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await settle();
    const t = (container.textContent ?? '').replace(/\s+/g, ' ');
    expect(t).toContain('限界利益が非正のため算定できません');
    // **不在の主張には標本を添える** —— 節の見出し自身が「必要売上を逆算」を
    // 含むので、`toContain('必要売上')` はどの状態でも当たる空の検査になる。
    // 刷り出しの形 (`必要売上 ￥…`) だけを見て、下の対照でこの形が
    // **実際に当たること**を確かめる。
    expect(t).not.toMatch(/必要売上\s*￥/);
  });

  it('★ 対照: 売上が在れば必要売上が数で出る (上の不在の検査が空でない証拠)', async () => {
    await seed(WITH_REVENUE);
    await mountOverview();
    const input = container.querySelector<HTMLInputElement>('input[placeholder="目標営業利益 (円)"]');
    expect(input).not.toBeNull();
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
    await act(async () => {
      setter?.call(input!, '1000000');
      input!.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await settle();
    const t = (container.textContent ?? '').replace(/\s+/g, ' ');
    // 固定費 30 万 + 目標 100 万 ÷ 限界利益率 0.6 = 2,166,667 円
    expect(t).toMatch(/必要売上\s*￥/);
    expect(t).toContain('2,166,667');
    expect(t).not.toContain('限界利益が非正のため算定できません');
  });
});
