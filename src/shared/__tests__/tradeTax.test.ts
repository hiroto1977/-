import { describe, expect, it } from 'vitest';
import {
  DEFAULT_IMPORT_PARAMS,
  JP_LOCAL_RATIO,
  JP_NATIONAL_REDUCED,
  JP_NATIONAL_STANDARD,
  PERSONAL_USE_FACTOR,
  SMALL_VALUE_LIMIT,
  VAT_REFERENCE,
  VAT_REFERENCE_AS_OF,
  calcExport,
  calcJapanImport,
  lookupVat,
  type ExportInput,
  type ImportInput,
} from '../tradeTax';

const imp = (over: Partial<ImportInput> = {}): ImportInput => ({
  goodsValue: 500_000,
  freight: 30_000,
  insurance: 5_000,
  dutyRate: 0.045,
  ...over,
});

const exp = (over: Partial<ExportInput> = {}): ExportInput => ({
  goodsValue: 1_000_000,
  freight: 80_000,
  insurance: 10_000,
  destBasis: 'CIF',
  destDutyRate: 0.05,
  destVatRate: 0.2,
  ...over,
});

describe('輸入 — 計算順序と端数処理', () => {
  it('CIF → 1,000円未満切捨て → 関税 → 100円未満切捨て、の順で計算する', () => {
    // CIF = 500,000 + 30,000 + 5,000 = 535,000（既に1,000円単位）
    const r = calcJapanImport(imp());
    expect(r.customsValueRaw).toBe(535_000);
    expect(r.customsValue).toBe(535_000);
    // 関税 = 535,000 × 4.5% = 24,075 → 100円未満切捨て → 24,000
    expect(r.duty).toBe(24_000);
  });

  it('課税価格の1,000円未満を切り捨てる', () => {
    const r = calcJapanImport(imp({ goodsValue: 500_500, freight: 0, insurance: 0, dutyRate: 0 }));
    expect(r.customsValueRaw).toBe(500_500);
    expect(r.customsValue).toBe(500_000);
  });

  it('関税は消費税の課税標準に含まれる', () => {
    const r = calcJapanImport(imp());
    // 課税標準 = 535,000 + 24,000 = 559,000（1,000円未満切捨てで変化なし）
    expect(r.consumptionBase).toBe(559_000);
    // 国税 = 559,000 × 7.8% = 43,602 → 43,600
    expect(r.nationalTax).toBe(43_600);
    // 地方 = 43,600 × 22/78 = 12,297.4 → 12,200
    expect(r.localTax).toBe(12_200);
    expect(r.totalTax).toBe(24_000 + 43_600 + 12_200);
  });

  it('関税率が上がると消費税も増える（関税が課税標準に入るため）', () => {
    const low = calcJapanImport(imp({ dutyRate: 0 }));
    const high = calcJapanImport(imp({ dutyRate: 0.2 }));
    expect(high.duty).toBeGreaterThan(low.duty);
    expect(high.nationalTax).toBeGreaterThan(low.nationalTax);
  });

  it('軽減税率の対象なら国税は 6.24% で計算する', () => {
    const std = calcJapanImport(imp({ dutyRate: 0 }));
    const red = calcJapanImport(imp({ dutyRate: 0, reducedRate: true }));
    expect(std.nationalTax).toBe(Math.floor((535_000 * JP_NATIONAL_STANDARD) / 100) * 100);
    expect(red.nationalTax).toBe(Math.floor((535_000 * JP_NATIONAL_REDUCED) / 100) * 100);
    expect(red.nationalTax).toBeLessThan(std.nationalTax);
  });

  it('地方消費税は「切捨て後の国税額」× 22/78 で計算する', () => {
    const r = calcJapanImport(imp());
    expect(r.localTax).toBe(Math.floor((r.nationalTax * JP_LOCAL_RATIO) / 100) * 100);
  });

  it('関税率 0（無税）なら関税は 0 だが消費税はかかる', () => {
    const r = calcJapanImport(imp({ dutyRate: 0 }));
    expect(r.duty).toBe(0);
    expect(r.nationalTax).toBeGreaterThan(0);
  });

  it('通関までの原価は 商品代金+運賃+保険料+税 になる', () => {
    const r = calcJapanImport(imp());
    expect(r.landedCost).toBe(500_000 + 30_000 + 5_000 + r.totalTax);
  });
});

