/**
 * LINE 公式アカウント (Messaging API) —— アカウントの情報と、今月の配信数を読む。**読み取りだけ** (2026-11-18)。
 *
 * 判定と正規化はここに 1 つ置き、デスクトップ版 (`main/clients/line.ts`) とブラウザ版
 * (`renderer/network/liveRead`) の両方が同じ関数を通る。このモジュール自体は網に触れない ——
 * 通信手段は呼び出し側が渡す (検査でも実物と同じ経路を通せる)。
 *
 * ## 何を読むか
 *
 * | 照会 | 使う欄 |
 * | --- | --- |
 * | `GET /v2/bot/info` | `displayName`・`basicId`・`chatMode` |
 * | `GET /v2/bot/message/quota` | `type` (`limited` / `none`)・`value` (上限) |
 * | `GET /v2/bot/message/quota/consumption` | `totalUsage` (今月の配信数) |
 *
 * メッセージの送信・友だちの一覧・友だちのプロフィールの照会は 1 つも持たない。
 * `/v2/bot/info` が返す `userId` (アカウントの内部 ID) と `pictureUrl` は読まない。
 *
 * ## 読めなかった物を「0」や「上限なし」と混ぜない
 *
 * - 配信数・上限は **0 以上の整数**だけを数として受ける。読めなければ `null` で、画面が「読めません」と述べる
 *   (`0 通` は「今月は 1 通も送っていない」という事実の主張になる)。
 * - 上限の種類が `limited` でも `none` でもなければ `null`。`none` (上限なし) と混ぜない。
 * - 残りの通数は、上限と配信数の両方が読めたときだけ出す。配信数が上限を超えていれば、超えた通数を述べる。
 */
import { displayField } from '../apiResponse';

/** LINE Messaging API の基底。送り先はこの定数だけで、利用者の入力からは作らない。 */
export const LINE_API_BASE = 'https://api.line.me';

/** アカウントの情報の照会の道 (基底は送る所で付ける —— 宛先の走査が送信の行で基底を見られるように)。 */
export const LINE_INFO_PATH = '/v2/bot/info';

/** 今月の配信の上限の照会の道。 */
export const LINE_QUOTA_PATH = '/v2/bot/message/quota';

/** 今月の配信数の照会の道。 */
export const LINE_CONSUMPTION_PATH = '/v2/bot/message/quota/consumption';

/** 応答モード。`chat` = 人がチャットで応答、`bot` = Webhook / 自動で応答。 */
export type LineChatMode = 'chat' | 'bot';

/** 配信の上限の種類。`limited` = 上限あり、`none` = 上限なし。 */
export type LineQuotaType = 'limited' | 'none';

export interface LineSnapshot {
  /** アカウントの表示名。読めなければ空文字。 */
  readonly displayName: string;
  /** ベーシック ID (`@` で始まる)。読めなければ空文字。 */
  readonly basicId: string;
  /** 応答モード。読めなければ `null`。 */
  readonly chatMode: LineChatMode | null;
  /** 配信の上限の種類。読めなければ `null`。 */
  readonly quotaType: LineQuotaType | null;
  /** 配信の上限 (通)。上限なし・読めないときは `null`。 */
  readonly quotaLimit: number | null;
  /** 今月の配信数 (通)。読めなければ `null`。 */
  readonly usage: number | null;
}

/** 表示名が空だったときの文。 */
export const LINE_NAME_MISSING = '(名前なし)';

/** 応答モードが読めなかったときの文。 */
export const LINE_CHAT_MODE_UNREADABLE = '応答モードが読めません';

/** 配信の上限が読めなかったときの文。 */
export const LINE_QUOTA_UNREADABLE = '配信の上限が読めません';

/** 上限が無いときの文。 */
export const LINE_NO_QUOTA = '上限なし';

/** 今月の配信数が読めなかったときの文。 */
export const LINE_USAGE_UNREADABLE = '今月の配信数が読めません';

/** 残りの通数を出せなかったときの文。 */
export const LINE_REMAINING_UNKNOWN = '算定できません (上限か配信数が読めないため)';

/** `obj[name]`。`obj` が物でなくても投げない。 */
function field(obj: unknown, name: string): unknown {
  return (Object(obj) as Record<string, unknown>)[name];
}

/** 通数 (0 以上の整数)。読めなければ `null` —— 文字列・小数・負の値・非有限を数として受けない。 */
export function lineCount(v: unknown): number | null {
  return Number.isInteger(v) && (v as number) >= 0 ? (v as number) : null;
}

/** 応答モードを読む。知らない値は `null`。 */
export function lineChatMode(v: unknown): LineChatMode | null {
  return v === 'chat' || v === 'bot' ? v : null;
}

/** アカウントの情報の照会から読んだ物。 */
export type LineInfo = Pick<LineSnapshot, 'displayName' | 'basicId' | 'chatMode'>;

