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

/*
 * **同梱の manifest が名乗る数を、実物へ縛る。**
 *
 * `assets/manifest.webmanifest` の `description` は PWA の導入ダイアログや
 * アプリ一覧に**そのまま出る**。ところが 2026-08-25 の実測で「**64 サービス**」と
 * 書いてあった —— 実際は 74 で、10 件ぶん古い。
 *
 * `verify:arch` は同じ数 (`service count`) を **docs に対しては**照合しているが、
 * 対象が `docs/ARCHITECTURE.md` なので**出荷物は見ていなかった**。
 * 今日ここまでで何度も書いた「文書が実物より小さい」が、
 * 文書ではなく**出荷する成果物**で起きていた形である。
 *
 * 中身は害の無い数字だが、**利用者に見える面が実物と違う**ことに変わりはない。
 * 数を書く以上、実物から縛る。
 */
describe('PWA manifest — 名乗る数が実物と合っている', () => {
  const MANIFEST = JSON.parse(
    readFileSync(path.join(__dirname, '../../../assets/manifest.webmanifest'), 'utf8'),
  ) as { description: string; start_url: string; scope: string; icons: unknown[] };

  /*
   * **どの数で縛るかを、文面が決める。**
   *
   * `description` は「…を **1 つのサイドバー UI に統合した**」と書いている。
   * つまり名乗っているのは**サイドバーに並ぶ数**であって、`SERVICE_IDS` の
   * 総数ではない。両者は 2 件ずれる —— `uber-eats` / `demae-can` は
   * `BusinessPage` が snapshot を内部で使うだけで**独立した画面を持たない**
   * (`sidebarCoverage.test.ts` の `SIDEBAR_LESS` に理由つきで載っている)。
   *
   * 最初 `SERVICE_IDS` (74) で縛ったが、**文面が言っているのはサイドバーの
   * ほう**なので 72 が正しい。`dist/landing.html` も同じ数を出す
   * (あちらは自分が並べた数なので、そもそも一致する)。
   *
   * **数を書くときは、その文が何を数えているかまで読む。**
   */
  const SERVICE_COUNT = (() => {
    const src = readFileSync(path.join(__dirname, '../services.ts'), 'utf8');
    return (src.match(/^\s*category:\s*'/gm) ?? []).length;
  })();

  it('走査が生きている (サイドバーのサービスが 1 つ以上見つかる)', () => {
    expect(SERVICE_COUNT).toBeGreaterThan(50);
  });

  it('★ description のサービス数がサイドバーの実数と一致する', () => {
    const m = /(\d+)\s*サービス/.exec(MANIFEST.description);
    expect(m, 'description がサービス数を名乗っていない').not.toBeNull();
    expect(
      Number(m![1]),
      'manifest の数が古い — 導入ダイアログに出るので実物へ合わせること',
    ).toBe(SERVICE_COUNT);
  });

  /*
   * **入力面を増やしていないこと。** `share_target` / `file_handlers` /
   * `protocol_handlers` は OS から任意の入力を受け取る口で、増えれば
   * 検証すべき経路が増える。今は 1 つも無い (2026-08-25 実測)。
   */
  it('OS からの入力口を宣言していない', () => {
    for (const k of ['share_target', 'file_handlers', 'protocol_handlers']) {
      expect(Object.hasOwn(MANIFEST, k), `${k} が増えている — 入力の検証が要る`).toBe(false);
    }
  });

  it('scope と start_url が相対のまま (公開先を固定しない)', () => {
    expect(MANIFEST.scope.startsWith('./')).toBe(true);
    expect(MANIFEST.start_url.startsWith('./')).toBe(true);
  });
});
