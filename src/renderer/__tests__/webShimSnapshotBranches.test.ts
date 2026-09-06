/** @vitest-environment jsdom */
/**
 * **ブラウザ版の `fetchSnapshot` —— 画面が見る値が、保存した物を反映するか。**
 *
 * `web-shim.ts` の `fetchSnapshot` はサービスごとに分岐して「その端末で観測できる形」を
 * 組む。ここが `not_implemented` に落ちると、**保存の口は成功するのに画面は同梱の
 * サンプルを見続ける**という壊れ方になる。実際に 2 回起きていて、コードに記録が残っている:
 *
 *   talent   (2026-08-28) 入力しても診断が変わらない —— e2e が見つけた
 *   security (2026-08-25) 鍵を保存できるのにボタンは永久に押せない
 *                         「指示どおりにやったのに、何も変わらない」
 *
 * それでも実測 (2026-09-06 の変異検査) では、この分岐の並びに **未到達の変異体が 50 件超**
 * 残っていた —— どのテストも `fetchSnapshot` を通っていない。同じ壊れ方が戻ったときに
 * 鳴るように、**保存 → スナップショットの往復**を分岐ごとに留める。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/** 金庫の中身をテストごとに差し替える。 */
const tokens = new Map<string, string>();

vi.mock('../security/vault', () => ({
  getVault: () => ({
    getToken: async (id: string) => tokens.get(id) ?? null,
    setToken: async () => {},
    clearToken: async () => {},
    listServices: async () => [...tokens.keys()],
    status: async () => 'unlocked',
  }),
}));
vi.mock('../library/library', () => ({ getLibrary: () => ({ put: async () => {}, list: async () => [] }) }));
vi.mock('../network/proxy', () => ({
  getProxyConfig: async () => null,
  fetchViaProxy: async () => new Response('{}', { status: 200 }),
  PROXY_REQUIRED_SERVICES: new Set<string>(),
}));
vi.mock('electron', () => ({
  contextBridge: { exposeInMainWorld: () => {} },
  ipcRenderer: { invoke: () => Promise.resolve() },
}));

type Result = { ok: boolean; code?: string; message?: string; data?: Record<string, unknown> };
type Hub = {
  fetchSnapshot: (s?: string) => Promise<Result>;
  invoke: (s: string, a: string, p: Record<string, unknown>) => Promise<Result>;
};

async function loadHub(): Promise<Hub> {
  vi.resetModules();
  delete (window as unknown as { serviceHub?: unknown }).serviceHub;
  await import('../web-shim');
  return (window as unknown as { serviceHub: Hub }).serviceHub;
}

const originalFetch = globalThis.fetch;

beforeEach(() => {
  localStorage.clear();
  tokens.clear();
  // ollama のプローブは実際に接続を試すので、既定は「繋がらない」にする。
  globalThis.fetch = (async () => {
    throw new Error('offline');
  }) as typeof fetch;
});
afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe('talent — 保存した申告が診断に出る', () => {
  it('★ 保存した状態がスナップショットに反映される (2026-08-28 の回帰)', async () => {
    const hub = await loadHub();
    const saved = await hub.invoke('talent', 'save-state', {
      reports: [{ department: '営業', diseases: ['imprint'] }],
      initiatives: [{ name: '週次の棚卸し', probability: 40 }],
      members: [{ id: 'm1', name: '山田', step: 1, yearsInStep: 2 }],
      updatedAt: '2026-09-06',
    });
    expect(saved.ok, saved.message).toBe(true);

    const snap = await hub.fetchSnapshot('talent');
    expect(snap.ok, snap.message).toBe(true);
    // 保存した部署名が診断の側に出る (同梱の空スナップショットではない)
    expect(JSON.stringify(snap.data)).toContain('営業');
  });

  it('保存が無い端末でも ok を返す (空の診断)', async () => {
    const hub = await loadHub();
    const snap = await hub.fetchSnapshot('talent');
    expect(snap.ok).toBe(true);
  });

  it('壊れた保存値でも ok を返す (空で続ける)', async () => {
    localStorage.setItem('servicehub.talent.state.v1', '{壊れた');
    const hub = await loadHub();
    const snap = await hub.fetchSnapshot('talent');
    expect(snap.ok).toBe(true);
  });
});

