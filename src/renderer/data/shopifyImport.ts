/**
 * Shopify → 売上集計 取り込み。Shopify の注文を、このアプリの売上集計
 * (`sales.ts` の SalesEntry) に変換して record store に流し込むための純粋
 * ロジック。これにより Shopify の実注文が KPI / 売上ダッシュボードへ反映され、
 * システム全体のデータ精度が上がる。
 *
 * main プロセスの ShopifyOrderSummary を直接 import すると process 境界
 * (lint:imports) に触れるため、renderer 側で必要最小限の入力型を再定義する。
 */
import { parseSalesEntry, type SalesEntry } from './sales';

/** Shopify 注文の最小入力。`total` は "¥12,000" のような表示文字列でも、
 *  数値でも受け付ける。 */
export interface ShopifyOrderInput {
  readonly name?: string;
  readonly total: string | number;
  readonly orders?: number;
}

/** 表示用の金額文字列から数値を取り出す。"¥12,000" → 12000 / "1,234円" → 1234。
 *  数値ならそのまま。負・非有限は 0 に丸める。 */
export function parseAmount(total: string | number): number {
  if (typeof total === 'number') return Number.isFinite(total) && total > 0 ? total : 0;
  const digits = total.replace(/[^0-9.]/g, '');
  const n = Number(digits);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/**
 * Shopify 注文を売上エントリ (channel='shopify') に変換。`date` は呼び出し側
 * が指定 (既定は今日)。金額が取れない注文は取り込まない方針なので、その場合は
 * null を返す。検証は既存の `parseSalesEntry` に委譲して精度を担保する。
 */
export function orderToSalesEntry(
  order: ShopifyOrderInput,
  opts: { date?: string } = {},
): SalesEntry | null {
  const amount = parseAmount(order.total);
  if (amount <= 0) return null;
  const date = opts.date ?? new Date().toISOString().slice(0, 10);
  return parseSalesEntry({
    date,
    channel: 'shopify',
    amount,
    orders: order.orders ?? 1,
    note: order.name ? `Shopify ${order.name}` : 'Shopify',
  });
}
