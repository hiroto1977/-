import { describe, expect, it, vi } from 'vitest';
import { fetchCalendarSnapshot, ACTIONS, defaultTimeZone } from '../calendar';

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

/** 一覧 → 予定 の順で 2 回叩くので、その 2 応答をまとめて用意する。 */
function twoCalls(list: unknown, events: unknown) {
  return vi
    .fn<typeof fetch>()
    .mockResolvedValueOnce(jsonResponse(list))
    .mockResolvedValueOnce(jsonResponse(events));
}

function headersOf(call: Parameters<typeof fetch>): Record<string, string> {
  return (call[1]?.headers ?? {}) as Record<string, string>;
}

describe('fetchCalendarSnapshot', () => {
  it('returns calendars and distinguishes all-day vs timed events', async () => {
    const fetchMock = twoCalls(
      { items: [{ id: 'primary', summary: 'Primary', timeZone: 'Asia/Tokyo' }] },
      {
        items: [
          { id: 'e1', summary: 'All day', start: { date: '2026-05-15' } },
          { id: 'e2', summary: 'Meeting', start: { dateTime: '2026-05-15T10:00:00+09:00' } },
        ],
      },
    );

    const snap = await fetchCalendarSnapshot({ token: 't', fetch: fetchMock });

    expect(snap.calendars[0]!.summary).toBe('Primary');
    expect(snap.events[0]).toMatchObject({ id: 'e1', allDay: true, startDate: '2026-05-15' });
    expect(snap.events[1]).toMatchObject({ id: 'e2', allDay: false });
  });
});

// トークンの送り先。Google の OAuth アクセストークンを持ち歩く経路なので、
// 「どこへ」「どうやって」載せるかが変わったら落ちるようにしておく。
describe('fetchCalendarSnapshot — 送り先と資格情報', () => {
  it('一覧は Google の calendarList を叩き、トークンは Authorization だけに載る', async () => {
    const fetchMock = twoCalls({ items: [] }, { items: [] });
    await fetchCalendarSnapshot({ token: 'ya29.secret', fetch: fetchMock });

    const listCall = fetchMock.mock.calls[0]!;
    expect(listCall[0]).toBe('https://www.googleapis.com/calendar/v3/users/me/calendarList');
    expect(headersOf(listCall).Authorization).toBe('Bearer ya29.secret');
    // クエリ文字列に載せるとサーバのアクセスログに残る。URL 側には出さない。
    expect(String(listCall[0])).not.toContain('ya29.secret');
  });

  it('予定の問い合わせも同じトークンを Authorization で送る', async () => {
    const fetchMock = twoCalls({ items: [] }, { items: [] });
    await fetchCalendarSnapshot({ token: 'ya29.secret', fetch: fetchMock });

    const eventsCall = fetchMock.mock.calls[1]!;
    expect(headersOf(eventsCall).Authorization).toBe('Bearer ya29.secret');
    expect(String(eventsCall[0])).not.toContain('ya29.secret');
  });

  it('予定は「今より後・繰り返しを展開・開始順・10 件」で問い合わせる', async () => {
    const fetchMock = twoCalls({ items: [] }, { items: [] });
    const before = Date.now();
    await fetchCalendarSnapshot({ token: 't', fetch: fetchMock });

    const url = new URL(String(fetchMock.mock.calls[1]![0]));
    expect(url.origin).toBe('https://www.googleapis.com');
    expect(url.pathname).toBe('/calendar/v3/calendars/primary/events');
    // singleEvents を落とすと繰り返しの予定が「親」1 件で返り、開始日は
    // 初回のもの（過去かもしれない）になる。orderBy はそれが前提。
    expect(url.searchParams.get('singleEvents')).toBe('true');
    expect(url.searchParams.get('orderBy')).toBe('startTime');
    expect(url.searchParams.get('maxResults')).toBe('10');

    // timeMin が無いと過去の予定まで全部返る。今この瞬間を基準にしている。
    const timeMin = url.searchParams.get('timeMin');
    expect(timeMin).not.toBeNull();
    const parsed = Date.parse(timeMin!);
    expect(Number.isNaN(parsed)).toBe(false);
    expect(parsed).toBeGreaterThanOrEqual(before - 1000);
    expect(parsed).toBeLessThanOrEqual(Date.now() + 1000);
  });

  it('失敗したときどのサービスが落ちたか分かる', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response('token expired', { status: 401 }));

    await expect(fetchCalendarSnapshot({ token: 't', fetch: fetchMock })).rejects.toMatchObject({
      serviceId: 'calendar',
      status: 401,
    });
  });
});

describe('fetchCalendarSnapshot — 欠けた項目', () => {
  it('items ごと無い応答でも空配列を返して落ちない', async () => {
    const fetchMock = twoCalls({}, {});
    const snap = await fetchCalendarSnapshot({ token: 't', fetch: fetchMock });
    expect(snap.calendars).toEqual([]);
    expect(snap.events).toEqual([]);
  });

  it('タイトルの無い予定は「（タイトルなし）」として並ぶ', async () => {
    const fetchMock = twoCalls({ items: [] }, { items: [{ id: 'e1', start: { date: '2026-05-15' } }] });
    const snap = await fetchCalendarSnapshot({ token: 't', fetch: fetchMock });
    expect(snap.events[0]!.summary).toBe('（タイトルなし）');
  });

  it('date も dateTime も無い予定は空文字にする（undefined を画面に出さない）', async () => {
    const fetchMock = twoCalls({ items: [] }, { items: [{ id: 'e1', summary: '謎', start: {} }] });
    const snap = await fetchCalendarSnapshot({ token: 't', fetch: fetchMock });
    expect(snap.events[0]).toMatchObject({ allDay: false, startDate: '' });
  });
});

