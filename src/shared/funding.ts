/**
 * 資金調達レーダー (Funding Radar) の純粋関数コア。
 *
 * 補助金 / 助成金 / 融資 / 日本政策金融公庫 / 給付金 / クラウドファンディング
 * といった資金調達の実績・予定を集計し、4 種のチャート (レーダー / 折れ線 /
 * 円 / 棒) 用のデータを生成する。会計ソフト連携 (MoneyForward 等) からの
 * 月次キャッシュフローと、任意の株式投資 (stocks) のポートフォリオ評価額も
 * 取り込んで「資金全体像」を可視化する。
 *
 * **重要 — 本機能は概算の可視化であり、財務助言・採択可否の保証ではありません。**
 * 補助金等の採択・融資審査は各実施機関の判断によります。金額・要件・締切は
 * 必ず公式情報 (各省庁 / 日本政策金融公庫 / J-Net21 等) で確認してください。
 *
 * UI から切り離して単体テスト可能にするため、集計はすべてここに集約する。
 */

// --- 資金調達の種別 ----------------------------------------------------

/** 資金調達手段の種別。レーダーチャートの 6 軸に対応する。 */
export type FundingKind =
  | 'subsidy' // 補助金 (経産省・中小企業庁等。原則後払い・返済不要)
  | 'grant' // 助成金 (厚労省等。要件を満たせば受給・返済不要)
  | 'loan' // 融資 (民間金融機関等)
  | 'jfc' // 日本政策金融公庫
  | 'benefit' // 給付金 (持続化給付金等の公的給付)
  | 'crowdfunding'; // クラウドファンディング

/** レーダーチャートの軸ラベル (種別と同順)。 */
export const FUNDING_KINDS: readonly FundingKind[] = [
  'subsidy',
  'grant',
  'loan',
  'jfc',
  'benefit',
  'crowdfunding',
];

/**
 * その資金が課税対象 (益金 / 事業収入に算入) かを返す。
 *
 * - 補助金・助成金・給付金: 原則「益金 (事業所得の収入)」として**課税対象**。
 *   ※ 国庫補助金等には圧縮記帳の特例 (課税繰延) があるが、ここでは概算のため
 *   特例なしの保守的見積りとする。
 * - 購入型クラウドファンディング: 実質は前受 (売上) なので**課税対象**。
 * - 融資・日本政策金融公庫: 借入金 (負債) であり**非課税**。
 *
 * 本判定は概算であり、実際の課税関係 (圧縮記帳・寄附型/株式型CFの別・消費税)
 * は税理士・国税庁の公式情報で確認すること。
 */
export function isTaxableFunding(kind: FundingKind): boolean {
  switch (kind) {
    case 'subsidy':
    case 'grant':
    case 'benefit':
    case 'crowdfunding':
      return true;
    case 'loan':
    case 'jfc':
      return false;
    default: {
      const _exhaustive: never = kind;
      return _exhaustive;
    }
  }
}

/** 種別の日本語ラベル。 */
export function fundingKindLabel(kind: FundingKind): string {
  switch (kind) {
    case 'subsidy':
      return '補助金';
    case 'grant':
      return '助成金';
    case 'loan':
      return '融資';
    case 'jfc':
      return '日本政策金融公庫';
    case 'benefit':
      return '給付金';
    case 'crowdfunding':
      return 'クラウドファンディング';
    default: {
      // 網羅性チェック (到達不能)。
      const _exhaustive: never = kind;
      return _exhaustive;
    }
  }
}

/** 資金調達案件のステータス。 */
export type FundingStatus =
  | 'received' // 入金済み
  | 'approved' // 採択・承認済み (未入金)
  | 'applied' // 申請中
  | 'planned'; // 予定・検討中

// --- 資金調達案件 ------------------------------------------------------

/** 1 件の資金調達案件。金額は円 (整数)。 */
export interface FundingItem {
  readonly id: string;
  readonly kind: FundingKind;
  readonly name: string;
  /** 申請・予定額 (円)。 */
  readonly amount: number;
  readonly status: FundingStatus;
  /** 入金予定 / 実績の年月 (YYYY-MM)。集計の時系列キーに使う。 */
  readonly month: string;
  /** 返済が必要か (融資・公庫は true、補助金・助成金・給付金・CFは原則 false)。 */
  readonly repayable: boolean;
  /**
   * 国庫補助金等で固定資産を取得し**圧縮記帳の特例**を適用するか (任意)。
   * 適用すると、その年度は補助金収入 (益金) と同額の圧縮損が相殺され、
   * 当年度は実質非課税となる (課税は減価償却を通じて将来へ繰延)。
   * 課税対象 (subsidy/grant 等) かつ本フラグが true のとき、当年度の
   * 課税見込みから除外する。融資・公庫など非課税資金では無視される。
   */
  readonly compressedEntry?: boolean;
}

