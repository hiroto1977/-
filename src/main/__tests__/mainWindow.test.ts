import { beforeEach, describe, expect, it, vi } from 'vitest';
import path from 'node:path';

/*
 * BrowserWindow の作られ方と、窓に張った 3 つの番人。
 *
 * `lint:forbidden` は `nodeIntegration: true` のような**字面**を禁じますが、
 * 実際に組み立てられた設定が何かは見ていません。ここでは main.ts を読み込んで
 * `new BrowserWindow(...)` に渡った実物を確かめます。あわせて:
 *
 *   - `setWindowOpenHandler` — 新しい窓は常に拒否し、http(s) だけ OS へ渡す
 *   - `will-navigate` / `will-redirect` — アプリ内の遷移を全部止める
 *
 * 2 つ目と 3 つ目が緩むと、乗っ取られたレンダラーが main の窓を任意の URL へ
 * 向けられます (2026-07 監査の Vite HMR 例外もここ)。
 */

interface Captured {
  opts: Record<string, unknown>;
  windowOpenHandler: ((d: { url: string }) => unknown) | null;
  listeners: Map<string, (ev: { preventDefault: () => void }, url: string) => void>;
  loadedFile: string | null;
  loadedUrl: string | null;
  devToolsOpened: boolean;
  devToolsMode: string | null;
}

let captured: Captured;
let openedExternal: string[] = [];
let isPackaged = true;
let windowsMade = 0;
let allWindows: unknown[] = [];
let quitCalls = 0;
const appListeners = new Map<string, () => void>();

function freshCapture(): Captured {
  return {
    opts: {},
    windowOpenHandler: null,
    listeners: new Map(),
    loadedFile: null,
    loadedUrl: null,
    devToolsOpened: false,
    devToolsMode: null,
  };
}

vi.mock('electron', () => ({
  app: {
    getVersion: () => '1.2.3',
    getPath: () => '/tmp/does-not-matter',
    get isPackaged() {
      return isPackaged;
    },
    whenReady: async () => undefined,
    on: (name: string, fn: () => void) => {
      appListeners.set(name, fn);
    },
    quit: () => {
      quitCalls += 1;
    },
  },
  BrowserWindow: class {
    static getAllWindows() {
      return allWindows;
    }
    webContents = {
      setWindowOpenHandler: (fn: (d: { url: string }) => unknown) => {
        captured.windowOpenHandler = fn;
      },
      on: (name: string, fn: (ev: { preventDefault: () => void }, url: string) => void) => {
        captured.listeners.set(name, fn);
      },
      openDevTools: (opts?: { mode?: string }) => {
        captured.devToolsOpened = true;
        captured.devToolsMode = opts?.mode ?? null;
      },
    };
    constructor(opts: Record<string, unknown>) {
      captured.opts = opts;
      windowsMade += 1;
    }
    loadFile(p: string) {
      captured.loadedFile = p;
    }
    loadURL(u: string) {
      captured.loadedUrl = u;
    }
  },
  ipcMain: { handle: () => {} },
  shell: {
    openExternal: async (url: string) => {
      openedExternal.push(url);
    },
    showItemInFolder: () => {},
    openPath: async () => '',
  },
  safeStorage: {
    isEncryptionAvailable: () => true,
    encryptString: (v: string) => Buffer.from(v, 'utf8'),
    decryptString: (b: Buffer) => b.toString('utf8'),
  },
}));

vi.mock('../secrets', () => ({
  getValidToken: async () => ({ ok: true, token: 't' }),
  setToken: async () => {},
  clearToken: async () => {},
  listConfiguredServices: async () => [],
  getStorageProtection: async () => ({ encrypted: true, plainCount: 0, file: '/tmp/x' }),
  setOAuthTokens: async () => {},
}));
vi.mock('../clients', () => ({ LIVE_FETCHERS: {}, LIVE_ACTIONS: {}, LOCAL_SERVICES: new Set() }));
vi.mock('../oauth', () => ({
  authorize: async () => ({ accessToken: 'a' }),
  isOAuthSupported: () => false,
  OAUTH_CONFIGS: {},
}));

/** main.ts を読み直して、窓が作られるまで待つ。 */
async function loadMain(opts: { packaged: boolean; devServerUrl?: string }): Promise<Captured> {
  captured = freshCapture();
  isPackaged = opts.packaged;
  if (opts.devServerUrl === undefined) delete process.env.VITE_DEV_SERVER_URL;
  else process.env.VITE_DEV_SERVER_URL = opts.devServerUrl;
  vi.resetModules();
  await import('../main');
  // `app.whenReady().then(createWindow)` が走るまでマイクロタスクを流す。
  await new Promise((r) => setTimeout(r, 0));
  return captured;
}

beforeEach(() => {
  openedExternal = [];
  windowsMade = 0;
  allWindows = [];
  quitCalls = 0;
  appListeners.clear();
});

