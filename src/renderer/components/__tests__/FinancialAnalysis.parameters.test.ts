/**
 * 財務分析 — 台帳の法人税等の率と事業者の消費税の境目が、法人税カードと消費税カードに効く。
 * 既定 (省略) の描画を対照に置く。
 */
import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { FinancialAnalysis, type FinancialUnit } from '../FinancialAnalysis';
import { deriveBusinessFinancials } from '../../data/businessFinancials';
import { calcCorporateTax, DEFAULT_CORPORATE_TAX_RATES } from '../../../shared/taxCorporate';
import { DEFAULT_BUSINESS_CONSUMPTION_PARAMS } from '../../../shared/taxConsumptionBusiness';

const yen = new Intl.NumberFormat('ja-JP', { style: 'currency', currency: 'JPY', maximumFractionDigits: 0 });

const UNIT: FinancialUnit = {
  id: 'u',
  label: 'テスト事業',
  current: { revenue: 50_000_000, variableCost: 20_000_000, fixedCost: 15_000_000, profit: 10_000_000, profitMargin: 20 },
  history: [],
};

describe('FinancialAnalysis — 法人税等の率と事業者の消費税 (台帳の値)', () => {
  it('対照: 省略時は定数で組む', () => {
    const html = renderToStaticMarkup(createElement(FinancialAnalysis, { units: [UNIT] }));
    const fin = deriveBusinessFinancials(UNIT.current);
    const b = calcCorporateTax(fin.ordinaryProfit);
    expect(html).toContain(`法人税: ${yen.format(b.corporateIncomeTax)}`);
    expect(html).toContain('売上税額 × 20%');
  });

  it('率を渡すと法人税カードの各項目が動き、2 割特例の割合の文言も動く', () => {
    const corporateTaxRates = { ...DEFAULT_CORPORATE_TAX_RATES, reducedRate: 0.1, standardRate: 0.3, localCorpTaxRate: 0.2 };
    const businessConsumption = { ...DEFAULT_BUSINESS_CONSUMPTION_PARAMS, twentyPercentRate: 0.3, simplifiedEligibilityThreshold: 10_000_000 };
    const html = renderToStaticMarkup(createElement(FinancialAnalysis, { units: [UNIT], corporateTaxRates, businessConsumption }));
    const fin = deriveBusinessFinancials(UNIT.current);
    const b = calcCorporateTax(fin.ordinaryProfit, {}, corporateTaxRates);
    expect(b.corporateIncomeTax).not.toBe(calcCorporateTax(fin.ordinaryProfit).corporateIncomeTax);
    expect(html).toContain(`法人税: ${yen.format(b.corporateIncomeTax)}`);
    expect(html).toContain(`地方法人税: ${yen.format(b.localCorporateTax)}`);
    expect(html).toContain('売上税額 × 30%');
    // 簡易課税の境目を年商より下げると「選択不可」の注記がその額で出る。
    expect(html).toContain(`基準期間${yen.format(10_000_000)}超は選択不可`);
  });
});
