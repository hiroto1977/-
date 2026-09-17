/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { redactForMessage } from '../../shared/redact';

/**
 * `fetchSnapshot` の床を叩くための注入口。`probeMode = 'throw'` のときだけ
 * `probeOllama` が枝の `try` の**外**で投げる (実物の枝は try を持たない)。
 * 既定は実物へ素通し。
 */
let probeMode: 'real' | 'throw' = 'real';
const PROBE_BOOM = 'probe exploded: Authorization: Bearer ghp_abcdefghijklmnopqrstuvwxyz0123456789';
vi.mock('../network/ollamaWeb', async (importOriginal) => {
  const mod = await importOriginal<typeof import('../network/ollamaWeb')>();
  return {
    ...mod,
    probeOllama: async (...args: Parameters<typeof mod.probeOllama>) => {
      if (probeMode === 'throw') throw new Error(PROBE_BOOM);
      return mod.probeOllama(...args);
    },
  };
});

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
 *
 * ## 2026-09-17 (パス 312): 列挙した条件の外に穴が 3 つ在った
 *
 * 上の検査は 4 条件 (fetch が reject / blob: が塞がる / ライブラリが投げる / 金庫が
 * null) で全組が resolve することを見ていた。**条件を 3 つ足すと、それぞれで reject が出た**:
 *
 *   Web Storage そのものが拒む (SecurityError · パス 89) → `emotions/clear-history` 1 組
 *     (隣の `log-mood` は `try` を持ち、`clear-history` は持たなかった)
 *   payload が null                                       → 11 組 (`Cannot read properties of null`)
 *   payload の欄の形が違う (`strategyComparison: 42`)     → `stocks/export-dashboard(-md)` 2 組
 *
 * 約束を守っていたのは **32 の枝の中の 19 の `try`** —— 同じ規則の写しで、床が無かった。
 * main の `action:invoke` / `fetch:snapshot` は本体を丸ごと `try` に入れて
 * `safeErrorMessage` で返す (床は 1 か所)。ブラウザ版にも同じ床を置いた (`withFloor`)。
 * 下の検査は**その 3 条件**と、枝の try の外で投げる注入 (`probeOllama`) で床そのものを叩く。
 * 「列挙した条件で reject しない」は「何があっても reject しない」の標本にすぎない ——
 * 床が在ることを、床の外で投げて確かめる。
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

type Hub = {
  invoke: (s: string, a: string, p: Record<string, unknown>) => Promise<{ ok: boolean }>;
  fetchSnapshot: (s?: string) => Promise<{ ok: boolean }>;
};

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

/**
 * Web Storage そのものが拒む環境 (`storageReadPolicy.test.ts` の docblock が引く
 * Chrome の `SecurityError: Access is denied for this document.`)。`localStorage` の
 * **getter** が投げるので、`getItem` / `setItem` に届く前に飛ぶ。
 */
const STORAGE_DENIED = 'Access is denied for this document.';
let storageOwn: PropertyDescriptor | undefined;
let storageDenied = false;
function denyStorage(message: string = STORAGE_DENIED): void {
  storageOwn = Object.getOwnPropertyDescriptor(window, 'localStorage');
  storageDenied = true;
  Object.defineProperty(window, 'localStorage', {
    configurable: true,
    get() {
      throw new DOMException(message, 'SecurityError');
    },
  });
}
function restoreStorage(): void {
  if (!storageDenied) return;
  storageDenied = false;
  if (storageOwn) Object.defineProperty(window, 'localStorage', storageOwn);
  else delete (window as unknown as { localStorage?: unknown }).localStorage;
}

type Result = { ok: boolean; code?: string; message?: string };

/** 全組を叩き、reject した組を返す (resolve した結果は `seen` に積む)。 */
async function walk(
  hub: Hub,
  payloadOf: () => Record<string, unknown>,
  seen: Result[] = [],
): Promise<string[]> {
  const rejected: string[] = [];
  for (const [svc, act] of PAIRS) {
    try {
      seen.push((await hub.invoke(svc, act, payloadOf())) as Result);
    } catch (e) {
      rejected.push(`${svc}/${act}: ${(e as Error).message.slice(0, 60)}`);
    }
  }
  return rejected;
}

const SNAPSHOT_IDS = ['stocks', 'hydroponics', 'ollama', 'emotions', 'talent', 'teamradar', 'security', 'cursor', 'github', 'nosuch'];

