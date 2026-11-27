/** @vitest-environment jsdom */
/**
 * **「更新」ボタンを持つ端末内の画面は、ブラウザ版でも取得が答える。**
 *
 * `SERVICE_DATA_ORIGIN` が 'local' の画面は、状態バーの「更新」が取得 (`fetchSnapshot`) を呼ぶ。
 * ブラウザ版の `web-shim.ts` に枝が無いと `not_implemented` へ落ち、画面は赤い「エラー」と
 * 「ブラウザ版では live fetch を行いません」を出す。宣言 (`shared/dataOrigin.ts`)・枝 (`web-shim.ts`)・
 * 画面 (`pages/*.tsx`) は別々のファイルに手で書くので、片方だけ動かしても鳴る物が無かった ——
 * 2026-11-19 の実測 (実 chromium で「更新」を押す) で **7 画面**がその状態だった
 * (事業ダッシュボード / 書類スタジオ / 資金調達レーダー / KPI / Linux / Skills / テンプレート)。
 *
 * ここは母集団を走査で導く: サイドバーの画面 (`services.ts` の `page:`) のうち、取得の hook
 * (`useServiceData`) の `refresh` を状態バーへ渡している 'local' の画面。その全部について、
 * 実物の shim の `fetchSnapshot` が `not_implemented` を返さないことを見る。
 *
 * ## 見えない物 (測って書く)
 *
 * - 状態バーを子の部品が描く画面 (士業 8 画面の `ShigyoConsole`) は、画面のファイルに
 *   `<StatusBar` の綴りが無いので母集団に入らない。その枝は `webShimSnapshotBranches.test.ts` が別に見る。
 * - 'remote' の画面はここでは見ない。連携先 22 のうちブラウザ版から読めない 14 は「更新」を出さず案内を出す ——
 *   `browserRemoteFetchReach.test.ts` (橋) と `pages/__tests__/remoteScreensBrowserNotice.test.ts` (画面) が見る。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { join } from 'node:path';
import { rereadModule } from '../../shared/__tests__/rereadModule';
import { readOriginalSource } from '../../shared/__tests__/originalSource';
import { stripComments } from '../../shared/__tests__/stripNonCode';
import '../web-shim';
import { originOf } from '../../shared/dataOrigin';
import { isServiceId } from '../../shared/serviceId';

vi.mock('../security/vault', () => ({
  getVault: () => ({
    takeExpiredNotice: () => null,
    getToken: async () => null,
    setToken: async () => {},
    clearToken: async () => {},
    listServices: async () => [],
    status: async () => 'unlocked',
  }),
}));
vi.mock('../library/library', () => ({ getLibrary: () => ({ put: async () => {}, list: async () => [] }) }));
vi.mock('../network/proxy', () => ({
  PROXY_UNVERIFIED_MESSAGE: 'PROXY_UNVERIFIED',
  getProxyConfig: async () => null,
  inspectStoredProxyConfig: async () => ({ config: null, rejected: null, unreadable: null }),
  fetchViaProxy: async () => new Response('{}', { status: 200 }),
  PROXY_REQUIRED_SERVICES: new Set<string>(),
}));
vi.mock('electron', () => ({
  contextBridge: { exposeInMainWorld: () => {} },
  ipcRenderer: { invoke: () => Promise.resolve() },
}));

type Result = { ok: boolean; code?: string; message?: string };
type Hub = { fetchSnapshot: (s?: string) => Promise<Result> };

async function loadHub(): Promise<Hub> {
  delete (window as unknown as { serviceHub?: unknown }).serviceHub;
  await rereadModule<typeof import('../web-shim')>(import.meta.url, '../web-shim');
  return (window as unknown as { serviceHub: Hub }).serviceHub;
}

const originalFetch = globalThis.fetch;
beforeEach(() => {
  localStorage.clear();
  globalThis.fetch = (async () => {
    throw new Error('offline');
  }) as typeof fetch;
});
afterEach(() => {
  globalThis.fetch = originalFetch;
});

const RENDERER = join(__dirname, '..');

/** `services.ts` の 1 項目 (`id: '…'` と `page: XPage`) を読む。 */
function sidebarPages(): { id: string; page: string }[] {
  const src = stripComments(readOriginalSource(join(RENDERER, 'services.ts')));
  const out: { id: string; page: string }[] = [];
  const entry = /\bid:\s*'([^']+)'[\s\S]*?\bpage:\s*(\w+)/g;
  for (let m = entry.exec(src); m !== null; m = entry.exec(src)) out.push({ id: m[1]!, page: m[2]! });
  return out;
}

