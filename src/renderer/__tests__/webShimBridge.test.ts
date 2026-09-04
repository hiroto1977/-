/** @vitest-environment jsdom */
import { beforeEach, describe, expect, it, vi } from 'vitest';

/*
 * ブラウザ版の橋 (`web-shim.ts`) を**動かして**確かめる。
 *
 * 既存の `bridgeSurface.security.test.ts` はソースを文字列として読み、
 * `/setToken:/` のような正規表現で確かめています。その作りだと:
 *   - コメントや型の中の `setToken:` でも通ってしまう
 *   - 橋の表面でない入れ子のプロパティを拾ってしまう
 *     (実際、局所プロパティを `getToken` と名付けたら誤検知した記録がある)
 *
 * このファイルは 1272 行・**export が 0** なので「検査する継ぎ目が無い」と
 * 言われてきましたが、継ぎ目はあります — 最終行の
 * `window.serviceHub = shim` です。preload の `exposeInMainWorld` と同じ形で、
 * 読み込めばそのまま掴めます。
 */

vi.mock('../security/vault', () => ({
  getVault: () => ({
    getToken: async () => null,
    status: async () => 'locked',
    setToken: async () => {},
    clearToken: async () => {},
    listServices: async () => [],
  }),
}));
vi.mock('../library/library', () => ({
  getLibrary: () => ({ put: async () => {}, list: async () => [] }),
}));
vi.mock('electron', () => ({
  contextBridge: { exposeInMainWorld: () => {} },
  ipcRenderer: { invoke: () => Promise.resolve() },
}));

type Surface = Record<string, unknown>;

async function loadShim(): Promise<Surface> {
  vi.resetModules();
  delete (window as unknown as { serviceHub?: unknown }).serviceHub;
  await import('../web-shim');
  return (window as unknown as { serviceHub: Surface }).serviceHub;
}

/** preload 側が `exposeInMainWorld` へ渡すオブジェクトを掴む。 */
async function loadPreload(): Promise<Surface> {
  vi.resetModules();
  let api: Surface = {};
  const electron = await import('electron');
  (electron.contextBridge as unknown as { exposeInMainWorld: (k: string, a: Surface) => void })
    .exposeInMainWorld = (_k, a) => {
    api = a;
  };
  await import('../../preload/preload');
  return api;
}

let opened: string[] = [];
let openArgs: unknown[][] = [];
beforeEach(() => {
  opened = [];
  openArgs = [];
  (window as unknown as { open: (...a: unknown[]) => void }).open = (...a: unknown[]) => {
    openArgs.push(a);
    if (typeof a[0] === 'string') opened.push(a[0]);
  };
});

describe('橋の据え付け方', () => {
  it('window.serviceHub という 1 つの名前だけを生やす', async () => {
    const shim = await loadShim();
    expect(shim).toBeDefined();
    expect(typeof shim).toBe('object');
  });

  it('生やすのは関数だけ (状態や生の資格情報を置かない)', async () => {
    const shim = await loadShim();
    for (const [name, v] of Object.entries(shim)) {
      expect(typeof v, `${name} は関数`).toBe('function');
    }
  });

  it('資格情報を読み戻す口を持たない', async () => {
    // 書き込み (setToken) と一覧 (listConfigured) だけを公開し、読み出しは
    // shim の内部に閉じる。ここが開くと、画面の JS から生のトークンが読める。
    const shim = await loadShim();
    for (const banned of ['getToken', 'readToken', 'tokens', 'vault', 'getSecret']) {
      expect(Object.keys(shim)).not.toContain(banned);
    }
  });
});

describe('デスクトップ版との約束', () => {
  it('公開する口の名前が preload と 1 文字も違わない', async () => {
    // 画面はどちらの版でも同じ `window.serviceHub` を呼ぶ。片方に足りない口が
    // あると、**その版でだけ**実行時に落ちる (型では気付けない — ブラウザ版は
    // preload を import しないので、型の上では別物)。
    const shim = Object.keys(await loadShim()).sort();
    const preload = Object.keys(await loadPreload()).sort();
    expect(shim).toEqual(preload);
    expect(shim).toHaveLength(13);
  });
});

