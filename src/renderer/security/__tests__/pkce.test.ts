import { describe, expect, it, vi } from 'vitest';
import { webcrypto } from 'node:crypto';
if (!('subtle' in globalThis.crypto)) {
  Object.defineProperty(globalThis, 'crypto', { value: webcrypto, configurable: true });
}

import {
  base64UrlEncode,
  buildGoogleAuthUrl,
  exchangeGoogleCode,
  generatePkce,
  GOOGLE_SCOPES,
  parseGoogleCallback,
  safeStateEquals,
} from '../../oauth/pkce';

describe('generatePkce', () => {
  it('returns verifier / challenge / state — all base64url, no padding', async () => {
    const s = await generatePkce();
    expect(s.verifier).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(s.challenge).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(s.state).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it('challenge is SHA-256 of verifier (correct length 43 chars for 32-byte hash)', async () => {
    const s = await generatePkce();
    expect(s.challenge).toHaveLength(43);
  });

  it('produces different secrets each call', async () => {
    const a = await generatePkce();
    const b = await generatePkce();
    expect(a.verifier).not.toBe(b.verifier);
    expect(a.state).not.toBe(b.state);
  });
});

describe('buildGoogleAuthUrl', () => {
  it('emits a valid Google auth URL with all required params', async () => {
    const s = await generatePkce();
    const url = buildGoogleAuthUrl(
      {
        clientId: 'app123.apps.googleusercontent.com',
        scopes: GOOGLE_SCOPES.drive,
        redirectUri: 'http://localhost:12345/cb',
      },
      s,
    );
    const u = new URL(url);
    expect(u.origin).toBe('https://accounts.google.com');
    expect(u.pathname).toBe('/o/oauth2/v2/auth');
    expect(u.searchParams.get('response_type')).toBe('code');
    expect(u.searchParams.get('client_id')).toBe('app123.apps.googleusercontent.com');
    expect(u.searchParams.get('redirect_uri')).toBe('http://localhost:12345/cb');
    expect(u.searchParams.get('scope')).toBe(GOOGLE_SCOPES.drive[0]);
    expect(u.searchParams.get('code_challenge')).toBe(s.challenge);
    expect(u.searchParams.get('code_challenge_method')).toBe('S256');
    expect(u.searchParams.get('state')).toBe(s.state);
  });

  it('joins multiple scopes with space', async () => {
    const s = await generatePkce();
    const url = buildGoogleAuthUrl(
      { clientId: 'x', scopes: ['a', 'b', 'c'], redirectUri: 'http://x' },
      s,
    );
    expect(new URL(url).searchParams.get('scope')).toBe('a b c');
  });
});

describe('exchangeGoogleCode', () => {
  /*
   * **本物の `Response` を作る。** 以前は `json()` が payload を返すのに
   * `text()` が空文字を返す手作りの物だった —— 本物ではありえない形で、
   * 交換の本文を `readBodyWithCap` で読むようにした途端に落ちた
   * (2026-08-23)。**モックが実物と違う形をしていると、検査は実装ではなく
   * モックの挙動を留めてしまう。** 同じ誤りをこのリポジトリで 3 度踏んでいる
   * (`cursor.test.ts` / `business.test.ts` / ここ)。
   */
  function mockResponse(payload: unknown, ok = true, status = 200): Response {
    return new Response(JSON.stringify(payload), { status: ok ? status : status });
  }

  const baseArgs = {
    code: 'the-code',
    verifier: 'the-verifier',
    expectedState: 'st-xyz',
    receivedState: 'st-xyz',
    clientId: 'cid',
    redirectUri: 'http://x',
  };

  it('returns access_token + expiresAt on success', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      mockResponse({
        access_token: 'ya29.access',
        refresh_token: 'rt-xxx',
        expires_in: 3600,
        scope: 'a b',
      }),
    );
    const result = await exchangeGoogleCode(baseArgs, fetchMock);
    expect(result.accessToken).toBe('ya29.access');
    expect(result.refreshToken).toBe('rt-xxx');
    expect(result.scope).toBe('a b');
    expect(result.expiresAt).toBeGreaterThan(Date.now());
    expect(result.expiresAt).toBeLessThanOrEqual(Date.now() + 3600_000);
  });

  it('omits refresh_token field when Google returns none', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      mockResponse({ access_token: 'ya29.x', expires_in: 3600 }),
    );
    const result = await exchangeGoogleCode(baseArgs, fetchMock);
    expect(result.refreshToken).toBeUndefined();
  });

  it('falls back to 3600s when expires_in missing / non-finite', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      mockResponse({ access_token: 'x' }),
    );
    const r = await exchangeGoogleCode(baseArgs, fetchMock);
    expect(r.expiresAt).toBeGreaterThan(Date.now() + 3500_000);
  });

  /*
   * **「非有限」の側は、名前だけで実際には試されていなかった。**
   *
   * 上の検査は題に「missing / non-finite」とあるが、標本は `expires_in` が
   * **無い**場合だけである。そのため `typeof === 'number' && isFinite(…)` の
   * `&&` を `||` に変えても鳴らなかった (2026-08-31 実測)。
   *
   * `||` になると **Infinity がそのまま通り**、`Date.now() + Infinity * 1000`
   * で `expiresAt` が Infinity になる —— 期限切れの判定が永久に来ない。
   *
   * `JSON.stringify` は Infinity を書けない (null になる) ので、本文を
   * **生の文字列**で組む。`1e999` は JSON.parse で Infinity になる。
   */
  it('★ expires_in が非有限 (Infinity) なら 3600 に落とす', async () => {
    const raw = '{"access_token":"ya29.x","expires_in":1e999}';
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response(raw, { status: 200 }));
    const r = await exchangeGoogleCode(baseArgs, fetchMock);
    expect(Number.isFinite(r.expiresAt), 'expiresAt が有限であること').toBe(true);
    expect(r.expiresAt).toBeLessThan(Date.now() + 3700_000);
    expect(r.expiresAt).toBeGreaterThan(Date.now() + 3500_000);
  });

  /*
   * 成功応答が上限を超えたときの文言。ここは `.catch` していないので
   * **そのまま利用者に出る** —— どの段で落ちたかが分からないと切り分けが
   * できない。ラベルを空にしても鳴っていなかった。
   */
  it('★ 成功応答が大きすぎるとき、どの段で落ちたかを言う', async () => {
    const huge = '{"access_token":"' + 'x'.repeat(11 * 1024 * 1024) + '"}';
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response(huge, { status: 200 }));
    await expect(exchangeGoogleCode(baseArgs, fetchMock)).rejects.toThrow(/token exchange/);
  });

  it('throws on HTTP error', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      mockResponse({ error: 'invalid_grant' }, false, 400),
    );
    await expect(exchangeGoogleCode(baseArgs, fetchMock)).rejects.toThrow(/token exchange 400/);
  });

  it('rejects empty / oversize code', async () => {
    await expect(exchangeGoogleCode({ ...baseArgs, code: '' })).rejects.toThrow(/code が不正/);
    await expect(exchangeGoogleCode({ ...baseArgs, code: 'x'.repeat(2049) })).rejects.toThrow(/code が不正/);
  });

  it('rejects empty verifier', async () => {
    await expect(exchangeGoogleCode({ ...baseArgs, verifier: '' })).rejects.toThrow(/verifier が不正/);
  });

  /*
   * **打ち切りと応答サイズの上限。** 2026-08-23 に `withTimeout` +
   * `readBodyWithCap` を通したが、**駆動する検査が無かった**。
   * 兄弟の `network/proxy.ts` は掛けていて、ここだけ素の fetch だった。
   *
   * fetch を打ち切る手段は `AbortSignal` しか無いので、`signal` が渡って
   * いるかで「打ち切りが在るか」を測れる (値そのものは httpLimits の検査が持つ)。
   */
  it('トークン交換に打ち切りが掛かっている (signal を渡す)', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      mockResponse({ access_token: 'at', expires_in: 3600 }),
    );
    await exchangeGoogleCode(baseArgs, fetchMock);
    expect(fetchMock.mock.calls[0]?.[1]?.signal).toBeInstanceOf(AbortSignal);
  });

  it('応答が上限を超えていれば読み切らずに落とす', async () => {
    const huge = new Response('a'.repeat(11 * 1024 * 1024), { status: 200 });
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(huge);
    await expect(exchangeGoogleCode(baseArgs, fetchMock)).rejects.toThrow(/too large/);
  });

  it('JSON でない応答は専用の文言で落とす (生の SyntaxError を出さない)', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response('<html>', { status: 200 }));
    await expect(exchangeGoogleCode(baseArgs, fetchMock)).rejects.toThrow(/JSON ではありません/);
  });

  it('throws when response missing access_token', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(mockResponse({ expires_in: 3600 }));
    await expect(exchangeGoogleCode(baseArgs, fetchMock)).rejects.toThrow(/missing access_token/);
  });

  it('rejects state mismatch (CSRF guard) BEFORE hitting token endpoint', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(mockResponse({}));
    await expect(
      exchangeGoogleCode({ ...baseArgs, receivedState: 'attacker-state' }, fetchMock),
    ).rejects.toThrow(/state が一致しません/);
    expect(fetchMock).not.toHaveBeenCalled(); // critical: never POST on mismatch
  });

  it('rejects empty expectedState / receivedState', async () => {
    await expect(exchangeGoogleCode({ ...baseArgs, expectedState: '' })).rejects.toThrow(/expectedState/);
    await expect(exchangeGoogleCode({ ...baseArgs, receivedState: '' })).rejects.toThrow(/receivedState/);
  });
});

