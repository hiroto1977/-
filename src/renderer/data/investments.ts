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
  /**
   * 同梱の見本 (snapshot) 行か (2026-09-12 · パス 187)。
   *
   * **`computeFundPortfolio` は 2026-09-09 から銘柄ごとに `demo` を受けている**
   * のに、こちらは受けていなかった —— 同じファイルの中で片方だけが
   * 「見本と自分の記録は別物」を知っていた。
   */
  readonly demo?: boolean;
}

export interface RealEstatePortfolio {
  readonly grossRent: number;
  readonly operatingExpenses: number;
  readonly mortgagePayment: number;
  readonly netCashflow: number;
  /**
   * 各物件の表面利回り (%) の単純平均 (小数第 2 位まで)。
   *
   * **取得価格が読めない物件は分母から外す。** 2026-09-08 まで 0% として
   * 足しつつ分母は全件だったので、**1 件で全体が下がった**:
   *
   * | 控え | 表示 | 測れた物件だけの平均 |
   * | --- | ---: | ---: |
   * | 3 件そろい | 5.50% | 5.50% |
   * | **+ 取得価格の欄が無い 1 件** | **4.13%** | 5.50% |
   *
   * 取得価格 0 は「利回り 0%」ではなく「割れない」である
   * (`normalizeProperty` は欄の無い控えを 0 に倒す —— 復元・古い版・手で
   * 直した JSON の経路。入力欄の `parseProperty` は 1 円以上を要求する)。
   * 測れた物件が 1 件も無ければ `null`。
   */
  readonly portfolioYield: number | null;
  /** 入居率 (0..1、物件数ベース・小数第 4 位まで)。物件 0 件は null (算定不能)。 */
  readonly occupancyRate: number | null;
  /** 表面利回りを測れた物件数 (取得価格 > 0)。 */
  readonly yieldMeasured: number;
  /** 取得価格が読めず、利回りの平均から外した物件数。 */
  readonly yieldUnmeasured: number;
  /** 同梱の見本 (snapshot) 行の件数。 */
  readonly demoCount: number;
  /** 利用者が登録した行の件数。 */
  readonly userCount: number;
  /**
   * **見本を除いた** 家賃収入・運営費用・返済額・キャッシュフロー
   * (2026-09-12 · パス 187)。
   *
   * 合計の側は見本を含む (追加ゼロでも画面が空にならないための設計で、
   * 一覧の行も「デモ」と印がついている)。だが**合計しか出さないと、
   * 自分の物件の数字が読めない** —— 実測で、自分の物件 1 件 (家賃 9 万・
   * 経費 3 万・返済 5.5 万) だけの人に対し 家賃収入 ¥913,000・月次
   * キャッシュフロー **+¥248,000** と出ていた。自分の分は ¥90,000 と
   * **+¥5,000** —— 家賃は 10 倍、手残りは 49 倍である。両方を持ち、画面が並べる。
   *
   * 見本の基準費用 (¥380,000) と返済 (¥200,000) を自分の側へ足すのは**逆の
   * 誤り**で、同じ人の手残りが **−¥575,000** (符号が逆) になる。だから
   * `computeRealEstatePortfolio` は自分の側に基準額を入れない。
   *
   * 見本が 0 件なら合計と同じ値になる。
   */
  readonly userOnly: {
    readonly grossRent: number;
    readonly operatingExpenses: number;
    readonly mortgagePayment: number;
    readonly netCashflow: number;
  };
  /**
   * 入居中と記録されているのに家賃が読めない (0 の) 物件数。
   * **入居率と家賃収入が食い違う元**なので数えて画面に出す ——
   * 「稼働率 100% / 月次家賃収入 ¥0」は両立しない。
   */
  readonly occupiedWithoutRent: number;
}

/**
 * 利回りの平均から外した物件が在ることの断り。1 件も無ければ `null`。
 * **画面がこの 1 文を出す** (数字だけ直しても、なぜ件数が合わないかは読めない)。
 */
export function yieldScopeNote(p: RealEstatePortfolio): string | null {
  if (p.yieldUnmeasured === 0) return null;
  return `取得価格が読めない ${p.yieldUnmeasured} 件は表面利回りの平均から外しています（測れた ${p.yieldMeasured} 件の平均です）。0% として平均すると全体が下がります。`;
}

