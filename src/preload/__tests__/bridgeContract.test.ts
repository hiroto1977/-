import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

/*
 * preload の橋と main のハンドラの**契約**。
 *
 * この 2 つは別プロセスで、型でも繋がっていません (preload は main を import
 * できない)。噛み合っているかを保証しているのは「同じ文字列を両側に書いた」
 * ことだけで、片方の綴りを変えても TypeScript は何も言いません。ずれると:
 *
 *   - 橋が未登録のチャンネルを呼ぶ → renderer 側で
 *     「No handler registered」の reject。画面は理由の分からない失敗になる
 *   - main が誰も呼ばないチャンネルを登録する → 到達不能な死んだ口が残る
 *
 * 両方を同じテストで読み込んで突き合わせます。あわせて、橋が
 * **チャンネル名を呼び出し側に選ばせていない**ことも確かめます (任意の
 * チャンネルを叩ける橋は、contextIsolation を掛けている意味を消す)。
 */

type Handler = (ev: unknown, ...args: unknown[]) => unknown;
const registered = new Set<string>();
const invocations: { channel: string; args: unknown[] }[] = [];
let exposed: Record<string, string> = {};
let exposedKey = '';

vi.mock('electron', () => ({
  app: {
    getVersion: () => '1.2.3',
    getPath: () => '/tmp/x',
    isPackaged: true,
    whenReady: () => new Promise(() => {}),
    on: () => {},
    quit: () => {},
  },
  BrowserWindow: class {
    static getAllWindows() {
      return [];
    }
  },
  ipcMain: {
    handle: (name: string, _fn: Handler) => {
      registered.add(name);
    },
  },
  ipcRenderer: {
    invoke: (channel: string, ...args: unknown[]) => {
      invocations.push({ channel, args });
      return Promise.resolve(undefined);
    },
  },
  contextBridge: {
    exposeInMainWorld: (key: string, api: Record<string, string>) => {
      exposedKey = key;
      exposed = api;
    },
  },
  shell: { openExternal: async () => {}, showItemInFolder: () => {}, openPath: async () => '' },
  safeStorage: {
    isEncryptionAvailable: () => true,
    encryptString: (v: string) => Buffer.from(v, 'utf8'),
    decryptString: (b: Buffer) => b.toString('utf8'),
  },
}));

vi.mock('../../main/secrets', () => ({
  getValidToken: async () => ({ ok: true, token: 't' }),
  setToken: async () => {},
  clearToken: async () => {},
  listConfiguredServices: async () => [],
  getStorageProtection: async () => ({ encrypted: true, plainCount: 0, file: '/tmp/x' }),
  setOAuthTokens: async () => {},
}));
vi.mock('../../main/clients', () => ({
  LIVE_FETCHERS: {},
  LIVE_ACTIONS: {},
  LOCAL_SERVICES: new Set(),
}));
vi.mock('../../main/oauth', () => ({
  authorize: async () => ({ accessToken: 'a' }),
  isOAuthSupported: () => false,
  OAUTH_CONFIGS: {},
}));

/** 橋の各メソッドを 1 回ずつ叩いて、実際に使われたチャンネル名を集める。 */
function channelsUsedByBridge(): Map<string, string> {
  const used = new Map<string, string>();
  for (const [name, fn] of Object.entries(exposed)) {
    invocations.length = 0;
    (fn as unknown as (...a: unknown[]) => unknown)('arg1', 'arg2', 'arg3');
    expect(invocations, `${name} は ipcRenderer.invoke を 1 回だけ呼ぶ`).toHaveLength(1);
    used.set(name, invocations[0]!.channel);
  }
  return used;
}

beforeAll(async () => {
  await import('../preload');
  await import('../../main/main');
});

beforeEach(() => {
  invocations.length = 0;
});

describe('橋の露出のしかた', () => {
  it('window.serviceHub という 1 つの名前だけを生やす', () => {
    expect(exposedKey).toBe('serviceHub');
  });

  it('露出するのは関数だけ (状態や生の ipcRenderer を渡さない)', () => {
    for (const [name, v] of Object.entries(exposed)) {
      expect(typeof v, `${name} は関数`).toBe('function');
    }
  });

  it('橋のメソッドは 13 個 (増減に気付けるよう名前ごと固定する)', () => {
    expect(Object.keys(exposed).sort()).toEqual([
      'authorize',
      'checkUpdate',
      'clearToken',
      'fetchSnapshot',
      'getVersion',
      'invoke',
      'listConfigured',
      'oauthSupported',
      'openExternal',
      'openPath',
      'revealInFolder',
      'setToken',
      'storageProtection',
    ]);
  });
});

describe('main のハンドラと噛み合っているか', () => {
  it('橋が呼ぶチャンネルはすべて main に登録されている', () => {
    const used = channelsUsedByBridge();
    const missing = [...used].filter(([, ch]) => !registered.has(ch));
    expect(missing, `未登録のチャンネルを呼ぶ橋: ${JSON.stringify(missing)}`).toEqual([]);
  });

  it('main が登録したチャンネルはすべて橋から届く (死んだ口を残さない)', () => {
    const used = new Set(channelsUsedByBridge().values());
    const unreachable = [...registered].filter((ch) => !used.has(ch));
    expect(unreachable, `橋から呼べないハンドラ: ${JSON.stringify(unreachable)}`).toEqual([]);
  });

  it('チャンネルは 1 対 1 (2 つの橋が同じ口を共有していない)', () => {
    const used = [...channelsUsedByBridge().values()];
    expect(new Set(used).size).toBe(used.length);
  });
});

describe('チャンネル名を呼び出し側に選ばせない', () => {
  it('引数を変えてもチャンネル名は変わらない', () => {
    // 橋が `(channel, ...args) => ipcRenderer.invoke(channel, ...args)` の形だと、
    // renderer は登録済みの**どのハンドラでも**叩けてしまう。
    const baseline = channelsUsedByBridge();
    for (const [name, fn] of Object.entries(exposed)) {
      for (const evil of ['secrets:list', 'app:openPath', '__proto__', '']) {
        invocations.length = 0;
        (fn as unknown as (...a: unknown[]) => unknown)(evil, evil, evil);
        expect(invocations[0]!.channel, `${name}(${evil})`).toBe(baseline.get(name));
      }
    }
  });

  it('引数はそのまま渡す (橋は素通しで、判断は main 側が持つ)', () => {
    (exposed.setToken as unknown as (a: string, b: string) => unknown)('github', 'ghp_x');
    expect(invocations).toEqual([{ channel: 'secrets:set', args: ['github', 'ghp_x'] }]);

    invocations.length = 0;
    (exposed.invoke as unknown as (a: string, b: string, c: unknown) => unknown)(
      'github',
      'create-issue',
      { title: 't' },
    );
    expect(invocations).toEqual([
      { channel: 'action:invoke', args: ['github', 'create-issue', { title: 't' }] },
    ]);
  });
});
