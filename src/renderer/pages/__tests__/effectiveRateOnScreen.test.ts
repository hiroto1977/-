/** @vitest-environment jsdom */
/**
 * **「法人税等（合計）70,000 円」と「実効税率 0.0%」を並べない。**
 *
 * 実効税率は**控除後の課税所得**で割る。2026-09-08 まで割れないときに 0 へ
 * 倒しており、画面の関門は `ordinaryProfit <= 0` (**税引前利益**) を見ていた ——
 * **値が割る量と関門が見る量が別**だったので、繰越欠損金で控除しきった期は
 * 関門が開いたまま `0.0%` が出た。
 *
 * | 控え | 税引前利益 | 控除後所得 | 法人税等合計 | 直す前の画面 |
 * | --- | ---: | ---: | ---: | ---: |
 * | 欠損 | −200,000 | 0 | 70,000 円 | ―(関門が閉じた) |
 * | **所得 500 万・繰越欠損 5,000 万** | **5,000,000** | **0** | **70,000 円** | **0.0%** |
 *
 * ここは**実物の入力欄に繰越欠損金を打ち込んで**画面を見る。
 */
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { FinancialAnalysis, type FinancialUnit } from '../../components/FinancialAnalysis';
import { SNAPSHOT } from '../../data/snapshot';

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
  for (let i = 0; i < 4; i += 1) {
    await act(async () => {
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    });
  }
}

/**
 * 財務分析パネルを描く。`units` は **OverviewPage が組む形**をそのまま使う
 * (snapshot の事業ユニット。画面の既定の並びで先頭が選択される)。
 */
const UNITS: readonly FinancialUnit[] = SNAPSHOT.business.units.map((u) => ({
  id: u.id,
  label: u.label,
  sample: true,
  current: {
    revenue: u.current.revenue,
    variableCost: u.current.variableCost,
    fixedCost: u.current.fixedCost,
    profit: u.current.profit,
    profitMargin: u.current.profitMargin,
  },
  history: u.history.map((h) => ({
    revenue: h.revenue,
    variableCost: h.variableCost,
    fixedCost: h.fixedCost,
    profit: h.profit,
    profitMargin: h.profitMargin,
  })),
}));

async function mountPanel(): Promise<void> {
  root = createRoot(container);
  await act(async () => {
    root!.render(createElement(FinancialAnalysis, { units: UNITS }));
  });
  await settle();
}

const text = (): string => (container.textContent ?? '').replace(/\s+/g, ' ');

/** 実効税率タイルの値だけを読む (画面の他の「%」に当たらないように)。 */
function effectiveRateCell(): string | null {
  for (const box of Array.from(container.querySelectorAll('div'))) {
    const kids = Array.from(box.children);
    if (kids.length !== 2) continue;
    if ((kids[0]?.textContent ?? '').trim() !== '実効税率（概算）') continue;
    return (kids[1]?.textContent ?? '').trim();
  }
  return null;
}

/** 法人税等（合計）タイルの値。 */
function totalTaxCell(): string | null {
  for (const box of Array.from(container.querySelectorAll('div'))) {
    const kids = Array.from(box.children);
    if (kids.length !== 2) continue;
    if ((kids[0]?.textContent ?? '').trim() !== '法人税等（合計）') continue;
    return (kids[1]?.textContent ?? '').trim();
  }
  return null;
}

/** React の制御された input へ値を入れる。 */
async function typeInto(label: string, value: string): Promise<void> {
  const el = container.querySelector<HTMLInputElement>(`input[aria-label="${label}"]`);
  if (!el) throw new Error(`input "${label}" not found`);
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
  await act(async () => {
    setter?.call(el, value);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await settle();
}

beforeEach(() => {
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

describe('財務分析 — 実効税率は割れないとき「—」', () => {
  it('★ 対照: 控除後に所得が残れば率は % で出る (標本が在ることの確認)', async () => {
    await mountPanel();
    const cell = effectiveRateCell();
    expect(cell).not.toBeNull();
    expect(cell).toMatch(/^\d+\.\d%$/);
  });

  it('★ 繰越欠損金で控除しきると「—」になり、0.0% を刷らない', async () => {
    await mountPanel();
    // snapshot の経常利益を上回る繰越欠損金を打ち込む (控除後の課税所得 0)
    await typeInto('繰越欠損金', '100000000');
    expect(effectiveRateCell()).toBe('—');
    // **税額は在る** (均等割) —— この 2 つが並ぶことが元の欠陥だった
    const total = totalTaxCell();
    expect(total).not.toBeNull();
    expect(total).not.toBe('¥0');
    expect(text()).toContain('繰越欠損金控除');
  });

  it('★ 打ち込みを消せば率が戻る (関門が値に追随していること)', async () => {
    await mountPanel();
    await typeInto('繰越欠損金', '100000000');
    expect(effectiveRateCell()).toBe('—');
    await typeInto('繰越欠損金', '');
    expect(effectiveRateCell()).toMatch(/^\d+\.\d%$/);
  });
});
