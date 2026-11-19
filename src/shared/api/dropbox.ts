/**
 * Dropbox —— アカウント・容量・最近のアイテムを読む。**読み取りだけ** (2026-11-19)。
 *
 * 判定と正規化はここに 1 つ置き、デスクトップ版 (`main/clients/dropbox.ts`) とブラウザ版
 * (`renderer/network/liveRead`) の両方が同じ関数を通る。このモジュール自体は網に触れない ——
 * 通信手段は呼び出し側が渡す (検査でも実物と同じ経路を通せる)。
 *
 * ## 何を読むか (Dropbox API v2・すべて POST)
 *
 * | 照会 | 使う欄 |
 * | --- | --- |
 * | `POST /2/users/get_current_account` | `name.display_name`・`email` |
 * | `POST /2/users/get_space_usage` | `used`・`allocation` (個人: `allocated` / チーム: `user_within_team.allocated`) |
 * | `POST /2/files/list_folder` (path は空 = ルート) | `entries[]` の `.tag`・`name`・`id`・`size`・`server_modified`、`has_more` |
 *
 * 書き込み (アップロード・削除・共有リンクの作成ほか) は 1 つも持たない。トークンは
 * Dropbox App Console で作る自前アプリのアクセストークン (権限は読み取りだけ:
 * `account_info.read` / `files.metadata.read`) で足りる —— 画面がそう案内する。
 *
 * ## 読めなかった物は 0 にしない
 *
 * 容量・サイズが読めなければ `null` で持ち、画面が「容量不明」と述べる (`0` と刷ると
 * 「空っぽ」という事実の主張になる · 法則 `blank-states-its-reason`)。
 * 一覧そのものが読めなかったとき (`entries` が配列でない) は `entriesRead: false` で返し、
 * 画面が「0 件」と「読めなかった」を言い分ける (パス 263 / 264 の形)。
 */
import { displayField, finiteNumberOf, objectRows, readArrayField } from '../apiResponse';
import { parseTimestamp } from '../isoDate';
import { localIsoDate } from '../localDate';

/** Dropbox API の基底。送り先はこの定数だけで、利用者の入力からは作らない。 */
export const DROPBOX_API_BASE = 'https://api.dropboxapi.com';

/** 最近のアイテムを何件まで読むか (ルート直下)。 */
export const DROPBOX_ENTRY_LIMIT = 20;

/** アカウントの道。 */
export const DROPBOX_ACCOUNT_PATH = '/2/users/get_current_account';

/** 容量の道。 */
export const DROPBOX_SPACE_PATH = '/2/users/get_space_usage';

/** 一覧の道。 */
export const DROPBOX_LIST_PATH = '/2/files/list_folder';

/** 1 件のアイテム (ファイル / フォルダ)。 */
export interface DropboxEntry {
  readonly id: string;
  readonly name: string;
  /** `.tag` の値 ('file' / 'folder' / 'deleted')。読めなければ空文字。 */
  readonly kind: string;
  /** バイト数 (ファイルだけ)。フォルダ・読めない値は `null`。 */
  readonly sizeBytes: number | null;
  /** 更新日 (`YYYY-MM-DD`・端末の時間帯)。読めなければ `null`。 */
  readonly modified: string | null;
}

export interface DropboxSnapshot {
  readonly accountName: string;
  readonly email: string;
  /** アカウント応答を読めたか (`account_id` が文字列だった)。 */
  readonly accountRead: boolean;
  /** 使用量 (バイト)。読めなければ `null`。 */
  readonly usedBytes: number | null;
  /** 割り当て (バイト)。読めなければ `null`。 */
  readonly allocatedBytes: number | null;
  /** 容量の応答を読めたか (`used` が数だった)。 */
  readonly spaceRead: boolean;
  readonly entries: readonly DropboxEntry[];
  /** 一覧を読めたか (`entries` が配列だった)。 */
  readonly entriesRead: boolean;
  /** ルート直下にまだ続きがあるか。 */
  readonly hasMore: boolean;
}

