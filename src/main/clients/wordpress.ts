import { jsonFetch, type FetchContext } from './types';

interface WpSite {
  ID: number;
  name: string;
  description: string;
  URL: string;
  is_private: boolean;
  options?: { is_mapped_domain?: boolean };
  plan?: { product_slug?: string };
  jetpack: boolean;
  meta?: { data?: { modified?: string } };
}

interface WpSitesResponse {
  sites: WpSite[];
}

export interface WordPressSnapshot {
  sites: {
    blogId: number;
    name: string;
    description: string;
    url: string;
    platform: string;
    status: string;
    lastUpdated: string;
    paidPlan: boolean;
  }[];
}

export async function fetchWordPressSnapshot(ctx: FetchContext): Promise<WordPressSnapshot> {
  const fetchCtx = { fetch: ctx.fetch, serviceId: 'wordpress' };
  const headers = { Authorization: `Bearer ${ctx.token}` };

  const data = await jsonFetch<WpSitesResponse>(
    'https://public-api.wordpress.com/rest/v1.1/me/sites',
    { headers },
    fetchCtx,
  );

  return {
    sites: (data.sites ?? []).map((s) => ({
      blogId: s.ID,
      name: s.name,
      description: s.description,
      url: s.URL,
      platform: s.jetpack ? 'jetpack' : 'simple',
      status: s.is_private ? 'private' : 'active',
      lastUpdated: (s.meta?.data?.modified ?? '').slice(0, 10),
      paidPlan: !!s.plan?.product_slug && s.plan.product_slug !== 'free_plan',
    })),
  };
}
