import type { FetchContext } from './types';
import type { ShigyoSnapshot } from '../../shared/shigyoTypes';

/**
 * 士業 連携 snapshot-only fetcher の共通ファクトリ。
 *
 * 7 士業 (税理士 / 社労士 / 弁護士 / 司法書士 / 行政書士 / 中小企業診断士 /
 * 弁理士) は構造が同一なので、各 client はこのファクトリで `LIVE_FETCHERS`
 * invariant を満たす static stub を生成する。実データはユーザーが手動登録し
 * `SNAPSHOT[id]` から描画される。Phase 6 で IndexedDB 永続化に切替予定。
 */

// Stryker disable next-line all
const EMPTY_STUB: ShigyoSnapshot = {
  contacts: [],
  recentConsultations: [],
  pendingDocuments: [],
  monthlyFee: 0,
  outstandingInvoice: 0,
};

/**
 * 空の士業 snapshot を返す fetcher を生成する。ネットワーク I/O は行わない。
 */
export function createShigyoFetcher(): (ctx: FetchContext) => Promise<ShigyoSnapshot> {
  // Stryker disable next-line BlockStatement
  return async function fetchShigyoSnapshot(_ctx: FetchContext): Promise<ShigyoSnapshot> {
    return EMPTY_STUB;
  };
}
