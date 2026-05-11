export type FetchFn = typeof fetch;

export interface FetchContext {
  token: string;
  fetch?: FetchFn;
}

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
      `${ctx.serviceId} ${res.status}: ${body.slice(0, 200)}`,
      res.status,
      ctx.serviceId,
    );
  }
  return (await res.json()) as T;
}
