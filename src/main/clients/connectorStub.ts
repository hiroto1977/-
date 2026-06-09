import type { FetchContext } from './types';

/**
 * 連携先 (snapshot 専用) スタブの共通形状とフェッチャ生成。
 *
 * PR #5 で追加した 10 連携先 (Microsoft365 / Dropbox / Salesforce / Discord /
 * Asana / Linear / Sentry / Shopify / Stripe / LINE) は、型名以外が完全同一の
 * 26 行 stub だった (計 260 行)。共通の `{ items, count }` 形状と factory に
 * 集約する。各サービスは薄いラッパ (型 alias + フェッチャ re-export) になる。
 *
 * 公式 API 配線は Phase 6+ 予定。LIVE_FETCHERS invariant (clients/index.ts) を
 * 満たすための static stub であり、実際の業務 KPI は SNAPSHOT.<id> を描画する。
 */
export interface ConnectorStubSnapshot {
  readonly items: ReadonlyArray<{ readonly id: string; readonly name: string }>;
  readonly count: number;
}

// Stryker disable next-line all
const EMPTY: ConnectorStubSnapshot = { items: [], count: 0 };

/**
 * snapshot 専用フェッチャ (Impl + wrapper) のペアを生成する。
 * `fetch` は呼ばず常に空の stub を返す。
 *
 * 本体は各 `<id>.ts` のモジュール読込時に 1 度だけ実行されるため per-test
 * coverage に乗らず、空ブロック変異が生存する。元の stub 群と同じく snapshot
 * 専用ボイラープレートとして BlockStatement 変異を抑制する。
 */
// Stryker disable next-line BlockStatement
export function makeConnectorStubFetcher() {
  const impl = async (_ctx: FetchContext): Promise<ConnectorStubSnapshot> => EMPTY;
  // Stryker disable next-line BlockStatement
  const fetcher = async (ctx: FetchContext): Promise<ConnectorStubSnapshot> => impl(ctx);
  return { impl, fetcher };
}
