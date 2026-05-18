import {
  jsonFetch,
  type FetchContext,
} from './types';

interface RealEstateItem {
  id: string;
  name: string;
  // TODO: extend with fields from the real API response
}

interface RealEstateListResponse {
  items: RealEstateItem[];
}

export interface RealEstateSnapshot {
  items: { id: string; name: string }[];
}

export async function fetchRealEstateSnapshot(ctx: FetchContext): Promise<RealEstateSnapshot> {
  const fetchCtx = { fetch: ctx.fetch, serviceId: 'real-estate' };
  const headers = { Authorization: `Bearer ${ctx.token}` };

  // TODO: replace with the real endpoint
  const url = 'https://api.example.com/real-estate/items';
  const data = await jsonFetch<RealEstateListResponse>(url, { headers }, fetchCtx);

  return {
    items: (data.items ?? []).map((it) => ({ id: it.id, name: it.name })),
  };
}

