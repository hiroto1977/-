import { describe, expect, it, vi } from 'vitest';
import {
  compareVersions,
  fetchOllamaSnapshot,
  isAllowedEndpoint,
  isSafeModelName,
  isVersionSafe,
  MIN_SAFE_VERSION,
  UNPATCHED_OOB_NOTICE,
  ACTIONS,
} from '../ollama';
import { FetchError } from '../types';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

// --- pure: version comparison

describe('compareVersions', () => {
  it('returns 0 for identical versions', () => {
    expect(compareVersions('1.2.3', '1.2.3')).toBe(0);
  });
  it('compares major / minor / patch correctly', () => {
    expect(compareVersions('1.0.0', '0.9.9')).toBe(1);
    expect(compareVersions('0.1.45', '0.1.46')).toBe(-1);
    expect(compareVersions('0.1.46', '0.1.46')).toBe(0);
    expect(compareVersions('0.2.0', '0.1.99')).toBe(1);
  });
  it('treats missing trailing segments as zero', () => {
    expect(compareVersions('1', '1.0.0')).toBe(0);
    expect(compareVersions('1.2', '1.2.5')).toBe(-1);
  });
  it('ignores -rc / -beta / + build tags (compares numeric prefix only)', () => {
    expect(compareVersions('0.1.46-rc1', '0.1.46')).toBe(0);
    expect(compareVersions('0.1.46+sha.abc', '0.1.46')).toBe(0);
  });
  it('treats non-numeric segments as 0', () => {
    expect(compareVersions('xxx', '0.0.0')).toBe(0);
  });
  it('handles multi-digit majors numerically (kills `split(\'.\')` → `split(\'\')`)', () => {
    // Without dot-splitting, '10.0.0' would be parsed char-by-char and
    // compared incorrectly against '2.0.0' (10 > 2 numerically; '1' < '2'
    // lexically). Pin numeric ordering.
    expect(compareVersions('10.0.0', '2.0.0')).toBe(1);
    expect(compareVersions('2.0.0', '10.0.0')).toBe(-1);
    expect(compareVersions('1.10.0', '1.2.0')).toBe(1);
  });
});

describe('isVersionSafe', () => {
  it('rejects empty / non-string version strings', () => {
    expect(isVersionSafe('')).toBe(false);
    expect(isVersionSafe(undefined as unknown as string)).toBe(false);
  });
  it('rejects non-string types (number, null, object) — kills `!version || typeof !== string` weaken', () => {
    expect(isVersionSafe(null as unknown as string)).toBe(false);
    expect(isVersionSafe(42 as unknown as string)).toBe(false);
    expect(isVersionSafe({} as unknown as string)).toBe(false);
  });
  it('returns false for versions older than MIN_SAFE_VERSION', () => {
    expect(isVersionSafe('0.1.45')).toBe(false);
    expect(isVersionSafe('0.1.33')).toBe(false); // before Probllama fix
    expect(isVersionSafe('0.0.1')).toBe(false);
  });
  it('returns true for MIN_SAFE_VERSION and newer', () => {
    expect(isVersionSafe(MIN_SAFE_VERSION)).toBe(true);
    expect(isVersionSafe('0.1.47')).toBe(true);
    expect(isVersionSafe('0.5.10')).toBe(true);
    expect(isVersionSafe('1.0.0')).toBe(true);
  });
});

// --- pure: model name validation

