/**
 * 士業連携のユーザー登録データ (Phase 6) — 連絡先と相談履歴を record store に
 * 永続化する。8 士業ページ共通の `ShigyoConsole` がここを読み書きし、
 * snapshot のデモ行と結合して表示する。
 *
 * 規約は `investments.ts` / `members.ts` と同じ:
 *   - コレクション名 + payload 型 + parse 検証 (throw は日本語メッセージ)
 *   - serviceId フィールドで 8 士業を 1 コレクションに同居させ、ページ側で
 *     自分の serviceId のものだけをフィルタする
 */

import type { ServiceId } from '../../shared/serviceId';
import type { ShigyoConsultationStatus } from '../../shared/shigyoTypes';

export const SHIGYO_CONTACTS_COLLECTION = 'shigyo-contacts';
export const SHIGYO_CONSULTATIONS_COLLECTION = 'shigyo-consultations';

/** 相談ステータスの選択肢 (表示順)。 */
export const CONSULTATION_STATUSES: readonly ShigyoConsultationStatus[] = [
  '相談予約',
  '相談中',
  '対応中',
  '完了',
];

function isConsultationStatus(v: unknown): v is ShigyoConsultationStatus {
  return typeof v === 'string' && (CONSULTATION_STATUSES as readonly string[]).includes(v);
}

/** ユーザー登録の専門家 (連絡先)。 */
export interface ShigyoContactEntry extends Record<string, unknown> {
  /** どの士業ページの連絡先か。 */
  readonly serviceId: ServiceId;
  readonly name: string;
  /** 事務所名 (任意)。 */
  readonly firm: string;
  /** 電話番号 (任意)。 */
  readonly phone: string;
  /** メールアドレス (任意)。 */
  readonly email: string;
}

/** 緩めのメール形式チェック (保存するだけで送信はしない)。 */
function isLooseEmail(s: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s) && s.length <= 254;
}

/** 緩めの電話形式チェック (数字・ハイフン・括弧・+・空白)。 */
function isLoosePhone(s: string): boolean {
  return /^[0-9+()\-\s]{3,20}$/.test(s);
}

export function parseShigyoContact(input: {
  serviceId: ServiceId;
  name?: unknown;
  firm?: unknown;
  phone?: unknown;
  email?: unknown;
}): ShigyoContactEntry {
  const name = typeof input.name === 'string' ? input.name.trim() : '';
  if (name.length === 0 || name.length > 64) throw new Error('氏名は 1〜64 文字で入力してください');

  const firm = typeof input.firm === 'string' ? input.firm.trim() : '';
  if (firm.length > 80) throw new Error('事務所名は 80 文字以内で入力してください');

  const phone = typeof input.phone === 'string' ? input.phone.trim() : '';
  if (phone !== '' && !isLoosePhone(phone)) throw new Error('電話番号の形式が正しくありません');

  const email = typeof input.email === 'string' ? input.email.trim() : '';
  if (email !== '' && !isLooseEmail(email)) throw new Error('メールアドレスの形式が正しくありません');

  return { serviceId: input.serviceId, name, firm, phone, email };
}

/** ユーザー登録の相談履歴。 */
export interface ShigyoConsultationEntry extends Record<string, unknown> {
  readonly serviceId: ServiceId;
  /** 相談日 (YYYY-MM-DD)。 */
  readonly date: string;
  readonly topic: string;
  readonly status: ShigyoConsultationStatus;
}

export function parseShigyoConsultation(input: {
  serviceId: ServiceId;
  date?: unknown;
  topic?: unknown;
  status?: unknown;
}): ShigyoConsultationEntry {
  const date = typeof input.date === 'string' ? input.date.trim() : '';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('相談日は YYYY-MM-DD 形式で入力してください (例: 2026-07-25)');

  const topic = typeof input.topic === 'string' ? input.topic.trim() : '';
  if (topic.length === 0 || topic.length > 80) throw new Error('相談テーマは 1〜80 文字で入力してください');

  if (!isConsultationStatus(input.status)) throw new Error('ステータスが不正です');

  return { serviceId: input.serviceId, date, topic, status: input.status };
}

/** 保存済み連絡先を編集フォームの初期値 (文字列) に変換する。 */
export function contactToForm(c: ShigyoContactEntry): {
  name: string; firm: string; phone: string; email: string;
} {
  return { name: c.name, firm: c.firm, phone: c.phone, email: c.email };
}
