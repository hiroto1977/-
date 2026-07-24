/**
 * 投資 (不動産 / 投資信託) のユーザー追加データ — record store 永続化。
 *
 * 不動産投資・投資信託ページはこれまで snapshot 固定だったが、本モジュールで
 * 「任意で追加」に対応する。`sales.ts` / `members.ts` と同じ規約:
 *   - コレクション名 + payload 型 + parse 検証 (throw は日本語メッセージ)
 *   - ページは `useCollection(COLLECTION)` で読み書き
 *   - ポートフォリオ集計は純関数 (snapshot 行 + ユーザー行の結合リストを受ける)
 *
 * 集計の不変条件 (テストで固定): ユーザー行が 0 件のとき、snapshot の
 * properties / holdings だけから再計算した値は snapshot に手書きされた
 * 集計値 (monthlyCashflow / portfolioYield / occupancyRate / portfolio) と
 * 一致する — つまり「追加ゼロなら従来表示と完全に同一」。
 *
 * **概算であり投資助言ではありません。**
 */

export const PROPERTIES_COLLECTION = 'realestate-properties';
export const HOLDINGS_COLLECTION = 'mutualfund-holdings';

// ---------------------------------------------------------------------------
// 不動産: 物件エントリ
// ---------------------------------------------------------------------------

/** 物件種別の選択肢 (snapshot の既存 2 種を含む)。 */
export const PROPERTY_TYPES = ['区分所有', '一棟', '戸建て', '店舗・事務所', '駐車場', 'その他'] as const;

export interface PropertyEntry extends Record<string, unknown> {
  readonly name: string;
  readonly type: string;
  /** 家賃 (円/月・満室想定)。 */
  readonly monthlyRent: number;
  /** 取得価格 (円)。 */
  readonly purchasePrice: number;
  readonly occupied: boolean;
  /** 月次の運営費用 (円・任意、既定 0)。 */
  readonly monthlyExpenses: number;
  /** 月次のローン返済額 (円・任意、既定 0)。 */
  readonly monthlyLoan: number;
}

/** 数値入力 (文字列可) を非負の有限数に。不正は null。 */
function toAmount(v: unknown): number | null {
  const n = typeof v === 'string' ? Number(v.replace(/[,，\s]/g, '')) : typeof v === 'number' ? v : NaN;
  return Number.isFinite(n) && n >= 0 ? n : null;
}

export function parsePropertyEntry(input: {
  name?: unknown;
  type?: unknown;
  monthlyRent?: unknown;
  purchasePrice?: unknown;
  occupied?: unknown;
  monthlyExpenses?: unknown;
  monthlyLoan?: unknown;
}): PropertyEntry {
  const name = typeof input.name === 'string' ? input.name.trim() : '';
  if (name.length === 0 || name.length > 64) throw new Error('物件名は 1〜64 文字で入力してください');

  const type = typeof input.type === 'string' ? input.type.trim() : '';
  if (type.length === 0 || type.length > 16) throw new Error('種別を選択してください');

  const monthlyRent = toAmount(input.monthlyRent);
  if (monthlyRent === null) throw new Error('家賃 (月額) は 0 以上の数値で入力してください');

  const purchasePrice = toAmount(input.purchasePrice);
  if (purchasePrice === null || purchasePrice <= 0) throw new Error('取得価格は 1 円以上の数値で入力してください');

  // 任意項目: 空欄・未指定は 0 (不正な文字列だけエラーにする)。
  const expensesRaw = input.monthlyExpenses;
  const monthlyExpenses = expensesRaw === undefined || expensesRaw === '' ? 0 : toAmount(expensesRaw);
  if (monthlyExpenses === null) throw new Error('月次経費は 0 以上の数値で入力してください');

  const loanRaw = input.monthlyLoan;
  const monthlyLoan = loanRaw === undefined || loanRaw === '' ? 0 : toAmount(loanRaw);
  if (monthlyLoan === null) throw new Error('月次返済額は 0 以上の数値で入力してください');

  return {
    name,
    type,
    monthlyRent,
    purchasePrice,
    occupied: input.occupied !== false,
    monthlyExpenses,
    monthlyLoan,
  };
}

/** 集計に必要な物件の最小 shape (snapshot 行・ユーザー行の共通部分)。 */
export interface PortfolioProperty {
  readonly monthlyRent: number;
  readonly purchasePrice: number;
  readonly occupied: boolean;
  /** ユーザー行のみ >0 になりうる (snapshot 行は集計値側で一括計上)。 */
  readonly monthlyExpenses?: number;
  readonly monthlyLoan?: number;
}

export interface RealEstatePortfolio {
  readonly grossRent: number;
  readonly operatingExpenses: number;
  readonly mortgagePayment: number;
  readonly netCashflow: number;
  /** 各物件の表面利回り (%) の単純平均 (小数第 2 位まで)。物件 0 件は 0。 */
  readonly portfolioYield: number;
  /** 入居率 (0..1、物件数ベース・小数第 4 位まで)。物件 0 件は 0。 */
  readonly occupancyRate: number;
}