/** `Intl` の応答を差し替えて `defaultTimeZone` を呼ぶ。呼び終えたら必ず戻す。 */
function withIntl<T>(resolvedOptions: () => unknown, fn: () => T): T {
  const spy = vi
    .spyOn(Intl, 'DateTimeFormat')
    .mockImplementation(() => ({ resolvedOptions }) as unknown as Intl.DateTimeFormat);
  try {
    return fn();
  } finally {
    spy.mockRestore();
  }
}

describe('defaultTimeZone', () => {
  it('returns the host IANA time zone, not a hard-coded one', () => {
    const tz = defaultTimeZone();
    expect(typeof tz).toBe('string');
    expect(tz.length).toBeGreaterThan(0);
    // Should match Intl's own resolution
    expect(tz).toBe(Intl.DateTimeFormat().resolvedOptions().timeZone);
  });

  it('Intl が返した地域をそのまま使う（UTC 決め打ちではない）', () => {
    // CI の TZ は UTC なので、上の検査だけでは「常に UTC を返す」実装と
    // 見分けが付かない。UTC 以外を返させて初めて区別できる。
    expect(withIntl(() => ({ timeZone: 'Asia/Tokyo' }), defaultTimeZone)).toBe('Asia/Tokyo');
  });

  it('地域が空文字なら UTC に落とす', () => {
    expect(withIntl(() => ({ timeZone: '' }), defaultTimeZone)).toBe('UTC');
  });

  it('地域が文字列でなければ UTC に落とす', () => {
    // 長さを持つ「文字列でない値」。これでないと `typeof` の判定と
    // `length > 0` の判定のどちらが効いているのか区別できない。
    expect(withIntl(() => ({ timeZone: ['Asia/Tokyo'] }), defaultTimeZone)).toBe('UTC');
  });

  it('Intl 自体が使えなければ UTC に落とす', () => {
    const spy = vi.spyOn(Intl, 'DateTimeFormat').mockImplementation(() => {
      throw new Error('Intl unavailable');
    });
    try {
      expect(defaultTimeZone()).toBe('UTC');
    } finally {
      spy.mockRestore();
    }
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
    expect(result.htmlLink).toBe('https://calendar.google.com/event?eid=x');
    const init = fetchMock.mock.calls[0]![1] as RequestInit;
    const body = JSON.parse(init.body as string);
    expect(body.summary).toBe('Meeting');
    // No hardcoded TZ — the action now uses the host's IANA zone unless
    // the caller overrides it.
    expect(body.start.dateTime).toBe('2026-06-01T10:00:00+09:00');
    expect(body.start.timeZone).toBe(defaultTimeZone());
    expect(body.end.dateTime).toBe('2026-06-01T11:00:00+09:00');
  });

  it('書き込みは Google の events へ POST し、トークンは Authorization だけに載る', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({ id: 'e1', htmlLink: '' }));

    await ACTIONS['create-event']!({
      token: 'ya29.secret',
      fetch: fetchMock,
      payload: { summary: 'x', start: '2026-06-01T10:00:00Z', end: '2026-06-01T11:00:00Z' },
    });

    const [url, init] = fetchMock.mock.calls[0]! as [string, RequestInit];
    expect(url).toBe('https://www.googleapis.com/calendar/v3/calendars/primary/events');
    expect(url).not.toContain('ya29.secret');
    expect(init.method).toBe('POST');
    const headers = init.headers as Record<string, string>;
    expect(headers.Authorization).toBe('Bearer ya29.secret');
    // JSON だと名乗らないと Google はボディを読まない。
    expect(headers['Content-Type']).toBe('application/json');
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
    ).rejects.toThrow('summary, start, end are required');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('summary が無ければ送らない', async () => {
    const fetchMock = vi.fn<typeof fetch>();
    await expect(
      ACTIONS['create-event']!({
        token: 't',
        fetch: fetchMock,
        payload: { start: '2026-06-01T10:00:00Z', end: '2026-06-01T11:00:00Z' },
      }),
    ).rejects.toThrow('summary, start, end are required');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('start が無ければ送らない', async () => {
    const fetchMock = vi.fn<typeof fetch>();
    await expect(
      ACTIONS['create-event']!({
        token: 't',
        fetch: fetchMock,
        payload: { summary: 'x', end: '2026-06-01T11:00:00Z' },
      }),
    ).rejects.toThrow('summary, start, end are required');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('書き込みが失敗したときどのサービスが落ちたか分かる', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response('forbidden', { status: 403 }));

    await expect(
      ACTIONS['create-event']!({
        token: 't',
        fetch: fetchMock,
        payload: { summary: 'x', start: '2026-06-01T10:00:00Z', end: '2026-06-01T11:00:00Z' },
      }),
    ).rejects.toMatchObject({ serviceId: 'calendar', status: 403 });
  });
});
