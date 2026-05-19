/**
 * 士業連携 — 共通スナップショット型。
 *
 * 7 士業サービス (tax-accountant / labor-consultant / lawyer /
 * judicial-scrivener / admin-scrivener / sme-consultant / patent-attorney)
 * が同一構造のスナップショットを返すため、ここで一回だけ型定義する。
 *
 * PR #7 R1 #2 で指摘された「4 interface × 7 fetcher = 28 個の重複定義」を
 * 解消するために `src/shared/` 配下に集約。main / renderer 双方から
 * `import type` 可能 (`scripts/check-import-boundaries.cjs` の shared
 * boundary に整合)。将来 1 つフィールドを追加するときも 1 箇所更新で済む。
 *
 * 注: 弁護士 (lawyer) / 弁理士 (patent-attorney) は業務独占資格のため、
 * 連携先 (`ShigyoContact`) と相談履歴 (`ShigyoConsultation`) を画面表示
 * する際は「これは助言ではなく記録の表示のみ」の disclaimer が UI 側で
 * 必須 (PR #7 R1 #5)。
 */

export type ShigyoConsultationStatus =
  | '相談予約'
  | '相談中'
  | '対応中'
  | '完了';

export interface ShigyoContact {
  readonly id: string;
  readonly name: string;
  readonly firm: string;
  readonly phone?: string;
  readonly email?: string;
}

export interface ShigyoConsultation {
  readonly id: string;
  readonly contactId: string;
  readonly date: string;
  readonly topic: string;
  readonly status: ShigyoConsultationStatus;
}

export interface ShigyoDocument {
  readonly id: string;
  readonly title: string;
  readonly direction: 'sent' | 'received';
  readonly date: string;
}

export interface ShigyoSnapshot {
  readonly contacts: ReadonlyArray<ShigyoContact>;
  readonly recentConsultations: ReadonlyArray<ShigyoConsultation>;
  readonly pendingDocuments: ReadonlyArray<ShigyoDocument>;
  readonly monthlyFee: number;
  readonly outstandingInvoice: number;
}
