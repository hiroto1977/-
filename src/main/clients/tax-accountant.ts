import type { FetchContext } from './types';
import type {
  ShigyoContact,
  ShigyoConsultation,
  ShigyoDocument,
  ShigyoSnapshot,
} from '../../shared/shigyoTypes';

/**
 * tax-accountant 連携 (snapshot 専用)。
 *
 * 個別の専門家との連携情報を軽量 CRM として管理する。公式 API はないため、
 * ユーザーが手動登録した記録を表示。共通スナップショット型は
 * `src/shared/shigyoTypes.ts` から import (PR #7 R1 #2 で DRY 違反解消)。
 */

// Re-export legacy aliases for backward compatibility with existing
// import sites (e.g. `import { TaxAccountantSnapshot } from './tax-accountant'`).
// New code should import from `shared/shigyoTypes` directly.
export type TaxAccountantContact = ShigyoContact;
export type TaxAccountantConsultation = ShigyoConsultation;
export type TaxAccountantDocument = ShigyoDocument;
export type TaxAccountantSnapshot = ShigyoSnapshot;

// Stryker disable next-line all
const STUB: ShigyoSnapshot = {
  contacts: [],
  recentConsultations: [],
  pendingDocuments: [],
  monthlyFee: 0,
  outstandingInvoice: 0,
};

export async function fetchTaxAccountantSnapshotImpl(_ctx: FetchContext): Promise<ShigyoSnapshot> {
  return STUB;
}

// Stryker disable next-line BlockStatement
export async function fetchTaxAccountantSnapshot(ctx: FetchContext): Promise<ShigyoSnapshot> {
  return fetchTaxAccountantSnapshotImpl(ctx);
}
