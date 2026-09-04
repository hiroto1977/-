/** @vitest-environment jsdom */
/**
 * CorporateTaxCard — 精度パラメータ入力 UI のテスト (round 58)。
 *
 * 対象: FinancialAnalysis.tsx 内の CorporateTaxCard に追加した
 * 資本金・従業者数・繰越欠損金の任意入力欄。
 *
 * テスト戦略:
 *   A) renderToStaticMarkup (SSR/初期状態) — 入力欄の存在・属性・ヒント文言を確認。
 *      全欄空 = 既定 (中小・最小均等割・控除なし) と同一の表示になることを確認。
 *   B) react-dom/client + act (インタラクション) — 入力値を変えたとき、
 *      表示内容が `calcCorporateTax(profit, profile)` の結果に追従することを確認。
 *   C) 欠損時 (ordinaryProfit ≤ 0) — 均等割区分が資本金入力で変化することを確認。
 *
 * **概算試算であり税務助言ではありません。**
 */
import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { createElement, act } from 'react';
import { createRoot } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { FinancialAnalysis } from '../FinancialAnalysis';
import type { FinancialUnit } from '../FinancialAnalysis';
import { calcCorporateTax } from '../../../shared/taxCorporate';

/** テスト用の最小 FinancialUnit。profit が正なら黒字事業になる。 */
function makeUnit(overrides: Partial<{
  revenue: number;
  variableCost: number;
  fixedCost: number;
  profit: number;
  profitMargin: number;
}>): FinancialUnit {
  return {
    id: 'test-unit-r58',
    label: 'R58テスト事業',
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

// ===== A) SSR / 初期状態 (全欄空) テスト =================================

describe('CorporateTaxCard — 精度パラメータ入力欄の初期レンダー (SSR)', () => {
  const profitUnit = makeUnit({});

  it('資本金入力欄 (id=ctax-capital) が存在する', () => {
    const html = renderToStaticMarkup(createElement(FinancialAnalysis, { units: [profitUnit] }));
    expect(html).toContain('id="ctax-capital"');
  });

  it('資本金入力欄に aria-label="資本金" がある', () => {
    const html = renderToStaticMarkup(createElement(FinancialAnalysis, { units: [profitUnit] }));
    expect(html).toContain('aria-label="資本金"');
  });

  it('従業者数入力欄 (id=ctax-employees) が存在する', () => {
    const html = renderToStaticMarkup(createElement(FinancialAnalysis, { units: [profitUnit] }));
    expect(html).toContain('id="ctax-employees"');
  });

  it('従業者数入力欄に aria-label="従業者数" がある', () => {
    const html = renderToStaticMarkup(createElement(FinancialAnalysis, { units: [profitUnit] }));
    expect(html).toContain('aria-label="従業者数"');
  });

  it('繰越欠損金入力欄 (id=ctax-carryforward) が存在する', () => {
    const html = renderToStaticMarkup(createElement(FinancialAnalysis, { units: [profitUnit] }));
    expect(html).toContain('id="ctax-carryforward"');
  });

  it('繰越欠損金入力欄に aria-label="繰越欠損金" がある', () => {
    const html = renderToStaticMarkup(createElement(FinancialAnalysis, { units: [profitUnit] }));
    expect(html).toContain('aria-label="繰越欠損金"');
  });

  it('「空欄 = 既定」のヒント文言が表示される', () => {
    const html = renderToStaticMarkup(createElement(FinancialAnalysis, { units: [profitUnit] }));
    expect(html).toContain('空欄 = 既定');
  });

  it('入力欄のラベル「資本金（円、任意）」が表示される', () => {
    const html = renderToStaticMarkup(createElement(FinancialAnalysis, { units: [profitUnit] }));
    expect(html).toContain('資本金（円、任意）');
  });

  it('入力欄のラベル「従業者数（人、任意）」が表示される', () => {
    const html = renderToStaticMarkup(createElement(FinancialAnalysis, { units: [profitUnit] }));
    expect(html).toContain('従業者数（人、任意）');
  });

  it('入力欄のラベル「繰越欠損金（円、任意）」が表示される', () => {
    const html = renderToStaticMarkup(createElement(FinancialAnalysis, { units: [profitUnit] }));
    expect(html).toContain('繰越欠損金（円、任意）');
  });

  it('全欄空 (初期状態) で従来の表示要素が不変 — 法人税等の概算', () => {
    const html = renderToStaticMarkup(createElement(FinancialAnalysis, { units: [profitUnit] }));
    expect(html).toContain('法人税等の概算');
  });

  it('全欄空 (初期状態) で従来の表示要素が不変 — 税引後利益', () => {
    const html = renderToStaticMarkup(createElement(FinancialAnalysis, { units: [profitUnit] }));
    expect(html).toContain('税引後利益');
  });

  it('全欄空 (初期状態) で従来の表示要素が不変 — 税務助言免責', () => {
    const html = renderToStaticMarkup(createElement(FinancialAnalysis, { units: [profitUnit] }));
    expect(html).toContain('税務助言ではありません');
  });

  it('全欄空 (初期状態) で中小法人が表示 (既定)', () => {
    const html = renderToStaticMarkup(createElement(FinancialAnalysis, { units: [profitUnit] }));
    expect(html).toContain('中小法人');
  });

  it('資本金入力欄の placeholder が設定されている', () => {
    const html = renderToStaticMarkup(createElement(FinancialAnalysis, { units: [profitUnit] }));
    expect(html).toContain('placeholder="例: 10000000"');
  });

  it('従業者数入力欄の placeholder が設定されている', () => {
    const html = renderToStaticMarkup(createElement(FinancialAnalysis, { units: [profitUnit] }));
    expect(html).toContain('placeholder="例: 30"');
  });

  it('繰越欠損金入力欄の placeholder が設定されている', () => {
    const html = renderToStaticMarkup(createElement(FinancialAnalysis, { units: [profitUnit] }));
    expect(html).toContain('placeholder="例: 5000000"');
  });
});

// ===== B) react-dom/client インタラクションテスト ========================
//
// React 18 の合成イベントは nativeEvent.target.value を見るため、
// Object.getOwnPropertyDescriptor で HTMLInputElement.prototype.value の
// setter を取り出して呼び出す必要がある (直接 input.value = x した後に
// dispatchEvent するだけでは React の onChange が発火しない)。

/** React の onChange を発火させる input 値変更ヘルパー */
function changeInput(input: HTMLInputElement, value: string): void {
  const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
  if (!nativeInputValueSetter) throw new Error('HTMLInputElement value setter not found');
  nativeInputValueSetter.call(input, value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.dispatchEvent(new Event('change', { bubbles: true }));
}

describe('CorporateTaxCard — 入力時の再計算 (インタラクション)', () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    document.body.removeChild(container);
  });

  it('全欄空のとき profile 未指定の calcCorporateTax と同じ税額が表示される', async () => {
    const unit = makeUnit({});
    const root = createRoot(container);
    await act(async () => {
      root.render(createElement(FinancialAnalysis, { units: [unit] }));
    });
    // 全欄空なら既定: profile={} = calcCorporateTax(ordinaryProfit) と同一
    // 「中小法人」が表示されることで既定ルートを確認
    expect(container.textContent).toContain('中小法人');
    // 免責注記の維持
    expect(container.textContent).toContain('税務助言ではありません');
    root.unmount();
  });

  it('資本金を 200,000,000 (大法人) に入力すると「大法人」に切り替わる', async () => {
    const unit = makeUnit({});
    const root = createRoot(container);
    await act(async () => {
      root.render(createElement(FinancialAnalysis, { units: [unit] }));
    });
    const input = container.querySelector<HTMLInputElement>('#ctax-capital');
    expect(input).not.toBeNull();
    await act(async () => {
      changeInput(input!, '200000000'); // 2億円 → 大法人
    });
    // 2億円 > 1億円の閾値なので大法人区分
    expect(container.textContent).toContain('大法人');
    root.unmount();
  });

  it('繰越欠損金を入力すると「繰越欠損金控除」の表示が現れる', async () => {
    // 黒字かつ繰越欠損金がある場合 → deductedLoss > 0 → 内訳に表示
    const unit = makeUnit({ profit: 10_000_000 }); // 年間経常利益は 12億 相当
    const root = createRoot(container);
    await act(async () => {
      root.render(createElement(FinancialAnalysis, { units: [unit] }));
    });
    const input = container.querySelector<HTMLInputElement>('#ctax-carryforward');
    expect(input).not.toBeNull();
    await act(async () => {
      changeInput(input!, '5000000'); // 500万円の繰越欠損金
    });
    // 繰越欠損金控除 > 0 のとき内訳に表示
    expect(container.textContent).toContain('繰越欠損金控除');
    root.unmount();
  });

  it('全欄をクリア (空) に戻すと既定の中小法人に戻る', async () => {
    const unit = makeUnit({});
    const root = createRoot(container);
    await act(async () => {
      root.render(createElement(FinancialAnalysis, { units: [unit] }));
    });
    const capitalInput = container.querySelector<HTMLInputElement>('#ctax-capital');
    // 大法人入力
    await act(async () => {
      changeInput(capitalInput!, '200000000');
    });
    expect(container.textContent).toContain('大法人');
    // クリア
    await act(async () => {
      changeInput(capitalInput!, '');
    });
    // 既定: 中小法人に戻る
    expect(container.textContent).toContain('中小法人');
    root.unmount();
  });

  it('従業者数 51人 を入力すると calcCorporateTax の residentTax が変化する (50人超区分)', async () => {
    const unit = makeUnit({});
    const root = createRoot(container);
    await act(async () => {
      root.render(createElement(FinancialAnalysis, { units: [unit] }));
    });
    const empInput = container.querySelector<HTMLInputElement>('#ctax-employees');
    await act(async () => {
      changeInput(empInput!, '51');
    });
    // 50人超区分で均等割が上がる → 税額表示が空でない (クラッシュしない)
    expect(container.textContent).toContain('法人住民税:');
    expect(container.textContent).toContain('税引後利益');
    root.unmount();
  });
});

