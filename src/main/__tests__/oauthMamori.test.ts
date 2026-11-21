import { afterEach, describe, expect, it, vi } from 'vitest';
import http from 'node:http';
import net from 'node:net';
import { rereadModule } from '../../shared/__tests__/rereadModule';
import { DEFAULT_HTTP_TIMEOUT_MS } from '../../shared/httpLimits';

/*
 * **oauth.mamori (MG-050) の変異検査が出した生存を、値ごと・振る舞いごとに留める。**
 * 既存の oauth.test.ts は「含む」「ある」で見ていたので、env 名・応答の字面・拒否の文面・
 * 閉じる時機・ブラウザを開けなかったときの片付けは素通りしていた。
 */
const openExternalMock = vi.fn(async (_url: string) => true);
vi.mock('electron', () => ({
  shell: { openExternal: (url: string) => openExternalMock(url) },
}));

const oauth = await import('../oauth');
const host = await import('../oauthHost');
const { decideCallbackReply, listenForCallback, authorize } = oauth;

const ENV_NAMES = [
  'GOOGLE_OAUTH_CLIENT_ID',
  'FREEE_OAUTH_CLIENT_ID',
  'MS365_OAUTH_CLIENT_ID',
  'SLACK_OAUTH_CLIENT_ID',
  'NOTION_OAUTH_CLIENT_ID',
  'NOTION_OAUTH_CLIENT_SECRET',
  'CANVA_OAUTH_CLIENT_ID',
  'CANVA_OAUTH_CLIENT_SECRET',
  'WPCOM_OAUTH_CLIENT_ID',
  'WPCOM_OAUTH_CLIENT_SECRET',
  'ATLASSIAN_OAUTH_CLIENT_ID',
  'ATLASSIAN_OAUTH_CLIENT_SECRET',
];

const EXPECTED_HTML =
  '<!doctype html><html><head><meta charset="utf-8"><title>Service Hub</title>\n'
  + '<style>body{font-family:system-ui;background:#0f1117;color:#e6e8ee;display:flex;align-items:center;justify-content:center;height:100vh;margin:0}\n'
  + '.box{text-align:center;padding:32px 48px;border:1px solid #232936;border-radius:12px;background:#161a22}\n'
  + 'h1{margin:0 0 8px;font-size:18px}p{margin:0;color:#8a93a6;font-size:13px}</style></head>\n'
  + '<body><div class="box"><h1>認証完了</h1><p>このタブは閉じて Service Hub に戻ってください。</p></div></body></html>';

function connectable(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const s = net.connect(port, '127.0.0.1');
    s.once('connect', () => {
      s.destroy();
      resolve(true);
    });
    s.once('error', () => resolve(false));
  });
}

function get(port: number, path: string): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    http
      .get({ host: '127.0.0.1', port, path }, (res) => {
        let body = '';
        res.setEncoding('utf8');
        res.on('data', (c: string) => (body += c));
        res.on('end', () => resolve({ status: res.statusCode ?? 0, body }));
      })
      .on('error', reject);
  });
}

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('OAUTH_CONFIGS の env 名', () => {
  it('★ 12 個の env 名がそれぞれ別の欄へ届く (名前を取り違えると別の値が入る)', async () => {
    const saved: Record<string, string | undefined> = {};
    for (const n of ENV_NAMES) {
      saved[n] = process.env[n];
      process.env[n] = `v:${n}`;
    }
    try {
      const mod = (await rereadModule<typeof import('../oauth')>(import.meta.url, '../oauth')) as unknown as {
        OAUTH_CONFIGS: Record<string, { clientId?: string; clientSecret?: string }>;
      };
      const seen = new Set<string>();
      for (const c of Object.values(mod.OAUTH_CONFIGS)) {
        if (c.clientId !== undefined) seen.add(c.clientId);
        if (c.clientSecret !== undefined) seen.add(c.clientSecret);
      }
      for (const n of ENV_NAMES) expect(seen.has(`v:${n}`), n).toBe(true);
    } finally {
      for (const n of ENV_NAMES) {
        if (saved[n] === undefined) delete process.env[n];
        else process.env[n] = saved[n];
      }
    }
  });
});

