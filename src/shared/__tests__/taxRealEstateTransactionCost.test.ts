import { describe, it, expect } from 'vitest';

import {
  estimateRealEstatePurchaseTaxCost,
  type RealEstatePurchaseInput,
} from '../taxRealEstateTransactionCost';
import { realEstateAcquisitionTax } from '../taxRealEstateAcquisition';
import { realEstateRegistrationTax } from '../taxRegistrationLicense';
import { stampDutyAmount } from '../taxStampDuty';

describe('estimateRealEstatePurchaseTaxCost', () => {
  // --- 代表シナリオ: 宅地土地の購入 (1/2 特例 ON) ----------------------------
  it('宅地土地 (1/2特例ON・transferSale) の内訳と total を実値で全文照合する', () => {
    const result = estimateRealEstatePurchaseTaxCost({
      assessedValue: 20_000_000,
      contractAmount: 30_000_000,
      propertyType: 'land',
      registrationType: 'transferSale',
      isUrbanLand: true,
    });
    // 取得税: 課税標準 20,000,000 × 1/2 = 10,000,000 × 3% = 300,000
    // 登録免許税: 20,000,000 × 2% = 400,000
    // 印紙税: 30,000,000 (1億円以下) = 20,000
    expect(result).toEqual({
      acquisitionTax: 300_000,
      registrationTax: 400_000,
      stampDuty: 20_000,
      total: 720_000,
    });
  });

  // --- 代表シナリオ: 新築住宅家屋の購入 (保存登記) --------------------------
  it('新築住宅家屋 (preservation・isNewBuilding) の内訳と total を実値で全文照合する', () => {
    const result = estimateRealEstatePurchaseTaxCost({
      assessedValue: 12_000_000,
      contractAmount: 12_000_000,
      propertyType: 'residentialBuilding',
      registrationType: 'preservation',
      isNewBuilding: true,
    });
    // 取得税: 12,000,000 × 3% = 360,000
    // 登録免許税: 12,000,000 × 0.4% = 48,000
    // 印紙税: 12,000,000 (5,000万円以下) = 20,000
    expect(result).toEqual({
      acquisitionTax: 360_000,
      registrationTax: 48_000,
      stampDuty: 20_000,
      total: 428_000,
    });
  });

  // --- 代表シナリオ: 非住宅家屋・軽減 OFF (本則 4%) ------------------------
  it('非住宅家屋 (applyAcquisitionReduction:false で本則4%) の内訳と total を全文照合する', () => {
    const result = estimateRealEstatePurchaseTaxCost({
      assessedValue: 50_000_000,
      contractAmount: 60_000_000,
      propertyType: 'nonResidentialBuilding',
      registrationType: 'transferSale',
      applyAcquisitionReduction: false,
    });
    // 取得税: 50,000,000 × 4% = 2,000,000
    // 登録免許税: 50,000,000 × 2% = 1,000,000
    // 印紙税: 60,000,000 (1億円以下) = 60,000
    expect(result).toEqual({
      acquisitionTax: 2_000_000,
      registrationTax: 1_000_000,
      stampDuty: 60_000,
      total: 3_060_000,
    });
  });

  // --- 1/2 特例 OFF と既定値 (軽減 ON) の差を確認 --------------------------
  it('宅地でない土地 (isUrbanLand 既定 false) は 1/2 特例なしで課税標準が全額になる', () => {
    const result = estimateRealEstatePurchaseTaxCost({
      assessedValue: 5_000_000,
      propertyType: 'land',
      registrationType: 'transferSale',
    });
    // 取得税: 5,000,000 × 3% = 150,000 (1/2 特例なし)
    // 登録免許税: 5,000,000 × 2% = 100,000
    // 印紙税: contractAmount 未指定 = 記載金額なし = 200
    expect(result).toEqual({
      acquisitionTax: 150_000,
      registrationTax: 100_000,
      stampDuty: 200,
      total: 250_200,
    });
  });

  // --- 取得税が免税点未満で 0 になるケース --------------------------------
  it('取得税が免税点未満で 0 でも、登録免許税・印紙税は合算され total に反映される', () => {
    const result = estimateRealEstatePurchaseTaxCost({
      assessedValue: 50_000,
      contractAmount: 50_000,
      propertyType: 'land',
      registrationType: 'mortgage',
    });
    // 取得税: 課税標準 50,000 < 土地免税点 100,000 → 0 (非課税)
    // 登録免許税: 50,000 × 0.4% = 200
    // 印紙税: 50,000 (10万円以下) = 200
    expect(result).toEqual({
      acquisitionTax: 0,
      registrationTax: 200,
      stampDuty: 200,
      total: 400,
    });
  });

  // --- total が 3 サブ税の単純合算であることの確認 (合算 + の撃墜) --------
  it('total は acquisitionTax + registrationTax + stampDuty の単純合算に等しい', () => {
    const result = estimateRealEstatePurchaseTaxCost({
      assessedValue: 20_000_000,
      contractAmount: 30_000_000,
      propertyType: 'land',
      registrationType: 'transferSale',
      isUrbanLand: true,
    });
    expect(result.total).toBe(
      result.acquisitionTax + result.registrationTax + result.stampDuty,
    );
  });

  // --- 各内訳がサブモジュールの戻り値と整合することの確認 ----------------
  it('各内訳はサブモジュール (取得税/登録免許税/印紙税) の戻り値と一致する', () => {
    const input: RealEstatePurchaseInput = {
      assessedValue: 50_000_000,
      contractAmount: 60_000_000,
      propertyType: 'nonResidentialBuilding',
      registrationType: 'transferSale',
      applyAcquisitionReduction: false,
    };
    const result = estimateRealEstatePurchaseTaxCost(input);
    expect(result.acquisitionTax).toBe(
      realEstateAcquisitionTax({
        assessedValue: 50_000_000,
        propertyType: 'nonResidentialBuilding',
        applyReduction: false,
      }).tax,
    );
    expect(result.registrationTax).toBe(
      realEstateRegistrationTax({
        taxableValue: 50_000_000,
        registrationType: 'transferSale',
      }).tax,
    );
    expect(result.stampDuty).toBe(
      stampDutyAmount({
        documentType: 'realEstateTransfer',
        contractAmount: 60_000_000,
      }),
    );
  });

  // --- isNewBuilding が取得税の免税点解決に伝播することの確認 ------------
  it('家屋で isNewBuilding を渡すと取得税の免税点解決に伝播する (新築免税点 23万円)', () => {
    // 課税標準 200,000 は、その他家屋免税点 120,000 以上だが新築免税点 230,000 未満。
    // isNewBuilding:true なら免税点 23万 → 取得税 0 (非課税)。
    const newBuilt = estimateRealEstatePurchaseTaxCost({
      assessedValue: 200_000,
      contractAmount: 200_000,
      propertyType: 'residentialBuilding',
      registrationType: 'preservation',
      isNewBuilding: true,
    });
    expect(newBuilt.acquisitionTax).toBe(0);
    // isNewBuilding 未指定 (既定 false) なら免税点 12万 → 課税: 200,000 × 3% = 6,000。
    const used = estimateRealEstatePurchaseTaxCost({
      assessedValue: 200_000,
      contractAmount: 200_000,
      propertyType: 'residentialBuilding',
      registrationType: 'preservation',
    });
    expect(used.acquisitionTax).toBe(6_000);
  });

  // --- 必須項目の欠落で明示 throw -----------------------------------------
  it('assessedValue が undefined のとき明示的に throw する', () => {
    expect(() =>
      estimateRealEstatePurchaseTaxCost({
        propertyType: 'land',
        registrationType: 'transferSale',
      } as unknown as RealEstatePurchaseInput),
    ).toThrow('assessedValue is required');
  });

  it('propertyType が undefined のとき明示的に throw する', () => {
    expect(() =>
      estimateRealEstatePurchaseTaxCost({
        assessedValue: 10_000_000,
        registrationType: 'transferSale',
      } as unknown as RealEstatePurchaseInput),
    ).toThrow('propertyType is required');
  });

  it('registrationType が undefined のとき明示的に throw する', () => {
    expect(() =>
      estimateRealEstatePurchaseTaxCost({
        assessedValue: 10_000_000,
        propertyType: 'land',
      } as unknown as RealEstatePurchaseInput),
    ).toThrow('registrationType is required');
  });

  it('assessedValue が null のとき明示的に throw する', () => {
    expect(() =>
      estimateRealEstatePurchaseTaxCost({
        assessedValue: null,
        propertyType: 'land',
        registrationType: 'transferSale',
      } as unknown as RealEstatePurchaseInput),
    ).toThrow('assessedValue is required');
  });

  it('propertyType が null のとき明示的に throw する', () => {
    expect(() =>
      estimateRealEstatePurchaseTaxCost({
        assessedValue: 10_000_000,
        propertyType: null,
        registrationType: 'transferSale',
      } as unknown as RealEstatePurchaseInput),
    ).toThrow('propertyType is required');
  });

  it('registrationType が null のとき明示的に throw する', () => {
    expect(() =>
      estimateRealEstatePurchaseTaxCost({
        assessedValue: 10_000_000,
        propertyType: 'land',
        registrationType: null,
      } as unknown as RealEstatePurchaseInput),
    ).toThrow('registrationType is required');
  });

  // --- サブ関数の throw が伝播することの確認 ------------------------------
  it('負の assessedValue はサブ関数 (取得税) の検証で throw が伝播する', () => {
    expect(() =>
      estimateRealEstatePurchaseTaxCost({
        assessedValue: -1,
        propertyType: 'land',
        registrationType: 'transferSale',
      }),
    ).toThrow();
  });

  it('範囲外の registrationType はサブ関数 (登録免許税) の検証で throw が伝播する', () => {
    expect(() =>
      estimateRealEstatePurchaseTaxCost({
        assessedValue: 10_000_000,
        propertyType: 'land',
        registrationType: 'bogus' as unknown as RealEstatePurchaseInput['registrationType'],
      }),
    ).toThrow();
  });

  it('負の contractAmount は印紙税モジュールの検証で throw が伝播する', () => {
    expect(() =>
      estimateRealEstatePurchaseTaxCost({
        assessedValue: 10_000_000,
        contractAmount: -5,
        propertyType: 'land',
        registrationType: 'transferSale',
      }),
    ).toThrow();
  });
});
