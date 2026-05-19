import { describe, expect, it } from 'vitest';
import { fetchHomeSnapshot, fetchHomeSnapshotImpl } from '../home';

describe('fetchHomeSnapshot', () => {
  it('returns a non-empty greeting with isMock=true', async () => {
    const snap = await fetchHomeSnapshotImpl({ token: '' });
    expect(snap.greeting.length).toBeGreaterThan(0);
    expect(snap.isMock).toBe(true);
  });

  it('pins the greeting copy (kills StringLiteral mutants)', async () => {
    const snap = await fetchHomeSnapshotImpl({ token: '' });
    expect(snap.greeting).toBe('こんにちは。今日は何を作りましょう?');
  });

  it('pins the fetchedAt anchor (kills StringLiteral mutants)', async () => {
    const snap = await fetchHomeSnapshotImpl({ token: '' });
    expect(snap.fetchedAt).toBe('2035-05-15T00:00:00.000Z');
  });

  it('production wrapper delegates to impl', async () => {
    const snap = await fetchHomeSnapshot({ token: '' });
    expect(snap.isMock).toBe(true);
    expect(snap.greeting).toBe('こんにちは。今日は何を作りましょう?');
  });
});
