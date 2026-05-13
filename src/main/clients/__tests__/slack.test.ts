import { describe, expect, it, vi } from 'vitest';
import { fetchSlackSnapshot, ACTIONS, buildChannelPermalink } from '../slack';
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
    expect(snap.channels[0]!.permalink).toContain('C1');
  });

  it('throws FetchError when Slack returns ok=false', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({ ok: false, error: 'invalid_auth' }));
    await expect(fetchSlackSnapshot({ token: 'x', fetch: fetchMock })).rejects.toBeInstanceOf(
      FetchError,
    );
  });

  it('sends Authorization: Bearer + form-urlencoded Content-Type on both initial calls (kills `headers = {}` mutation)', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({ ok: true, channels: [] }))
      .mockResolvedValueOnce(jsonResponse({ ok: true, team: { domain: 'acme' } }));
    await fetchSlackSnapshot({ token: 'xoxb-secret-abc', fetch: fetchMock });
    for (const call of fetchMock.mock.calls) {
      const init = call[1] as RequestInit;
      const headers = init?.headers as Record<string, string> | undefined;
      expect(headers).toBeDefined();
      expect(headers!.Authorization).toBe('Bearer xoxb-secret-abc');
      expect(headers!['Content-Type']).toBe('application/x-www-form-urlencoded');
    }
  });

  it('hits exactly the two Slack API URLs (kills URL StringLiteral mutants)', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({ ok: true, channels: [] }))
      .mockResolvedValueOnce(jsonResponse({ ok: true, team: { domain: 'acme' } }));
    await fetchSlackSnapshot({ token: 'xoxb-x', fetch: fetchMock });
    const urls = fetchMock.mock.calls.map((c) => c[0]);
    expect(urls).toEqual([
      'https://slack.com/api/conversations.list?types=public_channel,private_channel&exclude_archived=false&limit=20',
      'https://slack.com/api/team.info',
    ]);
  });

  it('reports `slack <error>` in the FetchError serviceId (kills `slack` → `` StringLiteral)', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({ ok: false, error: 'invalid_auth' }));
    let caught: FetchError | undefined;
    try {
      await fetchSlackSnapshot({ token: 'x', fetch: fetchMock });
    } catch (err) {
      caught = err as FetchError;
    }
    expect(caught).toBeDefined();
    expect(caught!.serviceId).toBe('slack');
    expect(caught!.message).toBe('slack invalid_auth');
  });
});

describe('slack action URL + content-type kill tests', () => {
  it('chat.postMessage hits exactly the expected URL with application/json (kills L95 + L107 StringLiteral)', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValueOnce(
      jsonResponse({ ok: true, ts: '1.0', channel: 'C1' }),
    );
    await ACTIONS['send-message']!({
      token: 'xoxb-x',
      fetch: fetchMock,
      payload: { channel: 'C1', text: 'hi' },
    });
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('https://slack.com/api/chat.postMessage');
    const headers = (init as RequestInit).headers as Record<string, string>;
    expect(headers['Content-Type']).toBe('application/json; charset=utf-8');
  });

  it('sendMessage reports `slack <error>` (kills L111 `slack` StringLiteral)', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({ ok: false, error: 'channel_not_found' }));
    let caught: FetchError | undefined;
    try {
      await ACTIONS['send-message']!({
        token: 'xoxb-x',
        fetch: fetchMock,
        payload: { channel: 'C1', text: 'hi' },
      });
    } catch (err) {
      caught = err as FetchError;
    }
    expect(caught).toBeDefined();
    expect(caught!.message).toBe('slack channel_not_found');
    expect(caught!.serviceId).toBe('slack');
  });
});

describe('ACTIONS["send-message"]', () => {
  it('POSTs to chat.postMessage with the channel and text', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValueOnce(
      jsonResponse({ ok: true, ts: '1700000000.000100', channel: 'C123' }),
    );

    const result = (await ACTIONS['send-message']!({
      token: 'xoxb-x',
      fetch: fetchMock,
      payload: { channel: 'C123', text: 'hello' },
    })) as { ts: string; channel: string };

    expect(result).toEqual({ ts: '1700000000.000100', channel: 'C123' });
    const [url, init] = fetchMock.mock.calls[0]!;
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
      ACTIONS['send-message']!({ token: 't', fetch: fetchMock, payload: { channel: 'C' } }),
    ).rejects.toThrow();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('throws FetchError when slack returns ok=false', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValueOnce(
      jsonResponse({ ok: false, error: 'channel_not_found' }),
    );
    await expect(
      ACTIONS['send-message']!({
        token: 't',
        fetch: fetchMock,
        payload: { channel: 'bad', text: 'hi' },
      }),
    ).rejects.toBeInstanceOf(FetchError);
  });
});

