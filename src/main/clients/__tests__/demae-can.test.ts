import { describe, expect, it, vi } from 'vitest';
import { fetchDemaeCanSnapshot } from '../demae-can';

describe('fetchDemaeCanSnapshot (snapshot-only stub)', () => {
  it('returns a typed stub without hitting the network', async () => {
    const fetchMock = vi.fn<typeof fetch>();
    const snap = await fetchDemaeCanSnapshot({ token: 'unused', fetch: fetchMock });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(snap.orders).toEqual([]);
    expect(snap.topAreas).toEqual([]);
    expect(snap.monthSummary).toEqual({ orders: 0, revenue: 0, avgOrderValue: 0, cancellationRate: 0 });
  });
});
