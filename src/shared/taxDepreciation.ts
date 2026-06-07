/**
 * 日本の税務減価償却 (定額法 / 定率法 / 少額減価償却資産) の概算計算 — 純粋関数のみ。
 *
 * **重要 — これは概算であり税務助言ではありません。実際の申告は税理士に確認すること。**
 * 償却率・改定償却率・端数処理は簡便化しており、国税庁「減価償却資産の償却率表」とは
 * 一致しない場合があります。ネットワーク / ファイル / 乱数 / 現在時刻に依存しない
 * 純粋関数で、テスト容易性のため計算をここに集約しています。
 *
 * 既存の {@link "./depreciation"} (年単位スケジュール) とは別系統で、こちらは
 * 期中取得の月割・年度ごとの `{ year, opening, depreciation, closing, accumulated }`
 * 詳細行を返すことに主眼を置いています。
 */

/** 円未満を四捨五入する内部ヘルパ。 */
function yen(n: number): number {
  return Math.round(n);
}

/**
 * 取得月〜期末月の月数 (期中取得の月割の分子) を「両端含む」で求める。
 *
 * 例: 期末3月・取得4月 → 4,5,...,3 = 12 か月 (期首取得)。
 *     期末3月・取得1月 → 1,2,3 = 3 か月。
 *     期末12月・取得10月 → 10,11,12 = 3 か月。
 */
function monthsInFirstYear(acquisitionMonth: number, fiscalYearEndMonth: number): number {
  const diff = fiscalYearEndMonth - acquisitionMonth;
  // diff が負なら年度をまたぐので +12。両端含むため +1。
  return (diff >= 0 ? diff : diff + 12) + 1;
}

/** 月 (1..12) を検証する。範囲外なら throw。 */
function assertMonth(month: number, label: string): void {
  if (!Number.isInteger(month) || month < 1 || month > 12) {
    throw new Error(`${label} は 1〜12 の月で指定してください: ${month}`);
  }
}

/** 共通の入力検証 (取得価額 >= 0, 耐用年数 > 0)。 */
function assertCommon(acquisitionCost: number, usefulLifeYears: number): void {
  if (!Number.isFinite(acquisitionCost) || acquisitionCost < 0) {
    throw new Error(`取得価額は 0 以上で指定してください: ${acquisitionCost}`);
  }
  if (!Number.isInteger(usefulLifeYears) || usefulLifeYears <= 0) {
    throw new Error(`耐用年数は 1 以上の整数で指定してください: ${usefulLifeYears}`);
  }
}

/** 減価償却スケジュールの 1 年分。 */
export interface DepreciationRow {
  /** 年度 (1 始まり)。 */
  readonly year: number;
  /** 期首帳簿価額。 */
  readonly opening: number;
  /** その年度の償却費。 */
  readonly depreciation: number;
  /** 期末帳簿価額 (= opening − depreciation)。 */
  readonly closing: number;
  /** 期首から当年度までの償却累計額。 */
  readonly accumulated: number;
}

/**
 * 定額法の償却率 (= 1 ÷ 耐用年数) を返す純粋ヘルパ。
 *
 * **概算であり税務助言ではない。実際の申告は税理士に確認すること。**
 *
 * 端数処理は国税庁「減価償却資産の償却率表」の慣行に倣い、**小数第 4 位を切り上げて
 * 小数第 3 位までに丸める** (例: 耐用年数 3 → 1/3 = 0.3333… → 0.334)。
 * 償却率はわずかに大きめに丸めることで耐用年数内に償却し切れる方向に倒す。
 *
 * @param usefulLifeYears 耐用年数 (1 以上の整数)。0 以下・非整数は throw。
 */
export function depreciationRate(usefulLifeYears: number): number {
  if (!Number.isInteger(usefulLifeYears) || usefulLifeYears <= 0) {
    throw new Error(`耐用年数は 1 以上の整数で指定してください: ${usefulLifeYears}`);
  }
  // 小数第 4 位を切り上げて第 3 位までに丸める (国税庁償却率表の慣行)。
  return Math.ceil((1 / usefulLifeYears) * 1_000) / 1_000;
}

/**
 * 取得価額が 10 万円未満かを判定する (少額減価償却資産 → 取得年に全額損金)。
 *
 * **概算であり税務助言ではない。実際の申告は税理士に確認すること。**
 *
 * 10 万円 **未満** (< 100,000) が対象。境界: 99,999 円 → true、100,000 円 → false。
 *
 * @param acquisitionCost 取得価額 (0 以上)。負値・非有限は throw。
 */
