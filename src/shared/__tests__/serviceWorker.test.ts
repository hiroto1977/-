import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import vm from 'node:vm';

/**
 * `assets/sw.js` の検査。
 *
 * Service Worker は公開版のオリジンで**全てのページ読み込みに介入**するのに、
 * これまで一行もテストが無かった。ビルドにも型検査にも乗らない素の JS なので、
 * 壊れても誰も気付かない位置にある。
 *
 * 素の JS を `node:vm` に読み込み、`self.addEventListener` で登録される
 * ハンドラを捕まえて直接叩く。ブラウザは要らない。
 */

const SW_SOURCE = readFileSync(resolve(__dirname, '../../../assets/sw.js'), 'utf8');

const ORIGIN = 'https://example.test';

interface CacheStub {
  readonly put: (req: unknown, res: unknown) => Promise<void>;
  readonly puts: { req: unknown; res: unknown }[];
  /** install が渡した URL の一覧 (原子的な addAll ぶん)。 */
  readonly addAlls: string[][];
}

interface Harness {
  readonly fetchHandler: (event: FetchEventStub) => void;
  /**
   * `install` ハンドラ。**2026-09-26 (パス 480) まで捕まえていなかった** ——
   * 上の harness は `fetch` だけを取り出し、cache スタブには `addAll` も無かったので、
   * install を叩いても `c.addAll` が undefined で投げ、`.catch(() => undefined)` が
   * それを飲んでいた。つまり precache は**検査の中で黙って何もしない**状態で、
   * 「アプリ本体 (gzip 3.87 MiB) を全訪問者の背景で取る」ことに誰も気付けなかった。
   */
  readonly installHandler: (event: ExtendableEventStub) => void;
  readonly activateHandler: (event: ExtendableEventStub) => void;
  readonly cache: CacheStub;
  /** activate が消したキャッシュ名。 */
  readonly deleted: string[];
}

interface ExtendableEventStub {
  waitUntil: (p: Promise<unknown>) => void;
  waited: Promise<unknown>[];
}

function makeExtendableEvent(): ExtendableEventStub {
  const ev: ExtendableEventStub = {
    waited: [],
    waitUntil(p) {
      ev.waited.push(p);
    },
  };
  return ev;
}

interface FetchEventStub {
  request: { url: string; method: string; mode?: string };
  respondWith: (p: Promise<unknown>) => void;
  responded: Promise<unknown> | null;
}

function makeEvent(url: string, method = 'GET', mode = 'no-cors'): FetchEventStub {
  const ev: FetchEventStub = {
    request: { url, method, mode },
    responded: null,
    respondWith(p) {
      ev.responded = p;
    },
  };
  return ev;
}

/** fetch の戻り値と、キャッシュ内容を差し替えて sw.js を読み込む。 */
function loadSw(opts: {
  fetchResult: () => Promise<unknown>;
  cacheMatch?: (req: unknown) => Promise<unknown>;
  /** activate の対照用: 既に在るキャッシュ名。 */
  existingCacheNames?: string[];
}): Harness {
  const puts: { req: unknown; res: unknown }[] = [];
  const addAlls: string[][] = [];
  const cache: CacheStub = {
    puts,
    addAlls,
    put(req, res) {
      puts.push({ req, res });
      return Promise.resolve();
    },
    // 実物と同じ**原子的**な形にする: 実 chromium の実測 (2026-09-26) では
    // 1 件でも失敗すると `TypeError: Failed to execute 'addAll' on 'Cache':
    // Request failed` を投げ、**キャッシュには 1 件も残らない**。ここでは
    // 「何を渡したか」だけを記録する (失敗の再現は要らない — 渡す一覧を
    // 小さく保つことがこの検査の主張である)。
    addAll(urls: string[]) {
      addAlls.push([...urls]);
      return Promise.resolve();
    },
  } as CacheStub & { addAll: (urls: string[]) => Promise<void> };
  const deleted: string[] = [];
  const caches = {
    open: () => Promise.resolve(cache),
    keys: () => Promise.resolve(opts.existingCacheNames ?? []),
    delete: (name: string) => {
      deleted.push(name);
      return Promise.resolve(true);
    },
    match: opts.cacheMatch ?? (() => Promise.resolve(undefined)),
  };
  const listeners: Record<string, (event: unknown) => void> = {};
  const self = {
    addEventListener: (type: string, fn: (event: unknown) => void) => {
      listeners[type] = fn;
    },
    skipWaiting: () => undefined,
    clients: { claim: () => Promise.resolve() },
    location: { origin: ORIGIN },
  };
  const ctx: Record<string, unknown> = {
    self,
    caches,
    fetch: () => opts.fetchResult(),
    URL,
    Response,
    Promise,
  };
  vm.createContext(ctx);
  vm.runInContext(SW_SOURCE, ctx);
  const fetchHandler = listeners.fetch;
  if (!fetchHandler) throw new Error('sw.js が fetch ハンドラを登録しなかった');
  const installHandler = listeners.install;
  if (!installHandler) throw new Error('sw.js が install ハンドラを登録しなかった');
  const activateHandler = listeners.activate;
  if (!activateHandler) throw new Error('sw.js が activate ハンドラを登録しなかった');
  return {
    fetchHandler: fetchHandler as (e: FetchEventStub) => void,
    installHandler: installHandler as (e: ExtendableEventStub) => void,
    activateHandler: activateHandler as (e: ExtendableEventStub) => void,
    cache,
    deleted,
  };
}

