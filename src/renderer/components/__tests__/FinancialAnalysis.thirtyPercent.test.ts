/** @vitest-environment jsdom */
/**
 * **2割特例の後を、法人と個人で分ける** (2026-09-10 · パス 141)。
 *
 * 令和 8 年度税制改正で 2割特例は令和 8 年 9 月 30 日の属する課税期間で終了し、個人事業者に限り
 * 令和 9 年分・令和 10 年分の「3割特例」(納付税額 = 売上税額 × 30%) が創設された。法人に後継は無い。
 * 2026-09-10 まで経営分析の消費税カードは事業形態を持たず、2027 年の個人事業者には 3 方式しか
 * 示せなかった —— 期限が来れば 2割特例が消えるだけで、後継を言わない。
 *
 * ここは**実物のカードを 2027 年の時計で描き**、事業形態の切替で何が候補に入るかを見る。
 * 既定は「未選択」: 分からないまま 3割特例を勧めない (対照)。
 */
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { FinancialAnalysis, type FinancialUnit } from '../FinancialAnalysis';
import { compareBusinessTaxMethods } from '../../../shared/taxConsumptionBusiness';
import { deriveBusinessFinancials } from '../../data/businessFinancials';
import { thirtyPercentMeasureYearsLabel } from '../../../shared/taxConsumption';

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

/**
 * 免税の水準 (1,000 万円) の下の事業 —— 2割特例・3割特例の対象になりうる。
 * `current` は**月次**の KPI で、カードは年換算 (×12) してから消費税を組む
 * (`deriveBusinessFinancials`)。年商 840 万円 = 免税の水準以下。
 */
const UNIT: FinancialUnit = {
  id: 'u',
  label: '小規模事業',
  current: { revenue: 700_000, variableCost: 200_000, fixedCost: 300_000, profit: 200_000, profitMargin: 28.6 },
  history: [],
};

let container: HTMLDivElement;
let root: Root | null = null;
const yen = new Intl.NumberFormat('ja-JP', { style: 'currency', currency: 'JPY', maximumFractionDigits: 0 });

async function settle(): Promise<void> {
  for (let i = 0; i < 4; i += 1) {
    await act(async () => {
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    });
  }
}

async function mount(): Promise<void> {
  root = createRoot(container);
  await act(async () => {
    root!.render(createElement(FinancialAnalysis, { units: [UNIT] }));
  });
  await settle();
}

/** Date だけを差し替える (React の scheduler は本物の setTimeout を使う)。 */
function clockAt(y: number, m: number, d: number): void {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(y, m - 1, d, 12, 0, 0));
}

async function chooseKind(value: 'unknown' | 'sole-proprietor' | 'corporation'): Promise<void> {
  const select = container.querySelector<HTMLSelectElement>('select#ct-kind');
  if (!select) throw new Error('事業形態の select が無い');
  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value')?.set;
    setter?.call(select, value);
    select.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await settle();
}

const text = (): string => container.textContent ?? '';

/** 「3割特例 · 最有利」の札が付いているか (カードの見出しの直後に付く)。 */
function isBest(label: string): boolean {
  return new RegExp(`${label}\\s*· 最有利`).test(text());
}

/**
 * 画面と同じ純関数から出す (数字を写さない)。空欄の既定は年商と、
 * 費用から給与・償却・利息を除いた概算仕入 (`FinancialAnalysis.consumptionTax.test.ts` と同じ組み方)。
 */
function expected(available: { twentyPercent: boolean; thirtyPercent: boolean }) {
  const fin = deriveBusinessFinancials(UNIT.current);
  const purchases = Math.max(
    0,
    fin.revenue - fin.ordinaryProfit - fin.laborCost - fin.depreciation - (fin.interestExpense ?? 0),
  );
  return compareBusinessTaxMethods(
    [{ type: 'service', sales: { standard: Math.max(0, fin.revenue), reduced: 0 } }],
    { standard: purchases, reduced: 0 },
    undefined,
    { simplified: true, ...available },
  );
}

beforeEach(() => {
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

describe('消費税カード — 3割特例 (2割特例の後継) は事業形態で決まる', () => {
  it('★ 2027 年・未選択: 3割特例の額は出るが候補に入らず、「事業形態を選ぶと候補に入ります」と書く', async () => {
    clockAt(2027, 6, 1);
    await mount();
    expect(text()).toContain('3割特例');
    expect(text()).toContain(`事業形態を選ぶと候補に入ります`);
    expect(isBest('3割特例')).toBe(false);
    // 未選択の 2割特例は「期限を含む課税期間」の帯 (言い切れない) なので候補に残る。
    const e = expected({ twentyPercent: true, thirtyPercent: false });
    expect(text()).toContain(yen.format(e.thirtyPercent));
    expect(isBest('2割特例')).toBe(e.best === 'twenty-percent');
  });

  it('★ 2027 年・個人事業者: 2割特例は令和8年分で終了、3割特例が対象年分で最有利になる', async () => {
    clockAt(2027, 6, 1);
    await mount();
    await chooseKind('sole-proprietor');
    expect(text()).toContain('個人事業者は令和8年分で終了');
    expect(text()).toContain(`${thirtyPercentMeasureYearsLabel()}の対象年分です`);
    const e = expected({ twentyPercent: false, thirtyPercent: true });
    expect(e.best).toBe('thirty-percent'); // 前提: 小規模事業なら 3割特例が最も安い
    expect(isBest('3割特例')).toBe(true);
    expect(isBest('2割特例')).toBe(false);
    // 免税見込みの場面なので合計の枠は「免税見込みのため消費税 0 で合算」——
    // 方式は札のほうにしか出ない (`FinancialAnalysis.ctEligibility.test.ts` と同じ理由)。
    expect(text()).toContain('免税見込みのため消費税 0 で合算');
  });

  it('★ 2027 年・法人: 3割特例は「法人は対象外」で候補に入らない (2割特例は課税期間しだいで残る)', async () => {
    clockAt(2027, 6, 1);
    await mount();
    await chooseKind('corporation');
    expect(text()).toContain('法人は対象外');
    expect(isBest('3割特例')).toBe(false);
    const e = expected({ twentyPercent: true, thirtyPercent: false });
    expect(isBest(e.best === 'twenty-percent' ? '2割特例' : '簡易課税')).toBe(true);
  });

  it('対照: 2026 年・個人事業者は 2割特例が令和8年分まで使え、3割特例は「令和9年分から」でまだ候補に入らない', async () => {
    clockAt(2026, 9, 9);
    await mount();
    await chooseKind('sole-proprietor');
    expect(text()).toContain('個人事業者は令和8年分まで');
    expect(text()).toContain(`${thirtyPercentMeasureYearsLabel()}から`);
    expect(isBest('3割特例')).toBe(false);
    const e = expected({ twentyPercent: true, thirtyPercent: false });
    expect(e.best).toBe('twenty-percent');
    expect(isBest('2割特例')).toBe(true);
  });

  it('2029 年・個人事業者: 3割特例は「終了しました」で候補に入らない', async () => {
    clockAt(2029, 1, 15);
    await mount();
    await chooseKind('sole-proprietor');
    expect(text()).toContain(`${thirtyPercentMeasureYearsLabel()}で終了しました`);
    expect(isBest('3割特例')).toBe(false);
    expect(isBest('2割特例')).toBe(false);
  });
});
