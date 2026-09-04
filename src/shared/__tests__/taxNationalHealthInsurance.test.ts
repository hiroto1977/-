import { describe, it, expect } from 'vitest';
import {
  MEDICAL_CAP,
  SUPPORT_CAP,
  CARE_CAP,
  NHI_BASIC_DEDUCTION,
  DEFAULT_NHI_RATES,
  assessmentBase,
  componentPremium,
  nationalHealthInsurance,
  type NhiComponentRate,
} from '../taxNationalHealthInsurance';

describe('国民健康保険料 — 定数', () => {
  it('医療分の賦課限度額は 65 万円', () => {
    expect(MEDICAL_CAP).toBe(650_000);
  });

  it('後期高齢者支援金分の賦課限度額は 24 万円', () => {
    expect(SUPPORT_CAP).toBe(240_000);
  });

  it('介護分の賦課限度額は 17 万円', () => {
    expect(CARE_CAP).toBe(170_000);
  });

  it('基礎控除は 43 万円', () => {
    expect(NHI_BASIC_DEDUCTION).toBe(430_000);
  });

  it('既定料率に 3 区分すべてが定義されている', () => {
    expect(DEFAULT_NHI_RATES.medical.incomeRate).toBe(0.0726);
    expect(DEFAULT_NHI_RATES.medical.perCapita).toBe(45_000);
    expect(DEFAULT_NHI_RATES.medical.perHousehold).toBe(25_000);
    expect(DEFAULT_NHI_RATES.support.incomeRate).toBe(0.0269);
    expect(DEFAULT_NHI_RATES.support.perCapita).toBe(15_000);
    expect(DEFAULT_NHI_RATES.support.perHousehold).toBe(8_000);
    expect(DEFAULT_NHI_RATES.care.incomeRate).toBe(0.0225);
    expect(DEFAULT_NHI_RATES.care.perCapita).toBe(16_000);
    expect(DEFAULT_NHI_RATES.care.perHousehold).toBe(6_000);
  });
});

describe('assessmentBase — 賦課基準額 = max(総所得 − 43万, 0)', () => {
  it('総所得が基礎控除を上回ると差額を返す', () => {
    expect(assessmentBase(4_300_000)).toBe(3_870_000);
  });

  it('総所得が基礎控除ちょうどなら 0', () => {
    expect(assessmentBase(430_000)).toBe(0);
  });

  it('総所得が基礎控除を 1 円上回ると 1', () => {
    expect(assessmentBase(430_001)).toBe(1);
  });

  it('総所得が基礎控除未満なら 0 (負にならない)', () => {
    expect(assessmentBase(300_000)).toBe(0);
  });

  it('総所得 0 なら 0', () => {
    expect(assessmentBase(0)).toBe(0);
  });

  it('負の総所得は throw', () => {
    expect(() => assessmentBase(-1)).toThrow(/totalIncome must be a finite number >= 0/);
  });

  it('NaN の総所得は throw', () => {
    expect(() => assessmentBase(Number.NaN)).toThrow(/finite/);
  });

  it('Infinity の総所得は throw', () => {
    expect(() => assessmentBase(Number.POSITIVE_INFINITY)).toThrow(/finite/);
  });
});

