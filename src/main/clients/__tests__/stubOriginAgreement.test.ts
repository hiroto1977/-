/**
 * **`dataOrigin` の宣言と、fetcher が実際にすることの一致を留める外側の証人。**
 *
 * ## 守っている害 (2026-08 監査で実際に起きていた)
 *
 * 公式 API 未配線のサービスは `LIVE_FETCHERS` の不変条件を満たすためだけの
 * **定数 stub** を返す。以前の `useServiceData` はそれを
 * `setData` + `source='live'` で受けたため、**更新を押すと画面が空になり、
 * しかも緑の「ライブ」バッジが付いた** (士業 8 画面・不動産・投資信託・
 * Docker・Obsidian ほか計 24 サービス)。
 *
 * 塞いだのは `useServiceData` の 1 行:
 *
 * ```ts
 * if (!isRefreshable(originOf(serviceId))) return;   // origin === 'sample' は呼ばない
 * ```
 *
 * ## なぜこの検査が要るか
 *
 * その 1 行の保護は、**手で保つ 2 つの表の一致**に乗っている:
 *
 * 1. `shared/dataOrigin.ts` の `SERVICE_DATA_ORIGIN` がその id を `'sample'` と宣言する
 * 2. `main/clients/<id>.ts` がその id に対して定数 stub を返す
 *
 * **どちらも人が書き、何もその一致を検査していなかった。**
 * `storage` は概念的には「この PC を見るサービス」なので `'local'` と書き直すのは
 * ごく自然な変更で、そうすると `storage.ts` の**全欄 0 の STUB** が画面へ流れ、
 * メモリ使用率 **0% が緑 (`0 < MEMORY_WARN_PCT`)** で、起動時間 **0 秒も緑**で出る ——
 * 測っていない値が「良好」として出る (パス 63 と同じ形)。
 *
 * 既存の回帰テスト (`hooks/__tests__/useServiceData.test.ts`) は仕組みを
 * **`tax-accountant` 1 件**でしか確かめていない —— **普遍の主張を 1 つの標本で
 * 検査する形** (パス 13)。ここは 75 サービス全部を見る。
 *
 * ## どう分類するか (表を読まず、振る舞いで見る)
 *
 * 一覧を写すと写しがずれる (パス 62)。代わりに**実際に呼んで**分類する:
 *
 * - `ctx.fetch` は**必ず投げる**ので、この検査は I/O を行えない (安全)
 * - 違う ctx で 2 回呼び、**同じ object が返れば** モジュール定数 = inert stub
 * - 毎回新しい値を組むなら local (`node:os` 等を読む)
 * - `fetch` を呼んだものは投げるので remote と分かる
 *
 * ## 双方向で留める
 *
 * - inert なら `origin === 'sample'` (でなければ空データが画面へ流れる)
 * - `origin === 'sample'` なら inert (でなければ**配線済みの取得が永久に呼ばれない**)
 */
import { describe, expect, it, vi } from 'vitest';

vi.mock('electron', () => ({
  app: { getPath: () => '/tmp/stub-origin-agreement', getVersion: () => '1.0.0', isPackaged: false },
  shell: { openExternal: async () => {} },
  safeStorage: {
    isEncryptionAvailable: () => false,
    encryptString: (v: string) => Buffer.from(v, 'utf8'),
    decryptString: (b: Buffer) => b.toString('utf8'),
  },
}));

import { LIVE_FETCHERS } from '../index';
import { SERVICE_IDS } from '../../../shared/serviceId';
import { isRefreshable, originOf } from '../../../shared/dataOrigin';

/** I/O を**行えない** ctx。`fetch` を呼んだ fetcher は必ず投げる。 */
const ctx = (tag: string) =>
  ({
    token: `token-${tag}`,
    fetch: (() => {
      throw new Error('this test never performs network I/O');
    }) as unknown as typeof fetch,
  }) as never;

type Kind = 'inert' | 'fresh' | 'network';

/**
 * fetcher を 2 回呼んで分類する。
 * `inert` = 2 回とも**同じ object** (モジュール定数を返している)。
 */
async function classify(f: (c: never) => Promise<unknown>): Promise<Kind> {
  try {
    const a = await f(ctx('a'));
    const b = await f(ctx('b'));
    return a === b ? 'inert' : 'fresh';
  } catch {
    return 'network';
  }
}

/** 全サービスの分類 (1 度だけ実行して共有する)。 */
const classified = (async () => {
  const out = new Map<string, Kind>();
  for (const id of SERVICE_IDS) out.set(id, await classify(LIVE_FETCHERS[id] as (c: never) => Promise<unknown>));
  return out;
})();

describe('dataOrigin ⇄ fetcher の一致 (外側の証人)', () => {
  it('★ 標本: 分類器が inert と fresh を実際に見分ける (空の検査でない証拠)', async () => {
    const CONST = { v: 1 };
    expect(await classify(async () => CONST)).toBe('inert');
    expect(await classify(async () => ({ v: 1 }))).toBe('fresh'); // 中身は同じでも別 object
    expect(
      await classify(async (c) => {
        await (c as unknown as { fetch: typeof fetch }).fetch('https://example.invalid');
        return {};
      }),
    ).toBe('network');
  });

  it('★ 定数 stub を返す fetcher の id は必ず origin=sample (空データが画面へ流れない)', async () => {
    const map = await classified;
    const leaking = SERVICE_IDS.filter((id) => map.get(id) === 'inert' && originOf(id) !== 'sample');
    // 直す前はこの一致を誰も検査していなかった。`storage` を 'local' に書き替えると
    // 全欄 0 の STUB が画面へ流れ、メモリ使用率 0% が緑で出る。
    expect(leaking).toEqual([]);
  });

  it('★ 逆向き: origin=sample の id の fetcher は必ず定数 stub (配線した取得を殺さない)', async () => {
    const map = await classified;
    const wired = SERVICE_IDS.filter((id) => originOf(id) === 'sample' && map.get(id) !== 'inert');
    // ここが空でないなら、実物の取得を書いたのに `isRefreshable` が永久に false —
    // 「配線したのに更新できない」形になる。
    expect(wired).toEqual([]);
  });

  it('★ 床: 3 つのバケツがどれも空でない (harness が死んだら鳴る)', async () => {
    const map = await classified;
    const n = (k: Kind) => SERVICE_IDS.filter((id) => map.get(id) === k).length;
    // 2026-09-08 実測: inert 42 / fresh 18 / network 15 (計 75)。
    // electron の mock 変更などで**全部が network に倒れる**と上の 2 本は
    // 空配列を比べるだけの空の検査になるので、各バケツに床を置く。
    expect(n('inert')).toBeGreaterThanOrEqual(30);
    expect(n('fresh')).toBeGreaterThanOrEqual(10);
    expect(n('network')).toBeGreaterThanOrEqual(10);
    expect(n('inert') + n('fresh') + n('network')).toBe(SERVICE_IDS.length);
  });

  it('★ isRefreshable が inert な id を 1 つも通さない (関門と分類が同じ側を向く)', async () => {
    const map = await classified;
    for (const id of SERVICE_IDS) {
      if (map.get(id) === 'inert') expect(isRefreshable(originOf(id))).toBe(false);
    }
    // 対照: inert でない id は通る (関門が全部を止めているのではない)。
    const fresh = SERVICE_IDS.find((id) => map.get(id) === 'fresh');
    expect(fresh).toBeDefined();
    expect(isRefreshable(originOf(fresh!))).toBe(true);
  });
});
