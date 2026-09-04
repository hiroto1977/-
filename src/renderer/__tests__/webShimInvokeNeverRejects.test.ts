/** @vitest-environment jsdom */
import { beforeEach, describe, expect, it, vi } from 'vitest';

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
  getLibrary: () => ({
    // 保管が塞がっている環境 (private mode / 容量超過) を模す。
    put: async () => {
      throw new Error('QuotaExceededError');
    },
    list: async () => {
      throw new Error('blocked');
    },
  }),
}));
vi.mock('electron', () => ({
  contextBridge: { exposeInMainWorld: () => {} },
  ipcRenderer: { invoke: () => Promise.resolve() },
}));

/*
 * **ブラウザ版の `invoke` は、何があっても reject しない。**
 *
 * `useServiceData` にはこう書いてある ——
 *
 * > IPC が reject した場合の受け皿。ハンドラ側は失敗を戻り値で表す約束だが、
 * > 約束の外で throw されると (…) status が 'loading' のまま残り、
 * > バッジが「読込中…」で永久に止まる。
 *
 * その約束は `lint:ipc-handlers` が守っているが、**あのゲートは `src/main`
 * しか見ない**。ブラウザ版には main が無く、`web-shim.ts` の `invoke` が
 * 同じ約束を負っているのに、台帳の外にいた。
 *
 * 実測 (2026-08-23): `URL.createObjectURL` を投げさせると **37 組のうち
 * 4 組が reject** した (`stocks` / `business` の export-dashboard(-md))。
 * `downloadBlob` が素の `createObjectURL` を呼んでいて、`invoke` はそれを
 * try の外で呼んでいたため。
 *
 * reject の行き先は呼び出し側の `busy` フラグである。`finally` で戻して
 * いない画面 (`GmailPage` / `SlackPage` 等、`setSubmitting(true)` … await …
 * `setSubmitting(false)` の形) では、ボタンが押せないまま残る。
 *
 * ここでは**敵対的な環境**を作って全組を叩く。
 */

const PAIRS: readonly (readonly [string, string])[] = [
  ['templates', 'export-template'], ['teamradar', 'export-svg'], ['teamradar', 'save-state'],
  ['ollama', 'chat'], ['stocks', 'register-ticker'], ['stocks', 'unregister-ticker'],
  ['stocks', 'compare-strategies'], ['stocks', 'advise'], ['stocks', 'export-dashboard'],
  ['stocks', 'export-dashboard-md'], ['emotions', 'log-mood'], ['emotions', 'clear-history'],
  ['emotions', 'analyze-text'], ['github', 'create-issue'], ['notion', 'create-page'],
  ['slack', 'send-message'], ['atlassian', 'create-issue'], ['calendar', 'create-event'],
  ['gmail', 'create-draft'], ['drive', 'create-folder'], ['wordpress', 'create-post-draft'],
  ['canva', 'create-folder'], ['cloudflare', 'create-dns-record'], ['cloudflare', 'purge-cache'],
  ['security', 'scan-url'], ['security', 'check-email-breach'], ['uber-eats', 'record-entry'],
  ['demae-can', 'record-entry'], ['real-estate', 'record-entry'], ['mutual-funds', 'record-entry'],
  ['assistant', 'chat'], ['assistant', 'chatAll'], ['assistant', 'providers'],
  ['business', 'advise'], ['business', 'export-dashboard'], ['business', 'export-dashboard-md'],
  ['nosuch', 'nosuch'],
];

type Hub = { invoke: (s: string, a: string, p: Record<string, unknown>) => Promise<{ ok: boolean }> };

async function loadHub(): Promise<Hub> {
  vi.resetModules();
  delete (window as unknown as { serviceHub?: unknown }).serviceHub;
  await import('../web-shim');
  return (window as unknown as { serviceHub: Hub }).serviceHub;
}

/** blob: を塞ぐ環境。拡張・プライバシー設定・メモリ不足で実際に起きる。 */
function breakObjectUrl(): void {
  (URL as unknown as { createObjectURL: () => string }).createObjectURL = () => {
    throw new Error('createObjectURL blocked');
  };
  (URL as unknown as { revokeObjectURL: () => void }).revokeObjectURL = () => {};
}

describe('ブラウザ版の invoke は、敵対的な環境でも reject しない', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.stubGlobal('fetch', () => Promise.reject(new Error('network down')));
    breakObjectUrl();
  });

  it('全組が resolve する (約束を破らない)', async () => {
    const hub = await loadHub();
    const rejected: string[] = [];
    for (const [svc, act] of PAIRS) {
      try {
        await hub.invoke(svc, act, {});
      } catch (e) {
        rejected.push(`${svc}/${act}: ${(e as Error).message.slice(0, 60)}`);
      }
    }
    expect(rejected, 'reject した組がある — 呼び出し側の busy が戻らない').toEqual([]);
  });

  it('走査が実物に届いている (空虚でない)', async () => {
    const hub = await loadHub();
    // 全組が `action_not_found` で返る作りになっていたら、上の検査は
    // 何も確かめていない。実際に処理へ入る組が在ることを見る。
    const handled: string[] = [];
    for (const [svc, act] of PAIRS) {
      const r = (await hub.invoke(svc, act, {})) as { ok: boolean; code?: string };
      if (!(r.ok === false && r.code === 'action_not_found')) handled.push(`${svc}/${act}`);
    }
    expect(handled.length, '処理へ入る組が少なすぎる — 走査が的を外している').toBeGreaterThanOrEqual(25);
  });

  it('ダウンロードが始まらなかったことを、成功と偽らない', async () => {
    const hub = await loadHub();
    const r = (await hub.invoke('business', 'export-dashboard', {})) as {
      ok: boolean;
      data?: { path?: string; downloaded?: boolean };
    };
    expect(r.ok, 'ライブラリへの保存は済んでいるので ok で返る').toBe(true);
    expect(r.data?.downloaded, 'blob: が塞がれているのに downloaded を立てている').toBe(false);
    expect(r.data?.path, '生成物の名前は返す (ライブラリから辿れる)').toBeTruthy();
  });
});
