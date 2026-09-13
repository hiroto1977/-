/**
 * **合計に同梱の見本が混ざっていることの断り** (2026-09-12 · パス 187)。
 *
 * 不動産・投資信託の集計は「snapshot の見本 + 利用者の記録」を 1 本のリストで
 * 受ける (追加ゼロでも画面が空にならない設計)。だが**合計しか出さないと、
 * 自分の物件・銘柄の数字が読めない** —— 見本が桁で勝つので、自分の分は
 * 合計の中で見えなくなり、実測では符号まで逆になっていた。
 *
 * ここは実物の snapshot を母集団に使う (数を写さない): 見本の件数・金額が
 * 変われば、この検査が期待する数字も一緒に動く。
 */
import { describe, expect, it } from 'vitest';
import {
  computeFundPortfolio,
  computeRealEstatePortfolio,
  demoMixNote,
  fundDemoMixNote,
  type PortfolioHolding,
  type PortfolioProperty,
} from '../investments';
import { SNAPSHOT } from '../snapshot';
import { jpy } from '../../../shared/formatters';

/** 実物の見本 (snapshot) の物件を集計の shape で。 */
const demoProps: PortfolioProperty[] = SNAPSHOT.realEstate.properties.map((p) => ({
  monthlyRent: p.monthlyRent,
  purchasePrice: p.purchasePrice,
  occupied: p.occupied,
  demo: true,
}));
const baseExpenses = SNAPSHOT.realEstate.monthlyCashflow.operatingExpenses;
const baseLoan = SNAPSHOT.realEstate.monthlyCashflow.mortgagePayment;

/** 自分の物件 1 件 —— 家賃 9 万・取得 2,000 万・運営費 3 万・返済 5.5 万。 */
const mine: PortfolioProperty = {
  monthlyRent: 90_000,
  purchasePrice: 20_000_000,
  occupied: true,
  monthlyExpenses: 30_000,
  monthlyLoan: 55_000,
  demo: false,
};

describe('demoMixNote — 不動産', () => {
  it('見本が 0 件 (自分の記録だけ) なら断る物が無い → null', () => {
    const p = computeRealEstatePortfolio([mine], 0, 0);
    expect(p.demoCount).toBe(0);
    expect(p.userCount).toBe(1);
    expect(demoMixNote(p, jpy)).toBeNull();
  });

  it('見本が 0 件のとき userOnly は合計と同じ値になる', () => {
    const p = computeRealEstatePortfolio([mine], 0, 0);
    expect(p.userOnly.grossRent).toBe(p.grossRent);
    expect(p.userOnly.operatingExpenses).toBe(p.operatingExpenses);
    expect(p.userOnly.mortgagePayment).toBe(p.mortgagePayment);
    expect(p.userOnly.netCashflow).toBe(p.netCashflow);
  });

  it('見本だけ (何も登録していない) なら「見本を表示している」と述べ、自分の数字は並べない', () => {
    const p = computeRealEstatePortfolio(demoProps, baseExpenses, baseLoan);
    expect(p.demoCount).toBe(demoProps.length);
    expect(p.userCount).toBe(0);
    const note = demoMixNote(p, jpy);
    expect(note).toBe(`同梱の見本 ${demoProps.length} 件を表示しています（自分の物件はまだ登録されていません）。`);
    // 自分の分が 0 なのに「見本を除くと ¥0」と並べては読み手を惑わせる。
    expect(note).not.toContain('見本を除くと');
  });

  it('★ 混ざっているとき、合計と自分の分の両方を述べる (実測: 家賃 10 倍・手残り 49 倍)', () => {
    const p = computeRealEstatePortfolio([...demoProps, mine], baseExpenses, baseLoan);
    // 合計 (見本を含む) —— パス 187 まで画面はこの 2 つしか出していなかった。
    expect(p.grossRent).toBe(913_000);
    expect(p.netCashflow).toBe(248_000);
    // 自分の分。
    expect(p.userOnly.grossRent).toBe(90_000);
    expect(p.userOnly.netCashflow).toBe(5_000);
    const note = demoMixNote(p, jpy);
    expect(note).not.toBeNull();
    expect(note).toContain(`同梱の見本 ${demoProps.length} 件`);
    expect(note).toContain('自分の物件は 1 件');
    expect(note).toContain(jpy(90_000));
    expect(note).toContain(jpy(5_000));
  });

  it('★ 見本の基準費用・返済は自分の分に入れない (入れると符号が逆に誤る)', () => {
    // 対照: 基準費用 (¥380,000) と返済 (¥200,000) を自分の分に足したら
    // 自分のキャッシュフローは −¥575,000 になり、実際 (+¥5,000) と符号が逆。
    const p = computeRealEstatePortfolio([...demoProps, mine], baseExpenses, baseLoan);
    const ifBaseIncluded = p.userOnly.grossRent - (p.userOnly.operatingExpenses + baseExpenses) - (p.userOnly.mortgagePayment + baseLoan);
    expect(ifBaseIncluded).toBe(-575_000);
    expect(Math.sign(ifBaseIncluded)).not.toBe(Math.sign(p.userOnly.netCashflow));
    expect(p.userOnly.operatingExpenses).toBe(30_000);
    expect(p.userOnly.mortgagePayment).toBe(55_000);
  });

  it('`demo` を渡さないリスト (パス 186 までの呼び方) では見本が 0 件として数えられる', () => {
    // 呼び側が `demo` を落とすと断りが出ない —— 画面側の検査が対照を持つ。
    const withoutFlag = [...demoProps, mine].map(({ demo: _demo, ...rest }) => rest);
    const p = computeRealEstatePortfolio(withoutFlag, baseExpenses, baseLoan);
    expect(p.demoCount).toBe(0);
    expect(demoMixNote(p, jpy)).toBeNull();
  });
});

