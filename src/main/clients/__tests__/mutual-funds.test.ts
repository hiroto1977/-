import { describe, expect, it, vi } from 'vitest';
import { fetchMutualFundsSnapshot } from '../mutual-funds';

describe('fetchMutualFundsSnapshot (snapshot-only stub)', () => {
  it('returns a typed stub without hitting the network', async () => {
    const fetchMock = vi.fn<typeof fetch>();
    const snap = await fetchMutualFundsSnapshot({ token: 'unused', fetch: fetchMock });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(snap.holdings).toEqual([]);
    expect(snap.portfolio).toEqual({ totalValuation: 0, totalCostBasis: 0, unrealizedGain: 0, unrealizedGainPct: 0 });
    expect(snap.recentDividends).toEqual([]);
  });
});