describe('BrowserWindow の設定 — 隔離の三点セット', () => {
  it('contextIsolation / nodeIntegration / sandbox が固定される', async () => {
    const c = await loadMain({ packaged: true });
    const wp = c.opts.webPreferences as Record<string, unknown>;
    // どれか一つでも緩むと、レンダラー側の任意コードが Node へ届く。
    expect(wp.contextIsolation).toBe(true);
    expect(wp.nodeIntegration).toBe(false);
    expect(wp.sandbox).toBe(true);
  });

  it('preload を必ず読ませる (bridge が無ければ何も呼べない)', async () => {
    const c = await loadMain({ packaged: true });
    const wp = c.opts.webPreferences as Record<string, string>;
    expect(wp.preload).toMatch(/preload\.js$/);
  });

  it('本番では同梱の index.html を読み、開発サーバへは行かない', async () => {
    const c = await loadMain({ packaged: true, devServerUrl: 'http://localhost:5173' });
    // 署名済みの配布物が、環境変数一つで外のサーバを読み込んではいけない。
    expect(c.loadedFile).toMatch(/index\.html$/);
    expect(c.loadedUrl).toBeNull();
    expect(c.devToolsOpened).toBe(false);
  });

  it('開発時だけ開発サーバを読み、DevTools を開く', async () => {
    const c = await loadMain({ packaged: false, devServerUrl: 'http://localhost:5173' });
    expect(c.loadedUrl).toBe('http://localhost:5173');
    expect(c.loadedFile).toBeNull();
    expect(c.devToolsOpened).toBe(true);
  });

  it('開発でも環境変数が無ければ同梱を読む', async () => {
    const c = await loadMain({ packaged: false });
    expect(c.loadedFile).toMatch(/index\.html$/);
    expect(c.loadedUrl).toBeNull();
  });
});

describe('setWindowOpenHandler — 新しい窓は必ず拒否する', () => {
  it('どんな URL でも window.open は拒否する', async () => {
    const c = await loadMain({ packaged: true });
    for (const url of ['https://example.com', 'javascript:alert(1)', 'nonsense']) {
      expect(c.windowOpenHandler!({ url })).toEqual({ action: 'deny' });
    }
  });

  it('http(s) だけ OS のブラウザへ回す', async () => {
    const c = await loadMain({ packaged: true });
    c.windowOpenHandler!({ url: 'https://example.com/a' });
    c.windowOpenHandler!({ url: 'http://example.com/b' });
    expect(openedExternal).toEqual(['https://example.com/a', 'http://example.com/b']);
  });

  it('http(s) 以外は OS へ回さない', async () => {
    const c = await loadMain({ packaged: true });
    for (const url of [
      'javascript:alert(1)',
      'file:///etc/passwd',
      'data:text/html,<script>1</script>',
      'ssh://evil.example',
      'ms-windows-store://x',
      'not a url',
      '',
    ]) {
      c.windowOpenHandler!({ url });
    }
    expect(openedExternal).toEqual([]);
  });
});

