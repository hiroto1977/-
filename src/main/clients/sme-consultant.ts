import { createShigyoFetcher } from './shigyo';
import type { ShigyoSnapshot } from '../../shared/shigyoTypes';

/**
 * 中小企業診断士 連携 (snapshot 専用)。共通の士業 CRM 構造は
 * `shigyoTypes.ts` / `shigyo.ts` を参照。
 */
export type SmeConsultantSnapshot = ShigyoSnapshot;

export const fetchSmeConsultantSnapshot = createShigyoFetcher();
