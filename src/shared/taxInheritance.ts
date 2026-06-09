/**
 * 相続税の概算算定 (純粋ロジック・IO なし)。
 *
 * **重要 — これは概算であり税務助言ではありません。実際の申告・各種特例 (配偶者の
 * 税額軽減・小規模宅地等の特例・2割加算等) は税理士に確認してください。**
 *
 * 日本の相続税 (相続税法) の「法定相続分課税方式」(令和ベース) を単純化した
 * 教育的シミュレーションです。基礎控除 (3,000 万円 + 600 万円 × 法定相続人数) →
 * 課税遺産総額 → 各法定相続人が法定相続分どおりに取得したと仮定して速算表を適用 →
 * 各人分を合算した「**相続税の総額**」までを概算します。
 *
 * **本モジュールが扱わない範囲 (相続税の総額の概算まで):**
 * - 配偶者の税額軽減 (1 億 6,000 万円 or 法定相続分相当額までの非課税)
 * - 小規模宅地等の特例 (居住用・事業用宅地の課税価格の減額)
 * - 相続税の総額を各人の実際の取得割合で按分した「各人の算出税額」
 * - 各人への按分後の納付額・配偶者控除・未成年者控除・障害者控除等
 * - 相続人以外 (孫・兄弟姉妹等) への **2 割加算**
 * これらを適用すると実際の納税額は変動するため、本モジュールの算定額は各種特例・
 * 税額控除を反映しない上振れした「総額」の概算です。
 *
 * ネットワーク / ファイル / Date.now / 乱数は一切使わない純粋関数のみ。
 */

/** 円未満を四捨五入 (内部計算の端数処理)。 */
function yen(n: number): number {
  return Math.round(n);
}

/**
 * 金額の入力検証。負値・非有限 (NaN / Infinity) は throw。
 * @param value 検証対象の金額 (円)
 * @param label エラーメッセージ用の項目名
 */
function assertNonNegativeFinite(value: number, label: string): void {
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`${label} must be a finite number >= 0 (got ${value})`);
  }
}

// --- 基礎控除 ------------------------------------------------------------
//
// 相続税の基礎控除 (相続税法 15 条、平成 27 年改正後・令和ベース):
//   基礎控除額 = 3,000 万円 + 600 万円 × 法定相続人の数
// 法定相続人の数は 1 以上の整数。

// Stryker disable all : 以下は基礎控除の法定の固定値 (相続税法 15 条)。
// 数値そのものの変異 (3,000 万 → 別額、600 万 → 別額) は税法の改定であって
// 「正しい値」を pin しても等価/トートロジー変異になりやすい。基礎控除の
// 算式 (定額 + 比例) と人数の入力検証は下の関数のテストで実値撃墜する。

/** 基礎控除の定額部分 (3,000 万円)。 */
export const INHERITANCE_BASIC_DEDUCTION_FIXED = 30_000_000;
/** 基礎控除の法定相続人 1 人あたりの加算額 (600 万円)。 */
export const INHERITANCE_BASIC_DEDUCTION_PER_HEIR = 6_000_000;

// Stryker restore all

/**
 * 相続税の基礎控除額を計算する。
 *
 * **概算であり税務助言ではない。実際の申告・各種特例 (配偶者の税額軽減・小規模
 * 宅地等の特例・2割加算等) は税理士に確認すること。**
 *
 * 基礎控除額 = 3,000 万円 + 600 万円 × 法定相続人数 (相続税法 15 条)。
 *
 * @param legalHeirsCount 法定相続人の数 (1 以上の整数)
 * @throws legalHeirsCount が 0 以下・非整数・非有限のとき
 */
export function inheritanceBasicDeduction(legalHeirsCount: number): number {
  if (!Number.isInteger(legalHeirsCount) || legalHeirsCount < 1) {
    throw new Error(
      `legalHeirsCount must be an integer >= 1 (got ${legalHeirsCount})`,
    );
  }
  return (
    INHERITANCE_BASIC_DEDUCTION_FIXED +
    INHERITANCE_BASIC_DEDUCTION_PER_HEIR * legalHeirsCount
  );
}

