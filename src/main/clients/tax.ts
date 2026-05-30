import {
  jsonFetch,
  type ActionContext,
  type ActionMap,
  type FetchContext,
} from './types';

interface TaxItem {
  id: string;
  name: string;
  // TODO: extend with fields from the real API response
}

interface TaxListResponse {
  items: TaxItem[];
}

export interface TaxSnapshot {
  items: { id: string; name: string }[];
}

export async function fetchTaxSnapshot(ctx: FetchContext): Promise<TaxSnapshot> {
  const fetchCtx = { fetch: ctx.fetch, serviceId: 'tax' };
  const headers = { Authorization: `Bearer ${ctx.token}` };

  // TODO: replace with the real endpoint
  const url = 'https://api.example.com/tax/items';
  const data = await jsonFetch<TaxListResponse>(url, { headers }, fetchCtx);

  return {
    items: (data.items ?? []).map((it) => ({ id: it.id, name: it.name })),
  };
}

// --- write-side actions ------------------------------------------------
// Wire up via serviceHub.invoke('tax', '<name>', payload) from the
// renderer. Delete this block (and the ACTIONS export below) if you don't
// need any actions for this service.

async function exampleAction(_ctx: ActionContext): Promise<unknown> {
  // TODO: implement. Read ctx.payload and POST/PUT against the real API.
  throw new Error('tax.example-action: not implemented');
}

export const ACTIONS: ActionMap = {
  'example-action': exampleAction,
};
