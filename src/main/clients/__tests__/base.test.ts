import { describe, expect, it, vi } from 'vitest';
import { fetchBaseSnapshot } from '../base';
import { FetchError } from '../types';

describe('fetchBaseSnapshot', () => {
  it('normalizes the BASE items response and sends a Bearer token', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          items: [
            { item_id: 101, title: 'Tシャツ', price: 3000, stock: 12, visible: 1 },
            { item_id: 102, title: '試作品', price: 0, stock: 0, visible: 0 },
          ],
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    );

    const snap = await fetchBaseSnapshot({ token: 'base-oauth-token', fetch: fetchMock });

    expect(snap.items).toEqual([
      { id: '101', name: 'Tシャツ', price: 3000, stock: 12, visible: true },
      { id: '102', name: '試作品', price: 0, stock: 0, visible: false },
    ]);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toContain('https://api.thebase.in/1/items');
    const headers = (init as RequestInit).headers as Record<string, string>;
    expect(headers.Authorization).toBe('Bearer base-oauth-token');
  });

  it('tolerates a missing items array', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValueOnce(
      new Response(JSON.stringify({}), { status: 200, headers: { 'content-type': 'application/json' } }),
    );
    const snap = await fetchBaseSnapshot({ token: 't', fetch: fetchMock });
    expect(snap.items).toEqual([]);
  });

  it('throws a FetchError tagged with the base serviceId on a non-200 response', async () => {
    // serviceId: 'base' を '' にする StringLiteral を撃墜。
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValueOnce(
      new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401, headers: { 'content-type': 'application/json' } }),
    );
    const err = await fetchBaseSnapshot({ token: 'bad', fetch: fetchMock }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(FetchError);
    expect((err as FetchError).serviceId).toBe('base');
  });
});
