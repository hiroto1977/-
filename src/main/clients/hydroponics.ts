import { buildHydroponicsSnapshot } from '../../shared/hydroponicsControl';
import type { FetchContext } from './types';

export type { HydroponicsFieldInfo, HydroponicsSnapshot } from '../../shared/hydroponicsControl';
export { buildHydroponicsSnapshot } from '../../shared/hydroponicsControl';

/**
 * 水耕栽培 —— **運転管理**のサービス (2026-09-13 ・ パス 194)。
 *
 * ## このサービスが返す物 (と、返さない物)
 *
 * 測定の記録・栽培ロット・運転の設定は **renderer の record store (端末内)** に
 * 在り、主プロセスからは読めない。だからこの fetcher は**利用者のデータを返さない**
 * —— 返すのは「何を測るか」の台帳 (項目・単位・妥当範囲・根拠の強さ・目標域の初期値・
 * 参考値の品目) である。
 *
 * **組み立ては `shared/hydroponicsControl.ts` に 1 つしか置かない** —— ブラウザ版は
 * `web-shim.ts` の `fetchSnapshot` が同じ関数を呼ぶ。片方だけに置くとブラウザ版で
 * 台帳が空になる (パス 118 の「口はあるが繋がっていない」。e2e が実測で拾った)。
 *
 * 資格情報も通信も要らないので `LOCAL_SERVICES` に載せ、`SERVICE_CREDENTIAL_USE` は
 * `'none'`、`SERVICE_DATA_ORIGIN` は `'local'`。
 */
export function fetchHydroponicsSnapshot(_ctx: FetchContext): Promise<ReturnType<typeof buildHydroponicsSnapshot>> {
  return Promise.resolve(buildHydroponicsSnapshot());
}
