/**
 * 上場株式等の配当の課税方式の有利判定。
 *
 * **重要 — これは概算試算であり、正確な税額計算・税務助言ではありません。**
 * 上場株式等の配当 (大口株主等を除く) は、確定申告で次の 3 方式から選べる
 * (国税庁 No.1330 / No.1250 等):
 *
 * 1. 申告不要: 源泉徴収 (所得税 15.315% + 住民税 5% = 20.315%) で完結。
 * 2. 申告分離課税: 税率は申告不要と同じ 20.315% だが、上場株式等の譲渡損と
 *    損益通算・繰越控除ができる。
 * 3. 総合課税: 配当を他の所得と合算して累進課税。ただし配当控除が使える。
 *    課税所得が低いほど有利になりやすい。
 *
 * 本モジュールは各方式の税負担 (所得税+住民税) を概算し、最も税額が小さい
 * 方式を提示する。社会保険料への影響・住民税の課税方式の不一致選択 (令和6年
 * 度以降は所得税と住民税で異なる方式を選べない) 等は反映しない。確定申告は
 * 公式ツール / 税理士で確認すること。
 */

import { yen } from './num';
import {
  calcBaseIncomeTax,
  marginalIncomeTaxRate,
  RECONSTRUCTION_SURTAX_RATE,
  RESIDENT_TAX_RATE,
} from './taxCalc';
import { calcDividendCredit, type DividendKind } from './taxCredits';

/** 源泉徴収の所得税率の本体 (15%)。復興特別所得税を掛ける前 (租税特別措置法 8 条の4)。 */
export const DIVIDEND_WITHHOLDING_INCOME_BASE_RATE = 0.15;
/** 源泉徴収 (申告不要) の所得税率 (15% × 1.021)。 */
export const DIVIDEND_WITHHOLDING_INCOME_RATE = DIVIDEND_WITHHOLDING_INCOME_BASE_RATE * (1 + RECONSTRUCTION_SURTAX_RATE);
/** 源泉徴収 (申告不要) の住民税率。 */
export const DIVIDEND_WITHHOLDING_RESIDENT_RATE = 0.05;

/** 配当の税額計算が読む率 (台帳 `parameters.ts` から渡せる)。省略時は定数。 */
export interface DividendParams {
  /** 源泉徴収の所得税率の本体 (15%)。 */
  readonly withholdingIncomeRate: number;
  /** 復興特別所得税の付加率 (2.1%)。所得税の項を共有する。 */
  readonly surtaxRate: number;
  /** 源泉徴収の住民税率 (配当割 5%)。税額控除の項を共有する。 */
  readonly withholdingResidentRate: number;
  /** 住民税の所得割率 (10%・総合課税で使う)。住民税の項を共有する。 */
  readonly residentTaxRate: number;
}

export const DEFAULT_DIVIDEND_PARAMS: DividendParams = {
  withholdingIncomeRate: DIVIDEND_WITHHOLDING_INCOME_BASE_RATE,
  surtaxRate: RECONSTRUCTION_SURTAX_RATE,
  withholdingResidentRate: DIVIDEND_WITHHOLDING_RESIDENT_RATE,
  residentTaxRate: RESIDENT_TAX_RATE,
};

/** 申告不要 / 申告分離の合計税率 (所得税 × (1 + 付加率) + 住民税)。既定で 20.315%。有効桁 12 で丸める。 */
export function withholdingTotalRate(p: DividendParams = DEFAULT_DIVIDEND_PARAMS): number {
  return Number((p.withholdingIncomeRate * (1 + p.surtaxRate) + p.withholdingResidentRate).toPrecision(12));
}

export type DividendMethod = 'withholding' | 'separate' | 'aggregate';

export interface DividendMethodResult {
  readonly method: DividendMethod;
  readonly label: string;
  /** 配当にかかる所得税 (復興特別所得税込み)。 */
  readonly incomeTax: number;
  /** 配当にかかる住民税。 */
  readonly residentTax: number;
  /** 税負担合計。 */
  readonly totalTax: number;
}

export interface DividendComparison {
  readonly withholding: DividendMethodResult;
  readonly separate: DividendMethodResult;
  readonly aggregate: DividendMethodResult;
  /** 最も税負担が小さい方式。 */
  readonly best: DividendMethod;
}

