import { describe, expect, it } from 'vitest';
import { measured } from './measured';
import {
  MAX_COST_RATE_PCT,
  MAX_HOLDING_YEARS,
  calcCompoundingFutureValue,
  calcSharpeRatio,
  calcTotalReturn,
  calcRealCost,
  calcStdDev,
  calcDcaSimulation,
  ytdReturnRisk,
  isImpossibleReturnPct,
  RETURN_FLOOR_PCT,
} from '../mutualFundsMetrics';

describe('calcCompoundingFutureValue', () => {
  it('returns contributions only when the return is 0%', () => {
    const r = calcCompoundingFutureValue(100_000, 0, 10);
    expect(r.totalContributed).toBe(12_000_000);
    expect(r.futureValue).toBe(12_000_000);
    expect(r.totalGain).toBe(0);
    expect(r.gainPct).toBe(0);
  });

  it('grows above contributions with a positive return', () => {
    const r = calcCompoundingFutureValue(100_000, 5, 10);
    expect(r.totalContributed).toBe(12_000_000);
    expect(r.futureValue).toBeGreaterThan(12_000_000);
    expect(r.totalGain).toBeGreaterThan(0);
    expect(r.gainPct).toBeGreaterThan(0);
  });

  it('computes gainPct = totalGain / totalContributed × 100 exactly', () => {
    // 月5万 × 年5% × 20年 → 元本1,200万、将来2,029.0224万、含み益829.0224万 → 69.09%。
    // totalGain/totalContributed や ×100 を別演算子にする mutant をリテラルで殺す。
    const r = calcCompoundingFutureValue(50_000, 5, 20);
    expect(r.totalContributed).toBe(12_000_000);
    expect(r.futureValue).toBe(20_290_224);
    expect(r.gainPct).toBe(69.09);
  });

  it('matches the annuity future-value formula', () => {
    const pmt = 50_000, annual = 6, years = 5;
    const n = years * 12;
    const rMonthly = Math.pow(1 + annual / 100, 1 / 12) - 1;
    const expected = Math.round(pmt * ((Math.pow(1 + rMonthly, n) - 1) / rMonthly));
    expect(calcCompoundingFutureValue(pmt, annual, years).futureValue).toBe(expected);
  });

  it('returns zeros for non-positive years or contribution (増加率だけは null)', () => {
    // 金額は 0 で正しい (積み立てていないので評価額も拠出も 0 円)。
    // **増加率だけは算定不能** —— 0% は「積み立てたが増減しなかった」の主張。
    for (const r of [
      calcCompoundingFutureValue(100_000, 5, 0),
      calcCompoundingFutureValue(0, 5, 10),
      calcCompoundingFutureValue(-100, 5, 10),
    ]) {
      expect(r.futureValue).toBe(0);
      expect(r.totalContributed).toBe(0);
      expect(r.totalGain).toBe(0);
      expect(r.gainPct).toBeNull();
    }
  });

  it('longer horizons accumulate more than shorter ones', () => {
    const short = calcCompoundingFutureValue(100_000, 5, 5);
    const long = calcCompoundingFutureValue(100_000, 5, 20);
    expect(measured(long.futureValue)).toBeGreaterThan(measured(short.futureValue));
  });
});