describe('decideCallbackReply: 応答の字面', () => {
  const H = '127.0.0.1:5000';
  it('★ 成功の応答は 200・text/html・本文は 1 字も違わない・終端で code / state を運ぶ', async () => {
    // CALLBACK_HTML はモジュール直下の定数 —— 読み直したモジュールで評価し直す (static 変異体は読み込み時にしか効かない)。
    const fresh = (await rereadModule<typeof import('../oauth')>(import.meta.url, '../oauth')) as unknown as {
      decideCallbackReply: typeof decideCallbackReply;
    };
    const r = fresh.decideCallbackReply(H, '/oauth/callback?code=C1&state=S1', 'S1');
    expect(r).toEqual({
      status: 200,
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
      body: EXPECTED_HTML,
      done: true,
      code: 'C1',
      state: 'S1',
    });
  });

  it('★ プロバイダのエラーは終端・理由を拒否の文に載せ、本文は映して返す', () => {
    const r = decideCallbackReply(H, '/oauth/callback?error=access_denied&state=S1', 'S1');
    expect(r).toEqual({
      status: 400,
      headers: { 'Content-Type': 'text/plain; charset=utf-8', 'X-Content-Type-Options': 'nosniff' },
      body: 'OAuth error: access_denied',
      done: true,
      message: 'OAuth provider returned error: access_denied',
    });
  });

  it('★ code の無い正規の戻りは終端の 400', () => {
    expect(decideCallbackReply(H, '/oauth/callback?state=S1', 'S1')).toEqual({
      status: 400,
      body: 'missing code',
      done: true,
      message: 'OAuth callback missing code',
    });
  });

  it('★ 迷い要求は終端にしない (別の host・別のパス・state 違い・解析できない request-target)', () => {
    expect(decideCallbackReply('evil.example', '/oauth/callback', 'S1')).toEqual({
      status: 400,
      headers: { 'Content-Type': 'text/plain' },
      body: 'bad host',
      done: false,
    });
    expect(decideCallbackReply(H, '/favicon.ico', 'S1')).toEqual({ status: 404, done: false });
    expect(decideCallbackReply(H, '/oauth/callback?code=c&state=zzz', 'S1')).toEqual({
      status: 400,
      body: 'state mismatch',
      done: false,
    });
    expect(decideCallbackReply(H, 'http://[', 'S1')).toEqual({ status: 400, body: 'bad request', done: false });
  });

  it('★ request-target が無いとき ("/" 扱い) も落ちずに 404 を返す', () => {
    expect(decideCallbackReply(H, undefined, 'S1')).toEqual({ status: 404, done: false });
  });
});

describe('listenForCallback: 実物の待受', () => {
  it('★ 成功したら解決し、50 ms ほど後に待受を閉じる (閉じる前は繋がる)', async () => {
    const l = listenForCallback('S', 10_000);
    const port = await l.port();
    const res = await get(port, '/oauth/callback?code=CODE&state=S');
    expect(res.status).toBe(200);
    expect(res.body).toBe(EXPECTED_HTML);
    await expect(l).resolves.toEqual({ code: 'CODE', state: 'S' });
    await sleep(300);
    expect(await connectable(port)).toBe(false);
  });

  it('★ プロバイダのエラーは拒否の文で拒否し、待受を閉じる', async () => {
    const l = listenForCallback('S', 10_000);
    const port = await l.port();
    const p = l.catch((e: Error) => e);
    await get(port, '/oauth/callback?error=nope&state=S');
    expect(((await p) as Error).message).toBe('OAuth provider returned error: nope');
    await sleep(300);
    expect(await connectable(port)).toBe(false);
  });

  it('★ code が無ければ拒否の文で拒否する', async () => {
    const l = listenForCallback('S', 10_000);
    const port = await l.port();
    const p = l.catch((e: Error) => e);
    await get(port, '/oauth/callback?state=S');
    expect(((await p) as Error).message).toBe('OAuth callback missing code');
  });

  it('★ cancel() は取り消しの文で拒否し、その場で待受を閉じる', async () => {
    const l = listenForCallback('S', 10_000);
    const port = await l.port();
    const p = l.catch((e: Error) => e);
    l.cancel();
    expect(((await p) as Error).message).toBe('OAuth flow cancelled');
    await sleep(100);
    expect(await connectable(port)).toBe(false);
  });

  it('★ 時間切れは秒数つきの文で拒否し、待受を閉じる', async () => {
    const l = listenForCallback('S', 1500);
    const port = await l.port();
    const p = l.catch((e: Error) => e);
    expect(((await p) as Error).message).toBe('OAuth flow timed out after 2s');
    await sleep(100);
    expect(await connectable(port)).toBe(false);
  });

  it('★ 解決した後は時間切れの timer が残らない (clearTimeout が効く)', async () => {
    const clear = vi.spyOn(globalThis, 'clearTimeout');
    const l = listenForCallback('S', 60_000);
    const port = await l.port();
    await get(port, '/oauth/callback?code=c&state=S');
    await l;
    await sleep(20);
    expect(clear).toHaveBeenCalled();
  });
});

