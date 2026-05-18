import {
  jsonFetch,
  type FetchContext,
} from './types';

interface MutualFundsItem {
  id: string;
  name: string;
  // TODO: extend with fields from the real API response
}

interface MutualFundsListResponse {
  items: MutualFundsItem[];
}

export interface MutualFundsSnapshot {
  items: { id: string; name: string }[];
}

export async function fetchMutualFundsSnapshot(ctx: FetchContext): Promise<MutualFundsSnapshot> {
  const fetchCtx = { fetch: ctx.fetch, serviceId: 'mutual-funds' };
  const headers = { Authorization: `Bearer ${ctx.token}` };

  // TODO: replace with the real endpoint
  const url = 'https://api.example.com/mutual-funds/items';
  const data = await jsonFetch<MutualFundsListResponse>(url, { headers }, fetchCtx);

  return {
    items: (data.items ?? []).map((it) => ({ id: it.id, name: it.name })),
  };
}