/** 入居中なのに家賃が読めない物件が在ることの断り。1 件も無ければ `null`。 */
export function occupiedWithoutRentNote(p: RealEstatePortfolio): string | null {
  if (p.occupiedWithoutRent === 0) return null;
  return `入居中と記録されている ${p.occupiedWithoutRent} 件は家賃が読めないため、月次家賃収入に含まれていません（入居率にはこの物件も数えています）。`;
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
  let yieldMeasured = 0;
  let occupiedCount = 0;
  let occupiedWithoutRent = 0;
  // 見本を除いた側 (パス 187)。基準の運営費用・返済額は snapshot の値なので
  // **自分の分には入れない** —— 入れると、自分の物件 1 件の人が見本の
  // 経費 ¥380,000 と返済 ¥200,000 を背負い、手残り +¥5,000 が −¥575,000 に
  // なる (符号が逆)。`demoMixNote.test.ts` がこの対照を持つ。
  let demoCount = 0;
  let userRent = 0;
  let userExpenses = 0;
  let userLoan = 0;
  for (const p of properties) {
    const isDemo = p.demo === true;
    if (isDemo) demoCount += 1;
    if (p.occupied) {
      grossRent += p.monthlyRent;
      if (!isDemo) userRent += p.monthlyRent;
      occupiedCount += 1;
      // 入居中なのに家賃が 0 = 読めない。数えて画面が述べる (上の欄の脇)。
      if (!(p.monthlyRent > 0)) occupiedWithoutRent += 1;
    }
    expenses += p.monthlyExpenses ?? 0;
    loan += p.monthlyLoan ?? 0;
    if (!isDemo) {
      userExpenses += p.monthlyExpenses ?? 0;
      userLoan += p.monthlyLoan ?? 0;
    }
    // 表面利回りは表示と同じく物件ごとに小数第 1 位へ丸めてから平均する
    // (snapshot の portfolioYield 6.15 = (4.8+6.2+5.5+8.1)/4 と一致させる)。
    // **取得価格が読めない物件は分子にも分母にも入れない** (0% は主張である)。
    if (p.purchasePrice > 0) {
      yieldSum += Math.round(((p.monthlyRent * 12) / p.purchasePrice) * 1000) / 10;
      yieldMeasured += 1;
    }
  }
  const count = properties.length;
  return {
    grossRent,
    operatingExpenses: expenses,
    mortgagePayment: loan,
    netCashflow: grossRent - expenses - loan,
    portfolioYield: yieldMeasured > 0 ? Math.round((yieldSum / yieldMeasured) * 100) / 100 : null,
    occupancyRate: count > 0 ? Math.round((occupiedCount / count) * 10000) / 10000 : null,
    yieldMeasured,
    yieldUnmeasured: count - yieldMeasured,
    demoCount,
    userCount: count - demoCount,
    userOnly: {
      grossRent: userRent,
      operatingExpenses: userExpenses,
      mortgagePayment: userLoan,
      netCashflow: userRent - userExpenses - userLoan,
    },
    occupiedWithoutRent,
  };
}

/**
 * **合計に同梱の見本が混ざっていることの断り** (2026-09-12 · パス 187)。
 *
 * 見本が 0 件 (利用者の記録だけ) なら `null` —— 断る物が無い。
 * 利用者の記録が 0 件なら「見本だけを表示している」と述べる。
 * 両方在るときは**自分の分の数字も並べる** (合計しか出さないと、自分の
 * 物件のキャッシュフローが読めない。実測で符号まで違っていた)。
 *
 * 文面をここに置くのは `yieldScopeNote` / `occupiedWithoutRentNote` と同じ理由
 * —— 画面が組み立てると、同じ説明が画面ごとに言い換わる。
 */
