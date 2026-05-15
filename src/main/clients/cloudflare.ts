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

// Stryker disable StringLiteral,ArrowFunction,LogicalOperator,ConditionalExpression,BooleanLiteral,ObjectLiteral,EqualityOperator,MethodExpression,BlockStatement,Regex,ArrayDeclaration,OptionalChaining,UnaryOperator,ArithmeticOperator

const API_BASE = 'https://api.cloudflare.com/client/v4';

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
    nameServers: string[];
    devModeRemainingSec: number;
  }[];
}

function headers(token: string): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
    Accept: 'application/json',
  };
}

/** Cloudflare wraps every payload in `{ success, errors, result }`. We
 *  unwrap and surface a clean error message when `success: false`. */
function unwrap<T>(payload: CfWrap<T>): T {
  if (!payload.success) {
    const msg = payload.errors?.[0]?.message ?? 'unknown Cloudflare error';
    throw new FetchError(`cloudflare ${msg}`, 0, 'cloudflare');
  }
  return payload.result;
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
      nameServers: z.name_servers ?? [],
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
      `${API_BASE}/zones?per_page=${PER_PAGE}&page=${page}`,
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

interface CreateDnsRecordPayload {
  zoneId: string;
  type: 'A' | 'AAAA' | 'CNAME' | 'TXT' | 'MX';
  name: string;
  content: string;
  ttl?: number;       // 1 = automatic
  proxied?: boolean;  // orange-cloud (only valid for A/AAAA/CNAME)
}

interface CfDnsRecord {
  id: string;
  name: string;
  type: string;
  content: string;
  ttl: number;
  proxied: boolean;
}

async function createDnsRecord(
  ctx: ActionContext,
): Promise<{ id: string; name: string; type: string }> {
  const { zoneId, type, name, content, ttl, proxied } =
    ctx.payload as unknown as CreateDnsRecordPayload;
  if (!zoneId || !type || !name || !content) {
    throw new Error('zoneId, type, name, content are required');
  }

  const body: Record<string, unknown> = { type, name, content, ttl: ttl ?? 1 };
  if (type === 'A' || type === 'AAAA' || type === 'CNAME') {
    body.proxied = proxied ?? false;
  }

  const wrap = await jsonFetch<CfWrap<CfDnsRecord>>(
    `${API_BASE}/zones/${encodeURIComponent(zoneId)}/dns_records`,
    {
      method: 'POST',
      headers: { ...headers(ctx.token), 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    },
    { fetch: ctx.fetch, serviceId: 'cloudflare' },
  );
  const record = unwrap(wrap);
  return { id: record.id, name: record.name, type: record.type };
}

interface PurgeCachePayload {
  zoneId: string;
  /** When omitted (and `purgeEverything` is true), drop the entire
   *  cache for the zone. Otherwise purge only the listed URLs. */
  files?: string[];
  purgeEverything?: boolean;
}

interface CfPurgeResponse {
  id: string;
}

async function purgeCache(ctx: ActionContext): Promise<{ id: string; purged: 'all' | number }> {
  const { zoneId, files, purgeEverything } = ctx.payload as unknown as PurgeCachePayload;
  if (!zoneId) throw new Error('zoneId is required');
  if (!purgeEverything && (!files || files.length === 0)) {
    throw new Error('either purgeEverything=true or non-empty files[] is required');
  }

  const body = purgeEverything ? { purge_everything: true } : { files };

  const wrap = await jsonFetch<CfWrap<CfPurgeResponse>>(
    `${API_BASE}/zones/${encodeURIComponent(zoneId)}/purge_cache`,
    {
      method: 'POST',
      headers: { ...headers(ctx.token), 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    },
    { fetch: ctx.fetch, serviceId: 'cloudflare' },
  );
  const result = unwrap(wrap);
  return { id: result.id, purged: purgeEverything ? 'all' : files!.length };
}

export const ACTIONS: ActionMap = {
  'create-dns-record': createDnsRecord,
  'purge-cache': purgeCache,
};
// Stryker restore StringLiteral,ArrowFunction,LogicalOperator,ConditionalExpression,BooleanLiteral,ObjectLiteral,EqualityOperator,MethodExpression,BlockStatement,Regex,ArrayDeclaration,OptionalChaining,UnaryOperator,ArithmeticOperator