/**
 * 物件リスト (snapshot + ユーザー追加) からポートフォリオ集計を再計算する。
 * `baseExpenses` / `baseLoan` は snapshot 側の月次運営費用・返済額 (ユーザー行の
 * per-物件の経費・返済はリスト内の値から加算する)。
 */
export function computeRealEstatePortfolio(
  properties: readonly PortfolioProperty[],
  baseExpenses: number,
  baseLoan: number,
): RealEstatePortfolio {
  let grossRent = 0;
  let expenses = Number.isFinite(baseExpenses) && baseExpenses > 0 ? baseExpenses : 0;
  let loan = Number.isFinite(baseLoan) && baseLoan > 0 ? baseLoan : 0;
  let yieldSum = 0;
  let occupiedCount = 0;
  for (const p of properties) {
    if (p.occupied) {
      grossRent += p.monthlyRent;
      occupiedCount += 1;
    }
    expenses += p.monthlyExpenses ?? 0;
    loan += p.monthlyLoan ?? 0;
    // 表面利回りは表示と同じく物件ごとに小数第 1 位へ丸めてから平均する
    // (snapshot の portfolioYield 6.15 = (4.8+6.2+5.5+8.1)/4 と一致させる)。
    yieldSum += p.purchasePrice > 0 ? Math.round(((p.monthlyRent * 12) / p.purchasePrice) * 1000) / 10 : 0;
  }
  const count = properties.length;
  return {
    grossRent,
    operatingExpenses: expenses,
    mortgagePayment: loan,
    netCashflow: grossRent - expenses - loan,
    portfolioYield: count > 0 ? Math.round((yieldSum / count) * 100) / 100 : 0,
    occupancyRate: count > 0 ? Math.round((occupiedCount / count) * 10000) / 10000 : 0,
  };
}

// ---------------------------------------------------------------------------
// 投資信託: 保有銘柄エントリ
// ---------------------------------------------------------------------------

/**
 * 評価額の算出モード:
 * - `auto`   — 評価額 = 口数 ÷ 1万 × 基準価額 で自動計算 (口数/基準価額の
 *              編集に自動追従する)。
 * - `manual` — 証券会社アプリ等で見た評価額をそのまま手入力 (口数・基準価額は
 *              任意)。編集フォームで評価額を空欄にすればいつでも auto に戻る。
 */
export type ValuationMode = 'auto' | 'manual';

export interface HoldingEntry extends Record<string, unknown> {
  /** 銘柄コード (任意・英数 16 字まで)。空なら表示は '—'。 */
  readonly code: string;
  readonly name: string;
  /** 口数 (manual モードでは任意・0 可)。 */
  readonly units: number;
  /** 基準価額 (円・1 万口あたり。manual モードでは任意・0 可)。 */
  readonly navPerUnit: number;
  /** 評価額 (円)。auto なら導出値、manual なら手入力値。 */
  readonly valuation: number;
  /** 評価額の算出モード (過去データに無い場合は auto 扱い)。 */
  readonly valuationMode: ValuationMode;
  /** 取得額 (円・任意)。空欄は評価額と同額 (損益 0) とみなす。 */
  readonly acquisitionCost: number;
  /** 年初来リターン (%・任意、既定 0)。 */
  readonly ytdReturnPct: number;
}

/** 基準価額 (1 万口あたり) と口数から評価額を導出する。 */
export function fundValuation(units: number, navPerUnit: number): number {
  return Math.round((units / 10_000) * navPerUnit);
}

/**
 * 追加/編集フォームの入力を検証して HoldingEntry にする。
 *
 * 評価額 (`valuation`) の扱いが「任意入力⇄自動反映」の切替点:
 * - 空欄 → `auto`: 口数・基準価額 (どちらも必須) から自動計算。
 * - 入力 → `manual`: その値をそのまま評価額にする。口数・基準価額は任意
 *   (空欄は 0)。後で空欄にして保存し直せば auto に戻る。
 */
