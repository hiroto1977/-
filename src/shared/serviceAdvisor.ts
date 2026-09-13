/**
 * **業務操作パネルの「改善提案」を、画面の数字から規則で組み立てる —— 両ビルド・4 サービスで 1 つ。**
 * (2026-09-09 · パス 119)
 *
 * ## なぜ要るか
 *
 * `ServiceActionPanel` (不動産投資 / 投資信託に載る) の「🤖 AI 改善提案」は、Electron 版では
 * **payload を読まない固定文**を返していた —— 「大阪市ワンルームが空室」「平均利回り 6.15%」
 * 「評価損益率 +14.8%」「eMAXIS Slim S&P500 (YTD +14.2%)」。どれも**同梱の見本の数字を散文に写した物**で、
 * 利用者が自分の物件・銘柄を足しても提案は見本について語り、画面のタイル (平均利回り・評価損益率) と
 * **別の数字を言う** (パス 61 の「同じ画面に 2 つの数字」の形)。ブラウザ版には双子が無く
 * `action_not_found` (「AI 提案の取得に失敗」)。ラベルは「AI」と言うが、中身は AI でも計算でもなかった。
 * uber-eats / demae-can の advise は画面が無く誰も呼べないまま、同じ固定文を持っていた。
 *
 * ## 直し方 —— 数字は画面から受け取り、文は数字から組む
 *
 * - 画面は自分が刷っている集計 (物件の行・月次 CF・平均利回り、銘柄の行・評価額・評価損益率) を
 *   **payload で渡す**。ここは受け取った数字だけで文を組む —— 数字を写した文は 1 つも持たない。
 *   だから提案が言う数字は、画面が刷っている数字と**構成上**一致する。
 * - main の 4 つの action とブラウザ版の枝は、どちらも {@link adviseService} を通す (判定と文面は 1 つ)。
 * - 受け取れない payload (無い・形が違う・0 件) は**断る**。何も無い所から提案を作らない (パス 65 の教訓)。
 * - しきい値 (低利回りと呼ぶ差・集中と呼ぶ比率) は `parameters.ts` の台帳に載せ、画面が
 *   `useParameters()` で読んで payload の `thresholds` に載せる。既定はこのモジュールの定数。
 * - 提案は AI ではない —— `phase: 'rules'`。`basis` に「何件・どの数字から組んだか」を書き、
 *   同梱の見本が混じるときはその件数を言う。
 *
 * ## 書かないこと
 *
 * 受け取った側 (利用者) がどう判断するかは書かない。免責は「規則で組み立てた参考情報」と言い切り、
 * 投資系は「投資助言ではありません」を残す (`main/clients/__tests__/*.test.ts` が片ごとに留めている)。
 */
import { countChars } from './inputCeiling';
import type { ServiceAdvisorResponse } from './advisorTypes';
import type { RecordEntryServiceId } from './recordEntryLimits';
import { jpy } from './formatters';
import { round1 } from './num';

// --- しきい値 (既定。台帳 `parameters.ts` が同じ定数を参照する) ----------------

/** 表面利回りが平均をこの差 (pt) 以上下回る物件を「低利回り」と名指しする。 */
export const ADVISOR_YIELD_GAP_PT = 1.0;
/** 1 銘柄の評価額比率 (0..1) がこの値以上なら「集中」と呼ぶ。 */
export const ADVISOR_CONCENTRATION_SHARE = 0.5;
/** 店舗別売上の最大 ÷ 最小 がこの倍率以上なら「ばらつき」と呼ぶ (画面が無いので台帳には載せない)。 */
export const ADVISOR_STORE_REVENUE_SPREAD_RATIO = 1.5;
/** 店舗の評価が平均をこの差以上下回る店舗を名指しする (同上)。 */
export const ADVISOR_RATING_GAP_PT = 0.2;
/** キャンセル率の比較基準 (0..1)。**出典なし・置き値** —— 自社の実績で置き換える物 (同上)。 */
export const ADVISOR_CANCELLATION_RATE_REF = 0.03;
/** 地域別の客単価の最高 ÷ 最低 がこの倍率以上なら「格差」と呼ぶ (同上)。 */
export const ADVISOR_AOV_SPREAD_RATIO = 1.2;

export interface AdvisorThresholds {
  readonly yieldGapPt: number;
  readonly concentrationShare: number;
}

export const DEFAULT_ADVISOR_THRESHOLDS: AdvisorThresholds = {
  yieldGapPt: ADVISOR_YIELD_GAP_PT,
  concentrationShare: ADVISOR_CONCENTRATION_SHARE,
};

// --- 安全上限 (台帳には載せない: 緩めても画面は何も変わらない) -------------------

/** 1 つの一覧 (物件・銘柄・店舗・地域) で受け取る行数の上限。 */
export const MAX_ADVICE_ROWS = 500;
/** 名前 (物件名・銘柄名・店舗名・地域名) の長さの上限 (入力欄の物件名と同じ 64)。 */
export const MAX_ADVICE_NAME_CHARS = 64;

// --- 入力の形 (画面 → action。IPC を越えるので JSON で表せる形だけ) -----------------