// --- 集計結果 ----------------------------------------------------------

/** 種別ごとの集計 (円グラフ・レーダー用)。 */
export interface FundingByKind {
  readonly kind: FundingKind;
  readonly label: string;
  /** 確定額 (received + approved)。 */
  readonly secured: number;
  /** 申請中・予定を含む合計。 */
  readonly pipeline: number;
  readonly count: number;
}

/** 月次の資金フロー (折れ線・棒グラフ用)。 */
export interface FundingMonthly {
  readonly month: string;
  /** その月に入金が見込まれる資金調達額 (確定ベース・税引前)。 */
  readonly funding: number;
  /**
   * その月の資金調達額の税引後の手残り目安。課税対象資金 (補助金・助成金・
   * 給付金・購入型CF) には実効税率を課し、非課税 (融資・公庫) と圧縮記帳
   * 適用分はそのまま。`funding − 当月課税対象額 × 実効税率`。
   */
  readonly fundingAfterTax: number;
  /** 会計ソフト連携の営業キャッシュフロー (任意。未連携なら 0)。 */
  readonly operatingCashflow: number;
  /** 株式ポートフォリオ評価額 (任意。未連携なら 0)。 */
  readonly portfolioValue: number;
}

/** 全体サマリー。 */
export interface FundingSummary {
  /** 返済不要資金 (補助金・助成金・給付金・CF) の確定合計。 */
  readonly nonRepayableSecured: number;
  /** 返済必要資金 (融資・公庫) の確定合計。 */
  readonly repayableSecured: number;
  /** 確定総額。 */
  readonly totalSecured: number;
  /** パイプライン総額 (申請中・予定込み)。 */
  readonly totalPipeline: number;
  /**
   * 当年度の課税対象の確定額 (補助金・助成金・給付金・CF)。
   * 圧縮記帳を適用する案件 (`compressedEntry`) は当年度課税が繰延されるため
   * **除外**する。
   */
  readonly taxableSecured: number;
  /**
   * 圧縮記帳により当年度課税を繰り延べた確定額。将来 (減価償却を通じて)
   * 課税される見込みの金額の目安。
   */
  readonly deferredSecured: number;
  /**
   * 概算の手残り額 (税引後)。課税対象資金には実効税率を課し、非課税資金
   * (融資・公庫) と圧縮記帳適用分はそのまま。
   * `totalSecured − taxableSecured × 実効税率`。
   */
  readonly afterTaxSecured: number;
  /** 案件数。 */
  readonly count: number;
}

/** 0 円ガード付きの加算 (負値は 0 とみなす)。 */
function nonNeg(n: number): number {
  return n > 0 ? n : 0;
}

/** 案件が確定 (入金済み or 採択済み) か。 */
function isSecured(status: FundingStatus): boolean {
  return status === 'received' || status === 'approved';
}

/**
 * 種別ごとに集計する。円グラフ・レーダーチャートの両方で使う。
 * 返り値は `FUNDING_KINDS` の順序に固定 (軸の安定化)。
 */
export function aggregateByKind(items: readonly FundingItem[]): FundingByKind[] {
  return FUNDING_KINDS.map((kind) => {
    const ofKind = items.filter((it) => it.kind === kind);
    const secured = ofKind
      .filter((it) => isSecured(it.status))
      .reduce((s, it) => s + nonNeg(it.amount), 0);
    const pipeline = ofKind.reduce((s, it) => s + nonNeg(it.amount), 0);
    return {
      kind,
      label: fundingKindLabel(kind),
      secured,
      pipeline,
      count: ofKind.length,
    };
  });
}

/**
 * レーダーチャートのスコア (0..max) を返す。各軸 = 種別の確定額を、
 * 全種別中の最大確定額で正規化した相対値 (0..max)。最大が 0 のときは全 0。
 */
export function radarScores(
  byKind: readonly FundingByKind[],
  max = 5,
): number[] {
  const peak = byKind.reduce((m, b) => Math.max(m, b.secured), 0);
  if (peak <= 0) return byKind.map(() => 0);
  return byKind.map((b) => Math.round((b.secured / peak) * max * 100) / 100);
}

