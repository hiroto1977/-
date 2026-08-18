/**
 * PKCE / OAuth の契約テスト。
 *
 * 背景 — `pkce.ts` は 180 行 (全 211 行) を `Stryker disable` しており、
 * OAuth の入口はほぼ測られていなかった。無効化を外して実測すると
 * **171 変異体・77.71%・生存 37 / 未到達 2**。
 *
 * 生存していたのは「送っている中身を誰も見ていない」形が中心だった:
 *
 * - トークン要求の本文 (`grant_type` / `code_verifier` / `redirect_uri`) を
 *   `{}` に潰しても、どのテストも落ちなかった
 * - 認可 URL の `code_challenge_method: 'S256'` / `access_type` / `prompt` も同様
 * - 入口のガード (code 長 2048 / verifier / state 空) の境界
 * - 応答の既定値 (expires_in 無しは 3600 / scope 無しは '')
 *
 * PKCE は「送る中身」が防御そのものなので、中身を見ない検査は
 * 何も確かめていないのと同じになる。
 */
import { describe, expect, it, vi } from 'vitest';
import { webcrypto } from 'node:crypto';
if (!('subtle' in globalThis.crypto)) {
  Object.defineProperty(globalThis, 'crypto', { value: webcrypto, configurable: true });
}
import {
  buildGoogleAuthUrl,
  exchangeGoogleCode,
  generatePkce,
  parseGoogleCallback,
  safeStateEquals,
} from '../../oauth/pkce';

const SECRETS = { verifier: 'v'.repeat(86), challenge: 'chal-123', state: 's'.repeat(43) };
const OPTS = {
  clientId: 'client-abc.apps.googleusercontent.com',
  scopes: ['https://www.googleapis.com/auth/drive.readonly', 'openid'],
  redirectUri: 'http://localhost:12345/cb',
};

// ===== 認可 URL に必要な項目が全部乗るか ==================================

describe('認可 URL — PKCE に必要な項目', () => {
  function params(): URLSearchParams {
    return new URL(buildGoogleAuthUrl(OPTS, SECRETS)).searchParams;
  }

  it('Google の認可エンドポイントへ向ける', () => {
    expect(buildGoogleAuthUrl(OPTS, SECRETS).startsWith('https://accounts.google.com/o/oauth2/v2/auth?')).toBe(true);
  });

  it('response_type=code', () => { expect(params().get('response_type')).toBe('code'); });
  it('client_id を渡す', () => { expect(params().get('client_id')).toBe(OPTS.clientId); });
  it('redirect_uri を渡す', () => { expect(params().get('redirect_uri')).toBe(OPTS.redirectUri); });
  it('scope は空白区切りで連結する', () => { expect(params().get('scope')).toBe(OPTS.scopes.join(' ')); });
  it('code_challenge は生成した challenge', () => { expect(params().get('code_challenge')).toBe(SECRETS.challenge); });

  // ここが PKCE の中身。`plain` に落ちると verifier がそのまま流れる。
  it('code_challenge_method は S256 (plain にしない)', () => {
    expect(params().get('code_challenge_method')).toBe('S256');
  });

  it('state を渡す (CSRF 用)', () => { expect(params().get('state')).toBe(SECRETS.state); });
  it('access_type=offline (refresh_token を得るため)', () => { expect(params().get('access_type')).toBe('offline'); });
  it('prompt=consent', () => { expect(params().get('prompt')).toBe('consent'); });

  it('verifier そのものは URL に載せない', () => {
    expect(buildGoogleAuthUrl(OPTS, SECRETS)).not.toContain(SECRETS.verifier);
  });
});

// ===== 生成した秘密の形 ==================================================

describe('generatePkce', () => {
  it('verifier / state / challenge は base64url (パディングや + / を含まない)', async () => {
    const s = await generatePkce();
    for (const v of [s.verifier, s.state, s.challenge]) {
      expect(v).toMatch(/^[A-Za-z0-9_-]+$/);
    }
  });

  it('challenge は verifier の SHA-256 (base64url) と一致する', async () => {
    const s = await generatePkce();
    const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s.verifier));
    const expected = btoa(String.fromCharCode(...new Uint8Array(hash)))
      .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    expect(s.challenge).toBe(expected);
  });

  it('毎回違う値になる', async () => {
    const a = await generatePkce();
    const b = await generatePkce();
    expect(a.verifier).not.toBe(b.verifier);
    expect(a.state).not.toBe(b.state);
  });

  it('state は 32 バイト由来 = 43 文字', async () => {
    expect((await generatePkce()).state.length).toBe(43);
  });

  it('verifier は 64 バイト由来 = 86 文字 (RFC 7636 の 43-128 内)', async () => {
    const v = (await generatePkce()).verifier;
    expect(v.length).toBe(86);
    expect(v.length).toBeGreaterThanOrEqual(43);
    expect(v.length).toBeLessThanOrEqual(128);
  });
});

