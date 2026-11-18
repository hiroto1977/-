/**
 * Discord (チャット) —— ボットが参加しているサーバーの一覧を読む。**読み取りだけ** (2026-11-18)。
 *
 * 判定と正規化はここに 1 つ置き、デスクトップ版 (`main/clients/discord.ts`) とブラウザ版
 * (`renderer/network/liveRead`) の両方が同じ関数を通る。このモジュール自体は網に触れない ——
 * 通信手段は呼び出し側が渡す (検査でも実物と同じ経路を通せる)。
 *
 * ## 何を読むか
 *
 * | 照会 | 使う欄 |
 * | --- | --- |
 * | `GET /users/@me/guilds?limit=21&with_counts=true` | 配列の各要素の `id`・`name`・`approximate_member_count` |
 *
 * 書き込み (メッセージの送信・サーバーやチャンネルの変更ほか) は 1 つも持たない。
 * メッセージの本文・参加者の名前・チャンネルの一覧は照会しない (読むのはサーバーの名前と参加人数だけ)。
 *
 * ## 「ほかにも在る」の決め方
 *
 * 表示する件数 ({@link DISCORD_GUILD_LIMIT}) より **1 件多く**照会し、それが返ってきたら
 * 「ほかにも在る」と述べる (画面に出すのは先頭の {@link DISCORD_GUILD_LIMIT} 件まで)。
 *
 * ## 読めなかった物を「無い」と混ぜない
 *
 * - 参加人数は 0 以上の整数だけを受ける。それ以外は「参加人数が読めません」(0 人とは言わない)。
 * - 一覧そのものが読めなかった (応答が配列でない) → `guildsRead: false`。画面が「0 件」と言い分ける。
 */
import { apiNumberOf, displayField, objectRows } from '../apiResponse';

/** Discord API の基底。送り先はこの定数だけで、利用者の入力からは作らない。 */
export const DISCORD_API_BASE = 'https://discord.com/api/v10';

/** 参加しているサーバーを何件まで画面に出すか。 */
export const DISCORD_GUILD_LIMIT = 20;

/**
 * サーバーの一覧の道 (基底は送る所で付ける —— 宛先の走査が送信の行で基底を見られるように)。
 * 値はどれも定数で、利用者の入力も相手の応答も入らない。
 */
export const DISCORD_GUILDS_PATH = `/users/@me/guilds?limit=${DISCORD_GUILD_LIMIT + 1}&with_counts=true`;

/** 1 つのサーバー。 */
export interface DiscordGuild {
  /** サーバーの ID。読めなければ空文字。 */
  readonly id: string;
  /** サーバーの名前。読めなければ空文字。 */
  readonly name: string;
  /** 参加人数 (Discord の概数)。読めなければ `null`。 */
  readonly memberCount: number | null;
}

export interface DiscordSnapshot {
  readonly guilds: readonly DiscordGuild[];
  /** サーバーの一覧を読めたか (応答が配列だった)。 */
  readonly guildsRead: boolean;
  /** 表示した分のほかにもサーバーが在るか。 */
  readonly more: boolean;
}

/** サーバーの名前が空だったときの文。 */
export const DISCORD_NAME_MISSING = '(名前なし)';

/** 参加人数が読めなかったときの文。 */
export const DISCORD_MEMBERS_UNREADABLE = '参加人数が読めません';

/** 参加人数の欄を読む。0 以上の整数 (数か、10 進の文字列) だけを受ける。 */
export function discordMemberCount(v: unknown): number | null {
  const n = apiNumberOf(v);
  return Number.isInteger(n) && (n as number) >= 0 ? n : null;
}

interface GuildRow {
  readonly id?: unknown;
  readonly name?: unknown;
  readonly approximate_member_count?: unknown;
}

/** サーバーの一覧の応答を行へ。画面に出すのは先頭の {@link DISCORD_GUILD_LIMIT} 件まで。 */
export function normalizeDiscordGuilds(body: unknown): DiscordSnapshot {
  const rows = objectRows<GuildRow>(body);
  return {
    guilds: rows.slice(0, DISCORD_GUILD_LIMIT).map((row) => ({
      id: displayField(row.id),
      name: displayField(row.name),
      memberCount: discordMemberCount(row.approximate_member_count),
    })),
    guildsRead: Array.isArray(body),
    more: rows.length > DISCORD_GUILD_LIMIT,
  };
}

/** 画面に出すサーバーの名前。空なら理由を述べる (空欄にしない)。 */
export function discordGuildTitle(guild: Pick<DiscordGuild, 'name'>): string {
  return guild.name === '' ? DISCORD_NAME_MISSING : guild.name;
}

/** 画面に出す参加人数の文 (桁区切りつき)。Discord が返すのは概数なので「約」を付ける。 */
export function discordMembersText(memberCount: number | null): string {
  return memberCount === null ? DISCORD_MEMBERS_UNREADABLE : `参加 約 ${memberCount.toLocaleString('ja-JP')} 人`;
}

/** 読めなかった物を名指しする 1 文。読めていれば `null`。 */
export function discordIntakeNote(snap: Pick<DiscordSnapshot, 'guildsRead'>): string | null {
  return snap.guildsRead
    ? null
    : 'Discord の応答からサーバーの一覧を読み取れませんでした (0 件という意味ではありません)。';
}

/** 画面が見せている範囲の断り。見ていない物が無ければ `null`。 */
export function discordScopeNote(snap: Pick<DiscordSnapshot, 'more'>): string | null {
  return snap.more
    ? `参加しているサーバーはほかにもあります (先頭 ${DISCORD_GUILD_LIMIT} 件までを表示しています)。`
    : null;
}

/**
 * 通信手段。URL と `RequestInit` を受け取り、**JSON として読めた本体**を返す。
 * デスクトップ版は Node の fetch を、ブラウザ版は利用者のプロキシ経由の fetch を渡す。
 * この照会は**配列を直接返す**ので、封筒が物であることは要求しない (配列でなければここが「読めなかった」と述べる)。
 */
export type DiscordJsonFetch = (url: string, init: RequestInit) => Promise<unknown>;

/** 送るヘッダ。鍵は `Authorization: Bot` に置く (ボットのトークンの方式)。 */
export function discordHeaders(token: string): Record<string, string> {
  return { Authorization: `Bot ${token}` };
}

/** ボットが参加しているサーバーを取得する。**通信手段は呼び出し側が渡す。** */
export async function fetchDiscordSnapshotWith(jsonFetch: DiscordJsonFetch, token: string): Promise<DiscordSnapshot> {
  const headers = discordHeaders(token);
  return normalizeDiscordGuilds(await jsonFetch(`${DISCORD_API_BASE}${DISCORD_GUILDS_PATH}`, { headers }));
}