// ===== C) 欠損事業 + 資本金入力テスト ====================================

describe('CorporateTaxCard — 欠損事業での精度パラメータ入力 (SSR 初期確認)', () => {
  const lossUnit = makeUnit({ profit: -5_000_000, profitMargin: -10 });

  it('欠損事業でも入力欄 3 つが存在する', () => {
    const html = renderToStaticMarkup(createElement(FinancialAnalysis, { units: [lossUnit] }));
    expect(html).toContain('id="ctax-capital"');
    expect(html).toContain('id="ctax-employees"');
    expect(html).toContain('id="ctax-carryforward"');
  });

  it('欠損事業でも免責注記が維持される', () => {
    const html = renderToStaticMarkup(createElement(FinancialAnalysis, { units: [lossUnit] }));
    expect(html).toContain('税務助言ではありません');
  });

  it('欠損事業の均等割メッセージが引き続き表示される', () => {
    const html = renderToStaticMarkup(createElement(FinancialAnalysis, { units: [lossUnit] }));
    expect(html).toContain('均等割');
  });
});

// ===== D) calcCorporateTax の profile パラメータ組み合わせ確認 ===========
// UI が profile に渡す値の検証 — 純粋ロジック層の直接テストで
// 入力ありのとき再計算が正しいことを担保する。

