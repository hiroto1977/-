import { buildMentorSnapshot, type MentorSnapshot } from '../../shared/mentor';
import type { FetchContext } from './types';

/**
 * 専属カウンセラー (2026-10-29 · パス 551) —— メンバー 1 人に 1 人ずつ付く相談役。
 * 判断は `src/shared/mentor.ts` の純関数、記録は renderer 側の record store
 * (collection `mentor-sessions`) に在り、ネットワーク I/O は行わない。
 *
 * 本 fetcher が返すのは聞き取りの問いの台帳だけで、人の記録は持たない
 * (台帳の組み立ては `shared/mentor.ts` の `buildMentorSnapshot` ——
 * ブラウザ版も同じ台帳を renderer 側で読む)。資格情報も通信も使わないので
 * `LOCAL_SERVICES` に載り、`SERVICE_DATA_ORIGIN` は 'local'。
 */
export type { MentorSnapshot };

export async function fetchMentorSnapshot(_ctx: FetchContext): Promise<MentorSnapshot> {
  return buildMentorSnapshot();
}
