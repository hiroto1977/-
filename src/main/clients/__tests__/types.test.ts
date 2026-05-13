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

  // ---------------------------------------------------------------------
  // Mutation-killing tests: precise regex behaviour
  // ---------------------------------------------------------------------

  it('fully redacts the Bearer token — not just the first character (kills `\\S+` → `\\S`)', () => {
    // With \S+ mutated to \S, only the first non-space char would be
    // captured and replaced, leaving the rest of the token in the
    // output. Assert the trailing chars are GONE.
    const out = redactSecrets('Authorization: Bearer abc123def456ghi');
    expect(out).toContain('Authorization: Bearer [REDACTED]');
    expect(out).not.toContain('abc123def456ghi');
    expect(out).not.toContain('bc123def456ghi'); // would be tail of \S → \S mutation
  });

  it('fully redacts the Basic credential — not just the first character', () => {
    const out = redactSecrets('Authorization: Basic dXNlcjpwYXNzd29yZGFiYw==');
    expect(out).toContain('Authorization: Basic [REDACTED]');
    expect(out).not.toContain('dXNlcjpwYXNzd29yZGFiYw');
  });

  it('redacts a Bearer token with multiple spaces after the colon (kills `\\s+` → `\\s`)', () => {
    // Original `\s+` requires 1+ whitespace; mutated to `\s` requires
    // exactly 1. Both pass single-space input. Test with no space and
    // with double space.
    const noSpace = redactSecrets('Authorization: Bearer  doublespace');
    expect(noSpace).toContain('Authorization: Bearer [REDACTED]');
    expect(noSpace).not.toContain('doublespace');
  });

  it('fully redacts a ya29. token — not just the first character (kills `[A-Za-z0-9_-]{10,}` → `[A-Za-z0-9_-]`)', () => {
    const out = redactSecrets('access=ya29.A0AfH6SMBxxx_yyyy_zzzzzzz');
    expect(out).toContain('ya29.[REDACTED]');
    expect(out).not.toContain('A0AfH6SMBxxx');
  });

  it('redacts Authorization with NO space after colon (kills `\\s*` → `\\s` on Bearer)', () => {
    // Original `\s*` matches 0+ spaces; mutated `\s` requires exactly 1.
    // The "no space" variant only redacts under the original.
    const out = redactSecrets('Authorization:Bearer abcdef-token-secret-123');
    expect(out).toContain('[REDACTED]');
    expect(out).not.toContain('abcdef-token-secret-123');
  });

  it('redacts Authorization with NO space after colon for Basic too', () => {
    const out = redactSecrets('Authorization:Basic dXNlcjpwYXNzd29yZA==');
    expect(out).toContain('[REDACTED]');
    expect(out).not.toContain('dXNlcjpwYXNzd29yZA');
  });

  it('redacts Basic auth with multiple spaces (kills `\\s+` → `\\s` on Basic)', () => {
    const out = redactSecrets('Authorization: Basic   dXNlcjpwYXNzd29yZA==');
    expect(out).toContain('[REDACTED]');
    expect(out).not.toContain('dXNlcjpwYXNzd29yZA');
  });

  it('fully redacts a Basic credential — not just first char (kills `\\S+` → `\\S` on Basic)', () => {
    const out = redactSecrets('Authorization: Basic abcdefghijklmnop==');
    expect(out).toContain('Authorization: Basic [REDACTED]');
    expect(out).not.toContain('abcdefghijklmnop');
    expect(out).not.toContain('bcdefghijklmnop'); // tail-after-first-char
  });

  it('returns an empty string from FetchError body fallback (kills the catch arrow `() => undefined`)', async () => {
    // jsonFetch's `await res.text().catch(() => '')` falls back to ''
    // (not undefined) when text() rejects. If mutated to () => undefined,
    // `undefined.slice(0, 200)` throws and the FetchError never gets
    // built. Forge a Response whose text() rejects by passing a body
    // stream that errors on read.
    const erroringBody = new ReadableStream({
      start(controller) {
        controller.error(new Error('body read failed'));
      },
    });
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValueOnce(
      new Response(erroringBody, { status: 500 }),
    );
    let caught: Error | undefined;
    try {
      await jsonFetch('https://example.invalid/x', {}, { fetch: fetchMock, serviceId: 'test' });
    } catch (err) {
      caught = err as Error;
    }
    expect(caught).toBeInstanceOf(FetchError);
    // With () => '' fallback: message ends with "test 500: " (empty body).
    // With () => undefined mutant: body.slice(0,200) would throw,
    // bubbling up a TypeError, NOT a FetchError. Asserting the type
    // pins both behaviours apart.
    expect(caught!.message).toBe('test 500: ');
  });
});