/**
 * その画面が、取得の hook の `refresh` を状態バーへ渡しているか。
 * 3 つとも要る: 状態バーを描く・取得の hook を呼ぶ・`onRefresh={refresh}`。
 * (ライブラリは `refresh` という名前の自前の読み直しを渡すが、取得の hook を呼ばないので入らない。)
 */
function wiresFetchRefresh(pageSource: string): boolean {
  const code = stripComments(pageSource);
  return code.includes('<StatusBar') && /\buseServiceData\s*[<(]/.test(code) && /onRefresh=\{refresh\}/.test(code);
}

function wiredLocalServices(): string[] {
  return sidebarPages()
    .filter(({ id }) => isServiceId(id) && originOf(id) === 'local')
    .filter(({ page }) => wiresFetchRefresh(readOriginalSource(join(RENDERER, 'pages', `${page}.tsx`))))
    .map(({ id }) => id)
    .sort();
}

describe('「更新」を持つ端末内の画面は、ブラウザ版でも取得が答える', () => {
  it('走査が生きている (サイドバーの画面 70 以上・「更新」を取得へつなぐ端末内の画面 15 以上)', () => {
    expect(sidebarPages().length).toBeGreaterThanOrEqual(70);
    expect(wiredLocalServices().length).toBeGreaterThanOrEqual(15);
  });

  it('標本: 判定は 3 つの綴りが揃ったときだけ真になる', () => {
    const wired = "const { refresh } = useServiceData('kpi', S); return <StatusBar onRefresh={refresh} />;";
    expect(wiresFetchRefresh(wired)).toBe(true);
    // 型引数つきの呼び方も拾う。
    expect(wiresFetchRefresh(wired.replace("useServiceData('kpi'", "useServiceData<T>('kpi'"))).toBe(true);
    // 状態バーが無い / 取得の hook を呼ばない / 自前の関数を渡す —— どれも偽。
    expect(wiresFetchRefresh("const { data } = useServiceData('home', S); return <div />;")).toBe(false);
    expect(wiresFetchRefresh('const refresh = () => reload(); return <StatusBar onRefresh={refresh} />;')).toBe(false);
    expect(wiresFetchRefresh("const { refresh } = useServiceData('x', S); return <StatusBar onRefresh={() => bump()} />;")).toBe(false);
    // 注記の中の綴りは数えない。
    expect(wiresFetchRefresh("// useServiceData('kpi') と <StatusBar onRefresh={refresh} />\nexport const x = 1;")).toBe(false);
  });

  it('標本: 母集団は直した 7 画面を含み、状態バーを持たない画面・自前の読み直しの画面を含まない', () => {
    const wired = wiredLocalServices();
    for (const id of ['business', 'docstudio', 'funding', 'kpi', 'linux', 'skills', 'templates']) {
      expect(wired, id).toContain(id);
    }
    for (const id of ['home', 'overview', 'library', 'settings', 'vrio']) expect(wired, id).not.toContain(id);
  });

  it('★ そのどれも、ブラウザ版の取得が not_implemented を返さない', async () => {
    const hub = await loadHub();
    const fallen: string[] = [];
    for (const id of wiredLocalServices()) {
      const r = await hub.fetchSnapshot(id);
      if (!r.ok && r.code === 'not_implemented') fallen.push(id);
    }
    expect(
      fallen,
      'この画面は「更新」を押すと赤い「ブラウザ版では live fetch を行いません」が出る。web-shim.ts の fetchSnapshot に枝を足すこと',
    ).toEqual([]);
  });

  it('対照: 同梱の見本のままの画面 (sample) は not_implemented へ落ちる (shim が何でも ok を返すのではない)', async () => {
    const hub = await loadHub();
    const r = await hub.fetchSnapshot('netsea');
    expect(r.ok).toBe(false);
    expect(r.code).toBe('not_implemented');
  });
});
