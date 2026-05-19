import { describe, expect, it, vi } from 'vitest';
import { fetchCalendarSnapshot, ACTIONS, defaultTimeZone } from '../calendar';

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

    expect(snap.calendars[0]!.summary).toBe('Primary');
    expect(snap.events[0]).toMatchObject({ id: 'e1', allDay: true, startDate: '2026-05-15' });
    expect(snap.events[1]).toMatchObject({ id: 'e2', allDay: false });
  });
});

describe('defaultTimeZone', () => {
  it('returns the host IANA time zone, not a hard-coded one', () => {
    const tz = defaultTimeZone();
    expect(typeof tz).toBe('string');
    expect(tz.length).toBeGreaterThan(0);
    // Should match Intl's own resolution
    expect(tz).toBe(Intl.DateTimeFormat().resolvedOptions().timeZone);
  });
});

describe('ACTIONS["create-event"]', () => {
  it('POSTs to primary/events with start/end + host-detected time zone', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValueOnce(
      jsonResponse({ id: 'e1', htmlLink: 'https://calendar.google.com/event?eid=x' }),
    );

    const result = (await ACTIONS['create-event']!({
      token: 'ya29.x',
      fetch: fetchMock,
      payload: {
        summary: 'Meeting',
        start: '2026-06-01T10:00:00+09:00',
        end: '2026-06-01T11:00:00+09:00',
      },
    })) as { id: string; htmlLink: string };

    expect(result.id).toBe('e1');
    const init = fetchMock.mock.calls[0]![1] as RequestInit;
    const body = JSON.parse(init.body as string);
    expect(body.summary).toBe('Meeting');
    // No hardcoded TZ — the action now uses the host's IANA zone unless
    // the caller overrides it.
    expect(body.start.dateTime).toBe('2026-06-01T10:00:00+09:00');
    expect(body.start.timeZone).toBe(defaultTimeZone());
    expect(body.end.dateTime).toBe('2026-06-01T11:00:00+09:00');
  });

  it('honors a custom time zone when supplied', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValueOnce(
      jsonResponse({ id: 'e2', htmlLink: '' }),
    );
    await ACTIONS['create-event']!({
      token: 't',
      fetch: fetchMock,
      payload: {
        summary: 'x',
        start: '2026-06-01T10:00:00Z',
        end: '2026-06-01T11:00:00Z',
        timeZone: 'America/New_York',
      },
    });
    const init = fetchMock.mock.calls[0]![1] as RequestInit;
    expect(JSON.parse(init.body as string).start.timeZone).toBe('America/New_York');
  });

  it('rejects when summary/start/end are missing', async () => {
    const fetchMock = vi.fn<typeof fetch>();
    await expect(
      ACTIONS['create-event']!({
        token: 't',
        fetch: fetchMock,
        payload: { summary: 'x', start: '2026-06-01T10:00:00Z' /* no end */ },
      }),
    ).rejects.toThrow();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
