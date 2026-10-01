import { describe, expect, it, vi } from 'vitest';
import { fetchOverviewSnapshot } from '../overview';

describe('fetchOverviewSnapshot (no-op stub; aggregation happens in the renderer)', () => {
  it('returns an empty stub without hitting the network', async () => {
    const fetchMock = vi.fn<typeof fetch>();
    const snap = await fetchOverviewSnapshot({ token: 'unused', fetch: fetchMock });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(snap.items).toEqual([]);
  });
});
