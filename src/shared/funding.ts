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

/** 消費税の区分。 */
export type ConsumptionTaxTreatment =
  | 'taxable' // 課税売上 (対価性あり。購入型クラウドファンディング)
  | 'tax-exempt' // 不課税 (対価性なし。補助金・助成金・給付金)
  | 'non-taxable'; // 課税対象外 (融資・公庫の借入金)

/**
 * 資金の消費税の区分を返す。
 *
 * - 補助金・助成金・給付金: 対価性がなく**不課税** (消費税は課されない)。
 * - 購入型クラウドファンディング: リターン (商品・サービス) の対価なので
 *   **課税売上** (消費税の申告納付義務が生じうる)。
 * - 融資・公庫: 借入金で課税対象外。
 *
 * ※ 補助金は不課税だが、その資金で課税仕入れを行うと「特定収入に係る仕入税額
 * 控除の調整」が必要になる場合がある (概算では未反映)。寄附型/株式型CFは課税
 * 関係が異なるため、確定申告は税理士・国税庁で確認すること。
 */
export function consumptionTaxTreatment(kind: FundingKind): ConsumptionTaxTreatment {
  switch (kind) {
    case 'subsidy':
    case 'grant':
    case 'benefit':
      return 'tax-exempt';
    case 'crowdfunding':
      return 'taxable';
    case 'loan':
    case 'jfc':
      return 'non-taxable';
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
  /**
   * 融資・公庫の返済条件 (任意)。月次の純資金繰りに元利返済 (キャッシュ
   * アウト) を反映するために使う。返済不要の資金 (補助金等) では無視。
   */
  readonly repayment?: RepaymentTerms;
  /**
   * 採択・実行の確率 (0..1, 任意)。期待値シナリオ (`expectedScenario`) で
   * パイプライン案件を加重するために使う。未指定なら `defaultProbability`
   * (ステータスから推定) を用いる。確定 (received/approved) は実質 1.0。
   */
  readonly probability?: number;
}

/** 融資の返済条件。元利均等返済を前提とする。 */
export interface RepaymentTerms {
  /** 年利 (0..1)。例: 0.02 = 年2%。0 で無利息。 */
  readonly annualRate: number;
  /** 返済回数 (月数)。1 以上。元金均等返済の回数 (据置期間は含まない)。 */
  readonly months: number;
  /** 返済開始の年月 (YYYY-MM)。据置期間がある場合は入金月より後を指定。 */
  readonly startMonth: string;
  /**
   * 据置期間 (月数, 任意)。日本政策金融公庫等でよくある「据置期間中は
   * 利息のみ支払い、その後元金を `months` 回で元利均等返済」を表す。
   * 据置中は元金返済 0・利息のみのキャッシュアウトとなる。既定 0 (据置なし)。
   * 据置は `startMonth` から始まり、元金返済はその後に開始する。
   */
  readonly gracePeriodMonths?: number;
  /**
   * 返済方式 (任意)。既定 `'equal-payment'` (元利均等: 毎月返済額一定)。
   * `'equal-principal'` (元金均等: 毎月の元金返済額が一定で、利息が逓減する
   * ため返済額は前半ほど大きい)。日本政策金融公庫等で選択できる。
   */
  readonly method?: RepaymentMethod;
}

/** 返済方式。元利均等 (equal-payment) / 元金均等 (equal-principal)。 */
export type RepaymentMethod = 'equal-payment' | 'equal-principal';

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
  /** その月の融資・公庫の元利返済額 (キャッシュアウト。返済条件がなければ 0)。 */
  readonly repayment: number;
  /** その月の支払利息 (返済額の内訳。損金算入される)。 */
  readonly interest: number;
  /** その月の利息による節税効果 (支払利息 × 実効税率)。 */
  readonly interestTaxShield: number;
  /**
   * その月の純資金繰り (ネットキャッシュフロー)。
   * `税引後手残り + 営業CF − 返済額 + 利息の節税効果`。資金ショートの
   * 早期把握に使う。
   */
  readonly netCashflow: number;
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
  /** 消費税が不課税の確定額 (補助金・助成金・給付金)。 */
  readonly consumptionTaxExemptSecured: number;
  /** 消費税が課税売上の確定額 (購入型クラウドファンディング)。 */
  readonly consumptionTaxableSecured: number;
  /** 課税売上に対する消費税相当額の概算 (`課税売上 × 消費税率 / (1+税率)` の内税ベース)。 */
  readonly consumptionTaxEstimate: number;
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

/** 年月文字列 (YYYY-MM) に nMonths を足した年月を返す。 */
export function addMonths(month: string, n: number): string {
  const parts = month.split('-');
  const y = Number(parts[0]);
  const m = Number(parts[1]);
  // 0-indexed month算で繰り上げ。
  const total = y * 12 + (m - 1) + n;
  const ny = Math.floor(total / 12);
  const nm = (total % 12) + 1;
  return `${ny}-${String(nm).padStart(2, '0')}`;
}

/**
 * 元利均等返済の毎月返済額を返す (円)。
 *
 * 月利 i = annualRate/12 のとき、返済額 = P × i / (1 − (1+i)^-n)。
 * 無利息 (rate=0) は単純に P/n。元本・回数が非正なら 0。
 */
export function monthlyPayment(principal: number, annualRate: number, months: number): number {
  if (principal <= 0 || months <= 0) return 0;
  const i = annualRate / 12;
  if (i <= 0) return Math.round(principal / months);
  const factor = Math.pow(1 + i, -months);
  return Math.round((principal * i) / (1 - factor));
}

/** 元利均等返済の 1 回分 (元金・利息の内訳)。 */
export interface AmortizationEntry {
  readonly month: string;
  readonly payment: number;
  /** 元金充当分。 */
  readonly principal: number;
  /** 利息分 (損金算入され節税効果を生む)。 */
  readonly interest: number;
  /** その回返済後の残高。 */
  readonly remaining: number;
}

/**
 * 返済の償却スケジュール (各回の元金・利息内訳) を返す。
 *
 * 元利均等 (`equal-payment`): 各回の返済額が一定。利息 = 残高 × 月利、
 * 元金 = 返済額 − 利息。最終回は端数を残高に合わせて完済する。
 * 元金均等 (`equal-principal`): 各回の元金返済額が一定 (元本/回数)。利息は
 * 残高に応じ逓減するため返済額は前半ほど大きい。最終回で端数を調整。
 *
 * @param gracePeriodMonths 据置期間 (月数, 任意)。据置中は元金 0・利息のみの
 *   キャッシュアウトとなり、`startMonth` から据置期間が始まる。元金返済は
 *   据置終了後に `months` 回で行う。
 * @param method 返済方式 (既定 `'equal-payment'`)。
 */
export function amortizationSchedule(
  principal: number,
  annualRate: number,
  months: number,
  startMonth: string,
  gracePeriodMonths = 0,
  method: RepaymentMethod = 'equal-payment',
): AmortizationEntry[] {
  if (principal <= 0 || months <= 0) return [];
  const pay = monthlyPayment(principal, annualRate, months);
  const i = annualRate / 12 > 0 ? annualRate / 12 : 0;
  const grace = gracePeriodMonths > 0 ? Math.floor(gracePeriodMonths) : 0;
  // 元金均等の毎月元金 (最終回で端数調整)。
  const levelPrincipal = Math.round(principal / months);
  const out: AmortizationEntry[] = [];
  let remaining = principal;
  // 据置期間: 元金は減らず、利息のみ支払う。
  for (let g = 0; g < grace; g++) {
    const interest = Math.round(remaining * i);
    out.push({ month: addMonths(startMonth, g), payment: interest, principal: 0, interest, remaining });
  }
  // 元金返済期間: 据置終了後に完済する。
  for (let k = 0; k < months; k++) {
    const interest = Math.round(remaining * i);
    const isLast = k === months - 1;
    // 元金充当分: 方式で分岐。最終回は残高を完済しきる。
    let principalPart =
      isLast ? remaining
      : method === 'equal-principal' ? levelPrincipal
      : pay - interest;
    if (principalPart > remaining) principalPart = remaining;
    const payment = principalPart + interest;
    remaining = Math.max(0, remaining - principalPart);
    out.push({ month: addMonths(startMonth, grace + k), payment, principal: principalPart, interest, remaining });
  }
  return out;
}

/**
 * 融資案件の月別返済額 (キャッシュアウト) を Map<YYYY-MM, number> で返す。
 * 返済不要・返済条件なしの案件は対象外。確定 (received/approved) のみ計上。
 */
export function repaymentSchedule(items: readonly FundingItem[]): Map<string, number> {
  const out = new Map<string, number>();
  for (const it of items) {
    if (!it.repayable || !it.repayment) continue;
    if (!isSecured(it.status)) continue;
    const { annualRate, months, startMonth, gracePeriodMonths, method } = it.repayment;
    for (const e of amortizationSchedule(nonNeg(it.amount), annualRate, months, startMonth, gracePeriodMonths, method)) {
      out.set(e.month, (out.get(e.month) ?? 0) + e.payment);
    }
  }
  return out;
}

/**
 * 融資案件の月別の支払利息を Map<YYYY-MM, number> で返す。
 * 支払利息は損金算入されるため、月次の節税効果 (利息 × 実効税率) の算定に使う。
 */
export function interestSchedule(items: readonly FundingItem[]): Map<string, number> {
  const out = new Map<string, number>();
  for (const it of items) {
    if (!it.repayable || !it.repayment) continue;
    if (!isSecured(it.status)) continue;
    const { annualRate, months, startMonth, gracePeriodMonths, method } = it.repayment;
    for (const e of amortizationSchedule(nonNeg(it.amount), annualRate, months, startMonth, gracePeriodMonths, method)) {
      if (e.interest > 0) out.set(e.month, (out.get(e.month) ?? 0) + e.interest);
    }
  }
  return out;
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
  const repayments = repaymentSchedule(items);
  const interests = interestSchedule(items);
  const months = new Set<string>();
  for (const it of items) months.add(it.month);
  for (const m of options.accountingCashflow?.keys() ?? []) months.add(m);
  for (const m of options.portfolioByMonth?.keys() ?? []) months.add(m);
  // 返済が入金月より後に伸びることがあるため、返済月も対象に含める。
  for (const m of repayments.keys()) months.add(m);

  return [...months]
    .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))
    .map((month) => {
      const securedOfMonth = items.filter((it) => it.month === month && isSecured(it.status));
      const funding = securedOfMonth.reduce((s, it) => s + nonNeg(it.amount), 0);
      // 当月の課税対象額 (圧縮記帳適用分は当年度課税が繰延されるため除外)。
      const taxable = securedOfMonth
        .filter((it) => isTaxableFunding(it.kind) && !it.compressedEntry)
        .reduce((s, it) => s + nonNeg(it.amount), 0);
      const fundingAfterTax = Math.round(funding - taxable * rate);
      const repayment = repayments.get(month) ?? 0;
      const interest = interests.get(month) ?? 0;
      // 支払利息は損金算入され税負担を減らす (実効税率分の節税効果)。
      const interestTaxShield = Math.round(interest * rate);
      const operatingCashflow = options.accountingCashflow?.get(month) ?? 0;
      return {
        month,
        funding,
        fundingAfterTax,
        repayment,
        interest,
        interestTaxShield,
        netCashflow: fundingAfterTax + operatingCashflow - repayment + interestTaxShield,
        operatingCashflow,
        portfolioValue: options.portfolioByMonth?.get(month) ?? 0,
      };
    });
}

