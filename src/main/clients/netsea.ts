import type { FetchContext } from './types';

/**
 * NETSEA (netsea.jp) — B2B 卸・仕入れマーケットプレイス (snapshot 専用)。
 *
 * NETSEA の API はパートナー (出店者/連携事業者) 限定で一般公開されていない
 * ため、本ファイルは `LIVE_FETCHERS` invariant を満たす static stub。実際の
 * ページは `SNAPSHOT.netsea` を直接描画する。将来パートナー API を配線する
 * 際は、この fetcher 内で同じ shape を返却する。
 */

export interface NetseaSnapshot {
  items: { id: string; name: string }[];
}

// Stryker disable next-line all
const STUB: NetseaSnapshot = { items: [] };

export async function fetchNetseaSnapshotImpl(_ctx: FetchContext): Promise<NetseaSnapshot> {
  return STUB;
}

// Stryker disable next-line BlockStatement
export async function fetchNetseaSnapshot(ctx: FetchContext): Promise<NetseaSnapshot> {
  return fetchNetseaSnapshotImpl(ctx);
}