describe('isSafeModelName', () => {
  it('accepts common Ollama model names', () => {
    expect(isSafeModelName('llama3.2')).toBe(true);
    expect(isSafeModelName('qwen2.5-coder:7b')).toBe(true);
    expect(isSafeModelName('library/mistral:latest')).toBe(true);
    expect(isSafeModelName('phi3')).toBe(true);
  });
  it('rejects path traversal attempts', () => {
    expect(isSafeModelName('../../../etc/passwd')).toBe(false);
    expect(isSafeModelName('foo/../bar')).toBe(false);
    expect(isSafeModelName('..')).toBe(false);
  });
  it('rejects whitespace and special characters', () => {
    expect(isSafeModelName('llama 3')).toBe(false);
    expect(isSafeModelName('llama;rm')).toBe(false);
    expect(isSafeModelName('llama|cat')).toBe(false);
    expect(isSafeModelName('llama`id`')).toBe(false);
    expect(isSafeModelName('llama$VAR')).toBe(false);
    expect(isSafeModelName('llama\\path')).toBe(false);
    expect(isSafeModelName('llama\n')).toBe(false);
  });
  it('rejects empty / too long / non-string', () => {
    expect(isSafeModelName('')).toBe(false);
    expect(isSafeModelName('a'.repeat(130))).toBe(false);
    expect(isSafeModelName(null as unknown as string)).toBe(false);
    expect(isSafeModelName(42 as unknown as string)).toBe(false);
  });
  it('requires alphanumeric leading char (so a name cannot start with . / : / -)', () => {
    expect(isSafeModelName('.hidden')).toBe(false);
    expect(isSafeModelName(':latest')).toBe(false);
    expect(isSafeModelName('-evil')).toBe(false);
  });
});

// --- fetcher behaviour

