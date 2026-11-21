import { describe, expect, it, vi } from 'vitest';
import { createShigyoLocalFetcher } from '../shigyo';
import { buildShigyoSnapshot } from '../../../shared/shigyoTypes';

describe('createShigyoLocalFetcher', () => {
  it('returns a callable async fetcher', () => {
    expect(typeof createShigyoLocalFetcher()).toBe('function');
  });

  it('resolves to the empty local base without hitting the network', async () => {
    const fetchMock = vi.fn<typeof fetch>();
    const fetcher = createShigyoLocalFetcher();
    const snap = await fetcher({ token: 'unused', fetch: fetchMock });
    expect(fetchMock).not.toHaveBeenCalled();
    // 見本の人も金額も持たない (利用者の記録は record store が正)。
    expect(snap).toEqual(buildShigyoSnapshot());
    expect(snap.contacts).toEqual([]);
    expect(snap.recentConsultations).toEqual([]);
    expect(snap.pendingDocuments).toEqual([]);
    expect(snap.monthlyFee).toBe(0);
    expect(snap.outstandingInvoice).toBe(0);
  });

  it('returns equal but independent snapshots on repeated calls', async () => {
    const fetcher = createShigyoLocalFetcher();
    const ctx = { token: 'x', fetch: vi.fn<typeof fetch>() };
    const a = await fetcher(ctx);
    const b = await fetcher(ctx);
    expect(a).toEqual(b);
    // 土台は呼び出しごとに組み立てる —— 片方を書き換えても他方に漏れない。
    expect(a).not.toBe(b);
    expect(a.contacts).not.toBe(b.contacts);
  });

  it('produces independent fetchers from independent factory calls', async () => {
    const f1 = createShigyoLocalFetcher();
    const f2 = createShigyoLocalFetcher();
    expect(f1).not.toBe(f2);
    expect(await f1({ token: 't', fetch: vi.fn<typeof fetch>() })).toEqual(
      await f2({ token: 't', fetch: vi.fn<typeof fetch>() }),
    );
  });
});