// --- 速算表 (相続税の速算表) ---------------------------------------------
//
// 相続税の速算表 (相続税法 16 条、令和ベース)。各法定相続人の「取得金額」
// (法定相続分どおりに取得したと仮定した 1 人分の課税価格) に対する税率と
// 速算控除額。税額 = 取得金額 × 税率 − 控除額。

/** 相続税の速算表ブラケット (取得金額の上限・税率・控除額)。 */
export interface InheritanceTaxBracket {
  /** この金額以下に適用 (Infinity = 上限なし)。 */
  readonly upTo: number;
  /** 税率 (0..1)。 */
  readonly rate: number;
  /** 速算控除額 (円)。 */
  readonly deduction: number;
}

// Stryker disable all : 以下は相続税の速算表 (相続税法 16 条) の法定リテラル定義。
// 税率・控除額・区分上限はいずれも税法上の固定値であり、リテラル変異は税法の
// 改定であってテストで「正しい値」を pin しても等価変異になりやすい。どの区分を
// どの取得金額に当てるか・税額の算式・境界比較は inheritanceTaxOnShare の実値/
// 境界テストで全面的に撃墜する。

/**
 * 相続税の速算表 (取得金額 昇順)。`inheritanceTaxOnShare` が `upTo` で区分を選ぶ。
 *   1,000 万円以下      10%  控除0
 *   3,000 万円以下      15%  控除50万
 *   5,000 万円以下      20%  控除200万
 *   1 億円以下          30%  控除700万
 *   2 億円以下          40%  控除1,700万
 *   3 億円以下          45%  控除2,700万
 *   6 億円以下          50%  控除4,200万
 *   6 億円超            55%  控除7,200万
 */
export const INHERITANCE_TAX_BRACKETS: readonly InheritanceTaxBracket[] = [
  { upTo: 10_000_000, rate: 0.1, deduction: 0 },
  { upTo: 30_000_000, rate: 0.15, deduction: 500_000 },
  { upTo: 50_000_000, rate: 0.2, deduction: 2_000_000 },
  { upTo: 100_000_000, rate: 0.3, deduction: 7_000_000 },
  { upTo: 200_000_000, rate: 0.4, deduction: 17_000_000 },
  { upTo: 300_000_000, rate: 0.45, deduction: 27_000_000 },
  { upTo: 600_000_000, rate: 0.5, deduction: 42_000_000 },
  { upTo: Infinity, rate: 0.55, deduction: 72_000_000 },
];

// Stryker restore all

/**
 * 速算表で「各法定相続人の取得金額」1 人分の相続税額を計算する。
 *
 * **概算であり税務助言ではない。実際の申告・各種特例 (配偶者の税額軽減・小規模
 * 宅地等の特例・2割加算等) は税理士に確認すること。**
 *
 * 税額 = 取得金額 × 税率 − 速算控除額 (相続税法 16 条)。負になる場合は 0。
 * 区分の境界は「○○以下 / ○○超」で厳密に判定する (`upTo` 以下でその区分)。
 *
 * @param taxableShare 各法定相続人の取得金額 (円、法定相続分どおりに取得した 1 人分)
 * @throws taxableShare が負値・非有限のとき
 */
export function inheritanceTaxOnShare(taxableShare: number): number {
  assertNonNegativeFinite(taxableShare, 'taxableShare');
  // Stryker disable next-line ConditionalExpression,EqualityOperator: 0 で速算表は 0 を返すため早期returnと同値。
  if (taxableShare === 0) return 0;
  // 速算表は各区分の境界で連続 (速算控除額がそう設計されている) ため、区分上限
  // ちょうどの取得金額は現区分・次区分のいずれで計算しても税額が完全に一致する
  // (boundary.test で実証)。したがって `<=`→`<` (EqualityOperator) は数学的に
  // 等価変異になる。区分選択ロジック・税率×金額−控除・Math.max(0,...) は実値テストで撃墜。
  // Stryker disable next-line EqualityOperator: 速算表は境界で連続のため <= と < が等価 (上記)。
  const bracket = INHERITANCE_TAX_BRACKETS.find((b) => taxableShare <= b.upTo);
  // Infinity 上限ブラケットが必ず最後に存在するため bracket は常に定義される。
  return Math.max(0, yen(taxableShare * bracket!.rate - bracket!.deduction));
}

