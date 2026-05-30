/**
 * 士業 (専門家) 連携の共通型。
 *
 * 7 つの士業サービス (税理士 / 社労士 / 弁護士 / 司法書士 / 行政書士 /
 * 中小企業診断士 / 弁理士) は同一の軽量 CRM 構造 — 連絡先 / 相談履歴 /
 * 書類 / 月次請求 — を共有する。各 client がこの型を import し、
 * UI は `components/ShigyoConsole.tsx` がこの型で描画する。
 *
 * 公式 API は無いため snapshot 専用。Phase 6 で IndexedDB 永続化に切替予定。
 */

/** 連携先の専門家 (連絡先 CRM の 1 レコード)。 */
export interface ShigyoContact {
  readonly id: string;
  readonly name: string;
  readonly firm: string;
  readonly phone?: string;
  readonly email?: string;
}

/** 相談の進行ステータス。 */
export type ShigyoConsultationStatus = '相談予約' | '相談中' | '対応中' | '完了';

/** 1 件の相談履歴。 */
export interface ShigyoConsultation {
  readonly id: string;
  readonly contactId: string;
  readonly date: string;
  readonly topic: string;
  readonly status: ShigyoConsultationStatus;
}

/** やり取り中の書類 (送付 / 受領)。 */
export interface ShigyoDocument {
  readonly id: string;
  readonly title: string;
  readonly direction: 'sent' | 'received';
  readonly date: string;
}

/** 士業サービス 1 つ分の snapshot。7 士業すべてがこの shape を共有する。 */
export interface ShigyoSnapshot {
  readonly contacts: ReadonlyArray<ShigyoContact>;
  readonly recentConsultations: ReadonlyArray<ShigyoConsultation>;
  readonly pendingDocuments: ReadonlyArray<ShigyoDocument>;
  readonly monthlyFee: number;
  readonly outstandingInvoice: number;
}
