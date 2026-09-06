/** @vitest-environment jsdom */
/**
 * **選べないと宣言した方式で「最有利」を決めてはいけない。**
 *
 * 消費税の 3 方式のうち 2 つは条件付き —— 簡易課税は基準期間の課税売上高
 * 5,000 万円以下 + 事前届出、2 割特例はインボイス登録で免税から課税になった
 * 事業者の経過措置。2026-09-06 の実測では、この card は簡易課税の欄に
 * 「基準期間 5,000 万円超は選択不可」と**自分で書きながら**その欄に「· 最有利」を
 * 付け、税負担合計まで「消費税は最有利方式（簡易課税）で合算」と言っていた。
 * つまり**選べない方式で合計を出していた** (同じ枠の中で矛盾していた)。
 *
 * 2 割特例の側も同じ代理指標で外す: 登録の有無はアプリから見えないが、
 * **免税の水準を超える売上なら元から免税ではない**ので対象になりえない。
 *
 * ここは card の入力欄 (課税売上高 / 課税仕入高) を実際に打って場面を作る ——
 * props からの導出に頼ると、仕入が売上と同額になって本則が常に最安になり、
 * **どの場面でも通る空の検査**になってしまう (最初に書いた版がそれだった)。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { FinancialAnalysis, type FinancialUnit } from '../FinancialAnalysis';
import { TWENTY_PERCENT_MEASURE_END } from '../../../shared/taxConsumption';
import { formatDate } from '../../../shared/bankFormat';
import { DEFAULT_BUSINESS_CONSUMPTION_PARAMS } from '../../../shared/taxConsumptionBusiness';

const UNIT: FinancialUnit = {
  id: 'u',
  label: 'テスト事業',
  current: { revenue: 50_000_000, variableCost: 20_000_000, fixedCost: 15_000_000, profit: 10_000_000, profitMargin: 20 },
  history: [],
};

let container: HTMLDivElement;
let root: Root | null = null;

async function mount(): Promise<void> {
  root = createRoot(container);
  await act(async () => {
    root!.render(createElement(FinancialAnalysis, { units: [UNIT] }));
  });
}

function setNative(el: HTMLInputElement, value: string): void {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
  if (!setter) throw new Error('value setter not found');
  setter.call(el, value);
  el.dispatchEvent(new Event('input', { bubbles: true }));
}

/** 課税売上高と課税仕入高を打ち込む。 */
async function enter(sales: string, purchases: string): Promise<void> {
  const s = container.querySelector<HTMLInputElement>('#ct-sales');
  const p = container.querySelector<HTMLInputElement>('#ct-purchases');
  if (!s || !p) throw new Error('消費税の入力欄が見つからない');
  await act(async () => {
    setNative(s, sales);
  });
  await act(async () => {
    setNative(p, purchases);
  });
}

const html = () => container.innerHTML;

/**
 * 「· 最有利」の札が付いた方式。
 *
 * 免税見込み (課税売上が免税の水準以下) の場面では合計の枠が
 * 「免税見込みのため消費税 0 で合算」に変わるので、合算の文からは方式が読めない。
 * **勧めているのは札のほうなので、札を見る。**
 */
function bestBadge(): string {
  const m = /(本則課税|簡易課税|2割特例) · 最有利/.exec(container.textContent ?? '');
  return m ? m[1]! : '(札が無い)';
}

/** 税負担合計の枠に書かれた「どの方式で合算したか」。 */
function combinedWith(): string {
  const m = /消費税は最有利方式（([^）]*)）で合算/.exec(container.textContent ?? '');
  return m ? m[1]! : '(見つからない)';
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
  document.body.removeChild(container);
});

