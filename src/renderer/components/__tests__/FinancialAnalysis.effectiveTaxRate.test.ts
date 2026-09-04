/**
 * 財務分析 — 実効税率 (台帳 `finance.effectiveTaxRate`) が NOPAT / ROIC に効く。
 *
 * NOPAT と ROIC は round 68 から計算していたが、指標の表に**無かった**
 * (計算しているのに出していない)。台帳の値が効く唯一の見える場所なので、
 * 表に出したうえで、率を変えると数字が動くことを見る。
 */
import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { FinancialAnalysis, type FinancialUnit } from '../FinancialAnalysis';
import { deriveBusinessFinancials } from '../../data/businessFinancials';
import { computeFinancialRatios, DEFAULT_EFFECTIVE_TAX_RATE } from '../../data/financialRatios';
import { DEFAULT_EFFECTIVE_TAX_RATE as SHARED_DEFAULT_EFFECTIVE_TAX_RATE } from '../../../shared/funding';

const yen = new Intl.NumberFormat('ja-JP', { style: 'currency', currency: 'JPY', maximumFractionDigits: 0 });

const UNIT: FinancialUnit = {
  id: 'u',
  label: 'テスト事業',
  current: { revenue: 50_000_000, variableCost: 20_000_000, fixedCost: 15_000_000, profit: 10_000_000, profitMargin: 20 },
  history: [],
};

function render(effectiveTaxRate?: number): string {
  return renderToStaticMarkup(
    createElement(FinancialAnalysis, effectiveTaxRate === undefined ? { units: [UNIT] } : { units: [UNIT], effectiveTaxRate }),
  );
}

/** 指標の表の NOPAT 行の値 (営業利益そのものは損益計算書にも出るので、行で読む)。 */
function nopatShown(html: string): string {
  const m = /NOPAT \(税引後営業利益\)<\/span><span[^>]*>([^<]*)<\/span>/.exec(html);
  if (!m) throw new Error('NOPAT row not found');
  return m[1]!;
}

describe('FinancialAnalysis — 実効税率', () => {
  it('台帳の既定 (shared/funding) と財務比率の既定は同じ値 (2 か所にあるので揃える)', () => {
    expect(SHARED_DEFAULT_EFFECTIVE_TAX_RATE).toBe(DEFAULT_EFFECTIVE_TAX_RATE);
  });

  it('NOPAT と ROIC が指標の表に出る', () => {
    const html = render();
    expect(html).toContain('NOPAT (税引後営業利益)');
    expect(html).toContain('ROIC');
  });

  it('省略時は既定の率、渡せばその率で NOPAT が変わる', () => {
    const fin = deriveBusinessFinancials(UNIT.current);
    const byDefault = computeFinancialRatios(fin).nopat;
    const byZero = computeFinancialRatios({ ...fin, effectiveTaxRate: 0 }).nopat;
    expect(byZero).not.toBe(byDefault);
    expect(byZero).toBe(fin.operatingProfit);

    expect(nopatShown(render())).toBe(yen.format(byDefault));
    expect(nopatShown(render(0))).toBe(yen.format(byZero));
    // 台帳の既定を明示して渡しても、省略時と同じ。
    expect(nopatShown(render(SHARED_DEFAULT_EFFECTIVE_TAX_RATE))).toBe(yen.format(byDefault));
  });
});
