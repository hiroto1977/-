import { describe, it, expect } from 'vitest';
import {
  AUTOMOBILE_TAX_TABLE,
  ENVIRONMENTAL_PERFORMANCE_RATES,
  automobileTaxByDisplacement,
  environmentalPerformanceRate,
  environmentalPerformanceLevy,
  monthlyProratedAutomobileTax,
  type EnvironmentalPerformanceCategory,
} from '../taxAutomobile';

describe('AUTOMOBILE_TAX_TABLE — 階段表の定数', () => {
  it('10 段のブラケットを持つ', () => {
    expect(AUTOMOBILE_TAX_TABLE).toHaveLength(10);
  });

  it('税率表全体が令和元年10月以降の自家用乗用車の本則税額と一致する', () => {
    expect(AUTOMOBILE_TAX_TABLE).toEqual([
      { upToCc: 1_000, annualTax: 25_000 },
      { upToCc: 1_500, annualTax: 30_500 },
      { upToCc: 2_000, annualTax: 36_000 },
      { upToCc: 2_500, annualTax: 43_500 },
      { upToCc: 3_000, annualTax: 50_000 },
      { upToCc: 3_500, annualTax: 57_000 },
      { upToCc: 4_000, annualTax: 65_500 },
      { upToCc: 4_500, annualTax: 75_500 },
      { upToCc: 6_000, annualTax: 87_000 },
      { upToCc: Infinity, annualTax: 110_000 },
    ]);
  });
});

describe('automobileTaxByDisplacement — 各排気量階段の境界 (以下/超)', () => {
  it('1cc (下限近傍) は 25,000 円', () => {
    expect(automobileTaxByDisplacement(1)).toBe(25_000);
  });

  it('1,000cc ちょうど (境界・以下) は 25,000 円', () => {
    expect(automobileTaxByDisplacement(1_000)).toBe(25_000);
  });

  it('1,001cc (境界超) は 30,500 円', () => {
    expect(automobileTaxByDisplacement(1_001)).toBe(30_500);
  });

  it('1,500cc ちょうど (境界・以下) は 30,500 円', () => {
    expect(automobileTaxByDisplacement(1_500)).toBe(30_500);
  });

  it('1,501cc (境界超) は 36,000 円', () => {
    expect(automobileTaxByDisplacement(1_501)).toBe(36_000);
  });

  it('2,000cc ちょうど (境界・以下) は 36,000 円', () => {
    expect(automobileTaxByDisplacement(2_000)).toBe(36_000);
  });

  it('2,001cc (境界超) は 43,500 円', () => {
    expect(automobileTaxByDisplacement(2_001)).toBe(43_500);
  });

  it('2,500cc ちょうど (境界・以下) は 43,500 円', () => {
    expect(automobileTaxByDisplacement(2_500)).toBe(43_500);
  });

  it('2,501cc (境界超) は 50,000 円', () => {
    expect(automobileTaxByDisplacement(2_501)).toBe(50_000);
  });

  it('3,000cc ちょうど (境界・以下) は 50,000 円', () => {
    expect(automobileTaxByDisplacement(3_000)).toBe(50_000);
  });

  it('3,001cc (境界超) は 57,000 円', () => {
    expect(automobileTaxByDisplacement(3_001)).toBe(57_000);
  });

  it('3,500cc ちょうど (境界・以下) は 57,000 円', () => {
    expect(automobileTaxByDisplacement(3_500)).toBe(57_000);
  });

  it('3,501cc (境界超) は 65,500 円', () => {
    expect(automobileTaxByDisplacement(3_501)).toBe(65_500);
  });

  it('4,000cc ちょうど (境界・以下) は 65,500 円', () => {
    expect(automobileTaxByDisplacement(4_000)).toBe(65_500);
  });

  it('4,001cc (境界超) は 75,500 円', () => {
    expect(automobileTaxByDisplacement(4_001)).toBe(75_500);
  });

  it('4,500cc ちょうど (境界・以下) は 75,500 円', () => {
    expect(automobileTaxByDisplacement(4_500)).toBe(75_500);
  });

  it('4,501cc (境界超) は 87,000 円', () => {
    expect(automobileTaxByDisplacement(4_501)).toBe(87_000);
  });

  it('6,000cc ちょうど (境界・以下) は 87,000 円', () => {
    expect(automobileTaxByDisplacement(6_000)).toBe(87_000);
  });

  it('6,001cc (境界超) は 110,000 円', () => {
    expect(automobileTaxByDisplacement(6_001)).toBe(110_000);
  });

  it('大排気量 (10,000cc) も最上段の 110,000 円', () => {
    expect(automobileTaxByDisplacement(10_000)).toBe(110_000);
  });
});

