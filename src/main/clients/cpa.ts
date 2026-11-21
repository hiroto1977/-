import { createShigyoLocalFetcher } from './shigyo';
import type { ShigyoSnapshot } from '../../shared/shigyoTypes';

/**
 * 公認会計士 連携 (端末内の記録が正・公式 API なし)。共通の士業 CRM 構造は `shigyoTypes.ts` /
 * `shigyo.ts` を参照。
 */
export type CpaSnapshot = ShigyoSnapshot;

export const fetchCpaSnapshot = createShigyoLocalFetcher();
