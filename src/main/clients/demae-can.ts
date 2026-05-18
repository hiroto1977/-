import {
  jsonFetch,
  type FetchContext,
} from './types';

interface DemaeCanItem {
  id: string;
  name: string;
  // TODO: extend with fields from the real API response
}

interface DemaeCanListResponse {
  items: DemaeCanItem[];
}

export interface DemaeCanSnapshot {
  items: { id: string; name: string }[];
}

export async function fetchDemaeCanSnapshot(ctx: FetchContext): Promise<DemaeCanSnapshot> {
  const fetchCtx = { fetch: ctx.fetch, serviceId: 'demae-can' };
  const headers = { Authorization: `Bearer ${ctx.token}` };

  // TODO: replace with the real endpoint
  const url = 'https://api.example.com/demae-can/items';
  const data = await jsonFetch<DemaeCanListResponse>(url, { headers }, fetchCtx);

  return {
    items: (data.items ?? []).map((it) => ({ id: it.id, name: it.name })),
  };
}

