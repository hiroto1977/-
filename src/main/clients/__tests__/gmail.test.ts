import { describe, expect, it, vi } from 'vitest';
import { fetchGmailSnapshot, ACTIONS, buildRfc2822, isSafeHeaderValue } from '../gmail';

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

describe('fetchGmailSnapshot', () => {
  it('lists messages then fetches headers for each', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        jsonResponse({ messages: [{ id: 'm1', threadId: 't1' }, { id: 'm2', threadId: 't2' }] }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          id: 'm1',
          threadId: 't1',
          internalDate: '1746931200000',
          payload: {
            headers: [
              { name: 'From', value: 'alice@example.com' },
              { name: 'Subject', value: 'Hello' },
            ],
          },
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          id: 'm2',
          threadId: 't2',
          internalDate: '1746931200000',
          payload: { headers: [{ name: 'from', value: 'bob@example.com' }] },
        }),
      );

    const snap = await fetchGmailSnapshot({ token: 't', fetch: fetchMock });

    expect(snap.threads).toHaveLength(2);
    expect(snap.threads[0]).toMatchObject({ id: 't1', sender: 'alice@example.com', subject: 'Hello' });
    expect(snap.threads[1]).toMatchObject({ id: 't2', sender: 'bob@example.com', subject: '(件名なし)' });
  });

  it('returns empty threads when inbox is empty', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValueOnce(jsonResponse({}));
    const snap = await fetchGmailSnapshot({ token: 't', fetch: fetchMock });
    expect(snap.threads).toEqual([]);
  });

  it('passes the Authorization header on every request (kills `headers = {}` mutations)', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({ messages: [{ id: 'm1', threadId: 't1' }] }))
      .mockResolvedValueOnce(
        jsonResponse({ id: 'm1', threadId: 't1', internalDate: '0', payload: { headers: [] } }),
      );
    await fetchGmailSnapshot({ token: 'ya29.abc', fetch: fetchMock });
    // Both calls must carry Authorization: Bearer ya29.abc.
    for (const call of fetchMock.mock.calls) {
      const init = call[1] as RequestInit;
      const headers = init?.headers as Record<string, string> | undefined;
      expect(headers).toBeDefined();
      expect(headers!.Authorization).toBe('Bearer ya29.abc');
    }
  });

  it('uses each message id in the per-message fetch URL (kills `.map((m) => m.id)` → `.map(() => undefined)`)', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        jsonResponse({ messages: [{ id: 'aaa111', threadId: 't1' }, { id: 'bbb222', threadId: 't2' }] }),
      )
      .mockResolvedValueOnce(
        jsonResponse({ id: 'aaa111', threadId: 't1', internalDate: '0', payload: { headers: [] } }),
      )
      .mockResolvedValueOnce(
        jsonResponse({ id: 'bbb222', threadId: 't2', internalDate: '0', payload: { headers: [] } }),
      );
    await fetchGmailSnapshot({ token: 't', fetch: fetchMock });
    const perMessageUrls = fetchMock.mock.calls.slice(1).map((c) => c[0] as string);
    expect(perMessageUrls[0]).toContain('/messages/aaa111?');
    expect(perMessageUrls[1]).toContain('/messages/bbb222?');
    // Negative: no `undefined` in any URL.
    for (const u of perMessageUrls) {
      expect(u).not.toContain('undefined');
    }
  });
});

describe('buildRfc2822', () => {
  it('wraps a UTF-8 subject with RFC 2047 encoding and sets proper headers', () => {
    const msg = buildRfc2822('a@b.com', '日本語件名', 'hello');
    expect(msg).toMatch(/^To: a@b\.com\r\n/);
    expect(msg).toMatch(/Subject: =\?UTF-8\?B\?[A-Za-z0-9+/=]+\?=\r\n/);
    expect(msg).toContain('Content-Type: text/plain; charset="UTF-8"');
    expect(msg).toMatch(/\r\n\r\nhello$/);
  });

  it('rejects a To: containing CR (RFC 2822 header injection)', () => {
    expect(() =>
      buildRfc2822('victim@example.com\r\nBcc: attacker@evil.com', 'hi', 'body'),
    ).toThrow(/CR\/LF\/NUL/);
  });

  it('rejects a To: containing LF', () => {
    expect(() => buildRfc2822('victim@example.com\nBcc: x@y', 'hi', 'body')).toThrow(
      /CR\/LF\/NUL/,
    );
  });

  it('rejects a To: containing NUL', () => {
    expect(() => buildRfc2822('victim@example.com\0', 'hi', 'body')).toThrow(/CR\/LF\/NUL/);
  });
});