export function demoMixNote(p: RealEstatePortfolio, yen: (n: number) => string): string | null {
  if (p.demoCount === 0) return null;
  if (p.userCount === 0) {
    return `同梱の見本 ${p.demoCount} 件を表示しています（自分の物件はまだ登録されていません）。`;
  }
  return (
    `合計には同梱の見本 ${p.demoCount} 件が含まれています（自分の物件は ${p.userCount} 件）。` +
    `見本を除くと 家賃収入 ${yen(p.userOnly.grossRent)}／月・` +
    `月次キャッシュフロー ${yen(p.userOnly.netCashflow)}／月です。`
  );
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
  /**
   * 取得額 (円・任意)。**空欄は null = 未入力** —— 評価額と同額 (損益 0) とはみなさない (2026-09-09 · パス 123)。
   *
   * パス 123 までは「空欄は評価額と同額 (損益 0) とみなす」で、取得額を入れずに足した銘柄が
   * **取得原価のタイルを増やし** (見本 ¥7,180,000 + ¥300,000)、**評価損益率を薄め** (14.8% → 14.2%、
   * ¥3,000,000 なら 10.4%)、編集フォームには入力していない取得額が入って戻った。
   * 規準は隣の欄 (`ytdReturnPct: number | null`・パス 122) と不動産側 (`yieldUnmeasured`・パス 54)。
   */
  readonly acquisitionCost: number | null;
  /**
   * 年初来リターン (%・任意)。**空欄は null = 未入力** —— 0% ではない (2026-09-09 · パス 122)。
   *
   * パス 122 までは「既定 0」だった。空欄で足した銘柄が一覧に **「+0.0%」(緑)** と刷られ、
   * リスク (標準偏差) に 0% の銘柄として入り、改善提案 (パス 119) が「最低は X の 0.0%」と
   * **入力していない銘柄を最低と名指し**していた。規準は同じファイルの不動産側に在った ——
   * `grossYieldPct: number | null` と `yieldUnmeasured` (パス 54) は「測れない物件」を数に入れない。
   */
  readonly ytdReturnPct: number | null;
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
 * 銘柄コードは空文字、評価モードは auto、取得額と年初来リターンは **null = 未入力**
 * (取得額を評価額に倒すと損益 0 の銘柄を作り、年初来を 0 に倒すと測った 0% と見分けが付かない・パス 122 / 123)。
 * 数でない値・非有限値も既定に倒す。
 */
export function normalizeHolding(raw: unknown): HoldingEntry {
  const r = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>;
  const str = (v: unknown): string => (typeof v === 'string' ? v : '');
  const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
  // 取得額と年初来リターンは「無い / 読めない = 未入力 (null)」。0 や評価額に倒すと、測った値と見分けが付かない (パス 122 / 123)。
  const numOrNull = (v: unknown): number | null => (Number.isFinite(v) ? (v as number) : null);
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
    // 取得額が無い / 読めない控えは null = 未入力 (パス 123 までは評価額と同額 = 損益 0 の銘柄にしていた)。
    acquisitionCost: numOrNull(r.acquisitionCost),
    ytdReturnPct: numOrNull(r.ytdReturnPct),
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
  // 空欄は null = 未入力 (パス 123 —— それまでは評価額と同額にして「損益 0」の銘柄を作っていた)。
  let acquisitionCost: number | null = null;
  if (acqRaw !== undefined && acqRaw !== '') {
    const cost = toAmount(acqRaw);
    if (cost === null) throw new Error('取得額は 0 以上の数値で入力してください');
    acquisitionCost = cost;
  }

  const ytdRaw = input.ytdReturnPct;
  // 空欄は null (未入力)。0 にすると測った 0% と同じ顔になる (パス 122)。
  let ytdReturnPct: number | null = null;
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
 * 切り替わる)。0 の任意項目 (口数・基準価額) は空欄に戻す。取得額と年初来リターンは
 * null (未入力) のときだけ空欄 —— 測った 0 は '0' のまま残す (パス 122 / 123。取得額はそれまで
 * 評価額と同額の数を入れて戻していた = 利用者が入力していない取得額)。
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
    acquisitionCost: h.acquisitionCost === null ? '' : String(h.acquisitionCost),
    ytdReturnPct: h.ytdReturnPct === null ? '' : String(h.ytdReturnPct),
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
  /** 取得額。null = 未入力 (パス 123)。見本 (`demo`) は銘柄別に持たず、一括の `baseCostBasis` で見る。 */
  readonly acquisitionCost: number | null;
  /** 同梱の見本か (snapshot 行)。 */
  readonly demo: boolean;
}

