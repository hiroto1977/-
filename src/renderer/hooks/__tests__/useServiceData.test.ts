/** @vitest-environment jsdom */
import { describe, it, expect, beforeEach } from 'vitest';
import { createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { useServiceData, type ServiceState, type ErrorKind } from '../useServiceData';
import type { FetchResult, ServiceId } from '../../../preload/preload';

// React 18 の act() 警告を抑止。
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

type Hub = {
  listConfigured: () => Promise<ServiceId[]>;
  fetchSnapshot: (id: ServiceId) => Promise<FetchResult<unknown>>;
};
function setHub(hub: Hub | undefined) {
  (window as unknown as { serviceHub: unknown }).serviceHub = hub;
}

/** マイクロタスクを数回流して mount effect / refresh の連鎖を解決させる。 */
async function flush(n = 8): Promise<void> {
  for (let i = 0; i < n; i += 1) {
    await act(async () => {
      await Promise.resolve();
    });
  }
}

function setup<T>(serviceId: ServiceId, snapshot: T) {
  const ref: { current: ServiceState<T> } = { current: null as unknown as ServiceState<T> };
  function Harness({ sid }: { sid: ServiceId }) {
    ref.current = useServiceData<T>(sid, snapshot);
    return null;
  }
  const container = document.createElement('div');
  let root!: Root;
  return {
    ref,
    async mount() {
      await act(async () => {
        root = createRoot(container);
        root.render(createElement(Harness, { sid: serviceId }));
      });
      await flush();
    },
    /** serviceId プロップを差し替えて再描画し、mount effect の再評価を反映させる。 */
    async rerender(sid: ServiceId) {
      await act(async () => {
        root.render(createElement(Harness, { sid }));
      });
      await flush();
    },
    async refresh() {
      await act(async () => {
        await ref.current.refresh();
      });
      await flush(2);
    },
    unmount() {
      act(() => root.unmount());
    },
  };
}

const okHub = (data: unknown): Hub => ({
  listConfigured: async () => [],
  fetchSnapshot: async () => ({ ok: true, data }) as FetchResult<unknown>,
});
const errHub = (code: 'not_configured' | 'fetch_failed' | 'not_implemented', message: string): Hub => ({
  listConfigured: async () => [],
  fetchSnapshot: async () => ({ ok: false, code, message }) as FetchResult<unknown>,
});

beforeEach(() => setHub(undefined));

describe('useServiceData — initial state', () => {
  it('starts from the snapshot, idle, not configured', async () => {
    setHub(okHub({ v: 99 }));
    const h = setup('github', { v: 1 });
    await h.mount();
    expect(h.ref.current.source).toBe('snapshot');
    expect(h.ref.current.status).toBe('idle');
    expect(h.ref.current.isConfigured).toBe(false);
    expect(h.ref.current.data).toEqual({ v: 1 }); // 未設定 → 自動更新せずスナップショットのまま
    h.unmount();
  });
});

describe('useServiceData — refresh', () => {
  it('returns early (no state change) when window.serviceHub is absent', async () => {
    setHub(undefined);
    const h = setup('github', { v: 1 });
    await h.mount();
    await h.refresh();
    expect(h.ref.current.status).toBe('idle'); // loading にすらならない
    expect(h.ref.current.source).toBe('snapshot');
    h.unmount();
  });

  it('on success swaps to live data, source=live, status=idle', async () => {
    setHub(okHub({ v: 42 }));
    const h = setup('github', { v: 1 });
    await h.mount();
    await h.refresh();
    expect(h.ref.current.data).toEqual({ v: 42 });
    expect(h.ref.current.source).toBe('live');
    expect(h.ref.current.status).toBe('idle');
    expect(h.ref.current.errorMessage).toBeUndefined();
    expect(h.ref.current.errorKind).toBeUndefined();
    h.unmount();
  });

  it('sets status=loading while the fetch is in flight, then idle', async () => {
    let release!: (r: FetchResult<unknown>) => void;
    const pending = new Promise<FetchResult<unknown>>((r) => { release = r; });
    setHub({ listConfigured: async () => [], fetchSnapshot: () => pending });
    const h = setup('github', { v: 1 });
    await h.mount();
    // refresh を起動するが解決させない (戻り値型は void なので保持しない)。
    await act(async () => {
      h.ref.current.refresh();
      await Promise.resolve();
    });
    expect(h.ref.current.status).toBe('loading');
    await act(async () => {
      release({ ok: true, data: { v: 7 } });
      await flush(2);
    });
    expect(h.ref.current.status).toBe('idle');
    expect(h.ref.current.data).toEqual({ v: 7 });
    h.unmount();
  });

  it('on failure sets status=error and keeps the snapshot data', async () => {
    setHub(errHub('fetch_failed', 'boom 500'));
    const h = setup('github', { v: 1 });
    await h.mount();
    await h.refresh();
    expect(h.ref.current.status).toBe('error');
    expect(h.ref.current.errorMessage).toBe('boom 500');
    expect(h.ref.current.source).toBe('snapshot');
    expect(h.ref.current.data).toEqual({ v: 1 });
    h.unmount();
  });

  it('treats not_configured as an auth error and marks isConfigured=false', async () => {
    setHub(errHub('not_configured', 'no token'));
    const h = setup('github', { v: 1 });
    await h.mount();
    await h.refresh();
    expect(h.ref.current.status).toBe('error');
    expect(h.ref.current.errorKind).toBe('auth');
    expect(h.ref.current.isConfigured).toBe(false);
    h.unmount();
  });
});

describe('useServiceData — error classification (via errorKind)', () => {
  async function kindFor(message: string, code: 'fetch_failed' | 'not_implemented' = 'fetch_failed'): Promise<ErrorKind | undefined> {
    setHub(errHub(code, message));
    const h = setup('github', { v: 1 });
    await h.mount();
    await h.refresh();
    const k = h.ref.current.errorKind;
    h.unmount();
    return k;
  }

  it('classifies auth errors (401 / unauthorized / invalid_auth / bad credentials)', async () => {
    expect(await kindFor('HTTP 401')).toBe('auth');
    expect(await kindFor('Unauthorized request')).toBe('auth');
    expect(await kindFor('invalid_auth token')).toBe('auth');
    expect(await kindFor('Bad credentials')).toBe('auth');
  });

  it('classifies rate limits (403+rate / 429) but not a plain 403', async () => {
    expect(await kindFor('403 rate limit exceeded')).toBe('rate_limit');
    expect(await kindFor('throttled (403)')).toBe('rate_limit');
    expect(await kindFor('HTTP 429 too many requests')).toBe('rate_limit');
    // 403 単体は rate ワードが無いので rate_limit ではない (&& を撃墜)。
    expect(await kindFor('403 forbidden')).toBe('unknown');
  });

  it('classifies network errors (fetch failed / network / ECONN / ENOTFOUND / timeout)', async () => {
    expect(await kindFor('fetch failed')).toBe('network');
    expect(await kindFor('network down')).toBe('network');
    expect(await kindFor('ECONNREFUSED')).toBe('network');
    expect(await kindFor('ENOTFOUND host')).toBe('network');
    expect(await kindFor('request timeout')).toBe('network');
  });

  it('falls back to unknown for unrecognized messages', async () => {
    expect(await kindFor('something strange happened')).toBe('unknown');
  });
});

describe('useServiceData — mount auto-refresh', () => {
  it('detects a configured token and auto-refreshes once on mount', async () => {
    const hub: Hub = {
      listConfigured: async () => ['github'],
      fetchSnapshot: async () => ({ ok: true, data: { v: 100 } }) as FetchResult<unknown>,
    };
    setHub(hub);
    const h = setup('github', { v: 1 });
    await h.mount();
    expect(h.ref.current.isConfigured).toBe(true);
    expect(h.ref.current.source).toBe('live'); // 自動更新が走った
    expect(h.ref.current.data).toEqual({ v: 100 });
    h.unmount();
  });

  it('does not auto-refresh when the service is not in the configured list', async () => {
    let fetched = 0;
    const hub: Hub = {
      listConfigured: async () => ['notion'],
      fetchSnapshot: async () => { fetched += 1; return { ok: true, data: { v: 5 } } as FetchResult<unknown>; },
    };
    setHub(hub);
    const h = setup('github', { v: 1 });
    await h.mount();
    expect(h.ref.current.isConfigured).toBe(false);
    expect(h.ref.current.source).toBe('snapshot');
    expect(fetched).toBe(0);
    h.unmount();
  });

  it('auto-refreshes only once even though listConfigured reports it configured', async () => {
    let fetched = 0;
    const hub: Hub = {
      listConfigured: async () => ['github'],
      fetchSnapshot: async () => { fetched += 1; return { ok: true, data: { v: 9 } } as FetchResult<unknown>; },
    };
    setHub(hub);
    const h = setup('github', { v: 1 });
    await h.mount();
    await flush();
    expect(fetched).toBe(1); // autoRefreshFired ガードで二重起動しない
    h.unmount();
  });

  it('keeps the initial isConfigured=false while listConfigured is still pending', async () => {
    // 解決しない listConfigured → mount effect が setIsConfigured を呼べない。初期値 false の
    // まま観測できるので、useState(false) を true 化する変異を撃墜する。
    setHub({ listConfigured: () => new Promise<ServiceId[]>(() => {}), fetchSnapshot: async () => ({ ok: true, data: {} }) as FetchResult<unknown> });
    const h = setup('github', { v: 1 });
    await h.mount();
    expect(h.ref.current.isConfigured).toBe(false);
    h.unmount();
  });
});

describe('useServiceData — isConfigured transitions on error', () => {
  it('flips isConfigured true→false only for not_configured (and stays true otherwise)', async () => {
    const hub: Hub = {
      listConfigured: async () => ['github'],
      fetchSnapshot: async () => ({ ok: true, data: { v: 1 } }) as FetchResult<unknown>,
    };
    setHub(hub);
    const h = setup('github', { v: 1 });
    await h.mount();
    expect(h.ref.current.isConfigured).toBe(true); // 設定済み + 自動更新成功
    // not_configured 以外のエラーでは isConfigured は維持される (=== true 化変異を撃墜)。
    hub.fetchSnapshot = async () => ({ ok: false, code: 'fetch_failed', message: 'oops' }) as FetchResult<unknown>;
    await h.refresh();
    expect(h.ref.current.isConfigured).toBe(true);
    // not_configured のときだけ false に落ちる (=== false 化 / !== / StringLiteral を撃墜)。
    hub.fetchSnapshot = async () => ({ ok: false, code: 'not_configured', message: 'revoked' }) as FetchResult<unknown>;
    await h.refresh();
    expect(h.ref.current.isConfigured).toBe(false);
    h.unmount();
  });
});

describe('useServiceData — reacts to serviceId prop changes', () => {
  it('re-evaluates configuration when the serviceId changes (effect deps)', async () => {
    // github のみ設定済み。github→notion へ変更すると effect が再実行され isConfigured が落ちる。
    // 依存配列を [] にする変異だと再実行されず true のままになり撃墜される。
    setHub({
      listConfigured: async () => ['github'],
      fetchSnapshot: async () => ({ ok: true, data: { v: 1 } }) as FetchResult<unknown>,
    });
    const h = setup('github', { v: 1 });
    await h.mount();
    expect(h.ref.current.isConfigured).toBe(true);
    await h.rerender('notion');
    expect(h.ref.current.isConfigured).toBe(false);
    h.unmount();
  });

  it('auto-refreshes once across serviceId changes; manual refresh targets the current id (callback/guard deps)', async () => {
    const calls: ServiceId[] = [];
    setHub({
      listConfigured: async () => ['github', 'notion'],
      fetchSnapshot: async (id) => { calls.push(id); return { ok: true, data: { id } } as FetchResult<unknown>; },
    });
    const h = setup('github', { v: 1 });
    await h.mount();
    expect(calls).toEqual(['github']); // マウントで一度だけ自動更新
    await h.rerender('notion');
    // autoRefreshFired ガード (true 固定済み) で notion は自動更新しない → calls 不変。
    // ガードの代入を false 化する変異だと二度目が走り calls に notion が積まれ撃墜される。
    expect(calls).toEqual(['github']);
    // 手動 refresh は現在の serviceId (notion) を叩く → refresh の依存配列 [serviceId] を撃墜。
    await h.refresh();
    expect(calls[calls.length - 1]).toBe('notion');
    h.unmount();
  });
});