export type RealEstateAdviceProperty = {
  readonly name: string;
  readonly occupied: boolean;
  /** 家賃 (円/月・満室想定)。 */
  readonly monthlyRent: number;
  /** 表面利回り (%)。取得価格が読めない行は null (画面の「—」と同じ)。 */
  readonly grossYieldPct: number | null;
  /** 同梱の見本の行か (画面の「デモ」チップ)。 */
  readonly demo: boolean;
};

export type RealEstateAdviceInput = {
  readonly properties: readonly RealEstateAdviceProperty[];
  /** 月次キャッシュフロー (円)。画面のタイルと同じ値。 */
  readonly netCashflow: number;
  /** 表面利回りの平均 (%)。測れた物件が無ければ null。画面のタイルと同じ値。 */
  readonly portfolioYieldPct: number | null;
  /** 入居率 (0..1)。物件 0 件は null。画面のタイルと同じ値。 */
  readonly occupancyRate: number | null;
  readonly thresholds?: AdvisorThresholds;
};

export type MutualFundsAdviceHolding = {
  readonly name: string;
  /** 評価額 (円)。 */
  readonly valuation: number;
  /** 年初来リターン (%)。未入力なら null。 */
  readonly ytdReturnPct: number | null;
  readonly demo: boolean;
};

export type MutualFundsAdviceInput = {
  readonly holdings: readonly MutualFundsAdviceHolding[];
  /** 評価額の合計 (円)。画面のタイルと同じ値。 */
  readonly totalValuation: number;
  /** 評価損益率 (%)。取得原価が読めなければ null。 */
  readonly unrealizedGainPct: number | null;
  readonly thresholds?: AdvisorThresholds;
};

export type UberEatsAdviceStore = {
  readonly name: string;
  readonly orders: number;
  readonly revenue: number;
  readonly rating: number;
};

export type UberEatsAdviceItem = {
  readonly name: string;
  readonly sold: number;
  readonly revenue: number;
};

export type UberEatsAdviceInput = {
  readonly stores: readonly UberEatsAdviceStore[];
  readonly topItems: readonly UberEatsAdviceItem[];
  /** 平均評価。読めなければ null。 */
  readonly avgRating: number | null;
};

export type DemaeCanAdviceArea = {
  readonly area: string;
  readonly orders: number;
  readonly revenue: number;
};

export type DemaeCanAdviceInput = {
  /** 月次の注文件数。 */
  readonly monthOrders: number;
  /** 月次キャンセル率 (0..1)。読めなければ null。 */
  readonly cancellationRate: number | null;
  readonly topAreas: readonly DemaeCanAdviceArea[];
  /** 「配達中」の注文件数。 */
  readonly deliveringOrders: number;
};

/** サービス id → 画面が渡す入力の形 (`ServiceActionPanel` が `adviseInput` の型に使う)。 */
export interface AdviceInputMap {
  readonly 'uber-eats': UberEatsAdviceInput;
  readonly 'demae-can': DemaeCanAdviceInput;
  readonly 'real-estate': RealEstateAdviceInput;
  readonly 'mutual-funds': MutualFundsAdviceInput;
}

export type AdviceInputFor<S extends RecordEntryServiceId> = AdviceInputMap[S];

// --- 免責 (文面は 1 か所) ------------------------------------------------------

export const FOOD_ADVISOR_DISCLAIMER =
  '本提案は画面の数字から規則で組み立てた参考情報であり、店舗運営上の助言ではありません。' +
  '実際の経営判断はオーナー・専門家の責任で行ってください。Phase 6 で実 LLM 推論を接続します。';

export const REAL_ESTATE_ADVISOR_DISCLAIMER =
  '本提案は画面の数字から規則で組み立てた教育目的の参考情報であり、投資助言ではありません。実際の投資判断は' +
  'ファイナンシャルアドバイザー・税理士・宅建士の確認を経てご自身の責任で行ってください。' +
  'Phase 6 で実 LLM 推論を接続します。';

export const MUTUAL_FUNDS_ADVISOR_DISCLAIMER =
  '本提案は画面の数字から規則で組み立てた教育目的の参考情報であり、投資助言ではありません。実際の投資判断は' +
  'ファイナンシャルアドバイザーの確認を経てご自身の責任で行ってください。' +
  'Phase 6 で実 LLM 推論を接続します。';

// --- 読み取り (判定は 1 か所。文面は `${serviceId}.advise: …` で始める) ------------

type Parsed<T> = { readonly ok: true; readonly value: T } | { readonly ok: false; readonly message: string };

function fail(message: string): Parsed<never> {
  return { ok: false, message };
}

function isObject(raw: unknown): raw is Record<string, unknown> {
  return typeof raw === 'object' && raw !== null && !Array.isArray(raw);
}

function finiteNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

/** 一覧。`min` 件以上・{@link MAX_ADVICE_ROWS} 件以下の配列だけ通す。 */
function readRows(raw: unknown, tag: string, field: string, min: number): Parsed<readonly unknown[]> {
  if (!Array.isArray(raw) || raw.length < min || raw.length > MAX_ADVICE_ROWS) {
    return fail(`${tag}: ${field} は配列 (${min}〜${MAX_ADVICE_ROWS} 件) で指定してください`);
  }
  return { ok: true, value: raw };
}

