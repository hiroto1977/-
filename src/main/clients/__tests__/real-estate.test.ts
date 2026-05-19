import { describe, expect, it, vi } from 'vitest';
import { fetchRealEstateSnapshot } from '../real-estate';

describe('fetchRealEstateSnapshot (snapshot-only stub)', () => {
  it('returns a typed stub without hitting the network', async () => {
    const fetchMock = vi.fn<typeof fetch>();
    const snap = await fetchRealEstateSnapshot({ token: 'unused', fetch: fetchMock });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(snap.properties).toEqual([]);
    expect(snap.monthlyCashflow).toEqual({ grossRent: 0, operatingExpenses: 0, mortgagePayment: 0, netCashflow: 0 });
    expect(snap.portfolioYield).toBe(0);
    expect(snap.occupancyRate).toBe(0);
  });
});
