import { describe, expect, it } from 'vitest';
import { fetchLibrarySnapshot, fetchLibrarySnapshotImpl } from '../library';

describe('fetchLibrarySnapshot', () => {
  it('returns a snapshot with isMock=true and a fixed note', async () => {
    const snap = await fetchLibrarySnapshotImpl({ token: '' });
    expect(snap.isMock).toBe(true);
    expect(snap.note.length).toBeGreaterThan(0);
  });

  it('pins the note copy (kills StringLiteral mutants)', async () => {
    const snap = await fetchLibrarySnapshotImpl({ token: '' });
    expect(snap.note).toBe('ライブラリの実体はブラウザの IndexedDB に保存されます');
  });

  it('pins the fetchedAt anchor (kills StringLiteral mutants)', async () => {
    const snap = await fetchLibrarySnapshotImpl({ token: '' });
    expect(snap.fetchedAt).toBe('2035-05-15T00:00:00.000Z');
  });

  it('production wrapper delegates to impl', async () => {
    const snap = await fetchLibrarySnapshot({ token: '' });
    expect(snap.isMock).toBe(true);
  });
});