/** 名前。前後の空白を落として 1〜{@link MAX_ADVICE_NAME_CHARS} 字。 */
function readName(raw: unknown, tag: string, field: string): Parsed<string> {
  const name = typeof raw === 'string' ? raw.trim() : '';
  if (name.length === 0 || countChars(name) > MAX_ADVICE_NAME_CHARS) {
    return fail(`${tag}: ${field} は 1〜${MAX_ADVICE_NAME_CHARS} 文字で指定してください`);
  }
  return { ok: true, value: name };
}

function readFinite(raw: unknown, tag: string, field: string): Parsed<number> {
  if (!finiteNumber(raw)) return fail(`${tag}: ${field} は有限の数値で指定してください`);
  return { ok: true, value: raw };
}

/** 有限の数値か、未計測 (null / 省略)。それ以外は断る。 */
function readFiniteOrNull(raw: unknown, tag: string, field: string): Parsed<number | null> {
  if (raw === null || raw === undefined) return { ok: true, value: null };
  if (!finiteNumber(raw)) return fail(`${tag}: ${field} は有限の数値か null で指定してください`);
  return { ok: true, value: raw };
}

function readBool(raw: unknown, tag: string, field: string): Parsed<boolean> {
  if (typeof raw !== 'boolean') return fail(`${tag}: ${field} は真偽値で指定してください`);
  return { ok: true, value: raw };
}

function readRoot(raw: unknown, tag: string): Parsed<Record<string, unknown>> {
  if (!isObject(raw)) return fail(`${tag}: 提案の元になる数字 (画面の集計) が payload にありません`);
  return { ok: true, value: raw };
}

function readRow(raw: unknown, tag: string, field: string): Parsed<Record<string, unknown>> {
  if (!isObject(raw)) return fail(`${tag}: ${field} はオブジェクトで指定してください`);
  return { ok: true, value: raw };
}

/**
 * しきい値。省略は既定 (台帳を読まない呼び出し側のため)。書くなら正の有限数で、
 * 集中の比率は 0 より大きく 1 以下 (割合)。
 */
function readThresholds(raw: unknown, tag: string): Parsed<AdvisorThresholds> {
  if (raw === undefined) return { ok: true, value: DEFAULT_ADVISOR_THRESHOLDS };
  if (!isObject(raw)) return fail(`${tag}: thresholds はオブジェクトで指定してください`);
  const gap = raw['yieldGapPt'] === undefined ? ADVISOR_YIELD_GAP_PT : raw['yieldGapPt'];
  if (!finiteNumber(gap) || gap <= 0) return fail(`${tag}: thresholds.yieldGapPt は正の有限の数値で指定してください`);
  const share = raw['concentrationShare'] === undefined ? ADVISOR_CONCENTRATION_SHARE : raw['concentrationShare'];
  if (!finiteNumber(share) || share <= 0 || share > 1) {
    return fail(`${tag}: thresholds.concentrationShare は 0 より大きく 1 以下の数値で指定してください`);
  }
  return { ok: true, value: { yieldGapPt: gap, concentrationShare: share } };
}

export function parseRealEstateAdviceInput(raw: unknown): Parsed<RealEstateAdviceInput> {
  const tag = 'real-estate.advise';
  const root = readRoot(raw, tag);
  if (!root.ok) return root;
  const rows = readRows(root.value['properties'], tag, 'properties', 1);
  if (!rows.ok) return rows;
  const properties: RealEstateAdviceProperty[] = [];
  for (let i = 0; i < rows.value.length; i += 1) {
    const f = `properties[${i}]`;
    const row = readRow(rows.value[i], tag, f);
    if (!row.ok) return row;
    const name = readName(row.value['name'], tag, `${f}.name`);
    if (!name.ok) return name;
    const occupied = readBool(row.value['occupied'], tag, `${f}.occupied`);
    if (!occupied.ok) return occupied;
    const rent = readFinite(row.value['monthlyRent'], tag, `${f}.monthlyRent`);
    if (!rent.ok) return rent;
    const gross = readFiniteOrNull(row.value['grossYieldPct'], tag, `${f}.grossYieldPct`);
    if (!gross.ok) return gross;
    const demo = readBool(row.value['demo'], tag, `${f}.demo`);
    if (!demo.ok) return demo;
    properties.push({ name: name.value, occupied: occupied.value, monthlyRent: rent.value, grossYieldPct: gross.value, demo: demo.value });
  }
  const cf = readFinite(root.value['netCashflow'], tag, 'netCashflow');
  if (!cf.ok) return cf;
  const avg = readFiniteOrNull(root.value['portfolioYieldPct'], tag, 'portfolioYieldPct');
  if (!avg.ok) return avg;
  const occ = readFiniteOrNull(root.value['occupancyRate'], tag, 'occupancyRate');
  if (!occ.ok) return occ;
  const t = readThresholds(root.value['thresholds'], tag);
  if (!t.ok) return t;
  return {
    ok: true,
    value: { properties, netCashflow: cf.value, portfolioYieldPct: avg.value, occupancyRate: occ.value, thresholds: t.value },
  };
}

