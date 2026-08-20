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
    // Pin Error.name (kills StringLiteral mutant on types.ts:26
    // `this.name = 'FetchError'` → `""`). Tools that serialize errors
    // (Node's default toString, JSON.stringify reviver, log libraries)
    // rely on this label.
    expect((err as FetchError).name).toBe('FetchError');
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
    // `Bearer` の直後という**位置**で伏せるので、接頭辞ごと消える。
    // 「sk-ant- だけ残る」より強い (未知の発行元の鍵にも同じように効く)。
    expect((err as FetchError).message).toBe('demo 401: invalid auth: Bearer [REDACTED]');
    expect((err as FetchError).message).not.toContain('sk-ant-');
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
    // `toContain` だけだと `{8,}` を `{1}` に落とす変異体
    // (`sk-ant-[REDACTED]pi03-xxxxxxxxxx`) が素通りする。末尾まで消えることを見る。
    expect(redactSecrets('key=sk-ant-api03-xxxxxxxxxx')).toBe('key=sk-ant-[REDACTED]');
    expect(redactSecrets('integration=secret_abcdefghij')).toBe('integration=secret_[REDACTED]');
  });

  it('redacts Slack tokens', () => {
    expect(redactSecrets('xoxp-12345-67890')).toContain('xoxp-[REDACTED]');
    expect(redactSecrets('xoxb-12345-67890')).toContain('xoxb-[REDACTED]');
  });

  it('redacts Atlassian API tokens (ATATT…)', () => {
    const out = redactSecrets('token=ATATT3xFfGF0abcdef_GHIJ-1234.567');
    expect(out).toBe('token=ATATT[REDACTED]');
    expect(out).not.toContain('3xFfGF0');
  });

  it('redacts Google access tokens fully (kills `{10,}` quantifier removal)', () => {
    // Pin that no trailing token bytes leak out. The mutant
    // `/\bya29\.[A-Za-z0-9_-]/g` (quantifier dropped) would replace only
    // the first char after ya29., leaving the rest of the secret intact.
    const out = redactSecrets('access=ya29.A0AfH6SMBxxx_yyyy');
    expect(out).toContain('ya29.[REDACTED]');
    expect(out).toBe('access=ya29.[REDACTED]');
    expect(out).not.toContain('A0AfH6SMBxxx_yyyy');
    expect(out).not.toMatch(/ya29\.[A-Za-z0-9_-]+(?<!REDACTED\])/);
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

/*
 * ヘッダ由来の資格情報。
 *
 * 2026-08-20 の実測で、**JSON にしたヘッダは素通りしていた**ことが分かった。
 * 本文を返してくるのは相手のサーバと利用者が用意したプロキシで、その手の
 * 実装はヘッダをそのまま JSON にして返す。旧規則は `Authorization` の直後に
 * コロンが来る「線上の書き方」しか見ていなかったため、
 * `{"authorization":"Bearer …"}` の形では鍵が画面とログに出ていた。
 *
 * ここは全経路の最後の関門なので (http.ts / proxy.ts / web-shim.ts /
 * pkce.ts / ai/chat.ts)、**漏れる形と、伏せ過ぎてはいけない形**の両方を固定する。
 */
describe('redactSecrets — ヘッダの値', () => {
  const TOKEN = 'key_9f2c1a8e4b7d6c5f0a3e';

  it('JSON にしたヘッダでも伏せる (プロキシがヘッダを返す形)', () => {
    const out = redactSecrets(`{"headers":{"authorization":"Bearer ${TOKEN}"}}`);
    expect(out).toBe('{"headers":{"authorization":"Bearer [REDACTED]"}}');
    expect(out).not.toContain(TOKEN);
  });

  it('大文字の JSON キーでも伏せる', () => {
    expect(redactSecrets(`{"Authorization":"Bearer ${TOKEN}"}`)).toBe(
      '{"Authorization":"Bearer [REDACTED]"}',
    );
  });

  it('単引用符の写し (Python 風の repr) でも伏せる', () => {
    expect(redactSecrets(`{'authorization': 'Bearer ${TOKEN}'}`)).toBe(
      "{'authorization': 'Bearer [REDACTED]'}",
    );
  });

  it('引用符の種類を混ぜて閉じを先出しする細工が効かない', () => {
    // 開き `"` に対して閉じは `"` しか受け付けない。'` で閉じたことにして
    // 残りを本文へ逃がす、という読ませ方はできない。
    const out = redactSecrets(`{"authorization":"Bearer x'${TOKEN}"}`);
    expect(out).not.toContain(TOKEN);
  });

  it('入れ子の JSON でエスケープした引用符を跨いで伏せる', () => {
    const out = redactSecrets(`{"authorization":"Bearer a\\"b${TOKEN}"}`);
    expect(out).not.toContain(TOKEN);
  });

  it('方式は残す (Bearer か Basic かは秘密ではなく手掛かり)', () => {
    expect(redactSecrets(`{"authorization":"Basic ${TOKEN}"}`)).toBe(
      '{"authorization":"Basic [REDACTED]"}',
    );
    expect(redactSecrets('Authorization: Basic dXNlcjpwYXNz')).toBe(
      'Authorization: Basic [REDACTED]',
    );
  });

  it('方式が無いヘッダは値だけを伏せる', () => {
    expect(redactSecrets(`x-api-key: ${TOKEN}`)).toBe('x-api-key: [REDACTED]');
    expect(redactSecrets(`{"headers":{"x-api-key":"${TOKEN}"},"status":401}`)).toBe(
      '{"headers":{"x-api-key":"[REDACTED]"},"status":401}',
    );
  });

  it('長い名前が短い名前に食われない (x-goog-api-key)', () => {
    const google = 'AIzaSyD9f2c1a8e4b7d6c5f0a3eXYZ12345';
    expect(redactSecrets(`{"x-goog-api-key":"${google}"}`)).toBe(
      '{"x-goog-api-key":"[REDACTED]"}',
    );
    expect(redactSecrets(`x-goog-api-key: ${google}`)).toBe('x-goog-api-key: [REDACTED]');
  });

  it('プロキシ自身が足すヘッダも伏せる', () => {
    expect(redactSecrets(`proxy-authorization: Bearer ${TOKEN}`)).toBe(
      'proxy-authorization: Bearer [REDACTED]',
    );
  });

  it('コロンの周りの空白と引用符の形をそのまま書き戻す', () => {
    expect(redactSecrets(`{"authorization" : "Bearer ${TOKEN}"}`)).toBe(
      '{"authorization" : "Bearer [REDACTED]"}',
    );
    expect(redactSecrets(`Authorization:Bearer ${TOKEN}`)).toBe('Authorization:Bearer [REDACTED]');
  });

  it('伏せた結果に二度当たらない (形が崩れない)', () => {
    const once = redactSecrets(`{"authorization":"Bearer ${TOKEN}"}`);
    expect(redactSecrets(once)).toBe(once);
    const wire = redactSecrets(`Authorization: Bearer ${TOKEN}`);
    expect(redactSecrets(wire)).toBe(wire);
  });

  it('ヘッダ名が付いていない裸の Bearer も伏せる', () => {
    expect(redactSecrets(`invalid auth: Bearer ${TOKEN}`)).toBe(
      'invalid auth: Bearer [REDACTED]',
    );
  });

  it('英文は伏せない (401 の説明が消えると原因が分からなくなる)', () => {
    // 短い語は資格情報ではない。伏せ過ぎは診断の妨げになる。
    expect(redactSecrets('Basic authentication is required')).toBe(
      'Basic authentication is required',
    );
    expect(redactSecrets('Bearer token missing')).toBe('Bearer token missing');
  });

  it('コロンの前後に空白が無くても、方式が無くても伏せる', () => {
    // `Bearer` が無い分、方式の規則には引っかからない。ヘッダ名の規則だけが
    // 効く形なので、名前と値の間の書き方をここで固定する。
    expect(redactSecrets(`x-api-key:${TOKEN}`)).toBe('x-api-key:[REDACTED]');
    expect(redactSecrets(`{"x-api-key" : "${TOKEN}"}`)).toBe('{"x-api-key" : "[REDACTED]"}');
  });

  it('方式と値のあいだが空白 2 個でも伏せる', () => {
    expect(redactSecrets(`invalid auth: Bearer  ${TOKEN}`)).toBe(
      'invalid auth: Bearer [REDACTED]',
    );
  });

  it('Google の API キーは URL に載っていても伏せる', () => {
    // YouTube は `?key=…` の形でキーを URL に載せる (API の仕様)。
    // URL ごと書き出された場合に備えて、接頭辞でも拾えるようにしておく。
    const url = 'https://www.googleapis.com/youtube/v3/channels?id=UC1&key=AIzaSyD9f2c1a8e4b';
    expect(redactSecrets(url)).toBe(
      'https://www.googleapis.com/youtube/v3/channels?id=UC1&key=AIza[REDACTED]',
    );
  });

  it('資格情報を運ばないヘッダは触らない', () => {
    expect(redactSecrets('content-type: application/json')).toBe('content-type: application/json');
    expect(redactSecrets('{"retry-after":"30"}')).toBe('{"retry-after":"30"}');
  });
});
