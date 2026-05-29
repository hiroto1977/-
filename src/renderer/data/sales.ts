/**
 * Cross-channel sales aggregation — records individual sales entries (per
 * channel: Amazon / Shopify / BASE / 楽天 / その他) into the local record
 * store and rolls them up by channel and by period. This is the first
 * feature that unifies the many EC integrations into one number a business
 * owner actually cares about: total sales across channels.
 *
 * Pure model here; persistence is the generic `data/store.ts` collection,
 * consumed in the renderer via `useCollection(SALES_COLLECTION)`.
 */

export const SALES_COLLECTION = 'sales-entries';

/** Known sales channels. `other` is the catch-all. */
export const SALES_CHANNELS = [
  'amazon',
  'shopify',
  'base',
  'rakuten',
  'mercari',
  'other',
] as const;
export type SalesChannel = (typeof SALES_CHANNELS)[number];

export const CHANNEL_LABEL: Readonly<Record<SalesChannel, string>> = {
  amazon: 'Amazon',
  shopify: 'Shopify',
  base: 'BASE',
  rakuten: '楽天市場',
  mercari: 'メルカリ',
  other: 'その他',
};

/** One sales entry (a day/order/batch of revenue on a channel). */
export interface SalesEntry extends Record<string, unknown> {
  /** Transaction date, `YYYY-MM-DD`. */
  readonly date: string;
  readonly channel: SalesChannel;
  /** Gross sales amount (JPY). */
  readonly amount: number;
  /** Number of orders represented (>= 1). */
  readonly orders: number;
  /** Optional free-form note. */
  readonly note?: string;
}

export function isSalesChannel(v: unknown): v is SalesChannel {
  return typeof v === 'string' && (SALES_CHANNELS as readonly string[]).includes(v);
}

/** `YYYY-MM-DD` with a real-ish calendar check (month 01-12, day 01-31). */
export function isValidDate(s: unknown): s is string {
  if (typeof s !== 'string') return false;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return false;
  const month = Number(m[2]);
  const day = Number(m[3]);
  return month >= 1 && month <= 12 && day >= 1 && day <= 31;
}

/** Validate + coerce raw input into a clean SalesEntry, or throw with a
 *  user-facing message. */
export function parseSalesEntry(input: {
  date?: unknown;
  channel?: unknown;
  amount?: unknown;
  orders?: unknown;
  note?: unknown;
}): SalesEntry {
  if (!isValidDate(input.date)) throw new Error('日付は YYYY-MM-DD 形式で入力してください');
  if (!isSalesChannel(input.channel)) throw new Error('チャネルが不正です');

  const amount = typeof input.amount === 'number' ? input.amount : Number(input.amount);
  if (!Number.isFinite(amount) || amount < 0) throw new Error('売上金額は 0 以上の数値で入力してください');

  const orders = typeof input.orders === 'number' ? input.orders : Number(input.orders);
  if (!Number.isInteger(orders) || orders < 1) throw new Error('注文件数は 1 以上の整数で入力してください');

  const entry: SalesEntry = { date: input.date, channel: input.channel, amount, orders };
  if (typeof input.note === 'string' && input.note.trim().length > 0) {
    const note = input.note.trim();
    if (note.length > 200) throw new Error('メモは 200 文字以内で入力してください');
    return { ...entry, note };
  }
  return entry;
}

export interface ChannelTotal {
  readonly channel: SalesChannel;
  readonly label: string;
  readonly amount: number;
  readonly orders: number;
  /** Share of total amount, 0-100. */
  readonly share: number;
  /** Average order value (amount / orders), 0 when no orders. */
  readonly aov: number;
}

export interface SalesSummary {
  readonly totalAmount: number;
  readonly totalOrders: number;
  readonly aov: number;
  /** Per-channel breakdown, sorted by amount descending. Only channels with
   *  at least one entry appear. */
  readonly byChannel: readonly ChannelTotal[];
}

/** Roll up entries into totals + per-channel breakdown. */
export function summarizeSales(entries: readonly SalesEntry[]): SalesSummary {
  const totalAmount = entries.reduce((acc, e) => acc + e.amount, 0);
  const totalOrders = entries.reduce((acc, e) => acc + e.orders, 0);

  const acc = new Map<SalesChannel, { amount: number; orders: number }>();
  for (const e of entries) {
    const cur = acc.get(e.channel) ?? { amount: 0, orders: 0 };
    cur.amount += e.amount;
    cur.orders += e.orders;
    acc.set(e.channel, cur);
  }

  const byChannel: ChannelTotal[] = [...acc.entries()]
    .map(([channel, v]) => ({
      channel,
      label: CHANNEL_LABEL[channel],
      amount: v.amount,
      orders: v.orders,
      share: totalAmount > 0 ? (v.amount / totalAmount) * 100 : 0,
      aov: v.orders > 0 ? v.amount / v.orders : 0,
    }))
    .sort((a, b) => b.amount - a.amount);

  return {
    totalAmount,
    totalOrders,
    aov: totalOrders > 0 ? totalAmount / totalOrders : 0,
    byChannel,
  };
}

/** Group entries by `YYYY-MM` month, newest month first, with each month's
 *  total amount. Useful for a trend view. */
export function monthlyTotals(entries: readonly SalesEntry[]): readonly { month: string; amount: number }[] {
  const acc = new Map<string, number>();
  for (const e of entries) {
    const month = e.date.slice(0, 7); // YYYY-MM
    acc.set(month, (acc.get(month) ?? 0) + e.amount);
  }
  return [...acc.entries()]
    .map(([month, amount]) => ({ month, amount }))
    .sort((a, b) => (a.month < b.month ? 1 : -1));
}
