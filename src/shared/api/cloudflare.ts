import { jsonBody } from './http';
import { optionalString, requireObject, requireString } from '../apiResponse';
import {
  CLOUDFLARE_DNS_FIELDS,
  CLOUDFLARE_PURGE_FIELDS,
  CLOUDFLARE_PURGE_NEEDS_TARGET,
  checkWriteFields,
  describeWriteFieldFailure,
} from '../writeFieldLimits';

/**
 * **Cloudflare の書き込み 2 経路 (`create-dns-record` / `purge-cache`) —— 両ビルドが同じ関数を通る**
 * (2026-09-19 · パス 321)。
 *
 * それまで main (`clients/cloudflare.ts`) とブラウザ版 (`saasWriteWeb.ts`) に、欄の判定・
 * 本文の組み立て・URL・封筒 (`{success, errors, result}`) の読みが 1 つずつ在った。
 * 判定は台帳 (`CLOUDFLARE_*_FIELDS`) で既に 1 つだったが、**封筒の読みは 2 つ**で、
 * main は `!payload.success` (falsy)・ブラウザ版は `success !== true` と条件まで違っていた。
 * 送り先も 1 つ (`CLOUDFLARE_API`) —— main の読み (user / zones) も同じ定数を通る。
 */
export const CLOUDFLARE_API = 'https://api.cloudflare.com/client/v4';

export type CloudflareTransport = (url: string, init: RequestInit) => Promise<Response>;

/** 応答の `errors[0].message` が無いときの文。両ビルドがこれを刷る。 */
export const CLOUDFLARE_UNKNOWN_ERROR = 'unknown error';

export type CloudflareEnvelope =
  | { readonly ok: true; readonly result: unknown }
  | { readonly ok: false; readonly message: string };

/**
 * `{success, errors, result}` の包みを**確かめて**開く (パス 261)。
 * `success !== true` は断り (`{}` や `success: 'yes'` も)、`result` の形は呼び出し側が見る。
 * 例外の型 (main は `FetchError`・ブラウザ版は `Error`) は呼び出し側の流儀で、条件はここ 1 つ。
 */
export function readCloudflareEnvelope(raw: unknown): CloudflareEnvelope {
  const payload = requireObject(raw, 'Cloudflare API');
  if (payload['success'] !== true) {
    const errors = payload['errors'];
    const first = Array.isArray(errors) && errors.length > 0 ? errors[0] : null;
    const message =
      first !== null && typeof first === 'object' && !Array.isArray(first)
        ? optionalString(first as Record<string, unknown>, 'message')
        : undefined;
    return { ok: false, message: message ?? CLOUDFLARE_UNKNOWN_ERROR };
  }
  return { ok: true, result: payload['result'] };
}

// --- create-dns-record --------------------------------------------------------

export interface CloudflareDnsFields {
  readonly zoneId?: unknown;
  readonly type?: unknown;
  readonly name?: unknown;
  readonly content?: unknown;
  readonly ttl?: unknown;
  readonly proxied?: unknown;
}

/** 台帳を通った DNS レコード。`proxied` は A / AAAA / CNAME にだけ在る (他の種別に送ると 400)。 */
export interface CheckedDnsRecord {
  readonly zoneId: string;
  readonly type: string;
  readonly name: string;
  readonly content: string;
  /** 1 = 自動。 */
  readonly ttl: number;
  readonly proxied?: boolean;
}

const PROXIABLE = new Set(['A', 'AAAA', 'CNAME']);

/**
 * 欄の型と長さは共有の台帳で断る (パス 111): `type` は一覧、`ttl` は 1 以上の整数、
 * `proxied` は真偽値 —— それまで数でない `ttl` は 1 に、真偽値でない `proxied` は false に
 * **すり替えて**いた。
 */
export function checkDnsRecord(input: CloudflareDnsFields): CheckedDnsRecord {
  const bad = checkWriteFields(input, CLOUDFLARE_DNS_FIELDS);
  if (bad !== null) throw new Error(describeWriteFieldFailure(bad));
  const type = String(input.type);
  const base = {
    zoneId: String(input.zoneId).trim(),
    type,
    name: String(input.name).trim(),
    content: String(input.content).trim(),
    // ttl は台帳が「無いか 1 以上の整数」を保証済み —— 形を判定し直さない (判定は台帳 1 か所)。
    ttl: typeof input.ttl === 'number' && Number.isFinite(input.ttl) ? input.ttl : 1,
  };
  return PROXIABLE.has(type) ? { ...base, proxied: input.proxied === true } : base;
}

