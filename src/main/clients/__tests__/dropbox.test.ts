import { describe, expect, it, vi } from 'vitest';
import { fetchDropboxSnapshot } from '../dropbox';

describe('fetchDropboxSnapshot (snapshot-only stub)', () => {
  it('returns a typed stub without hitting the network', async () => {
    const fetchMock = vi.fn<typeof fetch>();
    const snap = await fetchDropboxSnapshot({ token: 'unused', fetch: fetchMock });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(snap.items).toEqual([]);
    expect(snap.count).toBe(0);
  });
});