export function parseMutualFundsAdviceInput(raw: unknown): Parsed<MutualFundsAdviceInput> {
  const tag = 'mutual-funds.advise';
  const root = readRoot(raw, tag);
  if (!root.ok) return root;
  const rows = readRows(root.value['holdings'], tag, 'holdings', 1);
  if (!rows.ok) return rows;
  const holdings: MutualFundsAdviceHolding[] = [];
  for (let i = 0; i < rows.value.length; i += 1) {
    const f = `holdings[${i}]`;
    const row = readRow(rows.value[i], tag, f);
    if (!row.ok) return row;
    const name = readName(row.value['name'], tag, `${f}.name`);
    if (!name.ok) return name;
    const valuation = readFinite(row.value['valuation'], tag, `${f}.valuation`);
    if (!valuation.ok) return valuation;
    const ytd = readFiniteOrNull(row.value['ytdReturnPct'], tag, `${f}.ytdReturnPct`);
    if (!ytd.ok) return ytd;
    const demo = readBool(row.value['demo'], tag, `${f}.demo`);
    if (!demo.ok) return demo;
    holdings.push({ name: name.value, valuation: valuation.value, ytdReturnPct: ytd.value, demo: demo.value });
  }
  const total = readFinite(root.value['totalValuation'], tag, 'totalValuation');
  if (!total.ok) return total;
  const gain = readFiniteOrNull(root.value['unrealizedGainPct'], tag, 'unrealizedGainPct');
  if (!gain.ok) return gain;
  const t = readThresholds(root.value['thresholds'], tag);
  if (!t.ok) return t;
  return { ok: true, value: { holdings, totalValuation: total.value, unrealizedGainPct: gain.value, thresholds: t.value } };
}

export function parseUberEatsAdviceInput(raw: unknown): Parsed<UberEatsAdviceInput> {
  const tag = 'uber-eats.advise';
  const root = readRoot(raw, tag);
  if (!root.ok) return root;
  const storeRows = readRows(root.value['stores'], tag, 'stores', 1);
  if (!storeRows.ok) return storeRows;
  const stores: UberEatsAdviceStore[] = [];
  for (let i = 0; i < storeRows.value.length; i += 1) {
    const f = `stores[${i}]`;
    const row = readRow(storeRows.value[i], tag, f);
    if (!row.ok) return row;
    const name = readName(row.value['name'], tag, `${f}.name`);
    if (!name.ok) return name;
    const orders = readFinite(row.value['orders'], tag, `${f}.orders`);
    if (!orders.ok) return orders;
    const revenue = readFinite(row.value['revenue'], tag, `${f}.revenue`);
    if (!revenue.ok) return revenue;
    const rating = readFinite(row.value['rating'], tag, `${f}.rating`);
    if (!rating.ok) return rating;
    stores.push({ name: name.value, orders: orders.value, revenue: revenue.value, rating: rating.value });
  }
  const itemRows = readRows(root.value['topItems'], tag, 'topItems', 0);
  if (!itemRows.ok) return itemRows;
  const topItems: UberEatsAdviceItem[] = [];
  for (let i = 0; i < itemRows.value.length; i += 1) {
    const f = `topItems[${i}]`;
    const row = readRow(itemRows.value[i], tag, f);
    if (!row.ok) return row;
    const name = readName(row.value['name'], tag, `${f}.name`);
    if (!name.ok) return name;
    const sold = readFinite(row.value['sold'], tag, `${f}.sold`);
    if (!sold.ok) return sold;
    const revenue = readFinite(row.value['revenue'], tag, `${f}.revenue`);
    if (!revenue.ok) return revenue;
    topItems.push({ name: name.value, sold: sold.value, revenue: revenue.value });
  }
  const avg = readFiniteOrNull(root.value['avgRating'], tag, 'avgRating');
  if (!avg.ok) return avg;
  return { ok: true, value: { stores, topItems, avgRating: avg.value } };
}

export function parseDemaeCanAdviceInput(raw: unknown): Parsed<DemaeCanAdviceInput> {
  const tag = 'demae-can.advise';
  const root = readRoot(raw, tag);
  if (!root.ok) return root;
  const monthOrders = readFinite(root.value['monthOrders'], tag, 'monthOrders');
  if (!monthOrders.ok) return monthOrders;
  const cancel = readFiniteOrNull(root.value['cancellationRate'], tag, 'cancellationRate');
  if (!cancel.ok) return cancel;
  const areaRows = readRows(root.value['topAreas'], tag, 'topAreas', 0);
  if (!areaRows.ok) return areaRows;
  const topAreas: DemaeCanAdviceArea[] = [];
  for (let i = 0; i < areaRows.value.length; i += 1) {
    const f = `topAreas[${i}]`;
    const row = readRow(areaRows.value[i], tag, f);
    if (!row.ok) return row;
    const area = readName(row.value['area'], tag, `${f}.area`);
    if (!area.ok) return area;
    const orders = readFinite(row.value['orders'], tag, `${f}.orders`);
    if (!orders.ok) return orders;
    const revenue = readFinite(row.value['revenue'], tag, `${f}.revenue`);
    if (!revenue.ok) return revenue;
    topAreas.push({ area: area.value, orders: orders.value, revenue: revenue.value });
  }
  const delivering = readFinite(root.value['deliveringOrders'], tag, 'deliveringOrders');
  if (!delivering.ok) return delivering;
  return {
    ok: true,
    value: { monthOrders: monthOrders.value, cancellationRate: cancel.value, topAreas, deliveringOrders: delivering.value },
  };
}

