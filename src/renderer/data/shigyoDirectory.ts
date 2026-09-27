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
import { calendarDateMessage, isCalendarDate } from '../../shared/isoDate';
import type { ShigyoConsultationStatus } from '../../shared/shigyoTypes';
import { moreThanChars } from '../../shared/inputCeiling';

/**
 * **保管した自由文を画面へ出すときの天井。数は入口が既に宣言している物**
 * (2026-09-23 · パス 419)。
 *
 * 入口 (フォームの関門) は 200,000 字を断るのに、**形 (復元の境界) は通す** ——
 * `COLLECTION_SHAPES` の `str` は長さを見ない。だから手で直した控えや古い版が
 * 書いた行は入口を通らずに入り、読み手には天井が無かった。実測 (直す前・1 欄 200,000 字):
 * この画面の総文字数が **素の 40〜450 倍**になる。
 *
 * ★ **形の側では断らない** —— `collectionShapes.ts` 自身が
 * 「**落とし過ぎは復元の欠落 = 別の事故になる**」と書いている。1 欄が長いだけで
 * 行ごと捨てると、利用者は復元でその行を失う。天井は**画面に出す所**に掛け、
 * 行は残す (パス 408 / 411 / 417 と同じ判断)。
 * ★ **正当な値は 1 つも変わらない** —— 入口がその長さで既に断っているので。
 */
export const MAX_CONTACT_NAME_CHARS = 64; // `parseShigyoContact` が 1〜64 文字で断る。
export const MAX_CONTACT_FIRM_CHARS = 80; // 同 80 文字。
export const MAX_CONTACT_PHONE_CHARS = 20; // `isLoosePhone` の `{3,20}`。
/**
 * 相談テーマの天井 (2026-09-23 · パス 420 で名前を付けた)。
 * それまで 80 は**関門の式の中の裸の数**で、画面から引けなかった ——
 * だから表示側は天井を持てず、復元で入った 200,000 字がそのまま一覧に出た (実測 201,933 字)。
 */
export const MAX_CONSULTATION_TOPIC_CHARS = 80;
// **`_CHARS` ではない** —— RFC 5321 の 254 は**オクテット**の上限で、文字数ではない
// (パス 419: `_CHARS` と名付けたら `ceilingUnitCensus` が「文字で数えろ」と正しく鳴った)。
/** メールアドレスの上限 —— **オクテット**。単位の理由は `members.ts` の同じ定数に書いた。 */
export const MAX_CONTACT_EMAIL_LEN = 254;


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
  // Stryker disable next-line ConditionalExpression: typeof を true 固定にしても
  // includes は SameValueZero 比較で配列は文字列のみ → 非文字列は決してヒットせず、
  // 返り値は全入力で同一 (等価変異)。型ガードとしての記述は残す。
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
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s) && s.length <= MAX_CONTACT_EMAIL_LEN;
}

/** 緩めの電話形式チェック (数字・ハイフン・括弧・+・空白)。 */
function isLoosePhone(s: string): boolean {
  return new RegExp(`^[0-9+()\\-\\s]{3,${MAX_CONTACT_PHONE_CHARS}}$`).test(s);
}

export function parseShigyoContact(input: {
  serviceId: ServiceId;
  name?: unknown;
  firm?: unknown;
  phone?: unknown;
  email?: unknown;
}): ShigyoContactEntry {
  const name = typeof input.name === 'string' ? input.name.trim() : '';
  if (name.length === 0 || moreThanChars(name, MAX_CONTACT_NAME_CHARS)) throw new Error(`氏名は 1〜${MAX_CONTACT_NAME_CHARS} 文字で入力してください`);

  const firm = typeof input.firm === 'string' ? input.firm.trim() : '';
  if (moreThanChars(firm, MAX_CONTACT_FIRM_CHARS)) throw new Error(`事務所名は ${MAX_CONTACT_FIRM_CHARS} 文字以内で入力してください`);

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
  // Stryker disable next-line StringLiteral: '' を別文字列にしても直後の
  // isCalendarDate を通らず、同一の 相談日 エラーになる (等価変異)。
  const date = typeof input.date === 'string' ? input.date.trim() : '';
  // 暦に在る日だけ (パス 115 —— それまでは正規表現だけで、2026-02-30 も 2026-13-45 も通していた)。
  if (!isCalendarDate(date)) throw new Error(`${calendarDateMessage('相談日')} (例: 2026-07-25)`);

  const topic = typeof input.topic === 'string' ? input.topic.trim() : '';
  if (topic.length === 0 || moreThanChars(topic, MAX_CONSULTATION_TOPIC_CHARS)) {
    throw new Error(`相談テーマは 1〜${MAX_CONSULTATION_TOPIC_CHARS} 文字で入力してください`);
  }

  if (!isConsultationStatus(input.status)) throw new Error('ステータスが不正です');

  return { serviceId: input.serviceId, date, topic, status: input.status };
}

/** 保存済み連絡先を編集フォームの初期値 (文字列) に変換する。 */
export function contactToForm(c: ShigyoContactEntry): {
  name: string; firm: string; phone: string; email: string;
} {
  return { name: c.name, firm: c.firm, phone: c.phone, email: c.email };
}

/**
 * **見出しの「連携 N 名」と「月次顧問料」に同梱の見本が混ざっていることの断り**
 * (2026-09-12 · パス 187)。
 *
 * `investments.ts` の `demoMixNote` / `fundDemoMixNote` と同じ家系 —— 一覧の行は
 * 「デモ」と印がつくが、**見出しの数と金額には印が付かない**。実測で、自分の
 * 連携先を 1 名登録した人の見出しは「連携 2 名 · 顧問料 ¥33,000/月」になる ——
 * 2 名のうち 1 名は見本で、その ¥33,000 は snapshot の値 (登録した連携先の
 * 顧問料ではない。この画面は連携先ごとの顧問料を持たない)。
 *
 * 顧問料は見本が 1 件でも在れば見本の値なので、**常に出所を言う**。
 *
 * @param demoCount 同梱の見本の連携先の数
 * @param userCount 利用者が登録した連携先の数
 * @param feeLabel 月次顧問料の表示文字列 (呼び側が `jpy` で整形して渡す)
 */
export function shigyoDemoMixNote(demoCount: number, userCount: number, feeLabel: string): string | null {
  // **文に NaN を埋めない。** 走査は関門に出てくる `demoCount` / `userCount` を
  // 挙げたが、実測ではどちらが非有限でも「連携 NaN 名」という文章が出ていた。
  if (!Number.isFinite(demoCount) || !Number.isFinite(userCount)) return null;
  if (demoCount === 0) return null;
  if (userCount === 0) {
    return `表示中の連携先 ${demoCount} 名と月次顧問料 ${feeLabel} は同梱の見本です（自分の連携先はまだ登録されていません）。`;
  }
  return `「連携 ${demoCount + userCount} 名」には同梱の見本 ${demoCount} 名が含まれています（自分が登録した連携先は ${userCount} 名）。月次顧問料 ${feeLabel} は見本の値です。`;
}
