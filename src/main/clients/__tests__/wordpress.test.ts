import { describe, expect, it, vi } from 'vitest';
import { fetchWordPressSnapshot, ACTIONS } from '../wordpress';

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

describe('fetchWordPressSnapshot', () => {
  it('normalizes sites and reads last_updated at the top level', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValueOnce(
      jsonResponse({
        sites: [
          {
            ID: 1,
            name: 'Paid Site',
            description: '',
            URL: 'https://paid.example',
            is_private: false,
            jetpack: false,
            last_updated: '2025-12-01 10:23:45',
            plan: { product_slug: 'business-bundle', is_free: false },
          },
        ],
      }),
    );

    const snap = await fetchWordPressSnapshot({ token: 't', fetch: fetchMock });
    expect(snap.sites[0]).toMatchObject({
      blogId: 1,
      name: 'Paid Site',
      lastUpdated: '2025-12-01',
      paidPlan: true,
    });
  });

  it('treats free_plan / is_free=true / missing plan as not paid', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValueOnce(
      jsonResponse({
        sites: [
          { ID: 1, name: 'A', description: '', URL: 'https://a', is_private: false, jetpack: false, plan: { product_slug: 'free_plan' } },
          { ID: 2, name: 'B', description: '', URL: 'https://b', is_private: false, jetpack: false, plan: { is_free: true } },
          { ID: 3, name: 'C', description: '', URL: 'https://c', is_private: false, jetpack: false },
        ],
      }),
    );

    const snap = await fetchWordPressSnapshot({ token: 't', fetch: fetchMock });
    expect(snap.sites.map((s) => s.paidPlan)).toEqual([false, false, false]);
  });

  it('marks private sites with status=private and detects jetpack platform', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValueOnce(
      jsonResponse({
        sites: [
          { ID: 1, name: 'Private', description: '', URL: 'https://p', is_private: true, jetpack: true, last_updated: '' },
        ],
      }),
    );

    const snap = await fetchWordPressSnapshot({ token: 't', fetch: fetchMock });
    expect(snap.sites[0]).toMatchObject({ status: 'private', platform: 'jetpack', lastUpdated: '' });
  });

  it('returns empty list when the API returns no sites', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValueOnce(jsonResponse({}));
    const snap = await fetchWordPressSnapshot({ token: 't', fetch: fetchMock });
    expect(snap.sites).toEqual([]);
  });
});

describe('isPaidPlan edge cases (via fetchWordPressSnapshot)', () => {
  it('treats a plan with an empty product_slug as free', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValueOnce(
      jsonResponse({
        sites: [
          {
            ID: 99,
            name: 'Empty slug',
            description: '',
            URL: 'https://e.example',
            is_private: false,
            jetpack: false,
            plan: { product_slug: '' }, // empty string
          },
        ],
      }),
    );
    const snap = await fetchWordPressSnapshot({ token: 't', fetch: fetchMock });
    expect(snap.sites[0]!.paidPlan).toBe(false);
  });

  it('treats a plan with "premium_free_trial" as free (slug contains "free")', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValueOnce(
      jsonResponse({
        sites: [
          {
            ID: 100,
            name: 'Trial',
            description: '',
            URL: 'https://t.example',
            is_private: false,
            jetpack: false,
            plan: { product_slug: 'premium_free_trial' },
          },
        ],
      }),
    );
    const snap = await fetchWordPressSnapshot({ token: 't', fetch: fetchMock });
    expect(snap.sites[0]!.paidPlan).toBe(false);
  });
});

