import { describe, expect, it, vi } from 'vitest';
import {
  jsonFetch,
  limitedFetch,
  readCapped,
  FetchError,
  redactSecrets,
  redactForMessage,
} from '../types';
import { REDACT_SCAN_LIMIT } from '../../../shared/redact';

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

/*
 * 秘匿と切り詰めの順序。
 *
 * 2026-08-21 の監査時点で、`redactSecrets` の呼び出し 17 箇所すべてが
 * `redactSecrets(body.slice(0, 200))` と書いていた。**切ってから伏せている。**
 *
 * `redactSecrets` の規則は模様で秘密を見つけるので、模様の終わり
 * (`"…"` の閉じ引用符 / `Bearer` の 16 文字 / 接頭辞の 8 文字) が
 * 切り落とされると**規則そのものが当たらなくなる**。見えている部分は
 * 伏せられないまま残る。
 */
describe('redactForMessage — 伏せてから切る', () => {
  const TOKEN = '1//0eXyZaBcDeFgHiJkLmNoPqRsTuVwXyZ0123456789abcdefGHIJKLMNOP';

  /** out に残っている token の先頭からの一致文字数。 */
  const leaked = (out: string, token: string): number => {
    let n = 0;
    while (n < token.length && out.includes(token.slice(0, n + 1))) n += 1;
    return n;
  };

  it('閉じ引用符が切り口の外へ落ちても漏らさない', () => {
    // 詰め物 116 のとき、閉じ引用符がちょうど 200 文字目の外側に来る。
    // このとき本文にはトークン全体が見えているのに JSON の規則が当たらない。
    const body = `{"d":"${'x'.repeat(116)}","access_token":"${TOKEN}"}`;
    // 直す前の書き方 — 60 文字すべてが残る。
    expect(leaked(redactSecrets(body.slice(0, 200)), TOKEN)).toBe(TOKEN.length);
    // 直した書き方 — 1 文字も残らない。
    expect(leaked(redactForMessage(body, 200), TOKEN)).toBe(0);
  });

  it('詰め物の長さを 0〜220 まで振っても 1 文字も漏らさない', () => {
    // 1 点だけ確かめると、たまたま安全な位置を選んでしまう。
    let worst = 0;
    for (let pad = 0; pad <= 220; pad += 1) {
      const body = `{"d":"${'x'.repeat(pad)}","access_token":"${TOKEN}"}`;
      worst = Math.max(worst, leaked(redactForMessage(body, 200), TOKEN));
    }
    expect(worst).toBe(0);
  });

  it('Bearer の 16 文字要件も切り口に影響されない', () => {
    const bearer = 'ghp_abcdefghijklmnopqrstuvwxyz0123456789';
    for (let pad = 0; pad <= 220; pad += 1) {
      const body = `{"d":"${'x'.repeat(pad)}","h":"Authorization: Bearer ${bearer}"}`;
      expect(redactForMessage(body, 200)).not.toContain(bearer);
    }
  });

  it('結果は maxLength を超えない', () => {
    expect(redactForMessage('y'.repeat(1000), 200)).toHaveLength(200);
    expect(redactForMessage('y'.repeat(1000), 80)).toHaveLength(80);
    // 短い本文はそのまま (詰めない)。
    expect(redactForMessage('short', 200)).toBe('short');
    expect(redactForMessage('', 200)).toBe('');
  });

  it('秘密以外の説明は残る (読めば分かる 401 の理由を消さない)', () => {
    expect(redactForMessage('{"error":"invalid_grant","hint":"expired"}', 200)).toBe(
      '{"error":"invalid_grant","hint":"expired"}',
    );
  });

  it('走査の上限は出力の上限でもある (未走査の文字は 1 つも出さない)', () => {
    // 切ってから伏せるのではなく、**上限まで切ってから伏せて、さらに切る**。
    // したがって上限より後ろの文字は走査されないだけでなく、出力にも
    // 現れない — 「伏せられていない文字が上限の外から出てくる」経路が無い。
    const far = 'x'.repeat(REDACT_SCAN_LIMIT) + ' ghp_abcdefghijklmnopqrst';
    const out = redactForMessage(far, REDACT_SCAN_LIMIT + 100);
    expect(out).not.toContain('ghp_');
    expect(out.length).toBeLessThanOrEqual(REDACT_SCAN_LIMIT);
    // 上限の内側にあれば伏せる。
    const near = 'x'.repeat(100) + ' ghp_abcdefghijklmnopqrst';
    expect(redactForMessage(near, 200)).toContain('ghp_[REDACTED]');
  });
});

