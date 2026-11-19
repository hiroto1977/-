import type { FetchContext } from './types';

/**
 * 経営サマリー — 売上集計 / KPI 実績 / チーム / プランを束ねた経営概況。
 * 集約はすべて renderer 側 (record store + 純粋関数 `data/overview.ts`) で
 * 行うため、本 fetcher はネットワーク I/O を持たない。
 *
 * 主プロセスからは record store を読めないので、返すのは利用者のデータでは
 * なく **空の土台** だけ (水耕栽培・士業と同じ形)。資格情報も通信も
 * 使わないので `LOCAL_SERVICES` に載り、`SERVICE_DATA_ORIGIN` は 'local'。
 */

export interface OverviewSnapshot {
  items: { id: string; name: string }[];
}

export async function fetchOverviewSnapshot(_ctx: FetchContext): Promise<OverviewSnapshot> {
  return { items: [] };
}
