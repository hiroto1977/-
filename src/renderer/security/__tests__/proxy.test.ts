/** @vitest-environment jsdom */
import { describe, expect, it, beforeEach, vi } from 'vitest';
import 'fake-indexeddb/auto';
import {
  fetchViaProxy,
  getProxyConfig,
  inspectStoredProxyConfig,
  setProxyConfig,
  isPrivateOrReservedTarget,
  MAX_PROXY_RESPONSE_BYTES,
} from '../../network/proxy';

function clearIdb(): Promise<void> {
  return new Promise((resolve) => {
    const req = indexedDB.deleteDatabase('business-hub-preferences');
    req.onsuccess = () => resolve();
    req.onerror = () => resolve();
    req.onblocked = () => resolve();
  });
}

beforeEach(async () => {
  await clearIdb();
});

/**
 * 検証を通さずに IndexedDB へ直に書く。
 *
 * 「検証が緩かった頃に保存された値」「別経路で書かれた値」を再現するため。
 * setProxyConfig 経由では今の規則を通ったものしか入らないので、
 * 読み出し側の検証はこの入口でしか試せない。
 */
function putRawProxyConfig(value: unknown): Promise<void> {
  return new Promise((resolve, reject) => {
    const open = indexedDB.open('business-hub-preferences', 1);
    open.onupgradeneeded = () => {
      const db = open.result;
      if (!db.objectStoreNames.contains('kv')) db.createObjectStore('kv');
    };
    open.onsuccess = () => {
      const db = open.result;
      const tx = db.transaction('kv', 'readwrite');
      tx.objectStore('kv').put(value, 'proxy');
      tx.oncomplete = () => {
        db.close();
        resolve();
      };
      tx.onerror = () => {
        db.close();
        reject(tx.error ?? new Error('put failed'));
      };
    };
    open.onerror = () => reject(open.error ?? new Error('open failed'));
  });
}

describe('保存済み設定は読み出しのたびに検証する', () => {
  // 検証を書き込み側にしか置かないと、緩かった頃の値がそのまま
  // 資格情報の送り先になる。読み出し側でも同じ規則を通す。
  it('loopback 以外への平文 http は、保存されていても使わない', async () => {
    await putRawProxyConfig({ url: 'http://evil.example.com/p' });
    expect(await getProxyConfig()).toBeNull();
    const seen = await inspectStoredProxyConfig();
    expect(seen.config).toBeNull();
    expect(seen.rejected).toBe('insecure-remote');
  });

  it('loopback の平文 http は保存されていれば使う', async () => {
    await putRawProxyConfig({ url: 'http://127.0.0.1:8787/' });
    expect((await getProxyConfig())?.url).toBe('http://127.0.0.1:8787/');
  });

  it('userinfo 付き・制御文字入り・非 http は使わない', async () => {
    for (const [url, reason] of [
      ['https://u:p@evil.example.com/', 'has-userinfo'],
      ['https://w.example.com/\u0000', 'control-char'],
      ['javascript:alert(1)', 'not-http'],
      ['https://w.example.com/#f', 'has-fragment'],
    ] as const) {
      await putRawProxyConfig({ url });
      const seen = await inspectStoredProxyConfig();
      expect(seen.config, url).toBeNull();
      expect(seen.rejected, url).toBe(reason);
    }
  });

  it('URL 以外の形が入っていても落ちない', async () => {
    for (const v of [{}, { url: 42 }, { url: null }, 'nonsense', 7]) {
      await putRawProxyConfig(v);
      const seen = await inspectStoredProxyConfig();
      expect(seen.config, JSON.stringify(v)).toBeNull();
      expect(seen.rejected, JSON.stringify(v)).not.toBeNull();
    }
  });

  it('長すぎる共有秘密が保存されていても使わない', async () => {
    await putRawProxyConfig({ url: 'https://w.example.com/p', sharedSecret: 'x'.repeat(257) });
    expect(await getProxyConfig()).toBeNull();
  });

  it('妥当な設定はそのまま使える（この検証で普通の設定を壊さない）', async () => {
    await putRawProxyConfig({ url: 'https://w.example.com/p', sharedSecret: 'shh' });
    const got = await getProxyConfig();
    expect(got?.url).toBe('https://w.example.com/p');
    expect(got?.sharedSecret).toBe('shh');
  });
});