export function cloudflareDnsRecordsPath(record: CheckedDnsRecord): string {
  return `/zones/${encodeURIComponent(record.zoneId)}/dns_records`;
}

/** 要求の組み立て。両ビルドがこれを送る。 */
export function dnsRecordInit(record: CheckedDnsRecord, token: string): RequestInit {
  const body: Record<string, unknown> = {
    type: record.type,
    name: record.name,
    content: record.content,
    ttl: record.ttl,
  };
  if (record.proxied !== undefined) body['proxied'] = record.proxied;
  return {
    method: 'POST',
    headers: jsonBody(token, { Accept: 'application/json' }),
    body: JSON.stringify(body),
  };
}

/** ブラウザ版の口: 送って `Response` を返す。 */
export async function createDnsRecordRequest(
  record: CheckedDnsRecord,
  token: string,
  transport: CloudflareTransport,
): Promise<Response> {
  return transport(`${CLOUDFLARE_API}${cloudflareDnsRecordsPath(record)}`, dnsRecordInit(record, token));
}

export interface CreatedDnsRecord {
  readonly id: string;
  readonly name: string;
  readonly type: string;
}

/** 封筒の `result` から `id` / `name` / `type` を**形を確かめて**取る。 */
export function parseCreatedDnsRecord(result: unknown): CreatedDnsRecord {
  const record = requireObject(result, 'Cloudflare API');
  return {
    id: requireString(record, 'id', 'Cloudflare API'),
    name: requireString(record, 'name', 'Cloudflare API'),
    type: requireString(record, 'type', 'Cloudflare API'),
  };
}

// --- purge-cache -------------------------------------------------------------

export interface CloudflarePurgeFields {
  readonly zoneId?: unknown;
  readonly files?: unknown;
  readonly purgeEverything?: unknown;
}

export interface CheckedPurge {
  readonly zoneId: string;
  readonly files: readonly string[];
  /** **ゾーン全体のキャッシュを落とす** —— 破壊的なので payload に載ることを明記する。 */
  readonly purgeEverything: boolean;
}

/**
 * 欄の形は共有の台帳で断る (パス 111): `files` は文字列の配列 (件数と 1 件の長さに天井)、
 * `purgeEverything` は真偽値。どちらかが要る (`CLOUDFLARE_PURGE_NEEDS_TARGET`)。
 *
 * **下の `.filter()` は関門ではない** (パス 284 で実測)。台帳が要素ごとに文字列を要求する
 * ので `['…', 42]` は台帳で落ち、間引きへは到達しない。残すのは型を得るための二重の備え。
 */
export function checkPurge(input: CloudflarePurgeFields): CheckedPurge {
  const bad = checkWriteFields(input, CLOUDFLARE_PURGE_FIELDS);
  if (bad !== null) throw new Error(describeWriteFieldFailure(bad));
  const purgeEverything = input.purgeEverything === true;
  const files = Array.isArray(input.files) ? input.files.filter((f): f is string => typeof f === 'string') : [];
  if (!purgeEverything && files.length === 0) throw new Error(CLOUDFLARE_PURGE_NEEDS_TARGET);
  return { zoneId: String(input.zoneId).trim(), files, purgeEverything };
}

export function cloudflarePurgePath(purge: CheckedPurge): string {
  return `/zones/${encodeURIComponent(purge.zoneId)}/purge_cache`;
}

/** 要求の組み立て。両ビルドがこれを送る。 */
export function purgeCacheInit(purge: CheckedPurge, token: string): RequestInit {
  const body = purge.purgeEverything ? { purge_everything: true } : { files: purge.files };
  return {
    method: 'POST',
    headers: jsonBody(token, { Accept: 'application/json' }),
    body: JSON.stringify(body),
  };
}

/** ブラウザ版の口: 送って `Response` を返す。 */
export async function purgeCacheRequest(
  purge: CheckedPurge,
  token: string,
  transport: CloudflareTransport,
): Promise<Response> {
  return transport(`${CLOUDFLARE_API}${cloudflarePurgePath(purge)}`, purgeCacheInit(purge, token));
}

export interface PurgeResult {
  readonly id: string;
  readonly purged: 'all' | number;
}

/** 封筒の `result` から `id` を取り、何を落としたかを添える。 */
export function parsePurgeResult(result: unknown, purge: CheckedPurge): PurgeResult {
  const o = requireObject(result, 'Cloudflare API');
  return { id: requireString(o, 'id', 'Cloudflare API'), purged: purge.purgeEverything ? 'all' : purge.files.length };
}
