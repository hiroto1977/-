import { describe, expect, it, vi } from 'vitest';
import { fetchConnectorsSnapshot } from '../connectors';

describe('fetchConnectorsSnapshot (no-op stub; catalog is rendered from shared/connectors)', () => {
  it('returns an empty stub without hitting the network', async () => {
    const fetchMock = vi.fn<typeof fetch>();
    const snap = await fetchConnectorsSnapshot({ token: 'unused', fetch: fetchMock });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(snap.items).toEqual([]);
  });
});
