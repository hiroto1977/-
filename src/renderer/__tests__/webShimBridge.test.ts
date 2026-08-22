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
beforeEach(() => {
  opened = [];
  (window as unknown as { open: (u?: string) => void }).open = (u?: string) => {
    if (typeof u === 'string') opened.push(u);
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
      ' https://example.com',
      '',
      undefined,
      null,
      42,
    ]) {
      await openExternal(url);
    }
    expect(opened).toEqual([]);
  });
});
