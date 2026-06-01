import { describe, expect, it, vi } from 'vitest';
import {
  fetchMicrosoft365Snapshot,
  buildMicrosoft365Snapshot,
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
    // messages and events endpoints are requested
    expect(fetchMock.mock.calls[1]![0]).toContain('/me/messages');
    expect(fetchMock.mock.calls[2]![0]).toContain('/me/events');
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

  it('throws a FetchError on a non-200 response', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse({ error: 'unauthorized' }, 401));
    await expect(fetchMicrosoft365Snapshot({ token: 'bad', fetch: fetchMock })).rejects.toBeInstanceOf(FetchError);
  });
});
