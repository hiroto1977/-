import { describe, expect, it, vi } from 'vitest';
import {
  fetchMicrosoft365Snapshot,
  buildMicrosoft365Snapshot,
  ACTIONS,
} from '../microsoft-365';
import { FetchError } from '../types';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('buildMicrosoft365Snapshot', () => {
  it('normalizes user, messages, and events', () => {
    const snap = buildMicrosoft365Snapshot(
      { displayName: '山田 太郎' },
      [
        { id: 'm1', subject: '請求書の件', from: { emailAddress: { name: '佐藤' } }, receivedDateTime: '2026-05-10T09:30:00Z', isRead: false },
        { id: 'm2', subject: '', from: { emailAddress: { address: 'x@y.com' } }, receivedDateTime: '2026-05-09T12:00:00Z', isRead: true },
      ],
      [{ id: 'e1', subject: '定例会議', start: { dateTime: '2026-05-12T10:00:00' }, location: { displayName: '会議室A' } }],
    );
    expect(snap.userName).toBe('山田 太郎');
    expect(snap.messages[0]).toEqual({ id: 'm1', subject: '請求書の件', from: '佐藤', received: '2026-05-10', unread: true });
    // empty subject → placeholder; address fallback for from; isRead true → not unread
    expect(snap.messages[1]!.subject).toBe('(件名なし)');
    expect(snap.messages[1]!.from).toBe('x@y.com');
    expect(snap.messages[1]!.unread).toBe(false);
    expect(snap.events[0]).toEqual({ id: 'e1', subject: '定例会議', start: '2026-05-12 10:00', location: '会議室A' });
    // summary line reflects unread count
    expect(snap.items[0]!.name).toContain('未読 1 件');
    expect(snap.count).toBe(2);
  });

  it('falls back through displayName → userPrincipalName → mail for the user name', () => {
    expect(buildMicrosoft365Snapshot({ userPrincipalName: 'u@p.com' }, [], []).userName).toBe('u@p.com');
    expect(buildMicrosoft365Snapshot({ mail: 'm@a.com' }, [], []).userName).toBe('m@a.com');
    expect(buildMicrosoft365Snapshot({}, [], []).userName).toBe('');
  });

  it('applies empty/placeholder fallbacks for missing message & event fields', () => {
    // from 欠落 / emailAddress 欠落 / receivedDateTime 欠落 / subject 空 / start 欠落 /
    // location 欠落 の各 ?.・|| ・?? '' フォールバックを撃墜。
    const snap = buildMicrosoft365Snapshot(
      { displayName: 'U' },
      [
        { id: 'm1' }, // from なし → '' / receivedDateTime なし → ''
        { id: 'm2', from: {} }, // emailAddress なし → from ''
      ],
      [
        { id: 'e1', subject: '' }, // subject 空 → '(件名なし)' / start なし → '' / location なし → ''
      ],
    );
    expect(snap.messages[0]).toEqual({ id: 'm1', subject: '(件名なし)', from: '', received: '', unread: false });
    expect(snap.messages[1]!.from).toBe('');
    expect(snap.events[0]).toEqual({ id: 'e1', subject: '(件名なし)', start: '', location: '' });
  });

  it('builds the outlook/calendar summary items with live counts', () => {
    // items の 'outlook'/'calendar' id・テンプレート文言・件数 (msgs/unread/evs) を固定し、
    // StringLiteral / ObjectLiteral 変異を撃墜。
    const snap = buildMicrosoft365Snapshot(
      { displayName: 'U' },
      [
        { id: 'm1', isRead: false },
        { id: 'm2', isRead: true },
        { id: 'm3', isRead: false },
      ],
      [{ id: 'e1' }, { id: 'e2' }],
    );
    expect(snap.items[0]).toEqual({ id: 'outlook', name: '📧 Outlook: 直近 3 件 / 未読 2 件' });
    expect(snap.items[1]).toEqual({ id: 'calendar', name: '📅 予定: 直近 2 件' });
    expect(snap.count).toBe(2);
  });
});