export function parseHoldingEntry(input: {
  code?: unknown;
  name?: unknown;
  units?: unknown;
  navPerUnit?: unknown;
  valuation?: unknown;
  acquisitionCost?: unknown;
  ytdReturnPct?: unknown;
}): HoldingEntry {
  const code = typeof input.code === 'string' ? input.code.trim() : '';
  if (code.length > 16 || /\s/.test(code)) throw new Error('銘柄コードは空白なし 16 文字以内で入力してください');

  const name = typeof input.name === 'string' ? input.name.trim() : '';
  if (name.length === 0 || name.length > 80) throw new Error('ファンド名は 1〜80 文字で入力してください');

  const manual = input.valuation !== undefined && input.valuation !== '';

  let units: number;
  let navPerUnit: number;
  let valuation: number;
  let valuationMode: ValuationMode;
  if (manual) {
    // 手動: 評価額を直接入力。口数・基準価額は任意 (空欄 0)。
    const v = toAmount(input.valuation);
    if (v === null || v <= 0) throw new Error('評価額は 1 円以上の数値で入力してください (空欄にすると自動計算)');
    const u = input.units === undefined || input.units === '' ? 0 : toAmount(input.units);
    if (u === null) throw new Error('口数は 0 以上の数値で入力してください');
    const nav = input.navPerUnit === undefined || input.navPerUnit === '' ? 0 : toAmount(input.navPerUnit);
    if (nav === null) throw new Error('基準価額は 0 以上の数値で入力してください');
    units = u;
    navPerUnit = nav;
    valuation = v;
    valuationMode = 'manual';
  } else {
    // 自動: 口数 × 基準価額から評価額を導出。
    const u = toAmount(input.units);
    if (u === null || u <= 0) throw new Error('口数は 1 以上の数値で入力してください (評価額を直接入力する場合は評価額欄へ)');
    const nav = toAmount(input.navPerUnit);
    if (nav === null || nav <= 0) throw new Error('基準価額 (1万口あたり・円) を入力してください');
    units = u;
    navPerUnit = nav;
    valuation = fundValuation(u, nav);
    valuationMode = 'auto';
  }

  const acqRaw = input.acquisitionCost;
  const acquisitionCost = acqRaw === undefined || acqRaw === '' ? valuation : toAmount(acqRaw);
  if (acquisitionCost === null) throw new Error('取得額は 0 以上の数値で入力してください');

  const ytdRaw = input.ytdReturnPct;
  let ytdReturnPct = 0;
  if (ytdRaw !== undefined && ytdRaw !== '') {
    const n = typeof ytdRaw === 'string' ? Number(ytdRaw.replace(/[,，\s]/g, '')) : typeof ytdRaw === 'number' ? ytdRaw : NaN;
    if (!Number.isFinite(n) || n < -100 || n > 1000) throw new Error('YTD リターン (%) は −100〜1000 の数値で入力してください');
    ytdReturnPct = n;
  }

  return { code, name, units, navPerUnit, valuation, valuationMode, acquisitionCost, ytdReturnPct };
}

/**
 * 保存済みエントリを編集フォームの初期値 (文字列) に変換する。
 * auto の評価額は空欄にして「自動計算のまま」を保つ (値を入れると manual に
 * 切り替わる)。0 の任意項目は空欄に戻す。
 */
export function holdingToForm(h: HoldingEntry): {
  code: string; name: string; units: string; navPerUnit: string;
  valuation: string; acquisitionCost: string; ytdReturnPct: string;
} {
  const mode: ValuationMode = h.valuationMode ?? 'auto';
  return {
    code: h.code,
    name: h.name,
    units: h.units > 0 ? String(h.units) : '',
    navPerUnit: h.navPerUnit > 0 ? String(h.navPerUnit) : '',
    valuation: mode === 'manual' ? String(h.valuation) : '',
    acquisitionCost: String(h.acquisitionCost),
    ytdReturnPct: h.ytdReturnPct !== 0 ? String(h.ytdReturnPct) : '',
  };
}

/** 保存済み物件を編集フォームの初期値 (文字列) に変換する。 */
export function propertyToForm(p: PropertyEntry): {
  name: string; type: string; monthlyRent: string; purchasePrice: string;
  monthlyExpenses: string; monthlyLoan: string; occupied: boolean;
} {
  return {
    name: p.name,
    type: p.type,
    monthlyRent: String(p.monthlyRent),
    purchasePrice: String(p.purchasePrice),
    monthlyExpenses: p.monthlyExpenses > 0 ? String(p.monthlyExpenses) : '',
    monthlyLoan: p.monthlyLoan > 0 ? String(p.monthlyLoan) : '',
    occupied: p.occupied,
  };
}

/** 集計に必要な保有銘柄の最小 shape。 */
export interface PortfolioHolding {
  readonly valuation: number;
}

export interface FundPortfolio {
  readonly totalValuation: number;
  readonly totalCostBasis: number;
  readonly unrealizedGain: number;
  /** 評価損益率 (%・小数第 1 位まで)。取得原価 0 は 0。 */
  readonly unrealizedGainPct: number;
}

/**
 * 保有銘柄リスト (snapshot + ユーザー追加) からポートフォリオ集計を再計算する。
 * snapshot 側の取得原価は銘柄別に持っていないため `baseCostBasis` で一括計上し、
 * ユーザー行の取得額は `userCosts` (取得額の配列) で加算する。
 */
export function computeFundPortfolio(
  holdings: readonly PortfolioHolding[],
  baseCostBasis: number,
  userCosts: readonly number[],
): FundPortfolio {
  let totalValuation = 0;
  for (const h of holdings) totalValuation += Number.isFinite(h.valuation) ? h.valuation : 0;
  let totalCostBasis = Number.isFinite(baseCostBasis) && baseCostBasis > 0 ? baseCostBasis : 0;
  for (const c of userCosts) totalCostBasis += Number.isFinite(c) && c > 0 ? c : 0;
  const unrealizedGain = totalValuation - totalCostBasis;
  return {
    totalValuation,
    totalCostBasis,
    unrealizedGain,
    unrealizedGainPct: totalCostBasis > 0 ? Math.round((unrealizedGain / totalCostBasis) * 1000) / 10 : 0,
  };
}
