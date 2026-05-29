import type { FetchContext } from './types';

/**
 * マネーフォワード クラウド (biz.moneyforward.com) — クラウド会計/請求/確定申告
 * 等のバックオフィス SaaS (snapshot 専用)。
 *
 * MF クラウドは公式 API を提供するが、認証はパートナー登録 + OAuth が必要で
 * 一般のトークン貼り付けでは利用できない。本ファイルは `LIVE_FETCHERS`
 * invariant を満たす static stub。実際のページは `SNAPSHOT.moneyforward` を
 * 直接描画する。将来パートナー API を配線する際は、この fetcher 内で同じ
 * shape を返却する。
 */

export interface MoneyforwardSnapshot {
  items: { id: string; name: string }[];
}

// Stryker disable next-line all
const STUB: MoneyforwardSnapshot = { items: [] };

export async function fetchMoneyforwardSnapshotImpl(_ctx: FetchContext): Promise<MoneyforwardSnapshot> {
  return STUB;
}

// Stryker disable next-line BlockStatement
export async function fetchMoneyforwardSnapshot(ctx: FetchContext): Promise<MoneyforwardSnapshot> {
  return fetchMoneyforwardSnapshotImpl(ctx);
}
