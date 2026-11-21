import { describe, expect, it, vi } from 'vitest';
import { fetchTeamSnapshot } from '../team';

describe('fetchTeamSnapshot (ローカル — 空の土台; members live in the renderer record store)', () => {
  it('returns the empty base without hitting the network', async () => {
    const fetchMock = vi.fn<typeof fetch>();
    const snap = await fetchTeamSnapshot({ token: 'unused', fetch: fetchMock });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(snap.items).toEqual([]);
  });
});