describe('ProxyConfig persistence', () => {
  it('returns null when no config is set', async () => {
    expect(await getProxyConfig()).toBeNull();
  });

  it('round-trips a config', async () => {
    await setProxyConfig({ url: 'https://my-worker.example.com/proxy' });
    const got = await getProxyConfig();
    expect(got?.url).toBe('https://my-worker.example.com/proxy');
  });

  it('clears config when set to null', async () => {
    await setProxyConfig({ url: 'https://x.example.com' });
    await setProxyConfig(null);
    expect(await getProxyConfig()).toBeNull();
  });

  it('closes the IndexedDB connection even when a read/write fails (no leak)', async () => {
    await setProxyConfig({ url: 'https://example.com/p' }); // ストア作成
    const closeSpy = vi.spyOn(IDBDatabase.prototype, 'close');
    const txSpy = vi.spyOn(IDBDatabase.prototype, 'transaction').mockImplementation(() => {
      throw new Error('tx boom');
    });
    await expect(getProxyConfig()).rejects.toThrow('tx boom');
    await expect(setProxyConfig({ url: 'https://example.com/q' })).rejects.toThrow('tx boom');
    // finally で各操作とも db.close() される (リーク無し)。
    expect(closeSpy).toHaveBeenCalledTimes(2);
    txSpy.mockRestore();
    closeSpy.mockRestore();
  });

  it('rejects non-http(s) URLs', async () => {
    await expect(setProxyConfig({ url: 'ftp://x.com' })).rejects.toThrow(/http\(s\)/);
    await expect(setProxyConfig({ url: 'javascript:alert(1)' } as { url: string })).rejects.toThrow();
  });

  it('rejects empty URL', async () => {
    await expect(setProxyConfig({ url: '' })).rejects.toThrow(/不正/);
  });

  it('正規化した URL を保存する（検証した文字列と保存する文字列を一致させる）', async () => {
    await setProxyConfig({ url: '  HTTPS://W.EXAMPLE.COM  ' });
    expect((await getProxyConfig())?.url).toBe('https://w.example.com/');
  });

  it('loopback 以外への平文 http は保存させない（トークンが乗る宛先のため）', async () => {
    await expect(setProxyConfig({ url: 'http://evil.example.com/p' })).rejects.toThrow(/平文/);
    expect(await getProxyConfig()).toBeNull();
  });

  it('loopback の平文 http は保存できる（wrangler dev）', async () => {
    await setProxyConfig({ url: 'http://localhost:8787/proxy' });
    expect((await getProxyConfig())?.url).toBe('http://localhost:8787/proxy');
  });

  it('userinfo 付き・断片付きは保存させない', async () => {
    await expect(setProxyConfig({ url: 'https://u:p@w.example.com/' })).rejects.toThrow(/ユーザー名/);
    await expect(setProxyConfig({ url: 'https://w.example.com/#f' })).rejects.toThrow(/#/);
  });

  it('rejects oversize shared secret', async () => {
    await expect(setProxyConfig({ url: 'https://x.com', sharedSecret: 'x'.repeat(257) })).rejects.toThrow(/共有秘密/);
  });
});

describe('fetchViaProxy', () => {
  // Envelope helper — readWithCap reads text(), so we put the JSON envelope there.
  function envelope(body: { status: number; headers?: Record<string, string>; body?: string }): Response {
    return {
      ok: true,
      status: 200,
      headers: new Headers(),
      body: null,
      async text() { return JSON.stringify(body); },
      async json() { return body; },
    } as unknown as Response;
  }

  /*
   * **呼び出し側の signal を捨てない。**
   *
   * 2026-08-22 まで `fetchViaProxy` は `init` から url / method / headers /
   * body だけを取り出しており、`signal` は envelope にも下の fetch にも
   * 渡っていなかった。呼び出し側 (`runAiChat`) が timeout を付けても、
   * **プロキシ経由の道だけ効かない** —— 「守っているつもりの守り」になる。
   */
  it('呼び出し側の signal を実際の fetch へ中継する', async () => {
    let seen: AbortSignal | null | undefined;
    const mockFetch = vi.fn<typeof fetch>(async (_u, init) => {
      seen = (init as RequestInit).signal;
      return envelope({ status: 200, body: '{}' });
    });
    globalThis.fetch = mockFetch;

    const controller = new AbortController();
    await fetchViaProxy(
      'https://api.notion.com/v1/x',
      { method: 'POST', signal: controller.signal },
      { url: 'https://my-worker.example.com/proxy' },
    );
    expect(seen, 'signal が捨てられている (timeout が効かない)').toBe(controller.signal);
  });

  it('signal を渡さない呼び出しでも壊れない', async () => {
    const mockFetch = vi.fn<typeof fetch>(async (_u, init) => {
      expect((init as RequestInit).signal).toBeUndefined();
      return envelope({ status: 200, body: '{}' });
    });
    globalThis.fetch = mockFetch;
    await expect(
      fetchViaProxy(
        'https://api.notion.com/v1/x',
        { method: 'GET' },
        { url: 'https://my-worker.example.com/proxy' },
      ),
    ).resolves.toBeDefined();
  });

  it('wraps target URL + method + headers + body in JSON envelope', async () => {
    const mockFetch = vi.fn<typeof fetch>().mockResolvedValue(
      envelope({ status: 200, headers: { 'content-type': 'application/json' }, body: '{"ok":true}' }),
    );
    globalThis.fetch = mockFetch;

    const res = await fetchViaProxy(
      'https://api.notion.com/v1/databases/123',
      { method: 'POST', headers: { Authorization: 'Bearer secret_xxx' }, body: '{"q":"x"}' },
      { url: 'https://my-worker.example.com/proxy' },
    );
    expect(res.status).toBe(200);
    expect(await res.text()).toBe('{"ok":true}');

    expect(mockFetch).toHaveBeenCalledOnce();
    const init = mockFetch.mock.calls[0]![1]!;
    const env = JSON.parse(init.body as string) as { url: string; method: string; headers: Record<string, string> };
    expect(env.url).toBe('https://api.notion.com/v1/databases/123');
    expect(env.method).toBe('POST');
    expect(env.headers.Authorization).toBe('Bearer secret_xxx');
  });

  it('forwards the NORMALIZED url, not the raw input (parser-differential SSRF)', async () => {
    // A backslash-authority URL parses to hostname `public.com` under WHATWG
    // (so the guard allows it) but a proxy with a non-WHATWG parser could read
    // the authority as 169.254.169.254. Sending `parsed.href` removes the
    // ambiguity: the proxy receives the same target the guard validated.
    const mockFetch = vi.fn<typeof fetch>().mockResolvedValue(envelope({ status: 200, body: '' }));
    globalThis.fetch = mockFetch;

    const raw = 'https://public.example.com\\@169.254.169.254/latest/meta-data/';
    await fetchViaProxy(raw, { method: 'GET' }, { url: 'https://my-worker.example.com/proxy' });

    const init = mockFetch.mock.calls[0]![1]!;
    const env = JSON.parse(init.body as string) as { url: string };
    expect(env.url).toBe(new URL(raw).href);
    expect(env.url).not.toBe(raw);
    expect(env.url).not.toContain('\\');
    expect(new URL(env.url).hostname).toBe('public.example.com');
  });

  it('forwards shared secret as X-Proxy-Auth header', async () => {
    const mockFetch = vi.fn<typeof fetch>().mockResolvedValue(
      envelope({ status: 200, body: '' }),
    );
    globalThis.fetch = mockFetch;

    await fetchViaProxy(
      'https://api.notion.com/v1/...',
      { method: 'GET' },
      { url: 'https://x.example.com', sharedSecret: 'shh' },
    );
    const init = mockFetch.mock.calls[0]![1]!;
    const headers = init.headers as Record<string, string>;
    expect(headers['x-proxy-auth']).toBe('shh');
  });

  it('cfg.url も信用しない（保存経路を通らない呼び出しがありうる）', async () => {
    await expect(
      fetchViaProxy('https://api.notion.com/v1/x', { method: 'GET' }, { url: 'http://evil.example.com/p' }),
    ).rejects.toThrow(/平文/);
    await expect(
      fetchViaProxy('https://api.notion.com/v1/x', { method: 'GET' }, { url: 'javascript:alert(1)' }),
    ).rejects.toThrow(/http\(s\)/);
  });

  it('送るのは正規化した proxy URL', async () => {
    const mockFetch = vi.fn<typeof fetch>().mockResolvedValue(envelope({ status: 200, body: '' }));
    globalThis.fetch = mockFetch;
    await fetchViaProxy('https://api.notion.com/v1/x', { method: 'GET' }, { url: 'HTTPS://W.EXAMPLE.COM' });
    expect(mockFetch.mock.calls[0]![0]).toBe('https://w.example.com/');
  });

  it('rejects bad target URL', async () => {
    await expect(
      fetchViaProxy('not-a-url', { method: 'GET' }, { url: 'https://x.com' }),
    ).rejects.toThrow(/形式が不正/);
  });

  it('rejects non-http(s) target', async () => {
    await expect(
      fetchViaProxy('file:///etc/passwd', { method: 'GET' }, { url: 'https://x.com' }),
    ).rejects.toThrow(/http\(s\)/);
  });

  it('rejects SSRF targets — cloud metadata endpoint', async () => {
    await expect(
      fetchViaProxy('http://169.254.169.254/latest/meta-data/', { method: 'GET' }, { url: 'https://x.com' }),
    ).rejects.toThrow(/プライベート \/ 予約アドレス/);
  });

  it('rejects SSRF targets — IPv4 loopback', async () => {
    await expect(
      fetchViaProxy('http://127.0.0.1:8080/admin', { method: 'GET' }, { url: 'https://x.com' }),
    ).rejects.toThrow(/プライベート \/ 予約アドレス/);
  });

  it('rejects SSRF targets — RFC1918 (10.x, 172.16-31.x, 192.168.x)', async () => {
    for (const host of ['http://10.0.0.1/', 'http://172.16.0.1/', 'http://192.168.1.1/']) {
      await expect(
        fetchViaProxy(host, { method: 'GET' }, { url: 'https://x.com' }),
      ).rejects.toThrow(/プライベート \/ 予約アドレス/);
    }
  });

  it('rejects SSRF targets — IPv6 loopback + ULA + link-local', async () => {
    for (const host of ['http://[::1]/', 'http://[fc00::1]/', 'http://[fe80::1]/']) {
      await expect(
        fetchViaProxy(host, { method: 'GET' }, { url: 'https://x.com' }),
      ).rejects.toThrow(/プライベート \/ 予約アドレス/);
    }
  });

  it('rejects SSRF targets — localhost / .local / .internal', async () => {
    for (const host of [
      'http://localhost/',
      'http://my-host.local/',
      'https://api.internal/',
      'https://jira.lan/',
      'http://metadata.google.internal/',
    ]) {
      await expect(
        fetchViaProxy(host, { method: 'GET' }, { url: 'https://x.com' }),
      ).rejects.toThrow(/プライベート \/ 予約アドレス/);
    }
  });

  it('tolerates malformed negative Content-Length and still reads body (Round 2 SHOULD-FIX S-2)', async () => {
    // A buggy / malicious proxy returns Content-Length: -1. The previous gate
    // (`cl > MAX_PROXY_RESPONSE_BYTES`) accepted it because -1 is finite and
    // smaller than the cap; the stream-level `readWithCap` is then the
    // ultimate authority. Verify the call still succeeds end-to-end.
    const envBody = JSON.stringify({ status: 200, body: '{"ok":true}' });
    const mockFetch = vi.fn<typeof fetch>().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ 'content-length': '-1' }),
      body: null,
      async text() { return envBody; },
      async json() { return JSON.parse(envBody); },
    } as unknown as Response);
    globalThis.fetch = mockFetch;
    const res = await fetchViaProxy(
      'https://api.notion.com/v1/x', { method: 'GET' }, { url: 'https://x.com' },
    );
    expect(res.status).toBe(200);
    expect(await res.text()).toBe('{"ok":true}');
  });

  it('caps proxy response size at MAX_PROXY_RESPONSE_BYTES', async () => {
    const huge = 'x'.repeat(MAX_PROXY_RESPONSE_BYTES + 1);
    const mockFetch = vi.fn<typeof fetch>().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ 'content-length': String(huge.length) }),
      body: null,
      async text() { return huge; },
      async json() { return {}; },
    } as unknown as Response);
    globalThis.fetch = mockFetch;
    await expect(
      fetchViaProxy('https://api.notion.com/v1/x', { method: 'GET' }, { url: 'https://x.com' }),
    ).rejects.toThrow(/too large/);
  });

  it('reads response body via streaming reader when body is available', async () => {
    // Exercise the ReadableStream branch of readWithCap (the chunks loop
    // + concat + UTF-8 decode). This is what real browser fetch returns;
    // earlier tests use `body: null` to fall back to .text() — that left
    // the stream-reading code path uncovered by mutation testing.
    const envBody = JSON.stringify({ status: 200, body: '{"streamed":true}' });
    const encoder = new TextEncoder();
    const chunks = [encoder.encode(envBody.slice(0, 10)), encoder.encode(envBody.slice(10))];
    const mockFetch = vi.fn<typeof fetch>().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers(),
      body: new ReadableStream({
        start(controller) {
          for (const c of chunks) controller.enqueue(c);
          controller.close();
        },
      }),
      async text() { return envBody; },
    } as unknown as Response);
    globalThis.fetch = mockFetch;
    const res = await fetchViaProxy(
      'https://api.notion.com/v1/x', { method: 'GET' }, { url: 'https://x.com' },
    );
    expect(res.status).toBe(200);
    expect(await res.text()).toBe('{"streamed":true}');
  });

  it('aborts mid-stream when total byte count exceeds cap', async () => {
    // Stream-reader cap check — emit chunks totaling > MAX bytes.
    const half = Math.ceil(MAX_PROXY_RESPONSE_BYTES / 2) + 1;
    const mockFetch = vi.fn<typeof fetch>().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers(),
      body: new ReadableStream({
        start(controller) {
          controller.enqueue(new Uint8Array(half));
          controller.enqueue(new Uint8Array(half));
          controller.close();
        },
      }),
    } as unknown as Response);
    globalThis.fetch = mockFetch;
    await expect(
      fetchViaProxy('https://api.notion.com/v1/x', { method: 'GET' }, { url: 'https://x.com' }),
    ).rejects.toThrow(/too large/);
  });

  it('handles proxy response where headers object is undefined', async () => {
    // Mock without headers at all — readWithCap should not crash on the
    // `proxyRes.headers?.get?.('content-length')` access. This kills the
    // OptionalChaining mutation on the headers lookup.
    const envBody = JSON.stringify({ status: 200, body: '{"ok":true}' });
    const mockFetch = vi.fn<typeof fetch>().mockResolvedValue({
      ok: true,
      status: 200,
      // No `headers` field at all.
      body: null,
      async text() { return envBody; },
    } as unknown as Response);
    globalThis.fetch = mockFetch;
    const res = await fetchViaProxy(
      'https://api.notion.com/v1/x', { method: 'GET' }, { url: 'https://x.com' },
    );
    expect(res.status).toBe(200);
  });

  it('handles proxy response where headers exists but lacks a .get() method', async () => {
    // Non-standard / shimmed Response where `headers` is a plain object
    // without `get`. The second `?.` in `proxyRes.headers?.get?.(...)`
    // must guard this — otherwise we'd crash on `headers.get is not a
    // function`. Kills the OptionalChaining mutation on `.get?.`.
    const envBody = JSON.stringify({ status: 200, body: '{"ok":true}' });
    const mockFetch = vi.fn<typeof fetch>().mockResolvedValue({
      ok: true,
      status: 200,
      headers: {} as unknown as Headers, // truthy but `.get` undefined
      body: null,
      async text() { return envBody; },
    } as unknown as Response);
    globalThis.fetch = mockFetch;
    const res = await fetchViaProxy(
      'https://api.notion.com/v1/x', { method: 'GET' }, { url: 'https://x.com' },
    );
    expect(res.status).toBe(200);
  });

  it('propagates proxy error response', async () => {
    const mockFetch = vi.fn<typeof fetch>().mockResolvedValue({
      ok: false,
      status: 502,
      async text() { return 'bad gateway'; },
      async json() { return {}; },
    } as unknown as Response);
    globalThis.fetch = mockFetch;
    await expect(
      fetchViaProxy('https://api.notion.com/v1/x', { method: 'GET' }, { url: 'https://x.com' }),
    ).rejects.toThrow(/proxy 502/);
  });

  it('redacts tokens reflected in a proxy error body', async () => {
    const mockFetch = vi.fn<typeof fetch>().mockResolvedValue({
      ok: false,
      status: 500,
      async text() { return 'forwarded Authorization: Bearer secret_abcdefghij failed'; },
      async json() { return {}; },
    } as unknown as Response);
    globalThis.fetch = mockFetch;
    const err = await fetchViaProxy('https://api.notion.com/v1/x', { method: 'GET' }, { url: 'https://x.com' })
      .catch((e: unknown) => (e instanceof Error ? e.message : String(e)));
    expect(err).not.toContain('secret_abcdefghij');
    expect(err).toContain('[REDACTED]');
  });
});

