/** @vitest-environment jsdom */
/**
 * FinancialAnalysis コンポーネント内の「法人税等の概算」ブロック (CorporateTaxCard) の
 * レンダー検証テスト (round 55)。
 *
 * - renderToStaticMarkup で同期 SSR し、クラッシュ / 表示要素を検証する。
 * - 黒字 / 欠損の 2 分岐を確認する。
 * - 既存の FinancialAnalysis テストと同じ jsdom 環境。
 *
 * **概算試算であり税務助言ではありません。**
 */
import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { FinancialAnalysis } from '../FinancialAnalysis';
import type { FinancialUnit } from '../FinancialAnalysis';

/** テスト用の最小 FinancialUnit。revenue が正なら黒字事業になる。 */
function makeUnit(overrides: Partial<{
  revenue: number;
  variableCost: number;
  fixedCost: number;
  profit: number;
  profitMargin: number;
}>): FinancialUnit {
  return {
    id: 'test-unit',
    label: 'テスト事業',
    current: {
      revenue: overrides.revenue ?? 50_000_000,        // 月次 5000万
      variableCost: overrides.variableCost ?? 20_000_000,
      fixedCost: overrides.fixedCost ?? 15_000_000,
      profit: overrides.profit ?? 10_000_000,           // 月次 1000万 → 年次1.2億
      profitMargin: overrides.profitMargin ?? 20,
    },
    history: [],
  };
}

describe('CorporateTaxCard — render (黒字事業)', () => {
  it('renders without crashing for a profitable unit', () => {
    const unit = makeUnit({});
    let html = '';
    expect(() => {
      html = renderToStaticMarkup(createElement(FinancialAnalysis, { units: [unit] }));
    }).not.toThrow();
    expect(html.length).toBeGreaterThan(0);
  });

  it('shows the corporate tax section heading', () => {
    const unit = makeUnit({});
    const html = renderToStaticMarkup(createElement(FinancialAnalysis, { units: [unit] }));
    expect(html).toContain('法人税等の概算');
  });

  it('shows 税引後利益 label in the profitable case', () => {
    const unit = makeUnit({});
    const html = renderToStaticMarkup(createElement(FinancialAnalysis, { units: [unit] }));
    expect(html).toContain('税引後利益');
  });

  it('shows 法人税等（合計）label', () => {
    const unit = makeUnit({});
    const html = renderToStaticMarkup(createElement(FinancialAnalysis, { units: [unit] }));
    expect(html).toContain('法人税等（合計）');
  });

  it('shows 実効税率（概算）label', () => {
    const unit = makeUnit({});
    const html = renderToStaticMarkup(createElement(FinancialAnalysis, { units: [unit] }));
    expect(html).toContain('実効税率（概算）');
  });

  it('shows the disclaimer note', () => {
    const unit = makeUnit({});
    const html = renderToStaticMarkup(createElement(FinancialAnalysis, { units: [unit] }));
    expect(html).toContain('税務助言ではありません');
  });

  it('shows 中小法人 for a default (small) unit', () => {
    const unit = makeUnit({});
    const html = renderToStaticMarkup(createElement(FinancialAnalysis, { units: [unit] }));
    expect(html).toContain('中小法人');
  });

  it('shows the individual tax component labels', () => {
    const unit = makeUnit({});
    const html = renderToStaticMarkup(createElement(FinancialAnalysis, { units: [unit] }));
    expect(html).toContain('法人税:');
    expect(html).toContain('地方法人税:');
    expect(html).toContain('法人住民税:');
    expect(html).toContain('法人事業税:');
    expect(html).toContain('特別法人事業税:');
  });

  it('does NOT show the loss-specific message in a profitable case', () => {
    const unit = makeUnit({});
    const html = renderToStaticMarkup(createElement(FinancialAnalysis, { units: [unit] }));
    expect(html).not.toContain('均等割のみ');
  });

  it('shows the pre-tax income label', () => {
    const unit = makeUnit({});
    const html = renderToStaticMarkup(createElement(FinancialAnalysis, { units: [unit] }));
    expect(html).toContain('税引前利益');
  });
});

describe('CorporateTaxCard — render (欠損事業)', () => {
  /** profit < 0 にするため、fixedCost > profit + variableCost 相当になるように設定する。
   * businessFinancials の ordinaryProfit = operatingProfit - interestExpense であり、
   * operatingProfit = profit * 12。profit を負にする。
   */
  const lossUnit = makeUnit({ profit: -5_000_000, profitMargin: -10 });

  it('renders without crashing for a loss-making unit', () => {
    let html = '';
    expect(() => {
      html = renderToStaticMarkup(createElement(FinancialAnalysis, { units: [lossUnit] }));
    }).not.toThrow();
    expect(html.length).toBeGreaterThan(0);
  });

  it('shows the 欠損 message (均等割のみ) when pre-tax income is negative', () => {
    const html = renderToStaticMarkup(createElement(FinancialAnalysis, { units: [lossUnit] }));
    expect(html).toContain('均等割');
  });

  it('shows "—" for 実効税率 in the loss case', () => {
    const html = renderToStaticMarkup(createElement(FinancialAnalysis, { units: [lossUnit] }));
    expect(html).toContain('—');
  });

  it('still shows the corporate tax section heading in loss case', () => {
    const html = renderToStaticMarkup(createElement(FinancialAnalysis, { units: [lossUnit] }));
    expect(html).toContain('法人税等の概算');
  });

  it('still shows the disclaimer in loss case', () => {
    const html = renderToStaticMarkup(createElement(FinancialAnalysis, { units: [lossUnit] }));
    expect(html).toContain('税務助言ではありません');
  });
});
