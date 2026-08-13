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
}

interface Harness {
  readonly fetchHandler: (event: FetchEventStub) => void;
  readonly cache: CacheStub;
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
}): Harness {
  const puts: { req: unknown; res: unknown }[] = [];
  const cache: CacheStub = {
    puts,
    put(req, res) {
      puts.push({ req, res });
      return Promise.resolve();
    },
  };
  const caches = {
    open: () => Promise.resolve(cache),
    keys: () => Promise.resolve([]),
    delete: () => Promise.resolve(true),
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
  return { fetchHandler: fetchHandler as (e: FetchEventStub) => void, cache };
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
