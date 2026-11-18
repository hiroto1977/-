/**
 * Stripe (カード決済) —— 残高と最近の入金を読む。**読み取りだけ** (2026-11-18)。
 *
 * 判定と正規化はここに 1 つ置き、デスクトップ版 (`main/clients/stripe.ts`) とブラウザ版
 * (`renderer/network/liveRead`) の両方が同じ関数を通る。このモジュール自体は網に触れない ——
 * 通信手段は呼び出し側が渡す (検査でも実物と同じ経路を通せる)。
 *
 * ## 何を読むか
 *
 * | 照会 | 使う欄 |
 * | --- | --- |
 * | `GET /v1/balance` | `available[]` / `pending[]` の `amount`・`currency`、`livemode` |
 * | `GET /v1/charges?limit=10` | `data[]` の `id`・`amount`・`currency`・`status`・`refunded`・`created`・`description` |
 *
 * 書き込み (返金・請求の作成ほか) は 1 つも持たない。鍵は**読み取り専用の制限付きキー**
 * (残高と支払いの読み取りだけを許した物) で足りる —— 画面がそう案内する。
 *
 * ## 金額の単位
 *
 * Stripe の `amount` は**通貨の最小単位**の整数である。円 (JPY) は 1 = 1 円だが、
 * ドル (USD) は 1 = 1 セントなので、そのまま刷ると 100 倍に読める。
 * 桁は {@link stripeAmountText} が通貨から決める。
 *
 * ## 読めなかった物は 0 にしない
 *
 * 欄が欠けた・数でない金額は `null` で持ち、画面が「金額不明」と述べる (`¥0` と刷ると
 * 「0 円の入金」という事実の主張になる · 法則 `blank-states-its-reason`)。
 * 一覧そのものが読めなかったとき (`data` が配列でない) は `chargesRead: false` で返し、
 * 画面が「0 件」と「読めなかった」を言い分ける (パス 263 / 264 の形)。
 */
import { displayField, finiteNumberOf, objectRows, readArrayField } from '../apiResponse';
import { parseTimestamp } from '../isoDate';
import { localIsoDate } from '../localDate';
import { jpy } from '../formatters';

/** Stripe API の基底。送り先はこの定数だけで、利用者の入力からは作らない。 */
export const STRIPE_API_BASE = 'https://api.stripe.com';

/** 最近の入金を何件読むか (Stripe の `limit` は 1〜100)。 */
export const STRIPE_CHARGE_LIMIT = 10;

/** 1 通貨ぶんの残高。金額は通貨の最小単位。読めなければ `null`。 */
export interface StripeBalanceRow {
  readonly currency: string;
  readonly available: number | null;
  readonly pending: number | null;
}

/** 1 件の入金 (charge)。 */
export interface StripeCharge {
  readonly id: string;
  readonly amount: number | null;
  readonly currency: string;
  readonly status: string;
  readonly refunded: boolean;
  /** 作成日 (`YYYY-MM-DD`・端末の時間帯)。読めなければ `null`。 */
  readonly created: string | null;
  readonly description: string;
}

export interface StripeSnapshot {
  readonly balances: readonly StripeBalanceRow[];
  readonly charges: readonly StripeCharge[];
  /** 残高の一覧を読めたか (`available` と `pending` のどちらかが配列だった)。 */
  readonly balanceRead: boolean;
  /** 入金の一覧を読めたか (`data` が配列だった)。 */
  readonly chargesRead: boolean;
  /** 本番 (`true`) かテスト環境 (`false`) か。応答が名乗らなければ `null`。 */
  readonly livemode: boolean | null;
}

/** 小数点以下を持たない通貨 (Stripe の zero-decimal currencies)。`amount` がそのまま額面になる。 */
export const STRIPE_ZERO_DECIMAL: ReadonlySet<string> = new Set([
  'bif', 'clp', 'djf', 'gnf', 'jpy', 'kmf', 'krw', 'mga', 'pyg', 'rwf', 'ugx', 'vnd', 'vuv', 'xaf', 'xof', 'xpf',
]);

