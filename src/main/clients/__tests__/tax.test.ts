import { describe, expect, it, vi } from 'vitest';
import { fetchTaxSnapshot } from '../tax';

describe('fetchTaxSnapshot (snapshot-only stub)', () => {
  it('returns the simulation menu without hitting the network', async () => {
    const fetchMock = vi.fn<typeof fetch>();
    const snap = await fetchTaxSnapshot({ token: 'unused', fetch: fetchMock });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(snap.items.length).toBeGreaterThan(0);
    for (const it of snap.items) {
      expect(it.id).toBeTruthy();
      expect(it.name).toBeTruthy();
    }
  });
});