describe('輸入 — 少額免税', () => {
  it('課税価格1万円以下なら関税・消費税が免除される', () => {
    const r = calcJapanImport(imp({ goodsValue: 8_000, freight: 1_000, insurance: 0 }));
    expect(r.customsValue).toBe(9_000);
    expect(r.exempted).toBe(true);
    expect(r.duty).toBe(0);
    expect(r.nationalTax).toBe(0);
    expect(r.localTax).toBe(0);
    expect(r.totalTax).toBe(0);
    expect(r.notes.some((n) => n.includes('1万円以下'))).toBe(true);
  });

  it('ちょうど1万円は免税、1万円超は課税', () => {
    expect(calcJapanImport(imp({ goodsValue: SMALL_VALUE_LIMIT, freight: 0, insurance: 0 })).exempted).toBe(true);
    expect(calcJapanImport(imp({ goodsValue: 11_000, freight: 0, insurance: 0 })).exempted).toBe(false);
  });

  it('革製バッグ・ニット製衣類等は1万円以下でも免税されない', () => {
    const r = calcJapanImport(imp({ goodsValue: 8_000, freight: 0, insurance: 0, exemptionExcluded: true }));
    expect(r.exempted).toBe(false);
    expect(r.nationalTax).toBeGreaterThan(0);
    expect(r.notes.some((n) => n.includes('対象外'))).toBe(true);
  });

  it('免税を適用しない設定にすれば1万円以下でも課税される', () => {
    const r = calcJapanImport(imp({ goodsValue: 8_000, freight: 0, insurance: 0, smallValueExemption: false }));
    expect(r.exempted).toBe(false);
  });

  it('少額免税でも個別消費税（酒税・たばこ税等）は免除されない', () => {
    const r = calcJapanImport(imp({ goodsValue: 8_000, freight: 0, insurance: 0, otherExcise: 3_000 }));
    expect(r.exempted).toBe(true);
    expect(r.otherExcise).toBe(3_000);
    expect(r.totalTax).toBe(3_000);
  });

  it('2028年4月の廃止予定を注記する', () => {
    const r = calcJapanImport(imp({ goodsValue: 5_000, freight: 0, insurance: 0 }));
    expect(r.notes.some((n) => n.includes('2028年4月1日'))).toBe(true);
  });
});

describe('輸入 — 個人的使用の特例', () => {
  it('課税価格を海外小売価格の60%で計算し、運賃・保険料を加えない', () => {
    const r = calcJapanImport(imp({ goodsValue: 30_000, freight: 5_000, insurance: 1_000, personalUse: true }));
    expect(r.customsValueRaw).toBe(30_000 * PERSONAL_USE_FACTOR);
    expect(r.customsValue).toBe(18_000);
    expect(r.exempted).toBe(false);
  });

  it('小売価格16,666円までは課税価格が1万円以下になり免税になる', () => {
    expect(calcJapanImport(imp({ goodsValue: 16_666, freight: 0, insurance: 0, personalUse: true })).exempted).toBe(true);
    expect(calcJapanImport(imp({ goodsValue: 20_000, freight: 0, insurance: 0, personalUse: true })).exempted).toBe(false);
  });

  it('特例の廃止予定を注記する', () => {
    const r = calcJapanImport(imp({ personalUse: true }));
    expect(r.notes.some((n) => n.includes('2028年4月1日'))).toBe(true);
  });
});

describe('輸入 — 個別消費税', () => {
  it('個別消費税は消費税の課税標準にも入る', () => {
    const without = calcJapanImport(imp({ dutyRate: 0 }));
    const withExcise = calcJapanImport(imp({ dutyRate: 0, otherExcise: 50_000 }));
    expect(withExcise.consumptionBase).toBe(without.consumptionBase + 50_000);
    expect(withExcise.nationalTax).toBeGreaterThan(without.nationalTax);
    expect(withExcise.totalTax).toBeGreaterThan(without.totalTax + 50_000 - 1);
  });
});

