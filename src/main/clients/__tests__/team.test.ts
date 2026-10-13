import { describe, expect, it, vi } from 'vitest';
import { fetchTeamSnapshot } from '../team';

describe('fetchTeamSnapshot (no-op stub; members live in the renderer record store)', () => {
  it('returns an empty stub without hitting the network', async () => {
    const fetchMock = vi.fn<typeof fetch>();
    const snap = await fetchTeamSnapshot({ token: 'unused', fetch: fetchMock });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(snap.items).toEqual([]);
  });
});
