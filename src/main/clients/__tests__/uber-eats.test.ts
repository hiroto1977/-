import { describe, expect, it, vi } from 'vitest';
import { fetchUberEatsSnapshot } from '../uber-eats';

describe('fetchUberEatsSnapshot (snapshot-only stub)', () => {
  it('returns a typed stub without hitting the network', async () => {
    // The stub does no HTTP — fetch should never be invoked even though
    // we pass a mock. This guarantees the page never sees fetch_failed
    // on refresh for snapshot-only services.
    const fetchMock = vi.fn<typeof fetch>();
    const snap = await fetchUberEatsSnapshot({ token: 'unused', fetch: fetchMock });
    expect(fetchMock).not.toHaveBeenCalled();
    // Shape matches the page's expectation (UberEatsPage destructures
    // these fields). Empty stores/topItems is OK — the real data lives
    // in SNAPSHOT.uberEats and the page falls back to it.
    expect(snap.stores).toEqual([]);
    expect(snap.topItems).toEqual([]);
    expect(snap.weekRevenue).toBe(0);
    expect(snap.weekOrders).toBe(0);
    expect(snap.avgRating).toBe(0);
  });
});
