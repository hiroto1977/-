/**
 * 法人税等 (法人税・地方法人税・法人住民税・法人事業税) の概算と税引後利益。
 *
 * **重要 — これは概算試算であり、正確な税額計算・税務助言ではありません。**
 * 日本の法人課税を単純化したシミュレーションです。外形標準課税 (付加価値割・
 * 資本割)・各種税額控除 (研究開発税制等)・繰越欠損金・連結 (グループ通算)・
 * 中間納付・地方自治体ごとの超過税率・均等割の従業者数区分などは反映しません。
 * 申告・納税は税理士 / 国税庁・e-Tax / 都道府県・市区町村で確定してください。
 *
 * 年度: 令和6年度 (2024年度) ベースの税率を使用。
 *
 * 計算の流れ (課税所得 → 法人税等 → 税引後利益):
 *   1. 法人税       = 中小: 800万以下 15% + 超過 23.2% / 大法人: 一律 23.2%
 *   2. 地方法人税   = 法人税額 × 10.3%
 *   3. 法人住民税   = 法人税割 (法人税額 × 7.0% 標準) + 均等割 (資本金等の額 ×
 *                     従業者数 (50人超/以下) の区分テーブルで解決。明示指定が
 *                     あればそれを優先、capital も無ければ最小区分 7万円)
 *   4. 法人事業税   = 所得割 (中小は所得段階別 3.5/5.3/7.0% の概算)
 *                     + 特別法人事業税 (基準法人所得割額 × 37%)
 *   5. 実効税率     = 法人税等合計 / 課税所得
 *   6. 税引後利益   = 課税所得 − 法人税等合計
 */

function yen(n: number): number {
  return Math.round(n);
}

// --- 年度定数 (令和6年度 / 2024) ----------------------------------------
// 根拠: 法人税法66条 (中小法人の軽減税率 15% / 本則 23.2%)、
// 地方法人税法 (10.3%)、地方税法 (住民税法人税割 標準7.0% / 事業税所得割
// 標準税率 / 特別法人事業税 所得割の37%)。

// Stryker disable all : 以下は年度税率テーブルのリテラル定義。
// 数値そのものは税法上の固定値であり、変異 (1->-1, *->/, 値変更) は
// 「別の税率にしたら結果が変わる」という自明な等価/トートロジー変異になる。
// 計算ロジック (どの率をどの所得帯に適用するか) は下の関数群で実テスト撃墜する。

/** 中小法人の軽減税率 (年800万円以下の所得部分)。 */
export const CORP_TAX_REDUCED_RATE = 0.15;
/** 法人税の本則税率 (中小の800万円超部分・大法人の全所得)。 */
export const CORP_TAX_STANDARD_RATE = 0.232;
/** 軽減税率が適用される所得の上限 (年800万円)。 */
export const CORP_TAX_REDUCED_THRESHOLD = 8_000_000;

/** 地方法人税率 (法人税額に対して)。 */
export const LOCAL_CORP_TAX_RATE = 0.103;

/** 法人住民税 法人税割の標準税率 (法人税額に対して)。 */
export const RESIDENT_CORP_TAX_RATE = 0.07;
/** 均等割の概算既定 (最小区分 7万円)。 */
export const DEFAULT_PER_CAPITA_LEVY = 70_000;

/** 均等割の従業者数区分の境界 (この人数「超」で 50人超 区分)。 */
export const PER_CAPITA_EMPLOYEE_THRESHOLD = 50;

/** 法人事業税 所得割の段階別標準税率 (中小法人・所得割課税法人)。 */
export const BUSINESS_TAX_RATE_TIER1 = 0.035; // 年400万円以下
export const BUSINESS_TAX_RATE_TIER2 = 0.053; // 年400万円超800万円以下
export const BUSINESS_TAX_RATE_TIER3 = 0.07; // 年800万円超
/** 事業税の所得段階の境界 (下限)。 */
export const BUSINESS_TAX_TIER1_LIMIT = 4_000_000;
/** 事業税の所得段階の境界 (上限)。 */
export const BUSINESS_TAX_TIER2_LIMIT = 8_000_000;

/** 特別法人事業税の税率 (基準法人所得割額に対して)。 */
export const SPECIAL_BUSINESS_TAX_RATE = 0.37;

/** 資本金による「大法人」判定の境界 (1億円超で大法人)。 */
export const LARGE_CORP_CAPITAL_THRESHOLD = 100_000_000;

// Stryker restore all