describe('safeStateEquals (constant-time)', () => {
  it('returns true for equal strings', () => {
    expect(safeStateEquals('abc', 'abc')).toBe(true);
    expect(safeStateEquals('', '')).toBe(true);
  });

  it('returns false for different content of same length', () => {
    expect(safeStateEquals('abc', 'abd')).toBe(false);
  });

  it('returns false for different lengths', () => {
    expect(safeStateEquals('abc', 'abcd')).toBe(false);
    expect(safeStateEquals('abc', 'ab')).toBe(false);
  });

  it('returns false for non-string inputs', () => {
    expect(safeStateEquals(null as unknown as string, 'abc')).toBe(false);
    expect(safeStateEquals('abc', undefined as unknown as string)).toBe(false);
  });
});

describe('parseGoogleCallback', () => {
  it('parses a full callback URL', () => {
    const got = parseGoogleCallback('https://localhost:12345/cb?code=4%2F0AB123&state=st-xyz&scope=a');
    expect(got).toEqual({ code: '4/0AB123', state: 'st-xyz' });
  });

  it('parses a query-only string with leading ?', () => {
    expect(parseGoogleCallback('?code=ab&state=xy')).toEqual({ code: 'ab', state: 'xy' });
  });

  it('parses a query string without leading ?', () => {
    expect(parseGoogleCallback('code=ab&state=xy')).toEqual({ code: 'ab', state: 'xy' });
  });

  it('returns null when state is missing (rejects bare-code paste)', () => {
    expect(parseGoogleCallback('?code=ab')).toBeNull();
    expect(parseGoogleCallback('code=ab')).toBeNull();
  });

  it('returns null when code is missing', () => {
    expect(parseGoogleCallback('?state=xy')).toBeNull();
  });

  it('returns null for empty / non-string input', () => {
    expect(parseGoogleCallback('')).toBeNull();
    expect(parseGoogleCallback('   ')).toBeNull();
    expect(parseGoogleCallback(null as unknown as string)).toBeNull();
  });

  it('returns null for malformed URL', () => {
    expect(parseGoogleCallback('http://[invalid')).toBeNull();
  });
});

