import { describe, expect, it, vi } from 'vitest';
import { createSnapshotStub } from '../snapshotStub';

describe('createSnapshotStub', () => {
  it('returns a callable async fetcher', () => {
    expect(typeof createSnapshotStub({ items: [] })).toBe('function');
  });

  it('resolves to the provided stub without hitting the network', async () => {
    const fetchMock = vi.fn<typeof fetch>();
    const stub = { items: [{ id: 'a', name: 'A' }], count: 1 };
    const fetcher = createSnapshotStub(stub);
    const snap = await fetcher({ token: 'unused', fetch: fetchMock });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(snap).toBe(stub);
    expect(snap).toEqual({ items: [{ id: 'a', name: 'A' }], count: 1 });
  });

  it('returns the same stub reference on repeated calls', async () => {
    const stub = { value: 42 };
    const fetcher = createSnapshotStub(stub);
    const ctx = { token: 'x', fetch: vi.fn<typeof fetch>() };
    expect(await fetcher(ctx)).toBe(await fetcher(ctx));
  });

  it('ignores the fetch context entirely', async () => {
    const fetcher = createSnapshotStub('hello');
    expect(await fetcher({ token: '', fetch: vi.fn<typeof fetch>() })).toBe('hello');
  });
});
