import { describe, expect, it, vi } from 'vitest';
import { fetchA8netSnapshot } from '../a8net';

describe('fetchA8netSnapshot (snapshot-only stub)', () => {
  it('returns a typed stub without hitting the network', async () => {
    const fetchMock = vi.fn<typeof fetch>();
    const snap = await fetchA8netSnapshot({ token: 'unused', fetch: fetchMock });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(snap.items).toEqual([]);
  });
});
