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

  it('falls back to empty brandKits on 403 (missing scope)', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({ items: [] }))
      .mockResolvedValueOnce(new Response('forbidden', { status: 403 }));

    const snap = await fetchCanvaSnapshot({ token: 't', fetch: fetchMock });
    expect(snap.brandKits).toEqual([]);
  });

  it('falls back to empty brandKits on 404 (endpoint disabled)', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({ items: [] }))
      .mockResolvedValueOnce(new Response('not found', { status: 404 }));

    const snap = await fetchCanvaSnapshot({ token: 't', fetch: fetchMock });
    expect(snap.brandKits).toEqual([]);
  });

  it('propagates 401 from brand-kits (auth error, not endpoint quirk)', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({ items: [] }))
      .mockResolvedValueOnce(new Response('unauthorized', { status: 401 }));

    await expect(fetchCanvaSnapshot({ token: 't', fetch: fetchMock })).rejects.toThrow(/401/);
  });

  it('propagates 429 from brand-kits (rate limit, surface it)', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({ items: [] }))
      .mockResolvedValueOnce(new Response('rate limit', { status: 429 }));

    await expect(fetchCanvaSnapshot({ token: 't', fetch: fetchMock })).rejects.toThrow(/429/);
  });

  it('fills in fallbacks for a design with missing optional fields', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        jsonResponse({ items: [{ id: 'D_bare' /* no title/updated_at/page_count/thumbnail/urls */ }] }),
      )
      .mockResolvedValueOnce(jsonResponse({ items: [] }));

    const snap = await fetchCanvaSnapshot({ token: 't', fetch: fetchMock });
    expect(snap.designs[0]).toEqual({
      id: 'D_bare',
      title: '(無題のデザイン)',
      updatedAt: 0,
      pageCount: 1,
      thumbnailUrl: '',
      viewUrl: 'https://www.canva.com/design/D_bare',
    });
  });
});

describe('ACTIONS["create-folder"]', () => {
  it('POSTs /v1/folders with name + parent_folder_id, defaulting to root', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValueOnce(
      jsonResponse({ folder: { id: 'F1', name: 'Reports' } }),
    );

    const result = (await ACTIONS['create-folder']!({
      token: 'tok',
      fetch: fetchMock,
      payload: { name: 'Reports' },
    })) as { id: string; name: string };

    expect(result).toEqual({ id: 'F1', name: 'Reports' });
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('https://api.canva.com/rest/v1/folders');
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body).toEqual({ name: 'Reports', parent_folder_id: 'root' });
  });

  it('uses the supplied parent folder id when present', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValueOnce(
      jsonResponse({ folder: { id: 'F2', name: 'Sub' } }),
    );
    await ACTIONS['create-folder']!({
      token: 't',
      fetch: fetchMock,
      payload: { name: 'Sub', parentFolderId: 'F1' },
    });
    const body = JSON.parse((fetchMock.mock.calls[0]![1] as RequestInit).body as string);
    expect(body.parent_folder_id).toBe('F1');
  });

  it('rejects when name is missing', async () => {
    const fetchMock = vi.fn<typeof fetch>();
    await expect(
      ACTIONS['create-folder']!({ token: 't', fetch: fetchMock, payload: {} }),
    ).rejects.toThrow();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

// --- 送り先と資格情報 --------------------------------------------------

function canvaHeadersOf(call: Parameters<typeof fetch>): Record<string, string> {
  return (call[1]?.headers ?? {}) as Record<string, string>;
}

describe('fetchCanvaSnapshot — 送り先と件数', () => {
  function twoOk(designs: unknown, brandKits: unknown) {
    return vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse(designs))
      .mockResolvedValueOnce(jsonResponse(brandKits));
  }

  it('designs と brand-kits の両方を叩き、トークンは Authorization だけに載る', async () => {
    const fetchMock = twoOk({ items: [] }, { items: [] });
    await fetchCanvaSnapshot({ token: 'canva-secret', fetch: fetchMock });

    const designsCall = fetchMock.mock.calls[0]!;
    const designsUrl = new URL(String(designsCall[0]));
    expect(designsUrl.origin).toBe('https://api.canva.com');
    expect(designsUrl.pathname).toBe('/rest/v1/designs');
    // 自分のものだけ・更新の新しい順。落ちると「最近の作業」の意味が変わる。
    expect(designsUrl.searchParams.get('ownership')).toBe('any');
    expect(designsUrl.searchParams.get('sort_by')).toBe('modified_descending');
    expect(canvaHeadersOf(designsCall).Authorization).toBe('Bearer canva-secret');
    expect(String(designsCall[0])).not.toContain('canva-secret');

    const kitsCall = fetchMock.mock.calls[1]!;
    expect(String(kitsCall[0])).toBe('https://api.canva.com/rest/v1/brand-kits');
    expect(canvaHeadersOf(kitsCall).Authorization).toBe('Bearer canva-secret');
  });

  it('デザインは 12 件までにする', async () => {
    const items = Array.from({ length: 20 }, (_, i) => ({ id: `d${i}` }));
    const fetchMock = twoOk({ items }, { items: [] });
    const snap = await fetchCanvaSnapshot({ token: 't', fetch: fetchMock });
    expect(snap.designs).toHaveLength(12);
    // 先頭から 12 件 = 更新の新しいほう。
    expect(snap.designs[0]!.id).toBe('d0');
    expect(snap.designs[11]!.id).toBe('d11');
  });

  it('items ごと無い応答でも空配列を返して落ちない', async () => {
    const fetchMock = twoOk({}, {});
    const snap = await fetchCanvaSnapshot({ token: 't', fetch: fetchMock });
    expect(snap.designs).toEqual([]);
    expect(snap.brandKits).toEqual([]);
  });

  it('デザイン側が失敗したときどのサービスが落ちたか分かる', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response('unauthorized', { status: 401 }))
      .mockResolvedValueOnce(jsonResponse({ items: [] }));
    await expect(fetchCanvaSnapshot({ token: 't', fetch: fetchMock })).rejects.toMatchObject({
      serviceId: 'canva',
      status: 401,
    });
  });
});

describe('ACTIONS["create-folder"] — 送り方', () => {
  it('/v1/folders へ POST し、トークンは Authorization だけに載る', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({ folder: { id: 'f1', name: '資料' } }));

    await ACTIONS['create-folder']!({
      token: 'canva-secret',
      fetch: fetchMock,
      payload: { name: '資料' },
    });

    const [url, init] = fetchMock.mock.calls[0]! as [string, RequestInit];
    expect(url).toBe('https://api.canva.com/rest/v1/folders');
    expect(url).not.toContain('canva-secret');
    expect(init.method).toBe('POST');
    const headers = init.headers as Record<string, string>;
    expect(headers.Authorization).toBe('Bearer canva-secret');
    expect(headers['Content-Type']).toBe('application/json');
  });

  it('失敗したときどのサービスが落ちたか分かる', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response('forbidden', { status: 403 }));
    await expect(
      ACTIONS['create-folder']!({ token: 't', fetch: fetchMock, payload: { name: 'x' } }),
    ).rejects.toMatchObject({ serviceId: 'canva', status: 403 });
  });

  it('名前が無ければ理由を添えて断る', async () => {
    const fetchMock = vi.fn<typeof fetch>();
    await expect(
      ACTIONS['create-folder']!({ token: 't', fetch: fetchMock, payload: {} }),
    ).rejects.toThrow('name is required');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
