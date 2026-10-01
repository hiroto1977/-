import { describe, expect, it, vi } from 'vitest';
import { fetchLaborConsultantSnapshot } from '../labor-consultant';

describe('fetchLaborConsultantSnapshot (snapshot-only stub)', () => {
  it('returns a typed stub without hitting the network', async () => {
    const fetchMock = vi.fn<typeof fetch>();
    const snap = await fetchLaborConsultantSnapshot({ token: 'unused', fetch: fetchMock });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(snap.contacts).toEqual([]);
    expect(snap.recentConsultations).toEqual([]);
    expect(snap.pendingDocuments).toEqual([]);
    expect(snap.monthlyFee).toBe(0);
    expect(snap.outstandingInvoice).toBe(0);
  });
});
