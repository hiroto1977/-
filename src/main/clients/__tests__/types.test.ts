import { describe, expect, it, vi } from 'vitest';
import { jsonFetch, FetchError } from '../types';

describe('jsonFetch', () => {
  it('returns parsed body when the response is 2xx', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValueOnce(
      new Response(JSON.stringify({ ok: true, value: 1 }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
    const body = await jsonFetch<{ value: number }>(
      'https://example.com',
      {},
      { fetch: fetchMock, serviceId: 'demo' },
    );
    expect(body.value).toBe(1);
  });

  it('throws FetchError carrying status and serviceId on non-2xx', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValueOnce(
      new Response('forbidden', { status: 403 }),
    );
    const err = await jsonFetch<unknown>(
      'https://example.com',
      {},
      { fetch: fetchMock, serviceId: 'demo' },
    ).catch((e) => e);

    expect(err).toBeInstanceOf(FetchError);
    expect((err as FetchError).status).toBe(403);
    expect((err as FetchError).serviceId).toBe('demo');
    expect((err as FetchError).message).toContain('demo');
    expect((err as FetchError).message).toContain('403');
  });

  it('truncates very long error bodies to keep messages readable', async () => {
    const body = 'x'.repeat(1000);
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValueOnce(
      new Response(body, { status: 500 }),
    );
    const err = await jsonFetch<unknown>(
      'https://example.com',
      {},
      { fetch: fetchMock, serviceId: 'demo' },
    ).catch((e) => e);

    expect((err as FetchError).message.length).toBeLessThan(300);
  });
});