// ===== state の比較 ======================================================

describe('safeStateEquals', () => {
  it('同じ文字列は true', () => { expect(safeStateEquals('abc', 'abc')).toBe(true); });
  it('違う文字列は false', () => { expect(safeStateEquals('abc', 'abd')).toBe(false); });
  it('長さが違えば false', () => { expect(safeStateEquals('abc', 'abcd')).toBe(false); });
  it('空同士は true', () => { expect(safeStateEquals('', '')).toBe(true); });
  it('先頭だけ違っても false', () => { expect(safeStateEquals('xbc', 'abc')).toBe(false); });
  it('末尾だけ違っても false (最後まで見ている)', () => { expect(safeStateEquals('abx', 'abc')).toBe(false); });
  it('文字列でない値は false', () => {
    expect(safeStateEquals(null as unknown as string, 'abc')).toBe(false);
    expect(safeStateEquals('abc', 7 as unknown as string)).toBe(false);
  });
});

// ===== コールバックの解釈 ================================================

describe('parseGoogleCallback', () => {
  it('完全な URL から取り出す', () => {
    expect(parseGoogleCallback('https://localhost:1234/cb?code=A&state=B')).toEqual({ code: 'A', state: 'B' });
  });

  it('先頭 ? のクエリ文字列から取り出す', () => {
    expect(parseGoogleCallback('?code=A&state=B')).toEqual({ code: 'A', state: 'B' });
  });

  it('? の無いクエリ文字列から取り出す', () => {
    expect(parseGoogleCallback('code=A&state=B')).toEqual({ code: 'A', state: 'B' });
  });

  it('前後の空白は落とす', () => {
    expect(parseGoogleCallback('  code=A&state=B  ')).toEqual({ code: 'A', state: 'B' });
  });

  it('http でも受ける (大文字小文字を問わない)', () => {
    expect(parseGoogleCallback('HTTP://localhost/cb?code=A&state=B')).toEqual({ code: 'A', state: 'B' });
  });

  it('空文字は null', () => { expect(parseGoogleCallback('')).toBeNull(); });
  it('空白だけは null', () => { expect(parseGoogleCallback('   ')).toBeNull(); });
  it('文字列でなければ null', () => { expect(parseGoogleCallback(null as unknown as string)).toBeNull(); });

  // `=` を含まない入力は 3 番目の分岐 (return null) に落ちる。
  it('= を含まない文字列は null', () => { expect(parseGoogleCallback('just-a-code')).toBeNull(); });

  it('state の無いコールバックは受け付けない (CSRF 防止)', () => {
    expect(parseGoogleCallback('?code=A')).toBeNull();
  });

  it('code の無いコールバックは受け付けない', () => {
    expect(parseGoogleCallback('?state=B')).toBeNull();
  });

  it('壊れた URL は null (例外にしない)', () => {
    expect(parseGoogleCallback('https://[bad')).toBeNull();
  });

  // Google のコールバックは `scope=https://www.googleapis.com/auth/...` を含む。
  // URL 判定が**先頭一致**でないと、この形が「URL」と誤認されて `new URL` が
  // 失敗し、正しいコールバックを取りこぼす。
  it('値に URL を含むクエリ文字列でも取り出せる (先頭一致であること)', () => {
    expect(parseGoogleCallback('code=A&state=B&scope=https://www.googleapis.com/auth/drive.readonly'))
      .toEqual({ code: 'A', state: 'B', });
  });

  it('先頭 ? 付きでも同様', () => {
    expect(parseGoogleCallback('?code=A&state=B&scope=https://www.googleapis.com/auth/drive.readonly'))
      .toEqual({ code: 'A', state: 'B' });
  });
});

// ===== トークン交換 ======================================================