/** 最小の Response 代用。`ok` と `clone()` だけあればここでは足りる。 */
function res(status: number): { status: number; ok: boolean; clone: () => unknown } {
  const r = { status, ok: status >= 200 && status < 300, clone: () => r };
  return r;
}

describe('service worker — キャッシュ対象の絞り込み', () => {
  it('同一オリジンの 200 応答はキャッシュに入れる', async () => {
    const h = loadSw({ fetchResult: () => Promise.resolve(res(200)) });
    const ev = makeEvent(`${ORIGIN}/app.html`);
    h.fetchHandler(ev);
    await ev.responded;
    await Promise.resolve();
    expect(h.cache.puts).toHaveLength(1);
  });

  // 説明文は最初から「取得成功分だけキャッシュへ反映」と書いてあったが、
  // 実装は応答を何でも保存していた。5xx を焼き付けると、次にオフラインに
  // なったとき利用者にはその 5xx が返り、アプリが起動しなくなる。
  it('500 応答はキャッシュに入れない', async () => {
    const h = loadSw({ fetchResult: () => Promise.resolve(res(500)) });
    const ev = makeEvent(`${ORIGIN}/app.html`);
    h.fetchHandler(ev);
    await ev.responded;
    await Promise.resolve();
    expect(h.cache.puts).toHaveLength(0);
  });

  it('404 応答もキャッシュに入れない', async () => {
    const h = loadSw({ fetchResult: () => Promise.resolve(res(404)) });
    const ev = makeEvent(`${ORIGIN}/missing.json`);
    h.fetchHandler(ev);
    await ev.responded;
    await Promise.resolve();
    expect(h.cache.puts).toHaveLength(0);
  });

  it('失敗応答もそのまま呼び出し側へ返す (握り潰さない)', async () => {
    const h = loadSw({ fetchResult: () => Promise.resolve(res(404)) });
    const ev = makeEvent(`${ORIGIN}/missing.json`);
    h.fetchHandler(ev);
    const out = (await ev.responded) as { status: number };
    expect(out.status).toBe(404);
  });
});

describe('service worker — 介入する範囲', () => {
  it('別オリジンには介入しない (第三者 API の応答を端末に残さない)', () => {
    const h = loadSw({ fetchResult: () => Promise.resolve(res(200)) });
    const ev = makeEvent('https://api.github.com/user');
    h.fetchHandler(ev);
    expect(ev.responded).toBeNull();
  });

  it('GET 以外には介入しない', () => {
    const h = loadSw({ fetchResult: () => Promise.resolve(res(200)) });
    const ev = makeEvent(`${ORIGIN}/app.html`, 'POST');
    h.fetchHandler(ev);
    expect(ev.responded).toBeNull();
  });

  // ネガティブコントロール: 「何にも介入しない」実装になっていないこと。
  it('同一オリジンの GET には介入する', () => {
    const h = loadSw({ fetchResult: () => Promise.resolve(res(200)) });
    const ev = makeEvent(`${ORIGIN}/app.html`);
    h.fetchHandler(ev);
    expect(ev.responded).not.toBeNull();
  });
});

