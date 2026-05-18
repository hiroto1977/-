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
    it('records valid input', async () => {
      const r = await action({ token: '', payload: { note: '修繕費発生', amount: -120_000 } }) as { ok: boolean; serviceId: string };
      expect(r.ok).toBe(true);
      expect(r.serviceId).toBe('real-estate');
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
    it('returns Markdown stub for 不動産投資', async () => {
      const r = await action({ token: '', payload: {} }) as { markdown: string; phase: string };
      expect(r.phase).toBe('stub');
      expect(r.markdown).toMatch(/不動産投資/);
      expect(r.markdown).toMatch(/Phase 6/);
    });
  });
});