describe('ACTIONS["create-post-draft"]', () => {
  it('POSTs to /sites/{id}/posts/new with default status=draft', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValueOnce(
      jsonResponse({ ID: 5, URL: 'https://blog/?p=5', title: 'Hi', status: 'draft' }),
    );

    const result = (await ACTIONS['create-post-draft']!({
      token: 'tok',
      fetch: fetchMock,
      payload: { siteId: '123', title: 'Hi', content: 'hello' },
    })) as { id: number; url: string; title: string };

    expect(result).toEqual({ id: 5, url: 'https://blog/?p=5', title: 'Hi' });
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('https://public-api.wordpress.com/rest/v1.1/sites/123/posts/new');
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body.status).toBe('draft');
    expect(body.title).toBe('Hi');
    expect(body.content).toBe('hello');
  });

  it('url-encodes site IDs containing slashes or unusual chars', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValueOnce(
      jsonResponse({ ID: 1, URL: '', title: 'x', status: 'draft' }),
    );
    await ACTIONS['create-post-draft']!({
      token: 't',
      fetch: fetchMock,
      payload: { siteId: 'foo.example/path', title: 'x' },
    });
    expect(fetchMock.mock.calls[0]![0]).toBe(
      'https://public-api.wordpress.com/rest/v1.1/sites/foo.example%2Fpath/posts/new',
    );
  });

  it('rejects when siteId/title are missing', async () => {
    const fetchMock = vi.fn<typeof fetch>();
    await expect(
      ACTIONS['create-post-draft']!({ token: 't', fetch: fetchMock, payload: { siteId: '1' } }),
    ).rejects.toThrow();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

// --- 有料プランの見分け方 ----------------------------------------------
//
// `is_free` の明示があればそれが最優先で、無いときだけ slug を見る。
// 順番が入れ替わると、無料プランを有料として画面に出す。

describe('有料プランの判定 — is_free と slug のどちらを信じるか', () => {
  async function paidFlagFor(plan: unknown): Promise<boolean> {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValueOnce(
      jsonResponse({
        sites: [
          {
            ID: 1,
            name: 's',
            description: '',
            URL: 'https://s.example',
            is_private: false,
            jetpack: false,
            plan,
          },
        ],
      }),
    );
    const snap = await fetchWordPressSnapshot({ token: 't', fetch: fetchMock });
    return snap.sites[0]!.paidPlan;
  }

  it('is_free=true は slug が有料っぽくても無料', async () => {
    expect(await paidFlagFor({ is_free: true, product_slug: 'business-bundle' })).toBe(false);
  });

  it('is_free=false は slug が無料っぽくても有料', async () => {
    expect(await paidFlagFor({ is_free: false, product_slug: 'free_plan' })).toBe(true);
  });

  it('is_free が無ければ slug で決める（有料 slug は有料）', async () => {
    expect(await paidFlagFor({ product_slug: 'business-bundle' })).toBe(true);
  });

  it('plan が空オブジェクトなら無料（slug 不明を有料と読まない）', async () => {
    expect(await paidFlagFor({})).toBe(false);
  });

  it('大文字の slug でも "free" を見落とさない', async () => {
    expect(await paidFlagFor({ product_slug: 'FREE_PLAN' })).toBe(false);
  });
});

// --- 送り先と資格情報 --------------------------------------------------

function wpHeadersOf(call: Parameters<typeof fetch>): Record<string, string> {
  return (call[1]?.headers ?? {}) as Record<string, string>;
}

describe('fetchWordPressSnapshot — 送り先と表示の既定', () => {
  it('WordPress.com の me/sites を叩き、トークンは Authorization だけに載る', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValueOnce(jsonResponse({ sites: [] }));
    await fetchWordPressSnapshot({ token: 'wpcom-secret', fetch: fetchMock });

    const call = fetchMock.mock.calls[0]!;
    const url = new URL(String(call[0]));
    expect(url.origin).toBe('https://public-api.wordpress.com');
    expect(url.pathname).toBe('/rest/v1.1/me/sites');
    // fields を落とすと全メタデータが返る。要る分だけ取り寄せる。
    expect(url.searchParams.get('fields')).toBe(
      'ID,name,description,URL,is_private,jetpack,last_updated,plan',
    );
    expect(wpHeadersOf(call).Authorization).toBe('Bearer wpcom-secret');
    expect(String(call[0])).not.toContain('wpcom-secret');
  });

  it('失敗したときどのサービスが落ちたか分かる', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response('unauthorized', { status: 401 }));
    await expect(fetchWordPressSnapshot({ token: 't', fetch: fetchMock })).rejects.toMatchObject({
      serviceId: 'wordpress',
      status: 401,
    });
  });

  it('Jetpack でない公開サイトは simple / active として出す', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValueOnce(
      jsonResponse({
        sites: [
          {
            ID: 7,
            name: '公開ブログ',
            description: 'd',
            URL: 'https://b.example',
            is_private: false,
            jetpack: false,
          },
        ],
      }),
    );
    const snap = await fetchWordPressSnapshot({ token: 't', fetch: fetchMock });
    expect(snap.sites[0]).toMatchObject({ platform: 'simple', status: 'active' });
  });

  it('last_updated が無いサイトは空文字にする（undefined を画面に出さない）', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValueOnce(
      jsonResponse({
        sites: [
          {
            ID: 8,
            name: 'n',
            description: 'd',
            URL: 'https://c.example',
            is_private: false,
            jetpack: false,
          },
        ],
      }),
    );
    const snap = await fetchWordPressSnapshot({ token: 't', fetch: fetchMock });
    expect(snap.sites[0]!.lastUpdated).toBe('');
  });
});

describe('ACTIONS["create-post-draft"] — 送り方', () => {
  it('posts/new へ POST し、トークンは Authorization だけに載る', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        jsonResponse({ ID: 9, URL: 'https://b.example/9', title: 'T', status: 'draft' }),
      );

    await ACTIONS['create-post-draft']!({
      token: 'wpcom-secret',
      fetch: fetchMock,
      payload: { siteId: '123', title: 'T' },
    });

    const [url, init] = fetchMock.mock.calls[0]! as [string, RequestInit];
    const parsed = new URL(url);
    expect(parsed.origin).toBe('https://public-api.wordpress.com');
    expect(parsed.pathname).toBe('/rest/v1.1/sites/123/posts/new');
    expect(url).not.toContain('wpcom-secret');

    expect(init.method).toBe('POST');
    const headers = init.headers as Record<string, string>;
    expect(headers.Authorization).toBe('Bearer wpcom-secret');
    expect(headers['Content-Type']).toBe('application/json');
  });

  it('本文を渡さなければ空文字で送る（undefined を投稿しない）', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        jsonResponse({ ID: 10, URL: 'https://b.example/10', title: 'T', status: 'draft' }),
      );
    await ACTIONS['create-post-draft']!({
      token: 't',
      fetch: fetchMock,
      payload: { siteId: '1', title: 'T' },
    });
    const init = fetchMock.mock.calls[0]![1] as RequestInit;
    expect(JSON.parse(init.body as string).content).toBe('');
  });

  it('失敗したときどのサービスが落ちたか分かる', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response('forbidden', { status: 403 }));
    await expect(
      ACTIONS['create-post-draft']!({
        token: 't',
        fetch: fetchMock,
        payload: { siteId: '1', title: 'T' },
      }),
    ).rejects.toMatchObject({ serviceId: 'wordpress', status: 403 });
  });

  it('siteId / title が欠けていれば理由を添えて断る', async () => {
    for (const payload of [{ title: 'T' }, { siteId: '1' }, {}]) {
      const fetchMock = vi.fn<typeof fetch>();
      await expect(
        ACTIONS['create-post-draft']!({ token: 't', fetch: fetchMock, payload }),
      ).rejects.toThrow('siteId and title are required');
      expect(fetchMock).not.toHaveBeenCalled();
    }
  });
});