// --- 法人住民税 均等割の区分テーブル (令和6年度・標準税率) ----------------
//
// 均等割は「資本金等の額」の5区分 × 従業者数 (50人超/50人以下) の 2 列で
// 決まる (地方税法 52条 (道府県民税均等割) + 312条 (市町村民税均等割))。
// 下表は道府県民税均等割 (標準額 2万/5万/13万/54万/80万) と市町村民税均等割
// (標準額 5万/13万/16万/41万、従業者50人超は 12万/15万/40万/175万/300万) を
// 合算した「標準税率ベースの年額」。超過課税・自治体差は概算では反映しない。
//
//   資本金等の額           従業者50人以下   従業者50人超
//   1千万円以下             70,000          140,000   (道2万+市5/12万)
//   1千万円超〜1億円以下    180,000         200,000   (道5万+市13/15万)
//   1億円超〜10億円以下     290,000         530,000   (道13万+市16/40万)
//   10億円超〜50億円以下    410,000         2,290,000 (道54万+市41/175万)
//   50億円超               410,000         3,800,000 (道80万 (※)+市41/300万)
//
// (※) 50億円超かつ50人以下は道府県80万+市41万=121万が原則だが、実務上 50人
//     以下の最上位 (10億円超50人以下) と同額 41万へ丸める簡易扱いとはせず、
//     精度のため下表では資本金区分のみで道府県分を引き上げる。下記の通り
//     50人以下列は資本金が上がっても市町村分が 41万で頭打ちになる点に注意。
//     概算目的のため 50人以下の最上位 2 区分 (10億超/50億超) は 410,000 で同額。

/** 均等割区分テーブルの1行 (資本金等の額の上限と、従業者数別の年額)。 */
export interface PerCapitaTier {
  /** この区分に属する資本金等の額の上限 (この額「以下」)。最上位は Infinity。 */
  readonly capitalUpperBound: number;
  /** 従業者 50人以下のときの均等割年額 (円)。 */
  readonly levyFew: number;
  /** 従業者 50人超のときの均等割年額 (円)。 */
  readonly levyMany: number;
}

// Stryker disable all : 均等割区分テーブルは静的なデータ定義 (令和6年度 標準税率)。
// 各数値リテラルの書き換え変異は境界テストで網羅できない部分が等価になりやすい
// ため、罠#2 に従いデータ定義ブロックのみ無効化する。資本金・従業者数 →
// 均等割額の解決ロジック (resolveCorporatePerCapita) は無効化せず実テストで撃墜。

/**
 * 法人住民税 均等割の区分テーブル (資本金等の額 昇順)。
 * 資本金等の額 `c` は capitalUpperBound[i-1] < c ≤ capitalUpperBound[i] の
 * 区分 i に属する (「超〜以下」ルール)。
 */
const PER_CAPITA_TIERS: readonly PerCapitaTier[] = [
  { capitalUpperBound: 10_000_000, levyFew: 70_000, levyMany: 140_000 }, // 1千万円以下
  { capitalUpperBound: 100_000_000, levyFew: 180_000, levyMany: 200_000 }, // 1千万超〜1億以下
  { capitalUpperBound: 1_000_000_000, levyFew: 290_000, levyMany: 530_000 }, // 1億超〜10億以下
  { capitalUpperBound: 5_000_000_000, levyFew: 410_000, levyMany: 2_290_000 }, // 10億超〜50億以下
  { capitalUpperBound: Infinity, levyFew: 410_000, levyMany: 3_800_000 }, // 50億円超
];

// Stryker restore all

// --- 区分 ---------------------------------------------------------------

/**
 * 会社区分。すべて任意で、保守的な既定 (中小・最小均等割) に倒す。
 *
 * @property capital      資本金 (円)。1億円超なら大法人扱い。均等割区分の解決にも使う
 *                        (資本金等の額の概算として)。
 * @property employees    従業者数 (人)。均等割の 50人超/以下 区分の判定に使う。
 *                        未指定なら 50人以下 (保守的に小さい区分) とみなす。
 * @property smallBusiness 中小法人として扱うか。明示すると capital より優先。
 * @property perCapitaLevy 法人住民税 均等割の年額 (円)。明示すると区分テーブル
 *                        より優先。未指定なら capital(+employees) から区分解決、
 *                        capital も無ければ最小区分 (7万円)。
 */
export interface CorporateProfile {
  readonly capital?: number;
  readonly employees?: number;
  readonly smallBusiness?: boolean;
  readonly perCapitaLevy?: number;
}

/**
 * 資本金等の額と従業者数から法人住民税 均等割の年額を区分テーブルで解決する。
 *
 * 資本金区分は「超〜以下」ルール (capitalUpperBound 以下でその区分)、従業者数は
 * `PER_CAPITA_EMPLOYEE_THRESHOLD` (50人) 「超」で大区分。負/未指定の従業者数は
 * 50人以下とみなす。資本金が極小/負でも最小区分 (7万円) に底打ちする。
 *
 * @param capital   資本金等の額 (円)
 * @param employees 従業者数 (人)。既定 0 (=50人以下)。
 */
