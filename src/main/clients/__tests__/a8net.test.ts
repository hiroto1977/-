import { describe, expect, it, vi } from 'vitest';
import { fetchA8netSnapshot } from '../a8net';
import { buildA8netSnapshot } from '../../../shared/a8netSnapshot';

describe('fetchA8netSnapshot (端末内の記録の土台)', () => {
  it('網に出ず、見本を 1 件も持たない空の土台を返す', async () => {
    const fetchMock = vi.fn<typeof fetch>();
    const snap = await fetchA8netSnapshot({ token: 'unused', fetch: fetchMock });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(snap).toEqual({ items: [] });
  });

  it('毎回新しい土台を組む (モジュール定数を返さない —— 定数なら「見本」の扱いになり更新が呼ばれない)', async () => {
    const a = await fetchA8netSnapshot({ token: '' });
    const b = await fetchA8netSnapshot({ token: '' });
    expect(a).not.toBe(b);
    expect(a).toEqual(buildA8netSnapshot());
  });
});
