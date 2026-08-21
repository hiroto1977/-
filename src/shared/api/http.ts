/**
 * `src/shared/api/*` の HTTP コア。
 *
 * `src/main/clients/types.ts` の `jsonFetch` と**同じ振る舞い**を意図的に
 * 揃えている（失敗時は本文を 200 字に切って `redactSecrets` で伏せ、
 * status と serviceId を持った例外にする）。実装を共有していないのは
 * import 境界のため — `src/shared/**` は `shared` からしか import できず、
 * `src/main/**` に依存できない（`scripts/check-import-boundaries.cjs`）。
 * 秘密の伏せ方だけは `shared/redact.ts` が単一の真実源なので共有している。
 *
 * `fetch` は注入できる。ネットワーク無しで単体テストするためで、
 * `src/main/clients/*` と同じ作法（`vi.fn<typeof fetch>()`）で書ける。
 */

import { redactForMessage } from '../redact';

export type FetchFn = typeof fetch;

/** 応答が 2xx でなかったときの例外。status と serviceId を残す。 */
export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly serviceId: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/**
 * 実装していない機能を**黙って成功に見せない**ための例外。
 *
 * 元のスタブは `[]` や `{ ok: true }` を返しており、呼び出し側からは
 * 「成功した」と区別が付かなかった。書き込み系でこれをやると、
 * 実際には何も起きていないのに成功として扱われる。分からないものは
 * 分からないと落とす。
 */
export class NotImplementedError extends Error {
  constructor(serviceId: string, method: string, reason: string) {
    super(`${serviceId}.${method}() は未実装です: ${reason}`);
    this.name = 'NotImplementedError';
  }
}

export interface RequestContext {
  readonly fetch?: FetchFn;
  readonly serviceId: string;
}

/** `Authorization: Bearer` を組み立てる。追加ヘッダを重ねられる。 */
export function bearer(token: string, extra: Record<string, string> = {}): Record<string, string> {
  return { Authorization: `Bearer ${token}`, ...extra };
}

/** JSON 本文を送るときのヘッダ。 */
export function jsonBody(token: string, extra: Record<string, string> = {}): Record<string, string> {
  return bearer(token, { 'Content-Type': 'application/json', ...extra });
}

/**
 * JSON を取得する。2xx 以外は `ApiError`。
 *
 * 本文をそのまま例外に載せない: 上流が資格情報を反射して返すことがあり、
 * ログや画面に出た時点で漏れる。`redactSecrets` を通し 200 字で切る。
 */
export async function apiFetch<T>(url: string, init: RequestInit, ctx: RequestContext): Promise<T> {
  const f = ctx.fetch ?? fetch;
  const res = await f(url, init);
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new ApiError(
      `${ctx.serviceId} ${res.status}: ${redactForMessage(body, 200)}`,
      res.status,
      ctx.serviceId,
    );
  }
  return (await res.json()) as T;
}

/**
 * Slack のように **HTTP 200 のまま `{ ok: false, error }` で失敗を返す** API 用。
 *
 * 2xx だからと成功扱いにすると、送れていないメッセージを送れたことに
 * してしまう。`ok` を見て落とす。
 */
export async function apiFetchOkFlag<T>(
  url: string,
  init: RequestInit,
  ctx: RequestContext,
): Promise<T> {
  const body = await apiFetch<T & { ok?: boolean; error?: string }>(url, init, ctx);
  if (body.ok === false) {
    throw new ApiError(`${ctx.serviceId}: ${body.error ?? 'unknown error'}`, 200, ctx.serviceId);
  }
  return body;
}

/** クエリ文字列を組み立てる（undefined の項目は落とす）。 */
export function withQuery(base: string, params: Record<string, string | number | undefined>): string {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined) qs.set(k, String(v));
  }
  const s = qs.toString();
  return s === '' ? base : `${base}?${s}`;
}
