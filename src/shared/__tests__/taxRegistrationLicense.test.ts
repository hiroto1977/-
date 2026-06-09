import { describe, it, expect } from 'vitest';
import {
  RATE_TRANSFER_SALE,
  RATE_PRESERVATION,
  RATE_TRANSFER_INHERITANCE,
  RATE_TRANSFER_GIFT,
  RATE_MORTGAGE,
  REGISTRATION_TAX_RATES,
  INCORPORATION_RATE,
  KK_MINIMUM_TAX,
  GK_MINIMUM_TAX,
  INCORPORATION_MINIMUM_TAX,
  realEstateRegistrationTax,
  companyIncorporationTax,
  type RegistrationType,
  type CompanyType,
} from '../taxRegistrationLicense';

describe('registration tax rate constants (本則税率)', () => {
  it('所有権移転 (売買) は 2.0% (20/1000)', () => {
    expect(RATE_TRANSFER_SALE).toBe(0.02);
  });

  it('所有権保存 (新築) は 0.4% (4/1000)', () => {
    expect(RATE_PRESERVATION).toBe(0.004);
  });

  it('相続による移転は 0.4% (4/1000)', () => {
    expect(RATE_TRANSFER_INHERITANCE).toBe(0.004);
  });

  it('贈与による移転は 2.0% (20/1000)', () => {
    expect(RATE_TRANSFER_GIFT).toBe(0.02);
  });

  it('抵当権設定は 0.4% (4/1000)', () => {
    expect(RATE_MORTGAGE).toBe(0.004);
  });

  it('REGISTRATION_TAX_RATES テーブルが全種別を本則税率で持つ', () => {
    expect(REGISTRATION_TAX_RATES).toEqual({
      transferSale: 0.02,
      preservation: 0.004,
      transferInheritance: 0.004,
      transferGift: 0.02,
      mortgage: 0.004,
    });
  });

  it('会社設立の税率は 0.7% (7/1000)', () => {
    expect(INCORPORATION_RATE).toBe(0.007);
  });

  it('株式会社の最低額は 15万円', () => {
    expect(KK_MINIMUM_TAX).toBe(150_000);
  });

  it('合同会社の最低額は 6万円', () => {
    expect(GK_MINIMUM_TAX).toBe(60_000);
  });

  it('INCORPORATION_MINIMUM_TAX テーブルが kk/gk の最低額を持つ', () => {
    expect(INCORPORATION_MINIMUM_TAX).toEqual({ kk: 150_000, gk: 60_000 });
  });
});

describe('realEstateRegistrationTax — 税率解決 (全種別)', () => {
  it('transferSale は 2.0% を適用する', () => {
    const r = realEstateRegistrationTax({ taxableValue: 10_000_000, registrationType: 'transferSale' });
    expect(r.rate).toBe(0.02);
    expect(r.tax).toBe(200_000);
  });

  it('preservation は 0.4% を適用する', () => {
    const r = realEstateRegistrationTax({ taxableValue: 10_000_000, registrationType: 'preservation' });
    expect(r.rate).toBe(0.004);
    expect(r.tax).toBe(40_000);
  });

  it('transferInheritance は 0.4% を適用する', () => {
    const r = realEstateRegistrationTax({
      taxableValue: 10_000_000,
      registrationType: 'transferInheritance',
    });
    expect(r.rate).toBe(0.004);
    expect(r.tax).toBe(40_000);
  });

  it('transferGift は 2.0% を適用する', () => {
    const r = realEstateRegistrationTax({ taxableValue: 10_000_000, registrationType: 'transferGift' });
    expect(r.rate).toBe(0.02);
    expect(r.tax).toBe(200_000);
  });

  it('mortgage は債権額に 0.4% を適用する', () => {
    const r = realEstateRegistrationTax({ taxableValue: 5_000_000, registrationType: 'mortgage' });
    expect(r.rate).toBe(0.004);
    expect(r.tax).toBe(20_000);
  });

  it('preservation と transferSale は同じ課税標準で税額が異なる (税率の取り違え検出)', () => {
    const sale = realEstateRegistrationTax({ taxableValue: 10_000_000, registrationType: 'transferSale' });
    const pres = realEstateRegistrationTax({ taxableValue: 10_000_000, registrationType: 'preservation' });
    expect(sale.tax).toBe(200_000);
    expect(pres.tax).toBe(40_000);
    expect(sale.tax).not.toBe(pres.tax);
  });
});

