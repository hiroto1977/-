/** @vitest-environment jsdom */
/**
 * 数値パラメータの上書きの保存 — 実物の record store (fake-indexeddb) を通す。
 *
 * 守る性質: 上書きは **1 レコードを書き換える** (積み上げない)・読むのは最新 1 件・
 * 壊れた保存は捨てる・通らない値は書かない。
 */
import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import {
  MAX_WRITE_ATTEMPTS,
  PARAMETER_BUSY_MESSAGE,
  PARAMETER_OVERRIDES_COLLECTION,
  ParameterBusyError,
  overridesFromRecords,
  useParameters,
  type ParameterOverrideRecord,
  type UseParameters,
} from '../parameterOverrides';
import { _resetRecordStoreForTests, getRecordStore, latestTokenOf, type LatestToken, type StoredRecord } from '../store';
import {
  _resetDeviceStoreFailureForTests,
  subscribeDeviceStoreFailure,
  type DeviceStoreFailure,
} from '../deviceStoreFailure';
import { _resetCollectionSubscribersForTests } from '../useCollection';
import { DEFAULT_PARAMETER_VALUES, PARAMETERS } from '../../../shared/parameters';
import { settleUntil } from '../../__tests__/jsdomWait';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const rec = (createdAt: number, data: unknown) => ({ createdAt, data });

describe('overridesFromRecords (保存レコード → 上書き)', () => {
  it('無ければ空', () => {
    expect(overridesFromRecords([])).toEqual({});
  });

  it('最新 (createdAt 最大) の 1 件を読む — 並び順に依らない', () => {
    const older = rec(1, { values: { 'hydroponics.daysPerYear': 300 } });
    const newer = rec(5, { values: { 'hydroponics.daysPerYear': 200 } });
    expect(overridesFromRecords([older, newer])).toEqual({ 'hydroponics.daysPerYear': 200 });
    expect(overridesFromRecords([newer, older])).toEqual({ 'hydroponics.daysPerYear': 200 });
  });

  it('壊れた保存は捨てる (values が無い・物でない・通らない値)', () => {
    expect(overridesFromRecords([rec(1, {})])).toEqual({});
    expect(overridesFromRecords([rec(1, null)])).toEqual({});
    expect(overridesFromRecords([rec(1, { values: 'x' })])).toEqual({});
    expect(overridesFromRecords([rec(1, { values: { 'hydroponics.daysPerYear': 0 } })])).toEqual({});
    // 混ざっていれば通る分だけ残る。
    expect(
      overridesFromRecords([
        rec(1, { values: { 'hydroponics.daysPerYear': 300, bogus: 1, 'tax.consumptionStandardRate': 9 } }),
      ]),
    ).toEqual({ 'hydroponics.daysPerYear': 300 });
  });
});