describe('calcSharpeRatio', () => {
  it('computes (return − risk free) / volatility', () => {
    // (14.2 − 0.5) / 18 = 0.7611… → 0.76
    expect(calcSharpeRatio(14.2, 18)).toBe(0.76);
  });

  it('honors a custom risk-free rate', () => {
    expect(calcSharpeRatio(8, 10, 1)).toBe(0.7); // (8−1)/10
  });

  it('変動 0 では null —— 正反対の 3 つを同じ「0」に潰さない', () => {
    // 直す前は `toBe(0)` で、名前も `returns 0 … (undefined ratio)` だった ——
    // **「定義できない」と名前に書いてから 0 を主張していた** (実装の doc も同じ)。
    // 0 はシャープレシオとして**意味のある値** (超過リターンちょうど 0) なので、
    // 次の 3 つが同じ数字になっていた:
    expect(calcSharpeRatio(8, 0)).toBeNull();    // 無リスクで年 8% (最良)
    expect(calcSharpeRatio(0.5, 0)).toBeNull();  // 無リスク金利ちょうど (中立)
    expect(calcSharpeRatio(-20, 0)).toBeNull();  // 確実に年 −20% (最悪)
    expect(calcSharpeRatio(10, -5)).toBeNull();
  });

  it('★ 対照: 変動が在れば数で出て、正負の別も付く (標本が在ることの確認)', () => {
    expect(calcSharpeRatio(8, 15)).toBe(0.5);
    expect(calcSharpeRatio(-20, 15)).toBe(-1.37);
  });

  it('can be negative when the return is below the risk-free rate', () => {
    expect(calcSharpeRatio(0, 10, 0.5)).toBe(-0.05);
  });
});

describe('calcTotalReturn', () => {
  it('computes total return with reinvested dividends', () => {
    // 元本100万、期末120万、分配金5万 → (120+5)/100−1 = 25% 、含み益+分配 25万。
    const r = calcTotalReturn(1_000_000, 1_200_000, 50_000);
    expect(r.totalReturnPct).toBe(25);
    expect(r.totalGain).toBe(250_000);
    expect(r.cagrPct).toBeNull(); // years 既定0 → CAGR 算出不能
  });

  it('annualizes via CAGR over multiple years', () => {
    // (1,200,000 + 0)/1,000,000 = 1.2 ; CAGR(5y) = 1.2^(1/5)−1 = 3.7137...% → 3.71
    const r = calcTotalReturn(1_000_000, 1_200_000, 0, 5);
    expect(r.totalReturnPct).toBe(20);
    expect(r.cagrPct).toBe(3.71);
  });

  it('returns nulls when principal is zero, negative, or non-finite', () => {
    for (const p of [0, -100, NaN, Infinity]) {
      const r = calcTotalReturn(p, 1_000_000, 50_000, 5);
      expect(r.totalReturnPct).toBeNull();
      expect(r.cagrPct).toBeNull();
      expect(r.totalGain).toBe(0);
    }
  });

  it('returns nulls when ending value is non-finite', () => {
    const r = calcTotalReturn(1_000_000, NaN, 0, 5);
    expect(r.totalReturnPct).toBeNull();
    expect(r.totalGain).toBe(0);
  });

  it('clamps negative dividends to zero', () => {
    const r = calcTotalReturn(1_000_000, 1_000_000, -999, 1);
    expect(r.totalReturnPct).toBe(0);
    expect(r.totalGain).toBe(0);
  });

  it('treats non-finite dividends as zero', () => {
    const r = calcTotalReturn(1_000_000, 1_100_000, NaN, 0);
    expect(r.totalReturnPct).toBe(10);
    expect(r.totalGain).toBe(100_000);
  });

  it('can be a total loss with negative return', () => {
    // 期末50万、分配0 → (50)/100−1 = −50% ; CAGR(2y) = 0.5^0.5−1 = −29.29% → −29.29
    const r = calcTotalReturn(1_000_000, 500_000, 0, 2);
    expect(r.totalReturnPct).toBe(-50);
    expect(r.cagrPct).toBe(-29.29);
    expect(r.totalGain).toBe(-500_000);
  });

  it('leaves CAGR null when final value is non-positive (no real root)', () => {
    // endingValue 0, dividends 0 → finalValue 0 → CAGR は実数解なし。
    const r = calcTotalReturn(1_000_000, 0, 0, 5);
    expect(r.totalReturnPct).toBe(-100);
    expect(r.cagrPct).toBeNull();
    expect(r.totalGain).toBe(-1_000_000);
  });

  it('leaves CAGR null for non-positive or non-finite years but keeps total return', () => {
    for (const y of [0, -3, NaN, Infinity]) {
      const r = calcTotalReturn(1_000_000, 1_200_000, 0, y);
      expect(r.totalReturnPct).toBe(20);
      expect(r.cagrPct).toBeNull();
    }
  });
});

