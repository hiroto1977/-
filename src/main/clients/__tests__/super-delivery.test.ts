import { describe, expect, it, vi } from 'vitest';
import { fetchSuperDeliverySnapshot } from '../super-delivery';

describe('fetchSuperDeliverySnapshot (snapshot-only stub)', () => {
  it('returns a typed stub without hitting the network', async () => {
    const fetchMock = vi.fn<typeof fetch>();
    const snap = await fetchSuperDeliverySnapshot({ token: 'unused', fetch: fetchMock });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(snap.items).toEqual([]);
  });
});
