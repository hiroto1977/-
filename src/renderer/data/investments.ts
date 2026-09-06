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

import { readNumeric } from '../../shared/readNumeric';

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

/**
 * 保存された 1 件を `PropertyEntry` の形に整える (**読み取りの境界**)。
 *
 * `normalizeHolding` と同じ穴 (2026-09-06): 復元の形の検査は
 * `realestate-properties` の `monthlyExpenses` / `monthlyLoan` を**任意**に
 * しているのに、型は必須と言う。欄の無い控えが復元を通ると年間キャッシュフローの
 * 引き算が NaN になり、不動産ページの「¥NaN」になる。既定 0 は型の注記
 * (「任意、既定 0」) と入力側 `parsePropertyEntry` の「空欄は 0」と同じ約束。
 */
export function normalizeProperty(raw: unknown): PropertyEntry {
  const r = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>;
  const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
  return {
    name: typeof r.name === 'string' ? r.name : '',
    type: typeof r.type === 'string' ? r.type : '',
    monthlyRent: num(r.monthlyRent),
    purchasePrice: num(r.purchasePrice),
    occupied: r.occupied === true,
    monthlyExpenses: num(r.monthlyExpenses),
    monthlyLoan: num(r.monthlyLoan),
  };
}

/**
 * 数値入力 (文字列可) を非負の有限数に。不正は null。空欄は 0
 * (入力欄の番人も「未入力です。0 円 として計算されています」と言う)。
 *
 * 文字列は**画面と同じ** `readNumeric` で読む。2026-09-06 まではここだけ
 * `Number(カンマと空白を外した文字列)` で、同じ欄について
 * **画面の指摘と保存される数が食い違っていた**:
 *
 * ```
 *   '1,5'     画面: ⛔ 読み取れません  保存: 15    ← 桁区切りの位置を見ていない
 *   '1 5'     画面: ⛔                保存: 15
 *   '0x10'    画面: ⛔                保存: 16
 *   '１２００'  画面: 1200 (読める)     保存: ⛔ エラー ← 逆向きの食い違い
 * ```
 */