/** 実物の見本 (snapshot) の銘柄。取得額は銘柄別に持たないので一括の原価で見る。 */
const demoHoldings: PortfolioHolding[] = SNAPSHOT.mutualFunds.holdings.map((h) => ({
  valuation: h.valuation,
  acquisitionCost: null,
  demo: true,
}));
const baseCost = SNAPSHOT.mutualFunds.portfolio.totalCostBasis;
/** 自分の銘柄 1 件 —— 評価額 10 万・取得 9.5 万 (= +5.3%)。 */
const myHolding: PortfolioHolding = { valuation: 100_000, acquisitionCost: 95_000, demo: false };

describe('fundDemoMixNote — 投資信託', () => {
  it('見本が 0 件なら null / userOnly は合計と同じ', () => {
    const p = computeFundPortfolio([myHolding], 0);
    expect(p.demoCount).toBe(0);
    expect(p.userCount).toBe(1);
    expect(fundDemoMixNote(p, jpy)).toBeNull();
    expect(p.userOnly.totalValuation).toBe(p.totalValuation);
    expect(p.userOnly.totalCostBasis).toBe(p.totalCostBasis);
    expect(p.userOnly.unrealizedGain).toBe(p.unrealizedGain);
    expect(p.userOnly.unrealizedGainPct).toBe(p.unrealizedGainPct);
  });

  it('見本だけなら「見本を表示している」と述べる', () => {
    const p = computeFundPortfolio(demoHoldings, baseCost);
    expect(p.userCount).toBe(0);
    expect(fundDemoMixNote(p, jpy)).toBe(
      `同梱の見本 ${demoHoldings.length} 銘柄を表示しています（自分の銘柄はまだ登録されていません）。`,
    );
  });

  it('★ 混ざっているとき、自分の評価額・損益・損益率を述べる (実測: +14.6% と +5.3%)', () => {
    const p = computeFundPortfolio([...demoHoldings, myHolding], baseCost);
    // 合計 (見本を含む)。
    expect(p.totalValuation).toBe(8_340_140);
    expect(p.unrealizedGain).toBe(1_065_140);
    expect(p.unrealizedGainPct).toBe(14.6);
    // 自分の分。
    expect(p.userOnly.totalValuation).toBe(100_000);
    expect(p.userOnly.unrealizedGain).toBe(5_000);
    expect(p.userOnly.unrealizedGainPct).toBe(5.3);
    const note = fundDemoMixNote(p, jpy);
    expect(note).not.toBeNull();
    expect(note).toContain(`同梱の見本 ${demoHoldings.length} 銘柄`);
    expect(note).toContain('自分の銘柄は 1 銘柄');
    expect(note).toContain(jpy(100_000));
    expect(note).toContain(jpy(5_000));
    expect(note).toContain('5.3%');
  });

  it('★ 見本の一括取得原価は自分の分に入れない', () => {
    const p = computeFundPortfolio([...demoHoldings, myHolding], baseCost);
    expect(p.totalCostBasis).toBe(baseCost + 95_000);
    expect(p.userOnly.totalCostBasis).toBe(95_000);
  });

  it('取得額が未入力の自分の銘柄しか無ければ、損益率は述べず金額だけ言う', () => {
    const p = computeFundPortfolio([...demoHoldings, { valuation: 100_000, acquisitionCost: null, demo: false }], baseCost);
    expect(p.userOnly.unrealizedGainPct).toBeNull();
    const note = fundDemoMixNote(p, jpy);
    expect(note).toContain('損益率は算定しません');
    expect(note).not.toMatch(/（-?\d+\.\d%）/);
    // 対照: 取得額が在れば率を述べる (上の not.toMatch が空の検査でないこと)。
    const withCost = computeFundPortfolio([...demoHoldings, myHolding], baseCost);
    expect(fundDemoMixNote(withCost, jpy)).toMatch(/（-?\d+\.\d%）/);
  });
});