describe('FinancialAnalysis — 消費税の方式の選択可否', () => {
  it('★ 課税売上高 6,000 万円 / 仕入 600 万円: 簡易も 2 割特例も選べないので本則で合算する', async () => {
    await mount();
    await enter('60000000', '6000000');
    expect(combinedWith()).toBe('本則課税');
    expect(container.textContent).toContain('選択不可'); // 簡易課税の理由
    expect(container.textContent).toContain('対象外'); // 2 割特例の理由
  });

  it('★ その場面で「· 最有利」の札は本則課税の枠に付く', async () => {
    await mount();
    await enter('60000000', '6000000');
    expect(html()).toMatch(/本則課税<span[^>]*>\s*· 最有利<\/span>/);
    expect(html()).not.toMatch(/簡易課税<span[^>]*>\s*· 最有利<\/span>/);
    expect(html()).not.toMatch(/2割特例<span[^>]*>\s*· 最有利<\/span>/);
  });

  it('対照: 課税売上高 3,000 万円なら簡易課税が選べる (2 割特例だけ対象外)', async () => {
    await mount();
    await enter('30000000', '3000000');
    expect(combinedWith()).toBe('簡易課税');
    expect(html()).toMatch(/簡易課税<span[^>]*>\s*· 最有利<\/span>/);
    expect(container.textContent).toContain('対象外');
    expect(container.textContent).not.toContain('選択不可');
  });

  it('対照: 課税売上高 800 万円は免税見込みなので消費税 0 で合算する', async () => {
    await mount();
    await enter('8000000', '800000');
    expect(container.textContent).toContain('免税見込みのため消費税 0 で合算');
  });

  it('対照: 仕入が多ければ本則が最安なので、選択可否に関わらず本則で合算する', async () => {
    await mount();
    await enter('30000000', '29000000');
    expect(combinedWith()).toBe('本則課税');
  });
});

/**
 * **期限つきの措置は、期限が来ても勧め続ける。**
 *
 * `TWENTY_PERCENT_MEASURE_END = '2026-09-30'` は 2026-08-23 に「機械が読める形に
 * 置くだけ」で入り、判定には繋がっていなかった。2026-09-06 の実測で残り 24 日。
 * この節は時計を進めて、期限のあとで何が起きるかを実際に見る。
 *
 * 免税の水準 (課税売上 1,000 万円以下) の場面を作る —— そこが 2 割特例が
 * **いちばん安くなる**場面だからで、期限を見ていなければ必ず「最有利」に選ばれる。
 * 売上 800 万・仕入 0 なら 本則 80 万 / 簡易 (サービス業 50%) 40 万 / 2 割特例 16 万。
 */
describe('FinancialAnalysis — 2割特例の適用期限', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  /** Date だけを差し替える (React の scheduler は本物の setTimeout を使う)。 */
  const clockAt = (y: number, m: number, d: number): void => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(y, m - 1, d, 12, 0, 0));
  };

  it('★ 期限のあと (2027-09-30 以降) は 2割特例を最有利に選ばない — 最も安くても', async () => {
    clockAt(2027, 9, 30);
    await mount();
    await enter('8000000', '0');
    expect(bestBadge()).toBe('簡易課税');
    expect(container.textContent).toContain('適用期限（令和8年9月30日）が過ぎています');
  });

  it('対照: 期限内 (2026-09-30) なら 2割特例が最有利', async () => {
    clockAt(2026, 9, 30);
    await mount();
    await enter('8000000', '0');
    expect(bestBadge()).toBe('2割特例');
    expect(container.textContent).not.toContain('過ぎています');
  });

  it('★ 期限の翌日〜1年は選ばせる (課税期間が期限内の日を含みうる) が、条件を欄に書く', async () => {
    clockAt(2026, 10, 1);
    await mount();
    await enter('8000000', '0');
    expect(bestBadge()).toBe('2割特例');
    expect(container.textContent).toContain('令和8年9月30日を含む課税期間まで');
    expect(container.textContent).not.toContain('過ぎています');
  });

  it('期限の文面は定数から作る — 注記と欄で同じ日付になる', async () => {
    clockAt(2026, 9, 6);
    await mount();
    const label = formatDate(TWENTY_PERCENT_MEASURE_END, { era: 'wareki' });
    expect(label).toBe('令和8年9月30日');
    // 欄の caption と、下の注記の 2 か所。
    const hits = (container.textContent ?? '').split(label).length - 1;
    expect(hits).toBeGreaterThanOrEqual(2);
  });

  it('★ 上限の数字は設定の値で動く — 注記が計算と別の数字を言わない', async () => {
    clockAt(2026, 9, 6);
    root = createRoot(container);
    await act(async () => {
      root!.render(
        createElement(FinancialAnalysis, {
          units: [UNIT],
          businessConsumption: { ...DEFAULT_BUSINESS_CONSUMPTION_PARAMS, simplifiedEligibilityThreshold: 12_345_678 },
        }),
      );
    });
    await enter('60000000', '6000000');
    expect(container.textContent).toContain('基準期間の課税売上高 ￥12,345,678 以下');
    expect(container.textContent).toContain('基準期間￥12,345,678超は選択不可');
  });
});
