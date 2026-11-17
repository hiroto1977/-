import { createSnapshotStub } from './snapshotStub';
import { buildVrioSnapshot, type VrioSnapshot } from '../../shared/vrio';

/**
 * VRIO 分析 (2026-11-17) —— 従業員の評価と商品企画の GO / NO-GO 判定。
 * 算定と判定は `src/shared/vrio.ts` の純関数で、入力は画面の中にだけ在る (保存も通信もしない)。
 * 本 fetcher は `LIVE_FETCHERS` invariant を満たすための stub で、返すのは階層・職種・判定の台帳の見出しだけ。
 */
export type { VrioSnapshot };

export const fetchVrioSnapshot = createSnapshotStub<VrioSnapshot>(buildVrioSnapshot());