export function isImmediateExpense(acquisitionCost: number): boolean {
  if (!Number.isFinite(acquisitionCost) || acquisitionCost < 0) {
    throw new Error(`取得価額は 0 以上で指定してください: ${acquisitionCost}`);
  }
  return acquisitionCost < 100_000;
}

/** 定額法の入力。 */
export interface StraightLineInput {
  /** 取得価額 (0 以上)。 */
  readonly acquisitionCost: number;
  /** 耐用年数 (1 以上の整数)。 */
  readonly usefulLifeYears: number;
  /** 取得月 (1..12)。期中取得の月割に使用。省略時は期首取得 (12 か月)。 */
  readonly acquisitionMonth?: number;
  /** 会計年度の期末月 (1..12)。省略時は 12 (暦年)。 */
  readonly fiscalYearEndMonth?: number;
}

/**
 * 定額法 (毎期一定額) の償却スケジュールを計算する。
 *
 * **概算であり税務助言ではない。実際の申告は税理士に確認すること。**
 *
 * - 償却率 = {@link depreciationRate} (1 ÷ 耐用年数、小数第 4 位切上げで第 3 位丸め)。
 * - 年間償却費 = 取得価額 × 償却率 (円未満四捨五入)。
 * - 期中取得 (`acquisitionMonth` 指定) は初年度のみ月割 (取得月〜期末月の月数 ÷ 12)。
 * - 帳簿価額が備忘価額 1 円に達したらそこで償却を止める。月割で初年度償却が
 *   小さいと耐用年数を 1 年超える場合があるため、**残額が 1 円になるまで** 行を追加し、
 *   最終行で必ず 1 円の備忘価額を残す。
 *
 * @throws acquisitionCost < 0 / 非有限、usefulLifeYears <= 0 / 非整数、月が 1..12 外。
 */
export function straightLineDepreciation(input: StraightLineInput): DepreciationRow[] {
  const { acquisitionCost, usefulLifeYears } = input;
  const acquisitionMonth = input.acquisitionMonth ?? 12;
  const fiscalYearEndMonth = input.fiscalYearEndMonth ?? 12;
  assertCommon(acquisitionCost, usefulLifeYears);
  assertMonth(acquisitionMonth, '取得月');
  assertMonth(fiscalYearEndMonth, '期末月');

  // 取得価額 1 円以下は償却対象なし (備忘価額に満たない)。空配列を返す。
  if (acquisitionCost <= 1) return [];

  const rate = depreciationRate(usefulLifeYears);
  const annual = yen(acquisitionCost * rate);
  const firstYearMonths =
    input.acquisitionMonth === undefined
      ? 12
      : monthsInFirstYear(acquisitionMonth, fiscalYearEndMonth);
  const firstYearAnnual = yen((annual * firstYearMonths) / 12);

  const rows: DepreciationRow[] = [];
  let book = acquisitionCost;
  let accumulated = 0;
  let year = 0;
  // 残存簿価が 1 円 (備忘価額) に達するまで償却。annual >= 1 (assertCommon で
  // usefulLifeYears>=1 かつ acquisitionCost>1 を保証) のため必ず終了する。
  while (book > 1) {
    year += 1;
    const opening = book;
    // 初年度は月割、以降は年額。ただし残額が 1 円を割らないよう opening-1 で頭打ち。
    const baseDep = year === 1 ? firstYearAnnual : annual;
    const dep = Math.min(baseDep, opening - 1);
    book = opening - dep;
    accumulated += dep;
    rows.push({ year, opening, depreciation: dep, closing: book, accumulated });
  }
  return rows;
}

/** 定率法の方式。'200%' / '250%' / '定率' (= 200%)。 */
export type DecliningMethod = '200%' | '250%' | '定率';

/** 方式から倍率を求める。'定率' は 200% (倍率 2.0) とみなす。 */
function methodMultiplier(method: DecliningMethod): number {
  if (method === '250%') return 2.5;
  // '200%' と '定率' はいずれも倍率 2.0。
  return 2;
}