describe('service worker — オフライン時の代替', () => {
  it('通信できないときはキャッシュを返す', async () => {
    const hit = { cached: true };
    const h = loadSw({
      fetchResult: () => Promise.reject(new Error('offline')),
      cacheMatch: () => Promise.resolve(hit),
    });
    const ev = makeEvent(`${ORIGIN}/app.html`);
    h.fetchHandler(ev);
    expect(await ev.responded).toBe(hit);
  });

  it('キャッシュも無い画面遷移はアプリシェルへ落とす', async () => {
    const shell = { shell: true };
    const h = loadSw({
      fetchResult: () => Promise.reject(new Error('offline')),
      cacheMatch: (req) => Promise.resolve(req === './app.html' ? shell : undefined),
    });
    const ev = makeEvent(`${ORIGIN}/whatever`, 'GET', 'navigate');
    h.fetchHandler(ev);
    expect(await ev.responded).toBe(shell);
  });

  // サブリソース要求に HTML を返すと、呼び出し側が HTML を JSON として
  // 解釈して不可解なエラーになる。画面遷移だけを落とす。
  it('キャッシュも無いサブリソース要求はアプリシェルへ落とさない', async () => {
    const shell = { shell: true };
    const h = loadSw({
      fetchResult: () => Promise.reject(new Error('offline')),
      cacheMatch: (req) => Promise.resolve(req === './app.html' ? shell : undefined),
    });
    const ev = makeEvent(`${ORIGIN}/data.json`, 'GET', 'cors');
    h.fetchHandler(ev);
    expect(await ev.responded).not.toBe(shell);
  });
});

/*
 * **install が何を取るか** (2026-09-26 · パス 480)。
 *
 * ここは 2026-07 の SW 導入から 2026-09-26 まで **1 件も検査が無かった**。上の
 * describe 群は「SW が走っている前提で何を焼くか」(= fetch ハンドラ) しか見ておらず、
 * harness も `install` を取り出していなかった (`distributedArtifactNoPwa.test.ts` の
 * docblock が「あの 2 つは…『どこで走るか』は見ていない」と書いた当のことの、
 * もう 1 つの面である)。
 *
 * 見えていなかったもの: `PRECACHE` の 1 件目が `./app.html` —— **アプリ本体**だった。
 * `install` は `inject-pwa` が登録スクリプトを差し込んだ全頁で走るので、
 * **公開サイトの根 (ランディング) を開いただけで**背景で取りに行っていた。
 * gzip の実測 (2026-09-26):
 *
 *   app.html 4,056,514 B / index.html 8,906 B / manifest 355 B / icon 309 B
 *   → precache 合計 4,066,084 B のうち **99.76% が app.html**
 *
 * そして `Cache.addAll` は原子的である (実 chromium で実測): 1 件でも失敗すると
 * 9.6 KiB のシェルまで一緒に捨てられる。**細い回線 —— precache が要るとされた
 * まさにその場面 —— で、費用を払い終えて効き目 0 になっていた。**
 */
