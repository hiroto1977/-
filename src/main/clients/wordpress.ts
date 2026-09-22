import { jsonFetch, type ActionContext, type ActionMap, type FetchContext } from './types';
import { displayDateOf } from '../../shared/isoDate';
import { objectRows } from '../../shared/apiResponse';
import { WORDPRESS_API, checkPost, parseCreatedPost, wordpressPostInit, wordpressPostsPath } from '../../shared/api/wordpress';
import type { ActionData } from '../../shared/actionData';


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
  /** 更新日 (`YYYY-MM-DD`・利用者の時計)。**読めなければ `null`** (パス 410)。 */
    lastUpdated: string | null;
    paidPlan: boolean;
  }[];
}

function isPaidPlan(plan: WpSite['plan']): boolean {
  if (!plan) return false;
  if (plan.is_free === true) return false;
  if (plan.is_free === false) return true;
  const slug = (plan.product_slug ?? '').toLowerCase();
  // `free_plan` の判定は要らない — 'free' を含むかどうかで既に弾ける。
  // 残すと、どちらへ変異させても結果が変わらない検査不能な条件になる。
  return slug !== '' && !slug.includes('free');
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
    sites: objectRows<WpSite>(data.sites).map((s) => ({
      blogId: s.ID,
      name: s.name,
      description: s.description,
      url: s.URL,
      platform: s.jetpack ? 'jetpack' : 'simple',
      status: s.is_private ? 'private' : 'active',
      // **日付として読めるかで決める** (2026-09-22 · パス 410 —— drive と同じ 1 つの読み手)。
      lastUpdated: displayDateOf(s.last_updated),
      paidPlan: isPaidPlan(s.plan),
    })),
  };
}

// --- write-side actions --------------------------------------------------

/**
 * `create-post-draft` の payload の宣言 (§3.2 の表がこの名前で照合する)。欄の判定は
 * shared の `checkPost` (`WordPressPostFields` = 欄が unknown の受け口) が行う。
 */
export interface CreatePostDraftPayload {
  siteId: string; // blog id or hostname
  title: string;
  content?: string;
  status?: 'draft' | 'publish' | 'pending' | 'private';
}

async function createPostDraft(
  ctx: ActionContext,
): Promise<ActionData<'wordpress/create-post-draft'>> {
  // 欄の判定・URL・要求・応答の読みは shared/api/wordpress.ts の 1 つ (ブラウザ版も同じ関数 · 2026-09-18)。
  const post = checkPost(ctx.payload);
  const res = await jsonFetch<Record<string, unknown>>(
    `${WORDPRESS_API}${wordpressPostsPath(post)}`,
    wordpressPostInit(post, ctx.token),
    { fetch: ctx.fetch, serviceId: 'wordpress' },
  );
  return parseCreatedPost(res);
}

export const ACTIONS: ActionMap = {
  'create-post-draft': createPostDraft,
};