describe('calcRealCost', () => {
  it('sums expense ratio and hidden cost into the annual rate', () => {
    // 信託報酬1.0% + 隠れ0.2% = 1.2% 、元本1,000万 → 年12万。
    const r = calcRealCost(10_000_000, 1.0, 0.2);
    expect(r.annualCostPct).toBe(1.2);
    expect(r.annualCostYen).toBe(120_000);
  });

  it('compounds the cost drag over years (gross vs net future value)', () => {
    // 元本100万、gross5%、cost1%、20年。
    // fvGross = 1e6 * 1.05^20 = 2,653,297.71 ; fvNet = 1e6 * 1.04^20 = 2,191,123.14
    // 差 = 462,174.57 → 462,175 (四捨五入)
    const r = calcRealCost(1_000_000, 1.0, 0, 5, 20);
    const fvGross = 1_000_000 * Math.pow(1.05, 20);
    const fvNet = 1_000_000 * Math.pow(1.04, 20);
    expect(r.cumulativeCostYen).toBe(Math.round(fvGross - fvNet));
  });

  it('returns zero amounts for zero invested amount', () => {
    const r = calcRealCost(0, 1.0, 0.2, 5, 10);
    expect(r.annualCostPct).toBe(1.2);
    expect(r.annualCostYen).toBe(0);
    expect(r.cumulativeCostYen).toBe(0);
  });

  it('clamps negative rates to zero', () => {
    const r = calcRealCost(1_000_000, -1, -1, 5, 10);
    expect(r.annualCostPct).toBe(0);
    expect(r.annualCostYen).toBe(0);
    expect(r.cumulativeCostYen).toBe(0); // cost 0 → gross == net
  });

  it('has zero cumulative drag when years is zero', () => {
    // years 0 → fvGross == fvNet == amount → 累計効果0、年額は残る。
    const r = calcRealCost(1_000_000, 1.0, 0, 5, 0);
    expect(r.annualCostYen).toBe(10_000);
    expect(r.cumulativeCostYen).toBe(0);
  });

  /**
   * パス 198 で `cumulativeCostYen` の期待値を `0` → `null` に変えた。
   * 守っていた物 (「非有限を持ち出さない」) は保つ。`0` は「コストの蝕みが
   * 無かった」と読める値で、**保有年数が読めていないこととは別のこと**である。
   * 年率側の 2 欄は年数に依らないので `0` のまま。
   */
  it('コスト率が範囲外なら 3 欄すべて null (算定不能)', () => {
    // **以前は年率側が `0` だった** —— 「コストは無い」という最も安心させる向きの
    // 断定である (2026-09-13 · パス 207)。`isMeasurableCostRate` が非有限と
    // 上限超過の両方を落とす。
    const r = calcRealCost(NaN, NaN, NaN, NaN, NaN);
    expect(r.annualCostPct).toBeNull();
    expect(r.annualCostYen).toBeNull();
    expect(r.cumulativeCostYen).toBeNull();
    const over = calcRealCost(1_000_000, 999_999_999, 0, 5, 10);
    expect(over.annualCostPct).toBeNull();
    expect(over.annualCostYen).toBeNull();
    expect(over.cumulativeCostYen).toBeNull();
    // 隠れコストの側だけが範囲外でも同じ (2 欄が同じ上限を持つ)。
    expect(calcRealCost(1_000_000, 1, 999_999_999, 5, 10).annualCostPct).toBeNull();
    // 年数だけが範囲外なら、年率のコストは残り累計だけが null。
    const yearsOnly = calcRealCost(1_000_000, 1, 0, 5, 999_999_999);
    expect(yearsOnly.annualCostPct).toBe(1);
    expect(yearsOnly.cumulativeCostYen).toBeNull();
    // 想定年率だけが範囲外でも同じ (累計の蝕み効果だけが年率を読む)。
    const rateOnly = calcRealCost(1_000_000, 1, 0, 999_999_999, 10);
    expect(rateOnly.annualCostPct).toBe(1);
    expect(rateOnly.cumulativeCostYen).toBeNull();
    // 対照: すべて範囲内なら 3 欄とも出る
    const ok = calcRealCost(1_000_000, 1, 0, 5, 10);
    expect(ok.annualCostPct).toBe(1);
    expect(ok.annualCostYen).toBe(10_000);
    expect(ok.cumulativeCostYen).not.toBeNull();
    // 上限ちょうどは通る (境界)。
    expect(calcRealCost(1_000_000, MAX_COST_RATE_PCT, 0, 5, 10).annualCostPct).toBe(MAX_COST_RATE_PCT);
  });

  it('★ 保有年数が範囲外なら CAGR は null (0% と刷らない · パス 207)', () => {
    // 実測 (直す前): `Math.pow(1.1506, 1/1e9) - 1` ≈ 1.4e-10 が `round2` で **0** に
    // 落ち、+15% のポートフォリオが「年率換算 0%」= 横ばい (赤) になっていた。
    const over = calcTotalReturn(1_000_000, 1_150_600, 0, 999_999_999);
    expect(over.cagrPct).toBeNull();
    // トータルリターンは年数に依らないので残る。
    expect(over.totalReturnPct).toBe(15.06);
    // 対照: 範囲内の年数なら CAGR が出る (0 でない)
    const ok = calcTotalReturn(1_000_000, 1_150_600, 0, 5);
    expect(ok.cagrPct).toBe(2.85);
    // 上限ちょうどは通る (境界)。
    expect(calcTotalReturn(1_000_000, 1_150_600, 0, MAX_HOLDING_YEARS).cagrPct).not.toBeNull();
  });
});

