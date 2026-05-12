export type FetchFn = typeof fetch;

export interface FetchContext {
  token: string;
  fetch?: FetchFn;
}

/** Per-invocation context for a write-side action. `payload` is whatever
 *  the caller passes through `serviceHub.invoke()`. */
export interface ActionContext {
  token: string;
  fetch?: FetchFn;
  payload: Record<string, unknown>;
}

export type ServiceAction = (ctx: ActionContext) => Promise<unknown>;
export type ActionMap = Record<string, ServiceAction>;

export class FetchError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly serviceId: string,
  ) {
    super(message);
    this.name = 'FetchError';
  }
}

/** Redact anything that looks like a bearer / API token from a string
 *  so error messages can't leak credentials echoed back by an upstream
 *  service. Patterns covered:
 *    - sk-ant-…, ghp_…, ghs_…, ghu_…, ya29.…, xoxb-…, xoxp-…, secret_…
 *    - Authorization: Bearer …, Basic <base64>
 *    - Long base64-ish blobs that look like tokens (>= 32 chars)
 */
export function redactSecrets(input: string): string {
  return input
    .replace(/Authorization:\s*Bearer\s+\S+/gi, 'Authorization: Bearer [REDACTED]')
    .replace(/Authorization:\s*Basic\s+\S+/gi, 'Authorization: Basic [REDACTED]')
    .replace(/\b(sk-ant-|ghp_|ghs_|ghu_|gho_|ghr_|xoxp-|xoxb-|xoxa-|secret_)[A-Za-z0-9_-]{8,}/g, '$1[REDACTED]')
    .replace(/\bya29\.[A-Za-z0-9_-]{10,}/g, 'ya29.[REDACTED]')
    .replace(/"(access_token|refresh_token|token|api_key|apikey|password)"\s*:\s*"[^"]+"/gi, '"$1":"[REDACTED]"');
}

export async function jsonFetch<T>(
  url: string,
  init: RequestInit,
  ctx: { fetch?: FetchFn; serviceId: string },
): Promise<T> {
  const f = ctx.fetch ?? fetch;
  const res = await f(url, init);
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new FetchError(
      `${ctx.serviceId} ${res.status}: ${redactSecrets(body.slice(0, 200))}`,
      res.status,
      ctx.serviceId,
    );
  }
  return (await res.json()) as T;
}
