import { createSnapshotStub } from './snapshotStub';
import { buildMentorSnapshot, type MentorSnapshot } from '../../shared/mentor';

/**
 * 専属カウンセラー (2026-10-29 · パス 551) —— メンバー 1 人に 1 人ずつ付く相談役。
 * 判断は `src/shared/mentor.ts` の純関数、記録は renderer 側の record store
 * (collection `mentor-sessions`) に在り、ネットワーク I/O は行わない。本 fetcher は
 * `LIVE_FETCHERS` invariant を満たすための stub で、返すのは聞き取りの問いの台帳だけ。
 */
export type { MentorSnapshot };

export const fetchMentorSnapshot = createSnapshotStub<MentorSnapshot>(buildMentorSnapshot());
