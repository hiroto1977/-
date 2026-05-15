import type { FetchContext } from './types';

/**
 * Home — 20 番目のサービス。サイドバー先頭に配置し、アプリ起動時の
 * デフォルト画面となる。「誰でも 1 クリックで成果物を作れる」ための
 * ランディングページ。
 *
 * 状態を持たないため snapshot は固定値、actions は無し。
 */

export interface HomeSnapshot {
  readonly greeting: string;
  readonly fetchedAt: string;
  readonly isMock: boolean;
}

// Stryker disable next-line StringLiteral
const FETCHED_AT = '2035-05-15T00:00:00.000Z';

export async function fetchHomeSnapshotImpl(_ctx: FetchContext): Promise<HomeSnapshot> {
  return {
    greeting: 'こんにちは。今日は何を作りましょう?',
    fetchedAt: FETCHED_AT,
    isMock: true,
  };
}

// Stryker disable next-line BlockStatement
export async function fetchHomeSnapshot(ctx: FetchContext): Promise<HomeSnapshot> {
  return fetchHomeSnapshotImpl(ctx);
}
