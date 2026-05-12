import { describe, expect, it, vi } from 'vitest';
import { fetchCanvaSnapshot, ACTIONS } from '../canva';

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

describe('ACTIONS["create-folder"]', () => {
  it('POSTs /v1/folders with name + parent_folder_id, defaulting to root', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValueOnce(
      jsonResponse({ folder: { id: 'F1', name: 'Reports' } }),
    );

    const result = (await ACTIONS['create-folder']({
      token: 'tok',
      fetch: fetchMock,
      payload: { name: 'Reports' },
    })) as { id: string; name: string };

    expect(result).toEqual({ id: 'F1', name: 'Reports' });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.canva.com/rest/v1/folders');
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body).toEqual({ name: 'Reports', parent_folder_id: 'root' });
  });

  it('uses the supplied parent folder id when present', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValueOnce(
      jsonResponse({ folder: { id: 'F2', name: 'Sub' } }),
    );
    await ACTIONS['create-folder']({
      token: 't',
      fetch: fetchMock,
      payload: { name: 'Sub', parentFolderId: 'F1' },
    });
    const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string);
    expect(body.parent_folder_id).toBe('F1');
  });

  it('rejects when name is missing', async () => {
    const fetchMock = vi.fn<typeof fetch>();
    await expect(
      ACTIONS['create-folder']({ token: 't', fetch: fetchMock, payload: {} }),
    ).rejects.toThrow();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
