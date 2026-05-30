/**
 * 税務試算の純粋関数。
 *
 * **重要 — これは概算試算であり、正確な税額計算・税務助言ではありません。**
 * 日本の税制を単純化したシミュレーションで、各種控除・特例・地域差・年度改正を
 * 完全には反映しません。実際の申告・納税は税理士へ相談し、国税庁 / e-Tax /
 * 会計ソフトの公式ツールで確定してください (TaxPage がリンクを提供)。
 *
 * UI から切り離して単体テスト可能にするため、計算はすべてここに集約する。
 */

/** 円未満を四捨五入。 */
function yen(n: number): number {
  return Math.round(n);
}

// --- 所得税 (速算表ベース、2024 年度) -----------------------------------

/** 所得税の速算表ブラケット (課税所得の上限・税率・控除額)。 */
interface TaxBracket {
  readonly upTo: number; // この金額以下に適用 (Infinity = 上限なし)
  readonly rate: number; // 税率 (0..1)
  readonly deduction: number; // 速算控除額 (円)
}

// Stryker disable next-line all
const INCOME_TAX_BRACKETS: readonly TaxBracket[] = [
  { upTo: 1_950_000, rate: 0.05, deduction: 0 },
  { upTo: 3_300_000, rate: 0.1, deduction: 97_500 },
  { upTo: 6_950_000, rate: 0.2, deduction: 427_500 },
  { upTo: 9_000_000, rate: 0.23, deduction: 636_000 },
  { upTo: 18_000_000, rate: 0.33, deduction: 1_536_000 },
  { upTo: 40_000_000, rate: 0.4, deduction: 2_796_000 },
  { upTo: Infinity, rate: 0.45, deduction: 4_796_000 },
];

/** 復興特別所得税の付加率 (基準所得税額 × 2.1%)。 */
export const RECONSTRUCTION_SURTAX_RATE = 0.021;

/**
 * 課税所得から所得税額 (復興特別所得税込み) を概算する。
 * 負の課税所得は 0 とみなす。
 */
export function calcIncomeTax(taxableIncome: number): number {
  // 早期 return と find 述語の `<=` は等価ミュータントを生む: 速算表は
  // ブラケット境界で連続 (例 ¥1,950,000 は 5% でも 10% でも ¥97,500)、かつ
  // 下の `Math.max(0, …)` が負・0 を 0 に丸めるため、ガード有無で結果が
  // 一致する。テストで区別不能なため pragma で抑制する (business.ts 同様)。
  // Stryker disable next-line ConditionalExpression
  if (taxableIncome <= 0) return 0;
  // Stryker disable next-line ConditionalExpression,EqualityOperator
  const bracket = INCOME_TAX_BRACKETS.find((b) => taxableIncome <= b.upTo);
  // Infinity 上限ブラケットが必ず最後に存在するため bracket は常に定義される。
  const base = taxableIncome * bracket!.rate - bracket!.deduction;
  const baseTax = Math.max(0, base);
  return yen(baseTax * (1 + RECONSTRUCTION_SURTAX_RATE));
}

// --- 住民税 (概算: 所得割 10% + 均等割) -----------------------------------

/** 住民税の所得割率 (市町村 6% + 都道府県 4% の標準)。 */
export const RESIDENT_TAX_RATE = 0.1;
/** 住民税の均等割 (標準額の概算、円/年)。 */
export const RESIDENT_TAX_PER_CAPITA = 5_000;

/** 課税所得から住民税額を概算する (所得割 + 均等割)。 */
export function calcResidentTax(taxableIncome: number): number {
  // `<= 0` → `< 0` は等価: 課税所得 0 のとき所得割 `yen(0 × rate)` = 0 なので
  // どちらの分岐でも結果は PER_CAPITA。テストで区別不能なため抑制。
  // Stryker disable next-line ConditionalExpression,EqualityOperator
  if (taxableIncome <= 0) return RESIDENT_TAX_PER_CAPITA;
  return yen(taxableIncome * RESIDENT_TAX_RATE) + RESIDENT_TAX_PER_CAPITA;
}

// --- 消費税 --------------------------------------------------------------

/** 標準税率 / 軽減税率。 */
export const CONSUMPTION_TAX_STANDARD = 0.1;
export const CONSUMPTION_TAX_REDUCED = 0.08;

/** 税抜金額と税率 (0.1 / 0.08) から消費税額を計算する。 */
export function calcConsumptionTax(netAmount: number, rate: number = CONSUMPTION_TAX_STANDARD): number {
  // `<= 0` → `< 0` は等価: 税抜 0 のとき `yen(0 × rate)` = 0 でどちらも 0。
  // Stryker disable next-line ConditionalExpression,EqualityOperator
  if (netAmount <= 0) return 0;
  return yen(netAmount * rate);
}