/*
 * **`limitedFetch` —— 本文を読まずに `Response` を返す口。**
 *
 * 2026-08-23 に `jsonFetch` から切り出した。JSON を返さない相手
 * (202 Accepted・webhook の 204・404 が正常応答の HIBP) が素の `fetch` を
 * 直に呼んでいて、**打ち切りも上限も掛かっていなかった**ため。
 *
 * ここで留めるのは「既定でない値を渡したとき、その値が使われるか」——
 * `??` を `&&` に変えた変異体は既定へ落ちるので、既定と違う値を渡した
 * 検査でしか死なない。
 */
describe('limitedFetch', () => {
  /** 呼び出し側が本文を使う場所。ここでの `res` は**締切の中**に居る。 */
  const status = async (res: Response): Promise<number> => res.status;

  it('2xx をそのまま渡す (本文は読まない)', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValueOnce(new Response('', { status: 202 }));
    const got = await limitedFetch('https://example.com', {}, { fetch: fetchMock, serviceId: 'demo' }, status);
    expect(got).toBe(202);
  });

  it('4xx/5xx も投げずに渡す (呼び出し側が判断する)', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValueOnce(new Response('nope', { status: 404 }));
    expect(
      await limitedFetch('https://example.com', {}, { fetch: fetchMock, serviceId: 'demo' }, status),
    ).toBe(404);
  });

  it('fetch へ AbortSignal を渡す', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValueOnce(new Response('{}', { status: 200 }));
    await limitedFetch('https://example.com', {}, { fetch: fetchMock, serviceId: 'demo' }, status);
    expect(fetchMock.mock.calls[0]?.[1]?.signal).toBeInstanceOf(AbortSignal);
  });

  /*
   * **`ctx.timeoutMs` が本当に使われるか。** `??` を `&&` に変えると
   * 既定の 30 秒へ落ちるので、5 ミリ秒を渡した検査だけが差を見られる。
   */
  it('ctx.timeoutMs を過ぎたら打ち切って専用の文言で投げる', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockImplementation(
      (_url: unknown, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => reject(new Error('aborted')));
        }),
    );
    await expect(
      limitedFetch('https://example.com', {}, { fetch: fetchMock, serviceId: 'demo', timeoutMs: 5 }, status),
    ).rejects.toThrow(/demo が時間内に応答しませんでした/);
  });

  /*
   * **★ 本文の読み取りにも締切が掛かること。**
   *
   * これがこの口の存在理由である。応答は即座に返るが、本文が終わらない ——
   * 2026-08-28 まで、この形は**永久にぶら下がっていた** (`Response` を締切の
   * 外へ返していたため)。`init.signal` は当時も渡っていたので、signal を見る
   * 検査では捕まらない。
   */
  it('★ ヘッダは返るが本文が終わらない応答も、締切で打ち切る', async () => {
    // **モックは実物の形に合わせる。** 最初は `stream.cancel()` を呼ぶ形で
    // 書いたが、reader が掴んでいる stream の cancel は投げるので何も起きず、
    // 検査は 5 秒でタイムアウトした —— **モックの挙動を留めていた**。
    // 実物 (undici) は abort で本文 stream を **error させる**。同じ形にする。
    // (実サーバでの測定は別途行っている: ヘッダを flush して本文を止めると
    //  修正前は 4000ms を超えても返らなかった。)
    const fetchMock = vi.fn<typeof fetch>().mockImplementation(
      async (_url: unknown, init?: RequestInit) => {
        const body = new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(new TextEncoder().encode('{'));
            init?.signal?.addEventListener('abort', () => {
              controller.error(new DOMException('The operation was aborted.', 'AbortError'));
            });
            // 以後 enqueue も close もしない
          },
        });
        return new Response(body, { status: 200 });
      },
    );
    await expect(
      limitedFetch(
        'https://example.com',
        {},
        { fetch: fetchMock, serviceId: 'demo', timeoutMs: 20 },
        (res) => readCapped(res, { serviceId: 'demo' }),
      ),
    ).rejects.toThrow(/demo が時間内に応答しませんでした/);
  }, 5000);

  it('打ち切りでない失敗は、その失敗のまま投げる (握り潰さない)', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockRejectedValueOnce(new Error('ECONNREFUSED'));
    await expect(
      limitedFetch('https://example.com', {}, { fetch: fetchMock, serviceId: 'demo' }, status),
    ).rejects.toThrow('ECONNREFUSED');
  });

  /*
   * **宣言された長さの先手の門。** 本文を読む前に落ちる。
   */
  it('Content-Length が ctx.maxBytes を超えていれば、本文を読む前に落とす', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValueOnce(
      new Response('x', { status: 200, headers: { 'content-length': '999' } }),
    );
    await expect(
      limitedFetch('https://example.com', {}, { fetch: fetchMock, serviceId: 'demo', maxBytes: 10 }, status),
    ).rejects.toThrow(/demo response too large \(999 > 10 bytes\)/);
  });

  /*
   * **★ 先手の門で落とすとき、本文を捨てること。**
   *
   * 未消費の応答本文を放置すると undici はソケットをプールへ返さない。
   * 対になる `readBodyWithCap` は上限超過で `reader.cancel()` してから投げる。
   */
  it('★ 先手の門で落とすときは本文を捨てる (接続を握ったままにしない)', async () => {
    let cancelled = false;
    const body = new ReadableStream<Uint8Array>({
      start(c) { c.enqueue(new TextEncoder().encode('x')); },
      cancel() { cancelled = true; },
    });
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValueOnce(
      new Response(body, { status: 200, headers: { 'content-length': '999' } }),
    );
    await expect(
      limitedFetch('https://example.com', {}, { fetch: fetchMock, serviceId: 'demo', maxBytes: 10 }, status),
    ).rejects.toThrow(/too large/);
    expect(cancelled, '本文が捨てられていない').toBe(true);
  });

  it('★ 本文を読まなかった応答も捨てる (202 / 204 の経路)', async () => {
    let cancelled = false;
    const body = new ReadableStream<Uint8Array>({
      start(c) { c.enqueue(new TextEncoder().encode('x')); },
      cancel() { cancelled = true; },
    });
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValueOnce(new Response(body, { status: 202 }));
    await limitedFetch('https://example.com', {}, { fetch: fetchMock, serviceId: 'demo' }, status);
    expect(cancelled, '読まなかった本文が捨てられていない').toBe(true);
  });

  it('Content-Length が ctx.maxBytes 以下なら通す (境界)', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValueOnce(
      new Response('x', { status: 200, headers: { 'content-length': '10' } }),
    );
    expect(
      await limitedFetch('https://example.com', {}, { fetch: fetchMock, serviceId: 'demo', maxBytes: 10 }, status),
    ).toBe(200);
  });

  /*
   * **★ `Response` を締切の外へ出そうとしたら大声で落ちること。**
   *
   * 元の欠陥そのものを規則にした。`consume` が `res` を返す = 本文が未読のまま
   * 締切の外へ出るということなので、`withTimeout` が拒む。
   */
  it('★ consume が Response を返したら拒む (再発防止)', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValueOnce(new Response('{}', { status: 200 }));
    await expect(
      limitedFetch('https://example.com', {}, { fetch: fetchMock, serviceId: 'demo' }, async (res) => res),
    ).rejects.toThrow(/Response を返しています/);
  });
});

