/** @vitest-environment jsdom */
import { describe, expect, it, beforeEach, vi } from 'vitest';
import 'fake-indexeddb/auto';
import {
  fetchViaProxy,
  getProxyConfig,
  setProxyConfig,
  isPrivateOrReservedTarget,
  MAX_PROXY_RESPONSE_BYTES,
  PROXY_REQUIRED_SERVICES,
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
    expect(pri('http://[2001:db8::1]/')).toBe(false); // public documentation range
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

  it('rejects internal hostnames', () => {
    expect(pri('http://localhost/')).toBe(true);
    expect(pri('http://my-printer.local/')).toBe(true);
    expect(pri('https://wiki.internal/')).toBe(true);
    expect(pri('https://stuff.lan/')).toBe(true);
    expect(pri('http://metadata.google.internal/')).toBe(true);
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