export interface FundPortfolio {
  /** 評価額の合計 —— **全銘柄** (取得額の有無を問わない)。 */
  readonly totalValuation: number;
  /** 取得原価 —— **取得額が分かる銘柄だけ** (見本は一括の `baseCostBasis`)。 */
  readonly totalCostBasis: number;
  /** 取得額が分かる銘柄の評価額 (損益の分子側。トータルリターンの終値もこれ)。 */
  readonly costMeasuredValuation: number;
  /** 評価損益 = `costMeasuredValuation` − `totalCostBasis`。 */
  readonly unrealizedGain: number;
  /** 評価損益率 (%・小数第 1 位まで)。取得額が分かる銘柄が無ければ null (0 ではない・パス 123)。 */
  readonly unrealizedGainPct: number | null;
  /** 取得額が未入力で、原価・損益・損益率に**入れていない**銘柄 (画面はこれを注記に刷る)。 */
  readonly costUnmeasured: { readonly count: number; readonly valuation: number };
  /** 同梱の見本 (snapshot) 行の件数。 */
  readonly demoCount: number;
  /** 利用者が登録した行の件数。 */
  readonly userCount: number;
  /**
   * **見本を除いた** 評価額・取得原価・評価損益 (2026-09-12 · パス 187)。
   *
   * 不動産側の `RealEstatePortfolio.userOnly` と同じ理由 —— 合計は見本を含む
   * (追加ゼロでも画面が空にならない設計) が、**合計しか出さないと自分の
   * 銘柄の数字が読めない**。実測で、自分の銘柄 1 件 (評価額 10 万・取得額
   * 9.5 万 = +5.3%) の人に 評価額 ¥8,340,140・評価損益 **+¥1,065,140
   * (+14.6%)** と出ていた。しかも「実質コスト」の節は `totalValuation` を
   * **元本として** コストを複利で積むので、画面の既定 (信託報酬 1.0% /
   * 隠れコスト 0.2% / 想定年率 5% / 保有 5 年) で 年間 ¥100,082・5 年累計
   * ¥594,505 と出る —— 自分の 10 万だけなら ¥1,200 / ¥7,128 で **83 倍**。
   *
   * 見本が 0 件なら合計と同じ値になる。取得額が未入力の銘柄は合計側と
   * 同じく原価・損益から外す (パス 123 の規準をそのまま使う)。
   */
  readonly userOnly: {
    readonly totalValuation: number;
    readonly totalCostBasis: number;
    readonly costMeasuredValuation: number;
    readonly unrealizedGain: number;
    readonly unrealizedGainPct: number | null;
  };
}

/**
 * 保有銘柄リスト (snapshot + ユーザー追加) からポートフォリオ集計を再計算する。
 * snapshot 側の取得原価は銘柄別に持っていないため `baseCostBasis` で一括計上する
 * (それが 0 なら見本ぜんぶが「取得額が分からない」側)。
 *
 * **取得額が未入力の銘柄を「原価 = 評価額」として数えない** (2026-09-09 · パス 123)。
 * パス 123 までは `userCosts` に評価額と同じ数が来て、取得原価が増え・評価損益率が薄まった
 * (見本 14.8% → ¥3,000,000 の銘柄を取得額なしで足すと 10.4%)。不動産側の `yieldUnmeasured` (パス 54)
 * と同じく、分からない物は分母にも分子にも入れず、**数だけ言う**。負の取得額・NaN は「読めない」= 未入力側。
 */
