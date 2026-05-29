import type { FetchContext } from './types';

/**
 * 弁理士 連携 (snapshot 専用)。
 *
 * 個別の専門家との連携情報 (連絡先 / 相談履歴 / 書類 / 請求) を管理する
 * 軽量 CRM。公式 API はないため、ユーザーが手動で登録した記録を表示する
 * Phase 6 で IndexedDB 永続化に切替予定。現在は LIVE_FETCHERS invariant
 * を満たすための static stub。
 */

export interface PatentAttorneyContact {
  readonly id: string;
  readonly name: string;
  readonly firm: string;
  readonly phone?: string;
  readonly email?: string;
}

export interface PatentAttorneyConsultation {
  readonly id: string;
  readonly contactId: string;
  readonly date: string;
  readonly topic: string;
  readonly status: '相談予約' | '相談中' | '対応中' | '完了';
}

export interface PatentAttorneyDocument {
  readonly id: string;
  readonly title: string;
  readonly direction: 'sent' | 'received';
  readonly date: string;
}

export interface PatentAttorneySnapshot {
  readonly contacts: ReadonlyArray<PatentAttorneyContact>;
  readonly recentConsultations: ReadonlyArray<PatentAttorneyConsultation>;
  readonly pendingDocuments: ReadonlyArray<PatentAttorneyDocument>;
  readonly monthlyFee: number;
  readonly outstandingInvoice: number;
}

// Stryker disable next-line all
const STUB: PatentAttorneySnapshot = {
  contacts: [],
  recentConsultations: [],
  pendingDocuments: [],
  monthlyFee: 0,
  outstandingInvoice: 0,
};

export async function fetchPatentAttorneySnapshotImpl(_ctx: FetchContext): Promise<PatentAttorneySnapshot> {
  return STUB;
}

// Stryker disable next-line BlockStatement
export async function fetchPatentAttorneySnapshot(ctx: FetchContext): Promise<PatentAttorneySnapshot> {
  return fetchPatentAttorneySnapshotImpl(ctx);
}