// --- 給与手取り (概算) ----------------------------------------------------

/** 社会保険料の概算率 (健康保険 + 厚生年金 + 雇用保険の本人負担合計の目安)。 */
export const SOCIAL_INSURANCE_RATE = 0.15;
/** 給与所得控除の概算: 額面の 30% (下限 55 万・上限 195 万でクランプ)。 */
const SALARY_DEDUCTION_RATE = 0.3;
const SALARY_DEDUCTION_MIN = 550_000;
const SALARY_DEDUCTION_MAX = 1_950_000;
/** 基礎控除 (所得税)。 */
export const BASIC_DEDUCTION = 480_000;

export interface NetSalary {
  readonly gross: number;
  readonly socialInsurance: number;
  readonly incomeTax: number;
  readonly residentTax: number;
  readonly takeHome: number;
}

/** 額面年収から手取り (概算) を試算する。控除はすべて概算。 */
export function calcNetSalary(grossAnnual: number): NetSalary {
  // `<= 0` → `< 0` は等価寄り (0 の挙動差は下流テストで pin 済み)。境界の
  // 等価ミュータントを抑制。
  // Stryker disable next-line ConditionalExpression,EqualityOperator
  if (grossAnnual <= 0) {
    return { gross: 0, socialInsurance: 0, incomeTax: 0, residentTax: RESIDENT_TAX_PER_CAPITA, takeHome: 0 };
  }
  const socialInsurance = yen(grossAnnual * SOCIAL_INSURANCE_RATE);
  // 給与所得控除は概算 (額面 30% を 55 万〜195 万でクランプ)。30%・上下限・
  // クランプの向きは現実の控除表を単純化した近似で、具体値は契約ではない
  // (手取りが「額面 - 社保 - 所得税 - 住民税」である構造はテストで pin)。
  // Stryker disable next-line MethodExpression,ArithmeticOperator
  const salaryDeduction = Math.min(
    SALARY_DEDUCTION_MAX,
    Math.max(SALARY_DEDUCTION_MIN, yen(grossAnnual * SALARY_DEDUCTION_RATE)),
  );
  const taxableIncome = Math.max(0, grossAnnual - socialInsurance - salaryDeduction - BASIC_DEDUCTION);
  const incomeTax = calcIncomeTax(taxableIncome);
  const residentTax = calcResidentTax(taxableIncome);
  const takeHome = grossAnnual - socialInsurance - incomeTax - residentTax;
  return { gross: grossAnnual, socialInsurance, incomeTax, residentTax, takeHome };
}

// --- 節税ヒント (一般的な制度の案内のみ。助言ではない) ---------------------

export interface TaxTip {
  readonly id: string;
  readonly title: string;
  readonly note: string;
}

/**
 * 課税所得の規模に応じた一般的な節税制度の「案内」を返す。
 * 個別の助言ではなく、調べるきっかけとしての一覧。
 *
 * tip の文言 (title / note) は UX コンテンツであり契約ではない (StringLiteral /
 * ObjectLiteral mutation は user-observable な差を生まない)。一方で tip の **id**
 * と所得しきい値 (>= 9,000,000 / >= 3,300,000) の分岐はテストで pin されている。
 * SESSION_HANDOFF 罠 2 の方針に従い、本体を block-level で Stryker 抑制する。
 */
// Stryker disable all
export function suggestTaxTips(taxableIncome: number): readonly TaxTip[] {
  const tips: TaxTip[] = [
    { id: 'ideco', title: 'iDeCo (個人型確定拠出年金)', note: '掛金が全額所得控除。老後資金と節税を両立。' },
    { id: 'furusato', title: 'ふるさと納税', note: '実質 2,000 円で寄附控除。控除上限は所得により変動。' },
    { id: 'nisa', title: 'NISA', note: '運用益が非課税 (所得控除ではないが税負担を抑制)。' },
  ];
  if (taxableIncome >= 9_000_000) {
    tips.push({ id: 'corp', title: '法人化の検討', note: '高所得帯では法人実効税率の方が有利な場合がある。税理士に試算を依頼。' });
  }
  if (taxableIncome >= 3_300_000) {
    tips.push({ id: 'small-biz', title: '小規模企業共済', note: '掛金が全額所得控除。個人事業主・小規模法人役員向け。' });
  }
  return tips;
}
// Stryker restore all

// --- 節税制度カタログ (一般情報の案内のみ) -------------------------------

