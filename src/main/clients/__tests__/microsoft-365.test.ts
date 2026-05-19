import { describe, expect, it, vi } from 'vitest';
import { fetchMicrosoft365Snapshot } from '../microsoft-365';

describe('fetchMicrosoft365Snapshot (snapshot-only stub)', () => {
  it('returns a typed stub without hitting the network', async () => {
    const fetchMock = vi.fn<typeof fetch>();
    const snap = await fetchMicrosoft365Snapshot({ token: 'unused', fetch: fetchMock });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(snap.items).toEqual([]);
    expect(snap.count).toBe(0);
  });
});
