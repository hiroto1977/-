import { describe, expect, it } from 'vitest';
import { calcRealEstateYield, calcRealEstateLeverage } from '../realEstateMetrics';
import { calcCompoundingFutureValue } from '../mutualFundsMetrics';
import { requiredMonthlyContribution, yearsToDouble, emergencyFund } from '../savingsPlanning';
import { fxGainLoss, effectiveRate } from '../fxCurrency';

/**
 * 仮想データによる「個人投資家のポートフォリオ」エンドツーエンド稼働テスト。
 *
 * 不動産(利回り・レバレッジ)・投資信託(複利)・貯蓄計画・外貨を連結し、現実的な
 * シナリオで各モジュールが整合した結果を返すことを確認する。各々の単体テストは
 * 別途存在し、ここでは「組み合わせて破綻しないか・経済的に妥当か」を検証する。
 *
 * **概算試算であり投資助言ではありません。**
 */

describe('investor portfolio end-to-end', () => {
  it('assesses a leveraged rental property coherently', () => {
    // 月額賃料16.8万・物件4200万・経費年60万・自己資金1000万・年間返済150万・金利2%
    const y = calcRealEstateYield(168_000, 42_000_000, 1, 600_000);
    expect(y.netYieldPct).toBeGreaterThan(0);
    expect(y.annualNetIncome).toBe(168_000 * 12 - 600_000);
    const lev = calcRealEstateLeverage(y.annualNetIncome, 10_000_000, 1_500_000, y.netYieldPct, 2.0);
    // 返済後CF = 年間純収益 − 返済額
    expect(lev.annualCashflow).toBe(y.annualNetIncome - 1_500_000);
    // CCR・イールドギャップは有限の数値
    expect(Number.isFinite(lev.cashOnCashReturnPct)).toBe(true);
    expect(Number.isFinite(lev.yieldGapPct)).toBe(true);
  });

  it('positive yield gap means leverage helps (CF after debt service stays positive at a modest rate)', () => {
    const y = calcRealEstateYield(200_000, 40_000_000, 1, 400_000); // higher net yield
    const lev = calcRealEstateLeverage(y.annualNetIncome, 8_000_000, 1_000_000, y.netYieldPct, 1.5);
    if (lev.yieldGapPct > 0) {
      expect(lev.annualCashflow).toBeGreaterThan(0);
    }
  });

  it('compounding fund investment grows beyond contributions', () => {
    const sim = calcCompoundingFutureValue(30_000, 5, 20); // 月3万・年5%・20年
    expect(sim.totalContributed).toBe(30_000 * 12 * 20);
    expect(sim.futureValue).toBeGreaterThan(sim.totalContributed); // 運用益が乗る
    expect(sim.totalGain).toBe(sim.futureValue - sim.totalContributed);
  });

  it('required monthly contribution is the inverse of the compounding calc', () => {
    const pmt = requiredMonthlyContribution(10_000_000, 4, 15);
    const fv = calcCompoundingFutureValue(pmt, 4, 15).futureValue;
    expect(Math.abs(fv - 10_000_000)).toBeLessThan(2_000); // 丸め誤差内で目標到達
  });

  it('rule of 72 and emergency fund are sane for a household', () => {
    expect(yearsToDouble(6)).toBe(12);
    expect(emergencyFund(300_000, 6)).toBe(1_800_000);
  });

  it('fx gain/loss and weighted effective rate are mutually consistent', () => {
    // 2 lots: 5000 USD @130, 5000 USD @150 → effective 140
    const eff = effectiveRate([
      { amountForeign: 5_000, rate: 130 },
      { amountForeign: 5_000, rate: 150 },
    ]);
    expect(eff).toBe(140);
    // holding 10,000 USD acquired at the effective 140, now 155 → gain
    const g = fxGainLoss({ amountForeign: 10_000, acquisitionRate: eff!, currentRate: 155 });
    expect(g.gain).toBe(10_000 * (155 - 140));
    expect(g.gainPct).toBeGreaterThan(0);
  });

  it('combines all sleeves into a portfolio snapshot without NaN', () => {
    const y = calcRealEstateYield(168_000, 42_000_000, 0.95, 600_000);
    const lev = calcRealEstateLeverage(y.annualNetIncome, 10_000_000, 1_500_000, y.netYieldPct, 2.0);
    const fund = calcCompoundingFutureValue(50_000, 4, 25);
    const fx = fxGainLoss({ amountForeign: 20_000, acquisitionRate: 135, currentRate: 150 });
    const reserve = emergencyFund(350_000, 6);
    const netWorthProxy = lev.annualCashflow + fund.futureValue + fx.currentJpy + reserve;
    expect(Number.isFinite(netWorthProxy)).toBe(true);
    expect(Number.isNaN(netWorthProxy)).toBe(false);
    expect(fund.futureValue).toBeGreaterThan(0);
    expect(fx.currentJpy).toBe(20_000 * 150);
  });
});
