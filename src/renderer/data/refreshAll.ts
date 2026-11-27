/**
 * **つないである連携先を、1 回でまとめて取り直す。** (2026-11-27)
 *
 * 利用者の依頼: 「全ての事業の全てのデータを、連携ボタンをタップすると全て連携される様にして」。
 * これまでは画面ごとに「更新」を押すしかなく、経営サマリーが読む会計 (freee) の数字も、
 * その画面を開いて更新を押さないと新しくならなかった。
 *
 * やること:
 * 1. 鍵を登録済みの、外のサービスからデータを取る連携先 (`origin === 'remote'`) を選ぶ。
 *    同梱の見本 (`sample`) と端末の記録 (`local`) は取り直す物が無いので選ばない。
 * 2. 1 件ずつ橋の `fetchSnapshot` を呼ぶ (同時に `concurrency` 件まで —— 一度に全部投げると相手の制限に当たる)。
 * 3. 取れたものは「最後に取れた内容」に覚え (`rememberFetch`)、開いている画面へ知らせる (`publishFetched`)。
 * 4. 結果を 1 件ずつ返す (取れた / 取れなかった / この実行形態では取らない)。鍵が無い連携先は名前だけ返す。
 *
 * 鍵は読まない・書かない (橋が持つ)。取るのは読み取りだけで、外へ書く操作は 1 つもしない。
 */
import type { FetchResult, ServiceId } from '../../preload/bridgeTypes';
import { SERVICE_IDS } from '../../shared/serviceId';
import { originOf } from '../../shared/dataOrigin';
import { rememberFetch } from './lastGoodFetch';
import { publishFetched } from './fetchBroadcast';
import { ERROR_MESSAGE_MAX_CHARS, redactForMessage } from '../../shared/redact';

/** 1 件の結果。`message` は取れなかったときの橋の文 (取れたときは無い)。 */
export interface RefreshAllRow {
  readonly id: ServiceId;
  readonly outcome: 'ok' | 'failed' | 'unsupported';
  readonly message?: string;
}

export interface RefreshAllResult {
  readonly rows: readonly RefreshAllRow[];
  /** 外から取る連携先のうち、鍵がまだ登録されていない物。 */
  readonly notConfigured: readonly ServiceId[];
}

/** 橋のうち、ここで使う 2 つだけ (検査で差し替えられるように)。 */
export interface RefreshAllHub {
  listConfigured(): Promise<ServiceId[]>;
  fetchSnapshot<T = unknown>(id: ServiceId): Promise<FetchResult<T>>;
}

/** 同時に取る件数の既定。 */
export const REFRESH_ALL_CONCURRENCY = 4;

/** 外のサービスからデータを取る連携先 (鍵の有無は問わない)。 */
export function remoteServiceIds(): ServiceId[] {
  return SERVICE_IDS.filter((id) => originOf(id) === 'remote');
}

async function fetchOne(hub: RefreshAllHub, id: ServiceId): Promise<RefreshAllRow> {
  let result: FetchResult;
  try {
    result = await hub.fetchSnapshot(id);
  } catch (e) {
    return { id, outcome: 'failed', message: redactForMessage(e instanceof Error ? e.message : String(e), ERROR_MESSAGE_MAX_CHARS) };
  }
  if (result.ok) {
    rememberFetch(id, result.data);
    publishFetched(id, result.data);
    return { id, outcome: 'ok' };
  }
  if (result.code === 'not_implemented') return { id, outcome: 'unsupported', message: result.message };
  return { id, outcome: 'failed', message: result.message };
}

/**
 * 鍵を登録済みの連携先をまとめて取り直す。結果の並びは `SERVICE_IDS` の順 (取れた順ではない)。
 * 鍵の一覧が読めなければ投げる (「0 件つないである」と混ぜない)。
 */
export async function refreshAllConnected(
  hub: RefreshAllHub,
  concurrency: number = REFRESH_ALL_CONCURRENCY,
): Promise<RefreshAllResult> {
  const configured = new Set(await hub.listConfigured());
  const remote = remoteServiceIds();
  const targets = remote.filter((id) => configured.has(id));
  const notConfigured = remote.filter((id) => !configured.has(id));
  const rows: RefreshAllRow[] = new Array<RefreshAllRow>(targets.length);
  let next = 0;
  const worker = async (): Promise<void> => {
    while (next < targets.length) {
      const i = next;
      next += 1;
      rows[i] = await fetchOne(hub, targets[i]!);
    }
  };
  const lanes = Math.max(1, Math.min(concurrency, targets.length));
  await Promise.all(Array.from({ length: lanes }, () => worker()));
  return { rows, notConfigured };
}
