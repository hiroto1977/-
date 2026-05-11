import { describe, expect, it, vi } from 'vitest';
import { fetchCalendarSnapshot } from '../calendar';

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

describe('fetchCalendarSnapshot', () => {
  it('returns calendars and distinguishes all-day vs timed events', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        jsonResponse({
          items: [{ id: 'primary', summary: 'Primary', timeZone: 'Asia/Tokyo' }],
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          items: [
            { id: 'e1', summary: 'All day', start: { date: '2026-05-15' } },
            { id: 'e2', summary: 'Meeting', start: { dateTime: '2026-05-15T10:00:00+09:00' } },
          ],
        }),
      );

    const snap = await fetchCalendarSnapshot({ token: 't', fetch: fetchMock });

    expect(snap.calendars[0].summary).toBe('Primary');
    expect(snap.events[0]).toMatchObject({ id: 'e1', allDay: true, startDate: '2026-05-15' });
    expect(snap.events[1]).toMatchObject({ id: 'e2', allDay: false });
  });
});
