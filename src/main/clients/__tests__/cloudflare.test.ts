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

// --- 既定でプロキシしない ----------------------------------------------
//
// `proxied`（オレンジ雲）は DNS の応答そのものを変える。真にすると
// 公開 IP が Cloudflare のものに差し替わり、HTTP 以外のプロトコルは
// 通らなくなる。**利用者が頼んでいないのに勝手に付けてはいけない。**

function cfHeadersOf(call: Parameters<typeof fetch>): Record<string, string> {
  return (call[1]?.headers ?? {}) as Record<string, string>;
}

async function createRecord(payload: Record<string, unknown>) {
  const fetchMock = vi
    .fn<typeof fetch>()
    .mockResolvedValueOnce(jsonResponse(okWrap({ id: 'r', name: 'n', type: 'A' })));
  await ACTIONS['create-dns-record']!({ token: 'cf-secret', fetch: fetchMock, payload });
  const [url, init] = fetchMock.mock.calls[0]! as [string, RequestInit];
  return { url, init, body: JSON.parse(init.body as string) };
}

describe('ACTIONS["create-dns-record"] — proxied の既定', () => {
  it('A / AAAA / CNAME に proxied を渡さなければ false で送る', async () => {
    for (const type of ['A', 'AAAA', 'CNAME']) {
      const { body } = await createRecord({
        zoneId: 'z',
        type,
        name: 'n',
        content: type === 'CNAME' ? 'target.example.com' : '203.0.113.1',
      });
      expect(body.proxied).toBe(false);
    }
  });

  it('明示的に true を渡したときだけ true になる', async () => {
    const { body } = await createRecord({
      zoneId: 'z',
      type: 'A',
      name: 'n',
      content: '203.0.113.1',
      proxied: true,
    });
    expect(body.proxied).toBe(true);
  });

  it('proxied を付けられない種別には項目ごと送らない', async () => {
    // TXT / MX に proxied を送ると Cloudflare は 400 を返す。
    for (const type of ['TXT', 'MX']) {
      const { body } = await createRecord({ zoneId: 'z', type, name: 'n', content: 'v' });
      expect(body).not.toHaveProperty('proxied');
    }
  });

  it('種別が未知でも proxied は付けない', async () => {
    const { body } = await createRecord({ zoneId: 'z', type: 'SRV', name: 'n', content: 'v' });
    expect(body).not.toHaveProperty('proxied');
  });
});

describe('ACTIONS["create-dns-record"] — 送り方と入口の検査', () => {
  it('POST で JSON として送り、トークンは Authorization だけに載る', async () => {
    const { url, init } = await createRecord({
      zoneId: 'z',
      type: 'A',
      name: 'n',
      content: '203.0.113.1',
    });
    expect(url).toBe('https://api.cloudflare.com/client/v4/zones/z/dns_records');
    expect(url).not.toContain('cf-secret');
    expect(init.method).toBe('POST');
    const headers = init.headers as Record<string, string>;
    expect(headers.Authorization).toBe('Bearer cf-secret');
    expect(headers['Content-Type']).toBe('application/json');
    expect(headers.Accept).toBe('application/json');
  });

  it('必須項目が 1 つでも欠けたら送らない（4 つとも個別に）', async () => {
    const full = { zoneId: 'z', type: 'A', name: 'n', content: '203.0.113.1' };
    for (const key of ['zoneId', 'type', 'name', 'content'] as const) {
      const payload: Record<string, unknown> = { ...full };
      delete payload[key];
      const fetchMock = vi.fn<typeof fetch>();
      await expect(
        ACTIONS['create-dns-record']!({ token: 't', fetch: fetchMock, payload }),
      ).rejects.toThrow('zoneId, type, name, content are required');
      expect(fetchMock).not.toHaveBeenCalled();
    }
  });
});

describe('ACTIONS["purge-cache"] — 入口の検査と送り方', () => {
  it('zoneId が無ければ送らない', async () => {
    const fetchMock = vi.fn<typeof fetch>();
    await expect(
      ACTIONS['purge-cache']!({ token: 't', fetch: fetchMock, payload: { purgeEverything: true } }),
    ).rejects.toThrow('zoneId is required');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('purgeEverything も files も無ければ送らない', async () => {
    for (const payload of [{ zoneId: 'z' }, { zoneId: 'z', files: [] }]) {
      const fetchMock = vi.fn<typeof fetch>();
      await expect(
        ACTIONS['purge-cache']!({ token: 't', fetch: fetchMock, payload }),
      ).rejects.toThrow('either purgeEverything=true or non-empty files[] is required');
      // 送ってから断るのでは遅い — キャッシュは消えてしまう。
      expect(fetchMock).not.toHaveBeenCalled();
    }
  });

  it('POST で JSON として送り、トークンは Authorization だけに載る', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse(okWrap({ id: 'p1' })));
    await ACTIONS['purge-cache']!({
      token: 'cf-secret',
      fetch: fetchMock,
      payload: { zoneId: 'z', purgeEverything: true },
    });
    const [url, init] = fetchMock.mock.calls[0]! as [string, RequestInit];
    expect(url).toBe('https://api.cloudflare.com/client/v4/zones/z/purge_cache');
    expect(url).not.toContain('cf-secret');
    expect(init.method).toBe('POST');
    const headers = init.headers as Record<string, string>;
    expect(headers.Authorization).toBe('Bearer cf-secret');
    expect(headers['Content-Type']).toBe('application/json');
  });

  it('ゾーン id は URL に埋める前に符号化する', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse(okWrap({ id: 'p2' })));
    await ACTIONS['purge-cache']!({
      token: 't',
      fetch: fetchMock,
      payload: { zoneId: 'a/b?c', purgeEverything: true },
    });
    const url = String(fetchMock.mock.calls[0]![0]);
    // 符号化しないと別の経路 (/zones/a/b?c/purge_cache) を叩くことになる。
    expect(url).toBe('https://api.cloudflare.com/client/v4/zones/a%2Fb%3Fc/purge_cache');
  });
});

