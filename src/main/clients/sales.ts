import type { FetchContext } from './types';

/**
 * 売上集計 — 複数 EC チャネル (Amazon / Shopify / BASE / 楽天 …) の売上を
 * 横断集計するローカル機能。データは renderer 側の record store
 * (`data/store.ts` collection `sales-entries`) に保存され、ネットワーク I/O は
 * 行わない。
 *
 * 主プロセスからは record store を読めないので、本 fetcher が返すのは
 * 利用者のデータではなく **空の土台** だけ (水耕栽培・士業と同じ形)。
 * 画面は土台の上に record store の記録を重ねて描く。資格情報も通信も
 * 使わないので `LOCAL_SERVICES` に載り、`SERVICE_DATA_ORIGIN` は 'local'。
 */

export interface SalesSnapshot {
  items: { id: string; name: string }[];
}

export async function fetchSalesSnapshot(_ctx: FetchContext): Promise<SalesSnapshot> {
  return { items: [] };
}
