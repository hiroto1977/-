/** @vitest-environment jsdom */
/**
 * **設定した本人に「登録してください」と言わない (ブラウザ版の案内)。**
 *
 * `getProxyTransport` は設定が無いときに「設定でプロキシ (Cloudflare Worker) の
 * URL を登録してください」と案内する。**保管先が読めないときも同じ案内**を
 * 出していた (2026-09-06 実測) —— 登録済みの利用者は URL と**共有シークレット**を
 * 打ち直し、同じ所で失敗する。読めなかったのなら、そう言う。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({ unreadable: null as unknown, vaultListRejection: null as Error | null }));

vi.mock('../network/proxy', () => ({
  getProxyConfig: async () => null,
  inspectStoredProxyConfig: async () => ({ config: null, rejected: null, unreadable: h.unreadable }),
  fetchViaProxy: async () => new Response('{}', { status: 200 }),
}));
vi.mock('../security/vault', () => ({
  getVault: () => ({
    getToken: async () => 'ya29.test-token',
    setToken: async () => {},
    clearToken: async () => {},
    listServices: async () => ['calendar'],
    listConfigured: async () => {
      if (h.vaultListRejection !== null) throw h.vaultListRejection;
      return ['calendar'];
    },
    status: async () => 'unlocked',
  }),
}));
vi.mock('../library/library', () => ({ getLibrary: () => ({ put: async () => {}, list: async () => [] }) }));
vi.mock('electron', () => ({
  contextBridge: { exposeInMainWorld: () => {} },
  ipcRenderer: { invoke: () => Promise.resolve() },
}));

type Result = { ok: boolean; code?: string; message?: string };
type Hub = {
  invoke: (s: string, a: string, p: Record<string, unknown>) => Promise<Result>;
  listConfigured: () => Promise<string[]>;
};

async function loadHub(): Promise<Hub> {
  vi.resetModules();
  delete (window as unknown as { serviceHub?: unknown }).serviceHub;
  await import('../web-shim');
  return (window as unknown as { serviceHub: Hub }).serviceHub;
}

const PAYLOAD = { summary: '打ち合わせ', start: '2026-09-07T10:00:00Z', end: '2026-09-07T11:00:00Z' };

beforeEach(() => {
  localStorage.clear();
  h.unreadable = null;
  h.vaultListRejection = null;
});

describe('プロキシ設定が読めないとき', () => {
  it('★ 「読めませんでした」と言い、「登録してください」とは言わない', async () => {
    const e = new Error('store unavailable');
    e.name = 'QuotaExceededError';
    h.unreadable = e;
    const hub = await loadHub();
    const r = await hub.invoke('calendar', 'create-event', PAYLOAD);
    expect(r.ok).toBe(false);
    expect(r.message).toContain('この端末に保存した設定を読めませんでした');
    expect(r.message).toContain('「未設定」と出ていても、設定が消えたとは限りません');
    expect(r.message).not.toContain('登録してください');
  });

  it('対照: 本当に未設定なら、これまでどおり登録を案内する', async () => {
    const hub = await loadHub();
    const r = await hub.invoke('calendar', 'create-event', PAYLOAD);
    expect(r.ok).toBe(false);
    expect(r.message).toContain('登録してください');
    expect(r.message).not.toContain('読めませんでした');
  });
});

describe('資格情報の一覧が読めないとき (ブラウザ版)', () => {
  it('★ 投げ返す —— 「1 件も登録されていない」と名乗らない', async () => {
    h.vaultListRejection = new Error('store unavailable');
    const hub = await loadHub();
    await expect(hub.listConfigured()).rejects.toThrow('store unavailable');
  });

  it('対照: 読めるときは一覧を返す', async () => {
    const hub = await loadHub();
    await expect(hub.listConfigured()).resolves.toEqual(['calendar']);
  });
});
