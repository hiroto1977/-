import { describe, expect, it, vi } from 'vitest';
import { fetchA8netSnapshot } from '../a8net';

describe('fetchA8netSnapshot (virtual-data stub)', () => {
  it('returns virtual report data without hitting the network', async () => {
    const fetchMock = vi.fn<typeof fetch>();
    const snap = await fetchA8netSnapshot({ token: 'unused', fetch: fetchMock });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(snap.items.length).toBeGreaterThan(0);
    for (const it of snap.items) {
      expect(it.id).toBeTruthy();
      expect(it.name).toBeTruthy();
    }
  });
});
