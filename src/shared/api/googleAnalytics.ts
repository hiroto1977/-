/**
 * グーグルアナリティクス (Google Analytics 4) —— 訪問者数と流入元を読む。**読み取りだけ** (2026-11-22)。
 *
 * 判定と正規化はここに 1 つ置き、デスクトップ版 (`main/clients/google-analytics.ts`) と
 * ブラウザ版 (`renderer/network/liveRead` の取得・`web-shim.ts` の `run-report`) の両方が同じ関数を通る。
 * このモジュール自体は網に触れない —— 通信手段は呼び出し側が渡す (検査でも実物と同じ経路を通せる)。
 *
 * ## 何を読むか
 *
 * | 照会 | 何のため | 使う欄 |
 * | --- | --- | --- |
 * | `GET analyticsadmin…/v1beta/accountSummaries` | 見られるプロパティの一覧 (取得 = `fetchSnapshot`) | `accountSummaries[].displayName`・`propertySummaries[].property` / `displayName` |
 * | `POST analyticsdata…/v1beta/properties/{id}:runReport` (日付 × アクティブユーザー) | 訪問者数 (日ごと + 期間の合計) | `rows[].dimensionValues[0]`・`metricValues[0]`・`totals[0]` |
 * | `POST analyticsdata…/v1beta/properties/{id}:runReport` (流入元のチャネル × セッション・アクティブユーザー) | どこから来たか | 同上 |
 *
 * 書き込み (設定の変更・プロパティの作成ほか) は 1 つも持たない。OAuth の権限は
 * `analytics.readonly` だけで足りる (`main/oauth.ts` の登録がそれだけを求める)。
 *
 * ## 読めなかった物は 0 にしない
 *
 * GA4 の数は **10 進の文字列**で来る (`"123"`)。`apiNumberOf` で読み、読めなければ `null` で持って
 * 画面が「不明」と述べる (`0` と刷ると「訪問者 0 人」という事実の主張になる · 法則 `blank-states-its-reason`)。
 * 表そのもの (`rows`) が読めなかったときは `…Read: false` で返し、「0 件」と「読めなかった」を言い分ける。
 *
 * ★ **期間の合計の訪問者数は、日ごとの数を足して作らない。** 同じ人が 2 日来れば日ごとには 2 回数えられるが、
 * 期間では 1 人である (アクティブユーザーは足し算できない)。合計は GA4 が返す `totals` (`metricAggregations: TOTAL`)
 * だけを読み、読めなければ「不明」と述べる。セッションは 1 回の訪問が 1 つのチャネルにだけ属するので足せる ——
 * 流入元の割合の分母は `totals` を優先し、読めなければ**全行が読めたときだけ**行の和を使う。
 *
 * ## プロパティ ID
 *
 * 数字だけ (`^[0-9]{1,15}$`)。管理画面から写すと `properties/123456789` の形で貼られることがあるので、
 * その接頭辞だけは外して受ける。道へ入れるときは形を確かめたうえで `pathSegment` (= `encodeURIComponent` + `.` / `..` を断る) も通す
 * (形の判定が緩んでも、道の区切りや `?` で照会を書き換えられないように)。
 */
import { apiNumberOf, displayField, objectRows, readArrayField } from '../apiResponse';
import { isCalendarDate } from '../isoDate';
import { pathSegment } from './pathSegment';

/** GA4 Data API の基底 (レポートの照会)。送り先はこの定数だけで、利用者の入力からは作らない。 */
export const GA_DATA_API_BASE = 'https://analyticsdata.googleapis.com';

/** GA4 Admin API の基底 (プロパティの一覧)。 */
export const GA_ADMIN_API_BASE = 'https://analyticsadmin.googleapis.com';

/** プロパティの一覧の道 (1 回の照会で読む上限 200 件)。 */
export const GA_ACCOUNT_SUMMARIES_PATH = '/v1beta/accountSummaries?pageSize=200';

/** 選べる期間 (日)。画面の選択肢と `run-report` の受け付けは同じこの 3 つだけ。 */
export const GA_PERIOD_DAYS = [7, 28, 90] as const;
export type GaPeriodDays = (typeof GA_PERIOD_DAYS)[number];

