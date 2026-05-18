import {
  jsonFetch,
  type FetchContext,
} from './types';

interface UberEatsItem {
  id: string;
  name: string;
  // TODO: extend with fields from the real API response
}

interface UberEatsListResponse {
  items: UberEatsItem[];
}

export interface UberEatsSnapshot {
  items: { id: string; name: string }[];
}

export async function fetchUberEatsSnapshot(ctx: FetchContext): Promise<UberEatsSnapshot> {
  const fetchCtx = { fetch: ctx.fetch, serviceId: 'uber-eats' };
  const headers = { Authorization: `Bearer ${ctx.token}` };

  // TODO: replace with the real endpoint
  const url = 'https://api.example.com/uber-eats/items';
  const data = await jsonFetch<UberEatsListResponse>(url, { headers }, fetchCtx);

  return {
    items: (data.items ?? []).map((it) => ({ id: it.id, name: it.name })),
  };
}

