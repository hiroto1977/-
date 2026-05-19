import { jsonFetch, type ActionContext, type ActionMap, type FetchContext } from './types';

// Stryker disable StringLiteral,ArrowFunction,LogicalOperator,ConditionalExpression,BooleanLiteral,ObjectLiteral,EqualityOperator,MethodExpression,BlockStatement,Regex,ArrayDeclaration,OptionalChaining,UnaryOperator,ArithmeticOperator

// Subset of fields returned by https://public-api.wordpress.com/rest/v1.1/me/sites
interface WpSite {
  ID: number;
  name: string;
  description: string;
  URL: string;
  is_private: boolean;
  jetpack: boolean;
  last_updated?: string; // "YYYY-MM-DD HH:mm:ss" UTC
  plan?: { product_slug?: string; is_free?: boolean };
  capabilities?: { manage_options?: boolean };
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

function isPaidPlan(plan: WpSite['plan']): boolean {
  if (!plan) return false;
  if (plan.is_free === true) return false;
  if (plan.is_free === false) return true;
  const slug = (plan.product_slug ?? '').toLowerCase();
  return slug !== '' && slug !== 'free_plan' && !slug.includes('free');
}

export async function fetchWordPressSnapshot(ctx: FetchContext): Promise<WordPressSnapshot> {
  const fetchCtx = { fetch: ctx.fetch, serviceId: 'wordpress' };
  const headers = { Authorization: `Bearer ${ctx.token}` };

  const data = await jsonFetch<WpSitesResponse>(
    'https://public-api.wordpress.com/rest/v1.1/me/sites?fields=ID,name,description,URL,is_private,jetpack,last_updated,plan',
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
      lastUpdated: (s.last_updated ?? '').slice(0, 10),
      paidPlan: isPaidPlan(s.plan),
    })),
  };
}

// --- write-side actions --------------------------------------------------

interface CreatePostPayload {
  siteId: string; // blog id or hostname
  title: string;
  content?: string;
  status?: 'draft' | 'publish' | 'pending' | 'private';
}

interface WpCreatePostResponse {
  ID: number;
  URL: string;
  short_URL?: string;
  title: string;
  status: string;
}

async function createPostDraft(
  ctx: ActionContext,
): Promise<{ id: number; url: string; title: string }> {
  const { siteId, title, content, status } = ctx.payload as unknown as CreatePostPayload;
  if (!siteId || !title) throw new Error('siteId and title are required');

  const res = await jsonFetch<WpCreatePostResponse>(
    `https://public-api.wordpress.com/rest/v1.1/sites/${encodeURIComponent(siteId)}/posts/new`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${ctx.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        title,
        content: content ?? '',
        status: status ?? 'draft',
      }),
    },
    { fetch: ctx.fetch, serviceId: 'wordpress' },
  );

  return { id: res.ID, url: res.URL, title: res.title };
}

export const ACTIONS: ActionMap = {
  'create-post-draft': createPostDraft,
};
// Stryker restore StringLiteral,ArrowFunction,LogicalOperator,ConditionalExpression,BooleanLiteral,ObjectLiteral,EqualityOperator,MethodExpression,BlockStatement,Regex,ArrayDeclaration,OptionalChaining,UnaryOperator,ArithmeticOperator
