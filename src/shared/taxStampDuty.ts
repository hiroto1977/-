/**
 * 印紙税額の概算算定 (純粋ロジック・IO なし)。
 *
 * **重要 — これは概算であり税務助言ではありません。** 実際の申告・課税文書の
 * 判定 (どの号の文書に当たるか・記載金額の認定・軽減措置の適否) は、必ず
 * 税理士または所轄の税務署に確認してください。本モジュールは日本の印紙税額
 * 一覧表 (令和ベース) の **本則税額** を階段表ルックアップで再現するだけの
 * 教育的シミュレーションであり、軽減措置 (不動産譲渡契約書・建設工事請負契約書
 * の租税特別措置法による軽減) は **本 PR では扱いません (本則のみ実装)**。
 *
 * 対応文書 (印紙税額一覧表の号):
 *   - 第1号文書  realEstateTransfer = 不動産の譲渡等に関する契約書
 *   - 第2号文書  construction       = 請負に関する契約書 (建設工事等)
 *   - 第7号文書  continuousBasicContract = 継続的取引の基本となる契約書
 *                (記載金額にかかわらず一律 4,000 円)
 *   - 第17号文書 receipt            = 売上代金に係る金銭の受取書 (領収書)
 *
 * ネットワーク / ファイル / Date.now / 乱数は一切使わない純粋関数のみ。
 */

/**
 * 印紙税の対象文書種別 (ホワイトリスト)。
 * - `realEstateTransfer` … 第1号文書 (不動産の譲渡等に関する契約書)
 * - `construction` … 第2号文書 (請負に関する契約書)
 * - `receipt` … 第17号文書 (売上代金に係る金銭の受取書 = 領収書)
 * - `continuousBasicContract` … 第7号文書 (継続的取引の基本となる契約書、一律 4,000 円)
 */
export type DocumentType =
  | 'realEstateTransfer'
  | 'construction'
  | 'receipt'
  | 'continuousBasicContract';

/** ホワイトリスト判定に用いる文書種別の集合。 */
const DOCUMENT_TYPES: readonly DocumentType[] = [
  'realEstateTransfer',
  'construction',
  'receipt',
  'continuousBasicContract',
];

/** 第7号文書 (継続的取引の基本となる契約書) の一律印紙税額 (円)。 */
export const CONTINUOUS_BASIC_CONTRACT_DUTY = 4_000;

/** 記載金額のない第1号・第2号・第17号文書に課される印紙税額 (円)。 */
export const NO_AMOUNT_DUTY = 200;

/**
 * 階段表の 1 区間。
 * `upTo` 以下 (=「以下」側) の記載金額にこの `duty` を適用する。
 * 区間は `upTo` 昇順で並べ、最後に `upTo: Infinity` (上限なし=「超」側) を置く。
 */
export interface StampBracket {
  /** この金額「以下」に適用 (Infinity = 上限なし)。 */
  readonly upTo: number;
  /** 印紙税額 (円)。 */
  readonly duty: number;
}

/**
 * 第1号文書 (不動産譲渡等) / 第2号文書 (請負) の本則印紙税額階段表。
 * 記載金額 (円) → 税額 (円)。1 万円未満は非課税 (= 0)。記載金額のないものは
 * 別途 200 円 (`NO_AMOUNT_DUTY`、本体で処理)。
 *
 * 法定の固定値テーブルのため block-level で Stryker を抑制する (根拠: 値は
 * 法令で固定。ルックアップの境界・振る舞いは `stampDutyAmount` とテストで全面検証)。
 */
// Stryker disable all
export const DOC1_DOC2_BRACKETS: readonly StampBracket[] = [
  { upTo: 9_999, duty: 0 }, // 1万円未満 = 非課税
  { upTo: 100_000, duty: 200 }, // 10万円以下
  { upTo: 500_000, duty: 400 }, // 50万円以下
  { upTo: 1_000_000, duty: 1_000 }, // 100万円以下
  { upTo: 5_000_000, duty: 2_000 }, // 500万円以下
  { upTo: 10_000_000, duty: 10_000 }, // 1,000万円以下
  { upTo: 50_000_000, duty: 20_000 }, // 5,000万円以下
  { upTo: 100_000_000, duty: 60_000 }, // 1億円以下
  { upTo: 500_000_000, duty: 100_000 }, // 5億円以下
  { upTo: 1_000_000_000, duty: 200_000 }, // 10億円以下
  { upTo: 5_000_000_000, duty: 400_000 }, // 50億円以下
  { upTo: Infinity, duty: 600_000 }, // 50億円超
];
// Stryker restore all

/**
 * 第17号文書 (売上代金に係る金銭の受取書 = 領収書) の本則印紙税額階段表。
 * 5 万円未満は非課税 (= 0)。記載金額のないものは別途 200 円
 * (`NO_AMOUNT_DUTY`、本体で処理)。営業に関しないものは非課税
 * (`isBusinessRelated: false`、本体で処理)。
 *
 * 法定の固定値テーブルのため block-level で Stryker を抑制する。
 */
// Stryker disable all
export const RECEIPT_BRACKETS: readonly StampBracket[] = [
  { upTo: 49_999, duty: 0 }, // 5万円未満 = 非課税
  { upTo: 1_000_000, duty: 200 }, // 100万円以下
  { upTo: 2_000_000, duty: 400 }, // 200万円以下
  { upTo: 3_000_000, duty: 600 }, // 300万円以下
  { upTo: 5_000_000, duty: 1_000 }, // 500万円以下
  { upTo: 10_000_000, duty: 2_000 }, // 1,000万円以下
  { upTo: 20_000_000, duty: 4_000 }, // 2,000万円以下
  { upTo: 30_000_000, duty: 6_000 }, // 3,000万円以下
  { upTo: 50_000_000, duty: 10_000 }, // 5,000万円以下
  { upTo: 100_000_000, duty: 20_000 }, // 1億円以下
  { upTo: 200_000_000, duty: 40_000 }, // 2億円以下
  { upTo: 300_000_000, duty: 60_000 }, // 3億円以下
  { upTo: 500_000_000, duty: 100_000 }, // 5億円以下
  { upTo: 1_000_000_000, duty: 150_000 }, // 10億円以下
  { upTo: Infinity, duty: 200_000 }, // 10億円超
];
// Stryker restore all