describe('fetchMicrosoft365Snapshot', () => {
  it('fetches profile, messages, and events from Microsoft Graph with bearer auth', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({ displayName: '山田 太郎' }))
      .mockResolvedValueOnce(
        jsonResponse({ value: [{ id: 'm1', subject: 'Hi', from: { emailAddress: { name: 'A' } }, receivedDateTime: '2026-05-10T09:30:00Z', isRead: false }] }),
      )
      .mockResolvedValueOnce(
        jsonResponse({ value: [{ id: 'e1', subject: '会議', start: { dateTime: '2026-05-12T10:00:00' } }] }),
      );

    const snap = await fetchMicrosoft365Snapshot({ token: 'ms-tok', fetch: fetchMock });

    expect(snap.userName).toBe('山田 太郎');
    expect(snap.messages).toHaveLength(1);
    expect(snap.events).toHaveLength(1);
    // first call hits /me with bearer auth
    expect(fetchMock.mock.calls[0]![0]).toBe('https://graph.microsoft.com/v1.0/me');
    const headers = (fetchMock.mock.calls[0]![1] as RequestInit).headers as Record<string, string>;
    expect(headers.Authorization).toBe('Bearer ms-tok');
    // messages and events endpoints are requested, also authenticated ({ headers } ObjectLiteral)
    expect(fetchMock.mock.calls[1]![0]).toContain('/me/messages');
    expect((fetchMock.mock.calls[1]![1] as RequestInit).headers).toMatchObject({ Authorization: 'Bearer ms-tok' });
    expect(fetchMock.mock.calls[2]![0]).toContain('/me/events');
    expect((fetchMock.mock.calls[2]![1] as RequestInit).headers).toMatchObject({ Authorization: 'Bearer ms-tok' });
  });

  it('tolerates missing value arrays (empty messages/events)', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({ displayName: 'U' }))
      .mockResolvedValueOnce(jsonResponse({}))
      .mockResolvedValueOnce(jsonResponse({}));
    const snap = await fetchMicrosoft365Snapshot({ token: 't', fetch: fetchMock });
    expect(snap.messages).toEqual([]);
    expect(snap.events).toEqual([]);
  });

  it('throws a FetchError tagged with the microsoft-365 serviceId on a non-200 response', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse({ error: 'unauthorized' }, 401));
    const err = await fetchMicrosoft365Snapshot({ token: 'bad', fetch: fetchMock }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(FetchError);
    expect((err as FetchError).serviceId).toBe('microsoft-365'); // serviceId StringLiteral を撃墜
  });
});