describe('security — 鍵を入れたら門が開く', () => {
  it('★ 鍵を保存すると keysConfigured が立つ (2026-08-25 の回帰)', async () => {
    tokens.set('security', JSON.stringify({ hibp: 'hibp-key', vt: 'vt-key' }));
    const hub = await loadHub();
    const snap = await hub.fetchSnapshot('security');
    expect(snap.ok, snap.message).toBe(true);
    expect(snap.data?.keysConfigured).toEqual({ hibp: true, vt: true });
  });

  it('鍵が無ければ両方 false (同梱スナップショットのまま)', async () => {
    const hub = await loadHub();
    const snap = await hub.fetchSnapshot('security');
    expect(snap.data?.keysConfigured).toEqual({ hibp: false, vt: false });
  });

  it('片方だけの鍵は片方だけ立つ', async () => {
    tokens.set('security', JSON.stringify({ vt: 'vt-key' }));
    const hub = await loadHub();
    const snap = await hub.fetchSnapshot('security');
    expect(snap.data?.keysConfigured).toEqual({ hibp: false, vt: true });
  });

  it('端末固有の検出 (Norton) は同梱の値のまま —— ブラウザからは見えないので嘘をつかない', async () => {
    const hub = await loadHub();
    const snap = await hub.fetchSnapshot('security');
    const norton = snap.data?.norton as { installed?: unknown } | undefined;
    expect(norton?.installed).toBe(false);
  });
});

describe('emotions — 鍵の有無だけを名乗る', () => {
  it('★ 鍵があれば keyConfigured が立つ', async () => {
    tokens.set('emotions', 'sk-ant-test');
    const hub = await loadHub();
    const snap = await hub.fetchSnapshot('emotions');
    expect(snap.ok, snap.message).toBe(true);
    expect(snap.data?.keyConfigured).toBe(true);
  });

  it('鍵が無ければ立たない', async () => {
    const hub = await loadHub();
    const snap = await hub.fetchSnapshot('emotions');
    expect(snap.data?.keyConfigured).toBe(false);
  });
});

describe('stocks — 登録した銘柄が出る', () => {
  it('★ ウォッチリストに登録した銘柄がスナップショットに現れる', async () => {
    const hub = await loadHub();
    const reg = await hub.invoke('stocks', 'register-ticker', { symbol: 'AAPL' });
    expect(reg.ok, reg.message).toBe(true);
    const snap = await hub.fetchSnapshot('stocks');
    expect(snap.ok, snap.message).toBe(true);
    expect(JSON.stringify(snap.data)).toContain('AAPL');
  });
});

describe('ollama — 繋がらないことは認証の問題ではない', () => {
  it('★ 失敗の code は ollama_ で始まる (not_configured にしない)', async () => {
    const hub = await loadHub();
    const snap = await hub.fetchSnapshot('ollama');
    expect(snap.ok).toBe(false);
    expect(snap.code).toMatch(/^ollama_/);
    // `not_configured` だと useServiceData が「認証の問題」に分類してしまう
    expect(snap.code).not.toBe('not_configured');
    expect(typeof snap.message).toBe('string');
  });
});

describe('分岐が無いサービス', () => {
  it('ブラウザ版で読めないサービスは not_implemented と言う (黙って空を返さない)', async () => {
    const hub = await loadHub();
    const snap = await hub.fetchSnapshot('uber-eats');
    expect(snap.ok).toBe(false);
    expect(snap.code).toBe('not_implemented');
    expect(snap.message).toContain('snapshot');
  });

  it('serviceId 無しでも投げずに答える', async () => {
    const hub = await loadHub();
    const snap = await hub.fetchSnapshot();
    expect(snap.ok).toBe(false);
    expect(snap.code).toBe('not_implemented');
  });
});