/** 累計キャッシュ残高 (ランウェイ) の 1 行。 */
export interface CashRunwayRow {
  readonly month: string;
  /** その月の純資金繰り (monthlyFlow の netCashflow)。 */
  readonly netCashflow: number;
  /** その月末の累計キャッシュ残高 (期首残高 + 各月の純資金繰りの累積)。 */
  readonly balance: number;
}

/** ランウェイ分析の結果。 */
export interface CashRunway {
  readonly rows: readonly CashRunwayRow[];
  /** 期首 (最初の月の前) のキャッシュ残高。 */
  readonly openingBalance: number;
  /** 期間中の最低残高。 */
  readonly minBalance: number;
  /**
   * 残高が初めてマイナスになる月 (資金ショート月)。発生しなければ null。
   * 「この月までに追加調達か支出抑制が必要」という警告に使う。
   */
  readonly shortfallMonth: string | null;
}

/**
 * 月次の純資金繰りを期首残高から積み上げ、累計キャッシュ残高とランウェイ
 * (資金が尽きる月) を算出する。
 *
 * @param monthly `monthlyFlow` の結果 (月の昇順)
 * @param openingBalance 期首のキャッシュ残高 (円)。既定 0。
 */
export function cashRunway(
  monthly: readonly FundingMonthly[],
  openingBalance = 0,
): CashRunway {
  let balance = openingBalance;
  // 最低残高は月末残高 (rows) の最小値。月が無ければ期首残高とする。
  let minBalance = openingBalance;
  let seenRow = false;
  let shortfallMonth: string | null = null;
  const rows: CashRunwayRow[] = monthly.map((m) => {
    balance += m.netCashflow;
    if (!seenRow || balance < minBalance) {
      minBalance = balance;
      seenRow = true;
    }
    if (shortfallMonth === null && balance < 0) shortfallMonth = m.month;
    return { month: m.month, netCashflow: m.netCashflow, balance };
  });
  return { rows, openingBalance, minBalance, shortfallMonth };
}

