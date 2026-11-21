import { buildVrioSnapshot, type VrioSnapshot } from '../../shared/vrio';
import type { FetchContext } from './types';

/**
 * VRIO 分析 (2026-11-17) —— 従業員の評価と商品企画の GO / NO-GO 判定。
 * 算定と判定は `src/shared/vrio.ts` の純関数で、入力は画面の中にだけ在る (保存も通信もしない)。
 *
 * 本 fetcher が返すのは階層・職種・判定の台帳の見出しだけで、人の評価は
 * 持たない (台帳の組み立ては `shared/vrio.ts` の `buildVrioSnapshot`)。
 * 資格情報も通信も使わないので `LOCAL_SERVICES` に載り、
 * `SERVICE_DATA_ORIGIN` は 'local'。
 */
export type { VrioSnapshot };

export async function fetchVrioSnapshot(_ctx: FetchContext): Promise<VrioSnapshot> {
  return buildVrioSnapshot();
}