/** 小数点以下 3 桁の通貨 (Stripe の three-decimal currencies)。 */
export const STRIPE_THREE_DECIMAL: ReadonlySet<string> = new Set(['bhd', 'jod', 'kwd', 'omr', 'tnd']);

/** 金額が読めなかったときの文。 */
export const STRIPE_AMOUNT_UNKNOWN = '金額不明';

/** 通貨コードが読めなかったときの文。 */
export const STRIPE_CURRENCY_UNKNOWN = '通貨不明';

/**
 * 通貨コードを小文字の 3 文字へ。読めなければ空文字 (画面が「通貨不明」と述べる)。
 * 英字ちょうど 3 文字だけを受ける (両端を留めた照合なので、長い値は 1 字も画面へ出ない)。
 */
export function stripeCurrency(v: unknown): string {
  if (typeof v !== 'string') return '';
  return /^[A-Za-z]{3}$/.test(v) ? v.toLowerCase() : '';
}

/** 通貨の小数点以下の桁数 (0 / 2 / 3)。 */
export function stripeDecimals(currency: string): number {
  if (STRIPE_ZERO_DECIMAL.has(currency)) return 0;
  if (STRIPE_THREE_DECIMAL.has(currency)) return 3;
  return 2;
}

/**
 * 最小単位の金額を、通貨に合わせた文にする。
 *
 * - 読めない金額 → 「金額不明」 (0 と刷らない)
 * - 通貨が読めない → 「通貨不明」を添えて最小単位の数のまま (桁を推測しない)
 * - 円 → `¥1,000` (アプリの金額の口 `jpy` を通す)
 * - それ以外 → `12.34 USD` の形 (桁は通貨から決める)
 */
export function stripeAmountText(amount: number | null, currency: string): string {
  if (amount === null) return STRIPE_AMOUNT_UNKNOWN;
  if (currency === '') return `${amount.toLocaleString('en-US')} (${STRIPE_CURRENCY_UNKNOWN})`;
  if (currency === 'jpy') return jpy(amount);
  const digits = stripeDecimals(currency);
  const major = amount / 10 ** digits;
  const text = major.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits });
  return `${text} ${currency.toUpperCase()}`;
}

/** 入金の状態の表示名。知らない状態は相手の語をそのまま (天井つき) 出す。 */
export function stripeStatusLabel(status: string, refunded: boolean): string {
  if (refunded) return '返金済み';
  if (status === 'succeeded') return '成功';
  if (status === 'pending') return '処理中';
  if (status === 'failed') return '失敗';
  return status === '' ? '状態不明' : status;
}

/** `created` (epoch 秒) → `YYYY-MM-DD`。読めなければ `null`。 */
export function stripeCreatedDate(v: unknown): string | null {
  const seconds = finiteNumberOf(v);
  if (seconds === null) return null;
  const d = parseTimestamp(seconds * 1000);
  return d === null ? null : localIsoDate(d);
}

interface BalancePart {
  readonly amount?: unknown;
  readonly currency?: unknown;
}

/** 残高の応答を通貨ごとの行へ。同じ通貨は最初の 1 件だけを使う (Stripe は通貨ごとに 1 件を返す)。 */
export function normalizeStripeBalance(body: unknown): {
  readonly balances: readonly StripeBalanceRow[];
  readonly read: boolean;
  readonly livemode: boolean | null;
} {
  const available = readArrayField(body, 'available');
  const pending = readArrayField(body, 'pending');
  const order: string[] = [];
  const availableBy = new Map<string, number | null>();
  const pendingBy = new Map<string, number | null>();
  const collect = (rows: readonly unknown[], into: Map<string, number | null>): void => {
    for (const part of objectRows<BalancePart>(rows)) {
      const currency = stripeCurrency(part.currency);
      if (into.has(currency)) continue;
      into.set(currency, finiteNumberOf(part.amount));
      if (!order.includes(currency)) order.push(currency);
    }
  };
  collect(available.rows, availableBy);
  collect(pending.rows, pendingBy);
  const livemode = (Object(body) as { livemode?: unknown }).livemode;
  return {
    balances: order.map((currency) => ({
      currency,
      available: availableBy.get(currency) ?? null,
      pending: pendingBy.get(currency) ?? null,
    })),
    read: available.read || pending.read,
    livemode: typeof livemode === 'boolean' ? livemode : null,
  };
}

