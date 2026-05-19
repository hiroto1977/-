import type { FetchContext } from './types';

/**
 * Settings — 22 番目のサービス。
 *
 * 各 API キー / PAT の設定窓口。バックエンドは状態を持たず、すべて renderer
 * 側で Vault と直接やり取りする (BROWSER_REDESIGN.md §3.1)。
 */

export interface SettingsSnapshot {
  readonly note: string;
  readonly fetchedAt: string;
  readonly isMock: boolean;
}

// Stryker disable next-line StringLiteral
const FETCHED_AT = '2035-05-15T00:00:00.000Z';

export async function fetchSettingsSnapshotImpl(_ctx: FetchContext): Promise<SettingsSnapshot> {
  return {
    note: 'API キーはマスターパスワードで暗号化されてブラウザに保管されます',
    fetchedAt: FETCHED_AT,
    isMock: true,
  };
}

// Stryker disable next-line BlockStatement
export async function fetchSettingsSnapshot(ctx: FetchContext): Promise<SettingsSnapshot> {
  return fetchSettingsSnapshotImpl(ctx);
}
