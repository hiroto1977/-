import { jsonFetch, type FetchContext } from './types';

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