describe('will-navigate / will-redirect — アプリ内の遷移を止める', () => {
  const ev = () => {
    let prevented = false;
    return {
      ev: {
        preventDefault: () => {
          prevented = true;
        },
      },
      was: () => prevented,
    };
  };

  it('両方に番人が付いている', async () => {
    const c = await loadMain({ packaged: true });
    expect([...c.listeners.keys()].sort()).toEqual(['will-navigate', 'will-redirect']);
  });

  it('本番では何処へも遷移させない (開発サーバの URL でも)', async () => {
    const c = await loadMain({ packaged: true, devServerUrl: 'http://localhost:5173' });
    for (const name of ['will-navigate', 'will-redirect']) {
      for (const url of [
        'https://evil.example',
        'http://localhost:5173/',
        'http://127.0.0.1:5173/',
        'file:///etc/passwd',
      ]) {
        const e = ev();
        c.listeners.get(name)!(e.ev, url);
        expect(e.was()).toBe(true);
      }
    }
  });

  it('開発時は読み込んだ開発サーバと同じ origin だけ通す', async () => {
    const c = await loadMain({ packaged: false, devServerUrl: 'http://localhost:5173' });
    for (const url of ['http://localhost:5173/', 'http://localhost:5173/src/main.tsx']) {
      const e = ev();
      c.listeners.get('will-navigate')!(e.ev, url);
      expect(e.was()).toBe(false);
    }
    // 窓は `VITE_DEV_SERVER_URL` そのものを読み込むので、レンダラーの origin は
    // 常にこちら。別名 (127.0.0.1) は同じ機械でも別 origin なので通さない。
    const alias = ev();
    c.listeners.get('will-navigate')!(alias.ev, 'http://127.0.0.1:5173/x');
    expect(alias.was()).toBe(true);
  });

  it('開発時でも開発サーバ以外は止める (ポート違い・ホスト違い・スキーム違い)', async () => {
    const c = await loadMain({ packaged: false, devServerUrl: 'http://localhost:5173' });
    for (const url of [
      'http://localhost:5174/',
      'http://localhost/',
      // スキーム違い。`host` だけを見ていた頃はここが素通りしていた —
      // 同じポートで TLS を話す別のプロセスへ窓を向けられた。
      'https://localhost:5173/',
      'ftp://localhost:5173/x',
      'ws://localhost:5173/',
      'http://evil.example:5173/',
      'http://localhost.evil.example:5173/',
      'not a url',
    ]) {
      const e = ev();
      c.listeners.get('will-navigate')!(e.ev, url);
      expect(e.was()).toBe(true);
    }
  });

  it('開発サーバが別ポートへずれても、その origin だけを通す', async () => {
    // 5173 が埋まっていると Vite は次の空き番へずれる。ポートを決め打ちして
    // いた頃は、本物 (5174) を止めて、5173 を握った相手を通していた。
    const c = await loadMain({ packaged: false, devServerUrl: 'http://localhost:5174' });
    const good = ev();
    c.listeners.get('will-navigate')!(good.ev, 'http://localhost:5174/src/main.tsx');
    expect(good.was()).toBe(false);
    const stale = ev();
    c.listeners.get('will-navigate')!(stale.ev, 'http://localhost:5173/');
    expect(stale.was()).toBe(true);
  });

  it('開発サーバの URL 自体が壊れていれば何も通さない', async () => {
    const c = await loadMain({ packaged: false, devServerUrl: 'not a url' });
    for (const url of [
      'http://localhost:5173/',
      // **遷移先も読めない**場合。読めなかったことを「空文字」で表さずに
      // 制御の流れだけで表していると、壊れたもの同士が「同じ origin」に
      // 見えて通ってしまう。
      'also not a url',
      '',
    ]) {
      const e = ev();
      c.listeners.get('will-navigate')!(e.ev, url);
      expect(e.was(), url).toBe(true);
    }
  });

  it('開発でも環境変数が無ければ全部止める', async () => {
    const c = await loadMain({ packaged: false });
    const e = ev();
    c.listeners.get('will-navigate')!(e.ev, 'http://localhost:5173/');
    expect(e.was()).toBe(true);
  });

  it('リダイレクトにも同じ規則が効く (3xx で外へ抜けない)', async () => {
    const c = await loadMain({ packaged: false, devServerUrl: 'http://localhost:5173' });
    const ok = ev();
    c.listeners.get('will-redirect')!(ok.ev, 'http://localhost:5173/');
    expect(ok.was()).toBe(false);
    const bad = ev();
    c.listeners.get('will-redirect')!(bad.ev, 'https://evil.example/');
    expect(bad.was()).toBe(true);
  });
});

describe('窓の見た目とアイコン', () => {
  it('題名と背景色を決めて出す', async () => {
    const c = await loadMain({ packaged: true });
    expect(c.opts.title).toBe('Service Hub');
    expect(c.opts.backgroundColor).toBe('#0f1117');
  });

  it('同梱のアイコンを、束ねた場所からの相対で指す', async () => {
    // `dist-electron/main.js` から見て `../build/icon.png`。段数がずれると
    // 存在しないパスになり、既定の Electron アイコンで出荷される。
    const c = await loadMain({ packaged: true });
    // main.js のあるディレクトリから見た相対で確かめる。段数・フォルダ名・
    // ファイル名のどれが変わっても落ちる。
    expect(path.relative(path.resolve('src/main'), String(c.opts.icon))).toBe(
      path.join('..', 'build', 'icon.png'),
    );
  });

  it('開発時の DevTools は別窓で開く (画面を狭めない)', async () => {
    const c = await loadMain({ packaged: false, devServerUrl: 'http://localhost:5173' });
    expect(c.devToolsOpened).toBe(true);
    expect(c.devToolsMode).toBe('detach');
  });
});

describe('アプリの寿命', () => {
  it('起動時に窓を 1 つだけ作る', async () => {
    await loadMain({ packaged: true });
    expect(windowsMade).toBe(1);
  });

  it('activate は窓が無いときだけ作り直す (Dock から戻る道)', async () => {
    await loadMain({ packaged: true });
    expect(windowsMade).toBe(1);
    // 既に窓があるなら増やさない。
    allWindows = [{}];
    appListeners.get('activate')!();
    expect(windowsMade).toBe(1);
    // 全部閉じたあとなら作り直す。
    allWindows = [];
    appListeners.get('activate')!();
    expect(windowsMade).toBe(2);
  });

  it('macOS 以外では全部の窓を閉じたら終了する', async () => {
    await loadMain({ packaged: true });
    const orig = process.platform;
    try {
      Object.defineProperty(process, 'platform', { value: 'linux', configurable: true });
      appListeners.get('window-all-closed')!();
      expect(quitCalls).toBe(1);
      Object.defineProperty(process, 'platform', { value: 'darwin', configurable: true });
      appListeners.get('window-all-closed')!();
      expect(quitCalls).toBe(1);
    } finally {
      Object.defineProperty(process, 'platform', { value: orig, configurable: true });
    }
  });
});
