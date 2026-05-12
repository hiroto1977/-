import { describe, expect, it, vi } from 'vitest';
import { fetchSlackSnapshot, ACTIONS } from '../slack';
import { FetchError } from '../types';

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

describe('fetchSlackSnapshot', () => {
  it('normalizes channels and prefers purpose over topic', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValueOnce(
      jsonResponse({
        ok: true,
        channels: [
          { id: 'C1', name: 'general', is_archived: false, purpose: { value: 'all hands' } },
          { id: 'C2', name: 'random', is_archived: true, purpose: { value: '' }, topic: { value: 'fallback' } },
        ],
      }),
    );

    const snap = await fetchSlackSnapshot({ token: 'xoxp-x', fetch: fetchMock });

    expect(snap.channels[0]).toMatchObject({ id: 'C1', purpose: 'all hands', isArchived: false });
    expect(snap.channels[1]).toMatchObject({ id: 'C2', purpose: 'fallback', isArchived: true });
    expect(snap.channels[0].permalink).toContain('C1');
  });

  it('throws FetchError when Slack returns ok=false', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({ ok: false, error: 'invalid_auth' }));
    await expect(fetchSlackSnapshot({ token: 'x', fetch: fetchMock })).rejects.toBeInstanceOf(
      FetchError,
    );
  });
});

describe('ACTIONS["send-message"]', () => {
  it('POSTs to chat.postMessage with the channel and text', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValueOnce(
      jsonResponse({ ok: true, ts: '1700000000.000100', channel: 'C123' }),
    );

    const result = (await ACTIONS['send-message']({
      token: 'xoxb-x',
      fetch: fetchMock,
      payload: { channel: 'C123', text: 'hello' },
    })) as { ts: string; channel: string };

    expect(result).toEqual({ ts: '1700000000.000100', channel: 'C123' });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://slack.com/api/chat.postMessage');
    expect((init as RequestInit).method).toBe('POST');
    const headers = (init as RequestInit).headers as Record<string, string>;
    expect(headers.Authorization).toBe('Bearer xoxb-x');
    expect(headers['Content-Type']).toContain('application/json');
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({
      channel: 'C123',
      text: 'hello',
    });
  });

  it('rejects with missing channel/text before any network call', async () => {
    const fetchMock = vi.fn<typeof fetch>();
    await expect(
      ACTIONS['send-message']({ token: 't', fetch: fetchMock, payload: { channel: 'C' } }),
    ).rejects.toThrow();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('throws FetchError when slack returns ok=false', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValueOnce(
      jsonResponse({ ok: false, error: 'channel_not_found' }),
    );
    await expect(
      ACTIONS['send-message']({
        token: 't',
        fetch: fetchMock,
        payload: { channel: 'bad', text: 'hi' },
      }),
    ).rejects.toBeInstanceOf(FetchError);
  });
});
