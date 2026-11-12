import { describe, expect, it, vi } from 'vitest';
import { fetchSuperDeliverySnapshot } from '../super-delivery';

describe('fetchSuperDeliverySnapshot (virtual-data stub)', () => {
  it('returns virtual catalog data without hitting the network', async () => {
    const fetchMock = vi.fn<typeof fetch>();
    const snap = await fetchSuperDeliverySnapshot({ token: 'unused', fetch: fetchMock });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(snap.items.length).toBeGreaterThan(0);
    for (const it of snap.items) {
      expect(it.id).toBeTruthy();
      expect(it.name).toBeTruthy();
    }
  });
});
