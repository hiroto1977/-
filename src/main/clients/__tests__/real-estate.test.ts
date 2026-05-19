import { describe, expect, it, vi } from 'vitest';
import { fetchRealEstateSnapshot, ACTIONS } from '../real-estate';

describe('fetchRealEstateSnapshot (snapshot-only stub)', () => {
  it('returns a typed stub without hitting the network', async () => {
    const fetchMock = vi.fn<typeof fetch>();
    const snap = await fetchRealEstateSnapshot({ token: 'unused', fetch: fetchMock });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(snap.properties).toEqual([]);
    expect(snap.monthlyCashflow).toEqual({ grossRent: 0, operatingExpenses: 0, mortgagePayment: 0, netCashflow: 0 });
    expect(snap.portfolioYield).toBe(0);
    expect(snap.occupancyRate).toBe(0);
  });
});

describe('real-estate ACTIONS', () => {
  describe('record-entry', () => {
    const action = ACTIONS['record-entry']!;
    it('records valid input with persisted=false', async () => {
      const r = await action({ token: '', payload: { note: '修繕費発生', amount: -120_000 } }) as { ok: boolean; serviceId: string; persisted: false };
      expect(r.ok).toBe(true);
      expect(r.serviceId).toBe('real-estate');
      expect(r.persisted).toBe(false);
    });
    it('rejects empty note', async () => {
      await expect(action({ token: '', payload: { note: '' } })).rejects.toThrow(/note は 1-2000/);
    });
    it('rejects oversized note', async () => {
      await expect(action({ token: '', payload: { note: 'x'.repeat(2001) } })).rejects.toThrow(/note は 1-2000/);
    });
    it('rejects non-finite amount', async () => {
      await expect(action({ token: '', payload: { note: 'x', amount: Number.NaN } })).rejects.toThrow(/amount は finite/);
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
      // 投資系には特に厳しい disclaimer (BLOCKING-1)
      expect(r.disclaimer).toMatch(/投資助言ではありません/);
      expect(r.disclaimer).toMatch(/Phase 6/);
      expect(r.recommendations.length).toBeGreaterThan(0);
    });
  });
});