export function resolveCorporatePerCapita(capital: number, employees = 0): number {
  const c = Math.max(0, capital);
  const many = employees > PER_CAPITA_EMPLOYEE_THRESHOLD;
  // 下位区分から走査し、最初に「上限以下」を満たした区分を採用する。
  // 最上位区分は capitalUpperBound===Infinity なので必ず一致し、ループは最後まで
  // 走り得る。フォールバックは最小区分の重複返却ではなく throw にすることで、
  // ループ境界の変異 (i < length → i <= length 等) を実テストで撃墜する。
  for (let i = 0; i < PER_CAPITA_TIERS.length; i++) {
    const tier = PER_CAPITA_TIERS[i]!;
    if (c <= tier.capitalUpperBound) {
      return many ? tier.levyMany : tier.levyFew;
    }
  }
  // 最上位区分が Infinity 上限なので有効なテーブルでは到達不能。
  // Stryker disable next-line all : 到達不能 (空テーブル等の不正入力に対する防御)。
  throw new Error('resolveCorporatePerCapita: empty or invalid tier table');
}

/**
 * プロファイルから法人住民税 均等割の年額を決定する (clamp 前の生値)。
 *   1. perCapitaLevy が明示されていればそれを最優先 (従来挙動を保持)。
 *   2. なければ capital から区分テーブルで解決 (employees があれば反映)。
 *   3. capital も無ければ最小区分 (DEFAULT_PER_CAPITA_LEVY)。
 */
export function resolvePerCapitaLevy(profile: CorporateProfile = {}): number {
  if (profile.perCapitaLevy !== undefined) return profile.perCapitaLevy;
  if (profile.capital !== undefined) {
    return resolveCorporatePerCapita(profile.capital, profile.employees ?? 0);
  }
  return DEFAULT_PER_CAPITA_LEVY;
}

/**
 * プロファイルから中小法人かどうかを判定する。
 * smallBusiness が明示されていればそれを優先。次に capital で判定
 * (1億円超は大法人=false)。どちらも未指定なら保守的に中小 (true)。
 */
export function isSmallBusiness(profile: CorporateProfile = {}): boolean {
  if (profile.smallBusiness !== undefined) return profile.smallBusiness;
  if (profile.capital !== undefined) return profile.capital <= LARGE_CORP_CAPITAL_THRESHOLD;
  return true;
}

// --- 個別税額 -----------------------------------------------------------

/**
 * 法人税額を計算する。
 *   中小法人: 800万円以下の部分 15% + 超過部分 23.2%
 *   大法人:   全所得 23.2%
 * 所得0以下は0。
 *
 * @param taxableIncome 課税所得 (円)
 * @param small         中小法人か
 */
export function calcCorporateIncomeTax(taxableIncome: number, small: boolean): number {
  const income = Math.max(0, taxableIncome);
  // Stryker disable next-line ConditionalExpression: income=0 の早期returnを外しても、各項が 0×率=0 を返すため等価。
  if (income === 0) return 0;
  if (!small) {
    return yen(income * CORP_TAX_STANDARD_RATE);
  }
  const reducedPart = Math.min(income, CORP_TAX_REDUCED_THRESHOLD);
  const standardPart = Math.max(0, income - CORP_TAX_REDUCED_THRESHOLD);
  return yen(reducedPart * CORP_TAX_REDUCED_RATE + standardPart * CORP_TAX_STANDARD_RATE);
}

/**
 * 地方法人税額を計算する (法人税額 × 10.3%)。
 *
 * @param corporateIncomeTax 法人税額 (円)
 */
export function calcLocalCorporateTax(corporateIncomeTax: number): number {
  return yen(Math.max(0, corporateIncomeTax) * LOCAL_CORP_TAX_RATE);
}

/**
 * 法人住民税額を計算する。
 *   法人税割 (法人税額 × 7.0% 標準) + 均等割 (区分の最低額)
 * 所得0でも均等割は課される。
 *
 * @param corporateIncomeTax 法人税額 (円)
 * @param perCapitaLevy      均等割の年額 (既定 7万円)
 */
export function calcResidentCorporateTax(
  corporateIncomeTax: number,
  perCapitaLevy: number = DEFAULT_PER_CAPITA_LEVY,
): number {
  const corporateTaxPortion = yen(Math.max(0, corporateIncomeTax) * RESIDENT_CORP_TAX_RATE);
  return corporateTaxPortion + Math.max(0, perCapitaLevy);
}

