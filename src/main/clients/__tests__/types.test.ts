import { describe, expect, it, vi } from 'vitest';
import { jsonFetch, FetchError, redactSecrets } from '../types';

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

  it('redacts a token echoed back inside the error body', async () => {
    const body = 'invalid auth: Bearer sk-ant-api03-AAAABBBBCCCCDDDD1234';
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(body, { status: 401 }));
    const err = await jsonFetch<unknown>(
      'https://x',
      {},
      { fetch: fetchMock, serviceId: 'demo' },
    ).catch((e) => e);
    expect((err as FetchError).message).not.toContain('AAAABBBB');
    expect((err as FetchError).message).toMatch(/sk-ant-\[REDACTED\]/);
  });
});

describe('redactSecrets', () => {
  it('redacts Authorization: Bearer headers', () => {
    expect(redactSecrets('Authorization: Bearer sk-ant-xxxxxxxxxxxx')).toMatch(
      /Authorization: Bearer \[REDACTED\]/,
    );
  });

  it('redacts Authorization: Basic headers', () => {
    expect(redactSecrets('Authorization: Basic dXNlcjpwYXNz')).toMatch(
      /Authorization: Basic \[REDACTED\]/,
    );
  });

  it('redacts GitHub PAT prefixes', () => {
    expect(redactSecrets('token=ghp_abcdefghijklmnopqrst')).toContain('ghp_[REDACTED]');
    expect(redactSecrets('token=ghs_abcdefghijklmnopqrst')).toContain('ghs_[REDACTED]');
  });

  it('redacts Anthropic and Notion secrets', () => {
    expect(redactSecrets('key=sk-ant-api03-xxxxxxxxxx')).toContain('sk-ant-[REDACTED]');
    expect(redactSecrets('integration=secret_abcdefghij')).toContain('secret_[REDACTED]');
  });

  it('redacts Slack tokens', () => {
    expect(redactSecrets('xoxp-12345-67890')).toContain('xoxp-[REDACTED]');
    expect(redactSecrets('xoxb-12345-67890')).toContain('xoxb-[REDACTED]');
  });

  it('redacts Google access tokens', () => {
    expect(redactSecrets('access=ya29.A0AfH6SMBxxx_yyyy')).toContain('ya29.[REDACTED]');
  });

  it('redacts JSON-shaped token fields', () => {
    const input = '{"access_token":"abc123","other":"safe"}';
    const out = redactSecrets(input);
    expect(out).toContain('"access_token":"[REDACTED]"');
    expect(out).toContain('"other":"safe"');
  });

  it('leaves non-secret content alone', () => {
    expect(redactSecrets('normal message with no secrets')).toBe('normal message with no secrets');
  });
});