describe('readCapped', () => {
  it('ctx.maxBytes 以内の本文は返す', async () => {
    expect(await readCapped(new Response('abc'), { serviceId: 'demo', maxBytes: 10 })).toBe('abc');
  });

  it('ctx.maxBytes を超える本文は落とす (既定へ落ちない)', async () => {
    await expect(
      readCapped(new Response('a'.repeat(11)), { serviceId: 'demo', maxBytes: 10 }),
    ).rejects.toThrow(/demo response too large/);
  });
});

describe('jsonFetch は limitedFetch の上限をそのまま受け継ぐ', () => {
  it('ctx.maxBytes を超える本文は JSON になる前に落ちる', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(JSON.stringify({ pad: 'a'.repeat(50) }), { status: 200 }));
    await expect(
      jsonFetch('https://example.com', {}, { fetch: fetchMock, serviceId: 'demo', maxBytes: 10 }),
    ).rejects.toThrow(/demo response too large/);
  });

  it('失敗応答の本文も ctx.maxBytes で切る', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response('e'.repeat(50), { status: 500 }));
    // 本文が読めなければ `.catch(() => '')` で空になり、状態番号だけが残る。
    await expect(
      jsonFetch('https://example.com', {}, { fetch: fetchMock, serviceId: 'demo', maxBytes: 10 }),
    ).rejects.toThrow(/demo 500: $/);
  });
});