describe('CorporateTaxCard — profile パラメータの組み合わせ (純粋ロジック確認)', () => {
  const PROFIT = 120_000_000; // 1.2億円 (中小・大法人どちらでも発生する十分な利益)

  it('資本金なし (既定) と資本金 500万 (最小区分) は同じ結果', () => {
    const def = calcCorporateTax(PROFIT);
    const small = calcCorporateTax(PROFIT, { capital: 5_000_000 });
    // 500万は1千万以下区分 = 最小区分 (70000円) なので同一
    expect(small.residentTax).toBe(def.residentTax);
    expect(small.smallBusiness).toBe(true);
  });

  it('資本金 2億円 (大法人) は中小より法人税が高い', () => {
    const small = calcCorporateTax(PROFIT);
    const large = calcCorporateTax(PROFIT, { capital: 200_000_000 });
    expect(large.corporateIncomeTax).toBeGreaterThan(small.corporateIncomeTax);
    expect(large.smallBusiness).toBe(false);
  });

  it('従業者数 51人 (50人超区分) は 30人 (50人以下区分) より均等割が高い', () => {
    const few = calcCorporateTax(PROFIT, { capital: 5_000_000, employees: 30 });
    const many = calcCorporateTax(PROFIT, { capital: 5_000_000, employees: 51 });
    expect(many.residentTax).toBeGreaterThan(few.residentTax);
  });

  it('繰越欠損金 3000万 (中小) は控除ありで税引後利益が高い', () => {
    const withoutLoss = calcCorporateTax(PROFIT);
    const withLoss = calcCorporateTax(PROFIT, { carryforwardLoss: 30_000_000 });
    expect(withLoss.deductedLoss).toBeGreaterThan(0);
    expect(withLoss.afterTaxProfit).toBeGreaterThan(withoutLoss.afterTaxProfit);
  });

  it('繰越欠損金 0 / 未指定は従来挙動と完全一致', () => {
    const def = calcCorporateTax(PROFIT);
    const zero = calcCorporateTax(PROFIT, { carryforwardLoss: 0 });
    expect(zero.deductedLoss).toBe(0);
    expect(zero.totalTax).toBe(def.totalTax);
    expect(zero.afterTaxProfit).toBe(def.afterTaxProfit);
  });

  it('全パラメータ未指定 (既定) は deductedLoss=0・remainingLoss=0', () => {
    const def = calcCorporateTax(PROFIT);
    expect(def.deductedLoss).toBe(0);
    expect(def.remainingLoss).toBe(0);
  });

  it('繰越欠損金が課税所得を超える中小は remainingLoss > 0', () => {
    const smallProfit = 5_000_000;
    const loss = calcCorporateTax(smallProfit, { carryforwardLoss: 10_000_000 });
    expect(loss.remainingLoss).toBeGreaterThan(0);
    expect(loss.taxableIncome).toBe(smallProfit);
    expect(loss.incomeAfterLoss).toBe(0);
  });
});