/** 楽観 / 期待 / 悲観 の 3 シナリオの累計キャッシュ残高。 */
export interface ScenarioRunways {
  /** 楽観: パイプライン案件を全採択と仮定。 */
  readonly optimistic: CashRunway;
  /** 期待: パイプラインを採択確率で加重。 */
  readonly expected: CashRunway;
  /** 悲観: 採択確率を割引係数でさらに引き下げ。 */
  readonly pessimistic: CashRunway;
}

/**
 * パイプライン (申請中・予定) 案件の入金を採択確率で加重し、楽観 / 期待 /
 * 悲観の 3 シナリオの累計キャッシュ残高を返す。
 *
 * パイプライン案件は金額をシナリオ係数で加重したうえで確定扱い (approved) に
 * 昇格させ、既存の `monthlyFlow` → `cashRunway` に流す。シナリオ間の差は
 * 入金見込みのみに現れるよう、パイプライン案件の返済条件は除外する
 * (確定済み融資の返済は全シナリオ共通で計上される)。
 *
 * 係数: 楽観 = 1.0、期待 = 採択確率、悲観 = 採択確率 × `pessimisticDiscount`
 * (既定 0.5)。確定案件は全シナリオで不変。
 */
export function scenarioRunways(
  items: readonly FundingItem[],
  options: {
    readonly openingBalance?: number;
    readonly effectiveTaxRate?: number;
    readonly accountingCashflow?: ReadonlyMap<string, number>;
    readonly portfolioByMonth?: ReadonlyMap<string, number>;
    readonly pessimisticDiscount?: number;
  } = {},
): ScenarioRunways {
  const discount = clampRate(options.pessimisticDiscount ?? 0.5);
  const flowOpts = {
    effectiveTaxRate: options.effectiveTaxRate,
    accountingCashflow: options.accountingCashflow,
    portfolioByMonth: options.portfolioByMonth,
  };
  const run = (weightOf: (it: FundingItem) => number): CashRunway => {
    const synth = items.map((it) => {
      if (isSecured(it.status)) return it;
      // パイプライン: 金額を係数で加重し確定扱いに昇格。返済条件は外す。
      const { repayment: _repayment, ...rest } = it;
      void _repayment;
      return { ...rest, status: 'approved' as const, amount: Math.round(nonNeg(it.amount) * weightOf(it)) };
    });
    return cashRunway(monthlyFlow(synth, flowOpts), options.openingBalance ?? 0);
  };
  return {
    optimistic: run(() => 1),
    expected: run((it) => effectiveProbability(it)),
    pessimistic: run((it) => effectiveProbability(it) * discount),
  };
}