describe('componentPremium — 1 区分の保険料', () => {
  const flatRate: NhiComponentRate = { incomeRate: 0.1, perCapita: 0, perHousehold: 0 };

  it('所得割 + 均等割 + 平等割を合算する', () => {
    // 賦課基準額 1,000,000 × 0.0726 = 72,600 + 均等割 45,000 + 平等割 25,000 = 142,600
    const rate: NhiComponentRate = { incomeRate: 0.0726, perCapita: 45_000, perHousehold: 25_000 };
    expect(componentPremium({ base: 1_000_000, members: 1, rate, cap: MEDICAL_CAP })).toBe(142_600);
  });

  it('均等割は加入者数に比例する', () => {
    // base 0, perCapita 1,000 × members 3 = 3,000 (平等割なし)
    const rate: NhiComponentRate = { incomeRate: 0, perCapita: 1_000 };
    expect(componentPremium({ base: 0, members: 3, rate, cap: MEDICAL_CAP })).toBe(3_000);
  });

  it('平等割は世帯あたり 1 回のみ加算される (加入者数に依らない)', () => {
    // base 0, perCapita 100 × 2 = 200, perHousehold 50 -> 250 -> 100円未満切捨 200
    const rate: NhiComponentRate = { incomeRate: 0, perCapita: 100, perHousehold: 50 };
    expect(componentPremium({ base: 0, members: 2, rate, cap: MEDICAL_CAP })).toBe(200);
  });

  it('平等割 (perHousehold) 省略時は 0 として扱う', () => {
    // base 0, perCapita 5,000 × 1 = 5,000 (perHousehold なし)
    const rate: NhiComponentRate = { incomeRate: 0, perCapita: 5_000 };
    expect(componentPremium({ base: 0, members: 1, rate, cap: MEDICAL_CAP })).toBe(5_000);
  });

  it('100 円未満を切り捨てる', () => {
    // base 12,345 × 1 = 12,345 -> 12,300
    const rate: NhiComponentRate = { incomeRate: 1, perCapita: 0 };
    expect(componentPremium({ base: 12_345, members: 1, rate, cap: 99_999_999 })).toBe(12_300);
  });

  it('賦課限度額の直下では頭打ちしない', () => {
    // base 6,499,000 × 0.1 = 649,900 < 650,000
    expect(componentPremium({ base: 6_499_000, members: 1, rate: flatRate, cap: 650_000 })).toBe(649_900);
  });

  it('賦課限度額ちょうどでは限度額を返す', () => {
    // base 6,500,000 × 0.1 = 650,000 == cap
    expect(componentPremium({ base: 6_500_000, members: 1, rate: flatRate, cap: 650_000 })).toBe(650_000);
  });

  it('賦課限度額を超えると限度額で頭打ちする', () => {
    // base 7,000,000 × 0.1 = 700,000 > cap -> 650,000
    expect(componentPremium({ base: 7_000_000, members: 1, rate: flatRate, cap: 650_000 })).toBe(650_000);
  });

  it('賦課限度額 0 では常に 0 を返す (cap=0 は throw でなく頭打ち)', () => {
    const rate: NhiComponentRate = { incomeRate: 0.1, perCapita: 5_000, perHousehold: 100 };
    expect(componentPremium({ base: 1_000_000, members: 1, rate, cap: 0 })).toBe(0);
  });

  it('賦課基準額 0 で均等割・平等割のみ', () => {
    const rate: NhiComponentRate = { incomeRate: 0.5, perCapita: 7_000, perHousehold: 3_000 };
    // base 0 -> 所得割 0, 均等割 7,000, 平等割 3,000 = 10,000
    expect(componentPremium({ base: 0, members: 1, rate, cap: MEDICAL_CAP })).toBe(10_000);
  });

  it('base が負だと throw', () => {
    expect(() => componentPremium({ base: -1, members: 1, rate: flatRate, cap: 650_000 })).toThrow(/base must be a finite number >= 0/);
  });

  it('base が非有限だと throw', () => {
    expect(() => componentPremium({ base: Number.NaN, members: 1, rate: flatRate, cap: 650_000 })).toThrow(/base/);
  });

  it('members が 1 未満だと throw', () => {
    expect(() => componentPremium({ base: 0, members: 0, rate: flatRate, cap: 650_000 })).toThrow(/members must be an integer >= 1/);
  });

  it('members が非整数だと throw', () => {
    expect(() => componentPremium({ base: 0, members: 1.5, rate: flatRate, cap: 650_000 })).toThrow(/members must be an integer >= 1/);
  });

  it('incomeRate が負だと throw', () => {
    expect(() => componentPremium({ base: 0, members: 1, rate: { incomeRate: -0.1, perCapita: 0 }, cap: 650_000 })).toThrow(/incomeRate must be a finite number >= 0/);
  });

  it('incomeRate が非有限だと throw', () => {
    expect(() => componentPremium({ base: 0, members: 1, rate: { incomeRate: Number.NaN, perCapita: 0 }, cap: 650_000 })).toThrow(/incomeRate/);
  });

  it('perCapita が負だと throw', () => {
    expect(() => componentPremium({ base: 0, members: 1, rate: { incomeRate: 0, perCapita: -1 }, cap: 650_000 })).toThrow(/perCapita must be a finite number >= 0/);
  });

  it('perCapita が非有限だと throw', () => {
    expect(() => componentPremium({ base: 0, members: 1, rate: { incomeRate: 0, perCapita: Number.POSITIVE_INFINITY }, cap: 650_000 })).toThrow(/perCapita/);
  });

  it('perHousehold が負だと throw', () => {
    expect(() => componentPremium({ base: 0, members: 1, rate: { incomeRate: 0, perCapita: 0, perHousehold: -1 }, cap: 650_000 })).toThrow(/perHousehold must be a finite number >= 0/);
  });

  it('perHousehold が非有限だと throw', () => {
    expect(() => componentPremium({ base: 0, members: 1, rate: { incomeRate: 0, perCapita: 0, perHousehold: Number.NaN }, cap: 650_000 })).toThrow(/perHousehold/);
  });

  it('cap が負だと throw', () => {
    expect(() => componentPremium({ base: 0, members: 1, rate: flatRate, cap: -1 })).toThrow(/cap must be a finite number >= 0/);
  });

  it('cap が非有限だと throw', () => {
    expect(() => componentPremium({ base: 0, members: 1, rate: flatRate, cap: Number.NaN })).toThrow(/cap/);
  });
});