describe('buildChannelPermalink', () => {
  it('produces the proper workspace-scoped URL when a domain is known', () => {
    expect(buildChannelPermalink('C123', 'acme')).toBe('https://acme.slack.com/archives/C123');
  });

  it('falls back to app_redirect when the workspace domain is unknown', () => {
    expect(buildChannelPermalink('C123', undefined)).toBe(
      'https://slack.com/app_redirect?channel=C123',
    );
  });
});

describe('fetchSlackSnapshot edge cases', () => {
  it('falls back to "unknown_error" when conversations.list returns ok=false without an error string', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({ ok: false /* no error field */ }))
      .mockResolvedValueOnce(jsonResponse({ ok: true, team: { id: 'T', name: 'X', domain: 'x' } }));

    const err = await fetchSlackSnapshot({ token: 'x', fetch: fetchMock }).catch((e) => e);
    expect(err).toBeInstanceOf(FetchError);
    expect((err as FetchError).message).toContain('unknown_error');
  });

  it('uses empty string when both purpose and topic are missing', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        jsonResponse({
          ok: true,
          channels: [{ id: 'C9', name: 'bare', is_archived: false /* no purpose, no topic */ }],
        }),
      )
      .mockResolvedValueOnce(jsonResponse({ ok: true, team: { id: 'T', name: 'X', domain: 'acme' } }));

    const snap = await fetchSlackSnapshot({ token: 'x', fetch: fetchMock });
    expect(snap.channels[0]!.purpose).toBe('');
  });

  it('degrades to app_redirect when team.info returns ok=true but no team object', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        jsonResponse({ ok: true, channels: [{ id: 'C5', name: 'g', is_archived: false }] }),
      )
      .mockResolvedValueOnce(jsonResponse({ ok: true /* no team */ }));

    const snap = await fetchSlackSnapshot({ token: 'x', fetch: fetchMock });
    expect(snap.channels[0]!.permalink).toBe('https://slack.com/app_redirect?channel=C5');
  });
});

describe('ACTIONS["send-message"] return-shape (mutation kill)', () => {
  it('echoes the request channel when the response does not include one', async () => {
    // Kills `res.channel ?? channel` mutation: with the mutation the
    // result.channel becomes the response value (undefined) and we'd
    // see empty string.
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({ ok: true, ts: '123' /* no channel */ }));
    const result = (await ACTIONS['send-message']!({
      token: 'x',
      fetch: fetchMock,
      payload: { channel: 'C42', text: 'hi' },
    })) as { ts: string; channel: string };
    expect(result.channel).toBe('C42');
  });
});

describe('ACTIONS["send-message"] edge cases', () => {
  it('falls back to "unknown_error" when chat.postMessage returns ok=false without an error', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({ ok: false }));
    const err = await ACTIONS['send-message']!({
      token: 'x',
      fetch: fetchMock,
      payload: { channel: 'C', text: 'hi' },
    }).catch((e) => e);
    expect(err).toBeInstanceOf(FetchError);
    expect((err as FetchError).message).toContain('unknown_error');
  });
});

describe('fetchSlackSnapshot permalink behavior', () => {
  it('uses the workspace domain from team.info when available', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      // Promise.all order matches the order in the source: conversations.list first.
      .mockResolvedValueOnce(
        jsonResponse({
          ok: true,
          channels: [{ id: 'C1', name: 'general', is_archived: false }],
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({ ok: true, team: { id: 'T1', name: 'Acme', domain: 'acme' } }),
      );

    const snap = await fetchSlackSnapshot({ token: 'x', fetch: fetchMock });
    expect(snap.channels[0]!.permalink).toBe('https://acme.slack.com/archives/C1');
  });

  it('falls back to app_redirect when team.info fails', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        jsonResponse({
          ok: true,
          channels: [{ id: 'C2', name: 'general', is_archived: false }],
        }),
      )
      // team.info raises (missing_scope etc.) — we should keep going
      // with the generic permalink.
      .mockResolvedValueOnce(new Response('no scope', { status: 403 }));

    const snap = await fetchSlackSnapshot({ token: 'x', fetch: fetchMock });
    expect(snap.channels[0]!.permalink).toBe('https://slack.com/app_redirect?channel=C2');
  });
});
