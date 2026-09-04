import { describe, expect, it, vi } from 'vitest';
import { fetchSalesSnapshot } from '../sales';

describe('fetchSalesSnapshot (no-op stub; data lives in the renderer record store)', () => {
  it('returns an empty stub without hitting the network', async () => {
    const fetchMock = vi.fn<typeof fetch>();
    const snap = await fetchSalesSnapshot({ token: 'unused', fetch: fetchMock });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(snap.items).toEqual([]);
  });
});
