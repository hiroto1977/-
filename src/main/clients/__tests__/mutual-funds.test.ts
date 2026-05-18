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
    it('records valid input with persisted=false', async () => {
      const r = await action({ token: '', payload: { note: 'eMAXIS Slim S&P500 を 1 万円積立', amount: 10_000 } }) as { ok: boolean; serviceId: string; persisted: false };
      expect(r.ok).toBe(true);
      expect(r.serviceId).toBe('mutual-funds');
      expect(r.persisted).toBe(false);
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
    it('returns AdvisorResponse-compatible shape (with strict investment disclaimer)', async () => {
      const r = await action({ token: '', payload: {} }) as {
        recommendations: { title: string; rationale: string }[];
        disclaimer: string; notForRealMoney: true; phase: 'stub' | 'live';
      };
      expect(r.phase).toBe('stub');
      expect(r.notForRealMoney).toBe(true);
      expect(r.disclaimer).toMatch(/投資助言ではありません/);
      expect(r.disclaimer).toMatch(/Phase 6/);
      expect(r.recommendations.length).toBeGreaterThan(0);
    });
  });
});
