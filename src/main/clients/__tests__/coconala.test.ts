import { describe, expect, it, vi } from 'vitest';
import { fetchCoconalaSnapshot } from '../coconala';

describe('fetchCoconalaSnapshot', () => {
  it('normalizes the list response', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValueOnce(
      new Response(JSON.stringify({ items: [{ id: 'x1', name: 'Hello' }] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );

    const snap = await fetchCoconalaSnapshot({ token: 'token-123', fetch: fetchMock });

    expect(snap.items).toHaveLength(1);
    expect(snap.items[0]).toMatchObject({ id: 'x1', name: 'Hello' });

    const [, init] = fetchMock.mock.calls[0];
    const headers = (init as RequestInit).headers as Record<string, string>;
    expect(headers.Authorization).toBe('Bearer token-123');
  });
});
