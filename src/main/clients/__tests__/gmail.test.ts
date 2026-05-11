import { describe, expect, it, vi } from 'vitest';
import { fetchGmailSnapshot } from '../gmail';

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
