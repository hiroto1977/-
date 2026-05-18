import { describe, expect, it, vi } from 'vitest';
import { fetchMutualFundsSnapshot, ACTIONS } from '../mutual-funds';

describe('fetchMutualFundsSnapshot (snapshot-only stub)', () => {
  it('returns a typed stub without hitting the network', async () => {
    const fetchMock = vi.fn<typeof fetch>();
    const snap = await fetchMutualFundsSnapshot({ token: 'unused', fetch: fetchMock });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(snap.holdings).toEqual([]);
    expect(snap.portfolio).toEqual({ totalValuation: 0, totalCostBasis: 0, unrealizedGain: 0, unrealizedGainPct: 0 });
    expect(snap.recentDividends).toEqual([]);
  });
});

describe('mutual-funds ACTIONS', () => {
  describe('record-entry', () => {
    const action = ACTIONS['record-entry']!;
    it('records valid input', async () => {
      const r = await action({ token: '', payload: { note: 'eMAXIS Slim S&P500 を 1 万円積立', amount: 10_000 } }) as { ok: boolean; serviceId: string };
      expect(r.ok).toBe(true);
      expect(r.serviceId).toBe('mutual-funds');
    });
    it('rejects empty note', async () => {
      await expect(action({ token: '', payload: { note: '' } })).rejects.toThrow(/note は 1-2000/);
    });
    it('rejects oversized note', async () => {
      await expect(action({ token: '', payload: { note: 'x'.repeat(2001) } })).rejects.toThrow(/note は 1-2000/);
    });
    it('rejects non-finite amount', async () => {
      await expect(action({ token: '', payload: { note: 'x', amount: Infinity } })).rejects.toThrow(/amount は finite/);
    });
  });

  describe('advise', () => {
    const action = ACTIONS['advise']!;
    it('returns Markdown stub for 投資信託', async () => {
      const r = await action({ token: '', payload: {} }) as { markdown: string; phase: string };
      expect(r.phase).toBe('stub');
      expect(r.markdown).toMatch(/投資信託|S&P500/);
      expect(r.markdown).toMatch(/Phase 6/);
    });
  });
});
