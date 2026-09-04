import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * **橋の 13 本を、毎回モジュールを読み直して確かめる。**
 *
 * ## なぜ既存の検査だけでは足りなかったか (2026-08-30 実測)
 *
 * `bridgeContract.test.ts` は既に橋の全メソッドを呼び、`ipcRenderer.invoke`
 * が 1 回だけ走ることを確かめている —— **論理としては十分**である。
 * それでも変異検査では `preload.ts` が **50.00% (28 件中 14 件が生存)** で、
 * 生存の中身は**橋のメソッド 13 本すべて**と `exposeInMainWorld('serviceHub')`
 * の名前だった。
 *
 * 理由は `api` が**モジュール直下のオブジェクトリテラル**で、
 * `contextBridge.exposeInMainWorld` も読み込み時に走ること。つまり
 * **覆われた static 変異体**である。あちらは `beforeAll` で 1 度だけ
 * import するので、変異が有効になる前に評価が済んでいる。
 *
 * 同じ罠と同じ直し方が `stryker.config.json` に既に書いてある ——
 * 「beforeAll で 1 回だけ読んでいたのを beforeEach へ移しただけで
 * 78.96% → 85.55%」。それは `main/main.ts` に対して行われ (`mainWindow.test.ts`
 * が `vi.resetModules()` + 動的 `import()` を使い、342 件すべてを殺している)、
 * **同じ `beforeAll` に同居していた `preload.ts` には行われなかった**。
 *
 * ここは既存の契約検査を作り替えず、**読み直す形の検査を隣に足す**。
 * あちらは preload と main の**突き合わせ**という別の目的を持っており、
 * 壊すと失う物のほうが大きい。
 *
 * ## 何を守っているか
 *
 * 橋は「レンダラーが main に対してできること」の定義そのものである。
 * メソッドの中身が黙って空になっても、画面は「押しても何も起きない」に
 * なるだけで例外は出ない。チャンネル名を取り違えても同じである。
 */

interface Invocation {
  channel: string;
  args: unknown[];
}

const invocations: Invocation[] = [];
let exposedName = '';
let exposedApi: Record<string, (...a: unknown[]) => unknown> = {};

vi.mock('electron', () => ({
  contextBridge: {
    exposeInMainWorld: (name: string, api: Record<string, (...a: unknown[]) => unknown>) => {
      exposedName = name;
      exposedApi = api;
    },
  },
  ipcRenderer: {
    invoke: (channel: string, ...args: unknown[]) => {
      invocations.push({ channel, args });
      return Promise.resolve(undefined);
    },
  },
}));

/** preload を**読み直して**、露出された橋を取り出す。 */
async function freshBridge(): Promise<Record<string, (...a: unknown[]) => unknown>> {
  exposedName = '';
  exposedApi = {};
  vi.resetModules();
  await import('../preload');
  return exposedApi;
}

beforeEach(() => {
  invocations.length = 0;
});

/**
 * 橋のメソッド名 → 呼ぶべきチャンネル。**両方を書く**のが要点で、
 * どちらかが黙って変われば鳴る。main 側に同じ名前が登録されていることは
 * `bridgeContract.test.ts` が突き合わせている。
 */
const CHANNELS: readonly [string, string][] = [
  ['getVersion', 'app:getVersion'],
  ['checkUpdate', 'app:checkUpdate'],
  ['openExternal', 'app:openExternal'],
  ['revealInFolder', 'app:revealInFolder'],
  ['openPath', 'app:openPath'],
  ['setToken', 'secrets:set'],
  ['clearToken', 'secrets:clear'],
  ['listConfigured', 'secrets:list'],
  ['storageProtection', 'secrets:protection'],
  ['fetchSnapshot', 'fetch:snapshot'],
  ['invoke', 'action:invoke'],
  ['oauthSupported', 'oauth:isSupported'],
  ['authorize', 'oauth:authorize'],
];

describe('橋の 13 本 — 読み直して static 変異体を届かせる', () => {
  it.each(CHANNELS)('★ %s は %s を 1 回だけ呼ぶ', async (method, channel) => {
    const api = await freshBridge();
    const fn = api[method];
    expect(fn, `${method} が橋に無い`).toBeTypeOf('function');
    fn!('a1', 'a2', 'a3');
    expect(invocations).toHaveLength(1);
    expect(invocations[0]!.channel).toBe(channel);
  });

  /*
   * **引数はそのまま渡す。** 橋が引数を落とすと、main 側は `undefined` を
   * 受けて「未設定」と同じ扱いになる —— 例外は出ないので気付けない。
   */
  it('★ 引数は main へそのまま渡る', async () => {
    const api = await freshBridge();
    api['openExternal']!('https://example.com');
    expect(invocations[0]!.args).toEqual(['https://example.com']);

    invocations.length = 0;
    api['setToken']!('github', 'tok');
    expect(invocations[0]!.args).toEqual(['github', 'tok']);
  });

  /*
   * **チャンネル名を呼び出し側に選ばせない。** 任意のチャンネルを叩ける橋は
   * contextIsolation を掛けている意味を消す。第 1 引数に別のチャンネル名を
   * 渡しても、呼ばれる先が変わらないことを見る。
   */
  it('★ 呼び出し側はチャンネルを選べない', async () => {
    const api = await freshBridge();
    api['getVersion']!('secrets:list');
    expect(invocations[0]!.channel).toBe('app:getVersion');
  });

  it('★ 露出する名前は serviceHub ただ 1 つ', async () => {
    await freshBridge();
    expect(exposedName).toBe('serviceHub');
  });

  it('★ 露出するのは関数だけ (状態や生の ipcRenderer を渡さない)', async () => {
    const api = await freshBridge();
    for (const [name, v] of Object.entries(api)) {
      expect(typeof v, `${name} は関数`).toBe('function');
    }
    expect(Object.keys(api).sort()).toEqual([...CHANNELS].map(([m]) => m).sort());
  });
});
