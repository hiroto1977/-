import { createShigyoFetcher } from './shigyo';
import type { ShigyoSnapshot } from '../../shared/shigyoTypes';

/**
 * 弁理士 連携 (snapshot 専用)。共通の士業 CRM 構造は `shigyoTypes.ts` /
 * `shigyo.ts` を参照。
 */
export type PatentAttorneySnapshot = ShigyoSnapshot;

export const fetchPatentAttorneySnapshot = createShigyoFetcher();