// --- 文の部品 (数字の刷り方は画面のタイルと同じ桁) ---------------------------------

type Recommendation = { readonly title: string; readonly rationale: string };

/** `12.3%` (画面のタイル・表と同じ小数第 1 位)。 */
function pct1(n: number): string {
  return `${n.toFixed(1)}%`;
}

/** 割合 (0..1) を `39.3%` に。 */
function share1(ratio: number): string {
  return pct1(ratio * 100);
}

/** 未計測は「—」 (画面と同じ)。 */
function pct1OrDash(n: number | null): string {
  return n === null ? '—' : pct1(n);
}

/** 割合 (0..1) を `75%` に (入居率のタイルは小数を刷らない)。 */
function share0OrDash(ratio: number | null): string {
  return ratio === null ? '—' : `${(ratio * 100).toFixed(0)}%`;
}

function names(list: readonly string[]): string {
  return list.join('、');
}

/** 同梱の見本の件数を言う (混じっていなければ「すべて利用者の入力」)。 */
function demoNote(demo: number): string {
  return demo > 0 ? `同梱の見本 ${demo} 件を含む` : 'すべて利用者の入力';
}

/** 最初の最大 (同点は先に出た行)。 */
function maxBy<T>(rows: readonly T[], value: (row: T) => number): T | null {
  let best: T | null = null;
  let bestValue = Number.NEGATIVE_INFINITY;
  for (const row of rows) {
    const v = value(row);
    if (v > bestValue) {
      best = row;
      bestValue = v;
    }
  }
  return best;
}

/** 最初の最小 (同点は先に出た行)。 */
function minBy<T>(rows: readonly T[], value: (row: T) => number): T | null {
  let best: T | null = null;
  let bestValue = Number.POSITIVE_INFINITY;
  for (const row of rows) {
    const v = value(row);
    if (v < bestValue) {
      best = row;
      bestValue = v;
    }
  }
  return best;
}

function sum(values: readonly number[]): number {
  let total = 0;
  for (const v of values) total += v;
  return total;
}

// --- 規則 --------------------------------------------------------------------

export function adviseRealEstate(input: RealEstateAdviceInput): ServiceAdvisorResponse {
  const t = input.thresholds ?? DEFAULT_ADVISOR_THRESHOLDS;
  const props = input.properties;
  const demo = props.filter((p) => p.demo).length;
  const recommendations: Recommendation[] = [];

  // 1. 空室 —— 名指しする (見本の行も利用者の行も、画面に在る物はすべて)。
  const vacant = props.filter((p) => !p.occupied);
  if (vacant.length > 0) {
    const lost = sum(vacant.map((p) => p.monthlyRent));
    recommendations.push({
      title: `空室 ${vacant.length} 件の解消`,
      rationale:
        `空室: ${names(vacant.map((p) => `${p.name} (${jpy(p.monthlyRent)}/月)`))}。` +
        `満室になれば家賃収入は +${jpy(lost)}/月。賃料の市場比較と募集条件の見直しを検討してください。`,
    });
  } else {
    recommendations.push({
      title: '空室なし',
      rationale: `${props.length} 物件すべてが入居中です。現状維持のうえ、契約の更新時期と修繕計画を確認してください。`,
    });
  }

  // 2. 月次キャッシュフロー —— 画面のタイルの値をそのまま言う。
  if (input.netCashflow < 0) {
    recommendations.push({
      title: '月次キャッシュフローがマイナス',
      rationale: `月次 CF は ${jpy(input.netCashflow)} です。空室の解消、運営費用と返済条件の見直しを優先してください。`,
    });
  } else if (input.netCashflow === 0) {
    recommendations.push({
      title: '月次キャッシュフローがゼロ',
      rationale: '月次 CF は ¥0 です。家賃・費用・返済のいずれかが動けば赤字になります。',
    });
  } else {
    const occupied = props.filter((p) => p.occupied);
    const rentTotal = sum(occupied.map((p) => p.monthlyRent));
    const top = maxBy(occupied, (p) => p.monthlyRent);
    if (top !== null && rentTotal > 0) {
      recommendations.push({
        title: `キャッシュフローの主力: ${top.name}`,
        rationale:
          `月次 CF は ${jpy(input.netCashflow)}。家賃収入の最大は ${top.name} (${jpy(top.monthlyRent)}/月、家賃収入の ${share1(top.monthlyRent / rentTotal)})。` +
          'この物件の修繕積立と契約更新を優先してください。',
      });
    } else {
      recommendations.push({
        title: '月次キャッシュフローはプラス',
        rationale: `月次 CF は ${jpy(input.netCashflow)} ですが、家賃が読める入居中の物件がありません。家賃の入力を確認してください。`,
      });
    }
  }

  // 3. 利回り —— 平均 (画面のタイル) と最低の物件の差をしきい値で見る。
  const measured = props.filter((p) => p.grossYieldPct !== null);
  const unmeasured = props.length - measured.length;
  const unmeasuredNote = unmeasured > 0 ? `取得価格が読めない ${unmeasured} 件は比較から外しています。` : '';
  const lowest = minBy(measured, (p) => p.grossYieldPct as number);
  if (input.portfolioYieldPct === null || lowest === null || measured.length < 2) {
    recommendations.push({
      title: '利回りの比較は未算定',
      rationale: `表面利回りを測れた物件が ${measured.length} 件のため、平均との比較はしません。${unmeasuredNote}`,
    });
  } else {
    const low = lowest.grossYieldPct as number;
    const gap = round1(input.portfolioYieldPct - low);
    if (gap >= t.yieldGapPt) {
      recommendations.push({
        title: `低利回り物件の見直し: ${lowest.name}`,
        rationale:
          `表面利回り ${pct1(low)} は平均 ${pct1(input.portfolioYieldPct)} を ${gap.toFixed(1)} pt 下回ります (差のしきい値 ${t.yieldGapPt.toFixed(1)} pt)。` +
          `賃料改定か売却の検討対象です。${unmeasuredNote}`,
      });
    } else {
      recommendations.push({
        title: '利回りのばらつきは小さい',
        rationale:
          `最低は ${lowest.name} の ${pct1(low)} で、平均 ${pct1(input.portfolioYieldPct)} との差 ${gap.toFixed(1)} pt は` +
          `しきい値 ${t.yieldGapPt.toFixed(1)} pt 未満です。${unmeasuredNote}`,
      });
    }
  }

  return {
    recommendations,
    basis:
      `${props.length} 物件 (${demoNote(demo)})・月次 CF ${jpy(input.netCashflow)}・平均表面利回り ${pct1OrDash(input.portfolioYieldPct)}・` +
      `入居率 ${share0OrDash(input.occupancyRate)}`,
    disclaimer: REAL_ESTATE_ADVISOR_DISCLAIMER,
    notForRealMoney: true,
    phase: 'rules',
  };
}

