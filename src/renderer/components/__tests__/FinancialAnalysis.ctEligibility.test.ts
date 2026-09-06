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
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { FinancialAnalysis, type FinancialUnit } from '../FinancialAnalysis';

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