describe('輸入 — 異常値', () => {
  it('負の入力は 0 として扱う', () => {
    const r = calcJapanImport({ goodsValue: -100, freight: -1, insurance: -1, dutyRate: -0.5 });
    expect(r.customsValue).toBe(0);
    expect(r.duty).toBe(0);
    expect(r.totalTax).toBe(0);
  });
});

describe('輸出', () => {
  it('日本の輸出には関税がかからず、消費税も免税である', () => {
    const r = calcExport(exp());
    expect(r.exportDuty).toBe(0);
    expect(r.jpConsumptionTax).toBe(0);
    expect(r.notes.some((n) => n.includes('輸出に関税を課していません'))).toBe(true);
    expect(r.notes.some((n) => n.includes('消費税法7条'))).toBe(true);
  });

  it('輸出税率を入れると計算され、日本以外からの輸出である旨を注記する', () => {
    const r = calcExport(exp({ exportDutyRate: 0.03 }));
    expect(r.exportDuty).toBe(30_000);
    expect(r.notes.some((n) => n.includes('日本以外からの輸出'))).toBe(true);
  });

  it('CIF 基準では運賃・保険料が課税価格に入る', () => {
    const r = calcExport(exp({ destBasis: 'CIF' }));
    expect(r.destCustomsValue).toBe(1_090_000);
    expect(r.destDuty).toBe(1_090_000 * 0.05);
  });

  it('FOB 基準（米国）では運賃・保険料が入らず、課税価格が下がる', () => {
    const cif = calcExport(exp({ destBasis: 'CIF' }));
    const fob = calcExport(exp({ destBasis: 'FOB' }));
    expect(fob.destCustomsValue).toBe(1_000_000);
    expect(fob.destDuty).toBeLessThan(cif.destDuty);
    expect(fob.notes.some((n) => n.includes('米国はこの基準'))).toBe(true);
  });

  it('仕向国の付加価値税は既定で関税を含めた額に課される', () => {
    const r = calcExport(exp({ destBasis: 'CIF', destDutyRate: 0.05, destVatRate: 0.2 }));
    expect(r.destVatBase).toBe(1_090_000 + 54_500);
    expect(r.destVat).toBeCloseTo((1_090_000 + 54_500) * 0.2, 6);
    expect(r.destTotalTax).toBeCloseTo(54_500 + (1_090_000 + 54_500) * 0.2, 6);
  });

  it('関税を含めない設定にすると付加価値税の課税標準が下がる', () => {
    const withDuty = calcExport(exp({ vatIncludesDuty: true }));
    const without = calcExport(exp({ vatIncludesDuty: false }));
    expect(without.destVatBase).toBeLessThan(withDuty.destVatBase);
    expect(without.destVat).toBeLessThan(withDuty.destVat);
  });

  it('付加価値税 0% の仕向国では VAT が 0 になる', () => {
    const r = calcExport(exp({ destVatRate: 0 }));
    expect(r.destVat).toBe(0);
    expect(r.destTotalTax).toBe(r.destDuty);
  });

  it('DDP（売手負担）だと仕向国の税が売手の負担に乗る', () => {
    const seller = calcExport(exp({ bearer: 'seller' }));
    const buyer = calcExport(exp({ bearer: 'buyer' }));
    expect(seller.sellerBurden).toBeCloseTo(seller.destTotalTax, 6);
    expect(seller.buyerBurden).toBe(0);
    expect(buyer.sellerBurden).toBe(0);
    expect(buyer.buyerBurden).toBeCloseTo(buyer.destTotalTax, 6);
  });

  it('仕向国側は丸めを行わない旨を注記する', () => {
    expect(calcExport(exp()).notes.some((n) => n.includes('丸めを行っていません'))).toBe(true);
  });
});