describe('automobileTaxByDisplacement — 入力検証 (throw)', () => {
  it('0 のとき throw する (0 以下)', () => {
    expect(() => automobileTaxByDisplacement(0)).toThrow(/displacementCc must be > 0/);
  });

  it('負値のとき throw する', () => {
    expect(() => automobileTaxByDisplacement(-1)).toThrow(/displacementCc must be > 0/);
  });

  it('NaN のとき throw する', () => {
    expect(() => automobileTaxByDisplacement(NaN)).toThrow(/displacementCc must be a finite number/);
  });

  it('Infinity のとき throw する', () => {
    expect(() => automobileTaxByDisplacement(Infinity)).toThrow(
      /displacementCc must be a finite number/,
    );
  });

  it('1cc (正の最小近傍) は throw しない', () => {
    expect(() => automobileTaxByDisplacement(1)).not.toThrow();
  });
});

describe('ENVIRONMENTAL_PERFORMANCE_RATES — 税率テーブルの定数', () => {
  it('全区分の税率が自家用乗用車の規定と一致する', () => {
    expect(ENVIRONMENTAL_PERFORMANCE_RATES).toEqual({
      electric: 0,
      gas2030_85: 0,
      gas2030_75: 0.01,
      gas2030_60: 0.02,
      other: 0.03,
    });
  });
});

describe('environmentalPerformanceRate — 全区分の税率', () => {
  it('electric (電気自動車等) は 0% (非課税)', () => {
    expect(environmentalPerformanceRate('electric')).toBe(0);
  });

  it('gas2030_85 (85%達成) は 0% (非課税)', () => {
    expect(environmentalPerformanceRate('gas2030_85')).toBe(0);
  });

  it('gas2030_75 (75%達成) は 1%', () => {
    expect(environmentalPerformanceRate('gas2030_75')).toBe(0.01);
  });

  it('gas2030_60 (60%達成) は 2%', () => {
    expect(environmentalPerformanceRate('gas2030_60')).toBe(0.02);
  });

  it('other (それ以外) は 3%', () => {
    expect(environmentalPerformanceRate('other')).toBe(0.03);
  });

  it('isPrivatePassenger を明示 true にしても税率は同じ', () => {
    expect(environmentalPerformanceRate('gas2030_75', true)).toBe(0.01);
  });

  it('isPrivatePassenger が false のとき throw する (対象外)', () => {
    expect(() => environmentalPerformanceRate('electric', false)).toThrow(
      /supports only private passenger cars/,
    );
  });

  it('区分がホワイトリスト外のとき throw する', () => {
    expect(() =>
      environmentalPerformanceRate('bogus' as EnvironmentalPerformanceCategory),
    ).toThrow(/unknown environmental performance category: bogus/);
  });
});

describe('environmentalPerformanceLevy — 取得価額 × 税率', () => {
  it('other (3%) で 5,000,000 円なら 150,000 円', () => {
    const r = environmentalPerformanceLevy({ acquisitionPrice: 5_000_000, category: 'other' });
    expect(r.rate).toBe(0.03);
    expect(r.levy).toBe(150_000);
  });

  it('gas2030_60 (2%) で 5,000,000 円なら 100,000 円', () => {
    const r = environmentalPerformanceLevy({ acquisitionPrice: 5_000_000, category: 'gas2030_60' });
    expect(r.rate).toBe(0.02);
    expect(r.levy).toBe(100_000);
  });

  it('gas2030_75 (1%) で 5,000,000 円なら 50,000 円', () => {
    const r = environmentalPerformanceLevy({ acquisitionPrice: 5_000_000, category: 'gas2030_75' });
    expect(r.rate).toBe(0.01);
    expect(r.levy).toBe(50_000);
  });

  it('electric (非課税 0%) は取得価額に関わらず 0 円', () => {
    const r = environmentalPerformanceLevy({ acquisitionPrice: 5_000_000, category: 'electric' });
    expect(r.rate).toBe(0);
    expect(r.levy).toBe(0);
  });

  it('gas2030_85 (非課税 0%) も 0 円', () => {
    const r = environmentalPerformanceLevy({ acquisitionPrice: 5_000_000, category: 'gas2030_85' });
    expect(r.rate).toBe(0);
    expect(r.levy).toBe(0);
  });
});