// --- 課税遺産総額 (基礎控除後) -------------------------------------------

/** `netTaxableEstate` の入力。 */
export interface NetTaxableEstateInput {
  /** 課税価格の合計額 (相続財産の総額、円)。負値・非有限は throw。 */
  readonly grossEstate: number;
  /** 債務 (借入金等、円)。任意・既定 0。負値・非有限は throw。 */
  readonly debts?: number;
  /** 葬式費用 (円)。任意・既定 0。負値・非有限は throw。 */
  readonly funeralExpenses?: number;
  /** 法定相続人の数 (1 以上の整数)。基礎控除の算定に使う。 */
  readonly legalHeirsCount: number;
}

/**
 * 課税遺産総額 (基礎控除後) を計算する純粋ヘルパ。
 *
 * **概算であり税務助言ではない。実際の申告・各種特例 (配偶者の税額軽減・小規模
 * 宅地等の特例・2割加算等) は税理士に確認すること。**
 *
 * 課税価格 = grossEstate − debts − funeralExpenses (債務控除)。
 * そこから基礎控除 (`inheritanceBasicDeduction`) を引いた額を返す。負なら 0。
 *
 * @throws grossEstate / debts / funeralExpenses が負値・非有限のとき、
 *         legalHeirsCount が 0 以下・非整数・非有限のとき
 */
export function netTaxableEstate({
  grossEstate,
  debts = 0,
  funeralExpenses = 0,
  legalHeirsCount,
}: NetTaxableEstateInput): number {
  assertNonNegativeFinite(grossEstate, 'grossEstate');
  assertNonNegativeFinite(debts, 'debts');
  assertNonNegativeFinite(funeralExpenses, 'funeralExpenses');
  const basicDeduction = inheritanceBasicDeduction(legalHeirsCount);
  const taxablePrice = grossEstate - debts - funeralExpenses;
  return Math.max(0, taxablePrice - basicDeduction);
}

// --- 相続税の総額 (法定相続分課税方式) -----------------------------------

/** 法定相続分の配列の入力検証 (許容誤差付きで合計 1.0)。 */
function assertLegalShares(legalShares: readonly number[]): void {
  if (legalShares.length === 0) {
    throw new Error('legalShares must not be empty');
  }
  let sum = 0;
  for (const share of legalShares) {
    if (!Number.isFinite(share) || share < 0) {
      throw new Error(`legalShares element must be a finite number >= 0 (got ${share})`);
    }
    sum += share;
  }
  // 合計は 1.0 (許容誤差 1e-9)。浮動小数の和 (例 1/2+1/4+1/4) の誤差を吸収する。
  // `>` → `>=` (EqualityOperator) は等価変異: 両者が分岐するのは `Math.abs(sum-1)` が
  // **ちょうど 1e-9** のときだけだが、IEEE754 では 1±1e-9 を厳密に表現できず
  // (`Math.abs((1+1e-9)-1) === 1e-9` は false)、`Math.abs(sum-1)` が正確に 1e-9 に
  // なる float の和は存在しない。よって両演算子は全入力で同値であり実テストで撃墜不能。
  // Stryker disable next-line EqualityOperator: 許容誤差 1e-9 ちょうどは float で到達不能 (上記)。
  if (Math.abs(sum - 1) > 1e-9) {
    throw new Error(`legalShares must sum to 1.0 (got ${sum})`);
  }
}

/** `totalInheritanceTax` の入力。 */
export interface TotalInheritanceTaxInput {
  /** 課税遺産総額 (基礎控除後、円)。負値・非有限は throw。 */
  readonly taxableEstate: number;
  /** 各法定相続人の法定相続分の配列 (合計 1.0)。空・合計≠1.0・要素負は throw。 */
  readonly legalShares: readonly number[];
}