describe('付加価値税の参考税率', () => {
  it('基準時点が明示されている', () => {
    expect(VAT_REFERENCE_AS_OF).toBe('2026年1月');
  });

  it('確認できた国だけを載せている', () => {
    expect(lookupVat('JP')?.standard).toBe(0.1);
    expect(lookupVat('GB')?.standard).toBe(0.2);
    expect(lookupVat('FR')?.standard).toBe(0.2);
    expect(lookupVat('DE')?.standard).toBe(0.19);
    expect(lookupVat('KR')?.standard).toBe(0.1);
    expect(lookupVat('CN')?.standard).toBe(0.13);
    expect(lookupVat('XX')).toBeNull();
  });

  it('米国は付加価値税を持たず、その旨が注記されている', () => {
    const us = lookupVat('US')!;
    expect(us.standard).toBeNull();
    expect(us.note).toContain('連邦の付加価値税はありません');
    expect(us.note).toContain('FOB');
  });

  it('EU は指令の下限 15% として載せ、加盟国ごとに異なる旨を注記する', () => {
    const eu = lookupVat('EU')!;
    expect(eu.standard).toBe(0.15);
    expect(eu.note).toContain('加盟国ごとに異なります');
  });

  it('参考税率はすべて 0〜1 の範囲か null である', () => {
    for (const v of VAT_REFERENCE) {
      if (v.standard === null) continue;
      expect(v.standard, v.name).toBeGreaterThanOrEqual(0);
      expect(v.standard, v.name).toBeLessThanOrEqual(1);
      for (const r of v.reduced ?? []) {
        expect(r, v.name).toBeLessThan(v.standard);
      }
    }
  });
});

/* mutation testing で生き残った変異体を狙って足したケース。 */

describe('輸入 — 注記の文面', () => {
  it('個人的使用のときだけ 60% 特例の注記が出る', () => {
    expect(calcJapanImport(imp({ personalUse: true })).notes).toContain(
      '個人的使用の特例により、課税価格を海外小売価格の60%で計算しました（この特例は2028年4月1日から廃止される予定です）。',
    );
    expect(calcJapanImport(imp()).notes.some((n) => n.includes('60%'))).toBe(false);
  });

  it('少額免税の注記は免税が効いたときだけ出る', () => {
    const exempt = calcJapanImport(imp({ goodsValue: 5_000, freight: 0, insurance: 0 }));
    expect(exempt.notes).toContain(
      '課税価格の合計額が1万円以下のため、関税と消費税が免除されます（酒税・たばこ税等の個別消費税は免除されません）。この免税は2028年4月1日から一部廃止される予定です。',
    );
    expect(calcJapanImport(imp()).notes.some((n) => n.includes('1万円以下のため'))).toBe(false);
  });

  it('除外品目の注記は「1万円以下 かつ 除外」のときだけ出る', () => {
    const msg = '課税価格は1万円以下ですが、革製バッグ・ニット製衣類等は少額免税の対象外のため課税されます。';
    expect(calcJapanImport(imp({ goodsValue: 5_000, freight: 0, insurance: 0, exemptionExcluded: true })).notes).toContain(msg);
    // 1万円超なら（除外品目でも）この注記は出ない
    expect(calcJapanImport(imp({ exemptionExcluded: true })).notes.some((n) => n.includes('少額免税の対象外'))).toBe(false);
    // 除外指定が無ければ出ない
    expect(calcJapanImport(imp({ goodsValue: 5_000, freight: 0, insurance: 0 })).notes.some((n) => n.includes('少額免税の対象外'))).toBe(false);
  });

  it('個別消費税の注記は「課税されて かつ 個別消費税がある」ときだけ出る', () => {
    const msg = '個別消費税（酒税・たばこ税等）は消費税の課税標準にも含まれます。税額は品目ごとに異なるため、税関にご確認ください。';
    expect(calcJapanImport(imp({ otherExcise: 1_000 })).notes).toContain(msg);
    // 個別消費税が 0 なら出ない
    expect(calcJapanImport(imp()).notes.some((n) => n.includes('個別消費税（酒税'))).toBe(false);
    // 免税なら出ない（課税自体が無い）
    expect(
      calcJapanImport(imp({ goodsValue: 5_000, freight: 0, insurance: 0, otherExcise: 1_000 }))
        .notes.some((n) => n.includes('個別消費税（酒税')),
    ).toBe(false);
  });

  it('何も特別な事情が無ければ注記は空', () => {
    expect(calcJapanImport(imp()).notes).toEqual([]);
  });

  it('nonNeg は 0・NaN・Infinity・負値をすべて 0 にする', () => {
    for (const bad of [0, -1, NaN, Infinity, -Infinity]) {
      const r = calcJapanImport({ goodsValue: bad, freight: bad, insurance: bad, dutyRate: 0, smallValueExemption: false });
      expect(r.customsValue, String(bad)).toBe(0);
      expect(r.landedCost, String(bad)).toBe(0);
    }
    // 正の値はそのまま
    expect(calcJapanImport(imp({ goodsValue: 1, freight: 0, insurance: 0, smallValueExemption: false })).customsValueRaw).toBe(1);
  });
});

