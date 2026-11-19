import type { FetchContext } from './types';
import { buildA8netSnapshot, type A8netSnapshot } from '../../shared/a8netSnapshot';

/**
 * A8.net (a8.net) — アフィリエイト ASP。
 *
 * A8.net の成果レポートは管理画面と CSV だけで、メディア会員向けの公開 REST API は無い。
 * このアプリは A8.net へつながず、成果は利用者が自分で記録する —— 記録は renderer の
 * record store (collection `a8net-rewards`) に在り、ページが自分の記録だけから集計する。
 * 本 fetcher が返すのは見本を持たない空の土台だけ (組み立ては `shared/a8netSnapshot.ts` の
 * `buildA8netSnapshot`、ブラウザ版の web-shim も同じ関数を呼ぶ)。資格情報も通信も
 * 使わないので `LOCAL_SERVICES` に載り、`SERVICE_DATA_ORIGIN` は 'local' (2026-11-19)。
 */

export type { A8netSnapshot };

export async function fetchA8netSnapshotImpl(_ctx: FetchContext): Promise<A8netSnapshot> {
  return buildA8netSnapshot();
}

// Stryker disable next-line BlockStatement
export async function fetchA8netSnapshot(ctx: FetchContext): Promise<A8netSnapshot> {
  return fetchA8netSnapshotImpl(ctx);
}