describe('ブラウザ版の invoke は、敵対的な環境でも reject しない', () => {
  beforeEach(() => {
    probeMode = 'real';
    localStorage.clear();
    vi.stubGlobal('fetch', () => Promise.reject(new Error('network down')));
    breakObjectUrl();
  });
  afterEach(() => {
    restoreStorage();
    probeMode = 'real';
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

describe('★ 床 (パス 312): 枝の try の外で投げても reject しない —— main の action:invoke と同じ形', () => {
  beforeEach(() => {
    probeMode = 'real';
    localStorage.clear();
    vi.stubGlobal('fetch', () => Promise.reject(new Error('network down')));
    breakObjectUrl();
  });
  afterEach(() => {
    restoreStorage();
    probeMode = 'real';
  });

  it('標本: Web Storage が拒む環境は clear-history の枝へ本当に届く (枝は try を持たない)', async () => {
    const hub = await loadHub();
    denyStorage();
    const r = (await hub.invoke('emotions', 'clear-history', { kind: 'all' })) as Result;
    // 床が無ければここは reject で、この検査は「落ちる」のではなく「投げる」。
    expect(r.ok).toBe(false);
    expect(r.code).toBe('action_failed');
    expect(r.message).toContain(STORAGE_DENIED);
  });

  it('★ 全組 × Web Storage が拒む環境: reject 0', async () => {
    const hub = await loadHub();
    denyStorage();
    expect(await walk(hub, () => ({ kind: 'all', symbol: 'AAPL' }))).toEqual([]);
  });

  it('★ 全組 × payload が null: reject 0 (型は object だが、床は型を信じない)', async () => {
    const hub = await loadHub();
    const seen: Result[] = [];
    expect(await walk(hub, () => null as unknown as Record<string, unknown>, seen)).toEqual([]);
    // 空虚でない: null は枝の中まで届き、`action_failed` で戻る組が在る (実測 11 組)。
    const failedInBranch = seen.filter((r) => r.ok === false && r.code === 'action_failed');
    expect(failedInBranch.length).toBeGreaterThanOrEqual(11);
  });

  it('★ 全組 × 欄の形が違う payload: reject 0', async () => {
    const hub = await loadHub();
    const shape = {
      params: 'str', templateId: 'invoice', chart: 42, kind: 'weird', strategyComparison: 42,
      advisorResult: 'x', flagged: 'x', candidate: 1, score: 'x', note: 1, text: 1, model: 1, prompt: 1, messages: 'x',
    };
    expect(await walk(hub, () => shape)).toEqual([]);
    // 標本: stocks の書き出しは `strategyComparison: 42` で枝の try の外で投げていた組。
    const r = (await hub.invoke('stocks', 'export-dashboard', shape)) as Result;
    expect(r.ok).toBe(false);
    expect(r.code).toBe('action_failed');
  });

  it('★ 床の文面は main と同じ safeErrorMessage を通る (伏字 + 天井)', async () => {
    const hub = await loadHub();
    const raw = 'denied: Authorization: Bearer ghp_abcdefghijklmnopqrstuvwxyz0123456789';
    // 標本: 素の文面には鍵が載っており、伏字はそれを実際に伏せる。
    expect(raw).toContain('ghp_abcdef');
    expect(redactForMessage(raw, 2000)).not.toContain('ghp_abcdef');
    denyStorage(raw);
    const r = (await hub.invoke('emotions', 'clear-history', { kind: 'all' })) as Result;
    expect(r.ok).toBe(false);
    expect(r.message).toContain('Bearer [REDACTED]');
    expect(r.message).not.toContain('ghp_abcdef');
  });

  it('★ fetchSnapshot も同じ床 (fetch_failed): 枝の try の外で投げても resolve する', async () => {
    const hub = await loadHub();
    probeMode = 'throw';
    const r = (await hub.fetchSnapshot('ollama')) as Result;
    expect(r.ok).toBe(false);
    expect(r.code).toBe('fetch_failed');
    expect(r.message).toContain('probe exploded');
    expect(r.message).toContain('Bearer [REDACTED]');
    expect(r.message).not.toContain('ghp_abcdef');
  });

  it('標本: 注入は本当に枝の try の外で投げる (床を外せば reject)', async () => {
    // `unguarded` は公開していないので、床が在ることは「投げる注入が resolve する」ことでしか
    // 見えない。注入そのものが投げることを、床を通らない実物で確かめる。
    probeMode = 'throw';
    const mod = await import('../network/ollamaWeb');
    await expect(mod.probeOllama('http://127.0.0.1:11434')).rejects.toThrow('probe exploded');
  });

  it('全スナップショット × Web Storage が拒む環境: reject 0', async () => {
    const hub = await loadHub();
    denyStorage();
    const rejected: string[] = [];
    for (const id of SNAPSHOT_IDS) {
      try {
        await hub.fetchSnapshot(id);
      } catch (e) {
        rejected.push(`${id}: ${(e as Error).message.slice(0, 60)}`);
      }
    }
    expect(rejected).toEqual([]);
  });
});