/** 定率法の入力。 */
export interface DecliningBalanceInput {
  /** 取得価額 (0 以上)。 */
  readonly acquisitionCost: number;
  /** 耐用年数 (1 以上の整数)。 */
  readonly usefulLifeYears: number;
  /** 償却方式。'200%' / '250%' / '定率' (= 200%)。 */
  readonly method: DecliningMethod;
  /** 取得月 (1..12)。期中取得の月割に使用。省略時は期首取得 (12 か月)。 */
  readonly acquisitionMonth?: number;
  /** 会計年度の期末月 (1..12)。省略時は 12 (暦年)。 */
  readonly fiscalYearEndMonth?: number;
}

/**
 * 定率法 (期首帳簿価額に一定率を乗ずる) の償却スケジュールを計算する。
 *
 * **概算であり税務助言ではない。実際の申告は税理士に確認すること。**
 *
 * - 償却率 = 倍率 ÷ 耐用年数 ('200%'/'定率' は 2.0、'250%' は 2.5)。
 * - 調整前償却額 = 期首帳簿価額 × 償却率。
 * - **償却保証額** = 取得価額 × 保証率。本モジュールは国税庁の保証率表を持たず、
 *   保証率を「1 ÷ 耐用年数」で近似する。すなわち償却保証額 ≈ 取得価額 ÷ 耐用年数。
 * - 調整前償却額が償却保証額を **下回った最初の年度** から、その年度の期首帳簿価額を
 *   「改定取得価額」として固定し、以後は **残存年数で均等償却** する (改定償却率の近似)。
 * - 期中取得 (`acquisitionMonth` 指定) は初年度のみ月割。
 * - 最終行で必ず備忘価額 1 円を残す。
 *
 * @throws acquisitionCost < 0 / 非有限、usefulLifeYears <= 0 / 非整数、月が 1..12 外。
 */
export function decliningBalanceDepreciation(input: DecliningBalanceInput): DepreciationRow[] {
  const { acquisitionCost, usefulLifeYears, method } = input;
  const acquisitionMonth = input.acquisitionMonth ?? 12;
  const fiscalYearEndMonth = input.fiscalYearEndMonth ?? 12;
  assertCommon(acquisitionCost, usefulLifeYears);
  assertMonth(acquisitionMonth, '取得月');
  assertMonth(fiscalYearEndMonth, '期末月');

  if (acquisitionCost <= 1) return [];

  const rate = methodMultiplier(method) / usefulLifeYears;
  // 償却保証額の近似 (取得価額 ÷ 耐用年数)。調整前償却額がこれを下回ったら均等償却へ。
  const guaranteedAmount = acquisitionCost / usefulLifeYears;
  const firstYearMonths =
    input.acquisitionMonth === undefined
      ? 12
      : monthsInFirstYear(acquisitionMonth, fiscalYearEndMonth);

  const rows: DepreciationRow[] = [];
  let book = acquisitionCost;
  let accumulated = 0;
  let year = 0;
  let switched = false;
  // 切替後に均等償却する残存年数 (切替年度の期首で確定) と切替後の経過年数。
  let remainingYearsAtSwitch = 0;
  let yearsSinceSwitch = 0;

  while (book > 1) {
    year += 1;
    const opening = book;
    let dep: number;
    if (!switched) {
      const beforeAdjust = opening * rate;
      if (beforeAdjust < guaranteedAmount) {
        // 改定償却率へ切替: 残存年数で均等償却する。残存年数 = 耐用年数 − 経過年数 + 1
        // (当年度を含む)。月割で年数が伸びている場合に備え最低 1 年とする。
        switched = true;
        remainingYearsAtSwitch = Math.max(1, usefulLifeYears - year + 1);
        yearsSinceSwitch = 0;
        dep = yen(opening / remainingYearsAtSwitch);
      } else {
        dep = yen(beforeAdjust);
      }
    } else {
      const remaining = remainingYearsAtSwitch - yearsSinceSwitch;
      dep = remaining > 0 ? yen(opening / remaining) : opening - 1;
    }
    if (switched) yearsSinceSwitch += 1;
    // 初年度は月割。
    if (year === 1) dep = yen((dep * firstYearMonths) / 12);
    // 残存簿価が備忘 1 円を割らないよう opening-1 で頭打ち。
    dep = Math.min(dep, opening - 1);
    book = opening - dep;
    accumulated += dep;
    rows.push({ year, opening, depreciation: dep, closing: book, accumulated });
  }
  return rows;
}