/**
 * 階段表ルックアップ。`amount` を含む最初の「`amount <= upTo`」区間の税額を返す。
 *
 * 境界は「以下」側に厳密: 区間上限値ちょうどはその区間に入り (= `<=`)、
 * +1 円で次の区間へ移る。テーブル末尾は `upTo: Infinity` のため必ずヒットする。
 *
 * @param brackets 昇順に並んだ階段表
 * @param amount 非負の記載金額 (円)
 */
function lookupDuty(brackets: readonly StampBracket[], amount: number): number {
  const bracket = brackets.find((b) => amount <= b.upTo);
  // 末尾の Infinity 区間が必ずマッチするため bracket は常に定義される。
  return bracket!.duty;
}

/** 記載金額が `undefined` (= 記載金額のない文書) か。 */
function hasNoAmount(contractAmount: number | undefined): contractAmount is undefined {
  return contractAmount === undefined;
}

/** 記載金額の入力検証 (負値・非有限は throw)。記載金額なし (undefined) は許容。 */
function validateAmount(contractAmount: number | undefined): void {
  if (contractAmount === undefined) return;
  if (!Number.isFinite(contractAmount)) {
    throw new Error(`contractAmount must be a finite number: ${contractAmount}`);
  }
  if (contractAmount < 0) {
    throw new Error(`contractAmount must be >= 0: ${contractAmount}`);
  }
}

/** 文書種別の入力検証 (ホワイトリスト外は throw)。 */
function validateDocumentType(documentType: DocumentType): void {
  if (!DOCUMENT_TYPES.includes(documentType)) {
    throw new Error(`unknown documentType: ${String(documentType)}`);
  }
}

/** `stampDutyAmount` / `isStampExempt` の入力。 */
export interface StampDutyInput {
  /** 文書種別 (ホワイトリスト)。 */
  readonly documentType: DocumentType;
  /**
   * 記載金額 (円)。`undefined` は「記載金額のない文書」を表す
   * (第1号・第2号・第17号は 200 円、第7号は一律 4,000 円)。
   */
  readonly contractAmount?: number;
  /**
   * 第17号文書 (領収書) が営業に関するものか。既定 `true`。
   * `false` (営業に関しないもの) の領収書は非課税 (0 円)。
   * 第17号以外では無視される。
   */
  readonly isBusinessRelated?: boolean;
}

/**
 * 文書種別と記載金額から印紙税額 (円) を概算する。
 *
 * **概算であり税務助言ではない。実際の申告・課税文書の判定は税理士/税務署に
 * 確認すること。** 本則税額のみ (軽減措置は非対応)。
 *
 * - 第1号 (realEstateTransfer) / 第2号 (construction): 記載金額の階段表
 *   (1万円未満=非課税 0、記載金額なし=200 円)。
 * - 第17号 (receipt): 領収書の階段表 (5万円未満=非課税 0、記載金額なし=200 円)。
 *   `isBusinessRelated: false` (営業に関しないもの) は記載金額にかかわらず 0 円。
 * - 第7号 (continuousBasicContract): 記載金額によらず一律 4,000 円。
 *
 * @throws {Error} contractAmount が負値または非有限の場合。
 * @throws {Error} documentType がホワイトリスト外の場合。
 */
export function stampDutyAmount(input: StampDutyInput): number {
  const { documentType, contractAmount, isBusinessRelated = true } = input;
  validateDocumentType(documentType);
  validateAmount(contractAmount);

  // 第7号: 記載金額・記載金額の有無にかかわらず一律 4,000 円。
  if (documentType === 'continuousBasicContract') {
    return CONTINUOUS_BASIC_CONTRACT_DUTY;
  }

  // 第17号 (領収書)。営業に関しないものは非課税。
  if (documentType === 'receipt') {
    if (!isBusinessRelated) return 0;
    if (hasNoAmount(contractAmount)) return NO_AMOUNT_DUTY;
    return lookupDuty(RECEIPT_BRACKETS, contractAmount);
  }

  // 第1号・第2号。記載金額のないものは 200 円。
  if (hasNoAmount(contractAmount)) return NO_AMOUNT_DUTY;
  return lookupDuty(DOC1_DOC2_BRACKETS, contractAmount);
}

/**
 * 当該文書が非課税 (印紙税 0 円) かどうかを純粋判定する。
 *
 * **概算であり税務助言ではない。実際の申告・課税文書の判定は税理士/税務署に
 * 確認すること。**
 *
 * 非課税となるのは:
 * - 第1号・第2号で記載金額が 1 万円未満。
 * - 第17号 (領収書) で記載金額が 5 万円未満、または営業に関しないもの
 *   (`isBusinessRelated: false`)。
 *
 * 第7号 (一律 4,000 円)・記載金額のない第1号/第2号/第17号 (200 円) は
 * 非課税ではない。
 *
 * @throws {Error} contractAmount が負値または非有限の場合。
 * @throws {Error} documentType がホワイトリスト外の場合。
 */
export function isStampExempt(input: StampDutyInput): boolean {
  return stampDutyAmount(input) === 0;
}