export function adviseMutualFunds(input: MutualFundsAdviceInput): ServiceAdvisorResponse {
  const t = input.thresholds ?? DEFAULT_ADVISOR_THRESHOLDS;
  const rows = input.holdings;
  const demo = rows.filter((h) => h.demo).length;
  const recommendations: Recommendation[] = [];

  // 1. 集中 —— 最大の銘柄の評価額比率をしきい値で見る。
  const top = maxBy(rows, (h) => h.valuation);
  if (input.totalValuation <= 0 || top === null) {
    recommendations.push({
      title: '集中度は未算定',
      rationale: '評価額の合計が読めないため、銘柄の集中度は出しません。',
    });
  } else {
    const share = top.valuation / input.totalValuation;
    if (share >= t.concentrationShare) {
      recommendations.push({
        title: `集中リスク: ${top.name}`,
        rationale:
          `評価額 ${jpy(input.totalValuation)} のうち ${share1(share)} が ${top.name} に集中しています (しきい値 ${share1(t.concentrationShare)})。` +
          '値動きの相関が低い資産への分散を検討してください。',
      });
    } else {
      recommendations.push({
        title: '分散の状況',
        rationale: `最大の銘柄は ${top.name} で評価額の ${share1(share)} です (しきい値 ${share1(t.concentrationShare)} 未満)。`,
      });
    }
  }

  // 2. 年初来リターン —— 入力された銘柄だけで最高と最低を比べる。
  const withYtd = rows.filter((h) => h.ytdReturnPct !== null);
  const best = maxBy(withYtd, (h) => h.ytdReturnPct as number);
  const worst = minBy(withYtd, (h) => h.ytdReturnPct as number);
  if (best === null || worst === null) {
    recommendations.push({
      title: '年初来リターンは未入力',
      rationale: '年初来リターンが入力された銘柄が無いため、銘柄間の比較はしません。',
    });
  } else if (withYtd.length === 1) {
    recommendations.push({
      title: `年初来リターン: ${best.name}`,
      rationale: `${best.name} の年初来リターンは ${pct1(best.ytdReturnPct as number)} です (比較対象は他にありません)。`,
    });
  } else if ((worst.ytdReturnPct as number) < 0) {
    recommendations.push({
      title: `年初来マイナスの銘柄: ${worst.name}`,
      rationale:
        `${worst.name} は年初来 ${pct1(worst.ytdReturnPct as number)} です。最高は ${best.name} の ${pct1(best.ytdReturnPct as number)}。` +
        'マイナスの銘柄は保有目的を確認してください。',
    });
  } else {
    recommendations.push({
      title: `年初来の牽引役: ${best.name}`,
      rationale:
        `${best.name} が年初来 ${pct1(best.ytdReturnPct as number)} で最高、最低は ${worst.name} の ${pct1(worst.ytdReturnPct as number)} です。` +
        'すべてプラスです。',
    });
  }

  // 3. 評価損益率 —— 画面のタイルの値。取得原価が読めなければ言わない。
  if (input.unrealizedGainPct === null) {
    recommendations.push({
      title: '評価損益率は未算定',
      rationale: '取得原価が読めないため、評価損益率は出しません。',
    });
  } else if (input.unrealizedGainPct < 0) {
    recommendations.push({
      title: `含み損 ${pct1(-input.unrealizedGainPct)}`,
      rationale: `評価損益率は ${pct1(input.unrealizedGainPct)} です。取得原価と保有目的を確認し、損失の許容範囲を決めてください。`,
    });
  } else {
    recommendations.push({
      title: `含み益 ${pct1(input.unrealizedGainPct)}`,
      rationale: `評価損益率は ${pct1(input.unrealizedGainPct)} です。利益確定の基準と積立の継続を確認してください。`,
    });
  }

  return {
    recommendations,
    basis: `${rows.length} 銘柄 (${demoNote(demo)})・評価額 ${jpy(input.totalValuation)}・評価損益率 ${pct1OrDash(input.unrealizedGainPct)}`,
    disclaimer: MUTUAL_FUNDS_ADVISOR_DISCLAIMER,
    notForRealMoney: true,
    phase: 'rules',
  };
}