describe('calcStdDev', () => {
  it('computes the population standard deviation', () => {
    // [2,4,4,4,5,5,7,9] mean 5, variance 4 → σ = 2.
    expect(calcStdDev([2, 4, 4, 4, 5, 5, 7, 9])).toBe(2);
  });

  it('computes the sample standard deviation with n−1', () => {
    // [2,4,6,8] mean 5 ; sumSq = 9+1+1+9 = 20 ; sample var = 20/3 = 6.667 ; s = 2.582 → 2.58
    expect(calcStdDev([2, 4, 6, 8], true)).toBe(2.58);
    // population: 20/4 = 5 ; σ = 2.236 → 2.24
    expect(calcStdDev([2, 4, 6, 8], false)).toBe(2.24);
  });

  it('returns 0 for a constant series (no dispersion)', () => {
    expect(calcStdDev([3, 3, 3])).toBe(0);
  });

  it('returns null for an empty array', () => {
    expect(calcStdDev([])).toBeNull();
  });

  it('population std dev works for a single element (zero dispersion)', () => {
    expect(calcStdDev([5])).toBe(0);
  });

  it('returns null for sample std dev with fewer than two elements', () => {
    expect(calcStdDev([5], true)).toBeNull();
    expect(calcStdDev([], true)).toBeNull();
  });

  it('sample std dev is defined at exactly two elements (n−1 boundary)', () => {
    // [4, 8] mean 6 ; sumSq = 4 + 4 = 8 ; sample var = 8/1 = 8 ; s = 2.828 → 2.83
    expect(calcStdDev([4, 8], true)).toBe(2.83);
    // population: 8/2 = 4 ; σ = 2.
    expect(calcStdDev([4, 8], false)).toBe(2);
  });

  it('returns null when the series contains a non-finite value', () => {
    expect(calcStdDev([1, 2, NaN])).toBeNull();
    expect(calcStdDev([1, Infinity, 3])).toBeNull();
  });

  it('handles negative returns in the dispersion', () => {
    // [-2, 0, 2] mean 0 ; sumSq = 4+0+4 = 8 ; pop var = 8/3 = 2.667 ; σ = 1.633 → 1.63
    expect(calcStdDev([-2, 0, 2])).toBe(1.63);
  });
});

