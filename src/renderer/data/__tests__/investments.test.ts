import { describe, expect, it } from 'vitest';
import {
  parsePropertyEntry,
  parseHoldingEntry,
  holdingToForm,
  propertyToForm,
  computeRealEstatePortfolio,
  computeFundPortfolio,
  fundValuation,
  PROPERTIES_COLLECTION,
  HOLDINGS_COLLECTION,
  PROPERTY_TYPES,
} from '../investments';
import { SNAPSHOT } from '../snapshot';

describe('parsePropertyEntry (不動産の任意追加)', () => {
  const valid = { name: '福岡市アパート', type: '一棟', monthlyRent: '250000', purchasePrice: '38,000,000' };

  it('parses a valid entry (カンマ・任意項目の既定 0・入居既定 true)', () => {
    const p = parsePropertyEntry(valid);
    expect(p).toEqual({
      name: '福岡市アパート',
      type: '一棟',
      monthlyRent: 250_000,
      purchasePrice: 38_000_000,
      occupied: true,
      monthlyExpenses: 0,
      monthlyLoan: 0,
    });
  });

  it('accepts optional expenses/loan and occupied=false', () => {
    const p = parsePropertyEntry({ ...valid, occupied: false, monthlyExpenses: '30000', monthlyLoan: '120000' });
    expect(p.occupied).toBe(false);
    expect(p.monthlyExpenses).toBe(30_000);
    expect(p.monthlyLoan).toBe(120_000);
  });

  it('rejects empty name / empty type / negative rent / zero price', () => {
    expect(() => parsePropertyEntry({ ...valid, name: '  ' })).toThrow('物件名');
    expect(() => parsePropertyEntry({ ...valid, type: '' })).toThrow('種別');
    expect(() => parsePropertyEntry({ ...valid, monthlyRent: '-1' })).toThrow('家賃');
    expect(() => parsePropertyEntry({ ...valid, purchasePrice: '0' })).toThrow('取得価格');
    expect(() => parsePropertyEntry({ ...valid, monthlyExpenses: 'abc' })).toThrow('月次経費');
  });

  it('exposes stable collection names and type options', () => {
    expect(PROPERTIES_COLLECTION).toBe('realestate-properties');
    expect(HOLDINGS_COLLECTION).toBe('mutualfund-holdings');
    expect(PROPERTY_TYPES).toContain('区分所有');
    expect(PROPERTY_TYPES).toContain('一棟');
  });
});

describe('computeRealEstatePortfolio', () => {
  const base = SNAPSHOT.realEstate;

  it('snapshot 行のみ → snapshot に手書きされた集計値と完全一致 (不変条件)', () => {
    const p = computeRealEstatePortfolio(
      base.properties,
      base.monthlyCashflow.operatingExpenses,
      base.monthlyCashflow.mortgagePayment,
    );
    expect(p.grossRent).toBe(base.monthlyCashflow.grossRent);
    expect(p.operatingExpenses).toBe(base.monthlyCashflow.operatingExpenses);
    expect(p.mortgagePayment).toBe(base.monthlyCashflow.mortgagePayment);
    expect(p.netCashflow).toBe(base.monthlyCashflow.netCashflow);
    expect(p.portfolioYield).toBe(base.portfolioYield);
    expect(p.occupancyRate).toBe(base.occupancyRate);
  });

  it('ユーザー物件の追加が家賃・経費・返済・入居率へ反映される', () => {
    const user = parsePropertyEntry({
      name: '追加物件', type: '戸建て', monthlyRent: '100000', purchasePrice: '12000000',
      monthlyExpenses: '10000', monthlyLoan: '40000',
    });
    const p = computeRealEstatePortfolio(
      [...base.properties, user],
      base.monthlyCashflow.operatingExpenses,
      base.monthlyCashflow.mortgagePayment,
    );
    expect(p.grossRent).toBe(base.monthlyCashflow.grossRent + 100_000);
    expect(p.operatingExpenses).toBe(base.monthlyCashflow.operatingExpenses + 10_000);
    expect(p.mortgagePayment).toBe(base.monthlyCashflow.mortgagePayment + 40_000);
    expect(p.netCashflow).toBe(p.grossRent - p.operatingExpenses - p.mortgagePayment);
    // 追加物件の表面利回り = 100000*12/12000000 = 10.0% → 平均 (4.8+6.2+5.5+8.1+10.0)/5
    expect(p.portfolioYield).toBe(6.92);
    expect(p.occupancyRate).toBe(0.8);
  });

  it('空室のユーザー物件は家賃に入らないが入居率の分母に入る', () => {
    const vacant = parsePropertyEntry({
      name: '空室', type: 'その他', monthlyRent: '80000', purchasePrice: '10000000', occupied: false,
    });
    const p = computeRealEstatePortfolio([...base.properties, vacant], 0, 0);
    expect(p.grossRent).toBe(base.monthlyCashflow.grossRent);
    expect(p.occupancyRate).toBe(0.6);
  });

  it('物件 0 件は全て 0 (ゼロ除算なし)', () => {
    const p = computeRealEstatePortfolio([], 0, 0);
    expect(p).toEqual({ grossRent: 0, operatingExpenses: 0, mortgagePayment: 0, netCashflow: 0, portfolioYield: 0, occupancyRate: 0 });
  });
});