/** 物である欄を取り出す (読めなければ null)。 */
function objectField(obj: unknown, field: string): Record<string, unknown> | null {
  if (obj === null || typeof obj !== 'object' || Array.isArray(obj)) return null;
  const v = (obj as Record<string, unknown>)[field];
  return v !== null && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

/** アカウントの応答を正規化する。 */
export function normalizeDropboxAccount(body: unknown): {
  readonly accountName: string;
  readonly email: string;
  readonly read: boolean;
} {
  const root = objectField({ root: body }, 'root');
  if (root === null) return { accountName: '', email: '', read: false };
  const name = objectField(root, 'name');
  return {
    accountName: name === null ? '' : displayField(name.display_name),
    email: displayField(root.email),
    read: typeof root.account_id === 'string' && root.account_id !== '',
  };
}

/** 容量の応答を正規化する。割り当ては個人なら `allocation.allocated`、チームなら自分の割り当てを優先する。 */
export function normalizeDropboxSpace(body: unknown): {
  readonly usedBytes: number | null;
  readonly allocatedBytes: number | null;
  readonly read: boolean;
} {
  const root = objectField({ root: body }, 'root');
  if (root === null) return { usedBytes: null, allocatedBytes: null, read: false };
  const used = finiteNumberOf(root.used);
  const allocation = objectField(root, 'allocation');
  let allocated: number | null = null;
  if (allocation !== null) {
    allocated = finiteNumberOf(allocation.allocated);
    const mine = objectField(allocation, 'user_within_team');
    if (mine !== null) allocated = finiteNumberOf(mine.allocated) ?? allocated;
  }
  return { usedBytes: used, allocatedBytes: allocated, read: used !== null };
}

/** 更新日時 (ISO 文字列) → `YYYY-MM-DD` (端末の時間帯)。読めなければ `null`。 */
export function dropboxModifiedDate(v: unknown): string | null {
  const d = parseTimestamp(v);
  return d === null ? null : localIsoDate(d);
}

/** 一覧の応答を行へ。 */
export function normalizeDropboxEntries(body: unknown): {
  readonly entries: readonly DropboxEntry[];
  readonly read: boolean;
  readonly hasMore: boolean;
} {
  const data = readArrayField(body, 'entries');
  const root = objectField({ root: body }, 'root');
  return {
    entries: objectRows<Record<string, unknown>>(data.rows).map((row) => ({
      id: displayField(row.id),
      name: displayField(row.name),
      kind: displayField(row['.tag'], 32),
      sizeBytes: finiteNumberOf(row.size),
      modified: dropboxModifiedDate(row.server_modified),
    })),
    read: data.read,
    hasMore: root !== null && root.has_more === true,
  };
}

/** 3 つの応答から画面の形を組む。 */
export function buildDropboxSnapshot(accountBody: unknown, spaceBody: unknown, listBody: unknown): DropboxSnapshot {
  const account = normalizeDropboxAccount(accountBody);
  const space = normalizeDropboxSpace(spaceBody);
  const list = normalizeDropboxEntries(listBody);
  return {
    accountName: account.accountName,
    email: account.email,
    accountRead: account.read,
    usedBytes: space.usedBytes,
    allocatedBytes: space.allocatedBytes,
    spaceRead: space.read,
    entries: list.entries,
    entriesRead: list.read,
    hasMore: list.hasMore,
  };
}

/** バイト数の表示。読めなければ「容量不明」 (0 と刷らない)。 */
export const DROPBOX_SIZE_UNKNOWN = '容量不明';

export function dropboxSizeText(bytes: number | null): string {
  if (bytes === null) return DROPBOX_SIZE_UNKNOWN;
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB', 'TB'] as const;
  let value = bytes;
  let unit: (typeof units)[number] = 'KB';
  for (const u of units) {
    value /= 1024;
    unit = u;
    if (value < 1024) break;
  }
  return `${value.toLocaleString('en-US', { maximumFractionDigits: 1 })} ${unit}`;
}

/** 使用率 (%)。割り当てが読めない・0 のときは `null` (「—」と述べる)。 */
export function dropboxUsagePct(snap: Pick<DropboxSnapshot, 'usedBytes' | 'allocatedBytes'>): number | null {
  if (snap.usedBytes === null || snap.allocatedBytes === null || snap.allocatedBytes <= 0) return null;
  return Math.round((snap.usedBytes / snap.allocatedBytes) * 1000) / 10;
}

/** アイテムの種別の表示名。知らない種別は相手の語をそのまま (天井つき) 出す。 */
export function dropboxKindLabel(kind: string): string {
  if (kind === 'file') return 'ファイル';
  if (kind === 'folder') return 'フォルダ';
  if (kind === 'deleted') return '削除済み';
  return kind === '' ? '種別不明' : kind;
}

/**
 * 読めなかった照会を名指しする 1 文。全部読めていれば `null`。
 * 「0 件」と「読めなかった」を混ぜない。
 */
export function dropboxIntakeNote(
  snap: Pick<DropboxSnapshot, 'accountRead' | 'spaceRead' | 'entriesRead'>,
): string | null {
  const missing: string[] = [];
  if (!snap.accountRead) missing.push('アカウント');
  if (!snap.spaceRead) missing.push('容量');
  if (!snap.entriesRead) missing.push('最近のアイテム');
  if (missing.length === 0) return null;
  return `Dropbox の応答から${missing.join('と')}を読み取れませんでした (0 件という意味ではありません)。`;
}

/**
 * 通信手段。URL と `RequestInit` を受け取り、**JSON として読めた本体**を返す。
 * デスクトップ版は Node の fetch を、ブラウザ版は利用者のプロキシ経由の fetch を渡す。
 */
export type DropboxJsonFetch = (url: string, init: RequestInit) => Promise<unknown>;

/** 3 つの照会に共通のヘッダ。 */
export function dropboxHeaders(token: string): Record<string, string> {
  return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
}

/** 引数の無い照会の要求 (アカウント・容量)。 */
export function dropboxEmptyRequestInit(token: string): RequestInit {
  return { method: 'POST', headers: dropboxHeaders(token) };
}

/** 一覧の照会の要求。本文はルート直下の固定の照会だけを持つ (利用者の入力は入れない)。 */
export function dropboxListRequestInit(token: string): RequestInit {
  return {
    method: 'POST',
    headers: dropboxHeaders(token),
    body: JSON.stringify({ path: '', recursive: false, limit: DROPBOX_ENTRY_LIMIT }),
  };
}

/** アカウント・容量・最近のアイテムを取得する。**通信手段は呼び出し側が渡す。** */
export async function fetchDropboxSnapshotWith(jsonFetch: DropboxJsonFetch, token: string): Promise<DropboxSnapshot> {
  const accountBody = await jsonFetch(`${DROPBOX_API_BASE}${DROPBOX_ACCOUNT_PATH}`, dropboxEmptyRequestInit(token));
  const spaceBody = await jsonFetch(`${DROPBOX_API_BASE}${DROPBOX_SPACE_PATH}`, dropboxEmptyRequestInit(token));
  const listBody = await jsonFetch(`${DROPBOX_API_BASE}${DROPBOX_LIST_PATH}`, dropboxListRequestInit(token));
  return buildDropboxSnapshot(accountBody, spaceBody, listBody);
}
