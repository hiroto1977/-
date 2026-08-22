import { describe, expect, it, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

/*
 * PWA の Service Worker (`assets/sw.js`)。
 *
 * ここは**ブラウザ版の全リクエストが通る**唯一の場所で、完全性チェーンの
 * 保護対象でもあります。それでいて検査が一本もありませんでした。
 *
 * このファイルには実際の事故の記録が残っています — 2026-07 監査の前は
 * 全 GET を Cache Storage へ書いており、CORS 対応の第三者 API
 * (GitHub / HIBP など) の応答、つまり業務データや漏洩調査の結果が、
 * **平文で端末に無期限保存**されていました。Vault (AES-GCM・自動ロック) の
 * 保護を迂回する経路です。直っていることを検査で留めます。
 *
 * `self` などのグローバルを引数として渡し、ソースをそのまま評価して
 * 登録されたリスナーを掴みます。
 */

type Listener = (ev: Record<string, unknown>) => void;

interface Harness {
  listeners: Map<string, Listener>;
  cacheStore: Map<string, Map<string, unknown>>;
  putCalls: { cache: string; url: string }[];
  fetched: string[];
  setFetch: (fn: (req: FakeReq) => Promise<unknown>) => void;
}

interface FakeReq {
  url: string;
  method: string;
  mode?: string;
}

const ORIGIN = 'https://hiroto1977.github.io';

function load(): Harness {
  const src = readFileSync(path.resolve(process.cwd(), 'assets/sw.js'), 'utf8');
  const listeners = new Map<string, Listener>();
  const cacheStore = new Map<string, Map<string, unknown>>();
  const putCalls: { cache: string; url: string }[] = [];
  const fetched: string[] = [];
  let fetchImpl: (req: FakeReq) => Promise<unknown> = async () => ({ ok: true, clone: () => ({}) });

  const cacheFor = (name: string) => {
    if (!cacheStore.has(name)) cacheStore.set(name, new Map());
    const m = cacheStore.get(name)!;
    return {
      addAll: async (urls: string[]) => urls.forEach((u) => m.set(u, { precached: true })),
      put: async (req: FakeReq, res: unknown) => {
        putCalls.push({ cache: name, url: req.url });
        m.set(req.url, res);
      },
    };
  };
  const caches = {
    open: async (name: string) => cacheFor(name),
    keys: async () => [...cacheStore.keys()],
    delete: async (name: string) => cacheStore.delete(name),
    match: async (reqOrUrl: FakeReq | string) => {
      const key = typeof reqOrUrl === 'string' ? reqOrUrl : reqOrUrl.url;
      for (const m of cacheStore.values()) if (m.has(key)) return m.get(key);
      return undefined;
    },
  };
  const self = {
    addEventListener: (name: string, fn: Listener) => listeners.set(name, fn),
    skipWaiting: () => {},
    clients: { claim: async () => {} },
    location: { origin: ORIGIN },
  };
  const fetchFn = (req: FakeReq) => {
    fetched.push(req.url);
    return fetchImpl(req);
  };
  const Response = { error: () => ({ networkError: true }) };

  new Function('self', 'caches', 'fetch', 'Response', src)(self, caches, fetchFn, Response);
  return { listeners, cacheStore, putCalls, fetched, setFetch: (f) => (fetchImpl = f) };
}

/** fetch イベントを流し、respondWith に渡された応答を返す (未処理なら null)。 */
async function runFetch(h: Harness, req: FakeReq): Promise<unknown | null> {
  let responded: unknown | null = null;
  let handled = false;
  h.listeners.get('fetch')!({
    request: req,
    respondWith: (p: unknown) => {
      handled = true;
      responded = p;
    },
  });
  if (!handled) return null;
  return await responded;
}

const okRes = (tag: string) => ({ ok: true, tag, clone: () => ({ ok: true, tag }) });
const badRes = (status: number) => ({ ok: false, status, clone: () => ({ ok: false, status }) });

let h: Harness;
beforeEach(() => {
  h = load();
});

describe('第三者の応答を端末へ保存しない', () => {
  it('別オリジンの GET はキャッシュに一切触れず素通しする', async () => {
    // ここが緩むと、GitHub / HIBP の応答 (業務データ・漏洩調査結果) が
    // 平文で端末に無期限保存され、Vault の暗号化を迂回する。
    h.setFetch(async () => okRes('third-party'));
    for (const url of [
      'https://api.github.com/user/repos',
      'https://haveibeenpwned.com/api/v3/breachedaccount/x',
      'https://api.anthropic.com/v1/messages',
    ]) {
      const res = await runFetch(h, { url, method: 'GET' });
      expect(res, url).toBeNull(); // respondWith すら呼ばない = 完全な素通し
    }
    expect(h.putCalls).toEqual([]);
    expect(h.cacheStore.size).toBe(0);
  });

  it('URL として読めないものは別オリジン扱い (fail-closed)', async () => {
    h.setFetch(async () => okRes('x'));
    expect(await runFetch(h, { url: 'not a url', method: 'GET' })).toBeNull();
    expect(h.putCalls).toEqual([]);
  });

  it('GET 以外は素通しする (書き込み要求を横取りしない)', async () => {
    for (const method of ['POST', 'PUT', 'DELETE', 'HEAD', 'PATCH']) {
      expect(await runFetch(h, { url: `${ORIGIN}/app.html`, method }), method).toBeNull();
    }
    expect(h.putCalls).toEqual([]);
  });
});

describe('同一オリジンは network-first で保存する', () => {
  it('取得できた同一オリジンの GET はキャッシュへ入れる', async () => {
    h.setFetch(async () => okRes('shell'));
    const res = (await runFetch(h, { url: `${ORIGIN}/app.html`, method: 'GET' })) as {
      tag: string;
    };
    expect(res.tag).toBe('shell');
    expect(h.putCalls.map((p) => p.url)).toEqual([`${ORIGIN}/app.html`]);
  });

  it('4xx / 5xx は保存しないが、応答はそのまま返す', async () => {
    // 5xx をアプリシェルとして焼き付けると、次にオフラインになったとき
    // 利用者に返るのはその 5xx で、アプリが起動しなくなる。
    for (const status of [404, 500, 503]) {
      const fresh = load();
      fresh.setFetch(async () => badRes(status));
      const res = (await runFetch(fresh, { url: `${ORIGIN}/app.html`, method: 'GET' })) as {
        status: number;
      };
      expect(res.status, String(status)).toBe(status); // 握り潰さない
      expect(fresh.putCalls, String(status)).toEqual([]);
    }
  });

  it('通信できたときはキャッシュより取得を優先する (古い HTML を握らない)', async () => {
    h.setFetch(async () => okRes('fresh'));
    await runFetch(h, { url: `${ORIGIN}/app.html`, method: 'GET' });
    h.setFetch(async () => okRes('newer'));
    const res = (await runFetch(h, { url: `${ORIGIN}/app.html`, method: 'GET' })) as {
      tag: string;
    };
    expect(res.tag).toBe('newer');
  });
});

describe('オフラインの falling back', () => {
  it('キャッシュにあればそれを返す', async () => {
    h.setFetch(async () => okRes('cached-once'));
    await runFetch(h, { url: `${ORIGIN}/app.html`, method: 'GET' });
    h.setFetch(async () => {
      throw new Error('offline');
    });
    const res = (await runFetch(h, { url: `${ORIGIN}/app.html`, method: 'GET' })) as { tag: string };
    expect(res.tag).toBe('cached-once');
  });

  it('ページ遷移だけアプリシェルへ倒す', async () => {
    await h.listeners.get('install')!({ waitUntil: async (p: Promise<unknown>) => await p });
    h.setFetch(async () => {
      throw new Error('offline');
    });
    const res = await runFetch(h, {
      url: `${ORIGIN}/some/deep/route`,
      method: 'GET',
      mode: 'navigate',
    });
    expect(res).toEqual({ precached: true });
  });

  it('サブリソースに HTML を返さない (JSON として読まれて壊れるため)', async () => {
    await h.listeners.get('install')!({ waitUntil: async (p: Promise<unknown>) => await p });
    h.setFetch(async () => {
      throw new Error('offline');
    });
    const res = await runFetch(h, {
      url: `${ORIGIN}/data.json`,
      method: 'GET',
      mode: 'cors',
    });
    expect(res).toEqual({ networkError: true });
  });
});

describe('キャッシュの世代交代', () => {
  it('activate で古い世代だけ消し、今の世代は残す', async () => {
    h.cacheStore.set('service-hub-v1', new Map([['old', {}]]));
    h.cacheStore.set('service-hub-v0', new Map([['older', {}]]));
    h.setFetch(async () => okRes('x'));
    await runFetch(h, { url: `${ORIGIN}/app.html`, method: 'GET' }); // 今の世代を作る
    const current = [...h.cacheStore.keys()].find((k) => k !== 'service-hub-v1' && k !== 'service-hub-v0')!;

    await h.listeners.get('activate')!({ waitUntil: async (p: Promise<unknown>) => await p });
    expect([...h.cacheStore.keys()]).toEqual([current]);
  });

  it('install はアプリシェルを先読みする', async () => {
    await h.listeners.get('install')!({ waitUntil: async (p: Promise<unknown>) => await p });
    const all = [...h.cacheStore.values()].flatMap((m) => [...m.keys()]);
    expect(all).toContain('./app.html');
    expect(all).toContain('./manifest.webmanifest');
  });
});
