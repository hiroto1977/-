/**
 * FinancialAnalysis の税カード内「消費税の概算」ブロックのレンダー検証。
 *
 * - 本則 / 簡易 / 2割特例 の 3 方式と「税負担 合計（法人税等 ＋ 消費税）」が
 *   表示されること。
 * - 金額が共有純関数 `compareBusinessTaxMethods` の結果 (既定入力: 課税売上 =
 *   年商、課税仕入 = 費用 − 給与 − 償却 − 利息) と一致すること。
 * - 小規模事業 (課税売上 1,000 万円以下) では免税見込みの注記が出ること。
 *
 * **概算試算であり税務助言ではありません。**
 */
import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { FinancialAnalysis } from '../FinancialAnalysis';
import type { FinancialUnit } from '../FinancialAnalysis';
import { deriveBusinessFinancials } from '../../data/businessFinancials';
import { compareBusinessTaxMethods } from '../../../shared/taxConsumptionBusiness';

const yen = new Intl.NumberFormat('ja-JP', { style: 'currency', currency: 'JPY', maximumFractionDigits: 0 });

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
      revenue: overrides.revenue ?? 50_000_000,
      variableCost: overrides.variableCost ?? 20_000_000,
      fixedCost: overrides.fixedCost ?? 15_000_000,
      profit: overrides.profit ?? 10_000_000,
      profitMargin: overrides.profitMargin ?? 20,
    },
    history: [],
  };
}

function render(unit: FinancialUnit): string {
  return renderToStaticMarkup(createElement(FinancialAnalysis, { units: [unit] }));
}

/** カードの既定入力を再現: 課税売上 = 年商、課税仕入 = 費用 − 給与 − 償却 − 利息。 */
function expectedComparison(unit: FinancialUnit) {
  const fin = deriveBusinessFinancials(unit.current);
  const purchases = Math.max(
    0,
    fin.revenue - fin.ordinaryProfit - fin.laborCost - fin.depreciation - (fin.interestExpense ?? 0),
  );
  return compareBusinessTaxMethods(
    [{ type: 'service', sales: { standard: Math.max(0, fin.revenue), reduced: 0 } }],
    { standard: purchases, reduced: 0 },
  );
}

describe('消費税の概算ブロック — render (通常規模の事業)', () => {
  const unit = makeUnit({});
  const html = render(unit);

  it('shows the consumption tax section heading', () => {
    expect(html).toContain('消費税の概算');
  });

  it('shows all three methods 本則課税 / 簡易課税 / 2割特例', () => {
    expect(html).toContain('本則課税');
    expect(html).toContain('簡易課税');
    expect(html).toContain('2割特例');
  });

  it('shows the combined tax burden tile (法人税等 ＋ 消費税)', () => {
    expect(html).toContain('税負担 合計（法人税等 ＋ 消費税）');
  });

  it('marks exactly one method with the 最有利 chip', () => {
    // 「· 最有利」はチップ表示のみ。合計タイル注記の「最有利方式」とは区別する。
    expect(html.split('· 最有利').length - 1).toBe(1);
  });

  it('amounts follow compareBusinessTaxMethods with the card defaults', () => {
    const ct = expectedComparison(unit);
    expect(html).toContain(yen.format(ct.standard));
    expect(html).toContain(yen.format(ct.simplified));
    expect(html).toContain(yen.format(ct.twentyPercent));
  });

  it('lists all six 簡易課税 business-type options (第1種〜第6種)', () => {
    for (const label of ['第1種 卸売業', '第2種 小売業', '第3種 製造業', '第4種 飲食店業等', '第5種 サービス業', '第6種 不動産業']) {
      expect(html).toContain(label);
    }
  });

  it('does NOT show the 免税 note for a business above the exemption threshold', () => {
    expect(html).not.toContain('免税事業者（納付不要）の見込み');
  });

  it('keeps the 預り金 note (消費税 excluded from 税引後利益)', () => {
    expect(html).toContain('税引後利益の計算には含めていません');
  });
});

describe('消費税の概算ブロック — 免税見込み (小規模事業)', () => {
  // 月商 70 万円 → 年商 840 万円 ≤ 1,000 万円 (免税ライン)。
  const unit = makeUnit({ revenue: 700_000, variableCost: 300_000, fixedCost: 200_000, profit: 150_000 });
  const html = render(unit);

  it('shows the 免税事業者 note when annual taxable sales are at or below 10M yen', () => {
    expect(html).toContain('免税事業者（納付不要）の見込み');
  });

  it('total burden counts consumption tax as 0 for the exempt case', () => {
    expect(html).toContain('免税見込みのため消費税 0 で合算');
  });
});