describe('environmentalPerformanceLevy — 100円未満切捨', () => {
  it('3% で端数が出る取得価額を 100円未満切捨する', () => {
    // 3,333,333 × 0.03 = 99,999.99 → 99,900
    const r = environmentalPerformanceLevy({ acquisitionPrice: 3_333_333, category: 'other' });
    expect(r.levy).toBe(99_900);
  });

  it('1% で端数が出る取得価額を 100円未満切捨する', () => {
    // 1,234,567 × 0.01 = 12,345.67 → 12,300
    const r = environmentalPerformanceLevy({ acquisitionPrice: 1_234_567, category: 'gas2030_75' });
    expect(r.levy).toBe(12_300);
  });

  it('税額がちょうど 100 の倍数のときは切り捨てない', () => {
    // 1,000,000 × 0.03 = 30,000 (端数なし)
    const r = environmentalPerformanceLevy({ acquisitionPrice: 1_000_000, category: 'other' });
    expect(r.levy).toBe(30_000);
  });

  it('税額が 99 円のとき (100円未満) は 0 に切り捨てる', () => {
    // 3,300 × 0.03 = 99 → 0
    const r = environmentalPerformanceLevy({ acquisitionPrice: 3_300, category: 'other' });
    expect(r.levy).toBe(0);
  });

  it('税額がちょうど 100 円のとき (境界) は 100 を返す', () => {
    // 10,000 × 0.01 = 100 → 100
    const r = environmentalPerformanceLevy({ acquisitionPrice: 10_000, category: 'gas2030_75' });
    expect(r.levy).toBe(100);
  });

  it('税額が 199 円のとき (境界直前) は 100 に切り捨てる', () => {
    // 19,900 × 0.01 = 199 → 100
    const r = environmentalPerformanceLevy({ acquisitionPrice: 19_900, category: 'gas2030_75' });
    expect(r.levy).toBe(100);
  });

  it('取得価額 0 のとき税額は 0', () => {
    const r = environmentalPerformanceLevy({ acquisitionPrice: 0, category: 'other' });
    expect(r.levy).toBe(0);
  });
});

describe('environmentalPerformanceLevy — 入力検証 (throw)', () => {
  it('取得価額が負値のとき throw する', () => {
    expect(() => environmentalPerformanceLevy({ acquisitionPrice: -1, category: 'other' })).toThrow(
      /acquisitionPrice must be >= 0/,
    );
  });

  it('取得価額が NaN のとき throw する', () => {
    expect(() => environmentalPerformanceLevy({ acquisitionPrice: NaN, category: 'other' })).toThrow(
      /acquisitionPrice must be a finite number/,
    );
  });

  it('取得価額が Infinity のとき throw する', () => {
    expect(() =>
      environmentalPerformanceLevy({ acquisitionPrice: Infinity, category: 'other' }),
    ).toThrow(/acquisitionPrice must be a finite number/);
  });

  it('取得価額が 0 のときは throw しない (境界)', () => {
    expect(() =>
      environmentalPerformanceLevy({ acquisitionPrice: 0, category: 'other' }),
    ).not.toThrow();
  });

  it('区分がホワイトリスト外のとき throw する', () => {
    expect(() =>
      environmentalPerformanceLevy({
        acquisitionPrice: 1_000_000,
        category: 'bogus' as EnvironmentalPerformanceCategory,
      }),
    ).toThrow(/unknown environmental performance category: bogus/);
  });
});

