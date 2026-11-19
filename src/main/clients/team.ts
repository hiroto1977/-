import type { FetchContext } from './types';

/**
 * チーム管理 — 組織メンバー (オーナー/管理者/メンバー) のローカル管理機能。
 * データは renderer 側の record store (`data/store.ts` collection
 * `team-members`) に保存され、ネットワーク I/O は行わない。ロール権限と
 * シート上限の判定は `src/shared/team.ts` (pure) が担う。
 *
 * 主プロセスからは record store を読めないので、本 fetcher が返すのは
 * 利用者のデータではなく **空の土台** だけ (水耕栽培・士業と同じ形)。
 * 画面は土台の上に record store の記録を重ねて描く。資格情報も通信も
 * 使わないので `LOCAL_SERVICES` に載り、`SERVICE_DATA_ORIGIN` は 'local'。
 */

export interface TeamSnapshot {
  items: { id: string; name: string }[];
}

export async function fetchTeamSnapshot(_ctx: FetchContext): Promise<TeamSnapshot> {
  return { items: [] };
}
