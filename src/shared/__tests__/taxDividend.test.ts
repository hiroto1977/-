import { describe, expect, it } from 'vitest';
import {
  compareDividendMethods,
  dividendMarginalRate,
  DEFAULT_DIVIDEND_PARAMS,
  DIVIDEND_WITHHOLDING_INCOME_BASE_RATE,
  DIVIDEND_WITHHOLDING_INCOME_RATE,
  DIVIDEND_WITHHOLDING_RESIDENT_RATE,
  withholdingTotalRate,
} from '../taxDividend';
import { RECONSTRUCTION_SURTAX_RATE, RESIDENT_TAX_RATE } from '../taxCalc';

describe('compareDividendMethods', () => {
  it('withholding and separate methods have identical tax (20.315%)', () => {
    const c = compareDividendMethods(1_000_000, 5_000_000);
    expect(c.withholding.totalTax).toBe(c.separate.totalTax);
    expect(c.withholding.incomeTax).toBe(Math.round(1_000_000 * DIVIDEND_WITHHOLDING_INCOME_RATE));
    expect(c.withholding.residentTax).toBe(Math.round(1_000_000 * DIVIDEND_WITHHOLDING_RESIDENT_RATE));
  });

  it('源泉徴収の所得税率は 0.15315 (15% × 1.021 復興特別所得税込み)', () => {
    // 0.15 * (1 + RECONSTRUCTION_SURTAX_RATE) のリテラル検証。* を / / + を − に
    // する ArithmeticOperator mutant を、定数のリテラル期待値で殺す。
    expect(DIVIDEND_WITHHOLDING_INCOME_RATE).toBeCloseTo(0.15315, 5);
    expect(DIVIDEND_WITHHOLDING_RESIDENT_RATE).toBe(0.05);
  });

  it('exposes each method code + label (StringLiteral を golden で固定)', () => {
    const c = compareDividendMethods(1_000_000, 5_000_000);
    expect([c.withholding.method, c.withholding.label]).toEqual(['withholding', '申告不要 (源泉徴収)']);
    expect([c.separate.method, c.separate.label]).toEqual(['separate', '申告分離課税 (20.315%)']);
    expect([c.aggregate.method, c.aggregate.label]).toEqual(['aggregate', '総合課税 (累進+配当控除)']);
  });

  it('総合課税の所得税は復興特別所得税 ×1.021 を乗じる (高所得で非ゼロ)', () => {
    // 配当以外 2,000万 + 配当 100万。incomeTaxAfterCredit=350,000 → ×1.021=357,350。
    // ×(1+rate) を ÷ / (1−rate) にする mutant はこのリテラルで殺せる。
    const c = compareDividendMethods(1_000_000, 20_000_000);
    expect(c.aggregate.incomeTax).toBe(357_350);
  });

  it('総合課税の配当控除は taxableTotal=base+dividend で率が決まる (10M超で半減)', () => {
    // base=1,000万 + 配当100万 = 1,100万 (>1,000万 → 控除率半減)。base+dividend を
    // base−dividend にする mutant は 900万 (<1,000万→全率) で所得税が下がるため殺せる。
    const c = compareDividendMethods(1_000_000, 10_000_000);
    expect(c.aggregate.incomeTax).toBe(285_880);
  });

  it('総合課税の住民税は max(0, 配当×10% − 配当控除) で正値になりうる', () => {
    // 配当50万 + 他100万: 50,000 − 14,000 = 36,000 (>0)。Math.max(0,…) を
    // Math.min(0,…) にする mutant は 0 になるため、正値リテラルで殺す。
    const c = compareDividendMethods(500_000, 1_000_000);
    expect(c.aggregate.residentTax).toBe(36_000);
  });

  it('prefers aggregate (総合課税) at low income where the dividend credit wins', () => {
    // 課税所得が低い (例: 配当以外 100万) → 総合課税 5%+配当控除 で 20.315% より軽い
    const c = compareDividendMethods(500_000, 1_000_000);
    expect(c.best).toBe('aggregate');
    expect(c.aggregate.totalTax).toBeLessThan(c.withholding.totalTax);
  });

  it('prefers withholding at high income where progressive rates exceed 20.315%', () => {
    // 配当以外が 2,000万 → 総合課税の限界税率 40% は配当控除を引いても 20.315% 超
    const c = compareDividendMethods(1_000_000, 20_000_000);
    expect(c.best).toBe('withholding');
    expect(c.aggregate.totalTax).toBeGreaterThan(c.withholding.totalTax);
  });

  it('returns all zeros for a zero dividend', () => {
    const c = compareDividendMethods(0, 5_000_000);
    expect(c.withholding.totalTax).toBe(0);
    expect(c.aggregate.totalTax).toBe(0);
    expect(c.best).toBe('withholding');
  });

  it('clamps a negative dividend to zero', () => {
    const c = compareDividendMethods(-100, 5_000_000);
    expect(c.withholding.totalTax).toBe(0);
  });

  it('breaks ties in favor of withholding (simpler)', () => {
    // contrived: zero dividend → all methods 0 → withholding chosen
    const c = compareDividendMethods(0, 0);
    expect(c.best).toBe('withholding');
  });

  it('uses the kind to vary the dividend credit (mutual-fund vs stock)', () => {
    // 投信は配当控除率が株式の半分 → 総合課税が株式より不利 (税額が大きい)
    const stock = compareDividendMethods(500_000, 1_000_000, 'stock');
    const fund = compareDividendMethods(500_000, 1_000_000, 'mutual-fund');
    expect(fund.aggregate.totalTax).toBeGreaterThanOrEqual(stock.aggregate.totalTax);
  });
});

