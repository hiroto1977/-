/**
 * 社外向けポータルの橋 (`portal/portalShim.ts` · 2026-11-11)。
 *
 * この橋は**資格情報を預からず、網へ出ず、何も書き込まない**。橋の 15 の口すべてを実際に呼んで、
 * 失敗を戻り値で答えること (reject しないこと) と、`fetchSnapshot` が入口の関門を通ることを見る。
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { isWebBuildVersion } from '../../../shared/buildDestinations';
import { CUSTOMER_SCREENS, PARTNER_SCREENS } from '../../../shared/portal';
import { SERVICE_IDS } from '../../../shared/serviceId';
import { bridgeExposed, type ServiceHubBridge } from '../../../preload/preload';
import {
  createPortalBridge,
  installPortalBridge,
  PORTAL_BUILD_VERSION,
  PORTAL_NO_CREDENTIALS,
  PORTAL_NO_OS,
  PORTAL_NOT_INCLUDED,
  PORTAL_SNAPSHOT_ONLY,
  type PortalBridge,
} from '../portalShim';

// 実物の橋 (preload) が露出する口を、host の壁を代役にして受け取る (Electron を読み込まない)。
const exposed = vi.hoisted(() => ({ api: null as Record<string, unknown> | null }));
vi.mock('../../../preload/preloadHost', () => ({
  invokeIpc: () => Promise.resolve(undefined),
  exposeBridge: (_name: string, api: Record<string, unknown>) => {
    exposed.api = api;
    return true;
  },
}));

// 口の名前が実物の橋と同じであることは型でも見る (どちらかに余りが出れば typecheck が落ちる)。
type Leftover = [Exclude<keyof ServiceHubBridge, keyof PortalBridge>, Exclude<keyof PortalBridge, keyof ServiceHubBridge>];
const sameKeys: Leftover extends [never, never] ? true : false = true;

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('橋の面', () => {
  it('★ preload の橋が持つ口と同じ名前を、過不足なく持つ (画面がどの口を呼んでも undefined にならない)', () => {
    const names = Object.keys(exposed.api ?? {});
    expect(bridgeExposed).toBe(true); // 上の代役が橋を受け取った (読み込みの時点で 1 度)
    expect(names.length).toBe(15);
    expect(Object.keys(createPortalBridge('partner')).sort()).toEqual([...names].sort());
    expect(sameKeys).toBe(true);
  });

  it('版は数を名乗らず、ブラウザ版の接尾辞だけを持つ', async () => {
    const bridge = createPortalBridge('customer');
    await expect(bridge.getVersion()).resolves.toBe(PORTAL_BUILD_VERSION);
    expect(isWebBuildVersion(PORTAL_BUILD_VERSION)).toBe(true);
    expect(/\d/.test(PORTAL_BUILD_VERSION)).toBe(false);
    await expect(bridge.checkUpdate()).resolves.toEqual({
      status: 'unknown',
      current: PORTAL_BUILD_VERSION,
      latest: null,
      url: null,
    });
  });
});

describe('★ 資格情報を預からない・書き込まない・OS に触らない', () => {
  const bridge = createPortalBridge('partner');

  it('setToken は断り、listConfigured は常に空、authorize は断る', async () => {
    await expect(bridge.setToken()).resolves.toEqual({ ok: false, code: 'invalid_service', message: PORTAL_NO_CREDENTIALS });
    await expect(bridge.listConfigured()).resolves.toEqual([]);
    await expect(bridge.oauthSupported()).resolves.toBe(false);
    await expect(bridge.authorize()).resolves.toEqual({ ok: false, code: 'not_supported', message: PORTAL_NO_CREDENTIALS });
    await expect(bridge.clearToken()).resolves.toEqual({ ok: true });
  });

  it('invoke はどの action も実行しない', async () => {
    await expect(bridge.invoke()).resolves.toEqual({ ok: false, code: 'action_not_found', message: PORTAL_NOT_INCLUDED });
  });

  it('OS でファイルを開く口は断る', async () => {
    await expect(bridge.openPath()).resolves.toEqual({ ok: false, message: PORTAL_NO_OS });
    await expect(bridge.revealInFolder()).resolves.toEqual({ ok: false, message: PORTAL_NO_OS });
  });

  it('eraseAll は何も消さず、消したとも言わない (同じ場所の社内版を巻き込まない)', async () => {
    const report = await bridge.eraseAll();
    expect(report.allDeleted).toBe(false);
    expect(report).toEqual({
      kind: 'browser',
      indexeddb: {},
      localStorage: 'unavailable',
      sessionStorage: 'unavailable',
      cacheStorage: 'unavailable',
      allDeleted: false,
    });
  });

  it('保管の説明は「暗号化していない・預かり 0 件」と答え、ポータルの名前を名乗る', async () => {
    const p = await bridge.storageProtection();
    expect(p.encrypted).toBe(false);
    expect(p.plainCount).toBe(0);
    expect(p.file).toContain('パートナーポータル');
    expect((await createPortalBridge('customer').storageProtection()).file).toContain('カスタマーポータル');
  });
});

describe('★ fetchSnapshot は入口の関門を通る', () => {
  it('このポータルの画面には「同梱の内容を使う」と答える (網へ出ない)', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    const bridge = createPortalBridge('partner');
    for (const s of PARTNER_SCREENS) {
      await expect(bridge.fetchSnapshot(s.id)).resolves.toEqual({
        ok: false,
        code: 'not_implemented',
        message: PORTAL_SNAPSHOT_ONLY,
      });
    }
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('このポータルに無い画面は断る —— 社内の画面を総当たり', async () => {
    for (const [portal, screens] of [
      ['partner', PARTNER_SCREENS],
      ['customer', CUSTOMER_SCREENS],
    ] as const) {
      const bridge = createPortalBridge(portal);
      const allowed = new Set(screens.map((s) => s.id));
      const outside = SERVICE_IDS.filter((id) => !allowed.has(id));
      expect(outside.length).toBeGreaterThan(70);
      for (const id of outside) {
        await expect(bridge.fetchSnapshot(id), `${portal}/${id}`).resolves.toEqual({
          ok: false,
          code: 'fetch_failed',
          message: PORTAL_NOT_INCLUDED,
        });
      }
    }
  });

  it('別のポータルの画面・文字列でない値・引数なしも断る', async () => {
    const customer = createPortalBridge('customer');
    for (const bad of ['docstudio', 'compliance', 'guidelines', '', 42, null, undefined, { id: 'faq' }, ['faq']]) {
      await expect(customer.fetchSnapshot(bad)).resolves.toMatchObject({ ok: false, code: 'fetch_failed' });
    }
    await expect(customer.fetchSnapshot()).resolves.toMatchObject({ ok: false, code: 'fetch_failed' });
  });
});

describe('openExternal は社内版と同じ関門を通る', () => {
  it('http / https だけを開き、それ以外は開かない', async () => {
    const open = vi.fn();
    vi.stubGlobal('window', { open });
    const bridge = createPortalBridge('customer');
    await bridge.openExternal('https://example.co.jp/manuals/product-a');
    expect(open).toHaveBeenCalledTimes(1);
    expect(open.mock.calls[0]?.[0]).toBe('https://example.co.jp/manuals/product-a');
    for (const bad of ['javascript:alert(1)', 'file:///etc/passwd', 'data:text/html,x', '', 'not a url']) {
      await bridge.openExternal(bad);
    }
    expect(open).toHaveBeenCalledTimes(1);
  });
});

describe('installPortalBridge', () => {
  it('橋が無ければ据え付け、在れば触らない (検査の代役を上書きしない)', () => {
    const host: { serviceHub?: unknown } = {};
    vi.stubGlobal('window', host);
    installPortalBridge('partner');
    expect(typeof (host.serviceHub as { fetchSnapshot?: unknown }).fetchSnapshot).toBe('function');
    const first = host.serviceHub;
    installPortalBridge('customer');
    expect(host.serviceHub).toBe(first);
  });

  it('window が無い環境では何もしない', () => {
    vi.stubGlobal('window', undefined);
    expect(() => installPortalBridge('partner')).not.toThrow();
  });
});