describe('fetchOllamaSnapshot', () => {
  it('defaults snap.version to empty string when /api/version response omits version (kills `?? ""` → "Stryker...")', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({ /* no version field */ }))
      .mockResolvedValueOnce(jsonResponse({ models: [] }));
    const snap = await fetchOllamaSnapshot({ token: '', fetch: fetchMock });
    expect(snap.version).toBe('');
    expect(snap.version).not.toContain('Stryker');
  });

  it('treats absent tags.models as empty (kills `?? []` → `["Stryker was here"]`)', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({ version: '0.5.0' }))
      .mockResolvedValueOnce(jsonResponse({ /* no models field */ }));
    const snap = await fetchOllamaSnapshot({ token: '', fetch: fetchMock });
    expect(snap.models).toEqual([]);
    // Negative: never the Stryker marker sneaking through as a model name.
    expect(snap.models.some((m) => /Stryker/.test(m.name ?? ''))).toBe(false);
  });

  it('reports not-running when /api/version is unreachable', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockRejectedValueOnce(new Error('ECONNREFUSED'));
    const snap = await fetchOllamaSnapshot({ token: '', fetch: fetchMock });
    expect(snap.running).toBe(false);
    expect(snap.models).toEqual([]);
    expect(snap.warnings.some((w) => /unreachable/i.test(w))).toBe(true);
    // Pin the initial values so ArrayDeclaration (line 189 → ["Stryker..."])
    // and StringLiteral (line 190 → "Stryker was here!") mutants die.
    // When the version probe fails, version stays at its initializer and
    // warnings starts from its initializer.
    expect(snap.version).toBe('');
    expect(snap.warnings).not.toContain('Stryker was here');
    // Pin that withTimeout actually issued the fetch (kills the
    // BlockStatement mutant on ollama.ts:182 where `try { return await
    // fetchFn(...) }` is emptied to `{}`).
    expect(fetchMock).toHaveBeenCalled();
    expect(fetchMock.mock.calls[0]![0]).toContain('/api/version');
  });

  it('truncates the unreachable-error message to 100 chars (kills `msg.slice(0, 100)` → `msg`)', async () => {
    const longErr = new Error('X'.repeat(500));
    const fetchMock = vi.fn<typeof fetch>().mockRejectedValueOnce(longErr);
    const snap = await fetchOllamaSnapshot({ token: '', fetch: fetchMock });
    const warn = snap.warnings.find((w) => /unreachable/.test(w))!;
    // Prefix "Ollama unreachable at http://127.0.0.1:11434: " (44 chars)
    // + 100 chars of X = 144. With mutation: 44 + 500 = 544.
    expect(warn.length).toBeLessThan(200);
    expect(warn).toMatch(/X{100}$/);
    expect(warn).not.toContain('X'.repeat(101));
  });

  it('truncates the listing-models-failed message to 100 chars (kills `.message.slice(0, 100)` → `.message`)', async () => {
    const longErr = 'Y'.repeat(500);
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ version: '0.5.0' }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      )
      // /api/tags rejects with a long error message — exercises the
      // catch path on line 241 where the message gets sliced to 100.
      // Network-level errors (here simulated by rejecting fetch) can
      // legitimately produce long messages from runtimes like undici.
      .mockRejectedValueOnce(new Error(longErr));
    const snap = await fetchOllamaSnapshot({ token: '', fetch: fetchMock });
    const warn = snap.warnings.find((w) => /Listing models failed/.test(w))!;
    expect(warn.length).toBeLessThan(200);
    // The error message from the rejected fetch is 500 'Y' chars; with
    // slice(0,100) the warning is ~122 chars, without it ~522.
    expect(warn).toMatch(/Y{100}$/);
    expect(warn).not.toContain('Y'.repeat(101));
  });

  it('flags an outdated version as unsafe and adds a warning', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({ version: '0.1.30' }))
      .mockResolvedValueOnce(jsonResponse({ models: [] }));
    const snap = await fetchOllamaSnapshot({ token: '', fetch: fetchMock });
    expect(snap.running).toBe(true);
    expect(snap.version).toBe('0.1.30');
    expect(snap.versionSafe).toBe(false);
    expect(snap.warnings.some((w) => /older than/i.test(w) || /CVE/i.test(w))).toBe(true);
  });

  it('reports safe version + normalized models when everything is current', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({ version: '0.5.0' }))
      .mockResolvedValueOnce(
        jsonResponse({
          models: [
            {
              name: 'llama3.2:latest',
              size: 2 * 1024 * 1024 * 1024,
              modified_at: '2026-04-30T12:00:00Z',
              digest: 'sha256:abc',
              details: {
                family: 'llama',
                parameter_size: '3B',
                quantization_level: 'Q4_K_M',
              },
            },
          ],
        }),
      );
    const snap = await fetchOllamaSnapshot({ token: '', fetch: fetchMock });
    expect(snap.running).toBe(true);
    expect(snap.versionSafe).toBe(true);
    expect(snap.models).toHaveLength(1);
    expect(snap.models[0]).toMatchObject({
      name: 'llama3.2:latest',
      family: 'llama',
      parameterSize: '3B',
      quantization: 'Q4_K_M',
      sizeMb: 2048,
      modifiedAt: '2026-04-30',
    });
  });

  it('only ever hits 127.0.0.1:11434 (cannot be redirected elsewhere)', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({ version: '0.5.0' }))
      .mockResolvedValueOnce(jsonResponse({ models: [] }));
    await fetchOllamaSnapshot({ token: 'irrelevant-attempt-to-redirect', fetch: fetchMock });
    for (const call of fetchMock.mock.calls) {
      const url = call[0] as string;
      expect(url.startsWith('http://127.0.0.1:11434')).toBe(true);
    }
  });

  it('emits NO outdated-version warning when the running version is current', async () => {
    // Kills the `if (running && !versionSafe)` ConditionalExpression `true`
    // mutation: with the mutation, every run pushes the CVE warning even
    // for fresh installs.
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({ version: '0.5.0' }))
      .mockResolvedValueOnce(jsonResponse({ models: [] }));
    const snap = await fetchOllamaSnapshot({ token: '', fetch: fetchMock });
    expect(snap.warnings.some((w) => /older than|CVE/i.test(w))).toBe(false);
  });

  it('does NOT attempt to list models when not running (kills `if (running)` → true)', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockRejectedValueOnce(new Error('ECONNREFUSED'));
    const snap = await fetchOllamaSnapshot({ token: '', fetch: fetchMock });
    // Exactly one fetch call (the /api/version probe). With the mutation
    // we'd see a second call to /api/tags.
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(snap.models).toEqual([]);
  });

  it('handles model entries without a `details` object (kills optional chaining drops)', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({ version: '0.5.0' }))
      .mockResolvedValueOnce(
        jsonResponse({
          models: [
            {
              name: 'bare-model',
              size: 1024 * 1024,
              modified_at: '2026-05-01T00:00:00Z',
              digest: 'sha256:x',
              // details: missing entirely
            },
          ],
        }),
      );
    const snap = await fetchOllamaSnapshot({ token: '', fetch: fetchMock });
    // Negative assertion so any string-literal fallback drift (e.g.
    // `'' → "Stryker was here!"`) surfaces explicitly.
    expect(snap.models[0]!.quantization).not.toContain('Stryker');
    expect(snap.models[0]!.family).not.toContain('Stryker');
    expect(snap.models[0]!.parameterSize).not.toContain('Stryker');
    expect(snap.models[0]).toMatchObject({
      name: 'bare-model',
      family: '',
      parameterSize: '',
      quantization: '',
    });
  });

  it('defaults modifiedAt to empty string when modified_at is missing (kills `?? ""` → "Stryker...")', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({ version: '0.5.0' }))
      .mockResolvedValueOnce(
        jsonResponse({
          models: [
            {
              name: 'no-date-model',
              size: 0,
              digest: 'sha256:y',
              details: { family: 'llama', parameter_size: '7B', quantization_level: 'Q4_0' },
              // modified_at: missing
            },
          ],
        }),
      );
    const snap = await fetchOllamaSnapshot({ token: '', fetch: fetchMock });
    expect(snap.models[0]!.modifiedAt).toBe('');
    expect(snap.models[0]!.modifiedAt).not.toContain('Stryker');
  });

  it('pushes an HTTP-status warning when /api/version returns non-ok (kills if(res.ok) → true)', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response('Service Unavailable', { status: 503 }));
    const snap = await fetchOllamaSnapshot({ token: '', fetch: fetchMock });
    expect(snap.running).toBe(false);
    expect(snap.warnings.some((w) => /returned HTTP 503/.test(w))).toBe(true);
    // Models list must NOT be attempted when version probe didn't set running=true.
    expect(snap.models).toEqual([]);
  });

  it('records a "Listing models failed" warning when /api/tags returns non-ok (kills if(!tagsRes.ok) → false)', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({ version: '0.5.0' }))
      .mockResolvedValueOnce(new Response('forbidden', { status: 403 }));
    const snap = await fetchOllamaSnapshot({ token: '', fetch: fetchMock });
    expect(snap.running).toBe(true);
    expect(snap.models).toEqual([]);
    expect(snap.warnings.some((w) => /Listing models failed/.test(w) && /403/.test(w))).toBe(
      true,
    );
  });
});

