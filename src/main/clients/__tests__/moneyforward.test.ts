import { describe, expect, it, vi } from 'vitest';
import { fetchMoneyforwardSnapshot } from '../moneyforward';

describe('fetchMoneyforwardSnapshot (virtual-data stub)', () => {
  it('returns virtual accounting data without hitting the network', async () => {
    const fetchMock = vi.fn<typeof fetch>();
    const snap = await fetchMoneyforwardSnapshot({ token: 'unused', fetch: fetchMock });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(snap.items.length).toBeGreaterThan(0);
    for (const it of snap.items) {
      expect(it.id).toBeTruthy();
      expect(it.name).toBeTruthy();
    }
  });
});
