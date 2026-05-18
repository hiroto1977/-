import { describe, expect, it, vi } from 'vitest';
import { fetchDemaeCanSnapshot, ACTIONS } from '../demae-can';

describe('fetchDemaeCanSnapshot (snapshot-only stub)', () => {
  it('returns a typed stub without hitting the network', async () => {
    const fetchMock = vi.fn<typeof fetch>();
    const snap = await fetchDemaeCanSnapshot({ token: 'unused', fetch: fetchMock });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(snap.orders).toEqual([]);
    expect(snap.topAreas).toEqual([]);
    expect(snap.monthSummary).toEqual({ orders: 0, revenue: 0, avgOrderValue: 0, cancellationRate: 0 });
  });
});

describe('demae-can ACTIONS', () => {
  describe('record-entry', () => {
    const action = ACTIONS['record-entry']!;
    it('records valid input', async () => {
      const r = await action({ token: '', payload: { note: '配達遅延あり', amount: 2_400 } }) as { ok: boolean; serviceId: string };
      expect(r.ok).toBe(true);
      expect(r.serviceId).toBe('demae-can');
    });
    it('rejects empty note', async () => {
      await expect(action({ token: '', payload: { note: '' } })).rejects.toThrow(/note は 1-2000/);
    });
    it('rejects oversized note', async () => {
      await expect(action({ token: '', payload: { note: 'x'.repeat(2001) } })).rejects.toThrow(/note は 1-2000/);
    });
    it('rejects NaN amount', async () => {
      await expect(action({ token: '', payload: { note: 'x', amount: Number.NaN } })).rejects.toThrow(/amount は finite/);
    });
  });

  describe('advise', () => {
    const action = ACTIONS['advise']!;
    it('returns Markdown stub for 出前館', async () => {
      const r = await action({ token: '', payload: {} }) as { markdown: string; phase: string };
      expect(r.phase).toBe('stub');
      expect(r.markdown).toMatch(/出前館/);
      expect(r.markdown).toMatch(/Phase 6/);
    });
  });
});
