import { describe, expect, it, vi } from 'vitest';
import { fetchWordPressSnapshot } from '../wordpress';

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

describe('fetchWordPressSnapshot', () => {
  it('normalizes sites and detects paid plans', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValueOnce(
      jsonResponse({
        sites: [
          {
            ID: 1,
            name: 'Blog A',
            description: '',
            URL: 'https://a.example',
            is_private: false,
            jetpack: false,
            plan: { product_slug: 'business-bundle' },
            meta: { data: { modified: '2025-12-01T00:00:00Z' } },
          },
          {
            ID: 2,
            name: 'Blog B',
            description: 'free site',
            URL: 'https://b.wordpress.com',
            is_private: false,
            jetpack: false,
            plan: { product_slug: 'free_plan' },
            meta: { data: { modified: '' } },
          },
        ],
      }),
    );

    const snap = await fetchWordPressSnapshot({ token: 't', fetch: fetchMock });

    expect(snap.sites).toHaveLength(2);
    expect(snap.sites[0]).toMatchObject({ blogId: 1, name: 'Blog A', paidPlan: true });
    expect(snap.sites[1]).toMatchObject({ blogId: 2, paidPlan: false });
  });
});
