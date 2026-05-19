import type { FetchContext } from './types';

/**
 * 社労士 連携 (snapshot 専用)。
 *
 * 個別の専門家との連携情報 (連絡先 / 相談履歴 / 書類 / 請求) を管理する
 * 軽量 CRM。公式 API はないため、ユーザーが手動で登録した記録を表示する
 * Phase 6 で IndexedDB 永続化に切替予定。現在は LIVE_FETCHERS invariant
 * を満たすための static stub。
 */

export interface LaborConsultantContact {
  readonly id: string;
  readonly name: string;
  readonly firm: string;
  readonly phone?: string;
  readonly email?: string;
}

export interface LaborConsultantConsultation {
  readonly id: string;
  readonly contactId: string;
  readonly date: string;
  readonly topic: string;
  readonly status: '相談予約' | '相談中' | '対応中' | '完了';
}

export interface LaborConsultantDocument {
  readonly id: string;
  readonly title: string;
  readonly direction: 'sent' | 'received';
  readonly date: string;
}

export interface LaborConsultantSnapshot {
  readonly contacts: ReadonlyArray<LaborConsultantContact>;
  readonly recentConsultations: ReadonlyArray<LaborConsultantConsultation>;
  readonly pendingDocuments: ReadonlyArray<LaborConsultantDocument>;
  readonly monthlyFee: number;
  readonly outstandingInvoice: number;
}

// Stryker disable next-line all
const STUB: LaborConsultantSnapshot = {
  contacts: [],
  recentConsultations: [],
  pendingDocuments: [],
  monthlyFee: 0,
  outstandingInvoice: 0,
};

export async function fetchLaborConsultantSnapshotImpl(_ctx: FetchContext): Promise<LaborConsultantSnapshot> {
  return STUB;
}

// Stryker disable next-line BlockStatement
export async function fetchLaborConsultantSnapshot(ctx: FetchContext): Promise<LaborConsultantSnapshot> {
  return fetchLaborConsultantSnapshotImpl(ctx);
}
