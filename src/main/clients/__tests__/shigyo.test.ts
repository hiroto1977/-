import { describe, expect, it, vi } from 'vitest';
import { createShigyoFetcher } from '../shigyo';

describe('createShigyoFetcher', () => {
  it('returns a callable async fetcher', () => {
    expect(typeof createShigyoFetcher()).toBe('function');
  });

  it('resolves to an empty ShigyoSnapshot without hitting the network', async () => {
    const fetchMock = vi.fn<typeof fetch>();
    const fetcher = createShigyoFetcher();
    const snap = await fetcher({ token: 'unused', fetch: fetchMock });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(snap.contacts).toEqual([]);
    expect(snap.recentConsultations).toEqual([]);
    expect(snap.pendingDocuments).toEqual([]);
    expect(snap.monthlyFee).toBe(0);
    expect(snap.outstandingInvoice).toBe(0);
  });

  it('returns equal snapshots on repeated calls', async () => {
    const fetcher = createShigyoFetcher();
    const ctx = { token: 'x', fetch: vi.fn<typeof fetch>() };
    const a = await fetcher(ctx);
    const b = await fetcher(ctx);
    expect(a).toEqual(b);
  });

  it('produces independent fetchers from independent factory calls', async () => {
    const f1 = createShigyoFetcher();
    const f2 = createShigyoFetcher();
    expect(f1).not.toBe(f2);
    expect(await f1({ token: 't', fetch: vi.fn<typeof fetch>() })).toEqual(
      await f2({ token: 't', fetch: vi.fn<typeof fetch>() }),
    );
  });
});
