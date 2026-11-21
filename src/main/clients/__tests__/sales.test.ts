import { describe, expect, it, vi } from 'vitest';
import { fetchSalesSnapshot } from '../sales';

describe('fetchSalesSnapshot (ローカル — 空の土台; data lives in the renderer record store)', () => {
  it('returns the empty base without hitting the network', async () => {
    const fetchMock = vi.fn<typeof fetch>();
    const snap = await fetchSalesSnapshot({ token: 'unused', fetch: fetchMock });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(snap.items).toEqual([]);
  });
});