/** 既定の期間 (日)。 */
export const GA_DEFAULT_PERIOD_DAYS: GaPeriodDays = 28;

/** プロパティ ID の形 (数字だけ・15 桁まで)。 */
export const GA_PROPERTY_ID_RE = /^[0-9]{1,15}$/;

/** 管理画面から写したときに付いてくる接頭辞。 */
const PROPERTY_PREFIX = 'properties/';

/**
 * 利用者が打った / 保存したプロパティ ID を読む。読めなければ `null`。
 * 前後の空白と `properties/` の接頭辞は外す。それ以外の字が 1 つでもあれば断る。
 */
export function gaPropertyIdOrNull(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  let s = v.trim();
  if (s.startsWith(PROPERTY_PREFIX)) s = s.slice(PROPERTY_PREFIX.length);
  return GA_PROPERTY_ID_RE.test(s) ? s : null;
}

/** 期間 (日) を読む。選択肢の 3 つ以外は `null`。 */
export function gaPeriodOrNull(v: unknown): GaPeriodDays | null {
  for (const d of GA_PERIOD_DAYS) {
    if (v === d) return d;
  }
  return null;
}

/** プロパティ ID が読めないときの断り (画面とハンドラが同じ文を出す)。 */
export const GA_PROPERTY_ID_REFUSAL =
  'プロパティ ID は数字だけで入力してください (例: 123456789)。グーグルアナリティクス (Google Analytics) の管理画面の「プロパティの詳細」に出ています。';

/** 期間が選択肢の外のときの断り。 */
export const GA_PERIOD_REFUSAL = '期間は 7 日・28 日・90 日のどれかを選んでください。';

/** レポートの照会の道。 */
export function gaRunReportPath(propertyId: string): string {
  return `/v1beta/properties/${pathSegment(propertyId)}:runReport`;
}

/** 共通のヘッダ。 */
export function gaHeaders(token: string): Record<string, string> {
  return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
}

/** プロパティの一覧の要求。 */
export function gaAccountSummariesRequestInit(token: string): RequestInit {
  return { method: 'GET', headers: { Authorization: `Bearer ${token}` } };
}

/** 期間の指定 (今日を含む直近 N 日)。 */
function dateRanges(days: GaPeriodDays): readonly { startDate: string; endDate: string }[] {
  return [{ startDate: `${days - 1}daysAgo`, endDate: 'today' }];
}

/** 日ごとの訪問者数の照会の要求。本文は固定の照会だけを持つ (利用者の入力は期間の 3 択だけ)。 */
export function gaDailyUsersRequestInit(token: string, days: GaPeriodDays): RequestInit {
  return {
    method: 'POST',
    headers: gaHeaders(token),
    body: JSON.stringify({
      dateRanges: dateRanges(days),
      dimensions: [{ name: 'date' }],
      metrics: [{ name: 'activeUsers' }],
      metricAggregations: ['TOTAL'],
      orderBys: [{ dimension: { dimensionName: 'date' } }],
      limit: 100,
    }),
  };
}

/** 流入元のチャネルの照会の要求。 */
export function gaChannelsRequestInit(token: string, days: GaPeriodDays): RequestInit {
  return {
    method: 'POST',
    headers: gaHeaders(token),
    body: JSON.stringify({
      dateRanges: dateRanges(days),
      dimensions: [{ name: 'sessionDefaultChannelGroup' }],
      metrics: [{ name: 'sessions' }, { name: 'activeUsers' }],
      metricAggregations: ['TOTAL'],
      orderBys: [{ metric: { metricName: 'sessions' }, desc: true }],
      limit: 50,
    }),
  };
}

// --- 形 ---------------------------------------------------------------------

/** 見られるプロパティ 1 件。 */
export interface GaProperty {
  /** 数字だけの ID。読めない行は一覧に入れない。 */
  readonly id: string;
  readonly name: string;
  readonly account: string;
}

/** 日ごとの訪問者数 1 点。 */
export interface GaDailyPoint {
  /** `YYYY-MM-DD`。読めなければ `null`。 */
  readonly date: string | null;
  /** アクティブユーザー数。読めなければ `null`。 */
  readonly users: number | null;
}

