import { describe, expect, it, vi } from 'vitest';
import { fetchSlackSnapshot } from '../slack';
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
