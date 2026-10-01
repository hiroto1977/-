import { describe, it, expect } from 'vitest';
import {
  ASSET_RATE_PER_SQM,
  EMPLOYEE_RATE,
  FLOOR_AREA_THRESHOLD_SQM,
  EMPLOYEE_COUNT_THRESHOLD,
  isAssetTaxExempt,
  isEmployeeTaxExempt,
  assetBasedTax,
  employeeBasedTax,
  businessOfficeTax,
} from '../taxBusinessOffice';

describe('事業所税の法定定数', () => {
  it('資産割の税率は 1㎡ あたり 600 円', () => {
    expect(ASSET_RATE_PER_SQM).toBe(600);
  });

  it('従業者割の税率は 0.25% (0.0025)', () => {
    expect(EMPLOYEE_RATE).toBe(0.0025);
  });

  it('資産割の免税点は床面積 1,000㎡', () => {
    expect(FLOOR_AREA_THRESHOLD_SQM).toBe(1000);
  });

  it('従業者割の免税点は従業者数 100 人', () => {
    expect(EMPLOYEE_COUNT_THRESHOLD).toBe(100);
  });
});

describe('isAssetTaxExempt — 免税点判定 (床面積)', () => {
  it('床面積 0㎡ は非課税 (true)', () => {
    expect(isAssetTaxExempt(0)).toBe(true);
  });

  it('床面積 999㎡ (免税点未満) は非課税 (true)', () => {
    expect(isAssetTaxExempt(999)).toBe(true);
  });

  it('床面積 1,000㎡ (免税点ちょうど) は非課税 (true・以下で非課税)', () => {
    expect(isAssetTaxExempt(1000)).toBe(true);
  });

  it('床面積 1,001㎡ (免税点超) は課税 (false)', () => {
    expect(isAssetTaxExempt(1001)).toBe(false);
  });

  it('床面積 10,000㎡ (大規模) は課税 (false)', () => {
    expect(isAssetTaxExempt(10_000)).toBe(false);
  });

  it('床面積が負値のとき throw する', () => {
    expect(() => isAssetTaxExempt(-1)).toThrow(/floorAreaSqm must be a finite number >= 0/);
  });

  it('床面積が NaN のとき throw する', () => {
    expect(() => isAssetTaxExempt(NaN)).toThrow(/floorAreaSqm must be a finite number >= 0/);
  });

  it('床面積が Infinity のとき throw する', () => {
    expect(() => isAssetTaxExempt(Infinity)).toThrow(/floorAreaSqm must be a finite number >= 0/);
  });

  it('床面積 0㎡ のときは throw しない (境界)', () => {
    expect(() => isAssetTaxExempt(0)).not.toThrow();
  });
});

describe('isEmployeeTaxExempt — 免税点判定 (従業者数)', () => {
  it('従業者数 0 人は非課税 (true)', () => {
    expect(isEmployeeTaxExempt(0)).toBe(true);
  });

  it('従業者数 99 人 (免税点未満) は非課税 (true)', () => {
    expect(isEmployeeTaxExempt(99)).toBe(true);
  });

  it('従業者数 100 人 (免税点ちょうど) は非課税 (true・以下で非課税)', () => {
    expect(isEmployeeTaxExempt(100)).toBe(true);
  });

  it('従業者数 101 人 (免税点超) は課税 (false)', () => {
    expect(isEmployeeTaxExempt(101)).toBe(false);
  });

  it('従業者数 500 人 (大規模) は課税 (false)', () => {
    expect(isEmployeeTaxExempt(500)).toBe(false);
  });

  it('従業者数が負値のとき throw する', () => {
    expect(() => isEmployeeTaxExempt(-1)).toThrow(/employeeCount must be a finite number >= 0/);
  });

  it('従業者数が NaN のとき throw する', () => {
    expect(() => isEmployeeTaxExempt(NaN)).toThrow(/employeeCount must be a finite number >= 0/);
  });

  it('従業者数が Infinity のとき throw する', () => {
    expect(() => isEmployeeTaxExempt(Infinity)).toThrow(/employeeCount must be a finite number >= 0/);
  });

  it('従業者数 0 人のときは throw しない (境界)', () => {
    expect(() => isEmployeeTaxExempt(0)).not.toThrow();
  });
});

describe('assetBasedTax — 資産割 (免税点)', () => {
  it('床面積 1,000㎡ (免税点ちょうど) は非課税で 0', () => {
    expect(assetBasedTax({ floorAreaSqm: 1000 })).toBe(0);
  });

  it('床面積 999㎡ (免税点未満) は非課税で 0', () => {
    expect(assetBasedTax({ floorAreaSqm: 999 })).toBe(0);
  });

  it('床面積 1,001㎡ (免税点超) は床面積全体に課税する', () => {
    // 1,001 × 600 = 600,600 (免税点超過分のみでなく全体に課税)
    expect(assetBasedTax({ floorAreaSqm: 1001 })).toBe(600_600);
  });

  it('床面積 2,000㎡ は 2,000 × 600 = 1,200,000', () => {
    expect(assetBasedTax({ floorAreaSqm: 2000 })).toBe(1_200_000);
  });
});

