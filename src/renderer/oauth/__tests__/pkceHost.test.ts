import { afterEach, describe, expect, it, vi } from 'vitest';
import { hostFetch } from '../pkceHost';

// pkce.mamori の壁 `hostFetch` は、呼ぶ時点の globalThis.fetch へ「転送に追随しない init」を渡す。
// 呼び手の init (method / body / headers) を落とさないこと、redirect を足すこと、no-cors だけ follow にすることを留める。
describe('pkceHost.hostFetch', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('呼び手の init を落とさず、redirect: manual を足して fetch へ渡す', async () => {
    const stub = vi.fn(async () => new Response('ok'));
    vi.stubGlobal('fetch', stub);
    const headers = { 'Content-Type': 'application/x-www-form-urlencoded' };
    await hostFetch('https://example.test/token', { method: 'POST', body: 'a=b', headers });
    expect(stub).toHaveBeenCalledTimes(1);
    const [url, init] = stub.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://example.test/token');
    expect(init).toEqual({ method: 'POST', body: 'a=b', headers, redirect: 'manual' });
  });

  it('no-cors の到達確認だけは redirect: follow (規則の例外)', async () => {
    const stub = vi.fn(async () => new Response('ok'));
    vi.stubGlobal('fetch', stub);
    await hostFetch('https://example.test/', { mode: 'no-cors' });
    const [, init] = stub.mock.calls[0] as unknown as [string, RequestInit];
    expect(init).toEqual({ mode: 'no-cors', redirect: 'follow' });
  });

  it('init を省いても redirect: manual が付く', async () => {
    const stub = vi.fn(async () => new Response('ok'));
    vi.stubGlobal('fetch', stub);
    await hostFetch('https://example.test/');
    const [, init] = stub.mock.calls[0] as unknown as [string, RequestInit];
    expect(init).toEqual({ redirect: 'manual' });
  });
});