function toAmount(v: unknown): number | null {
  const n = numberFrom(v);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

/**
 * 数として扱える形 (数値そのもの / 入力欄の文字列) を数にし、他は NaN。
 *
 * 三項の**途中**に `Stryker disable next-line` を置くと効かない
 * (2026-09-06 実測・生存 1 件)。等価変異の 1 行を独立した文にして、
 * 直上の pragma がその行だけに掛かるようにしている。
 */
function numberFrom(v: unknown): number {
  if (typeof v === 'string') return readTypedAmount(v);
  // Stryker disable next-line ConditionalExpression: typeof v === 'number' を true 固定にしても、呼び出し側の Number.isFinite が非数値をすべて弾くため返り値は同一 (等価変異)
  return typeof v === 'number' ? v : Number.NaN;
}

/**
 * 入力欄の文字列を数へ。**空欄は 0** —— 入力欄の番人も「未入力です。
 * 0 円 として計算されています」と言うので、保存も同じ読み方をする。
 * 読めなければ NaN (呼び出し側の `Number.isFinite` が 1 か所で断る)。
 */
function readTypedAmount(text: string): number {
  return text.trim() === '' ? 0 : (readNumeric(text) ?? Number.NaN);
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

  // Stryker disable next-line StringLiteral: '' を Stryker のセンチネル (17 文字) にしても
  // 直後の length > 16 で同じ 種別 エラーになる (等価変異)。name 側は上限 64 のため
  // センチネルが通ってしまい等価にならず、そちらはテストで殺している。
  const type = typeof input.type === 'string' ? input.type.trim() : '';
  if (type.length === 0 || type.length > 16) throw new Error('種別を選択してください');

  const monthlyRent = toAmount(input.monthlyRent);
  if (monthlyRent === null) throw new Error('家賃 (月額) は 0 以上の数値で入力してください');

  const purchasePrice = toAmount(input.purchasePrice);
  // Stryker disable next-line ConditionalExpression: === null を false 固定にしても
  // `null <= 0` が true のため同じエラーが投げられる (等価変異)。null 判定は可読性のため残す。
  if (purchasePrice === null || purchasePrice <= 0) throw new Error('取得価格は 1 円以上の数値で入力してください');

  // 任意項目: 空欄・未指定は 0 (不正な文字列だけエラーにする)。
  const expensesRaw = input.monthlyExpenses;
  // Stryker disable next-line ConditionalExpression,StringLiteral: `=== ''` は冗長で、
  // toAmount('') も 0 を返すため既定値と一致する (等価変異)。空文字の
  // 意図を明示するために式は残す。
  const monthlyExpenses = expensesRaw === undefined || expensesRaw === '' ? 0 : toAmount(expensesRaw);
  if (monthlyExpenses === null) throw new Error('月次経費は 0 以上の数値で入力してください');

  const loanRaw = input.monthlyLoan;
  // Stryker disable next-line ConditionalExpression,StringLiteral: `=== ''` は冗長で、
  // toAmount('') も 0 を返すため既定値と一致する (等価変異)。空文字の
  // 意図を明示するために式は残す。
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
 * 保存された 1 件を `HoldingEntry` の形に整える (**読み取りの境界**)。
 *
 * なぜ要るか (2026-09-06): 復元の形の検査 (`data/collectionShapes.ts`) は
 * `mutualfund-holdings` の `code` / `valuationMode` / `acquisitionCost` /
 * `ytdReturnPct` を**任意**にしている —— 前方互換のため意図してそうしてあり、
 * `valuationMode` の説明も「過去データに無い場合は auto 扱い」と書いている。
 * ところが `HoldingEntry` の型はこの 4 つを**必須**と言うので、欄の無いレコード
 * (古い版・手で直した控え・別の道具が書いた控え) が復元を通ると型が嘘になる:
 *
 *   `ytdReturnPct` が無い … 一覧の `h.ytdReturnPct.toFixed(1)` が TypeError で、
 *     **投資信託の画面が枠になる**。しかもその画面が保有銘柄の一覧なので、
 *     利用者はそのレコードを消せない (形は正しいので設定の点検にも出ない)。
 *   `acquisitionCost` が無い … 取得原価の合計が NaN になり「¥NaN」が出る。
 *
 * 直し方は「使う場所ごとに `??` を置く」ではなく**読む所を 1 つにする** ——
 * 散らすと必ずどれか 1 つが漏れる (`valuationMode` だけ画面側で補われていて、
 * 残り 3 つが漏れていたのがまさにそれ)。既定値は型の注記どおり:
 * 銘柄コードは空文字、評価モードは auto、取得額は評価額と同額 (損益 0)、
 * 年初来リターンは 0。数でない値・非有限値も既定に倒す。
 */
export function normalizeHolding(raw: unknown): HoldingEntry {
  const r = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>;
  const str = (v: unknown): string => (typeof v === 'string' ? v : '');
  const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
  const units = num(r.units);
  const navPerUnit = num(r.navPerUnit);
  // 評価額が無い控えは口数 × 基準価額 から導く (auto と同じ式)。
  const valuation = typeof r.valuation === 'number' && Number.isFinite(r.valuation)
    ? r.valuation
    : fundValuation(units, navPerUnit);
  return {
    code: str(r.code),
    name: str(r.name),
    units,
    navPerUnit,
    valuation,
    valuationMode: r.valuationMode === 'manual' ? 'manual' : 'auto',
    // 取得額が無い / 読めない控えは評価額と同額 = 損益 0 (型の注記どおり)。
    acquisitionCost: typeof r.acquisitionCost === 'number' && Number.isFinite(r.acquisitionCost)
      ? r.acquisitionCost
      : valuation,
    ytdReturnPct: num(r.ytdReturnPct),
  };
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
    // Stryker disable next-line ConditionalExpression: === null を false 固定にしても
    // `null <= 0` が true のため同じエラーが投げられる (等価変異)。null 判定は可読性のため残す。
    if (v === null || v <= 0) throw new Error('評価額は 1 円以上の数値で入力してください (空欄にすると自動計算)');
    // Stryker disable next-line ConditionalExpression,StringLiteral: `=== ''` は冗長で、
    // toAmount('') も 0 を返すため既定値と一致する (等価変異)。空文字の
    // 意図を明示するために式は残す。
    const u = input.units === undefined || input.units === '' ? 0 : toAmount(input.units);
    if (u === null) throw new Error('口数は 0 以上の数値で入力してください');
    // Stryker disable next-line ConditionalExpression,StringLiteral: `=== ''` は冗長で、
    // toAmount('') も 0 を返すため既定値と一致する (等価変異)。空文字の
    // 意図を明示するために式は残す。
    const nav = input.navPerUnit === undefined || input.navPerUnit === '' ? 0 : toAmount(input.navPerUnit);
    if (nav === null) throw new Error('基準価額は 0 以上の数値で入力してください');
    units = u;
    navPerUnit = nav;
    valuation = v;
    valuationMode = 'manual';
  } else {
    // 自動: 口数 × 基準価額から評価額を導出。
    const u = toAmount(input.units);
    // Stryker disable next-line ConditionalExpression: === null を false 固定にしても
    // `null <= 0` が true のため同じエラーが投げられる (等価変異)。null 判定は可読性のため残す。
    if (u === null || u <= 0) throw new Error('口数は 1 以上の数値で入力してください (評価額を直接入力する場合は評価額欄へ)');
    const nav = toAmount(input.navPerUnit);
    // Stryker disable next-line ConditionalExpression: === null を false 固定にしても
    // `null <= 0` が true のため同じエラーが投げられる (等価変異)。null 判定は可読性のため残す。
    if (nav === null || nav <= 0) throw new Error('基準価額 (1万口あたり・円) を入力してください');
    units = u;
    navPerUnit = nav;
    valuation = fundValuation(u, nav);
    valuationMode = 'auto';
  }

  const acqRaw = input.acquisitionCost;
  // Stryker disable next-line StringLiteral: '' を別文字列にしても、その値は toAmount で
  // NaN → null になり同じ 取得額 エラーへ落ちる (等価変異)。
  const acquisitionCost = acqRaw === undefined || acqRaw === '' ? valuation : toAmount(acqRaw);
  if (acquisitionCost === null) throw new Error('取得額は 0 以上の数値で入力してください');

  const ytdRaw = input.ytdReturnPct;
  let ytdReturnPct = 0;
  // `!== ''` は**冗長ではない**: 読み取りが `readNumeric` になった 2026-09-06 から、
  // 空文字は 0 ではなく「読めない」なので、この門を外すと空欄が YTD エラーになる
  // (保存 → 入力欄 → 再保存 の往復の検査が落ちる)。
  if (ytdRaw !== undefined && ytdRaw !== '') {
    // Stryker disable next-line ConditionalExpression: typeof ytdRaw === 'number' を true 固定に
    // しても直後の Number.isFinite が非数値を弾くため同じエラーになる (等価変異)。
    // 文字列は画面と同じ読み取り (`readNumeric`) —— `1,5` を 15% にしない。
    const n = typeof ytdRaw === 'string' ? (readNumeric(ytdRaw) ?? Number.NaN) : typeof ytdRaw === 'number' ? ytdRaw : NaN;
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
  // Stryker disable next-line StringLiteral: 'auto' を別文字列にしても mode は === 'manual' と
  // しか比較されないため分岐は変わらない (等価変異)。
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
  // Stryker disable next-line EqualityOperator: `c > 0` → `c >= 0` は c が ±0 のときだけ差が出るが、
  // どちらも加算結果は同一 (x + -0 === x + 0) のため観測不能 (等価変異)。
  for (const c of userCosts) totalCostBasis += Number.isFinite(c) && c > 0 ? c : 0;
  const unrealizedGain = totalValuation - totalCostBasis;
  return {
    totalValuation,
    totalCostBasis,
    unrealizedGain,
    unrealizedGainPct: totalCostBasis > 0 ? Math.round((unrealizedGain / totalCostBasis) * 1000) / 10 : 0,
  };
}