export function computeFundPortfolio(holdings: readonly PortfolioHolding[], baseCostBasis: number): FundPortfolio {
  const base = Number.isFinite(baseCostBasis) && baseCostBasis > 0 ? baseCostBasis : 0;
  let totalValuation = 0;
  let demoValuation = 0;
  let demoCount = 0;
  let measuredValuation = 0;
  let userCost = 0;
  let unmeasuredCount = 0;
  let unmeasuredValuation = 0;
  for (const h of holdings) {
    const v = Number.isFinite(h.valuation) ? h.valuation : 0;
    totalValuation += v;
    if (h.demo) {
      demoValuation += v;
      demoCount += 1;
    } else if (h.acquisitionCost !== null && Number.isFinite(h.acquisitionCost) && h.acquisitionCost >= 0) {
      measuredValuation += v;
      userCost += h.acquisitionCost;
    } else {
      unmeasuredCount += 1;
      unmeasuredValuation += v;
    }
  }
  // 見本は一括の取得原価が在るときだけ「分かる」側。無ければ見本ぜんぶが未入力側 (数も言う)。
  const demoMeasured = base > 0;
  const costMeasuredValuation = measuredValuation + (demoMeasured ? demoValuation : 0);
  const totalCostBasis = base + userCost;
  const unrealizedGain = costMeasuredValuation - totalCostBasis;
  // 見本を除いた側 (パス 187)。`base` は snapshot の一括取得原価なので**入れない**。
  const userGain = measuredValuation - userCost;
  return {
    totalValuation,
    totalCostBasis,
    costMeasuredValuation,
    unrealizedGain,
    unrealizedGainPct: totalCostBasis > 0 ? Math.round((unrealizedGain / totalCostBasis) * 1000) / 10 : null,
    costUnmeasured: {
      count: unmeasuredCount + (demoMeasured ? 0 : demoCount),
      valuation: unmeasuredValuation + (demoMeasured ? 0 : demoValuation),
    },
    demoCount,
    userCount: holdings.length - demoCount,
    userOnly: {
      totalValuation: totalValuation - demoValuation,
      totalCostBasis: userCost,
      costMeasuredValuation: measuredValuation,
      unrealizedGain: userGain,
      unrealizedGainPct: userCost > 0 ? Math.round((userGain / userCost) * 1000) / 10 : null,
    },
  };
}

/**
 * **合計に同梱の見本が混ざっていることの断り** (投資信託・2026-09-12 · パス 187)。
 * 不動産側の `demoMixNote` の双子 —— 文面を 1 か所に置く理由も同じ。
 *
 * 評価損益率は取得額が分かる銘柄が無ければ述べない (`null` → 金額だけ)。
 */
export function fundDemoMixNote(p: FundPortfolio, yen: (n: number) => string): string | null {
  if (p.demoCount === 0) return null;
  if (p.userCount === 0) {
    return `同梱の見本 ${p.demoCount} 銘柄を表示しています（自分の銘柄はまだ登録されていません）。`;
  }
  const pct = p.userOnly.unrealizedGainPct;
  return (
    `合計には同梱の見本 ${p.demoCount} 銘柄が含まれています（自分の銘柄は ${p.userCount} 銘柄）。` +
    `見本を除くと 評価額 ${yen(p.userOnly.totalValuation)}・` +
    `評価損益 ${yen(p.userOnly.unrealizedGain)}` +
    `${pct === null ? '（取得額が入力された銘柄が無いので損益率は算定しません）' : `（${pct.toFixed(1)}%）`}です。`
  );
}

/**
 * **「実質コスト」の元本に見本が混ざっていることの断り** (2026-09-12 · パス 187)。
 *
 * この節は `totalValuation` を元本としてコストを複利で積む。見本 4 銘柄
 * (¥8,240,140) が入った状態で自分が 10 万しか持っていなければ、刷られる
 * 負担は **83 倍** になる (既定の入力で 5 年累計 ¥594,505 / 自分だけなら ¥7,128)。
 * 合計の側は消さず、自分の元本での額を並べる。
 *
 * 自分の銘柄が 0 件なら出さない —— 「見本を除く元本 ¥0」は読み手を惑わせる。
 *
 * @param years  実際に計算に使った保有年数 (画面の入力欄の値)
 * @param userAnnualCostYen      見本を除く元本での年間コスト
 * @param userCumulativeCostYen  同・`years` 年の累計
 */
export function fundCostPrincipalNote(
  p: FundPortfolio,
  yen: (n: number) => string,
  years: number,
  userAnnualCostYen: number,
  userCumulativeCostYen: number,
): string | null {
  if (p.demoCount === 0 || p.userCount === 0) return null;
  return (
    `この元本には同梱の見本 ${p.demoCount} 銘柄が含まれています。` +
    `見本を除く元本 ${yen(p.userOnly.totalValuation)} なら ` +
    `年間コスト ${yen(userAnnualCostYen)}・${years}年累計 ${yen(userCumulativeCostYen)} です。`
  );
}
