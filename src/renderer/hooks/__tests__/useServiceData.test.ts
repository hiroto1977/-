/** @vitest-environment jsdom */
import { describe, it, expect, beforeEach } from 'vitest';
import { createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { useServiceData, type ServiceState, type ErrorKind } from '../useServiceData';
import {
  _resetDeviceStoreFailureForTests,
  currentDeviceStoreFailure,
} from '../../data/deviceStoreFailure';
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

beforeEach(() => {
  setHub(undefined);
  _resetDeviceStoreFailureForTests();
});

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

  /*
   * マウント時の `listConfigured` が **reject** したとき。
   *
   * `refresh` 側には最初から IPC reject の受け皿があったが、マウント側には
   * 無く、失敗が unhandled rejection として外へ出ていた。変異検査で
   * `window.serviceHub?.` の `?.` を外した変異体がこれを踏み、テスト
   * ランナーごと落ちて Stryker が RuntimeError (評価不成立) と分類 ——
   * その 1 件はスコアの分母から外れ、100.00% のまま見えなくなっていた。
   *
   * ここが無いと受け皿自身が未到達になり、`setIsConfigured(false)` を
   * `true` に変える変異体を誰も殺せない。**防御を足したら、その防御に
   * 届く入力も一緒に足す。**
   */
  it('listConfigured が reject しても落ちず、未設定のまま留まる', async () => {
    setHub({
      listConfigured: async () => { throw new Error('IPC broke'); },
      fetchSnapshot: async () => ({ ok: true, data: { v: 2 } }) as FetchResult<unknown>,
    });
    const h = setup('github', { v: 1 });
    await h.mount();
    expect(h.ref.current.isConfigured).toBe(false);
    expect(h.ref.current.status).toBe('idle');
    expect(h.ref.current.source).toBe('snapshot');
    expect(h.ref.current.data).toEqual({ v: 1 });
    h.unmount();
  });

  /*
   * **「未設定」の札は 75 画面が同じ形で出すので消せない。だから理由を 1 か所で言う。**
   *
   * 資格情報の一覧が取れないと `isConfigured` は false になり、画面は
   * 「トークン未設定」を出す。保管ファイルが読めないだけのときにそれを出すと、
   * 利用者は鍵を貼り直そうとする —— なので橋が**答えを返せなかった**ことを
   * `deviceStoreFailure` の `settings` へ写す (文面は「『未設定』と出ていても、
   * 設定が消えたとは限りません」)。
   *
   * **橋がまだ無いだけのときは報せない** —— 起動直後に赤を出さないための区別で、
   * 元のコメントが言っていた懸念をそのまま守る。
   */
  it('★ 一覧が取れなかったら、理由を経路へ写す (画面上端の報せになる)', async () => {
    setHub({
      listConfigured: async () => { throw new Error('IPC broke'); },
      fetchSnapshot: async () => ({ ok: true, data: { v: 2 } }) as FetchResult<unknown>,
    });
    const h = setup('github', { v: 1 });
    await h.mount();
    const f = currentDeviceStoreFailure();
    expect(f?.store).toBe('settings');
    expect(f?.op).toBe('read');
    expect(f?.where).toBe('credentials');
    expect(f?.message).toContain('「未設定」と出ていても、設定が消えたとは限りません');
    h.unmount();
  });

  it('対照: 橋がまだ無いだけなら報せない (起動直後に赤を出さない)', async () => {
    setHub(undefined);
    const h = setup('github', { v: 1 });
    await h.mount();
    expect(h.ref.current.isConfigured).toBe(false);
    expect(currentDeviceStoreFailure(), '橋の不在を「読めない」と報せている').toBeNull();
    h.unmount();
  });

  it('対照: 一覧が取れれば何も報せない', async () => {
    setHub({
      listConfigured: async () => ['github'],
      fetchSnapshot: async () => ({ ok: true, data: { v: 2 } }) as FetchResult<unknown>,
    });
    const h = setup('github', { v: 1 });
    await h.mount();
    expect(currentDeviceStoreFailure()).toBeNull();
    h.unmount();
  });

  /*
   * 受け皿が **false を書き戻す**ことの意味。初期状態も false なので
   * 「最初の一回」では観測差が出ない —— 差が出るのは、**設定済みの
   * サービスから、問い合わせが失敗するサービスへ切り替えたとき**である。
   * 書き戻さないと、前のサービスの「設定済み」バッジが次の画面に居座る。
   *
   * これを置くまで、受け皿の中身を空にする変異体 (BlockStatement → `{}`) が
   * 生き残っていた。上の「reject しても落ちない」だけでは足りない。
   */
  it('設定済み → 問い合わせ失敗のサービスへ切り替えると、設定済みが残らない', async () => {
    let fail = false;
    setHub({
      listConfigured: async () => {
        if (fail) throw new Error('IPC broke');
        return ['github'];
      },
      fetchSnapshot: async () => ({ ok: true, data: { v: 2 } }) as FetchResult<unknown>,
    });
    const h = setup('github', { v: 1 });
    await h.mount();
    expect(h.ref.current.isConfigured).toBe(true); // 前提: ここが true でないと対照にならない
    fail = true;
    await h.rerender('slack');
    expect(h.ref.current.isConfigured).toBe(false);
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

describe('useServiceData — sample サービス (取得先が無い画面)', () => {
  /**
   * 2026-08 監査で見つけた本体不具合の回帰テスト。
   *
   * 公式 API 未配線のサービスは stub が「空の成功」を返す。以前の実装は
   * それを `setData` + `source='live'` で受けたため、更新を押すと画面が
   * 空になり、しかも緑の「ライブ」バッジが付いた (士業 8 画面・不動産・
   * 投資信託・Docker・Obsidian ほか計 24 サービス)。
   */
  it('refresh しても取得を試みず、データもバッジも変わらない', async () => {
    let calls = 0;
    setHub({
      listConfigured: async () => [],
      fetchSnapshot: async () => {
        calls += 1;
        // stub が返していた「空の成功」を再現する。
        return { ok: true, data: { contacts: [], monthlyFee: 0 } } as FetchResult<unknown>;
      },
    });
    const h = setup('tax-accountant', { contacts: [{ name: '顧問税理士' }], monthlyFee: 33000 });
    await h.mount();
    await h.refresh();
    expect(calls).toBe(0); // IPC そのものを呼ばない
    expect(h.ref.current.data).toEqual({ contacts: [{ name: '顧問税理士' }], monthlyFee: 33000 });
    expect(h.ref.current.source).toBe('snapshot');
    expect(h.ref.current.status).toBe('idle');
    expect(h.ref.current.origin).toBe('sample');
    h.unmount();
  });

  it('トークンが保存済みでも自動取得しない (押さずに画面が空になる経路を塞ぐ)', async () => {
    let calls = 0;
    setHub({
      listConfigured: async () => ['dropbox'],
      fetchSnapshot: async () => {
        calls += 1;
        return { ok: true, data: { files: [] } } as FetchResult<unknown>;
      },
    });
    const h = setup('dropbox', { files: [{ name: '見積書.pdf' }] });
    await h.mount();
    expect(calls).toBe(0);
    expect(h.ref.current.isConfigured).toBe(true); // 資格情報の有無は今までどおり見える
    expect(h.ref.current.data).toEqual({ files: [{ name: '見積書.pdf' }] });
    expect(h.ref.current.source).toBe('snapshot');
    h.unmount();
  });

  it('ブラウザ版の not_implemented でエラー表示にならない', async () => {
    setHub(errHub('not_implemented', 'ブラウザ版では live fetch を行いません。'));
    const h = setup('lawyer', { contacts: [] });
    await h.mount();
    await h.refresh();
    expect(h.ref.current.status).toBe('idle'); // 取得先が無いだけで、異常ではない
    expect(h.ref.current.errorMessage).toBeUndefined();
    h.unmount();
  });

  it('remote / local は従来どおり取得する', async () => {
    setHub(okHub({ v: 7 }));
    const remote = setup('github', { v: 1 });
    await remote.mount();
    await remote.refresh();
    expect(remote.ref.current.origin).toBe('remote');
    expect(remote.ref.current.source).toBe('live');
    remote.unmount();

    const local = setup('kpi', { v: 1 });
    await local.mount();
    await local.refresh();
    expect(local.ref.current.origin).toBe('local');
    expect(local.ref.current.source).toBe('live');
    local.unmount();
  });
});

describe('useServiceData — IPC が reject した場合', () => {
  /**
   * 2026-08 監査の回帰。`fetch:snapshot` は失敗を戻り値で表す約束だが、
   * `safeStorage.decryptString` は壊れた値で throw し、その呼び出しが
   * try の外にあったため IPC ハンドラごと reject していた。renderer 側に
   * 受け皿が無く、status が 'loading' のまま「読込中…」で止まっていた。
   */
  it('reject でも loading のまま止まらず error になる', async () => {
    setHub({
      listConfigured: async () => [],
      fetchSnapshot: async () => {
        throw new Error('保存された資格情報を復号できません');
      },
    });
    const h = setup('github', { v: 1 });
    await h.mount();
    await h.refresh();
    expect(h.ref.current.status).toBe('error');
    expect(h.ref.current.errorMessage).toBe('保存された資格情報を復号できません');
    expect(h.ref.current.data).toEqual({ v: 1 }); // 表示中のデータは壊さない
    expect(h.ref.current.source).toBe('snapshot');
    h.unmount();
  });

  it('Error でない値を throw されても文字列化して出す', async () => {
    setHub({
      listConfigured: async () => [],
      fetchSnapshot: async () => {
        throw 'ipc channel closed';
      },
    });
    const h = setup('github', { v: 1 });
    await h.mount();
    await h.refresh();
    expect(h.ref.current.status).toBe('error');
    expect(h.ref.current.errorMessage).toBe('ipc channel closed');
    h.unmount();
  });

  it('reject の種別も classifyError で分類する (401 なら auth)', async () => {
    setHub({
      listConfigured: async () => [],
      fetchSnapshot: async () => {
        throw new Error('401 unauthorized');
      },
    });
    const h = setup('github', { v: 1 });
    await h.mount();
    await h.refresh();
    expect(h.ref.current.errorKind).toBe('auth');
    h.unmount();
  });
});

/*
 * `autoFetch` は「資格情報が無くてもマウント時に 1 度取りに行く」指定。
 * ローカルサービス (認証不要) の画面がこれを使う。
 *
 * 2026-08-20 の実測で、この判定の変異体 2 つが生き残っていた —
 * **`autoFetch: true` を渡したときに実際に取得が走ることを誰も見ていなかった**。
 * 判定が死ぬと、認証不要の画面が同梱スナップショットのまま更新されなくなる。
 */
function setupWithOptions<T>(serviceId: ServiceId, snapshot: T, options: { autoFetch?: boolean }) {
  const ref: { current: ServiceState<T> } = { current: null as unknown as ServiceState<T> };
  function Harness() {
    ref.current = useServiceData<T>(serviceId, snapshot, options);
    return null;
  }
  const container = document.createElement('div');
  let root!: Root;
  return {
    ref,
    async mount() {
      await act(async () => {
        root = createRoot(container);
        root.render(createElement(Harness));
      });
      await flush();
    },
    unmount() {
      act(() => root.unmount());
    },
  };
}

describe('useServiceData — autoFetch', () => {
  /** 呼び出し回数を数える hub。資格情報は常に「未登録」。 */
  function countingHub(data: unknown) {
    let calls = 0;
    const hub: Hub = {
      listConfigured: async () => [],
      fetchSnapshot: async () => {
        calls += 1;
        return { ok: true, data } as FetchResult<unknown>;
      },
    };
    return { hub, calls: () => calls };
  }

  it('autoFetch: true なら資格情報が無くてもマウント時に取りに行く', async () => {
    const { hub, calls } = countingHub({ v: 99 });
    setHub(hub);
    const h = setupWithOptions('github', { v: 1 }, { autoFetch: true });
    await h.mount();
    expect(calls()).toBe(1);
    expect(h.ref.current.data).toEqual({ v: 99 });
    expect(h.ref.current.source).toBe('live');
    h.unmount();
  });

  it('autoFetch を渡さなければ、資格情報が無いうちは取りに行かない', async () => {
    const { hub, calls } = countingHub({ v: 99 });
    setHub(hub);
    const h = setupWithOptions('github', { v: 1 }, {});
    await h.mount();
    expect(calls()).toBe(0);
    expect(h.ref.current.data).toEqual({ v: 1 });
    expect(h.ref.current.source).toBe('snapshot');
    h.unmount();
  });

  it('autoFetch: false は「渡さない」と同じ (真だけを特別扱いする)', async () => {
    const { hub, calls } = countingHub({ v: 99 });
    setHub(hub);
    const h = setupWithOptions('github', { v: 1 }, { autoFetch: false });
    await h.mount();
    expect(calls()).toBe(0);
    h.unmount();
  });
});

// --- 重なった取得 ---------------------------------------------------------
//
// 更新ボタンは `status === 'loading'` で無効になるが、**書き込みの操作は
// 無効にならない**。気分の記録・銘柄の登録・人材の保存・Team Radar の保存・
// Microsoft 365 は成功後に `refresh()` を呼ぶので (実測 5 画面 7 か所)、
// 「更新を押す (遅い) → 記録する (速い・成功後に再取得)」で取得が重なる。
// 世代の番人が無いと**後から返った古い応答が新しい内容を消し**、しかも
// `source='live'` / `status='idle'` のままなので、画面は取得できた顔で古い数字を出す。
describe('取得が重なったとき', () => {
  type Payload = { readonly label: string };

  /** 応答を手で解決できる hub。`resolvers[i]` が i 回目の取得。 */
  function deferredHub(): { hub: Hub; resolvers: ((r: FetchResult<Payload>) => void)[] } {
    const resolvers: ((r: FetchResult<Payload>) => void)[] = [];
    return {
      resolvers,
      hub: {
        listConfigured: async () => [],
        fetchSnapshot: () =>
          new Promise<FetchResult<unknown>>((resolve) => {
            resolvers.push(resolve as (r: FetchResult<Payload>) => void);
          }),
      },
    };
  }

  it('★ 遅れて返った古い応答は、新しい応答の内容を上書きしない', async () => {
    const { hub, resolvers } = deferredHub();
    setHub(hub);
    const h = setup<Payload>('emotions', { label: '同梱' });
    await h.mount();

    void h.ref.current.refresh(); // 1 回目 (遅い)
    void h.ref.current.refresh(); // 2 回目 (速い)
    await flush(2);
    expect(resolvers).toHaveLength(2);

    resolvers[1]!({ ok: true, data: { label: '新しい' } });
    await flush();
    expect(h.ref.current.data).toEqual({ label: '新しい' });

    resolvers[0]!({ ok: true, data: { label: '古い' } });
    await flush();
    expect(h.ref.current.data, '古い応答が後から画面を戻してはいけない').toEqual({ label: '新しい' });
    expect(h.ref.current.status).toBe('idle');
    h.unmount();
  });

  it('★ 遅れて返った古い失敗は、成功した新しい取得を赤くしない', async () => {
    const { hub, resolvers } = deferredHub();
    setHub(hub);
    const h = setup<Payload>('emotions', { label: '同梱' });
    await h.mount();

    void h.ref.current.refresh(); // 1 回目 (遅い・失敗する)
    void h.ref.current.refresh(); // 2 回目 (速い・成功する)
    await flush(2);

    resolvers[1]!({ ok: true, data: { label: '新しい' } });
    await flush();
    resolvers[0]!({ ok: false, code: 'fetch_failed', message: '繋がりません' });
    await flush();

    expect(h.ref.current.status, '成功の上に古い失敗を載せない').toBe('idle');
    expect(h.ref.current.errorMessage).toBeUndefined();
    expect(h.ref.current.data).toEqual({ label: '新しい' });
    h.unmount();
  });

  it('★ 遅れて投げた古い取得も、成功した新しい取得を赤くしない (橋が throw した場合)', async () => {
    // 橋が **reject** する道 (約束の外で throw する main を踏んだ実例がある) にも
    // 同じ番人が要る。ここを通さないと、成功の上に古い例外の赤が乗る。
    const rejecters: ((e: Error) => void)[] = [];
    setHub({
      listConfigured: async () => [],
      fetchSnapshot: () =>
        new Promise<FetchResult<unknown>>((resolve, reject) => {
          rejecters.push(reject);
          // 2 回目はすぐ成功させる (1 回目だけを後で投げる)。
          if (rejecters.length === 2) resolve({ ok: true, data: { label: '新しい' } });
        }),
    });
    const h = setup<Payload>('emotions', { label: '同梱' });
    await h.mount();

    void h.ref.current.refresh(); // 1 回目 (後で投げる)
    void h.ref.current.refresh(); // 2 回目 (すぐ成功)
    await flush();
    expect(h.ref.current.data).toEqual({ label: '新しい' });

    rejecters[0]!(new Error('fetch failed'));
    await flush();
    expect(h.ref.current.status, '成功の上に古い例外を載せない').toBe('idle');
    expect(h.ref.current.errorMessage).toBeUndefined();
    h.unmount();
  });

  it('対照: 重なっていなければ 1 回目の応答はそのまま反映される', async () => {
    const { hub, resolvers } = deferredHub();
    setHub(hub);
    const h = setup<Payload>('emotions', { label: '同梱' });
    await h.mount();

    void h.ref.current.refresh();
    await flush(2);
    resolvers[0]!({ ok: true, data: { label: '1 回目' } });
    await flush();
    expect(h.ref.current.data).toEqual({ label: '1 回目' });
    expect(h.ref.current.source).toBe('live');
    h.unmount();
  });
});

// --- 中身の「同梱データです」の名乗り -------------------------------------
//
// `payloadIsMock` は `main/clients` が立てる **真偽値の `isMock` だけ**を名乗りと
// 認める (文字列の 'true' も、欄が無い物も、物でない中身も名乗りではない)。
// StatusBar がこの値で「同梱データ」の札を出すので、緩めると緑の「ローカル」に戻る。
describe('payloadIsMock — 名乗りの読み方', () => {
  async function fetched(data: unknown): Promise<boolean> {
    setHub({ listConfigured: async () => [], fetchSnapshot: async () => ({ ok: true, data }) });
    const h = setup<unknown>('emotions', { label: '同梱' });
    await h.mount();
    await h.refresh();
    const flag = h.ref.current.payloadIsMock;
    h.unmount();
    return flag;
  }

  it('取得前は名乗っていない (同梱を見ている段では false)', async () => {
    setHub({ listConfigured: async () => [], fetchSnapshot: async () => ({ ok: true, data: { isMock: true } }) });
    const h = setup<unknown>('emotions', { label: '同梱' });
    await h.mount();
    expect(h.ref.current.payloadIsMock, 'まだ取得していない段で名乗ってはいけない').toBe(false);
    h.unmount();
  });

  it('★ isMock が真偽値の true のときだけ名乗りと認める', async () => {
    expect(await fetched({ isMock: true })).toBe(true);
    expect(await fetched({ isMock: 'true' })).toBe(false);
    expect(await fetched({ isMock: 1 })).toBe(false);
    expect(await fetched({ isMock: false })).toBe(false);
  });

  it('欄が無い / 物でない中身は名乗りではない', async () => {
    expect(await fetched({})).toBe(false);
    expect(await fetched({ items: [] })).toBe(false);
    expect(await fetched(null)).toBe(false);
    expect(await fetched(42)).toBe(false);
    expect(await fetched('isMock')).toBe(false);
  });
});