/** アカウントの情報の応答を読む。 */
export function normalizeLineInfo(body: unknown): LineInfo {
  return {
    displayName: displayField(field(body, 'displayName')),
    basicId: displayField(field(body, 'basicId')),
    chatMode: lineChatMode(field(body, 'chatMode')),
  };
}

/** 配信の上限の照会から読んだ物。 */
export type LineQuota = Pick<LineSnapshot, 'quotaType' | 'quotaLimit'>;

/** 配信の上限の応答を読む。上限なし (`none`) のときは、`value` が付いていても上限として受けない。 */
export function normalizeLineQuota(body: unknown): LineQuota {
  const type = field(body, 'type');
  if (type === 'limited') return { quotaType: 'limited', quotaLimit: lineCount(field(body, 'value')) };
  return { quotaType: type === 'none' ? 'none' : null, quotaLimit: null };
}

/** 今月の配信数の応答を読む。 */
export function normalizeLineUsage(body: unknown): number | null {
  return lineCount(field(body, 'totalUsage'));
}

/** 通数の文 (桁区切りつき)。 */
export function lineCountText(n: number): string {
  return `${n.toLocaleString('ja-JP')} 通`;
}

/** 画面に出すアカウントの名前。空なら理由を述べる (空欄にしない)。 */
export function lineAccountTitle(displayName: string): string {
  return displayName === '' ? LINE_NAME_MISSING : displayName;
}

/** 画面に出す応答モードの文。 */
export function lineChatModeText(mode: LineChatMode | null): string {
  if (mode === 'chat') return 'チャット (人が応答)';
  if (mode === 'bot') return 'Bot (自動で応答)';
  return LINE_CHAT_MODE_UNREADABLE;
}

/** 画面に出す配信の上限の文。 */
export function lineQuotaText(snap: LineQuota): string {
  if (snap.quotaType === 'none') return LINE_NO_QUOTA;
  return snap.quotaLimit === null ? LINE_QUOTA_UNREADABLE : lineCountText(snap.quotaLimit);
}

/** 画面に出す今月の配信数の文。 */
export function lineUsageText(usage: number | null): string {
  return usage === null ? LINE_USAGE_UNREADABLE : lineCountText(usage);
}

/**
 * 画面に出す残りの通数の文。上限と配信数の両方が読めたときだけ数を出す。
 * 配信数が上限を超えているとき (追加メッセージを送っている) は、超えた通数を述べる。
 */
export function lineRemainingText(snap: Pick<LineSnapshot, 'quotaType' | 'quotaLimit' | 'usage'>): string {
  if (snap.quotaType === 'none') return LINE_NO_QUOTA;
  if (snap.quotaLimit === null || snap.usage === null) return LINE_REMAINING_UNKNOWN;
  if (snap.usage > snap.quotaLimit) return `上限を ${lineCountText(snap.usage - snap.quotaLimit)}超えています`;
  return lineCountText(snap.quotaLimit - snap.usage);
}

/**
 * 読めなかった物を名指しする 1 文。全部読めていれば `null`。
 * 3 つの照会は互いに独立なので、読めなかった物をすべて挙げる。
 */
export function lineIntakeNote(snap: LineSnapshot): string | null {
  const parts: string[] = [];
  if (snap.displayName === '' && snap.basicId === '') parts.push('アカウントの情報');
  if (snap.quotaType !== 'none' && snap.quotaLimit === null) parts.push('配信の上限');
  if (snap.usage === null) parts.push('今月の配信数');
  if (parts.length === 0) return null;
  return `LINE の応答から${parts.join('・')}を読み取れませんでした (0 や「上限なし」という意味ではありません)。`;
}

/**
 * 通信手段。URL と `RequestInit` を受け取り、**JSON として読めた本体**を返す。
 * デスクトップ版は Node の fetch を、ブラウザ版は利用者のプロキシ経由の fetch を渡す。
 */
export type LineJsonFetch = (url: string, init: RequestInit) => Promise<unknown>;

/** 3 つの照会に共通のヘッダ。 */
export function lineHeaders(token: string): Record<string, string> {
  return { Authorization: `Bearer ${token}` };
}

/** アカウントの情報・配信の上限・今月の配信数を取得する。**通信手段は呼び出し側が渡す。** */
export async function fetchLineSnapshotWith(jsonFetch: LineJsonFetch, token: string): Promise<LineSnapshot> {
  const headers = lineHeaders(token);
  const info = normalizeLineInfo(await jsonFetch(`${LINE_API_BASE}${LINE_INFO_PATH}`, { headers }));
  const quota = normalizeLineQuota(await jsonFetch(`${LINE_API_BASE}${LINE_QUOTA_PATH}`, { headers }));
  const usage = normalizeLineUsage(await jsonFetch(`${LINE_API_BASE}${LINE_CONSUMPTION_PATH}`, { headers }));
  return { ...info, ...quota, usage };
}
