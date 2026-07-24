import { describe, expect, it } from 'vitest';
import { ACTIONS, fetchDocstudioSnapshot } from '../docstudio';

describe('fetchDocstudioSnapshot', () => {
  it('returns the fixed local snapshot without touching the network', async () => {
    const snap = await fetchDocstudioSnapshot({ token: '' });

    expect(snap.isMock).toBe(true);
    expect(snap.collections).toHaveLength(3);
    expect(snap.collections.map((c) => c.id)).toEqual(['studio', 'teikan', 'shugyo']);
    // 経営書類 12 種がデータソース (docStudioData.ts) と一致していること
    expect(snap.collections[0]).toMatchObject({ id: 'studio', docCount: 12 });
  });
});

describe("ACTIONS['list-collections']", () => {
  it('returns the same collections as the snapshot', async () => {
    const list = (await ACTIONS['list-collections']!({
      token: '',
      payload: {},
    })) as { id: string }[];

    const snap = await fetchDocstudioSnapshot({ token: '' });
    expect(list).toEqual(snap.collections);
  });
});