describe('isSafeHeaderValue', () => {
  it('accepts ordinary email addresses and display names', () => {
    expect(isSafeHeaderValue('a@b.com')).toBe(true);
    expect(isSafeHeaderValue('"Display Name" <a@b.com>')).toBe(true);
    expect(isSafeHeaderValue('a@b.com, c@d.com')).toBe(true);
  });

  it('rejects CR, LF, NUL anywhere in the value', () => {
    expect(isSafeHeaderValue('a@b.com\r')).toBe(false);
    expect(isSafeHeaderValue('a@b.com\n')).toBe(false);
    expect(isSafeHeaderValue('a@b.com\r\n')).toBe(false);
    expect(isSafeHeaderValue('a@b.com\0')).toBe(false);
    expect(isSafeHeaderValue('\nBcc: x')).toBe(false);
  });

  it('rejects non-string types', () => {
    expect(isSafeHeaderValue(undefined)).toBe(false);
    expect(isSafeHeaderValue(null)).toBe(false);
    expect(isSafeHeaderValue(42)).toBe(false);
    expect(isSafeHeaderValue({})).toBe(false);
  });
});

describe('ACTIONS["create-draft"] — header injection defense', () => {
  it('refuses to send when `to` contains CRLF (no network call)', async () => {
    const fetchMock = vi.fn<typeof fetch>();
    await expect(
      ACTIONS['create-draft']!({
        token: 't',
        fetch: fetchMock,
        payload: { to: 'a@b.com\r\nBcc: attacker@evil.com', subject: 'hi', body: 'hello' },
      }),
    ).rejects.toThrow(/CR\/LF\/NUL/);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('ACTIONS["create-draft"] mutation-killing tests', () => {
  it('rejects with a "subject" error when only subject is missing (not just any error)', async () => {
    const fetchMock = vi.fn<typeof fetch>();
    // Note the SPECIFIC message match. Without this, a `!to && !subject`
    // mutation slips through because the call would still throw — just
    // from buffer-encoding undefined later.
    await expect(
      ACTIONS['create-draft']!({
        token: 't',
        fetch: fetchMock,
        payload: { to: 'x@y.com' /* no subject */ },
      }),
    ).rejects.toThrow(/to and subject are required/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects symmetrically when only "to" is missing', async () => {
    const fetchMock = vi.fn<typeof fetch>();
    await expect(
      ACTIONS['create-draft']!({
        token: 't',
        fetch: fetchMock,
        payload: { subject: 'hi' /* no to */ },
      }),
    ).rejects.toThrow(/to and subject are required/);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('fetchGmailSnapshot mutation-killing tests', () => {
  it('returns empty sender/subject when a message has no payload at all', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({ messages: [{ id: 'm', threadId: 't' }] }))
      .mockResolvedValueOnce(
        jsonResponse({ id: 'm', threadId: 't', internalDate: '0' /* no payload */ }),
      );
    const snap = await fetchGmailSnapshot({ token: 't', fetch: fetchMock });
    expect(snap.threads[0]!.sender).toBe('');
    expect(snap.threads[0]!.subject).toBe('(件名なし)');
  });

  it('formats internalDate as YYYY-MM-DD (not a raw number or full ISO string)', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({ messages: [{ id: 'm', threadId: 't' }] }))
      .mockResolvedValueOnce(
        jsonResponse({
          id: 'm',
          threadId: 't',
          internalDate: '1746931200000', // 2025-05-11 UTC
          payload: { headers: [] },
        }),
      );
    const snap = await fetchGmailSnapshot({ token: 't', fetch: fetchMock });
    // Asserts the .slice(0, 10) actually happened — kills a mutation that
    // drops .toISOString() or returns the raw number.
    expect(snap.threads[0]!.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(snap.threads[0]!.date.length).toBe(10);
  });
});

describe('ACTIONS["create-draft"]', () => {
  it('POSTs to /drafts with base64url-encoded raw message', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValueOnce(
      jsonResponse({ id: 'd1', message: { id: 'm1', threadId: 't1' } }),
    );

    const result = (await ACTIONS['create-draft']!({
      token: 'ya29.x',
      fetch: fetchMock,
      payload: { to: 'a@b.com', subject: 'Hello', body: 'hi' },
    })) as { id: string; messageId: string };

    expect(result).toEqual({ id: 'd1', messageId: 'm1' });

    const init = fetchMock.mock.calls[0]![1] as RequestInit;
    // Authorization + Content-Type both present — kills the
    // `headers: {}` ObjectLiteral mutation on line 116.
    const headers = init.headers as Record<string, string>;
    expect(headers.Authorization).toBe('Bearer ya29.x');
    expect(headers['Content-Type']).toBe('application/json');

    const body = JSON.parse(init.body as string);
    // base64url uses '-' and '_', and strips trailing '='.
    expect(body.message.raw).toMatch(/^[A-Za-z0-9_-]+$/);

    // Decoding base64url should give us back the RFC 2822 message.
    const padded = body.message.raw + '='.repeat((4 - (body.message.raw.length % 4)) % 4);
    const decoded = Buffer.from(padded.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
    expect(decoded).toContain('To: a@b.com');
    expect(decoded).toContain('hi');
  });

  it('rejects when to/subject are missing', async () => {
    const fetchMock = vi.fn<typeof fetch>();
    await expect(
      ACTIONS['create-draft']!({ token: 't', fetch: fetchMock, payload: { to: 'x@y.com' } }),
    ).rejects.toThrow();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