describe('useParameters (hook)', () => {
  let container: HTMLDivElement;
  let root: Root | null = null;
  const ref: { current: UseParameters } = { current: null as unknown as UseParameters };

  function Harness() {
    ref.current = useParameters();
    return null;
  }

  /**
   * 読み込みが終わるまで**条件で**待って描く (2026-09-21 · パス 381)。
   *
   * ここは 2026-09-21 まで固定 8 周の `settle()` だった —— 周回数を 0 にすると
   * `loading` が true のままで 2 件落ちる (`npm run audit:tick-sensitivity` の実測)。
   * **画面ではなく hook の戻りを見る**ので `waitForText` ではなく `settleUntil`。
   */
  async function mount(): Promise<void> {
    root = createRoot(container);
    await act(async () => {
      root!.render(createElement(Harness));
    });
    await settleUntil(() => ref.current?.loading === false, '上書きの読み込みが終わる');
  }

  /**
   * 上書きが `n` 件になるまで待つ。
   *
   * `set` / `reset` は `await` 済みなので保管層はもう書けている —— 待つのは
   * 購読者から hook へ届く描き直しだけで、**増減の向きが決まっている**ので条件で待てる。
   */
  async function waitForOverrides(n: number): Promise<void> {
    await settleUntil(() => Object.keys(ref.current.overrides).length === n, `上書きが ${n} 件になる`);
  }

  async function stored(): Promise<readonly ParameterOverrideRecord[]> {
    const list = await getRecordStore().list<ParameterOverrideRecord>(PARAMETER_OVERRIDES_COLLECTION);
    return list.map((r) => r.data);
  }

  beforeEach(async () => {
    _resetRecordStoreForTests();
    _resetCollectionSubscribersForTests();
    await new Promise<void>((resolve) => {
      const req = indexedDB.deleteDatabase('business-hub-data');
      req.onsuccess = () => resolve();
      req.onerror = () => resolve();
      req.onblocked = () => resolve();
    });
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    if (root) {
      await act(async () => {
        root!.unmount();
      });
      root = null;
    }
    document.body.removeChild(container);
  });

  it('コレクション名は固定 (変わると保存済みの上書きが読めなくなる)', () => {
    expect(PARAMETER_OVERRIDES_COLLECTION).toBe('parameter-overrides');
  });

  it('何も無ければ既定の値・上書き無し・loading が落ちる', async () => {
    await mount();
    expect(ref.current.loading).toBe(false);
    expect(ref.current.values).toEqual(DEFAULT_PARAMETER_VALUES);
    expect(ref.current.overrides).toEqual({});
    expect(await stored()).toEqual([]);
  });

  it('set は 1 レコードに書き、2 つ目の set は同じレコードを書き換える (積み上げない)', async () => {
    await mount();
    await act(async () => {
      await ref.current.set('hydroponics.daysPerYear', 300);
    });
    await waitForOverrides(1);
    expect(ref.current.values['hydroponics.daysPerYear']).toBe(300);
    expect(ref.current.overrides).toEqual({ 'hydroponics.daysPerYear': 300 });
    expect(await stored()).toEqual([{ values: { 'hydroponics.daysPerYear': 300 } }]);

    await act(async () => {
      await ref.current.set('payroll.commutePublicTransportCap', 200_000);
    });
    await waitForOverrides(2);
    expect(await stored()).toEqual([
      { values: { 'hydroponics.daysPerYear': 300, 'payroll.commutePublicTransportCap': 200_000 } },
    ]);
    expect(ref.current.values['payroll.commutePublicTransportCap']).toBe(200_000);
    // 触っていない id は既定のまま。
    expect(ref.current.values['tax.consumptionStandardRate']).toBe(DEFAULT_PARAMETER_VALUES['tax.consumptionStandardRate']);
  });

  it('reset は その id だけ消し、resetAll は全部消す (どちらも同じ 1 レコード)', async () => {
    await mount();
    await act(async () => {
      await ref.current.set('hydroponics.daysPerYear', 300);
      await ref.current.set('payroll.commutePublicTransportCap', 200_000);
    });
    await waitForOverrides(2);
    await act(async () => {
      await ref.current.reset('hydroponics.daysPerYear');
    });
    await waitForOverrides(1);
    expect(ref.current.overrides).toEqual({ 'payroll.commutePublicTransportCap': 200_000 });
    expect(ref.current.values['hydroponics.daysPerYear']).toBe(DEFAULT_PARAMETER_VALUES['hydroponics.daysPerYear']);
    expect(await stored()).toEqual([{ values: { 'payroll.commutePublicTransportCap': 200_000 } }]);

    await act(async () => {
      await ref.current.resetAll();
    });
    await waitForOverrides(0);
    expect(ref.current.overrides).toEqual({});
    expect(ref.current.values).toEqual(DEFAULT_PARAMETER_VALUES);
    expect(await stored()).toEqual([{ values: {} }]);
  });

  it('通らない値は書かない (書けても読む側が捨てて、記録と画面が食い違う)', async () => {
    await mount();
    await expect(ref.current.set('hydroponics.daysPerYear', 0)).rejects.toThrow('1日 以上');
    await expect(ref.current.set('hydroponics.daysPerYear', Number.NaN)).rejects.toThrow('数値');
    expect(await stored()).toEqual([]);
    expect(ref.current.overrides).toEqual({});
    // 境界の値は通る。
    await act(async () => {
      await ref.current.set('hydroponics.daysPerYear', 1);
    });
    await waitForOverrides(1);
    expect(ref.current.values['hydroponics.daysPerYear']).toBe(1);
  });

  it('既に保存があれば最新の 1 件を読み、壊れた行は無視する', async () => {
    const store = getRecordStore();
    await store.insert(PARAMETER_OVERRIDES_COLLECTION, { values: { 'hydroponics.daysPerYear': 250 } });
    // 後から入った壊れた行 (values 無し) は最新だが、読むと空 — 既定に戻る。
    await mount();
    // 最新は壊れた行ではなくこの 1 件のみなので 250。
    expect(ref.current.values['hydroponics.daysPerYear']).toBe(250);
    // set は最新の 1 件を書き換える (新しい行を足さない)。
    await act(async () => {
      await ref.current.set('hydroponics.daysPerYear', 260);
    });
    // 件数は 1 のままなので、待つのは**値の入れ替わり**のほう。
    await settleUntil(() => ref.current.values['hydroponics.daysPerYear'] === 260, '上書きが 260 に入れ替わる');
    expect(await stored()).toEqual([{ values: { 'hydroponics.daysPerYear': 260 } }]);
  });

  it('同時に 2 つ保存しても、1 レコードに両方残る (後の保存が先の保存を消さない)', async () => {
    await mount();
    await act(async () => {
      await Promise.all([
        ref.current.set('hydroponics.daysPerYear', 300),
        ref.current.set('payroll.commutePublicTransportCap', 200_000),
      ]);
    });
    await waitForOverrides(2);
    expect(await stored()).toEqual([
      { values: { 'hydroponics.daysPerYear': 300, 'payroll.commutePublicTransportCap': 200_000 } },
    ]);
    expect(ref.current.overrides).toEqual({
      'hydroponics.daysPerYear': 300,
      'payroll.commutePublicTransportCap': 200_000,
    });
  });

  /**
   * **読んでから書くまでの間に、相手の行が入れ替わる** (2026-09-27 · パス 498)。別のタブのバックアップの
   * 置換復元がちょうど間に入った形 —— 読んだ行は消え、控えの行が新しく入る。直す前は `edit` の `null` を
   * 捨てており、**利用者が保存した値は保管層のどこにも入らなかった** (復元した行はそのまま・画面は保存済みの形)。
   *
   * パス 500 から書き込みは「最新がまだ読んだ行のその版なら置き換える」(`replaceLatestIfUnchanged`) ——
   * 窓は**その比較の中**に作る (比べる前に相手を消す)。
   */
  it('★ 書く直前に相手の行が入れ替わっても、読み直した行に重ねる (復元した他の値も残る)', async () => {
    const store = getRecordStore();
    await store.insert(PARAMETER_OVERRIDES_COLLECTION, { values: { 'hydroponics.daysPerYear': 250 } });
    await mount();
    const original = store.replaceLatestIfUnchanged.bind(store);
    let fired = false;
    const conditional = vi.spyOn(store, 'replaceLatestIfUnchanged').mockImplementation((async (
      collection: string,
      expected: LatestToken,
      data: Record<string, unknown>,
    ) => {
      if (!fired) {
        fired = true;
        await store.remove(expected.id);
        await store.insert(PARAMETER_OVERRIDES_COLLECTION, { values: { 'payroll.commutePublicTransportCap': 150_000 } });
      }
      return original(collection, expected, data);
    }) as typeof store.replaceLatestIfUnchanged);
    await act(async () => {
      await ref.current.set('hydroponics.daysPerYear', 300);
    });
    expect(await stored()).toEqual([
      { values: { 'payroll.commutePublicTransportCap': 150_000, 'hydroponics.daysPerYear': 300 } },
    ]);
    // 1 度目は消えた行に当たり、2 度目は入れ替わった行を書き換えた。新しい行は足していない。
    expect(conditional).toHaveBeenCalledTimes(2);
    await settleUntil(() => ref.current.values['hydroponics.daysPerYear'] === 300, '画面の有効値が 300 になる');
  });

  it('★ 書く直前に相手の行が消え、入れ替わりも無ければ、新しい行として書く', async () => {
    const store = getRecordStore();
    await store.insert(PARAMETER_OVERRIDES_COLLECTION, { values: { 'hydroponics.daysPerYear': 250 } });
    await mount();
    const original = store.replaceLatestIfUnchanged.bind(store);
    let fired = false;
    vi.spyOn(store, 'replaceLatestIfUnchanged').mockImplementation((async (
      collection: string,
      expected: LatestToken,
      data: Record<string, unknown>,
    ) => {
      if (!fired) {
        fired = true;
        await store.remove(expected.id);
      }
      return original(collection, expected, data);
    }) as typeof store.replaceLatestIfUnchanged);
    await act(async () => {
      await ref.current.set('payroll.commutePublicTransportCap', 200_000);
    });
    // 消えた行の値 (250) は作り直さない —— 重ねる相手が無いので、今保存した値だけの新しい行になる。
    expect(await stored()).toEqual([{ values: { 'payroll.commutePublicTransportCap': 200_000 } }]);
  });

  it('★ 書くたびに相手が消え続けても回り続けず、上限の回数で新しい行として書く', async () => {
    const store = getRecordStore();
    await store.insert(PARAMETER_OVERRIDES_COLLECTION, { values: { 'hydroponics.daysPerYear': 250 } });
    await mount();
    // 何も書かずに「最新はもう読んだ行ではない (何も無い)」と答え続ける (消え続ける相手の最悪の形)。
    const conditional = vi.spyOn(store, 'replaceLatestIfUnchanged').mockResolvedValue({ status: 'changed', current: null });
    await act(async () => {
      await ref.current.set('hydroponics.daysPerYear', 300);
    });
    expect(conditional).toHaveBeenCalledTimes(MAX_WRITE_ATTEMPTS);
    const rows = await stored();
    expect(rows).toHaveLength(2);
    // 今保存した値は新しい行に入る (最新 1 件を読むので、これが効く)。元の行は書き換わっていない。
    expect(rows).toContainEqual({ values: { 'hydroponics.daysPerYear': 300 } });
    expect(rows).toContainEqual({ values: { 'hydroponics.daysPerYear': 250 } });
    await settleUntil(() => ref.current.values['hydroponics.daysPerYear'] === 300, '新しい行が最新として効く');
  });

  /**
   * **読み直しの後・書く前に、別の画面が同じ行へ別の数値パラメータを保存する** (2026-09-28 · パス 500)。
   *
   * 直す前は素の `edit` で「読んだ時の値 + 今の 1 つ」を丸ごと書いたので、挟まった保存 (通勤手当の上限) は
   * **黙って消えた** (lost update)。今は比べて、書き換えられていれば読み直して重ね直す —— 両方残る。
   */
  it('★ 読み直しの後・書く前に別の画面が同じ行を書き換えても、その保存を消さない (両方残る)', async () => {
    const store = getRecordStore();
    const row = await store.insert(PARAMETER_OVERRIDES_COLLECTION, { values: { 'hydroponics.daysPerYear': 250 } });
    await mount();
    const original = store.replaceLatestIfUnchanged.bind(store);
    let fired = false;
    const conditional = vi.spyOn(store, 'replaceLatestIfUnchanged').mockImplementation((async (
      collection: string,
      expected: LatestToken,
      data: Record<string, unknown>,
    ) => {
      if (!fired) {
        fired = true;
        // 別の画面の保存 —— 同じ行へ、別の数値パラメータを足した。
        await store.update(row.id, {
          values: { 'hydroponics.daysPerYear': 250, 'payroll.commutePublicTransportCap': 150_000 },
        });
      }
      return original(collection, expected, data);
    }) as typeof store.replaceLatestIfUnchanged);
    await act(async () => {
      await ref.current.set('hydroponics.daysPerYear', 300);
    });
    expect(await stored()).toEqual([
      { values: { 'hydroponics.daysPerYear': 300, 'payroll.commutePublicTransportCap': 150_000 } },
    ]);
    // 1 度目は書き換えられていて断られ、2 度目は読み直した行に重ねた。
    expect(conditional).toHaveBeenCalledTimes(2);
  });

  /**
   * **読んだ後・書く前に、別の行が新しい最新として入る** (2026-09-28 · パス 500)。別のタブの保存が重なり続けた
   * ときの最後の手 (`insertIfLatest`) と、控えの復元がこの形を作る。
   *
   * パス 500 の最初の直しは「読んだ行が読んだ時の中身のままなら書く」(`updateIfUnchanged`) で、比べていたのは
   * **その行**だった —— 新しい行が入っても古い行は変わっていないので書き換えは成功し、`set` は断りなく済み、
   * **採用される最新 (新しい行) には値が入らなかった** (実測: 300 は古い行にだけ入り、有効値は 250 のまま)。
   * 今は「最新がまだ読んだ行のその版か」を 1 つの取引で比べるので、断って読み直し、新しい最新に重ねる。
   */
  it('★ 読んだ後・書く前に別の行が新しい最新として入っても、値は採用される最新に入る (古い行に書かない)', async () => {
    const store = getRecordStore();
    const first = await store.insert(PARAMETER_OVERRIDES_COLLECTION, { values: { 'hydroponics.daysPerYear': 250 } });
    await mount();
    const original = store.replaceLatestIfUnchanged.bind(store);
    let fired = false;
    const conditional = vi.spyOn(store, 'replaceLatestIfUnchanged').mockImplementation((async (
      collection: string,
      expected: LatestToken,
      data: Record<string, unknown>,
    ) => {
      if (!fired) {
        fired = true;
        // 別の画面の最後の手 —— 読んだ行がまだ最新のうちに、新しい行として足した。
        const r = await store.insertIfLatest(PARAMETER_OVERRIDES_COLLECTION, latestTokenOf(first), {
          values: { 'hydroponics.daysPerYear': 250, 'payroll.commutePublicTransportCap': 150_000 },
        });
        expect(r.status, '標本が的に当たっていない (新しい行が入らなかった)').toBe('saved');
      }
      return original(collection, expected, data);
    }) as typeof store.replaceLatestIfUnchanged);
    await act(async () => {
      await ref.current.set('hydroponics.daysPerYear', 300);
    });
    expect(conditional).toHaveBeenCalledTimes(2);
    const rows = await getRecordStore().list<ParameterOverrideRecord>(PARAMETER_OVERRIDES_COLLECTION);
    // 採用される最新 (新しい行) に今保存した値が入り、別の画面が足した値も残る。古い行は書き換えていない。
    expect(overridesFromRecords(rows)).toEqual({
      'hydroponics.daysPerYear': 300,
      'payroll.commutePublicTransportCap': 150_000,
    });
    expect(rows.find((r) => r.id === first.id)?.data).toEqual({ values: { 'hydroponics.daysPerYear': 250 } });
    await settleUntil(() => ref.current.values['hydroponics.daysPerYear'] === 300, '画面の有効値が 300 になる');
  });

  it('★ まだ 1 件も無いとき、別の画面が先に最初の 1 件を足していたら、その行に重ねる (2 件目を足さない)', async () => {
    const store = getRecordStore();
    await mount();
    const original = store.insertIfLatest.bind(store);
    let fired = false;
    vi.spyOn(store, 'insertIfLatest').mockImplementation((async (
      collection: string,
      expected: Parameters<typeof store.insertIfLatest>[1],
      data: Record<string, unknown>,
    ) => {
      if (!fired) {
        fired = true;
        await store.insert(PARAMETER_OVERRIDES_COLLECTION, { values: { 'payroll.commutePublicTransportCap': 150_000 } });
      }
      return original(collection, expected, data);
    }) as typeof store.insertIfLatest);
    await act(async () => {
      await ref.current.set('hydroponics.daysPerYear', 300);
    });
    expect(await stored()).toEqual([
      { values: { 'payroll.commutePublicTransportCap': 150_000, 'hydroponics.daysPerYear': 300 } },
    ]);
  });

  it('★ 挟まれ続けたら、書かずに断る (回り続けない・端末の保存の失敗とは言わない)', async () => {
    const store = getRecordStore();
    const row = (await store.insert(PARAMETER_OVERRIDES_COLLECTION, {
      values: { 'hydroponics.daysPerYear': 250 },
    })) as StoredRecord<Record<string, unknown>>;
    await mount();
    _resetDeviceStoreFailureForTests();
    const failures: DeviceStoreFailure[] = [];
    const off = subscribeDeviceStoreFailure((f) => {
      if (f !== null) failures.push(f);
    });
    const conditional = vi.spyOn(store, 'replaceLatestIfUnchanged').mockResolvedValue({ status: 'changed', current: row });
    const insert = vi.spyOn(store, 'insertIfLatest').mockResolvedValue({ status: 'changed', current: row });
    let thrown: unknown = null;
    await act(async () => {
      await ref.current.set('hydroponics.daysPerYear', 300).catch((e: unknown) => {
        thrown = e;
      });
    });
    off();
    expect(conditional).toHaveBeenCalledTimes(MAX_WRITE_ATTEMPTS);
    expect(insert).toHaveBeenCalledTimes(1);
    expect(thrown).toBeInstanceOf(ParameterBusyError);
    // 名前でも名乗る —— `instanceof` の効かない所 (ログ・再送出・文字列化) で、何の断りかを読めるように。
    expect((thrown as Error).name).toBe('ParameterBusyError');
    expect(String(thrown)).toBe(`ParameterBusyError: ${PARAMETER_BUSY_MESSAGE}`);
    expect((thrown as Error).message).toBe(PARAMETER_BUSY_MESSAGE);
    expect(PARAMETER_BUSY_MESSAGE).toContain('重なり続けました');
    // **端末の保存の失敗ではない** —— 画面上端の「この端末に保存できませんでした」(再読込を勧める) へは
    // 流さない。押した所 (設定の行) が言う (`parametersPanelBusy` の jsdom 検査)。
    expect(failures).toEqual([]);
    expect(await stored(), '断ったのに書いた').toEqual([{ values: { 'hydroponics.daysPerYear': 250 } }]);
  });

  it('台帳の全 id を set → reset できる (id と引数の対応が崩れていない)', async () => {
    await mount();
    for (const p of PARAMETERS) {
      await act(async () => {
        await ref.current.set(p.id, p.defaultValue);
      });
    }
    await waitForOverrides(PARAMETERS.length);
    expect(Object.keys(ref.current.overrides).length).toBe(PARAMETERS.length);
    expect((await stored()).length).toBe(1);
  });
});