describe('monthlyProratedAutomobileTax — 月割 (登録翌月起算・年度末3月まで)', () => {
  it('4月登録は 11/12 か月分', () => {
    // 36,000 × 11 / 12 = 33,000
    expect(monthlyProratedAutomobileTax(36_000, 4)).toBe(33_000);
  });

  it('5月登録は 10/12 か月分', () => {
    // 36,000 × 10 / 12 = 30,000
    expect(monthlyProratedAutomobileTax(36_000, 5)).toBe(30_000);
  });

  it('8月登録は 7/12 か月分', () => {
    // 36,000 × 7 / 12 = 21,000
    expect(monthlyProratedAutomobileTax(36_000, 8)).toBe(21_000);
  });

  it('12月登録 (境界) は 3/12 か月分', () => {
    // 36,000 × 3 / 12 = 9,000
    expect(monthlyProratedAutomobileTax(36_000, 12)).toBe(9_000);
  });

  it('1月登録 (境界) は 2/12 か月分', () => {
    // 36,000 × 2 / 12 = 6,000
    expect(monthlyProratedAutomobileTax(36_000, 1)).toBe(6_000);
  });

  it('2月登録は 1/12 か月分', () => {
    // 36,000 × 1 / 12 = 3,000
    expect(monthlyProratedAutomobileTax(36_000, 2)).toBe(3_000);
  });

  it('3月登録は 12/12 か月分 (翌月から丸1年 = 全額)', () => {
    // 36,000 × 12 / 12 = 36,000
    expect(monthlyProratedAutomobileTax(36_000, 3)).toBe(36_000);
  });

  it('100円未満が出る年税額・月数で切り捨てる', () => {
    // 30,500 × 7 / 12 = 17,791.66… → 17,700
    expect(monthlyProratedAutomobileTax(30_500, 8)).toBe(17_700);
  });

  it('年税額 0 のとき月割も 0', () => {
    expect(monthlyProratedAutomobileTax(0, 8)).toBe(0);
  });
});

describe('monthlyProratedAutomobileTax — 入力検証 (throw)', () => {
  it('年税額が負値のとき throw する', () => {
    expect(() => monthlyProratedAutomobileTax(-1, 8)).toThrow(/annualTax must be >= 0/);
  });

  it('年税額が NaN のとき throw する', () => {
    expect(() => monthlyProratedAutomobileTax(NaN, 8)).toThrow(/annualTax must be a finite number/);
  });

  it('年税額が Infinity のとき throw する', () => {
    expect(() => monthlyProratedAutomobileTax(Infinity, 8)).toThrow(
      /annualTax must be a finite number/,
    );
  });

  it('registeredMonth が 0 のとき throw する (下限外)', () => {
    expect(() => monthlyProratedAutomobileTax(36_000, 0)).toThrow(
      /registeredMonth must be an integer in 1\.\.12/,
    );
  });

  it('registeredMonth が 13 のとき throw する (上限外)', () => {
    expect(() => monthlyProratedAutomobileTax(36_000, 13)).toThrow(
      /registeredMonth must be an integer in 1\.\.12/,
    );
  });

  it('registeredMonth が負値のとき throw する', () => {
    expect(() => monthlyProratedAutomobileTax(36_000, -1)).toThrow(
      /registeredMonth must be an integer in 1\.\.12/,
    );
  });

  it('registeredMonth が非整数のとき throw する', () => {
    expect(() => monthlyProratedAutomobileTax(36_000, 4.5)).toThrow(
      /registeredMonth must be an integer in 1\.\.12/,
    );
  });

  it('registeredMonth = 1 (下限境界) は throw しない', () => {
    expect(() => monthlyProratedAutomobileTax(36_000, 1)).not.toThrow();
  });

  it('registeredMonth = 12 (上限境界) は throw しない', () => {
    expect(() => monthlyProratedAutomobileTax(36_000, 12)).not.toThrow();
  });

  it('年税額 0 (下限境界) は throw しない', () => {
    expect(() => monthlyProratedAutomobileTax(0, 8)).not.toThrow();
  });
});