describe('realEstateRegistrationTax — 100円未満切捨', () => {
  it('2.0% で端数が出る課税標準を 100円未満切捨する', () => {
    // 12,345,678 × 0.02 = 246,913.56 → 246,900
    const r = realEstateRegistrationTax({ taxableValue: 12_345_678, registrationType: 'transferSale' });
    expect(r.tax).toBe(246_900);
  });

  it('0.4% で端数が出る課税標準を 100円未満切捨する', () => {
    // 12,345,678 × 0.004 = 49,382.712 → 49,300
    const r = realEstateRegistrationTax({ taxableValue: 12_345_678, registrationType: 'preservation' });
    expect(r.tax).toBe(49_300);
  });

  it('税額がちょうど 100 の倍数のときは切り捨てない', () => {
    // 5,000,000 × 0.02 = 100,000 (端数なし)
    const r = realEstateRegistrationTax({ taxableValue: 5_000_000, registrationType: 'transferSale' });
    expect(r.tax).toBe(100_000);
  });

  it('税額が 99 円のとき (100円未満) は 0 に切り捨てる', () => {
    // 4,950 × 0.02 = 99 → 0
    const r = realEstateRegistrationTax({ taxableValue: 4_950, registrationType: 'transferSale' });
    expect(r.tax).toBe(0);
  });

  it('税額がちょうど 100 円のとき (境界) は 100 を返す', () => {
    // 5,000 × 0.02 = 100 → 100
    const r = realEstateRegistrationTax({ taxableValue: 5_000, registrationType: 'transferSale' });
    expect(r.tax).toBe(100);
  });

  it('税額が 199 円のとき (境界直前) は 100 に切り捨てる', () => {
    // 9,950 × 0.02 = 199 → 100
    const r = realEstateRegistrationTax({ taxableValue: 9_950, registrationType: 'transferSale' });
    expect(r.tax).toBe(100);
  });

  it('課税標準 0 のとき税額は 0', () => {
    const r = realEstateRegistrationTax({ taxableValue: 0, registrationType: 'transferSale' });
    expect(r.tax).toBe(0);
  });
});

describe('realEstateRegistrationTax — 入力検証 (throw)', () => {
  it('課税標準が負値のとき throw する', () => {
    expect(() => realEstateRegistrationTax({ taxableValue: -1, registrationType: 'transferSale' })).toThrow(
      /taxableValue must be >= 0/,
    );
  });

  it('課税標準が NaN のとき throw する', () => {
    expect(() => realEstateRegistrationTax({ taxableValue: NaN, registrationType: 'transferSale' })).toThrow(
      /taxableValue must be a finite number/,
    );
  });

  it('課税標準が Infinity のとき throw する', () => {
    expect(() =>
      realEstateRegistrationTax({ taxableValue: Infinity, registrationType: 'transferSale' }),
    ).toThrow(/taxableValue must be a finite number/);
  });

  it('課税標準が 0 のときは throw しない (境界)', () => {
    expect(() => realEstateRegistrationTax({ taxableValue: 0, registrationType: 'transferSale' })).not.toThrow();
  });

  it('registrationType がホワイトリスト外のとき throw する', () => {
    expect(() =>
      realEstateRegistrationTax({
        taxableValue: 10_000_000,
        registrationType: 'bogus' as RegistrationType,
      }),
    ).toThrow(/unknown registrationType: bogus/);
  });
});