/** 流入元のチャネル 1 行。 */
export interface GaChannelRow {
  /** GA4 が返したチャネル名 (英語・天井つき)。 */
  readonly english: string;
  /** 日本語の名前。知らないチャネルは「その他の分類」。 */
  readonly label: string;
  readonly sessions: number | null;
  readonly users: number | null;
  /** セッション全体に対する割合 (%・小数 1 桁)。分母か分子が読めなければ `null`。 */
  readonly sharePct: number | null;
}

/** 1 つのプロパティ・1 つの期間のレポート。 */
export interface GaReport {
  readonly propertyId: string;
  readonly days: GaPeriodDays;
  /** 期間の訪問者数 (アクティブユーザーの合計)。読めなければ `null` (日ごとの数を足して作らない)。 */
  readonly totalUsers: number | null;
  readonly daily: readonly GaDailyPoint[];
  /** 日ごとの表を読めたか (`rows` が配列だった。0 行は読めたうえでの 0 件)。 */
  readonly dailyRead: boolean;
  /** 期間のセッションの合計。読めなければ `null`。 */
  readonly totalSessions: number | null;
  readonly channels: readonly GaChannelRow[];
  /** 流入元の表を読めたか。 */
  readonly channelsRead: boolean;
}

/** 取得 (`fetchSnapshot`) が返す形。レポートは選んだプロパティと期間で `run-report` が読む。 */
export interface GoogleAnalyticsSnapshot {
  readonly properties: readonly GaProperty[];
  /** 一覧を読めたか (`accountSummaries` が配列だった。0 件は読めたうえでの 0 件)。 */
  readonly propertiesRead: boolean;
  /** 同梱の見本だけが持つレポート。実データの取得では常に `null`。 */
  readonly report: GaReport | null;
}

// --- チャネルの名前 -------------------------------------------------------

/**
 * GA4 の既定のチャネルグループ (Default channel group) → 日本語の名前。
 * 英語は画面が後ろのかっこに添える (「自然検索 (Organic Search)」)。
 */
export const GA_CHANNEL_LABELS: Readonly<Record<string, string>> = {
  'Organic Search': '自然検索',
  'Paid Search': '有料検索',
  'Organic Social': 'ソーシャル',
  'Paid Social': '有料ソーシャル',
  Direct: '直接',
  Referral: '他のサイトからのリンク',
  Email: 'メール',
  Affiliates: 'アフィリエイト',
  Display: 'ディスプレイ広告',
  'Organic Video': '動画',
  'Paid Video': '有料動画',
  'Organic Shopping': 'ショッピング',
  'Paid Shopping': '有料ショッピング',
  'Paid Other': 'その他の有料',
  'Cross-network': '複数の広告網',
  SMS: 'ショートメッセージ',
  'Mobile Push Notifications': 'プッシュ通知',
  Audio: '音声広告',
  Unassigned: '未分類',
};

/** 表に無いチャネルの日本語の名前。英語の名前は後ろのかっこに残る。 */
export const GA_CHANNEL_OTHER_LABEL = 'その他の分類';

/** チャネル名 → 日本語の名前 (自分の属性だけで引く —— `constructor` などの鍵を表から拾わない)。 */
export function gaChannelLabel(english: string): string {
  return Object.hasOwn(GA_CHANNEL_LABELS, english) ? (GA_CHANNEL_LABELS[english] as string) : GA_CHANNEL_OTHER_LABEL;
}

// --- 正規化 ---------------------------------------------------------------

/** 行の `dimensionValues` / `metricValues` の i 番目の `value` (読めなければ undefined)。 */
function cellValue(row: Record<string, unknown>, field: 'dimensionValues' | 'metricValues', i: number): unknown {
  const cells = objectRows<Record<string, unknown>>(row[field]);
  const cell = cells[i];
  return cell === undefined ? undefined : cell.value;
}

/** `totals[0]` の i 番目の数。読めなければ `null`。 */
function totalOf(body: unknown, i: number): number | null {
  const totals = objectRows<Record<string, unknown>>(readArrayField(body, 'totals').rows);
  const first = totals[0];
  return first === undefined ? null : apiNumberOf(cellValue(first, 'metricValues', i));
}

