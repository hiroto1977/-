import { describe, expect, it, vi } from 'vitest';
import { fetchGmailSnapshot, ACTIONS, buildRfc2822 } from '../gmail';

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
});

describe('buildRfc2822', () => {
  it('wraps a UTF-8 subject with RFC 2047 encoding and sets proper headers', () => {
    const msg = buildRfc2822('a@b.com', '日本語件名', 'hello');
    expect(msg).toMatch(/^To: a@b\.com\r\n/);
    expect(msg).toMatch(/Subject: =\?UTF-8\?B\?[A-Za-z0-9+/=]+\?=\r\n/);
    expect(msg).toContain('Content-Type: text/plain; charset="UTF-8"');
    expect(msg).toMatch(/\r\n\r\nhello$/);
  });
});

describe('ACTIONS["create-draft"]', () => {
  it('POSTs to /drafts with base64url-encoded raw message', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValueOnce(
      jsonResponse({ id: 'd1', message: { id: 'm1', threadId: 't1' } }),
    );

    const result = (await ACTIONS['create-draft']({
      token: 'ya29.x',
      fetch: fetchMock,
      payload: { to: 'a@b.com', subject: 'Hello', body: 'hi' },
    })) as { id: string; messageId: string };

    expect(result).toEqual({ id: 'd1', messageId: 'm1' });

    const init = fetchMock.mock.calls[0][1] as RequestInit;
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
      ACTIONS['create-draft']({ token: 't', fetch: fetchMock, payload: { to: 'x@y.com' } }),
    ).rejects.toThrow();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
