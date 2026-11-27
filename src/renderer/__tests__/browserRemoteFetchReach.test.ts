/** @vitest-environment jsdom */
/**
 * **連携先の画面の取得は、ブラウザ版で「資格情報が要る」か「この版では取得しない」のどちらかを答える。**
 *
 * 連携先 (`SERVICE_DATA_ORIGIN` が 'remote') は 22。ブラウザ版から実データを読めるのは
 * `network/liveRead.ts` の `LIVE_READERS` の 8 つで、残る 14 は取得がデスクトップ版の主プロセスに在る。
 *
 * 2026-11-19 実測 (実 chromium): その 14 画面は「更新」を押すと赤い「エラー」+「表示中の数字は同梱のサンプルです」+
 * 「ブラウザ版では live fetch を行いません。同梱の snapshot を使用します。」を出した。
 * 直した後は、橋が `shared/browserFetchReach.ts` の 1 文で `not_implemented` を返し、取得の hook が
 * それを失敗ではなく `unsupported` として持ち、画面は押す前から同じ 1 文を灰色で出す。
 *
 * ここは橋の側を、実物の shim で見る:
 *   - 一覧 (`BROWSER_LIVE_READ_SERVICES`) と実装 (`LIVE_READERS` の鍵) が同じ集合 (両方向)
 *   - 連携先の全サービスについて、読める物は `not_configured`・読めない物は案内の文つきの `not_implemented`
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { rereadModule } from '../../shared/__tests__/rereadModule';
import '../web-shim';
import { LIVE_READERS } from '../network/liveRead';
import { BROWSER_FETCH_UNSUPPORTED_NOTE, BROWSER_LIVE_READ_SERVICES } from '../../shared/browserFetchReach';
import { SERVICE_DATA_ORIGIN } from '../../shared/dataOrigin';

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
let fetched = 0;
beforeEach(() => {
  localStorage.clear();
  fetched = 0;
  globalThis.fetch = (async () => {
    fetched += 1;
    throw new Error('offline');
  }) as typeof fetch;
});
afterEach(() => {
  globalThis.fetch = originalFetch;
});

const REMOTE = Object.entries(SERVICE_DATA_ORIGIN)
  .filter(([, origin]) => origin === 'remote')
  .map(([id]) => id)
  .sort();

describe('ブラウザ版から読める連携先の一覧と、実装', () => {
  it('★ 一覧は LIVE_READERS の鍵と同じ集合 (片方だけ足すと落ちる)', () => {
    expect([...BROWSER_LIVE_READ_SERVICES].sort()).toEqual(Object.keys(LIVE_READERS).sort());
  });
});

describe('連携先の画面の取得 (実物の shim)', () => {
  it('走査が生きている (連携先 20 以上・読めない 10 以上・読める 5 以上)', () => {
    expect(REMOTE.length).toBeGreaterThanOrEqual(20);
    expect(REMOTE.filter((id) => !BROWSER_LIVE_READ_SERVICES.includes(id)).length).toBeGreaterThanOrEqual(10);
    expect(REMOTE.filter((id) => BROWSER_LIVE_READ_SERVICES.includes(id)).length).toBeGreaterThanOrEqual(5);
  });

  it('★ 読めない連携先は、案内の 1 文つきの not_implemented を返す (網へは出ない)', async () => {
    const hub = await loadHub();
    const wrong: string[] = [];
    for (const id of REMOTE.filter((x) => !BROWSER_LIVE_READ_SERVICES.includes(x))) {
      const r = await hub.fetchSnapshot(id);
      if (r.ok || r.code !== 'not_implemented' || r.message !== BROWSER_FETCH_UNSUPPORTED_NOTE) {
        wrong.push(`${id}: ${JSON.stringify(r)}`);
      }
    }
    expect(wrong).toEqual([]);
    expect(fetched).toBe(0);
  });

  it('★ その文は、直す前の内部の言い回し (live fetch / snapshot) を含まない', async () => {
    const hub = await loadHub();
    const r = await hub.fetchSnapshot('github');
    expect(r.message).toBe(BROWSER_FETCH_UNSUPPORTED_NOTE);
    // 針が的に当たる標本: 直す前の文は 2 語とも含んでいた。
    const before = 'ブラウザ版では live fetch を行いません。同梱の snapshot を使用します。';
    for (const word of ['live fetch', 'snapshot']) {
      expect(before).toContain(word);
      expect(r.message ?? '').not.toContain(word);
    }
  });

  it('対照: 読める連携先 (資格情報が未登録) は not_configured —— 「この版では取得しない」とは言わない', async () => {
    const hub = await loadHub();
    for (const id of BROWSER_LIVE_READ_SERVICES) {
      const r = await hub.fetchSnapshot(id);
      expect(r.ok, id).toBe(false);
      expect(r.code, id).toBe('not_configured');
      expect(r.message, id).not.toBe(BROWSER_FETCH_UNSUPPORTED_NOTE);
    }
  });

  it('対照: 連携先でない画面 (同梱の見本のまま) は、案内の文ではなく今までの文で落ちる', async () => {
    const hub = await loadHub();
    const r = await hub.fetchSnapshot('netsea');
    expect(r.code).toBe('not_implemented');
    expect(r.message).not.toBe(BROWSER_FETCH_UNSUPPORTED_NOTE);
    expect(r.message ?? '').toContain('live fetch を行いません');
  });

  it('対照: 知らない id・未指定は、案内の文を返さない', async () => {
    const hub = await loadHub();
    for (const id of ['no-such-service', 'constructor', undefined]) {
      const r = await hub.fetchSnapshot(id);
      expect(r.ok, String(id)).toBe(false);
      expect(r.message, String(id)).not.toBe(BROWSER_FETCH_UNSUPPORTED_NOTE);
    }
  });
});
