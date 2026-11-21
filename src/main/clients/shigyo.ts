import type { FetchContext } from './types';
import { buildShigyoSnapshot, type ShigyoSnapshot } from '../../shared/shigyoTypes';

/**
 * 士業 連携のローカル fetcher の共通ファクトリ。
 *
 * 8 士業 (税理士 / 公認会計士 / 社労士 / 弁護士 / 司法書士 / 行政書士 /
 * 中小企業診断士 / 弁理士) は構造が同一なので、各 client はこのファクトリで
 * fetcher を生成する。公式 API は無い —— 連絡先・相談・書類・顧問料は利用者が
 * 端末内の record store に登録した物が正で (`renderer/data/shigyoDirectory.ts`)、
 * 主プロセスからは読めない。だから fetcher が返すのは利用者のデータではなく、
 * 見本の人も金額も持たない**空の土台** (`shared/shigyoTypes.ts` の
 * `buildShigyoSnapshot` —— ブラウザ版の web-shim も同じ関数を呼ぶ)。
 * 通信も資格情報も使わないので、8 士業は `LOCAL_SERVICES` に載り、
 * `SERVICE_DATA_ORIGIN` は 'local'。
 */

/**
 * 空の士業 snapshot (土台) を返す fetcher を生成する。ネットワーク I/O は行わない。
 */
export function createShigyoLocalFetcher(): (ctx: FetchContext) => Promise<ShigyoSnapshot> {
  return async function fetchShigyoSnapshot(_ctx: FetchContext): Promise<ShigyoSnapshot> {
    return buildShigyoSnapshot();
  };
}