describe('exchangeGoogleCode — エラー本文の秘匿', () => {
  // 連携先がエラー応答に資格情報を反射することがある。この文字列は画面に
  // そのまま出て不具合報告にも貼られるので、resolve する前に伏せる。
  // jsonFetch / http.ts / oauth.ts / proxy.ts は最初から通していたのに、
  // 同じ書き方の 8 箇所 (ここを含む) が素通しだった。
  function errorResponse(body: string): Response {
    return {
      ok: false,
      status: 400,
      async text() { return body; },
      async json() { return {}; },
    } as Response;
  }

  const args = {
    code: 'the-code',
    verifier: 'the-verifier',
    expectedState: 'st-xyz',
    receivedState: 'st-xyz',
    clientId: 'cid',
    redirectUri: 'http://x',
  };

  it('反射された access_token をエラー文へ出さない', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(errorResponse('{"error":"invalid_grant","access_token":"ya29.SUPERSECRETVALUE"}'));
    await expect(exchangeGoogleCode(args, fetchMock)).rejects.toThrow(/REDACTED/);
    await expect(exchangeGoogleCode(args, fetchMock)).rejects.not.toThrow(/SUPERSECRETVALUE/);
  });

  it('reflected bearer token も出さない', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(errorResponse('rejected: ya29.aBcDeFgHiJkLmNoPqRsT'));
    await expect(exchangeGoogleCode(args, fetchMock)).rejects.not.toThrow(/aBcDeFgHiJkLmNoPqRsT/);
  });

  // ネガティブコントロール: 秘匿は「全部消す」ではない。原因が分からなく
  // なっては報告の役に立たないので、資格情報でない部分は残る。
  it('資格情報でない部分は残す (status と error コード)', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(errorResponse('{"error":"invalid_grant","access_token":"ya29.SECRET"}'));
    await expect(exchangeGoogleCode(args, fetchMock)).rejects.toThrow(/invalid_grant/);
    await expect(exchangeGoogleCode(args, fetchMock)).rejects.toThrow(/400/);
  });
});

