import { jsonFetch, type ActionContext, type ActionMap, type FetchContext } from './types';
import { displayField, objectRows } from '../../shared/apiResponse';
import {
  CALENDAR_CREATE_EVENT_PATH,
  GOOGLE_CALENDAR_API,
  calendarEventInit,
  checkCalendarEvent,
  parseCreatedEvent,
} from '../../shared/api/google';
import type { ActionData } from '../../shared/actionData';

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
    calendars: objectRows<CalListItem>(list.items).map((c) => ({
      // **画面の欄へ入る第三者の文字列は天井を通る** (2026-09-22 · パス 415)。
      // 実測 (直す前): カレンダー名と予定の件名に 200,000 字を入れると
      // `CalendarPage` の総文字数が **400,946 字**になった。
      id: displayField(c.id),
      summary: displayField(c.summary),
      timeZone: displayField(c.timeZone),
    })),
    events: objectRows<CalEvent>(events.items).map((e) => {
      /*
       * **`start` が無い予定でも投げない** (2026-09-22 · パス 409)。
       *
       * 実測 (直す前): `{ id: 'e1' }` を 1 件混ぜると
       * `Cannot read properties of undefined (reading 'date')` で
       * **カレンダー画面が丸ごと使えなくなった**。型宣言は `start` を必須と
       * 言うが、それは `jsonFetch<T>` のキャストが作った見せかけである。
       *
       * ★ 読める値の答えは 1 つも変えていない —— `date` が在れば終日、
       *   無ければ `dateTime`、どちらも無ければ空 (今日と同じ)。
       */
      const start = e.start !== null && typeof e.start === 'object' ? e.start : {};
      const date = typeof start.date === 'string' ? start.date : '';
      const dateTime = typeof start.dateTime === 'string' ? start.dateTime : '';
      const allDay = date !== '';
      return {
        id: displayField(e.id),
        summary: displayField(e.summary) || '（タイトルなし）',
        startDate: allDay ? date : dateTime,
        allDay,
      };
    }),
  };
}

// --- write-side actions --------------------------------------------------

/**
 * `create-event` の payload の宣言 (§3.2 の表がこの名前で照合する)。欄の判定は
 * shared の `checkCalendarEvent` (`CalendarEventFields` = 欄が unknown の受け口) が行う。
 */
export interface CreateEventPayload {
  summary: string;
  start: string; // ISO 8601 datetime
  end: string;   // ISO 8601 datetime
  description?: string;
  location?: string;
  timeZone?: string; // defaults to the host time zone (shared defaultTimeZone)
}

/** 端末の時間帯の推測は shared に 1 つ。検査が main の名前で読むので再 export する。 */
export { defaultTimeZone } from '../../shared/api/google';

async function createEvent(ctx: ActionContext): Promise<ActionData<'calendar/create-event'>> {
  // 欄の判定・URL・要求・応答の読みは shared/api/google.ts の 1 つ (ブラウザ版も同じ関数 · 2026-09-18)。
  const event = checkCalendarEvent(ctx.payload);
  const res = await jsonFetch<Record<string, unknown>>(
    `${GOOGLE_CALENDAR_API}${CALENDAR_CREATE_EVENT_PATH}`,
    calendarEventInit(event, ctx.token),
    { fetch: ctx.fetch, serviceId: 'calendar' },
  );
  return parseCreatedEvent(res);
}

export const ACTIONS: ActionMap = {
  'create-event': createEvent,
};
