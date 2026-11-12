import { describe, expect, it, vi } from 'vitest';
import { fetchObsidianSnapshot } from '../obsidian';

describe('fetchObsidianSnapshot (snapshot-only stub)', () => {
  it('returns a typed stub without hitting the network', async () => {
    const fetchMock = vi.fn<typeof fetch>();
    const snap = await fetchObsidianSnapshot({ token: 'unused', fetch: fetchMock });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(snap.vault.noteCount).toBe(0);
    expect(snap.vault.gitRemote).toBe('');
    expect(snap.vault.encrypted).toBe(false);
    expect(snap.notes).toEqual([]);
    expect(snap.security).toEqual([]);
    expect(snap.workflows).toEqual([]);
  });
});
