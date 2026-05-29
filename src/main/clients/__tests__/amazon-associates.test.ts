import { describe, expect, it, vi } from 'vitest';
import { fetchAmazonAssociatesSnapshot } from '../amazon-associates';

describe('fetchAmazonAssociatesSnapshot (snapshot-only stub)', () => {
  it('returns a typed stub without hitting the network', async () => {
    const fetchMock = vi.fn<typeof fetch>();
    const snap = await fetchAmazonAssociatesSnapshot({ token: 'unused', fetch: fetchMock });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(snap.items).toEqual([]);
  });
});