// --- 応答の読み方 ------------------------------------------------------

describe('unwrap — Cloudflare の封筒', () => {
  it('success=false で errors が空でも「不明なエラー」として伝える', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({ result: null, success: false, errors: [], messages: [] }))
      .mockResolvedValueOnce(jsonResponse(okWrap([])));
    const err = await fetchCloudflareSnapshot({ token: 't', fetch: fetchMock }).then(
      () => null,
      (e: Error) => e,
    );
    expect(err).toBeInstanceOf(FetchError);
    expect((err as Error).message).toBe('cloudflare unknown Cloudflare error');
    expect((err as FetchError).serviceId).toBe('cloudflare');
  });

  it('errors ごと無い応答でも落ちずに「不明なエラー」にする', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({ result: null, success: false }))
      .mockResolvedValueOnce(jsonResponse(okWrap([])));
    await expect(fetchCloudflareSnapshot({ token: 't', fetch: fetchMock })).rejects.toThrow(
      'cloudflare unknown Cloudflare error',
    );
  });

  it('errors はあるが message が無い場合も「不明なエラー」にする', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        jsonResponse({ result: null, success: false, errors: [{ code: 1 }], messages: [] }),
      )
      .mockResolvedValueOnce(jsonResponse(okWrap([])));
    await expect(fetchCloudflareSnapshot({ token: 't', fetch: fetchMock })).rejects.toThrow(
      'cloudflare unknown Cloudflare error',
    );
  });
});

describe('fetchCloudflareSnapshot — 欠けた項目と送り先', () => {
  it('plan / account / name_servers が無いゾーンでも落ちない', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse(okWrap({ id: 'u', email: 'e', username: 'n' })))
      .mockResolvedValueOnce(
        jsonResponse(okWrap([{ id: 'z1', name: 'a.example', status: 'active' }])),
      );
    const snap = await fetchCloudflareSnapshot({ token: 't', fetch: fetchMock });
    expect(snap.zones[0]).toMatchObject({
      plan: '',
      accountName: '',
      nameServers: [],
      devModeRemainingSec: 0,
    });
  });

  it('user と zones を Bearer + Accept で叩く', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse(okWrap({ id: 'u', email: 'e', username: 'n' })))
      .mockResolvedValueOnce(jsonResponse(okWrap([])));
    await fetchCloudflareSnapshot({ token: 'cf-secret', fetch: fetchMock });

    const userCall = fetchMock.mock.calls.find((c) => String(c[0]).endsWith('/user'))!;
    expect(String(userCall[0])).toBe('https://api.cloudflare.com/client/v4/user');
    expect(cfHeadersOf(userCall).Authorization).toBe('Bearer cf-secret');
    // Accept が落ちると Cloudflare は HTML を返すことがある。
    expect(cfHeadersOf(userCall).Accept).toBe('application/json');
  });

  it('ページ送りは 20 ページで打ち切る（最大 1000 件）', async () => {
    // 常に満杯のページを返すので、上限が無ければ止まらない。
    const fullPage = () => jsonResponse(okWrap(Array.from({ length: 50 }, (_, i) => ({ id: `z${i}` }))));
    const fetchMock = vi.fn<typeof fetch>().mockImplementation((input) =>
      Promise.resolve(
        String(input).includes('/zones')
          ? fullPage()
          : jsonResponse(okWrap({ id: 'u', email: 'e', username: 'n' })),
      ),
    );

    const snap = await fetchCloudflareSnapshot({ token: 't', fetch: fetchMock });
    expect(snap.zones).toHaveLength(1000);

    const zoneCalls = fetchMock.mock.calls.filter((c) => String(c[0]).includes('/zones'));
    expect(zoneCalls).toHaveLength(20);
    // 1 ページ目から 20 ページ目まで、50 件ずつ。
    expect(String(zoneCalls[0]![0])).toContain('per_page=50&page=1');
    expect(String(zoneCalls[19]![0])).toContain('per_page=50&page=20');
  });
});

// --- どのサービスが落ちたか --------------------------------------------
//
// `jsonFetch` が投げる `FetchError` には serviceId が乗る。3 つの
// 呼び出し口それぞれで正しく名乗ることを見る (取得・DNS 作成・purge)。

describe('HTTP レベルの失敗は cloudflare のものとして伝わる', () => {
  it('取得', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response('unauthorized', { status: 401 }));
    await expect(fetchCloudflareSnapshot({ token: 't', fetch: fetchMock })).rejects.toMatchObject({
      serviceId: 'cloudflare',
      status: 401,
    });
  });

  it('DNS レコード作成', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response('forbidden', { status: 403 }));
    await expect(
      ACTIONS['create-dns-record']!({
        token: 't',
        fetch: fetchMock,
        payload: { zoneId: 'z', type: 'A', name: 'n', content: '203.0.113.1' },
      }),
    ).rejects.toMatchObject({ serviceId: 'cloudflare', status: 403 });
  });

  it('キャッシュ削除', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response('too many requests', { status: 429 }));
    await expect(
      ACTIONS['purge-cache']!({
        token: 't',
        fetch: fetchMock,
        payload: { zoneId: 'z', purgeEverything: true },
      }),
    ).rejects.toMatchObject({ serviceId: 'cloudflare', status: 429 });
  });
});