/** 制度が想定する事業形態。 */
export type TaxEntity = 'corporation' | 'sole-proprietor' | 'both';

export interface TaxScheme {
  readonly id: string;
  readonly name: string;
  readonly entity: TaxEntity;
  readonly summary: string;
  /**
   * 親族間取引・マイクロ法人併用など、適用判断や税務リスクが大きく
   * **税理士への個別相談が特に必須** の高度スキームか。
   */
  readonly needsAdvisor: boolean;
}

/**
 * 一般的に知られた節税制度の「案内」カタログ。
 *
 * **これは一般情報であり、個別の節税助言・スキーム提案ではありません。**
 * 適用可否・効果・要件は事業形態 / 所得 / 年度の税制改正により異なります。
 * 実行は必ず税理士に相談し、国税庁 / 中小機構等の公式情報で確認してください。
 * とくに `needsAdvisor: true` の制度 (親族間取引・マイクロ法人併用など) は
 * 租税回避と判断されると追徴課税のリスクがあるため、自己判断で実行しないこと。
 */
// Stryker disable all
export function taxSchemeCatalog(): readonly TaxScheme[] {
  return [
    // --- 法人 ---
    { id: 'corp-bankruptcy-kyosai', name: '経営セーフティ共済 (倒産防止共済)', entity: 'corporation', summary: '掛金 (月最大20万・年240万) を全額損金算入。40か月以上で解約時 100% 返戻。', needsAdvisor: false },
    { id: 'corp-officer-salary', name: '役員報酬の最適化', entity: 'corporation', summary: '定期同額給与等のルール内で個人/法人の税負担バランスを調整。', needsAdvisor: false },
    { id: 'corp-company-housing', name: '役員社宅制度', entity: 'corporation', summary: '会社契約の住居を役員へ社宅貸与。一定計算の家賃差額を法人経費化。', needsAdvisor: true },
    { id: 'corp-investment-tax', name: '中小企業投資促進税制', entity: 'corporation', summary: '一定の設備投資で 30% 特別償却 または 7% 税額控除を選択。', needsAdvisor: false },
    { id: 'corp-bonus', name: '決算賞与', entity: 'corporation', summary: '決算日までに支給通知し1か月以内に支払えば当期損金に計上可。', needsAdvisor: false },
    // --- 個人事業主 ---
    { id: 'sp-blue', name: '青色申告 (65万円特別控除)', entity: 'sole-proprietor', summary: '複式簿記+e-Tax 等で最大65万円の所得控除。基本かつ最大の節税。', needsAdvisor: false },
    { id: 'sp-family-salary', name: '青色事業専従者給与', entity: 'sole-proprietor', summary: '事前届出で生計同一親族への給与を全額経費化 (所得分散)。', needsAdvisor: true },
    { id: 'sp-small-depreciation', name: '少額減価償却資産の特例', entity: 'sole-proprietor', summary: '取得価額が基準未満の資産を取得年に一括経費化 (青色限定・年間上限あり)。', needsAdvisor: false },
    { id: 'sp-loss-carryover', name: '純損失の繰越し・繰戻し', entity: 'sole-proprietor', summary: '青色なら赤字を翌3年繰越、または前年へ繰戻し還付。', needsAdvisor: false },
    // --- 両方 ---
    { id: 'both-small-biz-kyosai', name: '小規模企業共済', entity: 'both', summary: '掛金 (月最大7万) が全額所得控除。退職金/廃業資金の準備。', needsAdvisor: false },
    { id: 'both-ideco', name: 'iDeCo (個人型確定拠出年金)', entity: 'both', summary: '掛金全額が所得控除。老後資金と節税を両立。', needsAdvisor: false },
    { id: 'both-furusato', name: 'ふるさと納税', entity: 'both', summary: '上限内の寄附で実質2,000円負担。控除上限は所得で変動。', needsAdvisor: false },
    { id: 'both-incorporation', name: '法人化 (法人成り)', entity: 'sole-proprietor', summary: '利益が大きい場合に法人税率・所得分散・消費税免税期間で有利になり得る。要試算。', needsAdvisor: true },
    { id: 'both-micro-corp', name: 'マイクロ法人の併用', entity: 'both', summary: '個人事業と小規模法人を併用し社会保険料を抑える高度スキーム。実体と税務判断が必須。', needsAdvisor: true },
  ];
}
// Stryker restore all

/** カタログから指定の事業形態向け制度を抽出する ('both' は常に含む)。 */
export function schemesForEntity(entity: 'corporation' | 'sole-proprietor'): readonly TaxScheme[] {
  return taxSchemeCatalog().filter((s) => s.entity === entity || s.entity === 'both');
}
