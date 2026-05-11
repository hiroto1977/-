import { describe, expect, it, vi } from 'vitest';
import { fetchWordPressSnapshot } from '../wordpress';

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

describe('fetchWordPressSnapshot', () => {
  it('normalizes sites and reads last_updated at the top level', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValueOnce(
      jsonResponse({
        sites: [
          {
            ID: 1,
            name: 'Paid Site',
            description: '',
            URL: 'https://paid.example',
            is_private: false,
            jetpack: false,
            last_updated: '2025-12-01 10:23:45',
            plan: { product_slug: 'business-bundle', is_free: false },
          },
        ],
      }),
    );

    const snap = await fetchWordPressSnapshot({ token: 't', fetch: fetchMock });
    expect(snap.sites[0]).toMatchObject({
      blogId: 1,
      name: 'Paid Site',
      lastUpdated: '2025-12-01',
      paidPlan: true,
    });
  });

  it('treats free_plan / is_free=true / missing plan as not paid', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValueOnce(
      jsonResponse({
        sites: [
          { ID: 1, name: 'A', description: '', URL: 'https://a', is_private: false, jetpack: false, plan: { product_slug: 'free_plan' } },
          { ID: 2, name: 'B', description: '', URL: 'https://b', is_private: false, jetpack: false, plan: { is_free: true } },
          { ID: 3, name: 'C', description: '', URL: 'https://c', is_private: false, jetpack: false },
        ],
      }),
    );

    const snap = await fetchWordPressSnapshot({ token: 't', fetch: fetchMock });
    expect(snap.sites.map((s) => s.paidPlan)).toEqual([false, false, false]);
  });

  it('marks private sites with status=private and detects jetpack platform', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValueOnce(
      jsonResponse({
        sites: [
          { ID: 1, name: 'Private', description: '', URL: 'https://p', is_private: true, jetpack: true, last_updated: '' },
        ],
      }),
    );

    const snap = await fetchWordPressSnapshot({ token: 't', fetch: fetchMock });
    expect(snap.sites[0]).toMatchObject({ status: 'private', platform: 'jetpack', lastUpdated: '' });
  });

  it('returns empty list when the API returns no sites', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValueOnce(jsonResponse({}));
    const snap = await fetchWordPressSnapshot({ token: 't', fetch: fetchMock });
    expect(snap.sites).toEqual([]);
  });
});
