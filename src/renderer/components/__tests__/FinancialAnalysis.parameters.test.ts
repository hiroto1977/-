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
import { computeFinancialRatios, radarAxes } from '../../data/financialRatios';
import { diagnoseFinancials } from '../../data/financialDiagnosis';
import { RADAR_AXIS_BANDS } from '../../../shared/financialHealthBands';

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

describe('FinancialAnalysis — 財務診断の下限とレーダーの水準 (台帳の値)', () => {
  const overall = (html: string) => Number(/総合 (\d+)<span/.exec(html)?.[1]);
  const bars = (html: string, color: string) => html.split(`height:100%;background:${color}`).length - 1;

  it('対照: 省略時は既定の帯と下限で採点・格付けする', () => {
    const html = renderToStaticMarkup(createElement(FinancialAnalysis, { units: [UNIT] }));
    const d = diagnoseFinancials(radarAxes(computeFinancialRatios(deriveBusinessFinancials(UNIT.current))));
    expect(overall(html)).toBe(d.overallScore);
    expect(html).toContain(`>${d.grade}</span>`);
  });

  it('下限を全部 100 にすると D で 3 カテゴリの帯が要改善の色、0 にすると S で良好の色', () => {
    const hundred = { goodMin: 100, warnMin: 100, gradeSMin: 100, gradeAMin: 100, gradeBMin: 100, gradeCMin: 100 };
    const html = renderToStaticMarkup(createElement(FinancialAnalysis, { units: [UNIT], healthBands: hundred }));
    expect(html).toContain('>D</span>');
    expect(bars(html, '#e36b6b')).toBe(3);
    expect(bars(html, '#5cb85c')).toBe(0);
    const zero = { goodMin: 0, warnMin: 0, gradeSMin: 0, gradeAMin: 0, gradeBMin: 0, gradeCMin: 0 };
    const html0 = renderToStaticMarkup(createElement(FinancialAnalysis, { units: [UNIT], healthBands: zero }));
    expect(html0).toContain('>S</span>');
    expect(bars(html0, '#5cb85c')).toBe(3);
    expect(bars(html0, '#e36b6b')).toBe(0);
  });

  it('レーダーの水準を渡すと総合スコアが動く', () => {
    const ratios = computeFinancialRatios(deriveBusinessFinancials(UNIT.current));
    const bands = {
      ...RADAR_AXIS_BANDS,
      operatingMargin: { bad: -5, good: 1000 },
      ordinaryMargin: { bad: -5, good: 1000 },
      netMargin: { bad: -5, good: 1000 },
    };
    const expected = diagnoseFinancials(radarAxes(ratios, bands)).overallScore;
    expect(expected).not.toBe(diagnoseFinancials(radarAxes(ratios)).overallScore);
    const html = renderToStaticMarkup(createElement(FinancialAnalysis, { units: [UNIT], radarBands: bands }));
    expect(overall(html)).toBe(expected);
  });
});
