import { describe, expect, it, vi } from 'vitest';
import { fetchStorageSnapshot } from '../storage';

describe('fetchStorageSnapshot (snapshot-only stub)', () => {
  it('returns a typed stub without hitting the network', async () => {
    const fetchMock = vi.fn<typeof fetch>();
    const snap = await fetchStorageSnapshot({ token: 'unused', fetch: fetchMock });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(snap.disks).toEqual([]);
    expect(snap.largeFolders).toEqual([]);
    expect(snap.cleanupTasks).toEqual([]);
    expect(snap.recommendations).toEqual([]);
    expect(snap.performance.fragmentationPct).toBe(0);
    expect(snap.performance.runningProcesses).toBe(0);
  });
});