/**
 * 全体サマリーを計算する。
 *
 * @param items 資金調達案件
 * @param effectiveTaxRate 課税対象資金に課す実効税率 (0..1)。既定 0.3。
 *   補助金・助成金・給付金・購入型CF は益金算入で課税対象、融資・公庫は
 *   借入金で非課税。圧縮記帳 (`compressedEntry`) 適用分は当年度課税を繰延。
 *   手残り = 確定総額 − 当年度課税対象確定額 × 実効税率。
 * @param consumptionTaxRate 消費税率 (0..1)。既定 0.1。購入型CF は課税売上の
 *   ため、内税ベースの消費税相当額を概算する。
 */
export function summarize(
  items: readonly FundingItem[],
  effectiveTaxRate: number = DEFAULT_EFFECTIVE_TAX_RATE,
  consumptionTaxRate = 0.1,
): FundingSummary {
  const rate = clampRate(effectiveTaxRate);
  const consRate = clampRate(consumptionTaxRate);
  let nonRepayableSecured = 0;
  let repayableSecured = 0;
  let totalPipeline = 0;
  let taxableSecured = 0;
  let deferredSecured = 0;
  let consumptionTaxExemptSecured = 0;
  let consumptionTaxableSecured = 0;
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
      const treatment = consumptionTaxTreatment(it.kind);
      if (treatment === 'tax-exempt') consumptionTaxExemptSecured += amt;
      else if (treatment === 'taxable') consumptionTaxableSecured += amt;
    }
  }
  const totalSecured = nonRepayableSecured + repayableSecured;
  // 課税売上は内税とみなし、消費税相当 = 額 × 率 / (1 + 率)。
  const consumptionTaxEstimate = Math.round((consumptionTaxableSecured * consRate) / (1 + consRate));
  return {
    nonRepayableSecured,
    repayableSecured,
    totalSecured,
    totalPipeline,
    taxableSecured,
    deferredSecured,
    afterTaxSecured: Math.round(totalSecured - taxableSecured * rate),
    consumptionTaxExemptSecured,
    consumptionTaxableSecured,
    consumptionTaxEstimate,
    count: items.length,
  };
}