describe('calcDcaSimulation', () => {
  it('buys more units when the price is lower (averaging down)', () => {
    // 月10,000円を価格 [1000, 500, 2000] で購入。
    // units = 10 + 20 + 5 = 35 ; invested = 30,000 ; avg = 30000/35 = 857.142... → 857.14
    // final = 2000 * 35 = 70,000 ; gain = 40,000
    const r = calcDcaSimulation(10_000, [1000, 500, 2000]);
    expect(r.totalUnits).toBe(35);
    expect(r.totalInvested).toBe(30_000);
    expect(r.averageCost).toBe(857.14);
    expect(r.finalValuation).toBe(70_000);
    expect(r.gain).toBe(40_000);
  });

  it('average cost equals price for a flat series', () => {
    const r = calcDcaSimulation(10_000, [1000, 1000, 1000]);
    expect(r.totalUnits).toBe(30);
    expect(r.averageCost).toBe(1000);
    expect(r.finalValuation).toBe(30_000);
    expect(r.gain).toBe(0);
  });

  it('skips non-positive and non-finite prices but still invests on valid periods', () => {
    // 価格 [1000, 0, -5, NaN, 2000] → 有効期は 1000 と 2000 のみ。
    // units = 10 + 5 = 15 ; invested = 20,000 ; final = 2000 * 15 = 30,000 ; gain = 10,000
    const r = calcDcaSimulation(10_000, [1000, 0, -5, NaN, 2000]);
    expect(r.totalUnits).toBe(15);
    expect(r.totalInvested).toBe(20_000);
    expect(r.finalValuation).toBe(30_000);
    expect(r.gain).toBe(10_000);
  });

  it('returns an empty result for an empty price series', () => {
    const r = calcDcaSimulation(10_000, []);
    expect(r).toEqual({ totalUnits: 0, totalInvested: 0, averageCost: null, finalValuation: 0, gain: 0 });
  });

  it('returns an empty result when no price is valid', () => {
    const r = calcDcaSimulation(10_000, [0, -1, NaN, Infinity]);
    expect(r.totalUnits).toBe(0);
    expect(r.averageCost).toBeNull();
    expect(r.finalValuation).toBe(0);
  });

  it('returns an empty result for zero, negative, or non-finite monthly amount', () => {
    for (const a of [0, -100, NaN, Infinity]) {
      const r = calcDcaSimulation(a, [1000, 2000]);
      expect(r.totalInvested).toBe(0);
      expect(r.averageCost).toBeNull();
    }
  });

  it('uses the last valid price (not a later skipped one) for valuation', () => {
    // 最終価格が無効 → 直近の有効価格 1500 で評価。
    // units = 10000/1000 + 10000/1500 = 10 + 6.6667 = 16.6667 ; final = 1500 * 16.6667 = 25,000
    const r = calcDcaSimulation(10_000, [1000, 1500, 0]);
    expect(r.totalInvested).toBe(20_000);
    expect(r.finalValuation).toBe(25_000);
  });
});