describe('service worker — install が取る物 (パス 480)', () => {
  /** publish されるアプリ HTML の名前。1 つでも precache に入れば落とす。 */
  const APP_BUILDS = ['app.html', 'standalone.html', 'lite.html'];
  const SHELL = ['./index.html', './manifest.webmanifest', './icon.svg'];

  function runInstall(): { precached: string[]; waited: number } {
    const sw = loadSw({ fetchResult: () => Promise.resolve(res(200)) });
    const ev = makeExtendableEvent();
    sw.installHandler(ev);
    // addAll は同期で呼ばれる (caches.open の then の中) ので 1 tick 待つ。
    return { precached: sw.cache.addAlls.flat(), waited: ev.waited.length };
  }

  it('★ install は waitUntil を使う (何もしていないのではない)', () => {
    expect(runInstall().waited).toBeGreaterThanOrEqual(1);
  });

  it('★ precache にアプリ本体を入れない (訪問者が頼んでいない 3.87 MiB を負わせない)', async () => {
    const sw = loadSw({ fetchResult: () => Promise.resolve(res(200)) });
    const ev = makeExtendableEvent();
    sw.installHandler(ev);
    await Promise.all(ev.waited);
    const precached = sw.cache.addAlls.flat();
    expect(precached.length, 'precache が空 = 走査が的を外した').toBeGreaterThan(0);
    const offenders = precached.filter((u) => APP_BUILDS.some((b) => u.endsWith(b)));
    expect(
      offenders,
      'アプリ本体を install で取ると、ランディングを開いただけの訪問者が gzip 3.87 MiB を払う'
        + ' (しかも addAll は原子的なので、落ちるとシェルも残らない)',
    ).toEqual([]);
  });

  it('★ precache はシェル 3 件ちょうど (小さいので原子性が罠にならない)', async () => {
    const sw = loadSw({ fetchResult: () => Promise.resolve(res(200)) });
    const ev = makeExtendableEvent();
    sw.installHandler(ev);
    await Promise.all(ev.waited);
    expect(sw.cache.addAlls.flat().sort()).toEqual([...SHELL].sort());
  });

  it('★ activate は名前の違う古いキャッシュを実際に消す (以前の precache を回収する)', async () => {
    // **振る舞いで見る** —— 綴りを grep すると「消す形が在る」しか言えず、
    // `keys()` の結果を使わなくなった日に黙る。
    const sw = loadSw({
      fetchResult: () => Promise.resolve(res(200)),
      existingCacheNames: ['service-hub-v1', 'service-hub-v2', 'service-hub-v3'],
    });
    const ev = makeExtendableEvent();
    sw.activateHandler(ev);
    await Promise.all(ev.waited);
    expect(sw.deleted.sort(), '古い版を消さないと、以前の precache (生 11.97 MB) が端末に残り続ける')
      .toEqual(['service-hub-v1', 'service-hub-v2']);
  });

  it('★ 版が上がっている (v2 のままでは既存の端末から回収できない)', async () => {
    // 回収は disk の都合だけではない: Cache Storage はオリジンの保存枠を食い、
    // 立ち退きは暗号化されたトークンごと持っていく (storageDurability.ts · パス 351)。
    const sw = loadSw({
      fetchResult: () => Promise.resolve(res(200)),
      existingCacheNames: ['service-hub-v2'],
    });
    const ev = makeExtendableEvent();
    sw.activateHandler(ev);
    await Promise.all(ev.waited);
    expect(sw.deleted, 'v2 が「今の版」なら消されない = パス 480 より前の precache が残る')
      .toContain('service-hub-v2');
  });
});

/*
 * **オフラインの遷移で返す物** (パス 480)。
 *
 * 以前は `caches.match('./app.html')` ただ 1 つだった。precache から app.html を
 * 外すと、1 度も開いていない端末ではそこが `undefined` になり `respondWith(undefined)`
 * = 素の網エラーになる。**手元に在る物の順**に落とすことで、以前より悪くならない:
 *   ・アプリを開いたことがある → app.html (以前と同じ)
 *   ・ランディングだけ見た     → index.html (以前は網エラー)
 */
describe('service worker — オフラインの遷移の落とし先 (パス 480)', () => {
  function offlineNavigate(cached: Record<string, unknown>) {
    const sw = loadSw({
      fetchResult: () => Promise.reject(new Error('offline')),
      cacheMatch: (req) => {
        const key = typeof req === 'string' ? req : (req as { url: string }).url;
        return Promise.resolve(cached[key]);
      },
    });
    const ev = makeEvent(`${ORIGIN}/-/anything`, 'GET', 'navigate');
    sw.fetchHandler(ev);
    return ev.responded;
  }

  it('★ アプリを開いたことがあれば app.html を返す (以前と同じ)', async () => {
    const app = { tag: 'app' };
    await expect(offlineNavigate({ './app.html': app, './index.html': { tag: 'landing' } })).resolves.toBe(app);
  });

  it('★ ランディングだけ見た端末には index.html を返す (以前は網エラーだった)', async () => {
    const landing = { tag: 'landing' };
    await expect(offlineNavigate({ './index.html': landing })).resolves.toBe(landing);
  });

  it('★ どちらも無ければ代わりを捏造しない', async () => {
    const got = await offlineNavigate({});
    // Response.error() は Node の Response でも作れる (type: 'error')。
    expect(got === undefined || (got as Response).type === 'error').toBe(true);
  });
});
