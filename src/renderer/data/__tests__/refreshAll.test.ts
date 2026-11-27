/**
 * **連携をまとめて取り直す** (2026-11-27 · `data/refreshAll.ts`)。
 *
 * 利用者の依頼「全ての事業の全てのデータを、連携ボタンをタップすると全て連携される様にして」。
 * ここでは取り直す仕組みを、橋の代役で直接押す: 選ぶ相手 (鍵を登録済みの外の連携先だけ)・
 * 結果の分け方・取れた内容の行き先 (覚える・画面へ知らせる)・同時に取る件数の天井。
 */
import { afterEach, describe, expect, it } from 'vitest';
import type { FetchResult, ServiceId } from '../../../preload/bridgeTypes';
import { SERVICE_IDS } from '../../../shared/serviceId';
import { originOf } from '../../../shared/dataOrigin';
import { REFRESH_ALL_CONCURRENCY, refreshAllConnected, remoteServiceIds, type RefreshAllHub } from '../refreshAll';
import { forgetAllFetches, lastGoodFetch } from '../lastGoodFetch';
import { publishFetched, subscribeFetched } from '../fetchBroadcast';

afterEach(() => {
  forgetAllFetches();
});

/** 橋の代役。`answer` が無い id は空の内容で取れたことにする。 */
function hub(
  configured: ServiceId[],
  answer: Partial<Record<ServiceId, FetchResult | Error>> = {},
  log: ServiceId[] = [],
): RefreshAllHub {
  return {
    listConfigured: () => Promise.resolve(configured),
    fetchSnapshot: <T,>(id: ServiceId) => {
      log.push(id);
      const a = answer[id];
      if (a instanceof Error) return Promise.reject(a);
      return Promise.resolve((a ?? { ok: true, data: { from: id } }) as FetchResult<T>);
    },
  };
}

describe('連携をまとめて取り直す', () => {
  it('★ 選ぶのは外から取る連携先だけ (見本と端末の記録は取らない)', () => {
    const remote = remoteServiceIds();
    expect(remote.length).toBeGreaterThanOrEqual(10);
    expect(remote.every((id) => originOf(id) === 'remote')).toBe(true);
    // 外から取る連携先は全部入っている (両方向)
    expect(SERVICE_IDS.filter((id) => originOf(id) === 'remote')).toEqual(remote);
    expect(remote).toContain('freee');
    expect(remote).not.toContain('sales'); // 端末の記録
    expect(remote).not.toContain('uber-eats'); // 見本
  });

  it('★ 鍵を登録済みの連携先だけを取り、鍵がまだの物は名前だけ返す', async () => {
    const log: ServiceId[] = [];
    const r = await refreshAllConnected(hub(['freee', 'github', 'sales', 'uber-eats'], {}, log));
    expect(r.rows.map((x) => x.id)).toEqual(['github', 'freee'].sort((a, b) => SERVICE_IDS.indexOf(a as ServiceId) - SERVICE_IDS.indexOf(b as ServiceId)));
    expect([...log].sort()).toEqual(['freee', 'github']);
    expect(r.notConfigured).not.toContain('freee');
    expect(r.notConfigured).toContain('stripe');
    expect(r.notConfigured.length + r.rows.length).toBe(remoteServiceIds().length);
  });

  it('★ 取れた内容は覚え、開いている画面へ知らせる', async () => {
    const seen: unknown[] = [];
    const off = subscribeFetched('freee', (d) => seen.push(d));
    const r = await refreshAllConnected(hub(['freee'], { freee: { ok: true, data: { monthly: [1] } } }));
    off();
    expect(r.rows).toEqual([{ id: 'freee', outcome: 'ok' }]);
    expect(seen).toEqual([{ monthly: [1] }]);
    expect(lastGoodFetch('freee')?.data).toEqual({ monthly: [1] });
  });

  it('★ 取れなかった物は橋の文を持ち、覚えない・知らせない', async () => {
    const seen: unknown[] = [];
    const off = subscribeFetched('github', (d) => seen.push(d));
    const r = await refreshAllConnected(
      hub(['github', 'stripe', 'freee'], {
        github: { ok: false, code: 'fetch_failed', message: '401 Unauthorized' },
        stripe: { ok: false, code: 'not_implemented', message: 'この版では取りません' },
        freee: new Error('network down'),
      }),
    );
    off();
    const byId = Object.fromEntries(r.rows.map((x) => [x.id, x]));
    expect(byId.github).toEqual({ id: 'github', outcome: 'failed', message: '401 Unauthorized' });
    expect(byId.stripe).toEqual({ id: 'stripe', outcome: 'unsupported', message: 'この版では取りません' });
    expect(byId.freee).toEqual({ id: 'freee', outcome: 'failed', message: 'network down' });
    expect(seen).toEqual([]);
    expect(lastGoodFetch('github')).toBeNull();
  });

  it('文字列で投げられても取れなかったとして返す', async () => {
    const h = hub(['github']);
    h.fetchSnapshot = () => Promise.reject('boom' as unknown as Error);
    const r = await refreshAllConnected(h);
    expect(r.rows).toEqual([{ id: 'github', outcome: 'failed', message: 'boom' }]);
  });

  it('★ 鍵の一覧が読めなければ投げる (「0 件つないである」と混ぜない)', async () => {
    const h = hub([]);
    h.listConfigured = () => Promise.reject(new Error('store unreadable'));
    await expect(refreshAllConnected(h)).rejects.toThrow('store unreadable');
  });

  it('鍵がどれも無ければ何も取らない', async () => {
    const log: ServiceId[] = [];
    const r = await refreshAllConnected(hub([], {}, log));
    expect(r.rows).toEqual([]);
    expect(log).toEqual([]);
    expect(r.notConfigured).toEqual(remoteServiceIds());
  });

  it('★ 同時に取るのは天井の件数まで・結果の並びは取れた順ではなく一覧の順', async () => {
    const all = remoteServiceIds();
    let inFlight = 0;
    let peak = 0;
    const releases: (() => void)[] = [];
    const h: RefreshAllHub = {
      listConfigured: () => Promise.resolve(all),
      fetchSnapshot: <T,>(id: ServiceId) => {
        inFlight += 1;
        peak = Math.max(peak, inFlight);
        return new Promise<FetchResult<T>>((resolve) => {
          releases.push(() => {
            inFlight -= 1;
            resolve({ ok: true, data: { id } as T });
          });
        });
      },
    };
    let finished = false;
    const done = refreshAllConnected(h, 3).finally(() => {
      finished = true;
    });
    // 待っている物を後ろから解いていく (取れた順を一覧の順と逆にする)
    while (!finished) {
      await new Promise((r) => setTimeout(r, 0));
      releases.splice(0).reverse().forEach((f) => f());
    }
    const r = await done;
    expect(peak).toBe(3);
    expect(r.rows.map((x) => x.id)).toEqual(all);
    expect(REFRESH_ALL_CONCURRENCY).toBe(4);
  });

  it('天井が 0 以下でも 1 件ずつは取る', async () => {
    const r = await refreshAllConnected(hub(['github', 'freee']), 0);
    expect(r.rows).toHaveLength(2);
  });

  it('知らせの解除のあとは受け取らない・別の連携先の知らせは受け取らない', () => {
    const seen: unknown[] = [];
    const off = subscribeFetched('github', (d) => seen.push(d));
    publishFetched('freee', 1);
    publishFetched('github', 2);
    off();
    publishFetched('github', 3);
    expect(seen).toEqual([2]);
  });
});
