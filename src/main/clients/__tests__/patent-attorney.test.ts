import { describe, expect, it, vi } from 'vitest';
import { fetchPatentAttorneySnapshot } from '../patent-attorney';

describe('fetchPatentAttorneySnapshot (snapshot-only stub)', () => {
  it('returns a typed stub without hitting the network', async () => {
    const fetchMock = vi.fn<typeof fetch>();
    const snap = await fetchPatentAttorneySnapshot({ token: 'unused', fetch: fetchMock });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(snap.contacts).toEqual([]);
    expect(snap.recentConsultations).toEqual([]);
    expect(snap.pendingDocuments).toEqual([]);
    expect(snap.monthlyFee).toBe(0);
    expect(snap.outstandingInvoice).toBe(0);
  });
});