interface ChargeRow {
  readonly id?: unknown;
  readonly amount?: unknown;
  readonly currency?: unknown;
  readonly status?: unknown;
  readonly refunded?: unknown;
  readonly created?: unknown;
  readonly description?: unknown;
}

/** 入金の一覧の応答を行へ。 */
export function normalizeStripeCharges(body: unknown): {
  readonly charges: readonly StripeCharge[];
  readonly read: boolean;
} {
  const data = readArrayField(body, 'data');
  return {
    charges: objectRows<ChargeRow>(data.rows).map((row) => ({
      id: displayField(row.id),
      amount: finiteNumberOf(row.amount),
      currency: stripeCurrency(row.currency),
      status: displayField(row.status, 32),
      refunded: row.refunded === true,
      created: stripeCreatedDate(row.created),
      description: displayField(row.description),
    })),
    read: data.read,
  };
}

/** 2 つの応答から画面の形を組む。 */
export function buildStripeSnapshot(balanceBody: unknown, chargesBody: unknown): StripeSnapshot {
  const balance = normalizeStripeBalance(balanceBody);
  const charges = normalizeStripeCharges(chargesBody);
  return {
    balances: balance.balances,
    charges: charges.charges,
    balanceRead: balance.read,
    chargesRead: charges.read,
    livemode: balance.livemode,
  };
}

/** 画面の見出しに添える環境の語。 */
export function stripeModeLabel(livemode: boolean | null): string {
  if (livemode === true) return '本番';
  if (livemode === false) return 'テスト環境';
  return '環境不明';
}

/**
 * 読めなかった一覧を名指しする 1 文。両方読めていれば `null`。
 * 「0 件」と「読めなかった」を混ぜない。
 */
export function stripeIntakeNote(snap: Pick<StripeSnapshot, 'balanceRead' | 'chargesRead'>): string | null {
  const missing: string[] = [];
  if (!snap.balanceRead) missing.push('残高');
  if (!snap.chargesRead) missing.push('最近の入金');
  if (missing.length === 0) return null;
  return `Stripe の応答から${missing.join('と')}を読み取れませんでした (0 件という意味ではありません)。`;
}

/**
 * 通信手段。URL と `RequestInit` を受け取り、**JSON として読めた本体**を返す。
 * デスクトップ版は Node の fetch を、ブラウザ版は利用者のプロキシ経由の fetch を渡す。
 */
export type StripeJsonFetch = (url: string, init: RequestInit) => Promise<unknown>;

/** 2 つの照会に共通のヘッダ。 */
export function stripeHeaders(token: string): Record<string, string> {
  return { Authorization: `Bearer ${token}` };
}

/** 入金の一覧の道 (基底は送る所で付ける —— 宛先の走査が送信の行で基底を見られるように)。 */
export const STRIPE_CHARGES_PATH = `/v1/charges?limit=${STRIPE_CHARGE_LIMIT}`;

/** 残高の道。 */
export const STRIPE_BALANCE_PATH = '/v1/balance';

/** 残高と最近の入金を取得する。**通信手段は呼び出し側が渡す。** */
export async function fetchStripeSnapshotWith(jsonFetch: StripeJsonFetch, token: string): Promise<StripeSnapshot> {
  const headers = stripeHeaders(token);
  const balanceBody = await jsonFetch(`${STRIPE_API_BASE}${STRIPE_BALANCE_PATH}`, { headers });
  const chargesBody = await jsonFetch(`${STRIPE_API_BASE}${STRIPE_CHARGES_PATH}`, { headers });
  return buildStripeSnapshot(balanceBody, chargesBody);
}