/**
 * 表を読めたか。`rows` が配列なら読めた。
 *
 * ★ GA4 は**データが 1 件も無い期間では `rows` そのものを省く** (0 行の配列ではなく欄が無い)。
 * そのときも見出し (`dimensionHeaders`) は配列で返るので、それが在れば「0 件と読めた」とする。
 * どちらも無い応答 (`{}`・`null`・別の形) は「読めなかった」—— 0 件と混ぜない。
 */
function tableRead(body: unknown): boolean {
  if (readArrayField(body, 'rows').read) return true;
  return readArrayField(body, 'dimensionHeaders').read;
}

/** GA4 の日付 (`YYYYMMDD`) → `YYYY-MM-DD`。暦に無い日付・形の違う値は `null`。 */
export function gaDateOf(v: unknown): string | null {
  if (typeof v !== 'string' || !/^\d{8}$/.test(v)) return null;
  const iso = `${v.slice(0, 4)}-${v.slice(4, 6)}-${v.slice(6, 8)}`;
  return isCalendarDate(iso) ? iso : null;
}

/** プロパティの一覧の応答を正規化する。形の読めない行 (数字の ID が取れない) は落とす。 */
export function normalizeGaAccountSummaries(body: unknown): {
  readonly properties: readonly GaProperty[];
  readonly read: boolean;
} {
  const accounts = readArrayField(body, 'accountSummaries');
  const properties: GaProperty[] = [];
  for (const acc of objectRows<Record<string, unknown>>(accounts.rows)) {
    const account = displayField(acc.displayName);
    for (const p of objectRows<Record<string, unknown>>(acc.propertySummaries)) {
      const id = gaPropertyIdOrNull(p.property);
      if (id === null) continue;
      properties.push({ id, name: displayField(p.displayName), account });
    }
  }
  return { properties, read: accounts.read };
}

/** 日ごとの訪問者数の応答を正規化する。 */
export function normalizeGaDailyUsers(body: unknown): {
  readonly daily: readonly GaDailyPoint[];
  readonly read: boolean;
  readonly totalUsers: number | null;
} {
  const rows = readArrayField(body, 'rows');
  const daily = objectRows<Record<string, unknown>>(rows.rows).map((row) => ({
    date: gaDateOf(cellValue(row, 'dimensionValues', 0)),
    users: apiNumberOf(cellValue(row, 'metricValues', 0)),
  }));
  return { daily, read: tableRead(body), totalUsers: totalOf(body, 0) };
}

/** 割合 (%・小数 1 桁)。分母が読めない / 0 以下なら `null`。 */
function shareOf(part: number | null, whole: number | null): number | null {
  if (part === null || whole === null || whole <= 0) return null;
  return Math.round((part / whole) * 1000) / 10;
}

/** 流入元のチャネルの応答を正規化する。 */
export function normalizeGaChannels(body: unknown): {
  readonly channels: readonly GaChannelRow[];
  readonly read: boolean;
  readonly totalSessions: number | null;
} {
  const rows = readArrayField(body, 'rows');
  const raw = objectRows<Record<string, unknown>>(rows.rows).map((row) => {
    const english = displayField(cellValue(row, 'dimensionValues', 0), 64);
    return {
      english,
      label: gaChannelLabel(english),
      sessions: apiNumberOf(cellValue(row, 'metricValues', 0)),
      users: apiNumberOf(cellValue(row, 'metricValues', 1)),
    };
  });
  let totalSessions = totalOf(body, 0);
  if (totalSessions === null && raw.length > 0 && raw.every((r) => r.sessions !== null)) {
    // セッションは 1 回の訪問が 1 つのチャネルにだけ属するので足せる (全行が読めたときだけ)。
    totalSessions = raw.reduce((sum, r) => sum + (r.sessions as number), 0);
  }
  return {
    channels: raw.map((r) => ({ ...r, sharePct: shareOf(r.sessions, totalSessions) })),
    read: tableRead(body),
    totalSessions,
  };
}

/** 2 つの応答からレポートを組む。 */
export function buildGaReport(
  propertyId: string,
  days: GaPeriodDays,
  dailyBody: unknown,
  channelsBody: unknown,
): GaReport {
  const daily = normalizeGaDailyUsers(dailyBody);
  const channels = normalizeGaChannels(channelsBody);
  return {
    propertyId,
    days,
    totalUsers: daily.totalUsers,
    daily: daily.daily,
    dailyRead: daily.read,
    totalSessions: channels.totalSessions,
    channels: channels.channels,
    channelsRead: channels.read,
  };
}