describe('parseGoogleCallback — クエリでない貼り付け', () => {
  /*
   * 以前は「`=` を含むか」で分岐し、含まないものを早期に null にしていた。
   * その分岐は結果を変えないので消した (等価変異が 2 つ残っていた)。
   * 消しても答えが変わらないことをここで固定する — 分岐を消した瞬間に
   * 挙動が変わっていたら、それは等価ではなかったということ。
   */
  it('`=` を含まない貼り付けは null', () => {
    expect(parseGoogleCallback('4/0AB123')).toBeNull();
    expect(parseGoogleCallback('ここに貼ってください')).toBeNull();
    expect(parseGoogleCallback('#')).toBeNull();
  });

  it('空文字・空白だけでも落ちずに null', () => {
    expect(parseGoogleCallback('')).toBeNull();
    expect(parseGoogleCallback('\t \n')).toBeNull();
  });

  it('code か state の片方だけでは受け取らない', () => {
    expect(parseGoogleCallback('code=ab')).toBeNull();
    expect(parseGoogleCallback('state=xy')).toBeNull();
    expect(parseGoogleCallback('code=&state=xy')).toBeNull();
    expect(parseGoogleCallback('code=ab&state=')).toBeNull();
  });

  it('両方そろっていれば受け取る', () => {
    expect(parseGoogleCallback('code=ab&state=xy')).toEqual({ code: 'ab', state: 'xy' });
  });
});

/*
 * base64url の変換そのものを固定する。
 *
 * `generatePkce` 経由の既存の検査は `/^[A-Za-z0-9_-]+$/` を見ているが、
 * **`/` を消しても文字クラスは満たされる**ので、`/`→`_` の対応が壊れても
 * 落ちない。実測で `.replace(/\//g, '_')` を `''` にした変異体が生き残った。
 * 乱数を差し替えるより、純関数を直に固定するほうが読みやすい。
 */
describe('base64UrlEncode — 対応表を固定する', () => {
  it('+ と / の両方を置き換える', () => {
    // 標準 base64 で "AA+/" になるバイト列。
    expect(base64UrlEncode(new Uint8Array([0, 15, 191]))).toBe('AA-_');
  });

  it('/ を消さずに _ にする (消しても文字クラスは満たされてしまう)', () => {
    const out = base64UrlEncode(new Uint8Array([0, 15, 191]));
    expect(out).toContain('_');
    expect(out).toHaveLength(4);
  });

  it('+ を消さずに - にする', () => {
    const out = base64UrlEncode(new Uint8Array([0, 15, 191]));
    expect(out).toContain('-');
  });

  it('末尾のパディングだけ落とす', () => {
    expect(base64UrlEncode(new Uint8Array([0, 15]))).toBe('AA8'); // "AA8=" から = を 1 つ
    expect(base64UrlEncode(new Uint8Array([255]))).toBe('_w'); // "/w==" から = を 2 つ
  });

  it('空は空', () => {
    expect(base64UrlEncode(new Uint8Array([]))).toBe('');
  });

  it('base64url に現れてはいけない文字が残らない', () => {
    expect(base64UrlEncode(new Uint8Array([0, 15, 191, 255, 254, 253]))).toMatch(/^[A-Za-z0-9_-]+$/);
  });
});