// --- 期待値シナリオ (採択確率による加重) -------------------------------

/**
 * 案件のステータス・種別から採択/実行確率の既定値を推定する (0..1)。
 *
 * - received / approved: 確定済みなので 1.0。
 * - applied (申請中): 種別ごとの一般的な採択率の目安。
 *   補助金は競争的で低め、助成金は要件充足型で高め、融資/公庫は審査次第、
 *   給付金は要件型で高め、CF は達成率の目安。
 * - planned (検討中): 申請中の半分程度に割り引く。
 *
 * これは概算の目安であり、実際の採択率は公募回・事業内容で大きく変動する。
 */
export function defaultProbability(item: FundingItem): number {
  if (isSecured(item.status)) return 1;
  const base = appliedBaseRate(item.kind);
  // 検討中は申請中より不確実なので割り引く。
  return item.status === 'planned' ? Math.round(base * 0.5 * 100) / 100 : base;
}

/** 申請中ステータスの種別別の一般的な採択率の目安。 */
function appliedBaseRate(kind: FundingKind): number {
  switch (kind) {
    case 'subsidy':
      return 0.5; // 競争的補助金 (採択率は公募で変動)
    case 'grant':
      return 0.8; // 要件充足型の助成金
    case 'benefit':
      return 0.9; // 要件型の給付金
    case 'loan':
      return 0.7; // 民間融資の審査
    case 'jfc':
      return 0.75; // 公庫の審査
    case 'crowdfunding':
      return 0.5; // CF の達成率の目安
    default: {
      const _exhaustive: never = kind;
      return _exhaustive;
    }
  }
}

/** 案件の有効確率 (明示指定があればそれを [0,1] にクランプ、なければ既定値)。 */
export function effectiveProbability(item: FundingItem): number {
  if (item.probability === undefined) return defaultProbability(item);
  return clampRate(item.probability);
}

/** 期待値シナリオの結果。 */
export interface ExpectedScenario {
  /** 確定済みの調達額 (確率 1.0)。 */
  readonly securedTotal: number;
  /** パイプライン (申請中・予定) の単純合計 (確率 1.0 と仮定した楽観値)。 */
  readonly pipelineTotal: number;
  /** パイプラインを採択確率で加重した期待額。 */
  readonly expectedPipeline: number;
  /** 確定額 + 期待パイプライン (現実的な調達見込み)。 */
  readonly expectedTotal: number;
}

/**
 * パイプライン案件を採択確率で加重した期待調達額を算出する。
 *
 * 確定 (received/approved) は確率 1.0、申請中・予定は `effectiveProbability`
 * (明示指定 or ステータス×種別の既定値) で加重する。楽観値 (全採択) と
 * 期待値の差で、計画の不確実性を把握できる。
 */
export function expectedScenario(items: readonly FundingItem[]): ExpectedScenario {
  let securedTotal = 0;
  let pipelineTotal = 0;
  let expectedPipeline = 0;
  for (const it of items) {
    const amt = nonNeg(it.amount);
    if (isSecured(it.status)) {
      securedTotal += amt;
    } else {
      pipelineTotal += amt;
      expectedPipeline += Math.round(amt * effectiveProbability(it));
    }
  }
  return {
    securedTotal,
    pipelineTotal,
    expectedPipeline,
    expectedTotal: securedTotal + expectedPipeline,
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
