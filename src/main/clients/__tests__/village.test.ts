import { describe, expect, it } from 'vitest';
import { fetchVillageSnapshot, fetchVillageSnapshotImpl } from '../village';

describe('fetchVillageSnapshot', () => {
  it('returns a non-empty greeting with isMock=true', async () => {
    const snap = await fetchVillageSnapshotImpl({ token: '' });
    expect(snap.greeting.length).toBeGreaterThan(0);
    expect(snap.isMock).toBe(true);
  });

  it('pins the greeting copy (kills StringLiteral mutants)', async () => {
    const snap = await fetchVillageSnapshotImpl({ token: '' });
    expect(snap.greeting).toBe('ようこそ、AIの村へ。画面に話しかけてみてください。');
  });

  it('pins the fetchedAt anchor (kills StringLiteral mutants)', async () => {
    const snap = await fetchVillageSnapshotImpl({ token: '' });
    expect(snap.fetchedAt).toBe('2035-05-15T00:00:00.000Z');
  });

  it('production wrapper delegates to impl', async () => {
    const snap = await fetchVillageSnapshot({ token: '' });
    expect(snap.isMock).toBe(true);
    expect(snap.greeting).toBe('ようこそ、AIの村へ。画面に話しかけてみてください。');
  });
});
