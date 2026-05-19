import type { FetchContext } from './types';

/**
 * Library — 21 番目のサービス。
 *
 * IndexedDB ベースのアプリ内ライブラリ。バックエンドは状態を持たない —
 * すべて renderer 側で完結 (BROWSER_REDESIGN.md §3.2)。
 * このスナップショットは「ライブラリには renderer 側で読み書きする」
 * という事実を返すプレースホルダ。
 */

export interface LibrarySnapshot {
  readonly note: string;
  readonly fetchedAt: string;
  readonly isMock: boolean;
}

// Stryker disable next-line StringLiteral
const FETCHED_AT = '2035-05-15T00:00:00.000Z';

export async function fetchLibrarySnapshotImpl(_ctx: FetchContext): Promise<LibrarySnapshot> {
  return {
    note: 'ライブラリの実体はブラウザの IndexedDB に保存されます',
    fetchedAt: FETCHED_AT,
    isMock: true,
  };
}

// Stryker disable next-line BlockStatement
export async function fetchLibrarySnapshot(ctx: FetchContext): Promise<LibrarySnapshot> {
  return fetchLibrarySnapshotImpl(ctx);
}
