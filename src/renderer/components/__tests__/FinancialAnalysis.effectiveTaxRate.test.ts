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
import { computeFinancialRatios, DEFAULT_EFFECTIVE_TAX_RATE, effectiveTaxRateOf } from '../../data/financialRatios';
import { buildComposition } from '../../data/businessAxonometric';
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

  /**
   * **当期純利益も同じ率で出す** (2026-09-27 · パス 493)。それまで `deriveBusinessFinancials` は
   * `ordinaryProfit * 0.7` と 30% を直書きしており、台帳の率を変えると同じ画面で NOPAT だけが動き、
   * 当期純利益・当期純利益率・ROE と構成比の円グラフ (当期純利益) は 30% のままだった。
   */
  it('★ 当期純利益は NOPAT と同じ率で動く (経常利益 × (1 − 率))', () => {
    const at = (rate?: number) => deriveBusinessFinancials(UNIT.current, rate);
    const ordinary = at().ordinaryProfit;
    expect(ordinary, '前提: 黒字の経常利益').toBeGreaterThan(0);
    expect(at().netProfit, '省略時は既定の率').toBe(Math.round(ordinary * (1 - DEFAULT_EFFECTIVE_TAX_RATE)));
    expect(at(0).netProfit).toBe(ordinary);
    expect(at(0.2).netProfit).toBe(Math.round(ordinary * 0.8));
    expect(at(0.2).netProfit, '標本: 率を変えると当期純利益も動く').not.toBe(at().netProfit);
    // 画面の指標の表でも同じ値が出る (NOPAT と当期純利益が別の率にならない)
    expect(netProfitShown(render(0))).toBe(yen.format(ordinary));
    expect(netProfitShown(render())).toBe(yen.format(at().netProfit));
  });

  it('★ 率の収め方は NOPAT と同じ 1 つ (非有限は既定・範囲外は 0..1 へ)', () => {
    expect(effectiveTaxRateOf(undefined)).toBe(DEFAULT_EFFECTIVE_TAX_RATE);
    expect(effectiveTaxRateOf(Number.NaN)).toBe(DEFAULT_EFFECTIVE_TAX_RATE);
    expect(effectiveTaxRateOf(2)).toBe(1);
    expect(effectiveTaxRateOf(-1)).toBe(0);
    expect(effectiveTaxRateOf(0.25)).toBe(0.25);
  });

  it('★ 構成比の円グラフ (当期純利益) も同じ率で組む', () => {
    const base = buildComposition([UNIT], 'netProfit');
    const zero = buildComposition([UNIT], 'netProfit', 0);
    expect(zero.total).toBe(deriveBusinessFinancials(UNIT.current, 0).netProfit);
    expect(zero.total, '標本: 率を変えると円グラフの合計も動く').not.toBe(base.total);
  });
});

/** 指標の表の当期純利益の行 (損益計算書にも同名の行が在るので、指標の表の形で読む)。 */
function netProfitShown(html: string): string {
  const m = /当期純利益<\/span><span[^>]*>([^<]*)<\/span>/.exec(html);
  if (!m) throw new Error('当期純利益 row not found');
  return m[1]!;
}
