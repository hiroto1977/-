import { describe, expect, it, vi } from 'vitest';
import { fetchMentorSnapshot } from '../mentor';
import { MENTOR_QUESTIONS } from '../../../shared/mentor';

describe('fetchMentorSnapshot (snapshot-only stub; 記録は renderer の record store)', () => {
  it('網を叩かず、聞き取りの問いの台帳だけを返す (人の記録は持たない)', async () => {
    const fetchMock = vi.fn<typeof fetch>();
    const snap = await fetchMentorSnapshot({ token: 'unused', fetch: fetchMock });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(snap.questions).toEqual(MENTOR_QUESTIONS);
    expect(snap.questions.length).toBe(6);
    expect(Object.keys(snap)).toEqual(['questions', 'checkinIntervalDays']);
  });
});