describe('assetBasedTax — 100円未満切捨', () => {
  it('端数が出る床面積を 100円未満切捨する', () => {
    // 1,001.5 × 600 = 600,900 → 端数なしだが、半端な床面積でも全体課税
    // 1,234.567 × 600 = 740,740.2 → 740,700
    expect(assetBasedTax({ floorAreaSqm: 1234.567 })).toBe(740_700);
  });

  it('税額がちょうど 100 の倍数のときは切り捨てない', () => {
    // 1,500 × 600 = 900,000 (端数なし)
    expect(assetBasedTax({ floorAreaSqm: 1500 })).toBe(900_000);
  });

  it('税額が 100円未満になる床面積は 0 に切り捨てる', () => {
    // 1,000.1 × 600 = 600,060 → 600,000 (切捨で 60 円が消える)
    expect(assetBasedTax({ floorAreaSqm: 1000.1 })).toBe(600_000);
  });
});

describe('assetBasedTax — 入力検証 (throw)', () => {
  it('床面積が負値のとき throw する', () => {
    expect(() => assetBasedTax({ floorAreaSqm: -1 })).toThrow(
      /floorAreaSqm must be a finite number >= 0/,
    );
  });

  it('床面積が NaN のとき throw する', () => {
    expect(() => assetBasedTax({ floorAreaSqm: NaN })).toThrow(
      /floorAreaSqm must be a finite number >= 0/,
    );
  });

  it('床面積が Infinity のとき throw する', () => {
    expect(() => assetBasedTax({ floorAreaSqm: Infinity })).toThrow(
      /floorAreaSqm must be a finite number >= 0/,
    );
  });

  it('床面積 0㎡ のときは throw せず 0 を返す (境界)', () => {
    expect(assetBasedTax({ floorAreaSqm: 0 })).toBe(0);
  });
});

describe('employeeBasedTax — 従業者割 (免税点)', () => {
  it('従業者数 100 人 (免税点ちょうど) は非課税で 0', () => {
    expect(employeeBasedTax({ employeeCount: 100, totalSalary: 100_000_000 })).toBe(0);
  });

  it('従業者数 99 人 (免税点未満) は非課税で 0', () => {
    expect(employeeBasedTax({ employeeCount: 99, totalSalary: 100_000_000 })).toBe(0);
  });

  it('従業者数 101 人 (免税点超) は給与総額全体に課税する', () => {
    // 100,000,000 × 0.0025 = 250,000
    expect(employeeBasedTax({ employeeCount: 101, totalSalary: 100_000_000 })).toBe(250_000);
  });

  it('従業者数 200 人で給与総額 400,000,000 円は 400,000,000 × 0.0025 = 1,000,000', () => {
    expect(employeeBasedTax({ employeeCount: 200, totalSalary: 400_000_000 })).toBe(1_000_000);
  });
});

describe('employeeBasedTax — 100円未満切捨', () => {
  it('端数が出る給与総額を 100円未満切捨する', () => {
    // 123,456,789 × 0.0025 = 308,641.9725 → 308,600
    expect(employeeBasedTax({ employeeCount: 101, totalSalary: 123_456_789 })).toBe(308_600);
  });

  it('税額がちょうど 100 の倍数のときは切り捨てない', () => {
    // 40,000,000 × 0.0025 = 100,000 (端数なし)
    expect(employeeBasedTax({ employeeCount: 101, totalSalary: 40_000_000 })).toBe(100_000);
  });

  it('税額が 100円未満になる給与総額は 0 に切り捨てる', () => {
    // 39,600 × 0.0025 = 99 → 0
    expect(employeeBasedTax({ employeeCount: 101, totalSalary: 39_600 })).toBe(0);
  });
});

