// @vitest-environment jsdom
/**
 * クラウド全停止の演習 —— ブラウザ版の取得 (2026-11-11)。
 *
 * デスクトップ版の演習 (`main/clients/__tests__/cloudOutageDrill.test.ts`) と同じ主張を、ブラウザ版の橋
 * (`web-shim.ts`) に対して測る: 「クラウドが預かるデータを見る画面」を除く全サービスの取得は、
 * 端末の外へ向けて網の口を 1 度も叩かない。保管庫にはどのサービスにも資格情報が入っている状態で測る
 * (入っていないから出ない、という通り方をさせない)。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { rereadModule } from '../../shared/__tests__/rereadModule';
import '../web-shim';
import { continuityClassOf } from '../../shared/cloudContinuity';
import { SERVICE_IDS } from '../../shared/serviceId';

vi.mock('../security/vault', () => ({
  getVault: () => ({
    takeExpiredNotice: () => null,
    getToken: async () => 'token-for-drill',
    setToken: async () => {},
    clearToken: async () => {},
    listServices: async () => [...SERVICE_IDS],
    listConfigured: async () => [...SERVICE_IDS],
    status: async () => 'unlocked',
  }),
}));
vi.mock('electron', () => ({
  contextBridge: { exposeInMainWorld: () => {} },
  ipcRenderer: { invoke: () => Promise.resolve() },
}));

type Result = { ok: boolean; code?: string; message?: string };
type Hub = {
  fetchSnapshot: (id: string) => Promise<Result>;
  invoke: (s: string, a: string, p: Record<string, unknown>) => Promise<Result>;
};

async function loadHub(): Promise<Hub> {
  delete (window as unknown as { serviceHub?: unknown }).serviceHub;
  await rereadModule<typeof import('../web-shim')>(import.meta.url, '../web-shim');
  return (window as unknown as { serviceHub: Hub }).serviceHub;
}

function isLoopback(url: string): boolean {
  try {
    const h = new URL(url).hostname;
    return h === '127.0.0.1' || h === 'localhost' || h === '[::1]' || h === '::1';
  } catch {
    return false;
  }
}

const calls: string[] = [];

beforeEach(() => {
  calls.length = 0;
  vi.stubGlobal('fetch', async (input: unknown) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : String((input as { url?: unknown })?.url ?? input);
    if (!isLoopback(url)) calls.push(url);
    throw new TypeError('Failed to fetch');
  });
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe('クラウド全停止の演習 (ブラウザ版の取得)', () => {
  const offCloud = SERVICE_IDS.filter((id) => continuityClassOf(id) !== 'cloud-data');

  it('★ 預かるデータを見る画面を除く全サービスの取得は、端末の外へ 1 度も出ない (reject もしない)', async () => {
    const hub = await loadHub();
    expect(offCloud.length).toBeGreaterThanOrEqual(60);
    const leaked: string[] = [];
    for (const id of offCloud) {
      const before = calls.length;
      const r = await hub.fetchSnapshot(id);
      expect(typeof r.ok, id).toBe('boolean');
      if (calls.length > before) leaked.push(`${id}: ${calls[before]}`);
    }
    expect(leaked).toEqual([]);
  }, 60_000);

  it('対照: 外部サービスへの書き込みは、実際に外へ出ようとして失敗を返す (数え方が空でない証拠)', async () => {
    const hub = await loadHub();
    const r = await hub.invoke('github', 'create-issue', { owner: 'o', repo: 'r', title: 't', body: 'b' });
    expect(r.ok).toBe(false);
    expect(calls.length).toBe(1);
    expect(new URL(calls[0] ?? '').hostname).toBe('api.github.com');
  });
});
