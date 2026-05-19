import { describe, expect, it } from 'vitest';
import { fetchSettingsSnapshot, fetchSettingsSnapshotImpl } from '../settings';

describe('fetchSettingsSnapshot', () => {
  it('returns a snapshot with isMock=true', async () => {
    const snap = await fetchSettingsSnapshotImpl({ token: '' });
    expect(snap.isMock).toBe(true);
  });

  it('pins the note copy', async () => {
    const snap = await fetchSettingsSnapshotImpl({ token: '' });
    expect(snap.note).toBe('API キーはマスターパスワードで暗号化されてブラウザに保管されます');
  });

  it('pins the fetchedAt anchor', async () => {
    const snap = await fetchSettingsSnapshotImpl({ token: '' });
    expect(snap.fetchedAt).toBe('2035-05-15T00:00:00.000Z');
  });

  it('production wrapper delegates to impl', async () => {
    const snap = await fetchSettingsSnapshot({ token: '' });
    expect(snap.isMock).toBe(true);
  });
});