/**
 * 相続税の総額を「法定相続分課税方式」で計算する。
 *
 * **概算であり税務助言ではない。実際の申告・各種特例 (配偶者の税額軽減・小規模
 * 宅地等の特例・2割加算等) は税理士に確認すること。** 本関数は相続税の **総額** の
 * 概算までで、各人への按分後の納付額・配偶者の税額軽減・2割加算は扱わない。
 *
 * 手順 (相続税法 16 条):
 *   (1) 課税遺産総額 `taxableEstate` を各法定相続人の法定相続分 `legalShares` で按分。
 *   (2) 各按分額に速算表 (`inheritanceTaxOnShare`) を適用。
 *   (3) 各人分を合算したものが「相続税の総額」。**100 円未満を切り捨てる**。
 *
 * @throws taxableEstate が負値・非有限のとき、legalShares が空・合計≠1.0・要素負のとき
 */
export function totalInheritanceTax({
  taxableEstate,
  legalShares,
}: TotalInheritanceTaxInput): number {
  assertNonNegativeFinite(taxableEstate, 'taxableEstate');
  assertLegalShares(legalShares);
  let total = 0;
  for (const share of legalShares) {
    total += inheritanceTaxOnShare(taxableEstate * share);
  }
  // 相続税の総額は 100 円未満を切り捨てる (国税庁 相続税の計算)。
  return Math.floor(total / 100) * 100;
}

// --- 統合 ----------------------------------------------------------------

/** `estimateInheritanceTax` の入力。 */
export interface EstimateInheritanceTaxInput {
  /** 課税価格の合計額 (相続財産の総額、円)。負値・非有限は throw。 */
  readonly grossEstate: number;
  /** 債務 (借入金等、円)。任意・既定 0。負値・非有限は throw。 */
  readonly debts?: number;
  /** 葬式費用 (円)。任意・既定 0。負値・非有限は throw。 */
  readonly funeralExpenses?: number;
  /**
   * 各法定相続人の法定相続分の配列 (合計 1.0)。空・合計≠1.0・要素負は throw。
   * `legalShares.length` が法定相続人の数 (基礎控除の算定に使う)。
   */
  readonly legalShares: readonly number[];
}

/** `estimateInheritanceTax` の結果。 */
export interface InheritanceTaxEstimate {
  /** 基礎控除額 (3,000 万円 + 600 万円 × 法定相続人数)。 */
  readonly basicDeduction: number;
  /** 課税遺産総額 (基礎控除後、0 以上)。 */
  readonly taxableEstate: number;
  /** 相続税の総額 (100 円未満切捨後)。 */
  readonly totalTax: number;
}

/**
 * 相続税の概算を統合的に算定する。
 *
 * **概算であり税務助言ではない。実際の申告・各種特例 (配偶者の税額軽減・小規模
 * 宅地等の特例・2割加算等) は税理士に確認すること。** 相続税の **総額** の概算
 * までで、各人への按分後の納付額・配偶者の税額軽減・2割加算は扱わない。
 *
 * 手順:
 *   (1) `legalShares.length` を法定相続人数として基礎控除を算定。
 *   (2) `netTaxableEstate` で課税遺産総額 (課税価格 − 基礎控除、負なら 0) を算定。
 *   (3) `totalInheritanceTax` で法定相続分課税方式の相続税の総額を算定。
 *
 * @throws grossEstate / debts / funeralExpenses が負値・非有限のとき、
 *         legalShares が空・合計≠1.0・要素負のとき
 */
export function estimateInheritanceTax({
  grossEstate,
  debts = 0,
  funeralExpenses = 0,
  legalShares,
}: EstimateInheritanceTaxInput): InheritanceTaxEstimate {
  assertLegalShares(legalShares);
  const legalHeirsCount = legalShares.length;
  const basicDeduction = inheritanceBasicDeduction(legalHeirsCount);
  const taxableEstate = netTaxableEstate({
    grossEstate,
    debts,
    funeralExpenses,
    legalHeirsCount,
  });
  const totalTax = totalInheritanceTax({ taxableEstate, legalShares });
  return { basicDeduction, taxableEstate, totalTax };
}
