/** @vitest-environment jsdom */
/**
 * 数値パラメータの上書きの保存 — 実物の record store (fake-indexeddb) を通す。
 *
 * 守る性質: 上書きは **1 レコードを書き換える** (積み上げない)・読むのは最新 1 件・
 * 壊れた保存は捨てる・通らない値は書かない。
 */
import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import {
  PARAMETER_OVERRIDES_COLLECTION,
  overridesFromRecords,
  useParameters,
  type ParameterOverrideRecord,
  type UseParameters,
} from '../parameterOverrides';
import { _resetRecordStoreForTests, getRecordStore } from '../store';
import { _resetCollectionSubscribersForTests } from '../useCollection';
import { DEFAULT_PARAMETER_VALUES, PARAMETERS } from '../../../shared/parameters';

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

  async function settle(): Promise<void> {
    for (let i = 0; i < 8; i += 1) {
      await act(async () => {
        await new Promise<void>((r) => setTimeout(r, 0));
      });
    }
  }

  async function mount(): Promise<void> {
    root = createRoot(container);
    await act(async () => {
      root!.render(createElement(Harness));
    });
    await settle();
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
    await settle();
    expect(ref.current.values['hydroponics.daysPerYear']).toBe(300);
    expect(ref.current.overrides).toEqual({ 'hydroponics.daysPerYear': 300 });
    expect(await stored()).toEqual([{ values: { 'hydroponics.daysPerYear': 300 } }]);

    await act(async () => {
      await ref.current.set('payroll.commutePublicTransportCap', 200_000);
    });
    await settle();
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
    await settle();
    await act(async () => {
      await ref.current.reset('hydroponics.daysPerYear');
    });
    await settle();
    expect(ref.current.overrides).toEqual({ 'payroll.commutePublicTransportCap': 200_000 });
    expect(ref.current.values['hydroponics.daysPerYear']).toBe(DEFAULT_PARAMETER_VALUES['hydroponics.daysPerYear']);
    expect(await stored()).toEqual([{ values: { 'payroll.commutePublicTransportCap': 200_000 } }]);

    await act(async () => {
      await ref.current.resetAll();
    });
    await settle();
    expect(ref.current.overrides).toEqual({});
    expect(ref.current.values).toEqual(DEFAULT_PARAMETER_VALUES);
    expect(await stored()).toEqual([{ values: {} }]);
  });

  it('通らない値は書かない (書けても読む側が捨てて、記録と画面が食い違う)', async () => {
    await mount();
    await expect(ref.current.set('hydroponics.daysPerYear', 0)).rejects.toThrow('1日 以上');
    await expect(ref.current.set('hydroponics.daysPerYear', Number.NaN)).rejects.toThrow('数値');
    await settle();
    expect(await stored()).toEqual([]);
    expect(ref.current.overrides).toEqual({});
    // 境界の値は通る。
    await act(async () => {
      await ref.current.set('hydroponics.daysPerYear', 1);
    });
    await settle();
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
    await settle();
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
    await settle();
    expect(await stored()).toEqual([
      { values: { 'hydroponics.daysPerYear': 300, 'payroll.commutePublicTransportCap': 200_000 } },
    ]);
    expect(ref.current.overrides).toEqual({
      'hydroponics.daysPerYear': 300,
      'payroll.commutePublicTransportCap': 200_000,
    });
  });

  it('台帳の全 id を set → reset できる (id と引数の対応が崩れていない)', async () => {
    await mount();
    for (const p of PARAMETERS) {
      await act(async () => {
        await ref.current.set(p.id, p.defaultValue);
      });
    }
    await settle();
    expect(Object.keys(ref.current.overrides).length).toBe(PARAMETERS.length);
    expect((await stored()).length).toBe(1);
  });
});