describe('oauthHost の薄い口', () => {
  it('★ server の error は port() も本体も同じ error で拒否する', async () => {
    const boom = new Error('listen EADDRINUSE');
    const handlers: Record<string, (e: Error) => void> = {};
    const fake = {
      on: (ev: string, fn: (e: Error) => void) => {
        handlers[ev] = fn;
        return fake;
      },
      listen: () => fake,
      close: () => fake,
    };
    vi.spyOn(http, 'createServer').mockReturnValue(fake as unknown as http.Server);
    const l = host.hostListenForCallback(() => ({ status: 200, done: false }), 10_000, 't', 'c');
    const a = l.catch((e: Error) => e);
    const b = l.port().catch((e: Error) => e);
    expect(Object.keys(handlers)).toEqual(['error']);
    handlers['error']?.(boom);
    expect(await a).toBe(boom);
    expect(await b).toBe(boom);
    l.cancel();
  });

  it('★ hostFetch は呼ぶ時点の fetch を、転送に追随しない init で呼ぶ', async () => {
    const f = vi.fn(async () => new Response('ok'));
    vi.stubGlobal('fetch', f);
    try {
      await host.hostFetch('https://example.com/x', { method: 'POST', body: 'b' });
      expect(f).toHaveBeenCalledTimes(1);
      expect(f).toHaveBeenCalledWith('https://example.com/x', { method: 'POST', body: 'b', redirect: 'manual' });
      await host.hostFetch('https://example.com/y');
      expect(f).toHaveBeenLastCalledWith('https://example.com/y', { redirect: 'manual' });
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('★ hostWithTimeout は run の結果を返し、通常の HTTP の締切で signal を中止する', async () => {
    await expect(host.hostWithTimeout(async () => 42)).resolves.toBe(42);
    vi.useFakeTimers();
    let aborted = false;
    const p = host
      .hostWithTimeout(
        (signal) =>
          new Promise<never>((_res, rej) => {
            signal.addEventListener('abort', () => {
              aborted = true;
              rej(new Error('aborted'));
            });
          }),
      )
      .catch((e: Error) => e);
    await vi.advanceTimersByTimeAsync(DEFAULT_HTTP_TIMEOUT_MS - 1);
    expect(aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(2);
    expect(aborted).toBe(true);
    await p;
  });

  it('★ hostUtf8Base64 / hostBase64 / hostSha256 は決まった値を返す', () => {
    expect(host.hostUtf8Base64('a:b')).toBe('YTpi');
    expect(host.hostUtf8Base64('あ')).toBe('44GC');
    expect(host.hostBase64(new Uint8Array([251, 255]))).toBe('+/8=');
    expect(Buffer.from(host.hostSha256('abc')).toString('hex')).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
    expect(host.hostRandomBytes(7)).toHaveLength(7);
    expect(host.hostSearchParams({ a: '1', b: '2' }).toString()).toBe('a=1&b=2');
    expect(host.hostEnv('__NOPE_NOT_SET__')).toBe('');
    expect(Math.abs(host.hostNow() - Date.now())).toBeLessThan(1000);
  });
});

describe('authorize: ブラウザを開けなかったとき', () => {
  it('★ T-139: openExternal が拒否したら待受を閉じ、同じ error で拒否する', async () => {
    const servers: http.Server[] = [];
    const orig = http.createServer.bind(http);
    vi.spyOn(http, 'createServer').mockImplementation(((...a: unknown[]) => {
      const s = (orig as (...x: unknown[]) => http.Server)(...a);
      servers.push(s);
      return s;
    }) as typeof http.createServer);
    const boom = new Error('no browser');
    openExternalMock.mockClear();
    openExternalMock.mockRejectedValueOnce(boom);
    const cfg = {
      authorizeUrl: 'https://accounts.example.com/auth',
      tokenUrl: 'https://oauth2.example.com/token',
      clientId: 'cid',
      scopes: ['a'],
    } as Parameters<typeof authorize>[0];
    const f = vi.fn<typeof fetch>();
    await expect(authorize(cfg, f)).rejects.toBe(boom);
    expect(f).not.toHaveBeenCalled();
    expect(servers).toHaveLength(1);
    await sleep(50);
    expect(servers[0]?.listening).toBe(false);
  });
});