/** 補助金等の課税を見込んだ概算の実効税率の既定値 (法人実効税率の目安 約30%)。 */
export const DEFAULT_EFFECTIVE_TAX_RATE = 0.3;

/** 実効税率を [0,1] にクランプする (負値は 0、1 超は 1)。 */
function clampRate(rate: number): number {
  return rate > 0 ? Math.min(1, rate) : 0;
}

/**
 * 月次サマリーを生成する (折れ線・棒グラフ用)。
 *
 * 資金調達は確定案件の月別入金見込み (税引前) と税引後手残り、
 * operatingCashflow は会計ソフト連携の月次営業 CF、portfolioValue は株式連携の
 * 評価額。後者 2 つは任意連携なので引数の Map が無ければ 0 とする。
 * 返り値は月の昇順。
 *
 * @param options.effectiveTaxRate 税引後手残りの計算に使う実効税率 (0..1)。
 *   既定 `DEFAULT_EFFECTIVE_TAX_RATE`。
 */
export function monthlyFlow(
  items: readonly FundingItem[],
  options: {
    readonly accountingCashflow?: ReadonlyMap<string, number>;
    readonly portfolioByMonth?: ReadonlyMap<string, number>;
    readonly effectiveTaxRate?: number;
  } = {},
): FundingMonthly[] {
  const rate = clampRate(options.effectiveTaxRate ?? DEFAULT_EFFECTIVE_TAX_RATE);
  const months = new Set<string>();
  for (const it of items) months.add(it.month);
  for (const m of options.accountingCashflow?.keys() ?? []) months.add(m);
  for (const m of options.portfolioByMonth?.keys() ?? []) months.add(m);

  return [...months]
    .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))
    .map((month) => {
      const securedOfMonth = items.filter((it) => it.month === month && isSecured(it.status));
      const funding = securedOfMonth.reduce((s, it) => s + nonNeg(it.amount), 0);
      // 当月の課税対象額 (圧縮記帳適用分は当年度課税が繰延されるため除外)。
      const taxable = securedOfMonth
        .filter((it) => isTaxableFunding(it.kind) && !it.compressedEntry)
        .reduce((s, it) => s + nonNeg(it.amount), 0);
      return {
        month,
        funding,
        fundingAfterTax: Math.round(funding - taxable * rate),
        operatingCashflow: options.accountingCashflow?.get(month) ?? 0,
        portfolioValue: options.portfolioByMonth?.get(month) ?? 0,
      };
    });
}

/**
 * 全体サマリーを計算する。
 *
 * @param items 資金調達案件
 * @param effectiveTaxRate 課税対象資金に課す実効税率 (0..1)。既定 0.3。
 *   補助金・助成金・給付金・購入型CF は益金算入で課税対象、融資・公庫は
 *   借入金で非課税。圧縮記帳 (`compressedEntry`) 適用分は当年度課税を繰延。
 *   手残り = 確定総額 − 当年度課税対象確定額 × 実効税率。
 */
export function summarize(
  items: readonly FundingItem[],
  effectiveTaxRate: number = DEFAULT_EFFECTIVE_TAX_RATE,
): FundingSummary {
  const rate = clampRate(effectiveTaxRate);
  let nonRepayableSecured = 0;
  let repayableSecured = 0;
  let totalPipeline = 0;
  let taxableSecured = 0;
  let deferredSecured = 0;
  for (const it of items) {
    const amt = nonNeg(it.amount);
    totalPipeline += amt;
    if (isSecured(it.status)) {
      if (it.repayable) repayableSecured += amt;
      else nonRepayableSecured += amt;
      if (isTaxableFunding(it.kind)) {
        // 圧縮記帳を適用する案件は当年度課税が繰延される。
        if (it.compressedEntry) deferredSecured += amt;
        else taxableSecured += amt;
      }
    }
  }
  const totalSecured = nonRepayableSecured + repayableSecured;
  return {
    nonRepayableSecured,
    repayableSecured,
    totalSecured,
    totalPipeline,
    taxableSecured,
    deferredSecured,
    afterTaxSecured: Math.round(totalSecured - taxableSecured * rate),
    count: items.length,
  };
}

// --- 棒グラフ用: 種別別の確定 vs パイプライン -------------------------

export interface FundingBar {
  readonly label: string;
  readonly secured: number;
  readonly pipeline: number;
}

/** 棒グラフ用データ (種別ごとの確定額とパイプライン額)。 */
export function barData(byKind: readonly FundingByKind[]): FundingBar[] {
  return byKind.map((b) => ({
    label: b.label,
    secured: b.secured,
    pipeline: b.pipeline,
  }));
}