describe('輸出 — 注記と既定', () => {
  it('輸出税が 0 のときと 0 超のときで先頭の注記が入れ替わる', () => {
    expect(calcExport(exp()).notes[0]).toBe(
      '日本は輸出に関税を課していません。輸出取引は消費税も免除されます（消費税法7条）。',
    );
    expect(calcExport(exp({ exportDutyRate: 0.01 })).notes[0]).toBe(
      '日本は輸出に関税を課していません。輸出税を入力しているため、日本以外からの輸出として計算しています。',
    );
  });

  it('課税価格の基準ごとに注記が変わる', () => {
    expect(calcExport(exp({ destBasis: 'CIF' })).notes[1]).toBe(
      '課税価格を CIF（国際運賃・保険料を含む）で計算しています。EU をはじめ多くの国はこの基準です。',
    );
    expect(calcExport(exp({ destBasis: 'FOB' })).notes[1]).toBe(
      '課税価格を FOB（国際運賃・保険料を含まない）で計算しています。米国はこの基準です。',
    );
  });

  it('負担者ごとに注記が変わり、既定は買手', () => {
    expect(calcExport(exp({ bearer: 'seller' })).notes[2]).toBe(
      'DDP など売手が輸入通関を行う条件のため、仕向国の関税・付加価値税を売手の負担として計上しています。',
    );
    expect(calcExport(exp({ bearer: 'buyer' })).notes[2]).toBe(
      'DAP・FOB など買手が輸入通関を行う条件のため、仕向国の関税・付加価値税は買手の負担です。',
    );
    // 未指定は買手
    const d = calcExport(exp());
    expect(d.notes[2]).toContain('買手の負担です');
    expect(d.buyerBurden).toBeCloseTo(d.destTotalTax, 6);
  });

  it('注記は必ず 4 件（輸出税・基準・負担者・丸め）', () => {
    expect(calcExport(exp()).notes).toHaveLength(4);
    expect(calcExport(exp()).notes[3]).toBe('仕向国側の端数処理は国ごとに規則が異なるため、丸めを行っていません。');
  });

  it('vatIncludesDuty の既定は true', () => {
    expect(calcExport(exp()).destVatBase).toBe(calcExport(exp({ vatIncludesDuty: true })).destVatBase);
  });

  it('exportDutyRate の既定は 0', () => {
    expect(calcExport(exp()).exportDuty).toBe(0);
  });

  it('負の税率は 0 として扱う', () => {
    const r = calcExport(exp({ exportDutyRate: -1, destDutyRate: -1, destVatRate: -1 }));
    expect(r.exportDuty).toBe(0);
    expect(r.destDuty).toBe(0);
    expect(r.destVat).toBe(0);
  });
});