/** 申告不要 / 申告分離の税額 (既定でどちらも 20.315%)。 */
function withholdingTax(dividend: number, p: DividendParams): { incomeTax: number; residentTax: number } {
  // 率を先に掛け合わせてから配当に掛ける (定数 `DIVIDEND_WITHHOLDING_INCOME_RATE` と同じ結合順 — 1 円の差を出さない)。
  const incomeRate = p.withholdingIncomeRate * (1 + p.surtaxRate);
  return {
    incomeTax: yen(dividend * incomeRate),
    residentTax: yen(dividend * p.withholdingResidentRate),
  };
}

/**
 * 総合課税を選んだ場合の「配当による追加税額」を計算する。
 *
 * 配当は他の課税所得の上に積まれるとみなし、(配当込みの基準所得税額 −
 * 配当なしの基準所得税額) を配当による所得税の増分とする。そこから配当控除を
 * 引き、復興特別所得税を乗じる。住民税は配当 × 10% − 配当控除(住民税)。
 *
 * @param dividend 配当所得
 * @param otherTaxableIncome 配当以外の課税所得 (所得税ベース)
 * @param kind 配当の種類 (配当控除率)
 */
function aggregateTax(
  dividend: number,
  otherTaxableIncome: number,
  kind: DividendKind,
  p: DividendParams,
): { incomeTax: number; residentTax: number } {
  const base = Math.max(0, otherTaxableIncome);
  // 配当を上積みした基準所得税額の増分。
  const incomeTaxBefore = calcBaseIncomeTax(base);
  const incomeTaxAfter = calcBaseIncomeTax(base + dividend);
  const incomeTaxDelta = Math.max(0, incomeTaxAfter - incomeTaxBefore);

  const credit = calcDividendCredit({
    dividendIncome: dividend,
    taxableTotalIncome: base + dividend,
    kind,
  });

  const incomeTaxAfterCredit = Math.max(0, incomeTaxDelta - credit.incomeTax);
  const incomeTax = yen(incomeTaxAfterCredit * (1 + p.surtaxRate));
  // 住民税: 配当 × 10% − 配当控除(住民税)。
  const residentTax = Math.max(0, yen(dividend * p.residentTaxRate) - credit.residentTax);
  return { incomeTax, residentTax };
}

/**
 * 上場株式等の配当について 3 方式の税負担を比較し、最有利を返す。
 *
 * @param dividend 配当所得 (円)
 * @param otherTaxableIncome 配当以外の課税所得 (所得税ベース、円)
 * @param kind 配当の種類 (既定 'stock')
 */
export function compareDividendMethods(
  dividend: number,
  otherTaxableIncome: number,
  kind: DividendKind = 'stock',
  p: DividendParams = DEFAULT_DIVIDEND_PARAMS,
): DividendComparison {
  const d = Math.max(0, dividend);
  const wh = withholdingTax(d, p);
  const ag = aggregateTax(d, otherTaxableIncome, kind, p);

  const withholding: DividendMethodResult = {
    method: 'withholding',
    label: '申告不要 (源泉徴収)',
    incomeTax: wh.incomeTax,
    residentTax: wh.residentTax,
    totalTax: wh.incomeTax + wh.residentTax,
  };
  // 申告分離は税率は申告不要と同じ (損益通算が使える点が異なるが税額は同じ)。
  const separate: DividendMethodResult = {
    method: 'separate',
    label: `申告分離課税 (${Number((withholdingTotalRate(p) * 100).toPrecision(12))}%)`,
    incomeTax: wh.incomeTax,
    residentTax: wh.residentTax,
    totalTax: wh.incomeTax + wh.residentTax,
  };
  const aggregate: DividendMethodResult = {
    method: 'aggregate',
    label: '総合課税 (累進+配当控除)',
    incomeTax: ag.incomeTax,
    residentTax: ag.residentTax,
    totalTax: ag.incomeTax + ag.residentTax,
  };

  // 最小の税負担を選ぶ。同額なら申告不要を優先 (手続きが簡単)。
  let best: DividendMethod = 'withholding';
  if (aggregate.totalTax < withholding.totalTax) best = 'aggregate';
  return { withholding, separate, aggregate, best };
}

/** 配当の限界税率 (総合課税で配当に適用される所得税の限界税率) を返す。 */
export function dividendMarginalRate(otherTaxableIncome: number, dividend: number): number {
  return marginalIncomeTaxRate(Math.max(0, otherTaxableIncome) + Math.max(0, dividend));
}
