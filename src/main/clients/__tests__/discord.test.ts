import { describe, expect, it, vi } from 'vitest';
import { fetchDiscordSnapshot } from '../discord';

describe('fetchDiscordSnapshot (snapshot-only stub)', () => {
  it('returns a typed stub without hitting the network', async () => {
    const fetchMock = vi.fn<typeof fetch>();
    const snap = await fetchDiscordSnapshot({ token: 'unused', fetch: fetchMock });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(snap.items).toEqual([]);
    expect(snap.count).toBe(0);
  });
});