describe('dividendMarginalRate', () => {
  it('returns the bracket rate at the combined income level', () => {
    // 配当以外 500万 + 配当 100万 = 600万 → 20% ブラケット
    expect(dividendMarginalRate(5_000_000, 1_000_000)).toBe(0.2);
    expect(dividendMarginalRate(0, 0)).toBe(0);
  });

  it('合算 (base + dividend) でブラケットが決まる (各項を分離して殺す)', () => {
    // base 300万 + 配当 200万 = 500万 → 20%。
    // base+dividend を base−dividend にする mutant → 100万 → 5%。
    // Math.max(0,dividend) を Math.min(0,dividend) にする mutant → 300万のみ → 10%。
    // いずれも 0.2 にならないため、合算 500万→20% のリテラルで両方殺せる。
    expect(dividendMarginalRate(3_000_000, 2_000_000)).toBe(0.2);
  });
});

/*
 * 台帳 (`parameters.ts`) から渡す率。省略時は定数と同じ結果 (1 円も違わない)、渡せば
 * 源泉の所得税率・付加率・配当割・住民税率のそれぞれが効く。
 */
describe('台帳から渡す率 (DividendParams)', () => {
  it('既定の引数は定数そのもので、省略時と同じ結果', () => {
    expect(DEFAULT_DIVIDEND_PARAMS).toEqual({
      withholdingIncomeRate: DIVIDEND_WITHHOLDING_INCOME_BASE_RATE,
      surtaxRate: RECONSTRUCTION_SURTAX_RATE,
      withholdingResidentRate: DIVIDEND_WITHHOLDING_RESIDENT_RATE,
      residentTaxRate: RESIDENT_TAX_RATE,
    });
    expect(DIVIDEND_WITHHOLDING_INCOME_BASE_RATE).toBe(0.15);
    expect(DIVIDEND_WITHHOLDING_INCOME_RATE).toBe(0.15 * (1 + RECONSTRUCTION_SURTAX_RATE));
    expect(withholdingTotalRate()).toBe(0.20315);
    for (const d of [1, 999, 1_000_000, 1_234_567, 98_765_432]) {
      expect(compareDividendMethods(d, 5_000_000, 'stock', DEFAULT_DIVIDEND_PARAMS)).toEqual(compareDividendMethods(d, 5_000_000));
    }
    expect(compareDividendMethods(1_000_000, 5_000_000).separate.label).toBe('申告分離課税 (20.315%)');
  });

  it('源泉の所得税率と付加率が申告不要 / 申告分離の税額と文言に効く', () => {
    const p = { ...DEFAULT_DIVIDEND_PARAMS, withholdingIncomeRate: 0.2, surtaxRate: 0 };
    const c = compareDividendMethods(1_000_000, 5_000_000, 'stock', p);
    expect(c.withholding.incomeTax).toBe(200_000);
    expect(c.withholding.residentTax).toBe(50_000);
    expect(c.separate.totalTax).toBe(250_000);
    expect(c.separate.label).toBe('申告分離課税 (25%)');
    expect(withholdingTotalRate(p)).toBe(0.25);
    // 付加率だけ変えると、率の結合順 (率 × (1 + 付加率) を先に掛ける) のまま効く。
    const q = { ...DEFAULT_DIVIDEND_PARAMS, surtaxRate: 0.1 };
    expect(compareDividendMethods(1_000_000, 5_000_000, 'stock', q).withholding.incomeTax).toBe(Math.round(1_000_000 * (0.15 * 1.1)));
    expect(compareDividendMethods(1_000_000, 5_000_000, 'stock', q).separate.label).toBe('申告分離課税 (21.5%)');
  });

  it('配当割と住民税率が申告不要側と総合課税側の住民税に効く', () => {
    const p = { ...DEFAULT_DIVIDEND_PARAMS, withholdingResidentRate: 0.08, residentTaxRate: 0.2 };
    const c = compareDividendMethods(1_000_000, 5_000_000, 'stock', p);
    expect(c.withholding.residentTax).toBe(80_000);
    // 総合課税の住民税 = 配当 × 20% − 配当控除 (住民税)。既定 (10%) より配当の 10% 分だけ増える。
    const base = compareDividendMethods(1_000_000, 5_000_000);
    expect(c.aggregate.residentTax - base.aggregate.residentTax).toBe(100_000);
    // 付加率は総合課税の所得税にも掛かる。
    const noSurtax = compareDividendMethods(1_000_000, 5_000_000, 'stock', { ...DEFAULT_DIVIDEND_PARAMS, surtaxRate: 0 });
    expect(noSurtax.aggregate.incomeTax).toBeLessThan(base.aggregate.incomeTax);
    expect(base.aggregate.incomeTax).toBe(Math.round(noSurtax.aggregate.incomeTax * (1 + RECONSTRUCTION_SURTAX_RATE)));
  });
});