describe('openExternal — ブラウザ版でもスキームを絞る', () => {
  it('http / https だけ新しいタブで開く', async () => {
    const shim = await loadShim();
    const openExternal = shim.openExternal as (u: string) => Promise<void>;
    await openExternal('https://example.com/a');
    await openExternal('http://example.com/b');
    expect(opened).toEqual(['https://example.com/a', 'http://example.com/b']);
  });

  it('それ以外のスキームは 1 つも開かない', async () => {
    const shim = await loadShim();
    const openExternal = shim.openExternal as (u: unknown) => Promise<void>;
    for (const url of [
      'javascript:alert(1)',
      'JaVaScRiPt:alert(1)',
      'data:text/html,<script>alert(1)</script>',
      'file:///etc/passwd',
      'blob:https://example.com/x',
      'ssh://evil.example',
      'about:blank',
      '//example.com/protocol-relative',
      '',
      undefined,
      null,
      42,
    ]) {
      await openExternal(url);
    }
    expect(opened).toEqual([]);
  });

  /*
   * **前後の空白は「開かない」ではなく「落として開く」。**
   *
   * 2026-08-23 に共有の関門 (`shared/externalUrlGate.ts`) へ寄せるまで、
   * ブラウザ版だけ `/^https?:\/\//i` の字面検査で、先頭に空白があると
   * **黙って開かなかった**。デスクトップ版は最初から `new URL` で解析して
   * おり、`'  https://example.com/  '` を正規化して開いていた
   * (`shared/__tests__/externalUrlGate.test.ts` が前から固定している)。
   *
   * 字面検査が空白を弾いていたのは**アンカーの副作用**であって、
   * 意図した守りではない。WHATWG は URL の前後の空白を落とすので、
   * 解析してから判定すれば「調べたもの」と「開くもの」は一致する。
   * 2 つのビルドで答えを揃えた側が正しい。
   */
  it('前後の空白は落として、正規化した形で開く (デスクトップ版と同じ)', async () => {
    const shim = await loadShim();
    const openExternal = shim.openExternal as (u: string) => Promise<void>;
    await openExternal(' https://example.com');
    await openExternal('  http://example.com/x  ');
    expect(opened).toEqual(['https://example.com/', 'http://example.com/x']);
  });
});

describe('据え付けは preload を上書きしない', () => {
  it('Electron 版 (preload が先に据え付け済み) では触らない', async () => {
    // デスクトップ版では preload が **main プロセスと話す本物の橋** を先に
    // 置いている。ここで上書きすると、資格情報が OS キーチェーンではなく
    // ブラウザ版の Vault へ移り、`openPath` / `revealInFolder` / ループバックの
    // OAuth も全部ブラウザ版の代用品へ静かに退化する。エラーは出ない。
    const preloadBridge = { iAmThePreloadBridge: true };
    (window as unknown as { serviceHub: unknown }).serviceHub = preloadBridge;
    vi.resetModules();
    await import('../web-shim');
    expect((window as unknown as { serviceHub: unknown }).serviceHub).toBe(preloadBridge);
  });

  it('ブラウザ版 (誰も据え付けていない) では据え付ける', async () => {
    delete (window as unknown as { serviceHub?: unknown }).serviceHub;
    vi.resetModules();
    await import('../web-shim');
    const hub = (window as unknown as { serviceHub?: Surface }).serviceHub;
    expect(hub).toBeDefined();
    expect(typeof hub!.setToken).toBe('function');
  });
});

describe('外部リンクの開き方', () => {
  it('opener を渡さず、参照元も送らない', async () => {
    // `noopener` が無いと、開いた先から `window.opener.location` でこちらを
    // 別ページへ飛ばせる (reverse tabnabbing)。`noreferrer` が無いと、
    // どの画面から来たかが相手に渡る。
    const shim = await loadShim();
    await (shim.openExternal as (u: string) => Promise<void>)('https://example.com/a');
    expect(openArgs).toHaveLength(1);
    const features = String(openArgs[0]![2]);
    expect(features).toContain('noopener');
    expect(features).toContain('noreferrer');
  });

  it('新しいタブで開く', async () => {
    const shim = await loadShim();
    await (shim.openExternal as (u: string) => Promise<void>)('https://example.com/a');
    expect(openArgs[0]![1]).toBe('_blank');
  });
});

describe('ブラウザ版で「できないこと」の答え方', () => {
  it('版番号はブラウザ版であることが分かる形で返す', async () => {
    const shim = await loadShim();
    const v = await (shim.getVersion as () => Promise<string>)();
    expect(v).toContain('web');
  });

  it('OAuth は非対応と答える (黙って false を返さない)', async () => {
    // ブラウザ版にはループバックの受け口が無いので実行できない。
    const shim = await loadShim();
    expect(await (shim.oauthSupported as () => Promise<boolean>)()).toBe(false);
    const r = (await (shim.authorize as () => Promise<{ ok: boolean; code: string }>)()) as {
      ok: boolean;
      code: string;
    };
    expect(r.ok).toBe(false);
    expect(r.code).toBe('not_supported');
  });

  it('保管の状態は「暗号化されている」と、秘密を含まない形で答える', async () => {
    const shim = await loadShim();
    const p = (await (shim.storageProtection as () => Promise<Record<string, unknown>>)()) as {
      encrypted: boolean;
      plainCount: number;
    };
    // ブラウザ版は必ず WebCrypto の Vault を通すので、平文保管は存在しない。
    expect(p.encrypted).toBe(true);
    expect(p.plainCount).toBe(0);
  });
});
