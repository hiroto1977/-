/** @vitest-environment jsdom */
import { describe, expect, it, beforeEach, vi } from 'vitest';
import 'fake-indexeddb/auto';
import { fetchViaProxy, getProxyConfig, setProxyConfig, PROXY_REQUIRED_SERVICES } from '../../network/proxy';

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

  it('rejects non-http(s) URLs', async () => {
    await expect(setProxyConfig({ url: 'ftp://x.com' })).rejects.toThrow(/http\(s\)/);
    await expect(setProxyConfig({ url: 'javascript:alert(1)' } as { url: string })).rejects.toThrow();
  });

  it('rejects empty URL', async () => {
    await expect(setProxyConfig({ url: '' })).rejects.toThrow(/不正/);
  });

  it('rejects oversize shared secret', async () => {
    await expect(setProxyConfig({ url: 'https://x.com', sharedSecret: 'x'.repeat(257) })).rejects.toThrow(/共有秘密/);
  });
});

describe('fetchViaProxy', () => {
  it('wraps target URL + method + headers + body in JSON envelope', async () => {
    const mockFetch = vi.fn<typeof fetch>().mockResolvedValue({
      ok: true,
      status: 200,
      async text() { return ''; },
      async json() {
        return { status: 200, headers: { 'content-type': 'application/json' }, body: '{"ok":true}' };
      },
    } as unknown as Response);
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

  it('forwards shared secret as X-Proxy-Auth header', async () => {
    const mockFetch = vi.fn<typeof fetch>().mockResolvedValue({
      ok: true,
      status: 200,
      async text() { return ''; },
      async json() { return { status: 200, body: '' }; },
    } as unknown as Response);
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
});

describe('PROXY_REQUIRED_SERVICES', () => {
  it('lists the 3 CORS-blocked services', () => {
    expect(PROXY_REQUIRED_SERVICES.has('notion')).toBe(true);
    expect(PROXY_REQUIRED_SERVICES.has('atlassian')).toBe(true);
    expect(PROXY_REQUIRED_SERVICES.has('cloudflare')).toBe(true);
  });

  it('does NOT mark CORS-friendly services', () => {
    expect(PROXY_REQUIRED_SERVICES.has('github')).toBe(false);
    expect(PROXY_REQUIRED_SERVICES.has('anthropic')).toBe(false);
  });
});
