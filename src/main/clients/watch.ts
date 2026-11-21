import { buildWatchSnapshot, type WatchSnapshot } from '../../shared/watchAssistant';
import type { FetchContext } from './types';

/**
 * 見張りアシスタント (2026-11-21) —— 貼り付けた文から平日の要約と返信の下書きを作り、
 * 週ごとの数字から週次レポートを作る。
 *
 * 要約と下書きは `src/shared/watchAssistant.ts` の純関数で、貼り付けた文は画面の中にだけ在る
 * (保存も通信もしない)。週ごとの数字は renderer の record store に在る。
 *
 * 本 fetcher が返すのは見張る先と返信の方向の一覧だけで、人の文も数字も持たない。
 * 資格情報も通信も使わないので `LOCAL_SERVICES` に載り、`SERVICE_DATA_ORIGIN` は 'local'。
 */
export type { WatchSnapshot };

export async function fetchWatchSnapshot(_ctx: FetchContext): Promise<WatchSnapshot> {
  return buildWatchSnapshot();
}