export function adviseUberEats(input: UberEatsAdviceInput): ServiceAdvisorResponse {
  const stores = input.stores;
  const recommendations: Recommendation[] = [];

  // 1. 店舗別売上のばらつき —— 最大 ÷ 最小。
  const top = maxBy(stores, (s) => s.revenue);
  const bottom = minBy(stores, (s) => s.revenue);
  if (top === null || bottom === null) {
    // 読み取りが 1 店舗以上を保証するので来ない。来たら「未算定」で断る (作り話をしない)。
    recommendations.push({ title: '店舗別売上の比較は未算定', rationale: '店舗が読めないため、店舗間の倍率は出しません。' });
  } else if (bottom.revenue <= 0) {
    recommendations.push({
      title: '店舗別売上の比較は未算定',
      rationale: `売上が 0 の店舗 (${bottom.name}) があるため、店舗間の倍率は出しません。`,
    });
  } else {
    const ratio = round1(top.revenue / bottom.revenue);
    if (ratio >= ADVISOR_STORE_REVENUE_SPREAD_RATIO) {
      recommendations.push({
        title: '店舗別売上の平準化',
        rationale:
          `売上の最大は ${top.name} (${jpy(top.revenue)})、最小は ${bottom.name} (${jpy(bottom.revenue)}) で ${ratio.toFixed(1)} 倍の開きがあります` +
          ` (しきい値 ${ADVISOR_STORE_REVENUE_SPREAD_RATIO.toFixed(1)} 倍)。上位店舗の運用を他店舗へ展開してください。`,
      });
    } else {
      recommendations.push({
        title: '店舗間の売上差は小さい',
        rationale:
          `最大 ${top.name} (${jpy(top.revenue)}) と最小 ${bottom.name} (${jpy(bottom.revenue)}) の差は ${ratio.toFixed(1)} 倍で、` +
          `しきい値 ${ADVISOR_STORE_REVENUE_SPREAD_RATIO.toFixed(1)} 倍未満です。`,
      });
    }
  }

  // 2. 評価 —— 平均 (画面の値) を最も下回る店舗。
  const lowest = minBy(stores, (s) => s.rating);
  if (input.avgRating === null || lowest === null) {
    recommendations.push({
      title: '評価の比較は未算定',
      rationale: '平均評価が読めないため、店舗ごとの評価の比較はしません。',
    });
  } else {
    const gap = round1(input.avgRating - lowest.rating);
    if (gap >= ADVISOR_RATING_GAP_PT) {
      recommendations.push({
        title: `評価の底上げ: ${lowest.name}`,
        rationale:
          `${lowest.name} の評価 ${lowest.rating.toFixed(1)} は平均 ${input.avgRating.toFixed(1)} を ${gap.toFixed(1)} pt 下回ります` +
          ` (しきい値 ${ADVISOR_RATING_GAP_PT.toFixed(1)} pt)。配達時間と包装の改善を優先してください。`,
      });
    } else {
      recommendations.push({
        title: '評価は横並び',
        rationale:
          `最低は ${lowest.name} の ${lowest.rating.toFixed(1)} で、平均 ${input.avgRating.toFixed(1)} との差 ${gap.toFixed(1)} pt は` +
          `しきい値 ${ADVISOR_RATING_GAP_PT.toFixed(1)} pt 未満です。`,
      });
    }
  }

  // 3. 人気メニュー —— 最多販売の品。
  const item = maxBy(input.topItems, (i) => i.sold);
  if (item === null) {
    recommendations.push({
      title: '人気メニューは未入力',
      rationale: 'メニュー別の販売数が無いため、横展開の候補は挙げません。',
    });
  } else {
    recommendations.push({
      title: `人気メニューの横展開: ${item.name}`,
      rationale: `${item.name} は ${item.sold} 食 (${jpy(item.revenue)}) で最多です。全店舗で前面に出してください。`,
    });
  }

  return {
    recommendations,
    basis: `${stores.length} 店舗・メニュー ${input.topItems.length} 品・平均評価 ${input.avgRating === null ? '—' : input.avgRating.toFixed(1)}`,
    disclaimer: FOOD_ADVISOR_DISCLAIMER,
    notForRealMoney: true,
    phase: 'rules',
  };
}