// --- 表示 -----------------------------------------------------------------

/** 読めない数の表示。0 と刷らない。 */
export const GA_UNKNOWN_TEXT = '不明';

/** 人数・回数の表示 (桁区切り)。読めなければ「不明」。 */
export function gaCountText(n: number | null): string {
  return n === null ? GA_UNKNOWN_TEXT : n.toLocaleString('ja-JP');
}

/** 割合の表示。読めなければ「不明」。 */
export function gaShareText(pct: number | null): string {
  return pct === null ? GA_UNKNOWN_TEXT : `${pct}%`;
}

/** チャネルの表示名 (「自然検索 (Organic Search)」)。英語が読めなければ日本語だけ。 */
export function gaChannelName(row: Pick<GaChannelRow, 'label' | 'english'>): string {
  return row.english === '' ? row.label : `${row.label} (${row.english})`;
}

/**
 * 読めなかった表を名指しする 1 文。全部読めていれば `null`。
 * 「0 件」と「読めなかった」を混ぜない。
 */
export function gaReportIntakeNote(report: Pick<GaReport, 'dailyRead' | 'channelsRead'>): string | null {
  const missing: string[] = [];
  if (!report.dailyRead) missing.push('日ごとの訪問者数');
  if (!report.channelsRead) missing.push('流入元');
  if (missing.length === 0) return null;
  return `グーグルアナリティクス (Google Analytics) の応答から${missing.join('と')}を読み取れませんでした (0 件という意味ではありません)。`;
}

// --- 通信 -----------------------------------------------------------------

/**
 * 通信手段。URL と `RequestInit` を受け取り、**JSON として読めた本体**を返す。
 * デスクトップ版は Node の fetch を、ブラウザ版は利用者のプロキシ経由の fetch を渡す。
 */
export type GaJsonFetch = (url: string, init: RequestInit) => Promise<unknown>;

/** 見られるプロパティの一覧を取得する (`fetchSnapshot`)。**通信手段は呼び出し側が渡す。** */
export async function fetchGoogleAnalyticsSnapshotWith(
  jsonFetch: GaJsonFetch,
  token: string,
): Promise<GoogleAnalyticsSnapshot> {
  const body = await jsonFetch(`${GA_ADMIN_API_BASE}${GA_ACCOUNT_SUMMARIES_PATH}`, gaAccountSummariesRequestInit(token));
  const list = normalizeGaAccountSummaries(body);
  return { properties: list.properties, propertiesRead: list.read, report: null };
}

/** `run-report` の payload の判定。読めなければ断りの文で投げる。 */
export function checkGaReportRequest(payload: Record<string, unknown>): {
  readonly propertyId: string;
  readonly days: GaPeriodDays;
} {
  const propertyId = gaPropertyIdOrNull(payload.propertyId);
  if (propertyId === null) throw new Error(GA_PROPERTY_ID_REFUSAL);
  const days = gaPeriodOrNull(payload.days);
  if (days === null) throw new Error(GA_PERIOD_REFUSAL);
  return { propertyId, days };
}

/** 選んだプロパティ・期間のレポートを取得する (`run-report`)。**通信手段は呼び出し側が渡す。** */
export async function fetchGoogleAnalyticsReportWith(
  jsonFetch: GaJsonFetch,
  token: string,
  propertyId: string,
  days: GaPeriodDays,
): Promise<GaReport> {
  // 宛先は呼び出しの中に書く (`verify:arch` の送り先の走査は送る呼び出しの行とその直前しか見ない)。
  const dailyBody = await jsonFetch(`${GA_DATA_API_BASE}${gaRunReportPath(propertyId)}`, gaDailyUsersRequestInit(token, days));
  const channelsBody = await jsonFetch(`${GA_DATA_API_BASE}${gaRunReportPath(propertyId)}`, gaChannelsRequestInit(token, days));
  return buildGaReport(propertyId, days, dailyBody, channelsBody);
}
