import { describe, expect, it, vi } from 'vitest';
import { fetchCanvaSnapshot } from '../canva';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('fetchCanvaSnapshot', () => {
  it('normalizes designs and brand kits', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        jsonResponse({
          items: [
            {
              id: 'd1',
              title: 'Presentation',
              thumbnail: { url: 'https://thumb' },
              urls: { view_url: 'https://canva/view' },
              updated_at: 1700000000,
              page_count: 5,
            },
          ],
        }),
      )
      .mockResolvedValueOnce(jsonResponse({ items: [{ id: 'b1' }] }));

    const snap = await fetchCanvaSnapshot({ token: 't', fetch: fetchMock });

    expect(snap.designs[0]).toMatchObject({ id: 'd1', title: 'Presentation', pageCount: 5 });
    expect(snap.brandKits).toEqual([{ id: 'b1' }]);
  });

  it('falls back to empty brandKits when the endpoint errors', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({ items: [] }))
      .mockResolvedValueOnce(new Response('forbidden', { status: 403 }));

    const snap = await fetchCanvaSnapshot({ token: 't', fetch: fetchMock });
    expect(snap.brandKits).toEqual([]);
  });
});
