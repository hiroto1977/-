/** @vitest-environment jsdom */
/**
 * 実行形態の身元は、版を上げても動かない (2026-09-25 · パス 460)。
 *
 * ## 直す前の実測
 *
 * 判定は `getVersion() === '0.1.0-web'` という**版そのものとの完全一致**で、
 * 綴りは `web-shim.ts` (作る側) と `runtimeMode.ts` (比べる側) の 2 か所に分かれていた。
 * producing 側だけを `'0.2.0-web'` へ替えると:
 *
 * | 測った物 | 実測 (2026-09-25) |
 * | --- | --- |
 * | `npm test` | **896 ファイル / 19,048 件すべて緑** |
 * | `isBrowserBuild()` | **`false`** |
 * | 実物の App のロック画面 | **出ない** |
 * | `ProxyRequiredNote` の DOM | **0 字** |
 *
 * ★ **ロック画面はブラウザ版が保管庫を解錠する唯一の入口**で、素通りすると
 * 以後どの資格情報も「Vault がロックされています」で断られ、解錠の操作子は無い
 * (パス 455 がデスクトップ版について実測した当の状態)。
 *
 * ## ここが留める物
 *
 * ① 身元は接尾辞 `-web` が持ち、**版の数は何であれ答えが変わらない**
 * ② 作る側と比べる側が**実物で繋がっている** (実物の shim の `getVersion` が
 *    ブラウザ版として認識される)
 * ③ 版はブラウザ版の中で**1 回しか名乗られない** (`checkUpdate` の `current` は
 *    `getVersion()` から接尾辞を外した物と一致する)
 * ④ **床**: `package.json` の版が `-web` で終わらない —— 終わればデスクトップ版が
 *    自分をブラウザ版と名乗り、判別子そのものが壊れる
 * ⑤ **床**: `checkUpdate` が名乗る `current` は接尾辞を持たない ——
 *    持たせるとパス 402 の semver の順序 (プレリリースは正式版より前) が効いて
 *    **自分自身より新しい版が在ると言い出す**
 */
import 'fake-indexeddb/auto';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { readOriginalSource } from '../../shared/__tests__/originalSource';
import { WEB_BUILD_SUFFIX, isWebBuildVersion } from '../../shared/buildDestinations';
import { evaluateUpdate } from '../../shared/updateCheck';
import { isBrowserBuild } from '../runtimeMode';
import { rereadModule } from '../../shared/__tests__/rereadModule';
// 依存先を先頭で読み込んでおく (検査の中で初めて評価すると、依存先の値まで
// 「その検査が覆った」と数えられる —— rereadModule.ts の docblock・パス 495)。
import '../web-shim';

vi.mock('../security/vault', () => ({
  getVault: () => ({
    takeExpiredNotice: () => null, // T-213: 期限切れの理由 (この偽物は期限を持たない)
    getToken: async () => null,
    status: async () => 'locked',
    setToken: async () => {},
    clearToken: async () => {},
    listServices: async () => [],
  }),
}));
vi.mock('../library/library', () => ({ getLibrary: () => ({ put: async () => {}, list: async () => [] }) }));
vi.mock('electron', () => ({
  contextBridge: { exposeInMainWorld: () => {} },
  ipcRenderer: { invoke: () => Promise.resolve() },
}));

type Hub = { getVersion: () => Promise<string>; checkUpdate: () => Promise<{ current: string }> };

function installHub(hub: Partial<Hub>): void {
  (window as unknown as { serviceHub?: unknown }).serviceHub = hub;
}

/** 実物の shim を据え付けて橋を掴む (`webShimBridge.test.ts` と同じ形)。 */
async function loadShim(): Promise<Hub> {
  delete (window as unknown as { serviceHub?: unknown }).serviceHub;
  await rereadModule<typeof import('../web-shim')>(import.meta.url, '../web-shim');
  return (window as unknown as { serviceHub: Hub }).serviceHub;
}

afterEach(() => {
  delete (window as unknown as { serviceHub?: unknown }).serviceHub;
});