describe('付加価値税の参考税率 — 表そのものを固定する', () => {
  it('掲載順と全項目', () => {
    expect(VAT_REFERENCE.map((v) => v.code)).toEqual(['JP', 'GB', 'FR', 'DE', 'KR', 'CN', 'US', 'EU']);
    expect(VAT_REFERENCE.map((v) => v.name)).toEqual([
      '日本', '英国', 'フランス', 'ドイツ', '韓国', '中国', '米国', 'EU（指令の下限）',
    ]);
    expect(VAT_REFERENCE.map((v) => v.standard)).toEqual([0.1, 0.2, 0.2, 0.19, 0.1, 0.13, null, 0.15]);
  });

  it('軽減税率を持つのは日本とフランスだけ', () => {
    expect(lookupVat('JP')!.reduced).toEqual([0.08]);
    expect(lookupVat('FR')!.reduced).toEqual([0.1, 0.055, 0.021]);
    for (const c of ['GB', 'DE', 'KR', 'CN', 'US', 'EU']) {
      expect(lookupVat(c)!.reduced, c).toBeUndefined();
    }
  });

  it('注記を持つのは米国と EU だけ', () => {
    for (const c of ['JP', 'GB', 'FR', 'DE', 'KR', 'CN']) {
      expect(lookupVat(c)!.note, c).toBeUndefined();
    }
    expect(lookupVat('US')!.note).toBe(
      '連邦の付加価値税はありません。州・地方の小売売上税（sales tax）が課され、税率は州や郡・市で異なります。関税の課税価格は FOB 基準です。',
    );
    expect(lookupVat('EU')!.note).toBe(
      'EU 指令は標準税率を15%以上と定めており、実際の税率は加盟国ごとに異なります。',
    );
  });

  it('定数の値', () => {
    expect(JP_NATIONAL_STANDARD).toBe(0.078);
    expect(JP_NATIONAL_REDUCED).toBe(0.0624);
    expect(JP_LOCAL_RATIO).toBe(22 / 78);
    expect(SMALL_VALUE_LIMIT).toBe(10_000);
    expect(PERSONAL_USE_FACTOR).toBe(0.6);
  });
});

describe('台帳から渡す輸入消費税の率・少額免税・個人使用の係数 (ImportParams)', () => {
  const base: ImportInput = { goodsValue: 100_000, freight: 5_000, insurance: 1_000, dutyRate: 0.05 };

  it('既定の引数は定数そのもので、省略時と同じ結果', () => {
    expect(DEFAULT_IMPORT_PARAMS).toEqual({
      nationalStandard: JP_NATIONAL_STANDARD,
      nationalReduced: JP_NATIONAL_REDUCED,
      smallValueLimit: SMALL_VALUE_LIMIT,
      personalUseFactor: PERSONAL_USE_FACTOR,
    });
    expect(calcJapanImport(base)).toEqual(calcJapanImport(base, DEFAULT_IMPORT_PARAMS));
  });

  it('国税の率 (標準 / 軽減) が消費税額に効く', () => {
    const p = { ...DEFAULT_IMPORT_PARAMS, nationalStandard: 0.1, nationalReduced: 0.07 };
    const std = calcJapanImport(base, p);
    const byDefault = calcJapanImport(base);
    expect(std.nationalTax).toBeGreaterThan(byDefault.nationalTax);
    expect(std.nationalTax).toBe(Math.floor((std.consumptionBase * 0.1) / 100) * 100);
    const red = calcJapanImport({ ...base, reducedRate: true }, p);
    expect(red.nationalTax).toBe(Math.floor((red.consumptionBase * 0.07) / 100) * 100);
  });

  it('少額免税の基準と個人使用の係数', () => {
    // 課税価格 106,000 は既定の 1 万円では課税、基準を 20 万円にすれば免税。
    expect(calcJapanImport(base).totalTax).toBeGreaterThan(0);
    const exempt = calcJapanImport(base, { ...DEFAULT_IMPORT_PARAMS, smallValueLimit: 200_000 });
    expect(exempt.totalTax).toBe(0);
    // 個人使用: 係数 50% なら課税価格は 50,000 (既定 60% は 60,000)。
    const personal = calcJapanImport({ ...base, personalUse: true }, { ...DEFAULT_IMPORT_PARAMS, personalUseFactor: 0.5 });
    expect(personal.customsValue).toBe(50_000);
    expect(calcJapanImport({ ...base, personalUse: true }).customsValue).toBe(60_000);
    expect(personal.notes.some((n) => n.includes('50%'))).toBe(true);
  });
});