describe('companyIncorporationTax — kk (株式会社)', () => {
  it('資本金が小さいとき最低額 15万円が勝つ', () => {
    // 1,000,000 × 0.007 = 7,000 < 150,000
    const r = companyIncorporationTax({ capital: 1_000_000, companyType: 'kk' });
    expect(r.rate).toBe(0.007);
    expect(r.minimum).toBe(150_000);
    expect(r.tax).toBe(150_000);
  });

  it('資本金が大きいとき率 (資本金 × 0.7%) が勝つ', () => {
    // 50,000,000 × 0.007 = 350,000 > 150,000
    const r = companyIncorporationTax({ capital: 50_000_000, companyType: 'kk' });
    expect(r.tax).toBe(350_000);
  });

  it('率が最低額をわずかに下回るとき (切捨後) 最低額が勝つ', () => {
    // 21,428,571 × 0.007 = 149,999.997 → 切捨 149,900 < 150,000 → 150,000
    const r = companyIncorporationTax({ capital: 21_428_571, companyType: 'kk' });
    expect(r.tax).toBe(150_000);
  });
});

describe('companyIncorporationTax — gk (合同会社)', () => {
  it('資本金が小さいとき最低額 6万円が勝つ', () => {
    // 5,000,000 × 0.007 = 35,000 < 60,000
    const r = companyIncorporationTax({ capital: 5_000_000, companyType: 'gk' });
    expect(r.rate).toBe(0.007);
    expect(r.minimum).toBe(60_000);
    expect(r.tax).toBe(60_000);
  });

  it('資本金が大きいとき率 (資本金 × 0.7%) が勝つ', () => {
    // 20,000,000 × 0.007 = 140,000 > 60,000
    const r = companyIncorporationTax({ capital: 20_000_000, companyType: 'gk' });
    expect(r.tax).toBe(140_000);
  });
});

describe('companyIncorporationTax — kk/gk の最低額違い', () => {
  it('同じ小資本金でも kk は 15万円・gk は 6万円', () => {
    const kk = companyIncorporationTax({ capital: 1_000_000, companyType: 'kk' });
    const gk = companyIncorporationTax({ capital: 1_000_000, companyType: 'gk' });
    expect(kk.tax).toBe(150_000);
    expect(gk.tax).toBe(60_000);
    expect(kk.minimum).not.toBe(gk.minimum);
  });
});

describe('companyIncorporationTax — 100円未満切捨', () => {
  it('率が勝つケースで端数を 100円未満切捨する', () => {
    // 10,000,050 × 0.007 = 70,000.35 → 切捨 70,000 (> 60,000 gk)
    const r = companyIncorporationTax({ capital: 10_000_050, companyType: 'gk' });
    expect(r.tax).toBe(70_000);
  });

  it('率の端数が 100 の倍数ぴったりのとき切り捨てない', () => {
    // 20,000,000 × 0.007 = 140,000 (端数なし)
    const r = companyIncorporationTax({ capital: 20_000_000, companyType: 'gk' });
    expect(r.tax).toBe(140_000);
  });
});

describe('companyIncorporationTax — 入力検証 (throw)', () => {
  it('資本金が負値のとき throw する', () => {
    expect(() => companyIncorporationTax({ capital: -1, companyType: 'kk' })).toThrow(/capital must be >= 0/);
  });

  it('資本金が NaN のとき throw する', () => {
    expect(() => companyIncorporationTax({ capital: NaN, companyType: 'kk' })).toThrow(
      /capital must be a finite number/,
    );
  });

  it('資本金が Infinity のとき throw する', () => {
    expect(() => companyIncorporationTax({ capital: Infinity, companyType: 'kk' })).toThrow(
      /capital must be a finite number/,
    );
  });

  it('資本金が 0 のときは throw せず最低額を返す (境界)', () => {
    const r = companyIncorporationTax({ capital: 0, companyType: 'kk' });
    expect(r.tax).toBe(150_000);
  });

  it('companyType がホワイトリスト外のとき throw する', () => {
    expect(() => companyIncorporationTax({ capital: 1_000_000, companyType: 'bogus' as CompanyType })).toThrow(
      /unknown companyType: bogus/,
    );
  });
});