describe('nationalHealthInsurance — 3 区分合算', () => {
  it('40〜64 歳 (介護分あり) の内訳と合計', () => {
    const r = nationalHealthInsurance({ totalIncome: 4_300_000, members: 1, age40to64: true });
    expect(r.medical).toBe(350_900);
    expect(r.support).toBe(127_100);
    expect(r.care).toBe(109_000);
    expect(r.total).toBe(587_000);
  });

  it('40 歳未満 (age40to64 省略) は介護分 0', () => {
    const r = nationalHealthInsurance({ totalIncome: 4_300_000, members: 1 });
    expect(r.medical).toBe(350_900);
    expect(r.support).toBe(127_100);
    expect(r.care).toBe(0);
    expect(r.total).toBe(478_000);
  });

  it('age40to64=false を明示しても介護分 0', () => {
    const r = nationalHealthInsurance({ totalIncome: 4_300_000, members: 1, age40to64: false });
    expect(r.care).toBe(0);
    expect(r.total).toBe(478_000);
  });

  it('複数加入者では均等割が人数倍になる', () => {
    const r = nationalHealthInsurance({ totalIncome: 2_000_000, members: 3 });
    expect(r.medical).toBe(273_900);
    expect(r.support).toBe(95_200);
    expect(r.care).toBe(0);
    expect(r.total).toBe(369_100);
  });

  it('総所得が基礎控除以下なら賦課基準額 0 で均等割+平等割のみ', () => {
    const r = nationalHealthInsurance({ totalIncome: 300_000, members: 1 });
    expect(r.medical).toBe(70_000);
    expect(r.support).toBe(23_000);
    expect(r.care).toBe(0);
    expect(r.total).toBe(93_000);
  });

  it('高所得では各区分が賦課限度額で頭打ちする', () => {
    const r = nationalHealthInsurance({ totalIncome: 50_000_000, members: 1, age40to64: true });
    expect(r.medical).toBe(MEDICAL_CAP);
    expect(r.support).toBe(SUPPORT_CAP);
    expect(r.care).toBe(CARE_CAP);
    expect(r.total).toBe(MEDICAL_CAP + SUPPORT_CAP + CARE_CAP);
  });

  it('独自の料率テーブルを渡せる', () => {
    const rates = {
      medical: { incomeRate: 0.1, perCapita: 0, perHousehold: 0 },
      support: { incomeRate: 0.05, perCapita: 0, perHousehold: 0 },
      care: { incomeRate: 0.02, perCapita: 0, perHousehold: 0 },
    };
    // base = 1,000,000 - 430,000 = 570,000
    // medical 57,000 / support 28,500 / care 11,400
    const r = nationalHealthInsurance({ totalIncome: 1_000_000, members: 1, age40to64: true, rates });
    expect(r.medical).toBe(57_000);
    expect(r.support).toBe(28_500);
    expect(r.care).toBe(11_400);
    expect(r.total).toBe(96_900);
  });

  it('負の総所得は throw', () => {
    expect(() => nationalHealthInsurance({ totalIncome: -1, members: 1 })).toThrow(/totalIncome must be a finite number >= 0/);
  });

  it('非有限の総所得は throw', () => {
    expect(() => nationalHealthInsurance({ totalIncome: Number.NaN, members: 1 })).toThrow(/finite/);
  });

  it('members が 1 未満は throw', () => {
    expect(() => nationalHealthInsurance({ totalIncome: 1_000_000, members: 0 })).toThrow(/members must be an integer >= 1/);
  });

  it('members が非整数は throw', () => {
    expect(() => nationalHealthInsurance({ totalIncome: 1_000_000, members: 2.5 })).toThrow(/members must be an integer >= 1/);
  });
});
