/**
 * Cloudflare API integration.
 *
 * Auth: API token (Bearer). Created at
 *   https://dash.cloudflare.com/profile/api-tokens
 * with these recommended permissions:
 *   - Zone → Zone → Read
 *   - Zone → DNS → Edit          (for create-dns-record action)
 *   - Zone → Cache Purge → Purge (for purge-cache action)
 *
 * The legacy "Global API Key" is intentionally not supported — scoped
 * tokens are strictly better and the Cloudflare docs recommend them.
 */

import {
  jsonFetch,
  FetchError,
  type ActionContext,
  type ActionMap,
  type FetchContext,
} from './types';
import {
  CLOUDFLARE_API,
  checkDnsRecord,
  checkPurge,
  cloudflareDnsRecordsPath,
  cloudflarePurgePath,
  dnsRecordInit,
  parseCreatedDnsRecord,
  parsePurgeResult,
  purgeCacheInit,
  readCloudflareEnvelope,
} from '../../shared/api/cloudflare';
import type { ActionData } from '../../shared/actionData';
import { optionalStringArray } from '../../shared/apiResponse';

/** 送り先は shared の 1 つ (書き込みも読みも同じ定数を通る)。 */
const API_BASE = CLOUDFLARE_API;

interface CfWrap<T> {
  result: T;
  success: boolean;
  errors: Array<{ code: number; message: string }>;
  messages: string[];
}

interface CfUser {
  id: string;
  email: string;
  username: string;
}

interface CfZone {
  id: string;
  name: string;
  status: string;
  plan: { name: string };
  account: { id: string; name: string };
  name_servers: string[];
  development_mode: number;
}

export interface CloudflareSnapshot {
  user: { email: string; username: string };
  zones: {
    id: string;
    name: string;
    status: string;
    plan: string;
    accountName: string;
    /** 応答が配列でなければ空 (パス 410 —— 画面が `.slice(...).join` を呼ぶ)。 */
    nameServers: readonly string[];
    devModeRemainingSec: number;
  }[];
}

function headers(token: string): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
    Accept: 'application/json',
  };
}

/**
 * Cloudflare wraps every payload in `{ success, errors, result }`. 封筒の判定は shared の
 * 1 つ (`readCloudflareEnvelope` —— ブラウザ版も同じ関数)。ここは断りを serviceId つきの
 * `FetchError` で運ぶだけ (ブラウザ版は `Error`。例外の型だけが流儀で、条件は 1 つ)。
 */
function unwrap<T>(payload: CfWrap<T>): T {
  const env = readCloudflareEnvelope(payload);
  if (!env.ok) throw new FetchError(`cloudflare ${env.message}`, 0, 'cloudflare');
  return env.result as T;
}

export async function fetchCloudflareSnapshot(ctx: FetchContext): Promise<CloudflareSnapshot> {
  const fetchCtx = { fetch: ctx.fetch, serviceId: 'cloudflare' };
  const init: RequestInit = { headers: headers(ctx.token) };

  const [userWrap, zones] = await Promise.all([
    jsonFetch<CfWrap<CfUser>>(`${API_BASE}/user`, init, fetchCtx),
    fetchAllZones(init, fetchCtx),
  ]);

  const user = unwrap(userWrap);

  return {
    user: { email: user.email, username: user.username },
    zones: zones.map((z) => ({
      id: z.id,
      name: z.name,
      status: z.status,
      plan: z.plan?.name ?? '',
      accountName: z.account?.name ?? '',
      // **配列であることを検める** (2026-09-22 · パス 410)。`??` は null / undefined
      // しか受けないので、文字列が来ると `CloudflarePage:155` の
      // `z.nameServers.slice(0, 2).join(', ')` が**描画で投げた** (実測)。
      nameServers: optionalStringArray(z as unknown as Record<string, unknown>, 'name_servers'),
      // development_mode is "seconds remaining" (0 means off).
      devModeRemainingSec: z.development_mode ?? 0,
    })),
  };
}

const PER_PAGE = 50;
const MAX_PAGES = 20; // hard cap at 1000 zones — beyond that the user wants a real filter

async function fetchAllZones(
  init: RequestInit,
  fetchCtx: { fetch?: typeof fetch; serviceId: string },
): Promise<CfZone[]> {
  const all: CfZone[] = [];
  for (let page = 1; page <= MAX_PAGES; page++) {
    const wrap = await jsonFetch<CfWrap<CfZone[]>>(
      `${API_BASE}/zones?per_page=${PER_PAGE}&page=${encodeURIComponent(page)}`,
      init,
      fetchCtx,
    );
    const batch = unwrap(wrap);
    all.push(...batch);
    if (batch.length < PER_PAGE) break;
  }
  return all;
}

// --- write-side actions --------------------------------------------------

/*
 * 欄の判定・本文の組み立て・URL・封筒の読みは `shared/api/cloudflare.ts` の 1 つで、
 * ブラウザ版も同じ関数を通る (パス 321)。ここに残るのは送る道 (`jsonFetch`) と
 * 断りの運び方 (`unwrap` の FetchError) だけ。
 */

export interface CreateDnsRecordPayload {
  zoneId: string;
  type: 'A' | 'AAAA' | 'CNAME' | 'TXT' | 'MX';
  name: string;
  content: string;
  ttl?: number;       // 1 = automatic
  proxied?: boolean;  // orange-cloud (only valid for A/AAAA/CNAME)
}

async function createDnsRecord(
  ctx: ActionContext,
): Promise<ActionData<'cloudflare/create-dns-record'>> {
  const record = checkDnsRecord(ctx.payload);
  const wrap = await jsonFetch<CfWrap<unknown>>(
    `${API_BASE}${cloudflareDnsRecordsPath(record)}`,
    dnsRecordInit(record, ctx.token),
    { fetch: ctx.fetch, serviceId: 'cloudflare' },
  );
  return parseCreatedDnsRecord(unwrap(wrap));
}

export interface PurgeCachePayload {
  zoneId: string;
  /** When omitted (and `purgeEverything` is true), drop the entire
   *  cache for the zone. Otherwise purge only the listed URLs. */
  files?: string[];
  purgeEverything?: boolean;
}

async function purgeCache(ctx: ActionContext): Promise<ActionData<'cloudflare/purge-cache'>> {
  const purge = checkPurge(ctx.payload);
  const wrap = await jsonFetch<CfWrap<unknown>>(
    `${API_BASE}${cloudflarePurgePath(purge)}`,
    purgeCacheInit(purge, ctx.token),
    { fetch: ctx.fetch, serviceId: 'cloudflare' },
  );
  return parsePurgeResult(unwrap(wrap), purge);
}

export const ACTIONS: ActionMap = {
  'create-dns-record': createDnsRecord,
  'purge-cache': purgeCache,
};