describe('parseHoldingEntry (投資信託の任意追加)', () => {
  const valid = { code: '9C31118A', name: 'ニッセイ外国株式インデックス', units: '500000', navPerUnit: '32000' };

  it('parses a valid entry and derives valuation (口数÷1万×基準価額 = auto モード)', () => {
    const h = parseHoldingEntry(valid);
    expect(h.valuation).toBe(fundValuation(500_000, 32_000));
    expect(h.valuation).toBe(1_600_000);
    expect(h.valuationMode).toBe('auto');
    // 取得額の既定は評価額 (損益 0)、YTD の既定は 0。
    expect(h.acquisitionCost).toBe(1_600_000);
    expect(h.ytdReturnPct).toBe(0);
  });

  it('評価額を直接入力すると manual モード (口数・基準価額は任意)', () => {
    const h = parseHoldingEntry({ name: '手動ファンド', valuation: '2,500,000' });
    expect(h.valuationMode).toBe('manual');
    expect(h.valuation).toBe(2_500_000);
    expect(h.units).toBe(0);
    expect(h.navPerUnit).toBe(0);
    expect(h.acquisitionCost).toBe(2_500_000);
  });

  it('manual モードでも口数・基準価額を併記でき、評価額は入力値が勝つ', () => {
    const h = parseHoldingEntry({ ...valid, valuation: '1500000' });
    expect(h.valuationMode).toBe('manual');
    expect(h.valuation).toBe(1_500_000);
    expect(h.units).toBe(500_000);
    expect(h.navPerUnit).toBe(32_000);
  });

  it('manual の評価額 0 円・不正値は拒否 (自動へ戻すには空欄)', () => {
    expect(() => parseHoldingEntry({ name: 'x', valuation: '0' })).toThrow('評価額');
    expect(() => parseHoldingEntry({ name: 'x', valuation: 'abc' })).toThrow('評価額');
  });

  it('accepts optional acquisitionCost / ytdReturnPct', () => {
    const h = parseHoldingEntry({ ...valid, acquisitionCost: '1,400,000', ytdReturnPct: '12.5' });
    expect(h.acquisitionCost).toBe(1_400_000);
    expect(h.ytdReturnPct).toBe(12.5);
  });

  it('rejects empty name / zero units / zero nav / bad ytd / whitespace code', () => {
    expect(() => parseHoldingEntry({ ...valid, name: '' })).toThrow('ファンド名');
    expect(() => parseHoldingEntry({ ...valid, units: '0' })).toThrow('口数');
    expect(() => parseHoldingEntry({ ...valid, navPerUnit: '' })).toThrow('基準価額');
    expect(() => parseHoldingEntry({ ...valid, ytdReturnPct: '2000' })).toThrow('YTD');
    expect(() => parseHoldingEntry({ ...valid, code: 'AB C' })).toThrow('銘柄コード');
  });

  it('snapshot の評価額の慣習 (1万口あたり基準価額) を再現する', () => {
    for (const h of SNAPSHOT.mutualFunds.holdings) {
      expect(fundValuation(h.units, h.navPerUnit)).toBe(h.valuation);
    }
  });

  it('holdingToForm: auto は評価額欄を空欄で往復 (再保存しても auto のまま)', () => {
    const auto = parseHoldingEntry(valid);
    const form = holdingToForm(auto);
    expect(form.valuation).toBe('');
    expect(parseHoldingEntry(form)).toEqual(auto);
  });

  it('holdingToForm: manual は評価額を持って往復し、空欄にすれば auto へ切替', () => {
    const manual = parseHoldingEntry({ ...valid, valuation: '1500000' });
    const form = holdingToForm(manual);
    expect(form.valuation).toBe('1500000');
    expect(parseHoldingEntry(form)).toEqual(manual);
    // 評価額を空欄にして保存し直す → auto に戻り、口数×基準価額で自動計算。
    const back = parseHoldingEntry({ ...form, valuation: '' });
    expect(back.valuationMode).toBe('auto');
    expect(back.valuation).toBe(1_600_000);
  });

  it('propertyToForm: 物件は往復で等価 (任意欄 0 は空欄へ)', () => {
    const p = parsePropertyEntry({ name: '往復物件', type: '一棟', monthlyRent: '250000', purchasePrice: '38000000' });
    const form = propertyToForm(p);
    expect(form.monthlyExpenses).toBe('');
    expect(parsePropertyEntry(form)).toEqual(p);
  });
});

describe('computeFundPortfolio', () => {
  const base = SNAPSHOT.mutualFunds;

  it('snapshot 行のみ → snapshot に手書きされた portfolio と完全一致 (不変条件)', () => {
    const p = computeFundPortfolio(base.holdings, base.portfolio.totalCostBasis, []);
    expect(p.totalValuation).toBe(base.portfolio.totalValuation);
    expect(p.totalCostBasis).toBe(base.portfolio.totalCostBasis);
    expect(p.unrealizedGain).toBe(base.portfolio.unrealizedGain);
    expect(p.unrealizedGainPct).toBe(base.portfolio.unrealizedGainPct);
  });

  it('ユーザー銘柄の評価額・取得額が加算される', () => {
    const h = parseHoldingEntry({ code: '', name: '追加ファンド', units: '100000', navPerUnit: '20000', acquisitionCost: '150000' });
    const p = computeFundPortfolio([...base.holdings, h], base.portfolio.totalCostBasis, [h.acquisitionCost]);
    expect(p.totalValuation).toBe(base.portfolio.totalValuation + 200_000);
    expect(p.totalCostBasis).toBe(base.portfolio.totalCostBasis + 150_000);
    expect(p.unrealizedGain).toBe(p.totalValuation - p.totalCostBasis);
  });

  it('保有 0 件・原価 0 は全て 0 (ゼロ除算なし)', () => {
    expect(computeFundPortfolio([], 0, [])).toEqual({ totalValuation: 0, totalCostBasis: 0, unrealizedGain: 0, unrealizedGainPct: 0 });
  });
});