describe('exchangeGoogleCode — 送る中身', () => {
  const BASE = {
    code: 'auth-code-1',
    verifier: SECRETS.verifier,
    expectedState: SECRETS.state,
    receivedState: SECRETS.state,
    clientId: OPTS.clientId,
    redirectUri: OPTS.redirectUri,
  };
  function okRes(body: Record<string, unknown> = { access_token: 'at', expires_in: 100, scope: 'sc' }): Response {
    return { ok: true, status: 200, async json() { return body; }, async text() { return ''; } } as unknown as Response;
  }

  async function sentBody(): Promise<URLSearchParams> {
    const f = vi.fn<typeof fetch>().mockResolvedValue(okRes());
    await exchangeGoogleCode(BASE, f);
    return new URLSearchParams(f.mock.calls[0]![1]!.body as string);
  }

  it('Google のトークンエンドポイントへ POST する', async () => {
    const f = vi.fn<typeof fetch>().mockResolvedValue(okRes());
    await exchangeGoogleCode(BASE, f);
    expect(f.mock.calls[0]![0]).toBe('https://oauth2.googleapis.com/token');
    expect(f.mock.calls[0]![1]!.method).toBe('POST');
  });

  it('content-type は form-urlencoded', async () => {
    const f = vi.fn<typeof fetch>().mockResolvedValue(okRes());
    await exchangeGoogleCode(BASE, f);
    expect((f.mock.calls[0]![1]!.headers as Record<string, string>)['content-type'])
      .toBe('application/x-www-form-urlencoded');
  });

  it('grant_type=authorization_code', async () => {
    expect((await sentBody()).get('grant_type')).toBe('authorization_code');
  });

  // ここが PKCE の要 — verifier を送らなければ challenge を出した意味が無い。
  it('code_verifier を送る', async () => {
    expect((await sentBody()).get('code_verifier')).toBe(SECRETS.verifier);
  });

  it('code / client_id / redirect_uri を送る', async () => {
    const b = await sentBody();
    expect(b.get('code')).toBe('auth-code-1');
    expect(b.get('client_id')).toBe(OPTS.clientId);
    expect(b.get('redirect_uri')).toBe(OPTS.redirectUri);
  });

  it('code の前後空白は落として送る', async () => {
    const f = vi.fn<typeof fetch>().mockResolvedValue(okRes());
    await exchangeGoogleCode({ ...BASE, code: '  auth-code-1  ' }, f);
    expect(new URLSearchParams(f.mock.calls[0]![1]!.body as string).get('code')).toBe('auth-code-1');
  });

  it('state は本文に載せない (交換前に照合済み)', async () => {
    expect((await sentBody()).get('state')).toBeNull();
  });
});

describe('exchangeGoogleCode — 入口のガード', () => {
  const BASE = {
    code: 'c', verifier: 'v', expectedState: 's', receivedState: 's',
    clientId: 'id', redirectUri: 'http://localhost/cb',
  };
  const never = () => vi.fn<typeof fetch>();

  it('state が違えば送らない (CSRF)', async () => {
    const f = never();
    await expect(exchangeGoogleCode({ ...BASE, receivedState: 'other' }, f))
      .rejects.toThrow('CSRF 攻撃の可能性');
    expect(f).not.toHaveBeenCalled();
  });

  it('code が空なら送らない', async () => {
    const f = never();
    await expect(exchangeGoogleCode({ ...BASE, code: '' }, f)).rejects.toThrow('code が不正です');
    expect(f).not.toHaveBeenCalled();
  });

  it('code が 2048 文字ちょうどは通す (上限)', async () => {
    const f = vi.fn<typeof fetch>().mockResolvedValue(
      { ok: true, status: 200, async json() { return { access_token: 'at' }; } } as unknown as Response,
    );
    await expect(exchangeGoogleCode({ ...BASE, code: 'c'.repeat(2048) }, f)).resolves.toBeDefined();
  });

  it('code が 2049 文字は断る (上限の外)', async () => {
    await expect(exchangeGoogleCode({ ...BASE, code: 'c'.repeat(2049) }, never()))
      .rejects.toThrow('code が不正です');
  });

  it('code が文字列でなければ断る', async () => {
    await expect(exchangeGoogleCode({ ...BASE, code: 1 as unknown as string }, never()))
      .rejects.toThrow('code が不正です');
  });

  it('verifier が空なら断る', async () => {
    await expect(exchangeGoogleCode({ ...BASE, verifier: '' }, never())).rejects.toThrow('verifier が不正です');
  });

  it('verifier が文字列でなければ断る', async () => {
    await expect(exchangeGoogleCode({ ...BASE, verifier: null as unknown as string }, never()))
      .rejects.toThrow('verifier が不正です');
  });

  it('expectedState が空なら断る', async () => {
    await expect(exchangeGoogleCode({ ...BASE, expectedState: '' }, never()))
      .rejects.toThrow('expectedState が不正です');
  });

  it('expectedState が文字列でなければ断る', async () => {
    await expect(exchangeGoogleCode({ ...BASE, expectedState: 0 as unknown as string }, never()))
      .rejects.toThrow('expectedState が不正です');
  });

  it('receivedState が空なら断る', async () => {
    await expect(exchangeGoogleCode({ ...BASE, receivedState: '' }, never()))
      .rejects.toThrow('receivedState が不正です');
  });

  it('receivedState が文字列でなければ断る', async () => {
    await expect(exchangeGoogleCode({ ...BASE, receivedState: undefined as unknown as string }, never()))
      .rejects.toThrow('receivedState が不正です');
  });
});