describe('employeeBasedTax — 入力検証 (throw)', () => {
  it('従業者数が負値のとき throw する', () => {
    expect(() => employeeBasedTax({ employeeCount: -1, totalSalary: 100_000_000 })).toThrow(
      /employeeCount must be a finite number >= 0/,
    );
  });

  it('従業者数が NaN のとき throw する', () => {
    expect(() => employeeBasedTax({ employeeCount: NaN, totalSalary: 100_000_000 })).toThrow(
      /employeeCount must be a finite number >= 0/,
    );
  });

  it('従業者数が Infinity のとき throw する', () => {
    expect(() => employeeBasedTax({ employeeCount: Infinity, totalSalary: 100_000_000 })).toThrow(
      /employeeCount must be a finite number >= 0/,
    );
  });

  it('給与総額が負値のとき throw する', () => {
    expect(() => employeeBasedTax({ employeeCount: 101, totalSalary: -1 })).toThrow(
      /totalSalary must be a finite number >= 0/,
    );
  });

  it('給与総額が NaN のとき throw する', () => {
    expect(() => employeeBasedTax({ employeeCount: 101, totalSalary: NaN })).toThrow(
      /totalSalary must be a finite number >= 0/,
    );
  });

  it('給与総額が Infinity のとき throw する', () => {
    expect(() => employeeBasedTax({ employeeCount: 101, totalSalary: Infinity })).toThrow(
      /totalSalary must be a finite number >= 0/,
    );
  });

  it('給与総額が不正なら免税点以下 (従業者 100 人) でも throw する (常に検証)', () => {
    // 免税点以下でも totalSalary は常に検証される (早期 return より前で throw)。
    expect(() => employeeBasedTax({ employeeCount: 100, totalSalary: NaN })).toThrow(
      /totalSalary must be a finite number >= 0/,
    );
  });

  it('給与総額 0 円・従業者数 101 人のときは throw せず 0 を返す (境界)', () => {
    expect(employeeBasedTax({ employeeCount: 101, totalSalary: 0 })).toBe(0);
  });
});

describe('businessOfficeTax — 合算内訳', () => {
  it('資産割・従業者割ともに課税のとき両方を合算する', () => {
    // 資産割: 2,000 × 600 = 1,200,000
    // 従業者割: 400,000,000 × 0.0025 = 1,000,000
    const r = businessOfficeTax({
      floorAreaSqm: 2000,
      employeeCount: 200,
      totalSalary: 400_000_000,
    });
    expect(r.assetTax).toBe(1_200_000);
    expect(r.employeeTax).toBe(1_000_000);
    expect(r.total).toBe(2_200_000);
    expect(r.assetExempt).toBe(false);
    expect(r.employeeExempt).toBe(false);
  });

  it('資産割のみ課税・従業者割は免税のとき従業者割は 0', () => {
    const r = businessOfficeTax({
      floorAreaSqm: 2000,
      employeeCount: 100,
      totalSalary: 400_000_000,
    });
    expect(r.assetTax).toBe(1_200_000);
    expect(r.employeeTax).toBe(0);
    expect(r.total).toBe(1_200_000);
    expect(r.assetExempt).toBe(false);
    expect(r.employeeExempt).toBe(true);
  });

  it('従業者割のみ課税・資産割は免税のとき資産割は 0', () => {
    const r = businessOfficeTax({
      floorAreaSqm: 1000,
      employeeCount: 200,
      totalSalary: 400_000_000,
    });
    expect(r.assetTax).toBe(0);
    expect(r.employeeTax).toBe(1_000_000);
    expect(r.total).toBe(1_000_000);
    expect(r.assetExempt).toBe(true);
    expect(r.employeeExempt).toBe(false);
  });

  it('資産割・従業者割ともに免税のとき総額 0・両フラグ true', () => {
    const r = businessOfficeTax({
      floorAreaSqm: 800,
      employeeCount: 50,
      totalSalary: 200_000_000,
    });
    expect(r.assetTax).toBe(0);
    expect(r.employeeTax).toBe(0);
    expect(r.total).toBe(0);
    expect(r.assetExempt).toBe(true);
    expect(r.employeeExempt).toBe(true);
  });

  it('合計は資産割と従業者割の単純加算である', () => {
    const r = businessOfficeTax({
      floorAreaSqm: 3000,
      employeeCount: 150,
      totalSalary: 600_000_000,
    });
    // 資産割: 3,000 × 600 = 1,800,000 / 従業者割: 600,000,000 × 0.0025 = 1,500,000
    expect(r.assetTax).toBe(1_800_000);
    expect(r.employeeTax).toBe(1_500_000);
    expect(r.total).toBe(r.assetTax + r.employeeTax);
    expect(r.total).toBe(3_300_000);
  });

  it('床面積が不正なとき throw する', () => {
    expect(() =>
      businessOfficeTax({ floorAreaSqm: -1, employeeCount: 200, totalSalary: 400_000_000 }),
    ).toThrow(/floorAreaSqm must be a finite number >= 0/);
  });

  it('従業者数が不正なとき throw する', () => {
    expect(() =>
      businessOfficeTax({ floorAreaSqm: 2000, employeeCount: NaN, totalSalary: 400_000_000 }),
    ).toThrow(/employeeCount must be a finite number >= 0/);
  });

  it('給与総額が不正なとき throw する', () => {
    expect(() =>
      businessOfficeTax({ floorAreaSqm: 2000, employeeCount: 200, totalSalary: Infinity }),
    ).toThrow(/totalSalary must be a finite number >= 0/);
  });
});
