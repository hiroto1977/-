import { describe, expect, it, vi } from 'vitest';
import { fetchQualitySnapshot } from '../quality';

describe('fetchQualitySnapshot (snapshot-only stub)', () => {
  it('returns a typed stub without hitting the network', async () => {
    const fetchMock = vi.fn<typeof fetch>();
    const snap = await fetchQualitySnapshot({ token: 'unused', fetch: fetchMock });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(snap.unitTests).toEqual({ staticCount: 0, runtimeCount: 0 });
    expect(snap.mutation.threshold).toBe(99.8);
    expect(snap.verifications).toEqual([]);
    expect(snap.reviewHistory).toEqual([]);
    expect(snap.latestCommit).toBe('');
  });
});