export function adviseDemaeCan(input: DemaeCanAdviceInput): ServiceAdvisorResponse {
  const recommendations: Recommendation[] = [];

  // 1. キャンセル率 —— 置き値の基準と比べる (基準は出典なしと言う)。
  if (input.cancellationRate === null) {
    recommendations.push({
      title: 'キャンセル率は未入力',
      rationale: '月次キャンセル率が読めないため、基準との比較はしません。',
    });
  } else {
    const rate = share1(input.cancellationRate);
    const ref = share1(ADVISOR_CANCELLATION_RATE_REF);
    if (input.cancellationRate > ADVISOR_CANCELLATION_RATE_REF) {
      recommendations.push({
        title: `キャンセル率 ${rate} の改善`,
        rationale: `月次キャンセル率 ${rate} は基準 ${ref} (出典なし・置き値) を上回ります。受付から調理開始までの確認と、在庫切れ時の即時反映を見直してください。`,
      });
    } else {
      recommendations.push({
        title: `キャンセル率 ${rate} の維持`,
        rationale: `月次キャンセル率 ${rate} は基準 ${ref} (出典なし・置き値) 以下です。継続観測してください。`,
      });
    }
  }

  // 2. 客単価の地域格差 —— 注文のある地域だけで最高と最低。
  const withOrders = input.topAreas.filter((a) => a.orders > 0);
  const aov = (a: DemaeCanAdviceArea): number => a.revenue / a.orders;
  const high = maxBy(withOrders, aov);
  const low = minBy(withOrders, aov);
  if (high === null || low === null || withOrders.length < 2) {
    recommendations.push({
      title: '客単価の地域比較は未算定',
      rationale: `注文のある地域が ${withOrders.length} か所のため、地域間の客単価は比べません。`,
    });
  } else {
    const ratio = round1(aov(high) / aov(low));
    const figures = `客単価は最高 ${high.area} ${jpy(Math.round(aov(high)))} / 最低 ${low.area} ${jpy(Math.round(aov(low)))}`;
    if (ratio >= ADVISOR_AOV_SPREAD_RATIO) {
      recommendations.push({
        title: `客単価の地域格差: ${high.area} と ${low.area}`,
        rationale:
          `${figures} で ${ratio.toFixed(1)} 倍の開きがあります (しきい値 ${ADVISOR_AOV_SPREAD_RATIO.toFixed(1)} 倍)。` +
          `${high.area} の高単価メニューを ${low.area} でも展開してください。`,
      });
    } else {
      recommendations.push({
        title: '客単価は地域間で均一',
        rationale: `${figures} で、差は ${ratio.toFixed(1)} 倍 (しきい値 ${ADVISOR_AOV_SPREAD_RATIO.toFixed(1)} 倍未満) です。`,
      });
    }
  }

  // 3. 配達中の注文 —— 件数をそのまま言う。
  if (input.deliveringOrders > 0) {
    recommendations.push({
      title: `配達中 ${input.deliveringOrders} 件の監視`,
      rationale: `配達中の注文が ${input.deliveringOrders} 件あります。最優先で監視し、遅延を未然に防いでください。`,
    });
  } else {
    recommendations.push({
      title: '配達中の注文なし',
      rationale: '配達中の注文はありません。',
    });
  }

  return {
    recommendations,
    basis: `月次 ${input.monthOrders} 件・地域 ${input.topAreas.length} か所・配達中 ${input.deliveringOrders} 件`,
    disclaimer: FOOD_ADVISOR_DISCLAIMER,
    notForRealMoney: true,
    phase: 'rules',
  };
}

// --- 入口 (main の 4 action とブラウザ版の枝が通る 1 つ) ----------------------------

export type AdviceOutcome =
  | { readonly ok: true; readonly data: ServiceAdvisorResponse }
  | { readonly ok: false; readonly message: string };

/**
 * サービス id と生の payload から提案を組む。読めない payload は `{ ok: false, message }`
 * (main は throw に、ブラウザ版は `action_failed` に変える —— 文面は同じ)。
 */
export function adviseService(serviceId: RecordEntryServiceId, raw: unknown): AdviceOutcome {
  switch (serviceId) {
    case 'real-estate': {
      const p = parseRealEstateAdviceInput(raw);
      return p.ok ? { ok: true, data: adviseRealEstate(p.value) } : p;
    }
    case 'mutual-funds': {
      const p = parseMutualFundsAdviceInput(raw);
      return p.ok ? { ok: true, data: adviseMutualFunds(p.value) } : p;
    }
    case 'uber-eats': {
      const p = parseUberEatsAdviceInput(raw);
      return p.ok ? { ok: true, data: adviseUberEats(p.value) } : p;
    }
    case 'demae-can': {
      const p = parseDemaeCanAdviceInput(raw);
      return p.ok ? { ok: true, data: adviseDemaeCan(p.value) } : p;
    }
    // Stryker disable next-line all: 網羅性検査の到達不能 default (型で 4 つを処理済み)。
    default: {
      const exhaustive: never = serviceId;
      return exhaustive;
    }
  }
}
