import { jsonFetch, type ActionContext, type ActionMap, type FetchContext } from './types';

interface CalListItem {
  id: string;
  summary: string;
  timeZone: string;
}

interface CalListResponse {
  items: CalListItem[];
}

interface CalEvent {
  id: string;
  summary?: string;
  start: { date?: string; dateTime?: string };
}

interface CalEventsResponse {
  items: CalEvent[];
}

export interface CalendarSnapshot {
  calendars: { id: string; summary: string; timeZone: string }[];
  events: { id: string; summary: string; startDate: string; allDay: boolean }[];
}

export async function fetchCalendarSnapshot(ctx: FetchContext): Promise<CalendarSnapshot> {
  const fetchCtx = { fetch: ctx.fetch, serviceId: 'calendar' };
  const headers = { Authorization: `Bearer ${ctx.token}` };

  const list = await jsonFetch<CalListResponse>(
    'https://www.googleapis.com/calendar/v3/users/me/calendarList',
    { headers },
    fetchCtx,
  );

  const now = new Date().toISOString();
  const events = await jsonFetch<CalEventsResponse>(
    'https://www.googleapis.com/calendar/v3/calendars/primary/events' +
      `?singleEvents=true&orderBy=startTime&timeMin=${encodeURIComponent(now)}&maxResults=10`,
    { headers },
    fetchCtx,
  );

  return {
    calendars: (list.items ?? []).map((c) => ({
      id: c.id,
      summary: c.summary,
      timeZone: c.timeZone,
    })),
    events: (events.items ?? []).map((e) => {
      const allDay = !!e.start.date;
      return {
        id: e.id,
        summary: e.summary ?? '（タイトルなし）',
        startDate: allDay ? e.start.date! : (e.start.dateTime ?? ''),
        allDay,
      };
    }),
  };
}

// --- write-side actions --------------------------------------------------

interface CreateEventPayload {
  summary: string;
  start: string; // ISO 8601 datetime
  end: string;   // ISO 8601 datetime
  description?: string;
  location?: string;
  timeZone?: string; // defaults to Asia/Tokyo
}

interface CalendarCreateEventResponse {
  id: string;
  htmlLink: string;
  summary?: string;
}

/** Best-effort guess at the user's local IANA time zone. Falls back to
 *  UTC if Intl is unavailable for some reason. Exported for testing. */
export function defaultTimeZone(): string {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (typeof tz === 'string' && tz.length > 0) return tz;
  } catch {
    // ignore
  }
  return 'UTC';
}

async function createEvent(ctx: ActionContext): Promise<{ id: string; htmlLink: string }> {
  const { summary, start, end, description, location, timeZone } =
    ctx.payload as unknown as CreateEventPayload;
  if (!summary || !start || !end) throw new Error('summary, start, end are required');

  const tz = timeZone ?? defaultTimeZone();
  const body = {
    summary,
    description,
    location,
    start: { dateTime: start, timeZone: tz },
    end: { dateTime: end, timeZone: tz },
  };

  const res = await jsonFetch<CalendarCreateEventResponse>(
    'https://www.googleapis.com/calendar/v3/calendars/primary/events',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${ctx.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    },
    { fetch: ctx.fetch, serviceId: 'calendar' },
  );

  return { id: res.id, htmlLink: res.htmlLink };
}

export const ACTIONS: ActionMap = {
  'create-event': createEvent,
};