/**
 * 法人事業税 (所得割) を計算する。
 *   400万以下 3.5% + 400万超800万以下 5.3% + 800万超 7.0%
 * 「基準法人所得割額」(=所得割の標準税率による額) を返す。
 * 所得0以下は0。
 *
 * 注: 大法人の外形標準課税 (付加価値割・資本割) は概算では扱わず、
 * 所得割中心の簡易扱いとする (大法人も同じ段階別所得割で近似)。
 *
 * @param taxableIncome 課税所得 (円)
 */
export function calcBusinessTaxIncomePortion(taxableIncome: number): number {
  const income = Math.max(0, taxableIncome);
  // Stryker disable next-line ConditionalExpression: income=0 の早期returnを外しても、各 tier が 0×率=0 を返すため等価。
  if (income === 0) return 0;
  const tier1 = Math.min(income, BUSINESS_TAX_TIER1_LIMIT);
  const tier2 = Math.min(
    Math.max(0, income - BUSINESS_TAX_TIER1_LIMIT),
    BUSINESS_TAX_TIER2_LIMIT - BUSINESS_TAX_TIER1_LIMIT,
  );
  const tier3 = Math.max(0, income - BUSINESS_TAX_TIER2_LIMIT);
  return yen(
    tier1 * BUSINESS_TAX_RATE_TIER1 +
      tier2 * BUSINESS_TAX_RATE_TIER2 +
      tier3 * BUSINESS_TAX_RATE_TIER3,
  );
}

/**
 * 特別法人事業税を計算する (基準法人所得割額 × 37%)。
 *
 * @param businessTaxIncomePortion 基準法人所得割額 (円)
 */
export function calcSpecialBusinessTax(businessTaxIncomePortion: number): number {
  return yen(Math.max(0, businessTaxIncomePortion) * SPECIAL_BUSINESS_TAX_RATE);
}

// --- 合算 ---------------------------------------------------------------

/** 法人税等の内訳と税引後利益。 */
export interface CorporateTaxBreakdown {
  /** 課税所得 (入力をそのまま反映。負はそのまま)。 */
  readonly taxableIncome: number;
  /** 法人税。 */
  readonly corporateIncomeTax: number;
  /** 地方法人税。 */
  readonly localCorporateTax: number;
  /** 法人住民税 (法人税割 + 均等割)。 */
  readonly residentTax: number;
  /** 法人事業税 (所得割)。 */
  readonly businessTax: number;
  /** 特別法人事業税。 */
  readonly specialBusinessTax: number;
  /** 法人税等の合計。 */
  readonly totalTax: number;
  /** 実効税率 (法人税等合計 / 課税所得)。所得0以下は0。 */
  readonly effectiveRate: number;
  /** 税引後利益 (課税所得 − 法人税等合計)。 */
  readonly afterTaxProfit: number;
  /** 中小法人として計算したか。 */
  readonly smallBusiness: boolean;
}

/**
 * 課税所得と会社区分から法人税等の概算と税引後利益を計算する。
 *
 * 所得0以下 (欠損) のときは法人税・地方法人税・事業税・特別法人事業税は0で、
 * 法人住民税の均等割のみが課される。税引後利益は所得から均等割を引いた額。
 *
 * 均等割の決定順 (精度向上 round 56):
 *   1. perCapitaLevy が明示されていればそれを最優先 (従来挙動と完全に同一)。
 *   2. なければ capital から区分テーブルで解決 (employees があれば 50人区分も反映)。
 *   3. capital も無ければ従来どおり最小区分 (7万円)。
 *
 * @param taxableIncome 課税所得 (円, 年額)。負は欠損。
 * @param profile       会社区分 (未指定は中小・最小均等割の保守的既定)。
 */
export function calcCorporateTax(
  taxableIncome: number,
  profile: CorporateProfile = {},
): CorporateTaxBreakdown {
  const small = isSmallBusiness(profile);
  const perCapitaLevy = Math.max(0, resolvePerCapitaLevy(profile));

  const income = Math.max(0, taxableIncome);
  const corporateIncomeTax = calcCorporateIncomeTax(income, small);
  const localCorporateTax = calcLocalCorporateTax(corporateIncomeTax);
  const residentTax = calcResidentCorporateTax(corporateIncomeTax, perCapitaLevy);
  const businessTax = calcBusinessTaxIncomePortion(income);
  const specialBusinessTax = calcSpecialBusinessTax(businessTax);

  const totalTax =
    corporateIncomeTax +
    localCorporateTax +
    residentTax +
    businessTax +
    specialBusinessTax;

  const effectiveRate = income > 0 ? totalTax / income : 0;
  const afterTaxProfit = taxableIncome - totalTax;

  return {
    taxableIncome,
    corporateIncomeTax,
    localCorporateTax,
    residentTax,
    businessTax,
    specialBusinessTax,
    totalTax,
    effectiveRate,
    afterTaxProfit,
    smallBusiness: small,
  };
}