describe('ACTIONS["send-mail"]', () => {
  it('POSTs to /me/sendMail with the Graph message envelope and returns ok', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValueOnce(new Response(null, { status: 202 }));

    const result = (await ACTIONS['send-mail']!({
      token: 'ms-tok',
      fetch: fetchMock,
      payload: { to: 'a@b.com', subject: '請求書送付', body: '添付をご確認ください' },
    })) as { ok: true; to: string; subject: string };

    expect(result).toEqual({ ok: true, to: 'a@b.com', subject: '請求書送付' });
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('https://graph.microsoft.com/v1.0/me/sendMail');
    expect((init as RequestInit).method).toBe('POST');
    const headers = (init as RequestInit).headers as Record<string, string>;
    expect(headers.Authorization).toBe('Bearer ms-tok');
    expect(headers['Content-Type']).toBe('application/json');
    expect((init as RequestInit).body).toBe(
      JSON.stringify({
        message: {
          subject: '請求書送付',
          body: { contentType: 'Text', content: '添付をご確認ください' },
          toRecipients: [{ emailAddress: { address: 'a@b.com' } }],
        },
        saveToSentItems: true,
      }),
    );
  });

  it('defaults an empty body when none is provided', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValueOnce(new Response(null, { status: 202 }));
    await ACTIONS['send-mail']!({ token: 't', fetch: fetchMock, payload: { to: 'a@b.com', subject: 'S' } });
    const body = JSON.parse((fetchMock.mock.calls[0]![1] as RequestInit).body as string);
    expect(body.message.body.content).toBe('');
  });

  it('throws a FetchError with the microsoft-365 serviceId on a non-2xx response', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValueOnce(new Response('forbidden', { status: 403 }));
    const err = await ACTIONS['send-mail']!({
      token: 't',
      fetch: fetchMock,
      payload: { to: 'a@b.com', subject: 'S' },
    }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(FetchError);
    expect((err as FetchError).status).toBe(403);
    expect((err as FetchError).serviceId).toBe('microsoft-365');
    expect((err as FetchError).message).toContain('microsoft-365 sendMail failed (403)');
  });

  it('rejects without sending when to is missing', async () => {
    const fetchMock = vi.fn<typeof fetch>();
    await expect(
      ACTIONS['send-mail']!({ token: 't', fetch: fetchMock, payload: { subject: 'S' } }),
    ).rejects.toThrow(/to, subject are required/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects without sending when subject is missing', async () => {
    const fetchMock = vi.fn<typeof fetch>();
    await expect(
      ACTIONS['send-mail']!({ token: 't', fetch: fetchMock, payload: { to: 'a@b.com' } }),
    ).rejects.toThrow(/required/);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('ACTIONS["create-event"]', () => {
  it('POSTs to /me/events with start/end in Tokyo time and returns the created event', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValueOnce(
      jsonResponse({ id: 'evt1', subject: '商談', webLink: 'https://outlook.office.com/evt1' }, 201),
    );

    const result = (await ACTIONS['create-event']!({
      token: 'ms-tok',
      fetch: fetchMock,
      payload: { subject: '商談', start: '2026-07-01T10:00:00', end: '2026-07-01T11:00:00', location: '本社' },
    })) as { id: string; subject: string; webLink: string };

    expect(result).toEqual({ id: 'evt1', subject: '商談', webLink: 'https://outlook.office.com/evt1' });
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('https://graph.microsoft.com/v1.0/me/events');
    expect((init as RequestInit).method).toBe('POST');
    const headers = (init as RequestInit).headers as Record<string, string>;
    expect(headers.Authorization).toBe('Bearer ms-tok');
    expect(headers['Content-Type']).toBe('application/json');
    expect((init as RequestInit).body).toBe(
      JSON.stringify({
        subject: '商談',
        start: { dateTime: '2026-07-01T10:00:00', timeZone: 'Tokyo Standard Time' },
        end: { dateTime: '2026-07-01T11:00:00', timeZone: 'Tokyo Standard Time' },
        location: { displayName: '本社' },
      }),
    );
  });

  it('defaults an empty location and falls back subject/webLink from the response', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValueOnce(jsonResponse({ id: 'evt2' }, 201));
    const result = (await ACTIONS['create-event']!({
      token: 't',
      fetch: fetchMock,
      payload: { subject: '面談', start: '2026-07-02T09:00:00', end: '2026-07-02T09:30:00' },
    })) as { id: string; subject: string; webLink: string };
    // response に subject/webLink が無ければ payload.subject / '' にフォールバック。
    expect(result).toEqual({ id: 'evt2', subject: '面談', webLink: '' });
    const body = JSON.parse((fetchMock.mock.calls[0]![1] as RequestInit).body as string);
    expect(body.location.displayName).toBe('');
  });

  it('throws a FetchError tagged with the microsoft-365 serviceId on a non-2xx response', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValueOnce(jsonResponse({ error: 'forbidden' }, 403));
    const err = await ACTIONS['create-event']!({
      token: 't',
      fetch: fetchMock,
      payload: { subject: 'S', start: '2026-07-01T10:00:00', end: '2026-07-01T11:00:00' },
    }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(FetchError);
    expect((err as FetchError).status).toBe(403);
    expect((err as FetchError).serviceId).toBe('microsoft-365'); // L206 serviceId StringLiteral を撃墜
  });

  it('rejects without sending when end is missing', async () => {
    const fetchMock = vi.fn<typeof fetch>();
    await expect(
      ACTIONS['create-event']!({
        token: 't',
        fetch: fetchMock,
        payload: { subject: 'S', start: '2026-07-01T10:00:00' },
      }),
    ).rejects.toThrow(/subject, start, end are required/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects without sending when subject is missing', async () => {
    const fetchMock = vi.fn<typeof fetch>();
    await expect(
      ACTIONS['create-event']!({
        token: 't',
        fetch: fetchMock,
        payload: { start: '2026-07-01T10:00:00', end: '2026-07-01T11:00:00' },
      }),
    ).rejects.toThrow(/required/);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