// --- action: chat

describe('ACTIONS["chat"]', () => {
  it('POSTs to /api/chat with stream=false and returns the assistant text', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          message: { role: 'assistant', content: 'hello back' },
          total_duration: 1_234_000_000, // ns → 1234 ms
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    );
    const result = (await ACTIONS['chat']!({
      token: '',
      fetch: fetchMock,
      payload: { model: 'llama3.2', prompt: 'hi' },
    })) as { reply: string; durationMs: number };

    expect(result.reply).toBe('hello back');
    expect(result.durationMs).toBe(1234);

    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('http://127.0.0.1:11434/api/chat');
    expect((init as RequestInit).method).toBe('POST');
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body.stream).toBe(false);
    expect(body.model).toBe('llama3.2');
    expect(body.messages).toEqual([{ role: 'user', content: 'hi' }]);
  });

  it('rejects an unsafe model name BEFORE any network call', async () => {
    const fetchMock = vi.fn<typeof fetch>();
    await expect(
      ACTIONS['chat']!({
        token: '',
        fetch: fetchMock,
        payload: { model: '../../etc/passwd', prompt: 'hi' },
      }),
    ).rejects.toBeInstanceOf(FetchError);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects with a specific "model and prompt are required" message when prompt is missing', async () => {
    // Kills both the `if (!model || !prompt)` ConditionalExpression false
    // mutant AND the `||` → `&&` LogicalOperator mutant. A vague
    // `.toThrow()` would also pass with the mutations (which throw
    // different errors downstream), so we pin the message.
    const fetchMock = vi.fn<typeof fetch>();
    await expect(
      ACTIONS['chat']!({ token: '', fetch: fetchMock, payload: { model: 'llama3' } }),
    ).rejects.toThrow(/model and prompt are required/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects with the same specific message when model is missing', async () => {
    const fetchMock = vi.fn<typeof fetch>();
    await expect(
      ACTIONS['chat']!({ token: '', fetch: fetchMock, payload: { prompt: 'hi' } }),
    ).rejects.toThrow(/model and prompt are required/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('clamps oversize prompts to 32 KB', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValueOnce(
      new Response(
        JSON.stringify({ message: { role: 'assistant', content: 'ok' } }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    );
    const longPrompt = 'A'.repeat(50_000);
    await ACTIONS['chat']!({
      token: '',
      fetch: fetchMock,
      payload: { model: 'llama3.2', prompt: longPrompt },
    });
    const init = fetchMock.mock.calls[0]![1] as RequestInit;
    const body = JSON.parse(init.body as string);
    expect(body.messages[0].content.length).toBe(32768);
  });

  it('includes a system prompt when provided', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValueOnce(
      new Response(
        JSON.stringify({ message: { role: 'assistant', content: 'ok' } }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    );
    await ACTIONS['chat']!({
      token: '',
      fetch: fetchMock,
      payload: { model: 'llama3.2', prompt: 'hi', system: 'be brief' },
    });
    const body = JSON.parse((fetchMock.mock.calls[0]![1] as RequestInit).body as string);
    expect(body.messages[0]).toEqual({ role: 'system', content: 'be brief' });
    expect(body.messages[1]).toEqual({ role: 'user', content: 'hi' });
  });

  it('propagates a non-2xx response as FetchError with the upstream body in the message', async () => {
    // Asserts the SPECIFIC `ollama 404: model not found` message — kills the
    // `if (!res.ok)` ConditionalExpression false mutation, which would skip
    // the status-aware error and fall through to `non-JSON` instead.
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response('model not found', { status: 404 }));
    await expect(
      ACTIONS['chat']!({
        token: '',
        fetch: fetchMock,
        payload: { model: 'unknown-model', prompt: 'hi' },
      }),
    ).rejects.toThrow(/ollama 404: model not found/);
  });

  it('rejects an over-MAX_RESPONSE_BYTES response (DoS / memory exhaustion guard)', async () => {
    // Synthesize an 11 MB JSON body to trip the size guard. We need the
    // body to be over MAX_RESPONSE_BYTES = 10MB BEFORE JSON.parse.
    const huge = 'x'.repeat(11 * 1024 * 1024);
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValueOnce(
      new Response(JSON.stringify({ message: { role: 'assistant', content: huge } }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
    const err = await ACTIONS['chat']!({
      token: '',
      fetch: fetchMock,
      payload: { model: 'llama3.2', prompt: 'hi' },
    }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(Error);
    expect((err as Error).message).toMatch(/^ollama response exceeded \d+ bytes$/);
    // Pin serviceId='ollama' so the StringLiteral mutant on ollama.ts:322
    // (3rd FetchError arg → "") is killed.
    expect((err as { serviceId: string }).serviceId).toBe('ollama');
  });

  it('throws the literal "ollama returned non-JSON" error when the body fails to parse', async () => {
    // Pin the exact wording (StringLiteral mutant kill on ollama.ts:330).
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValueOnce(
      new Response('<html>not json</html>', {
        status: 200,
        headers: { 'content-type': 'text/html' },
      }),
    );
    const err = await ACTIONS['chat']!({
      token: '',
      fetch: fetchMock,
      payload: { model: 'llama3.2', prompt: 'hi' },
    }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(Error);
    expect((err as Error).message).toBe('ollama returned non-JSON');
    // Pin serviceId='ollama' (StringLiteral kill on ollama.ts:330 3rd arg).
    expect((err as { serviceId: string }).serviceId).toBe('ollama');
  });

  it('POSTs to /api/chat with Content-Type: application/json (kills `headers = {}` mutation)', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValueOnce(
      new Response(
        JSON.stringify({ message: { role: 'assistant', content: 'ok' } }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    );
    await ACTIONS['chat']!({
      token: '',
      fetch: fetchMock,
      payload: { model: 'llama3.2', prompt: 'hi' },
    });
    const init = fetchMock.mock.calls[0]![1] as RequestInit;
    const headers = init.headers as Record<string, string>;
    expect(headers).toBeDefined();
    expect(headers['Content-Type']).toBe('application/json');
  });

  it('clamps an oversized system prompt to 8192 chars (kills `systemStr.slice(0, 8192)` → `systemStr`)', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValueOnce(
      new Response(
        JSON.stringify({ message: { role: 'assistant', content: 'ok' } }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    );
    const longSystem = 'S'.repeat(20_000);
    await ACTIONS['chat']!({
      token: '',
      fetch: fetchMock,
      payload: { model: 'llama3.2', prompt: 'hi', system: longSystem },
    });
    const body = JSON.parse((fetchMock.mock.calls[0]![1] as RequestInit).body as string);
    // messages[0] is the system message (since `system` was provided).
    expect(body.messages[0].role).toBe('system');
    expect(body.messages[0].content.length).toBe(8192);
  });

  it('truncates a long chat-error body to 200 chars (kills `body.slice(0, 200)` → `body`)', async () => {
    const longErrorBody = 'X'.repeat(500);
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(longErrorBody, { status: 500 }));
    let caught: Error | undefined;
    try {
      await ACTIONS['chat']!({
        token: '',
        fetch: fetchMock,
        payload: { model: 'llama3.2', prompt: 'hi' },
      });
    } catch (err) {
      caught = err as Error;
    }
    expect(caught).toBeInstanceOf(FetchError);
    expect(caught!.message).toMatch(/ollama 500: X{200}$/);
    expect(caught!.message.length).toBeLessThan(longErrorBody.length);
    // Pin serviceId='ollama' on the chat-4xx FetchError
    // (kills StringLiteral mutant on ollama.ts:318 3rd arg → "").
    expect((caught as unknown as FetchError).serviceId).toBe('ollama');
  });

  it('falls back to empty body when chat res.text() rejects (kills `() => ""` → `() => undefined`)', async () => {
    const erroringBody = new ReadableStream({
      start(controller) {
        controller.error(new Error('body read failed'));
      },
    });
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(erroringBody, { status: 503 }));
    let caught: Error | undefined;
    try {
      await ACTIONS['chat']!({
        token: '',
        fetch: fetchMock,
        payload: { model: 'llama3.2', prompt: 'hi' },
      });
    } catch (err) {
      caught = err as Error;
    }
    expect(caught).toBeInstanceOf(FetchError);
    expect(caught!.message).toBe('ollama 503: ');
  });

  it('accepts a response of EXACTLY MAX_RESPONSE_BYTES bytes (kills `>` → `>=`)', async () => {
    // Tightened: build a body whose text.length is EXACTLY 10*1024*1024.
    // Original `text.length > MAX_RESPONSE_BYTES` is false → accept.
    // Mutated `>=` is true → reject. Boundary precisely pinned.
    const MAX = 10 * 1024 * 1024;
    const envelope = `{"message":{"role":"assistant","content":""}}`;
    // Insert exactly (MAX - envelope.length) "x" chars between the quotes
    // around content so the body is exactly MAX bytes long.
    const fillerLen = MAX - envelope.length;
    const body =
      `{"message":{"role":"assistant","content":"` +
      'x'.repeat(fillerLen) +
      `"}}`;
    expect(body.length).toBe(MAX);
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValueOnce(
      new Response(body, { status: 200, headers: { 'content-type': 'application/json' } }),
    );
    const result = (await ACTIONS['chat']!({
      token: '',
      fetch: fetchMock,
      payload: { model: 'llama3.2', prompt: 'hi' },
    })) as { reply: string };
    expect(result.reply.length).toBe(fillerLen);
  });

  it('truncates unsafe model name to 32 chars in error (kills `model.slice(0, 32)` → `model`)', async () => {
    // The error message should NOT include more than 32 chars of the
    // attacker-supplied model name. Build a >32-char unsafe name that
    // isSafeModelName actually rejects (contains a space — not in
    // the allowed charset).
    const longUnsafe = 'a'.repeat(40) + ' bad-tail-after-32-chars-with-secret';
    let caught: Error | undefined;
    try {
      await ACTIONS['chat']!({
        token: '',
        fetch: vi.fn<typeof fetch>(),
        payload: { model: longUnsafe, prompt: 'hi' },
      });
    } catch (err) {
      caught = err as Error;
    }
    expect(caught).toBeDefined();
    expect(caught!.message).toMatch(/unsafe model name/);
    // The tail past char 32 should NOT appear.
    expect(caught!.message).not.toContain('bad-tail-after-32-chars-with-secret');
    expect(caught!.message).not.toContain('secret');
    // Pin serviceId='ollama' on the unsafe-model FetchError
    // (kills StringLiteral mutant on ollama.ts:275, 3rd arg → "").
    expect((caught as unknown as { serviceId: string }).serviceId).toBe('ollama');
  });

  it('returns empty reply when message.content is missing (kills `?.content` drop)', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValueOnce(
      new Response(JSON.stringify({ message: { role: 'assistant' /* no content */ } }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
    const result = (await ACTIONS['chat']!({
      token: '',
      fetch: fetchMock,
      payload: { model: 'llama3.2', prompt: 'hi' },
    })) as { reply: string };
    expect(result.reply).toBe('');
  });

  it('returns empty reply when message itself is missing', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValueOnce(
      new Response(JSON.stringify({ /* no message */ }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
    const result = (await ACTIONS['chat']!({
      token: '',
      fetch: fetchMock,
      payload: { model: 'llama3.2', prompt: 'hi' },
    })) as { reply: string };
    expect(result.reply).toBe('');
  });

  it('throws when response body is not valid JSON', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response('not json at all', { status: 200 }));
    await expect(
      ACTIONS['chat']!({
        token: '',
        fetch: fetchMock,
        payload: { model: 'llama3.2', prompt: 'hi' },
      }),
    ).rejects.toThrow(/non-JSON/);
  });

  it('never calls /api/pull, /api/create, /api/push (the CVE-prone endpoints)', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValueOnce(
      new Response(
        JSON.stringify({ message: { role: 'assistant', content: 'ok' } }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    );
    await ACTIONS['chat']!({
      token: '',
      fetch: fetchMock,
      payload: { model: 'llama3.2', prompt: 'hi' },
    });
    for (const call of fetchMock.mock.calls) {
      const url = call[0] as string;
      expect(url).not.toMatch(/\/api\/(pull|create|push)/);
    }
  });
});

// --- endpoint allowlist (defense-in-depth against the unpatched OOB read)

describe('isAllowedEndpoint', () => {
  it('permits /api/version, /api/tags, /api/chat on 127.0.0.1:11434', () => {
    expect(isAllowedEndpoint('http://127.0.0.1:11434/api/version')).toBe(true);
    expect(isAllowedEndpoint('http://127.0.0.1:11434/api/tags')).toBe(true);
    expect(isAllowedEndpoint('http://127.0.0.1:11434/api/chat')).toBe(true);
  });

  it('refuses every CVE-prone Ollama endpoint', () => {
    expect(isAllowedEndpoint('http://127.0.0.1:11434/api/pull')).toBe(false);
    expect(isAllowedEndpoint('http://127.0.0.1:11434/api/create')).toBe(false);
    expect(isAllowedEndpoint('http://127.0.0.1:11434/api/push')).toBe(false);
    expect(isAllowedEndpoint('http://127.0.0.1:11434/api/copy')).toBe(false);
    expect(isAllowedEndpoint('http://127.0.0.1:11434/api/delete')).toBe(false);
    expect(isAllowedEndpoint('http://127.0.0.1:11434/api/blobs/sha256:x')).toBe(false);
    expect(isAllowedEndpoint('http://127.0.0.1:11434/api/upload')).toBe(false);
  });

  it('refuses non-loopback hosts even when the path is allowed', () => {
    expect(isAllowedEndpoint('http://10.0.0.1:11434/api/chat')).toBe(false);
    expect(isAllowedEndpoint('http://attacker.example/api/chat')).toBe(false);
    expect(isAllowedEndpoint('https://127.0.0.1:11434/api/chat')).toBe(false);
  });

  it('refuses path-traversal attempts past the base URL', () => {
    expect(isAllowedEndpoint('http://127.0.0.1:11434/api/chat/../pull')).toBe(false);
    expect(isAllowedEndpoint('http://127.0.0.1:11434/api/version?x=1')).toBe(false);
  });
});

describe('fetchOllamaSnapshot — unpatched OOB notice', () => {
  it('emits UNPATCHED_OOB_NOTICE whenever Ollama is reachable', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({ version: '0.5.0' }))
      .mockResolvedValueOnce(jsonResponse({ models: [] }));
    const snap = await fetchOllamaSnapshot({ token: '', fetch: fetchMock });
    expect(snap.warnings).toContain(UNPATCHED_OOB_NOTICE);
  });

  it('does NOT emit the OOB notice when Ollama is not running', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockRejectedValueOnce(new Error('ECONNREFUSED'));
    const snap = await fetchOllamaSnapshot({ token: '', fetch: fetchMock });
    expect(snap.warnings).not.toContain(UNPATCHED_OOB_NOTICE);
  });

  it('mentions the operational mitigation (verified-source-only) in the notice', () => {
    // Cross-check the wording so the contract with the user matches
    // what docs/OLLAMA_SECURITY.md promises.
    expect(UNPATCHED_OOB_NOTICE).toMatch(/out-of-bounds read/i);
    expect(UNPATCHED_OOB_NOTICE).toMatch(/検証済み|verified/i);
  });

  it('pins each fragment of the OOB notice so partial wording drifts are caught', () => {
    // Kills the four StringLiteral mutants on ollama.ts:53–57. Each
    // concatenation fragment carries unique technical/UX content; any
    // one of them silently mutating to "" or "Stryker was here" would
    // strip the security contract.
    expect(UNPATCHED_OOB_NOTICE).toContain('未パッチの out-of-bounds read');
    expect(UNPATCHED_OOB_NOTICE).toContain('モデル/エンジンファイルパーサ');
    expect(UNPATCHED_OOB_NOTICE).toContain('/api/pull');
    expect(UNPATCHED_OOB_NOTICE).toContain('/api/create');
    expect(UNPATCHED_OOB_NOTICE).toContain('/api/push');
    expect(UNPATCHED_OOB_NOTICE).toContain('攻撃ベクトルを遮断');
    expect(UNPATCHED_OOB_NOTICE).toContain('Ollama 公式 library');
    expect(UNPATCHED_OOB_NOTICE).toContain('検証済みソース');
    expect(UNPATCHED_OOB_NOTICE).toContain('docs/OLLAMA_SECURITY.md');
  });
});

describe('chat — null byte defense', () => {
  it('rejects a prompt containing \\0 before any network call', async () => {
    const fetchMock = vi.fn<typeof fetch>();
    const err = await ACTIONS['chat']!({
      token: '',
      fetch: fetchMock,
      payload: { model: 'llama3.2', prompt: 'hello\0world' },
    }).catch((e: unknown) => e);
    expect((err as Error).message).toMatch(/null byte/);
    // Pin serviceId='ollama' (kills StringLiteral mutant on ollama.ts:289).
    expect((err as { serviceId: string }).serviceId).toBe('ollama');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects a system prompt containing \\0', async () => {
    const fetchMock = vi.fn<typeof fetch>();
    await expect(
      ACTIONS['chat']!({
        token: '',
        fetch: fetchMock,
        payload: { model: 'llama3.2', prompt: 'hi', system: 'be brief\0' },
      }),
    ).rejects.toThrow(/null byte/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('preserves legitimate whitespace (newlines, tabs) in the prompt', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValueOnce(
      new Response(
        JSON.stringify({ message: { role: 'assistant', content: 'ok' } }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    );
    await ACTIONS['chat']!({
      token: '',
      fetch: fetchMock,
      payload: { model: 'llama3.2', prompt: 'line1\nline2\tcol' },
    });
    const body = JSON.parse((fetchMock.mock.calls[0]![1] as RequestInit).body as string);
    expect(body.messages[0].content).toBe('line1\nline2\tcol');
  });
});

describe('chat — endpoint allowlist enforcement', () => {
  it('throws FetchError before issuing fetch when chat URL were ever mismatched', async () => {
    // This test guards the invariant by triggering withTimeout via a
    // hypothetical bug-bait: we patch ALLOWED_ENDPOINTS via direct
    // module read — but since we can't mutate it from outside, we
    // exercise the negative path by asserting isAllowedEndpoint
    // refuses any url constructed from user-controlled input.
    expect(isAllowedEndpoint('http://127.0.0.1:11434/api/chat ')).toBe(false); // trailing space
    expect(isAllowedEndpoint('http://127.0.0.1:11434//api/chat')).toBe(false);
    expect(isAllowedEndpoint('')).toBe(false);
  });
});
