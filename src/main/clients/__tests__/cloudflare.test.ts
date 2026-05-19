import { describe, expect, it, vi } from 'vitest';
import { fetchCloudflareSnapshot, ACTIONS } from '../cloudflare';
import { FetchError } from '../types';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

const okWrap = (result: unknown) => ({ result, success: true, errors: [], messages: [] });
const failWrap = (message: string) => ({
  result: null,
  success: false,
  errors: [{ code: 1001, message }],
  messages: [],
});

describe('fetchCloudflareSnapshot', () => {
  it('paginates through /zones until a partial page is returned', async () => {
    // 50 zones per page → we should see page=1, page=2, page=3 (where
    // page 3 has fewer than 50 items so we stop). Page indices in URL
    // are 1-based per CF docs.
    const makeZone = (id: string) => ({
      id,
      name: `${id}.example.com`,
      status: 'active',
      plan: { name: 'Free' },
      account: { id: 'a', name: 'Personal' },
      name_servers: [],
      development_mode: 0,
    });
    const page1 = Array.from({ length: 50 }, (_, i) => makeZone(`z${i + 1}`));
    const page2 = Array.from({ length: 50 }, (_, i) => makeZone(`z${i + 51}`));
    const page3 = Array.from({ length: 7 }, (_, i) => makeZone(`z${i + 101}`));

    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        jsonResponse(okWrap({ id: 'u1', email: 'me@example.com', username: 'me' })),
      )
      .mockResolvedValueOnce(jsonResponse(okWrap(page1)))
      .mockResolvedValueOnce(jsonResponse(okWrap(page2)))
      .mockResolvedValueOnce(jsonResponse(okWrap(page3)));

    const snap = await fetchCloudflareSnapshot({ token: 't', fetch: fetchMock });

    expect(snap.zones).toHaveLength(107);
    const calls = fetchMock.mock.calls.map((c) => c[0] as string);
    expect(calls).toContain('https://api.cloudflare.com/client/v4/zones?per_page=50&page=1');
    expect(calls).toContain('https://api.cloudflare.com/client/v4/zones?per_page=50&page=2');
    expect(calls).toContain('https://api.cloudflare.com/client/v4/zones?per_page=50&page=3');
    expect(calls.filter((u) => u.includes('/zones?'))).toHaveLength(3);
  });

  it('stops after page 1 when fewer than 50 zones are returned', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        jsonResponse(okWrap({ id: 'u', email: 'a@b.com', username: 'a' })),
      )
      .mockResolvedValueOnce(jsonResponse(okWrap([])));

    const snap = await fetchCloudflareSnapshot({ token: 't', fetch: fetchMock });
    expect(snap.zones).toEqual([]);
    expect(fetchMock.mock.calls).toHaveLength(2); // /user + /zones page=1, no page=2
  });

  it('issues /user + /zones in parallel and normalizes the wrap envelope', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        jsonResponse(okWrap({ id: 'u1', email: 'me@example.com', username: 'me' })),
      )
      .mockResolvedValueOnce(
        jsonResponse(
          okWrap([
            {
              id: 'z1',
              name: 'example.com',
              status: 'active',
              plan: { name: 'Free' },
              account: { id: 'a1', name: 'Personal' },
              name_servers: ['ns1.cloudflare.com', 'ns2.cloudflare.com'],
              development_mode: 0,
            },
            {
              id: 'z2',
              name: 'staging.example.com',
              status: 'pending',
              plan: { name: 'Free' },
              account: { id: 'a1', name: 'Personal' },
              name_servers: ['ns1.cloudflare.com', 'ns2.cloudflare.com'],
              development_mode: 7200,
            },
          ]),
        ),
      );

    const snap = await fetchCloudflareSnapshot({ token: 't', fetch: fetchMock });

    expect(snap.user).toEqual({ email: 'me@example.com', username: 'me' });
    expect(snap.zones).toHaveLength(2);
    expect(snap.zones[0]).toMatchObject({
      id: 'z1',
      name: 'example.com',
      plan: 'Free',
      accountName: 'Personal',
      devModeRemainingSec: 0,
    });
    expect(snap.zones[1]!.devModeRemainingSec).toBe(7200);

    // Assert Bearer auth on both calls
    for (const call of fetchMock.mock.calls) {
      const init = call[1] as RequestInit;
      const headers = init.headers as Record<string, string>;
      expect(headers.Authorization).toBe('Bearer t');
    }
  });

  it('throws FetchError when Cloudflare returns success=false', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse(failWrap('Invalid request headers')))
      .mockResolvedValueOnce(jsonResponse(okWrap([])));

    await expect(fetchCloudflareSnapshot({ token: 't', fetch: fetchMock })).rejects.toBeInstanceOf(
      FetchError,
    );
  });
});