describe('ytdReturnRisk — 未入力 (null) を 0% として入れない (パス 122)', () => {
  it('★ null を除いた銘柄だけで標準偏差を取り、除外した数を言う', () => {
    const r = ytdReturnRisk([2, 4, 4, 4, 5, 5, 7, 9, null, null]);
    expect(r).toEqual({ stdDevPct: 2, measured: 8, unmeasured: 2, impossible: 0 });
    // 旧: null を 0 として入れると σ が変わる —— 同じ系列に 0 を 2 つ足した版は 2 ではない
    expect(calcStdDev([2, 4, 4, 4, 5, 5, 7, 9, 0, 0])).not.toBe(2);
  });

  it('画面の見本 4 銘柄 (14.2 / 11.8 / 3.4 / 8.7): 空欄 1 件を除けば 4.04%、0% として入れると 5.25%', () => {
    expect(ytdReturnRisk([14.2, 11.8, 3.4, 8.7, null])).toEqual({ stdDevPct: 4.04, measured: 4, unmeasured: 1, impossible: 0 });
    expect(calcStdDev([14.2, 11.8, 3.4, 8.7, 0])).toBe(5.25);
  });

  it('測った 0% は除外しない (未入力と 0% を混ぜない)', () => {
    expect(ytdReturnRisk([0, 0])).toEqual({ stdDevPct: 0, measured: 2, unmeasured: 0, impossible: 0 });
    expect(ytdReturnRisk([5, 0, null])).toEqual({ stdDevPct: 2.5, measured: 2, unmeasured: 1, impossible: 0 });
  });

  it('入力された銘柄が無ければ null で、数だけ言う', () => {
    expect(ytdReturnRisk([null, null])).toEqual({ stdDevPct: null, measured: 0, unmeasured: 2, impossible: 0 });
    expect(ytdReturnRisk([])).toEqual({ stdDevPct: null, measured: 0, unmeasured: 0, impossible: 0 });
  });
});

describe('ytdReturnRisk — 在り得ない値 (元本超の損失) を集約に入れない (パス 226)', () => {
  /** 画面の見本 4 銘柄。数を写さず、リターンの並びだけを検査の中で持つ。 */
  const DEMO = [14.2, 11.8, 3.4, 8.7] as const;

  it('★ −100% より下の銘柄を除き、除いた数を「未入力」と別に数える', () => {
    const r = ytdReturnRisk([...DEMO, -250]);
    expect(r).toEqual({ stdDevPct: 4.04, measured: 4, unmeasured: 0, impossible: 1 });
    // 対照: 除かないと 4.04% ではなく 103.87% —— 2 つが同じなら、この検査は何も見ていない
    expect(calcStdDev([...DEMO, -250])).toBe(103.87);
    expect(calcStdDev([...DEMO])).toBe(4.04);
  });

  it('未入力と在り得ない値は別々に数える (どちらも measured には入らない)', () => {
    expect(ytdReturnRisk([...DEMO, null, -250, -100.5]))
      .toEqual({ stdDevPct: 4.04, measured: 4, unmeasured: 1, impossible: 2 });
  });

  it('在り得ない値だけなら stdDevPct は null で、measured 0 と言う', () => {
    expect(ytdReturnRisk([-250, -1000])).toEqual({ stdDevPct: null, measured: 0, unmeasured: 0, impossible: 2 });
  });

  it('下限 −100% ちょうどは在りうる (全額失った) —— 境界は除かない', () => {
    expect(RETURN_FLOOR_PCT).toBe(-100);
    expect(isImpossibleReturnPct(-100)).toBe(false);
    expect(isImpossibleReturnPct(-100.000001)).toBe(true);
    expect(ytdReturnRisk([-100, -100])).toEqual({ stdDevPct: 0, measured: 2, unmeasured: 0, impossible: 0 });
  });

  it('上端 (書き手の 1000%) は読む側では落とさない —— 打ち間違いの門と事実は別の規則', () => {
    // 1 年で 10 倍を超える投信は実在しうるので、読む側で捨てると**測った値を捨てる**。
    expect(isImpossibleReturnPct(1500)).toBe(false);
    expect(ytdReturnRisk([...DEMO, 1500])).toEqual({ stdDevPct: 596.2, measured: 5, unmeasured: 0, impossible: 0 });
  });
});