describe('実行形態の身元は版に依らない', () => {
  /** 版を上げた形 —— どれもブラウザ版である。 */
  const WEB_VERSIONS = ['0.1.0-web', '0.2.0-web', '1.0.0-web', '9.9.9-web', '0.1.1-web'] as const;
  /** デスクトップ版が名乗りうる形 —— どれもブラウザ版ではない。 */
  const DESKTOP_VERSIONS = ['0.1.0', '0.2.0', '1.0.0', '0.1.0-beta.2', ''] as const;

  it('★ 版の数が何であれ、接尾辞が在ればブラウザ版', async () => {
    for (const v of WEB_VERSIONS) {
      installHub({ getVersion: () => Promise.resolve(v) });
      expect(await isBrowserBuild(), v).toBe(true);
    }
  });

  it('接尾辞が無ければブラウザ版ではない', async () => {
    for (const v of DESKTOP_VERSIONS) {
      installHub({ getVersion: () => Promise.resolve(v) });
      expect(await isBrowserBuild(), v).toBe(false);
    }
  });

  it('判定そのものも同じ答えを出す (画面を描かずに問える口)', () => {
    for (const v of WEB_VERSIONS) expect(isWebBuildVersion(v), v).toBe(true);
    for (const v of DESKTOP_VERSIONS) expect(isWebBuildVersion(v), v).toBe(false);
  });

  it('橋が投げたらブラウザ版とは名乗らない (fail closed)', async () => {
    installHub({
      getVersion: () => {
        throw new Error('橋が落ちた');
      },
    });
    expect(await isBrowserBuild()).toBe(false);
    installHub({ getVersion: () => Promise.reject(new Error('橋が落ちた')) });
    expect(await isBrowserBuild()).toBe(false);
  });

  it('★ 床: package.json の版が接尾辞で終わらない (終わるとデスクトップ版が自分をブラウザ版と名乗る)', () => {
    // jsdom では `import.meta.url` が http なので、リポジトリの根から辿る。
    const pkg = JSON.parse(readOriginalSource(join(process.cwd(), 'package.json'))) as { version: string };
    expect(typeof pkg.version).toBe('string');
    expect(pkg.version.endsWith(WEB_BUILD_SUFFIX)).toBe(false);
    // 針が的に当たることを標本で (この床が空虚でないこと)。
    expect(`${pkg.version}${WEB_BUILD_SUFFIX}`.endsWith(WEB_BUILD_SUFFIX)).toBe(true);
  });
});

describe('実物の shim が作る版と、比べる側が繋がっている', () => {
  it('★ 実物の shim の getVersion はブラウザ版として認識される', async () => {
    const hub = await loadShim();
    const version = await hub.getVersion();
    expect(isWebBuildVersion(version)).toBe(true);
    expect(await isBrowserBuild()).toBe(true);
  });

  it('★ 版はブラウザ版の中で 1 回しか名乗られない (checkUpdate の current == getVersion − 接尾辞)', async () => {
    const hub = await loadShim();
    const version = await hub.getVersion();
    const verdict = await hub.checkUpdate();
    expect(verdict.current).toBe(version.slice(0, -WEB_BUILD_SUFFIX.length));
    expect(verdict.current.endsWith(WEB_BUILD_SUFFIX)).toBe(false);
  });

  it('★ 床: current に接尾辞を付けると自分自身より新しい版が在ると言い出す (だから付けない)', async () => {
    const hub = await loadShim();
    const { current } = await hub.checkUpdate();
    const rel = { version: current, url: 'https://github.com/hiroto1977/-/releases/latest' };
    // 名乗っている版そのものが最新なら「最新です」。
    expect(evaluateUpdate(current, rel).status).toBe('up-to-date');
    // 接尾辞を付けると、同じ版に対して「更新があります」になる (パス 402 の semver の順序)。
    expect(evaluateUpdate(`${current}${WEB_BUILD_SUFFIX}`, rel).status).toBe('update-available');
  });
});
