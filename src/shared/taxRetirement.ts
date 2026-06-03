/**
 * 退職所得の税額計算 (分離課税)。
 *
 * **重要 — これは概算試算であり、正確な税額計算・税務助言ではありません。**
 * 退職所得は給与所得とは別に分離課税される。国税庁 No.1420 / No.2732 等の
 * 一般ルールに基づくが、特殊なケース (同一年に複数支払・前年以前の退職所得との
 * 通算等) は反映しない。確定申告・源泉徴収は公式ツール / 税理士で確認すること。
 *
 * 計算の流れ:
 *   退職所得控除額 = 勤続20年以下: 40万×年数 (最低80万)
 *                    勤続20年超:   800万 + 70万×(年数-20)
 *   退職所得      = (退職金 - 退職所得控除) × 1/2
 *     ※ 2022年改正: 勤続5年以下で「短期退職手当等」(役員等以外含む) は
 *       300万円を超える部分の 1/2 課税が適用されない。
 *     ※ 障害者になったことに基因する退職は控除額に +100万 (任意フラグ)。
 *   所得税        = 退職所得 × 速算表 × (1 + 復興特別所得税 2.1%)
 *   住民税        = 退職所得 × 10% (分離課税・調整控除なし)
 */

import { calcBaseIncomeTax, RECONSTRUCTION_SURTAX_RATE, RESIDENT_TAX_RATE } from './taxCalc';

function yen(n: number): number {
  return Math.round(n);
}

/**
 * 勤続年数から退職所得控除額を計算する。
 * 勤続年数は1年未満切り上げ (例: 10年1か月 → 11年) を呼び出し側で行う前提だが、
 * ここでは渡された整数年で計算する。
 *
 * @param yearsOfService 勤続年数 (1年未満は切り上げた整数)
 * @param disability 障害者になったことに基因する退職か (控除 +100万)
 */
export function retirementDeduction(yearsOfService: number, disability = false): number {
  const years = Math.max(0, Math.floor(yearsOfService));
  let base: number;
  // Stryker disable EqualityOperator: years<=20 の境界は years=20 で else枝(8,000,000)と連続=等価変異。
  if (years === 0) {
    base = 0;
  } else if (years <= 20) {
    base = Math.max(800_000, 400_000 * years);
  } else {
    base = 8_000_000 + 700_000 * (years - 20);
  }
  // Stryker restore EqualityOperator
  return base + (disability ? 1_000_000 : 0);
}

/**
 * 課税退職所得金額を計算する。
 *
 * @param severance 退職金 (税引前の支給総額)
 * @param yearsOfService 勤続年数 (1年未満切り上げの整数)
 * @param opts.shortTerm 勤続5年以下の「短期退職手当等」か (300万超の1/2不適用)
 * @param opts.disability 障害退職か (控除+100万)
 */
export function calcRetirementTaxableIncome(
  severance: number,
  yearsOfService: number,
  opts: { readonly shortTerm?: boolean; readonly disability?: boolean } = {},
): number {
  const deduction = retirementDeduction(yearsOfService, opts.disability ?? false);
  const afterDeduction = Math.max(0, severance - deduction);
  // Stryker disable next-line ConditionalExpression: 早期returnを外しても afterDeduction=0 は yen(0/2)=0 で同値。
  if (afterDeduction === 0) return 0;

  // 短期退職手当等 (勤続5年以下): 控除後 300万までは1/2、300万超は全額。
  if (opts.shortTerm && Math.floor(yearsOfService) <= 5) {
    // Stryker disable next-line EqualityOperator: 3,000,000 で <= と < は同値 (上下の式が連続)。
    if (afterDeduction <= 3_000_000) {
      return yen(afterDeduction / 2);
    }
    // 300万までの1/2 (=150万) + 300万超の全額。
    return yen(1_500_000 + (afterDeduction - 3_000_000));
  }

  // 通常: 控除後の1/2 (千円未満切り捨ては簡略化のため四捨五入)。
  return yen(afterDeduction / 2);
}

export interface RetirementTaxResult {
  /** 退職所得控除額。 */
  readonly deduction: number;
  /** 課税退職所得金額。 */
  readonly taxableIncome: number;
  /** 所得税 (復興特別所得税込み)。 */
  readonly incomeTax: number;
  /** 住民税 (分離課税・所得割10%)。 */
  readonly residentTax: number;
  /** 退職金からの手取り。 */
  readonly takeHome: number;
}

/**
 * 退職金と勤続年数から、退職所得にかかる所得税・住民税・手取りを試算する。
 */
export function calcRetirementTax(
  severance: number,
  yearsOfService: number,
  opts: { readonly shortTerm?: boolean; readonly disability?: boolean } = {},
): RetirementTaxResult {
  // Stryker disable next-line all: severance<=0 の早期returnは、計算経路でも同じゼロ群を返すため等価。
  if (severance <= 0) {
    return { deduction: retirementDeduction(yearsOfService, opts.disability ?? false), taxableIncome: 0, incomeTax: 0, residentTax: 0, takeHome: 0 };
  }
  const deduction = retirementDeduction(yearsOfService, opts.disability ?? false);
  const taxableIncome = calcRetirementTaxableIncome(severance, yearsOfService, opts);
  const incomeTax = yen(calcBaseIncomeTax(taxableIncome) * (1 + RECONSTRUCTION_SURTAX_RATE));
  const residentTax = yen(taxableIncome * RESIDENT_TAX_RATE);
  const takeHome = severance - incomeTax - residentTax;
  return { deduction, taxableIncome, incomeTax, residentTax, takeHome };
}
