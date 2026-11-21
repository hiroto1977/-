import { describe, expect, it, vi } from 'vitest';
import { fetchTaxSnapshot } from '../tax';
import { buildTaxSnapshot } from '../../../shared/taxSnapshot';

describe('fetchTaxSnapshot (ローカル — 試算メニューの台帳だけを返す)', () => {
  it('returns the simulation menu without hitting the network', async () => {
    const fetchMock = vi.fn<typeof fetch>();
    const snap = await fetchTaxSnapshot({ token: 'unused', fetch: fetchMock });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(snap.items.length).toBeGreaterThan(0);
    for (const it of snap.items) {
      expect(it.id).toBeTruthy();
      expect(it.name).toBeTruthy();
    }
  });

  it('組み立ては shared の buildTaxSnapshot と一致する (ブラウザ版と同値)', async () => {
    const snap = await fetchTaxSnapshot({ token: '' });
    expect(snap).toEqual(buildTaxSnapshot());
  });
});