// ===== 明言している 3 つの防御が本当に効いているか (2026-08 変異検査) =====
//
// proxy.ts の冒頭は防御を 3 つ挙げている:
//   (a) SSRF 宛先ブロック  (b) レスポンスサイズ上限  (c) redactSecrets による秘匿
//
// ファイル全体が `Stryker disable` されていたため測られておらず、実測すると
// **(b) は丸ごと消しても・(c) は素通しにしても、どのテストも落ちなかった**。
// 書いてある防御が効いている証拠が無い状態だった。
describe('明言している防御 — サイズ上限と秘匿 (Round 5)', () => {
  function envelopeRes(over: Partial<{ ok: boolean; status: number; headers: Headers; text: () => Promise<string> }>): Response {
    return {
      ok: true,
      status: 200,
      headers: new Headers(),
      body: null,
      async text() { return JSON.stringify({ status: 200, body: '{}' }); },
      ...over,
    } as unknown as Response;
  }
  const CFG = { url: 'https://my-worker.example.com/proxy' };
  const TARGET = 'https://api.notion.com/v1/x';

  // --- (b) レスポンスサイズ上限 -----------------------------------------

  it('Content-Length が上限を超えたら送信内容を読まずに失敗する', async () => {
    globalThis.fetch = vi.fn<typeof fetch>().mockResolvedValue(envelopeRes({
      headers: new Headers({ 'content-length': String(MAX_PROXY_RESPONSE_BYTES + 1) }),
    }));
    await expect(fetchViaProxy(TARGET, {}, CFG)).rejects.toThrow('proxy response too large');
  });

  it('上限ちょうどは通す (境界)', async () => {
    globalThis.fetch = vi.fn<typeof fetch>().mockResolvedValue(envelopeRes({
      headers: new Headers({ 'content-length': String(MAX_PROXY_RESPONSE_BYTES) }),
    }));
    await expect(fetchViaProxy(TARGET, {}, CFG)).resolves.toBeDefined();
  });

  it('負の Content-Length は無視して読み進む (finite かつ上限以下でも素通りさせない)', async () => {
    globalThis.fetch = vi.fn<typeof fetch>().mockResolvedValue(envelopeRes({
      headers: new Headers({ 'content-length': '-1' }),
    }));
    await expect(fetchViaProxy(TARGET, {}, CFG)).resolves.toBeDefined();
  });

  it('Content-Length が数値でなければ無視して読み進む', async () => {
    globalThis.fetch = vi.fn<typeof fetch>().mockResolvedValue(envelopeRes({
      headers: new Headers({ 'content-length': 'abc' }),
    }));
    await expect(fetchViaProxy(TARGET, {}, CFG)).resolves.toBeDefined();
  });

  // --- (c) エラー本文の秘匿 ---------------------------------------------

  it('プロキシのエラー本文に混ざったトークンを秘匿する', async () => {
    // 壊れた / 悪意あるプロキシは、転送したリクエストをそのままエラー本文に
    // 反射しうる。Authorization ヘッダーごと画面やログに出さない。
    globalThis.fetch = vi.fn<typeof fetch>().mockResolvedValue(envelopeRes({
      ok: false,
      status: 500,
      async text() { return 'upstream said: Authorization: Bearer secret_abcdefghijklmnop'; },
    }));
    const err = (await fetchViaProxy(TARGET, {}, CFG).catch((e: unknown) => e)) as Error;
    expect(err.message).toContain('proxy 500');
    expect(err.message).not.toContain('secret_abcdefghijklmnop');
  });

  it('エラー本文が読めなくても投げる (text() の失敗で握り潰さない)', async () => {
    globalThis.fetch = vi.fn<typeof fetch>().mockResolvedValue(envelopeRes({
      ok: false,
      status: 502,
      text() { return Promise.reject(new Error('stream broken')); },
    }));
    const err = (await fetchViaProxy(TARGET, {}, CFG).catch((e: unknown) => e)) as Error;
    // 本文が読めなければ空文字を入れる — 読めなかったことを何かの文字列で
    // 埋めない (プロキシが言っていないことを言ったことにしない)。
    expect(err.message).toBe('proxy 502: ');
  });

  // --- 共有シークレット --------------------------------------------------

  it('共有シークレットがあれば x-proxy-auth を付ける', async () => {
    const mockFetch = vi.fn<typeof fetch>().mockResolvedValue(envelopeRes({}));
    globalThis.fetch = mockFetch;
    await fetchViaProxy(TARGET, {}, { ...CFG, sharedSecret: 's3cret' });
    const headers = mockFetch.mock.calls[0]![1]!.headers as Record<string, string>;
    expect(headers['x-proxy-auth']).toBe('s3cret');
  });

  it('共有シークレットが無ければ x-proxy-auth を付けない', async () => {
    const mockFetch = vi.fn<typeof fetch>().mockResolvedValue(envelopeRes({}));
    globalThis.fetch = mockFetch;
    await fetchViaProxy(TARGET, {}, CFG);
    const headers = mockFetch.mock.calls[0]![1]!.headers as Record<string, string>;
    expect(headers['x-proxy-auth']).toBeUndefined();
  });

  it('共有シークレットが空文字なら付けない (長さを見ている)', async () => {
    const mockFetch = vi.fn<typeof fetch>().mockResolvedValue(envelopeRes({}));
    globalThis.fetch = mockFetch;
    await fetchViaProxy(TARGET, {}, { ...CFG, sharedSecret: '' });
    const headers = mockFetch.mock.calls[0]![1]!.headers as Record<string, string>;
    expect(headers['x-proxy-auth']).toBeUndefined();
  });

  it('プロキシへは常に POST + content-type: application/json で送る', async () => {
    const mockFetch = vi.fn<typeof fetch>().mockResolvedValue(envelopeRes({}));
    globalThis.fetch = mockFetch;
    await fetchViaProxy(TARGET, {}, CFG);
    const init = mockFetch.mock.calls[0]![1]!;
    expect(init.method).toBe('POST');
    expect((init.headers as Record<string, string>)['content-type']).toBe('application/json');
  });

  // --- 入口の検証 --------------------------------------------------------

  it('target URL が空文字なら送らない', async () => {
    const mockFetch = vi.fn<typeof fetch>().mockResolvedValue(envelopeRes({}));
    globalThis.fetch = mockFetch;
    await expect(fetchViaProxy('', {}, CFG)).rejects.toThrow('target URL is required');
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('target URL が文字列でなければ送らない', async () => {
    const mockFetch = vi.fn<typeof fetch>().mockResolvedValue(envelopeRes({}));
    globalThis.fetch = mockFetch;
    await expect(fetchViaProxy(undefined as unknown as string, {}, CFG)).rejects.toThrow('target URL is required');
    expect(mockFetch).not.toHaveBeenCalled();
  });

  // --- ヘッダーの 3 形式 -------------------------------------------------

  it('Headers インスタンスのヘッダーを封筒へ移す', async () => {
    const mockFetch = vi.fn<typeof fetch>().mockResolvedValue(envelopeRes({}));
    globalThis.fetch = mockFetch;
    await fetchViaProxy(TARGET, { headers: new Headers({ 'x-a': '1' }) }, CFG);
    const env = JSON.parse(mockFetch.mock.calls[0]![1]!.body as string) as { headers: Record<string, string> };
    expect(env.headers['x-a']).toBe('1');
  });

  it('配列形式のヘッダーを封筒へ移す', async () => {
    const mockFetch = vi.fn<typeof fetch>().mockResolvedValue(envelopeRes({}));
    globalThis.fetch = mockFetch;
    await fetchViaProxy(TARGET, { headers: [['x-b', '2']] }, CFG);
    const env = JSON.parse(mockFetch.mock.calls[0]![1]!.body as string) as { headers: Record<string, string> };
    expect(env.headers['x-b']).toBe('2');
  });

  it('ヘッダーを渡さなければ空のまま送る', async () => {
    const mockFetch = vi.fn<typeof fetch>().mockResolvedValue(envelopeRes({}));
    globalThis.fetch = mockFetch;
    await fetchViaProxy(TARGET, {}, CFG);
    const env = JSON.parse(mockFetch.mock.calls[0]![1]!.body as string) as { headers: Record<string, string> };
    expect(env.headers).toEqual({});
  });

  // --- method / body の既定値 -------------------------------------------

  it('method 未指定は GET・小文字は大文字へ揃える', async () => {
    const mockFetch = vi.fn<typeof fetch>().mockResolvedValue(envelopeRes({}));
    globalThis.fetch = mockFetch;
    await fetchViaProxy(TARGET, {}, CFG);
    expect((JSON.parse(mockFetch.mock.calls[0]![1]!.body as string) as { method: string }).method).toBe('GET');
    await fetchViaProxy(TARGET, { method: 'post' }, CFG);
    expect((JSON.parse(mockFetch.mock.calls[1]![1]!.body as string) as { method: string }).method).toBe('POST');
  });

  it('文字列でない body は送らない (undefined にする)', async () => {
    const mockFetch = vi.fn<typeof fetch>().mockResolvedValue(envelopeRes({}));
    globalThis.fetch = mockFetch;
    await fetchViaProxy(TARGET, { body: new Blob(['x']) }, CFG);
    const env = JSON.parse(mockFetch.mock.calls[0]![1]!.body as string) as { body?: string };
    expect(env.body).toBeUndefined();
    await fetchViaProxy(TARGET, { body: 'plain' }, CFG);
    expect((JSON.parse(mockFetch.mock.calls[1]![1]!.body as string) as { body?: string }).body).toBe('plain');
  });

  // --- 応答の組み立て ----------------------------------------------------

  it('本文が空なら 502 として返す (JSON.parse で落とさない)', async () => {
    globalThis.fetch = vi.fn<typeof fetch>().mockResolvedValue(envelopeRes({
      async text() { return ''; },
    }));
    const res = await fetchViaProxy(TARGET, {}, CFG);
    expect(res.status).toBe(502);
    expect(await res.text()).toBe('');
  });

  it('status が数値でなければ 502 にする', async () => {
    globalThis.fetch = vi.fn<typeof fetch>().mockResolvedValue(envelopeRes({
      async text() { return JSON.stringify({ status: 'oops', body: 'x' }); },
    }));
    expect((await fetchViaProxy(TARGET, {}, CFG)).status).toBe(502);
  });

  it('封筒の status / headers / body をそのまま返す', async () => {
    globalThis.fetch = vi.fn<typeof fetch>().mockResolvedValue(envelopeRes({
      async text() { return JSON.stringify({ status: 201, headers: { 'x-c': '3' }, body: 'hi' }); },
    }));
    const res = await fetchViaProxy(TARGET, {}, CFG);
    expect(res.status).toBe(201);
    expect(res.headers.get('x-c')).toBe('3');
    expect(await res.text()).toBe('hi');
  });
});

describe('残りの契約 (Round 5 続き)', () => {
  function envelopeRes(over: Partial<{ ok: boolean; status: number; headers: Headers; text: () => Promise<string> }>): Response {
    return {
      ok: true, status: 200, headers: new Headers(), body: null,
      async text() { return JSON.stringify({ status: 200, body: '{}' }); },
      ...over,
    } as unknown as Response;
  }
  const CFG = { url: 'https://my-worker.example.com/proxy' };
  const TARGET = 'https://api.notion.com/v1/x';

  it('プロキシのエラー本文は 200 文字までに切る', async () => {
    globalThis.fetch = vi.fn<typeof fetch>().mockResolvedValue(envelopeRes({
      ok: false, status: 500,
      async text() { return 'E'.repeat(500); },
    }));
    const err = (await fetchViaProxy(TARGET, {}, CFG).catch((e: unknown) => e)) as Error;
    const shown = err.message.slice(err.message.indexOf(': ') + 2);
    expect(shown.length).toBe(200);
  });

  // ヘッダーに undefined を入れて「値が無い」と読むと、キー自体は生えている。
  // `cfg.sharedSecret &&` を外した変異体はまさにその形になるので、キーの
  // 有無で見る。
  it('共有シークレットが無いとき x-proxy-auth のキー自体が無い', async () => {
    const mockFetch = vi.fn<typeof fetch>().mockResolvedValue(envelopeRes({}));
    globalThis.fetch = mockFetch;
    await fetchViaProxy(TARGET, {}, CFG);
    const headers = mockFetch.mock.calls[0]![1]!.headers as Record<string, string>;
    expect(Object.prototype.hasOwnProperty.call(headers, 'x-proxy-auth')).toBe(false);
  });

  // res.body が無いモック経路 (text() で読む) の上限。ストリーム経路とは
  // 別の分岐なので別に固定する。
  it('body を持たない応答でも上限を超えたら失敗する (text() 経路)', async () => {
    globalThis.fetch = vi.fn<typeof fetch>().mockResolvedValue(envelopeRes({
      async text() { return 'x'.repeat(MAX_PROXY_RESPONSE_BYTES + 1); },
    }));
    await expect(fetchViaProxy(TARGET, {}, CFG)).rejects.toThrow('proxy response too large');
  });

  it('不正な URL は保存を断る', async () => {
    await expect(setProxyConfig({ url: 'not-a-url' })).rejects.toThrow();
  });

  it('http の URL は保存を断る (https のみ)', async () => {
    await expect(setProxyConfig({ url: 'http://insecure.example.com/p' })).rejects.toThrow();
  });

  it('null を保存すると設定が消える', async () => {
    await setProxyConfig({ url: 'https://w.example.com/p' });
    expect(await getProxyConfig()).not.toBeNull();
    await setProxyConfig(null);
    expect(await getProxyConfig()).toBeNull();
  });

  it('本文が上限ちょうどなら通す (text() 経路の境界)', async () => {
    globalThis.fetch = vi.fn<typeof fetch>().mockResolvedValue(envelopeRes({
      async text() { return JSON.stringify({ status: 200, body: 'x' }).padEnd(MAX_PROXY_RESPONSE_BYTES, ' '); },
    }));
    await expect(fetchViaProxy(TARGET, {}, CFG)).resolves.toBeDefined();
  });
});

describe('isPrivateOrReservedTarget', () => {
  function pri(s: string): boolean { return isPrivateOrReservedTarget(new URL(s)); }

  it('accepts public IPs / hostnames', () => {
    expect(pri('https://api.notion.com/v1/x')).toBe(false);
    expect(pri('https://8.8.8.8/')).toBe(false);
    expect(pri('https://github.com/repo')).toBe(false);
  });

  it('rejects IPv4 loopback / RFC1918 / link-local', () => {
    expect(pri('http://127.0.0.1/')).toBe(true);
    expect(pri('http://127.5.5.5/')).toBe(true);
    expect(pri('http://10.1.2.3/')).toBe(true);
    expect(pri('http://172.16.0.1/')).toBe(true);
    expect(pri('http://172.31.255.255/')).toBe(true);
    expect(pri('http://172.32.0.1/')).toBe(false); // 172.32 is NOT private (boundary)
    expect(pri('http://192.168.1.1/')).toBe(true);
    expect(pri('http://169.254.169.254/')).toBe(true);
    expect(pri('http://0.0.0.0/')).toBe(true);
    expect(pri('http://224.0.0.1/')).toBe(true); // multicast
  });

  it('rejects IPv6 loopback / ULA / link-local / mapped IPv4', () => {
    expect(pri('http://[::1]/')).toBe(true);
    expect(pri('http://[::]/')).toBe(true);
    expect(pri('http://[fc00::1]/')).toBe(true);
    expect(pri('http://[fd12::1]/')).toBe(true);
    expect(pri('http://[fe80::1]/')).toBe(true);
    expect(pri('http://[::ffff:127.0.0.1]/')).toBe(true);
    /*
     * **2026-08-25 に判断を変えた。**
     *
     * ここは以前 `false` を期待し、注記に「public documentation range」と
     * 書いていた。**この呼び方が正しくない** —— `2001:db8::/32` は RFC 3849 の
     * **文書用**で、公開経路へ出さないことになっている番号である。
     *
     * この関数の名は `isPrivateOrReservedTarget` で、既に
     * CGNAT (100.64/10) とベンチマーク用 (198.18/15) を遮断している ——
     * どちらも「私的」ではなく**予約**で、しかも「公開に出ないから何も居ない」
     * という点は文書用と同じである。**同じ理由の範囲を片方だけ通していた。**
     *
     * 遮断して失う正当な行き先は無い (公開経路に出ないので)。
     */
    expect(pri('http://[2001:db8::1]/')).toBe(true); // RFC 3849 文書用 = 予約
    // 過剰に塞いでいないこと —— 2001::/16 は正当な公開空間である。
    expect(pri('http://[2001:4860:4860::8888]/')).toBe(false); // Google Public DNS
    expect(pri('http://[2001:db9::1]/')).toBe(false); // 隣の /32 は公開
  });

  /*
   * **予約されているが「私的」ではない範囲。**
   *
   * 2026-08-25 に実測したところ、この関数は 10 進/16 進/8 進表記も
   * IPv4-mapped も NAT64 も cloud metadata も全部遮断していたのに、
   * **下の 5 つだけ素通りしていた**。どれも公開経路には出ない番号なので、
   * 要求が届くとすれば**その番号を内部で流用している網の中**である。
   */
  it('★ 予約範囲 (文書用 / プロトコル割当 / 6to4 リレー) も遮断する', () => {
    // 192.0.0.0/24 IETF プロトコル割当 (RFC 6890)。DS-Lite の 192.0.0.0/29 を
    // 含み、CPE 上で実際に応答することがある。
    expect(pri('http://192.0.0.1/')).toBe(true);
    expect(pri('http://192.0.0.8/')).toBe(true);   // IPv4 dummy address
    expect(pri('http://192.0.0.170/')).toBe(true); // NAT64 well-known
    // 文書用 TEST-NET-1/2/3 (RFC 5737)
    expect(pri('http://192.0.2.1/')).toBe(true);
    expect(pri('http://198.51.100.1/')).toBe(true);
    expect(pri('http://203.0.113.1/')).toBe(true);
    // 6to4 リレー anycast (RFC 3068 / 廃止 RFC 7526)
    expect(pri('http://192.88.99.1/')).toBe(true);
  });

  /*
   * **境界 —— 隣の /24 は公開である。**
   * この 5 本が無いと、上の規則が広すぎても誰も見ていないことになる
   * (`a === 192 && b === 0` だけで書けば 192.0.x.x を全部塞げてしまう)。
   */
  it('★ 隣接する公開範囲は通す (新しい規則が広すぎない)', () => {
    expect(pri('http://192.0.1.1/')).toBe(false);    // 192.0.0/24 と 192.0.2/24 の間
    expect(pri('http://192.0.3.1/')).toBe(false);
    expect(pri('http://198.51.99.1/')).toBe(false);  // TEST-NET-2 の直前
    expect(pri('http://198.51.101.1/')).toBe(false); // 直後
    expect(pri('http://203.0.112.1/')).toBe(false);  // TEST-NET-3 の直前
    expect(pri('http://203.0.114.1/')).toBe(false);  // 直後
    expect(pri('http://192.88.98.1/')).toBe(false);  // 6to4 リレーの直前
    expect(pri('http://192.88.100.1/')).toBe(false); // 直後
  });

  // 10 進 / 16 進 / 8 進の IPv4 表記。`isPrivateOrReservedTarget` の v4 判定は
  // ドット付き 4 組しか見ないので、これらが素通りするかどうかは
  // **`new URL()` がドット付きに正規化してくれること**に依存している。
  // 依存しているのに、その前提を固定する検査が無かった。パース方法が
  // 変わった時 (自前で組み直す・別ランタイムへ載せ替える) に黙って穴が開く。
  it('10 進 / 16 進 / 8 進で書かれたループバックを弾く (URL 正規化への依存を固定)', () => {
    expect(pri('http://2130706433/')).toBe(true);   // 127.0.0.1 (10 進)
    expect(pri('http://0x7f000001/')).toBe(true);   // 127.0.0.1 (16 進)
    expect(pri('http://0177.0.0.1/')).toBe(true);   // 127.0.0.1 (8 進の第 1 オクテット)
    expect(pri('http://0x7f.0x0.0x0.0x1/')).toBe(true); // 127.0.0.1 (各オクテット 16 進)
  });

  it('10 進 / 16 進で書かれたメタデータ・私設アドレスを弾く', () => {
    expect(pri('http://2852039166/')).toBe(true);   // 169.254.169.254 (AWS IMDS)
    expect(pri('http://0xa9fea9fe/')).toBe(true);   // 169.254.169.254
    expect(pri('http://3232235777/')).toBe(true);   // 192.168.1.1
    expect(pri('http://167772161/')).toBe(true);    // 10.0.0.1
  });

  // ネガティブコントロール: 10 進表記そのものを弾いているわけではない
  // (「数字だけのホストは全部拒否」なら公開 IP も落ちて、この検査は
  //  何も確かめていないことになる)。
  it('10 進表記でも公開 IP は通す', () => {
    expect(pri('http://134744072/')).toBe(false);   // 8.8.8.8 (Google DNS)
    expect(pri('http://0x8080808/')).toBe(false);   // 8.8.8.8
  });

  // 全角数字は IDNA で ASCII 数字に写像され、URL は数値ホストとして解釈する。
  // `①②③` は 0.0.0.123 になり 0.0.0.0/8 で落ちる。意図した挙動であることを
  // 記録しておく (見て驚く形なので、次に読む人が「バグでは」と思わないように)。
  it('全角・丸数字のホストも数値として解釈され、予約域なら弾かれる', () => {
    expect(pri('http://\uff12\uff11\uff13\uff10\uff17\uff10\uff16\uff14\uff13\uff13/')).toBe(true); // 2130706433 → 127.0.0.1
  });

  it('rejects IPv4-mapped IPv6 in HEX form for ALL private ranges (Round 2 BLOCKING)', () => {
    // URL normalizes "::ffff:169.254.169.254" → "::ffff:a9fe:a9fe" — earlier
    // regex only matched ::ffff:7f (loopback). These cases verify that hex
    // mapped form for AWS metadata, RFC1918, and link-local are blocked.
    expect(pri('http://[::ffff:a9fe:a9fe]/')).toBe(true); // 169.254.169.254 (AWS IMDS)
    expect(pri('http://[::ffff:c0a8:1]/')).toBe(true);    // 192.168.0.1
    expect(pri('http://[::ffff:c0a8:101]/')).toBe(true);  // 192.168.1.1
    expect(pri('http://[::ffff:a00:1]/')).toBe(true);     // 10.0.0.1
    expect(pri('http://[::ffff:ac10:1]/')).toBe(true);    // 172.16.0.1
    expect(pri('http://[::ffff:7f00:1]/')).toBe(true);    // 127.0.0.1 (loopback hex)
    expect(pri('http://[::ffff:0:0]/')).toBe(true);       // 0.0.0.0
    expect(pri('http://[::ffff:e000:1]/')).toBe(true);    // 224.0.0.1 (multicast)
    // Public IPs in mapped form should pass through.
    expect(pri('http://[::ffff:808:808]/')).toBe(false);  // 8.8.8.8 (Google DNS)
  });

  // ===== Round 5 (2026-08 変異検査で見つけた穴) ==========================
  //
  // proxy.ts はファイル全体を `Stryker disable` していたため、この SSRF
  // 判定は測られていなかった。無効化を外すと生存 43 変異体。内訳は
  // 「**遮断側は書いてあるが、遮断しすぎていないことを誰も見ていない**」形が
  // 大半だった。`a === 169 && b === 254` を `||` に変えても全テストが緑になる —
  // つまり「169.254 だけを弾く」ことを何も証明していなかった。
  //
  // 過遮断は穴ではないが、**規則が効いている証拠にはならない**。片側だけの
  // 検査は、規則を丸ごと `return true` に潰しても気付けない。
  describe('SSRF — 規則が「その範囲だけ」に効いていること (Round 5)', () => {
    function pri(s: string): boolean { return isPrivateOrReservedTarget(new URL(s)); }

    it('169.254/16 は第 1・第 2 オクテットの両方を見ている', () => {
      expect(pri('http://169.254.169.254/')).toBe(true);
      expect(pri('http://169.1.1.1/')).toBe(false);   // 169.x だけでは弾かない
      expect(pri('http://1.254.1.1/')).toBe(false);   // x.254 だけでは弾かない
      expect(pri('http://169.253.1.1/')).toBe(false); // 隣接
      expect(pri('http://169.255.1.1/')).toBe(false); // 隣接
    });

    it('192.168/16 は第 1・第 2 オクテットの両方を見ている', () => {
      expect(pri('http://192.168.0.1/')).toBe(true);
      expect(pri('http://192.1.1.1/')).toBe(false);
      expect(pri('http://1.168.1.1/')).toBe(false);
      expect(pri('http://192.167.1.1/')).toBe(false);
      expect(pri('http://192.169.1.1/')).toBe(false);
    });

    it('172.16/12 の下側の境界 (172.15 は公開)', () => {
      expect(pri('http://172.15.255.255/')).toBe(false);
      expect(pri('http://172.16.0.0/')).toBe(true);
      expect(pri('http://171.16.0.1/')).toBe(false); // 第 1 オクテットも見ている
    });

    it('100.64/10 CGNAT の両端 (RFC 6598)', () => {
      expect(pri('http://100.63.255.255/')).toBe(false);
      expect(pri('http://100.64.0.0/')).toBe(true);
      expect(pri('http://100.127.255.255/')).toBe(true);
      expect(pri('http://100.128.0.0/')).toBe(false);
      expect(pri('http://99.64.1.1/')).toBe(false); // 第 1 オクテットも見ている
    });

    it('198.18/15 ベンチマーク域の両端 (RFC 2544)', () => {
      expect(pri('http://198.17.255.255/')).toBe(false);
      expect(pri('http://198.18.0.0/')).toBe(true);
      expect(pri('http://198.19.255.255/')).toBe(true);
      expect(pri('http://198.20.0.0/')).toBe(false);
      expect(pri('http://197.18.1.1/')).toBe(false);
    });

    it('マルチキャスト以上 (>= 224) の境界', () => {
      expect(pri('http://223.255.255.255/')).toBe(false);
      expect(pri('http://224.0.0.0/')).toBe(true);
      expect(pri('http://255.255.255.255/')).toBe(true);
    });

    it('10/8 と 127/8 は第 1 オクテットだけで決まる', () => {
      expect(pri('http://10.0.0.0/')).toBe(true);
      expect(pri('http://11.0.0.1/')).toBe(false);
      expect(pri('http://9.255.255.255/')).toBe(false);
      expect(pri('http://126.255.255.255/')).toBe(false);
      expect(pri('http://128.0.0.1/')).toBe(false);
    });

    it('0/8 の境界 (1.x は公開)', () => {
      expect(pri('http://0.0.0.1/')).toBe(true);
      expect(pri('http://1.0.0.1/')).toBe(false);
    });

    it('ループバックの別名 3 つをすべて弾く', () => {
      expect(pri('http://localhost/')).toBe(true);
      expect(pri('http://ip6-localhost/')).toBe(true);
      expect(pri('http://ip6-loopback/')).toBe(true);
      expect(pri('http://notlocalhost/')).toBe(false); // 部分一致では弾かない
      expect(pri('http://localhost.example.com/')).toBe(false);
    });

    it('GCP メタデータの 2 形式を弾く', () => {
      expect(pri('http://metadata.google.internal/')).toBe(true);
      expect(pri('http://x.metadata.cloud.google.com/')).toBe(true);
      // 末尾一致であって先頭一致ではない (`endsWith` → `startsWith` を殺す)
      expect(pri('http://metadata.cloud.google.com.example.net/')).toBe(false);
      // `.internal` は内部 TLD 規則の側で弾かれる (メタデータ名の完全一致とは別経路)
      expect(pri('http://notmetadata.google.internal/')).toBe(true);
      // 完全一致であることの確認は、内部 TLD に当たらない名前で行う
      expect(pri('http://notmetadata.google.com/')).toBe(false);
    });

    it('IPv6 ループバック / 未指定の長い表記も弾く', () => {
      expect(pri('http://[0:0:0:0:0:0:0:1]/')).toBe(true);
      expect(pri('http://[0:0:0:0:0:0:0:0]/')).toBe(true);
    });

    it('内部 TLD は最終ラベルで判定する', () => {
      expect(pri('http://printer.local/')).toBe(true);
      expect(pri('http://example.localcom/')).toBe(false); // 区切りが無いので当たらない
      expect(pri('http://example.com/')).toBe(false);
    });

    // 単一ラベルのホストは検索ドメインの補完で解決する (`internal` →
    // `internal.corp.example`)。以前は「裸の TLD は解決しない」として通して
    // いたが、その前提が成り立っていなかったので遮断側へ寄せた。
    it('ラベルが 1 つだけの内部名も弾く', () => {
      expect(pri('http://local/')).toBe(true);
      expect(pri('http://internal/')).toBe(true);
      expect(pri('http://corp/')).toBe(true);
      expect(pri('http://example/')).toBe(false); // 内部 TLD でなければ通す
    });

    // 末尾ドットの回避策と同じ形が先頭にもあった。`URL` は `http://.local/` を
    // hostname `.local` のまま通し、`lastIndexOf('.')` が 0 になるため
    // 最終ラベル判定を素通りしていた (`..internal` は当たるのに `.internal` は
    // 当たらない、という非対称になっていた)。
    it('先頭ドットを付けても内部名の判定を回避できない', () => {
      expect(new URL('http://.local/').hostname).toBe('.local'); // パーサの前提を固定
      expect(pri('http://.local/')).toBe(true);
      expect(pri('http://.internal/')).toBe(true);
      expect(pri('http://..internal/')).toBe(true);
      expect(pri('http://.printer.local/')).toBe(true);
      expect(pri('http://.localhost/')).toBe(true);
    });

    // IPv6 の長い表記は `URL` が短縮形へ正規化する。長形式の比較は
    // そのぶん到達しないが、末尾ドットの件 (パーサの挙動を読み違えて穴が
    // 開いた) があるので、前提そのものを検査で固定してから残す。
    it('IPv6 の長形式はパーサが短縮形へ正規化する (前提の固定)', () => {
      expect(new URL('http://[0:0:0:0:0:0:0:1]/').hostname).toBe('[::1]');
      expect(new URL('http://[0:0:0:0:0:0:0:0]/').hostname).toBe('[::]');
    });

    it('公開ホストは通る (過遮断していないことの対照)', () => {
      expect(pri('https://api.notion.com/')).toBe(false);
      expect(pri('https://8.8.8.8/')).toBe(false);
      expect(pri('https://1.1.1.1/')).toBe(false);
      expect(pri('http://[2606:4700::1]/')).toBe(false);
    });
  });

    // `::ffff:HHHH` (1 グループ) は上位 16 ビットが 0 の 0.0.HH.HH。
    // この分岐が無いと 2 グループ用の正規表現に当たり `255.255.0.1` と
    // 誤って解釈されて公開扱いになる (RFC 1122 の "this host" 域を素通り)。
    it('1 グループの mapped 形式を 0.0.x.x として解釈する', () => {
      expect(pri('http://[::ffff:1]/')).toBe(true);     // 0.0.0.1
      expect(pri('http://[::ffff:ffff]/')).toBe(true);  // 0.0.255.255
      expect(pri('http://[::ffff:0]/')).toBe(true);     // 0.0.0.0
    });

    it('NAT64 / 6to4 に埋め込んだメタデータアドレスを弾く', () => {
      expect(pri('http://[64:ff9b::a9fe:a9fe]/')).toBe(true); // NAT64 169.254.169.254
      expect(pri('http://[2002:a9fe:a9fe::]/')).toBe(true);   // 6to4 169.254.169.254
      expect(pri('http://[64:ff9b::808:808]/')).toBe(false);  // NAT64 8.8.8.8 は公開
    });

  describe('SSRF edge cases — Round 4 (2026-07 audit)', () => {
    it('rejects trailing-dot (FQDN) forms of every name-based rule', () => {
      // `URL` PRESERVES a trailing dot for named hosts, so exact-equality and
      // last-label checks were bypassable by appending one. These resolve to
      // exactly the same targets as their dotless forms.
      expect(new URL('http://localhost./').hostname).toBe('localhost.'); // pins the parser premise
      expect(pri('http://localhost./')).toBe(true);
      expect(pri('http://metadata.google.internal./')).toBe(true);
      expect(pri('http://printer.local./')).toBe(true);
      expect(pri('http://x.internal./')).toBe(true);
      expect(pri('http://dc01.corp./')).toBe(true);
      expect(pri('http://foo.home.arpa./')).toBe(true);
      // A public name with a trailing dot is still public.
      expect(pri('https://api.notion.com./')).toBe(false);
    });

    it('rejects CGNAT 100.64/10 and benchmarking 198.18/15, with boundaries', () => {
      expect(pri('http://100.64.0.1/')).toBe(true);
      expect(pri('http://100.127.255.255/')).toBe(true);
      expect(pri('http://100.63.255.255/')).toBe(false); // just below CGNAT
      expect(pri('http://100.128.0.1/')).toBe(false); // just above CGNAT
      expect(pri('http://198.18.0.1/')).toBe(true);
      expect(pri('http://198.19.255.255/')).toBe(true);
      expect(pri('http://198.20.0.1/')).toBe(false); // just above benchmark range
      expect(pri('http://198.17.255.255/')).toBe(false); // just below
    });
  });

  describe('IPv6 SSRF edge cases — Round 3', () => {
    // Background: `new URL('http://[::169.254.169.254]/').hostname` is
    // normalized to `[::a9fe:a9fe]` (verified on Node v18+/Chromium) — it
    // sheds the `::ffff:` prefix because the input lacks the v4-mapped
    // marker. The original Round-2 fix only matched the canonical
    // `::ffff:HHHH:HHHH` form, leaving the deprecated IPv4-compatible
    // (`::HHHH:HHHH`, RFC 4291 §2.5.5.1) shape unguarded.
    it('BLOCKING-A: rejects IPv4-compatible IPv6 (::HHHH:HHHH) for AWS IMDS', () => {
      expect(pri('http://[::a9fe:a9fe]/')).toBe(true);    // 169.254.169.254
      expect(pri('http://[::7f00:1]/')).toBe(true);       // 127.0.0.1
      // Public IP in IPv4-compatible form must still pass through.
      expect(pri('http://[::808:808]/')).toBe(false);     // 8.8.8.8
    });

    // Background: `new URL('http://[::ffff:0]/').hostname === '[::ffff:0]'`
    // (NOT normalized to `[::ffff:0:0]`). The original two-group regex
    // required `:hex:hex` so single-group mapped form slipped past, opening
    // a path to 0.0.0.0 (RFC 1122 §3.2.1.3 "this host on this network").
    it('BLOCKING-B: rejects single-group ::ffff:HHHH mapped form', () => {
      expect(pri('http://[::ffff:0]/')).toBe(true);       // 0.0.0.0
      expect(pri('http://[::ffff:1]/')).toBe(true);       // 0.0.0.1
    });

    // SHOULD-FIX-B: NAT64 (RFC 6052) / 6to4 (RFC 3056) transition prefixes
    // can encode an internal v4 address in the trailing bits. Best-effort
    // extraction; full coverage requires proxy-side resolved-IP check.
    it('SHOULD-FIX-B: rejects NAT64 (64:ff9b::) embedded internal v4', () => {
      expect(pri('http://[64:ff9b::a9fe:a9fe]/')).toBe(true);  // → 169.254.169.254
      expect(pri('http://[64:ff9b::7f00:1]/')).toBe(true);     // → 127.0.0.1
      expect(pri('http://[64:ff9b::808:808]/')).toBe(false);   // → 8.8.8.8 (public)
    });

    it('SHOULD-FIX-B: rejects 6to4 (2002::) embedded internal v4', () => {
      expect(pri('http://[2002:a9fe:a9fe::]/')).toBe(true);    // → 169.254.169.254
      expect(pri('http://[2002:7f00:1::]/')).toBe(true);       // → 127.0.0.1
      expect(pri('http://[2002:808:808::]/')).toBe(false);     // → 8.8.8.8 (public)
    });
  });

  it('rejects internal hostnames', () => {
    expect(pri('http://localhost/')).toBe(true);
    expect(pri('http://my-printer.local/')).toBe(true);
    expect(pri('https://wiki.internal/')).toBe(true);
    expect(pri('https://stuff.lan/')).toBe(true);
    expect(pri('http://metadata.google.internal/')).toBe(true);
  });

  it('rejects extended internal TLDs (Round 2 SHOULD-FIX S-1) — .corp / .intranet / .home / .private', () => {
    // Microsoft AD defaults — historically widely deployed as internal-only.
    expect(pri('http://dc01.corp/')).toBe(true);
    expect(pri('https://wiki.intranet/')).toBe(true);
    // Common home / ISP CPE zone.
    expect(pri('http://router.home/')).toBe(true);
    // IETF draft .private namespace.
    expect(pri('http://app.private/')).toBe(true);
    // RFC 8375 reserved zone (already covered, but pin the multi-label form).
    expect(pri('http://printer.home.arpa/')).toBe(true);
    expect(pri('http://home.arpa/')).toBe(true);
  });

  it('does NOT flag public hostnames that merely contain TLD-like substrings (Round 2 SHOULD-FIX S-1 false-positive guard)', () => {
    // `localcom` shares the prefix "local" but is not the .local TLD — the
    // last-label check must NOT trip on it.
    expect(pri('https://example.localcom/')).toBe(false);
    expect(pri('https://internal-server.example.com/')).toBe(false);
    expect(pri('https://corporate.example.com/')).toBe(false);
    expect(pri('https://homepage.example.com/')).toBe(false);
    expect(pri('https://privateer.io/')).toBe(false);
  });
});

/*
 * `PROXY_REQUIRED_SERVICES` の検査は 2026-08-27 に**消した**。
 *
 * 「github は proxy 必須ではない」と固定していたが、実装は全サービスを
 * 必ずプロキシへ通す (`liveRead.ts`)。**実装より緩い方針を検査が留めていた**
 * ことになり、そのまま従えば資格情報を第三者ホストへ直接送る経路が戻る。
 * 本当の方針は `liveRead.test.ts` の「プロキシを用意できなければ読まない」で
 * 留める。
 */