describe('exchangeGoogleCode — 応答の扱い', () => {
  const BASE = {
    code: 'c', verifier: 'v', expectedState: 's', receivedState: 's',
    clientId: 'id', redirectUri: 'http://localhost/cb',
  };
  const res = (body: Record<string, unknown>) =>
    vi.fn<typeof fetch>().mockResolvedValue(
      { ok: true, status: 200, async json() { return body; } } as unknown as Response,
    );

  it('access_token が無ければ失敗', async () => {
    await expect(exchangeGoogleCode(BASE, res({}))).rejects.toThrow('missing access_token');
  });

  it('access_token が空文字でも失敗', async () => {
    await expect(exchangeGoogleCode(BASE, res({ access_token: '' }))).rejects.toThrow('missing access_token');
  });

  it('expires_in が無ければ 3600 秒として扱う', async () => {
    const before = Date.now();
    const r = await exchangeGoogleCode(BASE, res({ access_token: 'at' }));
    expect(r.expiresAt).toBeGreaterThanOrEqual(before + 3600 * 1000);
    expect(r.expiresAt).toBeLessThan(before + 3601 * 1000 + 5000);
  });

  it('expires_in が数値でなければ 3600 秒として扱う', async () => {
    const before = Date.now();
    const r = await exchangeGoogleCode(BASE, res({ access_token: 'at', expires_in: 'soon' }));
    expect(r.expiresAt).toBeGreaterThanOrEqual(before + 3600 * 1000);
  });

  it('expires_in が有限でなければ 3600 秒として扱う', async () => {
    const before = Date.now();
    const r = await exchangeGoogleCode(BASE, res({ access_token: 'at', expires_in: Infinity }));
    expect(r.expiresAt).toBeGreaterThanOrEqual(before + 3600 * 1000);
    expect(Number.isFinite(r.expiresAt)).toBe(true);
  });

  it('expires_in があればそれを使う', async () => {
    const before = Date.now();
    const r = await exchangeGoogleCode(BASE, res({ access_token: 'at', expires_in: 60 }));
    expect(r.expiresAt).toBeLessThan(before + 3600 * 1000);
  });

  it('scope が無ければ空文字', async () => {
    expect((await exchangeGoogleCode(BASE, res({ access_token: 'at' }))).scope).toBe('');
  });

  it('scope が文字列でなければ空文字', async () => {
    expect((await exchangeGoogleCode(BASE, res({ access_token: 'at', scope: 7 }))).scope).toBe('');
  });

  it('refresh_token があれば含める', async () => {
    const r = await exchangeGoogleCode(BASE, res({ access_token: 'at', refresh_token: 'rt' }));
    expect(r.refreshToken).toBe('rt');
  });

  it('refresh_token が無ければ含めない', async () => {
    const r = await exchangeGoogleCode(BASE, res({ access_token: 'at' }));
    expect('refreshToken' in r).toBe(false);
  });

  it('refresh_token が文字列でなければ含めない', async () => {
    const r = await exchangeGoogleCode(BASE, res({ access_token: 'at', refresh_token: 99 }));
    expect('refreshToken' in r).toBe(false);
  });
});

describe('exchangeGoogleCode — 失敗応答', () => {
  const BASE = {
    code: 'c', verifier: 'v', expectedState: 's', receivedState: 's',
    clientId: 'id', redirectUri: 'http://localhost/cb',
  };
  const failing = (text: () => Promise<string>, status = 400) =>
    vi.fn<typeof fetch>().mockResolvedValue({ ok: false, status, text } as unknown as Response);

  it('状態コードを添えて投げる', async () => {
    await expect(exchangeGoogleCode(BASE, failing(async () => 'bad')))
      .rejects.toThrow('token exchange 400');
  });

  it('応答に混ざったトークンを秘匿する', async () => {
    const err = (await exchangeGoogleCode(BASE, failing(async () => 'Authorization: Bearer secret_abcdefghijklmnop'))
      .catch((e: unknown) => e)) as Error;
    expect(err.message).not.toContain('secret_abcdefghijklmnop');
  });

  it('本文は 200 文字までに切る', async () => {
    const err = (await exchangeGoogleCode(BASE, failing(async () => 'E'.repeat(500)))
      .catch((e: unknown) => e)) as Error;
    expect(err.message.slice(err.message.indexOf(': ') + 2).length).toBe(200);
  });

  it('本文が読めなくても投げる', async () => {
    const err = (await exchangeGoogleCode(BASE, failing(() => Promise.reject(new Error('x')), 502))
      .catch((e: unknown) => e)) as Error;
    expect(err.message).toBe('token exchange 502: ');
  });
});