describe('ACTIONS["create-dns-record"]', () => {
  it('POSTs to /zones/{id}/dns_records with proxied=false for non-A/AAAA/CNAME', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValueOnce(
      jsonResponse(
        okWrap({
          id: 'r1',
          name: '_dmarc.example.com',
          type: 'TXT',
          content: 'v=DMARC1; p=none',
          ttl: 1,
          proxied: false,
        }),
      ),
    );

    const result = (await ACTIONS['create-dns-record']!({
      token: 't',
      fetch: fetchMock,
      payload: {
        zoneId: 'zone-id',
        type: 'TXT',
        name: '_dmarc',
        content: 'v=DMARC1; p=none',
      },
    })) as { id: string; type: string };

    expect(result.type).toBe('TXT');
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('https://api.cloudflare.com/client/v4/zones/zone-id/dns_records');
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body.type).toBe('TXT');
    expect(body.proxied).toBeUndefined(); // not added for TXT
    expect(body.ttl).toBe(1);
  });

  it('sends proxied flag for A records', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        jsonResponse(okWrap({ id: 'r2', name: 'api.example.com', type: 'A' })),
      );
    await ACTIONS['create-dns-record']!({
      token: 't',
      fetch: fetchMock,
      payload: { zoneId: 'z', type: 'A', name: 'api', content: '192.0.2.1', proxied: true },
    });
    const body = JSON.parse((fetchMock.mock.calls[0]![1] as RequestInit).body as string);
    expect(body.proxied).toBe(true);
  });

  it('url-encodes the zone id', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse(okWrap({ id: 'r3', name: 'x', type: 'A' })));
    await ACTIONS['create-dns-record']!({
      token: 't',
      fetch: fetchMock,
      payload: { zoneId: 'zo ne/id', type: 'A', name: 'x', content: '1.2.3.4' },
    });
    expect(fetchMock.mock.calls[0]![0]).toBe(
      'https://api.cloudflare.com/client/v4/zones/zo%20ne%2Fid/dns_records',
    );
  });

  it('rejects when required fields are missing', async () => {
    const fetchMock = vi.fn<typeof fetch>();
    await expect(
      ACTIONS['create-dns-record']!({
        token: 't',
        fetch: fetchMock,
        payload: { zoneId: 'z', type: 'A', name: 'x' },
      }),
    ).rejects.toThrow();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('surfaces Cloudflare success=false as FetchError', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse(failWrap('DNS record already exists')));
    await expect(
      ACTIONS['create-dns-record']!({
        token: 't',
        fetch: fetchMock,
        payload: { zoneId: 'z', type: 'A', name: 'x', content: '1.2.3.4' },
      }),
    ).rejects.toBeInstanceOf(FetchError);
  });
});

describe('ACTIONS["purge-cache"]', () => {
  it('POSTs purge_everything when purgeEverything=true', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse(okWrap({ id: 'job-1' })));

    const result = (await ACTIONS['purge-cache']!({
      token: 't',
      fetch: fetchMock,
      payload: { zoneId: 'z', purgeEverything: true },
    })) as { id: string; purged: 'all' | number };

    expect(result).toEqual({ id: 'job-1', purged: 'all' });
    const body = JSON.parse((fetchMock.mock.calls[0]![1] as RequestInit).body as string);
    expect(body).toEqual({ purge_everything: true });
  });

  it('POSTs files when an array is provided', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse(okWrap({ id: 'job-2' })));

    const result = (await ACTIONS['purge-cache']!({
      token: 't',
      fetch: fetchMock,
      payload: { zoneId: 'z', files: ['https://example.com/a', 'https://example.com/b'] },
    })) as { purged: 'all' | number };

    expect(result.purged).toBe(2);
    const body = JSON.parse((fetchMock.mock.calls[0]![1] as RequestInit).body as string);
    expect(body.files).toEqual(['https://example.com/a', 'https://example.com/b']);
  });

  it('rejects when neither purgeEverything nor files[] is set', async () => {
    const fetchMock = vi.fn<typeof fetch>();
    await expect(
      ACTIONS['purge-cache']!({ token: 't', fetch: fetchMock, payload: { zoneId: 'z' } }),
    ).rejects.toThrow(/purgeEverything|files/);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
