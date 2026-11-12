import { describe, expect, it, vi } from 'vitest';
import { fetchDockerSnapshot } from '../docker';

describe('fetchDockerSnapshot (snapshot-only stub)', () => {
  it('returns a typed stub without hitting the network', async () => {
    const fetchMock = vi.fn<typeof fetch>();
    const snap = await fetchDockerSnapshot({ token: 'unused', fetch: fetchMock });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(snap.engine.version).toBe('');
    expect(snap.engine.rootless).toBe(false);
    expect(snap.engine.ghcrLinked).toBe(false);
    expect(snap.containers).toEqual([]);
    expect(snap.images).toEqual([]);
    expect(snap.security).toEqual([]);
    expect(snap.workflows).toEqual([]);
  });
});
