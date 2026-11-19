/**
 * 士業 (専門家) 連携の共通型。
 *
 * 8 つの士業サービス (税理士 / 公認会計士 / 社労士 / 弁護士 / 司法書士 /
 * 行政書士 / 中小企業診断士 / 弁理士) は同一の軽量 CRM 構造 — 連絡先 /
 * 相談履歴 / 書類 / 月次請求 — を共有する。各 client がこの型を import し、
 * UI は `components/ShigyoConsole.tsx` がこの型で描画する。
 *
 * 公式 API は無いため、画面の土台は見本を持たない空の snapshot
 * (`buildShigyoSnapshot`) で、利用者が追加した専門家 / 相談履歴 / 書類と
 * 顧問料は record store 永続化済み — `data/shigyoDirectory.ts` の
 * SHIGYO_CONTACTS_COLLECTION / SHIGYO_CONSULTATIONS_COLLECTION /
 * SHIGYO_DOCUMENTS_COLLECTION を ShigyoConsole が useCollection で読み書きする。
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

/** 士業サービス 1 つ分の snapshot。8 士業すべてがこの shape を共有する。 */
export interface ShigyoSnapshot {
  readonly contacts: ReadonlyArray<ShigyoContact>;
  readonly recentConsultations: ReadonlyArray<ShigyoConsultation>;
  readonly pendingDocuments: ReadonlyArray<ShigyoDocument>;
  readonly monthlyFee: number;
  readonly outstandingInvoice: number;
}

/** 複数の士業 snapshot の月次顧問料を合算する (横断 KPI 用)。 */
export function sumShigyoMonthlyFees(snapshots: readonly ShigyoSnapshot[]): number {
  return snapshots.reduce((sum, s) => sum + s.monthlyFee, 0);
}

/**
 * **端末内の土台**となる snapshot を組み立てる (2026-11-18)。
 *
 * 連絡先・相談・書類・顧問料は、利用者が record store に登録した物が正
 * (`renderer/data/shigyoDirectory.ts`) で、主プロセスからは読めない。
 * だから取得が返すのは利用者のデータではなく、**見本の人も金額も持たない
 * 空の土台**である。同梱の見本 (架空の専門家と ¥33,000 の顧問料) を返すと、
 * 自分の専門家を登録していない人の画面に他人の名前と金額が出続ける。
 *
 * 組み立てはここに 1 つだけ置く —— 主プロセスの fetcher とブラウザ版の
 * `web-shim.ts` が同じ関数を呼ぶ (水耕栽培の `buildHydroponicsSnapshot` と
 * 同じ形。片方だけに置くと、もう片方で土台が同梱見本に戻る)。
 */
export function buildShigyoSnapshot(): ShigyoSnapshot {
  return { contacts: [], recentConsultations: [], pendingDocuments: [], monthlyFee: 0, outstandingInvoice: 0 };
}

/** 複数の士業 snapshot の未払い請求額を合算する (横断 KPI 用)。 */
export function sumShigyoOutstanding(snapshots: readonly ShigyoSnapshot[]): number {
  return snapshots.reduce((sum, s) => sum + s.outstandingInvoice, 0);
}
