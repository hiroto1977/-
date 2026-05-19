import type { FetchContext } from './types';

/**
 * 司法書士 連携 (snapshot 専用)。
 *
 * 個別の専門家との連携情報 (連絡先 / 相談履歴 / 書類 / 請求) を管理する
 * 軽量 CRM。公式 API はないため、ユーザーが手動で登録した記録を表示する
 * Phase 6 で IndexedDB 永続化に切替予定。現在は LIVE_FETCHERS invariant
 * を満たすための static stub。
 */

export interface JudicialScrivenerContact {
  readonly id: string;
  readonly name: string;
  readonly firm: string;
  readonly phone?: string;
  readonly email?: string;
}

export interface JudicialScrivenerConsultation {
  readonly id: string;
  readonly contactId: string;
  readonly date: string;
  readonly topic: string;
  readonly status: '相談予約' | '相談中' | '対応中' | '完了';
}

export interface JudicialScrivenerDocument {
  readonly id: string;
  readonly title: string;
  readonly direction: 'sent' | 'received';
  readonly date: string;
}

export interface JudicialScrivenerSnapshot {
  readonly contacts: ReadonlyArray<JudicialScrivenerContact>;
  readonly recentConsultations: ReadonlyArray<JudicialScrivenerConsultation>;
  readonly pendingDocuments: ReadonlyArray<JudicialScrivenerDocument>;
  readonly monthlyFee: number;
  readonly outstandingInvoice: number;
}

// Stryker disable next-line all
const STUB: JudicialScrivenerSnapshot = {
  contacts: [],
  recentConsultations: [],
  pendingDocuments: [],
  monthlyFee: 0,
  outstandingInvoice: 0,
};

export async function fetchJudicialScrivenerSnapshotImpl(_ctx: FetchContext): Promise<JudicialScrivenerSnapshot> {
  return STUB;
}

// Stryker disable next-line BlockStatement
export async function fetchJudicialScrivenerSnapshot(ctx: FetchContext): Promise<JudicialScrivenerSnapshot> {
  return fetchJudicialScrivenerSnapshotImpl(ctx);
}
