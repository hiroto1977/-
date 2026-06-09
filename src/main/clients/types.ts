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

/** Re-export from `src/shared/advisorTypes.ts` so existing
 *  `import { ServiceAdvisorResponse } from './types'` callers continue
 *  to work, while the renderer pulls the same type from `shared/`. */
export type { ServiceAdvisorResponse } from '../../shared/advisorTypes';

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

// Single source of truth lives in `src/shared/redact.ts` (used by both main
// and the renderer's BYO-proxy). Imported for local use in `jsonFetch` and
// re-exported so existing `import { redactSecrets } from './types'` callers
// are unaffected.
import { redactSecrets } from '../../shared/redact';
export { redactSecrets };

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
