/**
 * 自販機と無人販売店舗の記録の集計 (2026-11-24 · PR #795 の作り直し)。
 *
 * 守ること: 記録した値だけを集計する・読めない行は外して件数を言う・割れない値は null
 * (0 を事実として返さない)・空欄を 0 として入れない。
 */
import { describe, expect, it } from 'vitest';
import {
  MAX_STORE_MONTHLY_CUSTOMERS,
  MAX_VENDING_MONTHLY_YEN,
  MAX_VENDING_NAME_CHARS,
  lossRateOf,
  parseUnmannedStore,
  parseVendingMachine,
  summarizeVendingBusiness,
  unreadableVendingNote,
  vendingAmountOf,
  type UnmannedStoreEntry,
  type VendingMachineEntry,
} from '../vendingBusiness';

const machine = (o: Partial<VendingMachineEntry> = {}): VendingMachineEntry => ({
  name: 'M', placement: 'office', monthlyRevenue: 100_000, operational: true, needsRestock: false, ...o,
});
const store = (o: Partial<UnmannedStoreEntry> = {}): UnmannedStoreEntry => ({
  name: 'S', monthlyRevenue: 400_000, monthlyCustomers: 500, lossRatePct: 2, ...o,
});

describe('parseVendingMachine', () => {
  const base = { name: ' 本社1階 ', placement: 'office', monthlyRevenue: '85,000', operational: true, needsRestock: false };

  it('全角・桁区切りを読み、名前の前後の空白を落とす', () => {
    expect(parseVendingMachine(base)).toEqual({ name: '本社1階', placement: 'office', monthlyRevenue: 85_000, operational: true, needsRestock: false });
    expect(parseVendingMachine({ ...base, monthlyRevenue: '８５０００' }).monthlyRevenue).toBe(85_000);
  });

  it('空欄の売上は 0 として入れずに断る (0 と「未入力」は別の事実)', () => {
    expect(() => parseVendingMachine({ ...base, monthlyRevenue: '' })).toThrow(new Error('月の売上が未入力です（0 なら 0 と入力してください）'));
    expect(parseVendingMachine({ ...base, monthlyRevenue: '0' }).monthlyRevenue).toBe(0);
  });

  it('負・小数・指数・上限超えは断る', () => {
    const range = new Error(`月の売上は 0 以上 ${MAX_VENDING_MONTHLY_YEN.toLocaleString('ja-JP')} 円以下の整数で入力してください`);
    for (const bad of ['-1', '1.5', '1e3', String(MAX_VENDING_MONTHLY_YEN + 1), 'abc']) {
      expect(() => parseVendingMachine({ ...base, monthlyRevenue: bad }), bad).toThrow(range);
    }
    expect(parseVendingMachine({ ...base, monthlyRevenue: String(MAX_VENDING_MONTHLY_YEN) }).monthlyRevenue).toBe(MAX_VENDING_MONTHLY_YEN);
  });

  it('名前の空・長すぎ、知らない設置場所、真偽値でない状態は断る', () => {
    expect(() => parseVendingMachine({ ...base, name: '  ' })).toThrow(new Error('台の名前が未入力です'));
    expect(() => parseVendingMachine({ ...base, name: 'あ'.repeat(MAX_VENDING_NAME_CHARS + 1) })).toThrow(new Error(`台の名前は ${MAX_VENDING_NAME_CHARS} 文字以内で入力してください`));
    expect(parseVendingMachine({ ...base, name: '😀'.repeat(MAX_VENDING_NAME_CHARS) }).name).toHaveLength(MAX_VENDING_NAME_CHARS * 2);
    expect(() => parseVendingMachine({ ...base, placement: 'rooftop' })).toThrow(new Error('設置場所を選んでください'));
    expect(() => parseVendingMachine({ ...base, operational: 'true' })).toThrow(new Error('稼働しているかを選んでください'));
    expect(() => parseVendingMachine({ ...base, needsRestock: 1 })).toThrow(new Error('補充が要るかを選んでください'));
  });
});

describe('parseUnmannedStore', () => {
  const base = { name: '駅前', monthlyRevenue: '420000', monthlyCustomers: '600', lossRatePct: '2.5' };

  it('売上・客数・ロス率を読む (ロス率は小数を許す)', () => {
    expect(parseUnmannedStore(base)).toEqual({ name: '駅前', monthlyRevenue: 420_000, monthlyCustomers: 600, lossRatePct: 2.5 });
  });

  it('空欄は断り、0 は通す', () => {
    expect(() => parseUnmannedStore({ ...base, monthlyCustomers: '' })).toThrow(new Error('月の客数が未入力です（0 なら 0 と入力してください）'));
    expect(() => parseUnmannedStore({ ...base, lossRatePct: '' })).toThrow(new Error('ロス率が未入力です（無いなら 0 と入力してください）'));
    expect(parseUnmannedStore({ ...base, lossRatePct: '0', monthlyCustomers: '0' })).toMatchObject({ lossRatePct: 0, monthlyCustomers: 0 });
  });

  it('客数の上限: ちょうどは通し、+1 は断る', () => {
    expect(parseUnmannedStore({ ...base, monthlyCustomers: String(MAX_STORE_MONTHLY_CUSTOMERS) }).monthlyCustomers).toBe(MAX_STORE_MONTHLY_CUSTOMERS);
    expect(() => parseUnmannedStore({ ...base, monthlyCustomers: String(MAX_STORE_MONTHLY_CUSTOMERS + 1) })).toThrow(
      new Error(`月の客数は 0 以上 ${MAX_STORE_MONTHLY_CUSTOMERS.toLocaleString('ja-JP')} 人以下の整数で入力してください`),
    );
  });

  it('ロス率は 0〜100 の外を断る (境界は通す)', () => {
    const msg = new Error('ロス率は 0 以上 100 以下の % で入力してください');
    expect(() => parseUnmannedStore({ ...base, lossRatePct: '100.1' })).toThrow(msg);
    expect(() => parseUnmannedStore({ ...base, lossRatePct: '-0.1' })).toThrow(msg);
    expect(() => parseUnmannedStore({ ...base, lossRatePct: 'x' })).toThrow(msg);
    expect(parseUnmannedStore({ ...base, lossRatePct: '100' }).lossRatePct).toBe(100);
  });
});

describe('summarizeVendingBusiness', () => {
  it('記録が無ければ割れる値はどれも null (0 にしない)', () => {
    const s = summarizeVendingBusiness([], []);
    expect(s.machines.operatingRate).toBeNull();
    expect(s.machines.averageRevenue).toBeNull();
    expect(s.stores.averageSpend).toBeNull();
    expect(s.stores.lossRatePct).toBeNull();
    expect(s.combinedRevenue).toBeNull();
  });

  it('稼働率・1 台平均・補充と停止の一覧・設置場所の内訳 (売上の多い順)', () => {
    const s = summarizeVendingBusiness(
      [
        machine({ name: 'A', placement: 'office', monthlyRevenue: 100_000 }),
        machine({ name: 'B', placement: 'station', monthlyRevenue: 300_000, needsRestock: true }),
        machine({ name: 'C', placement: 'office', monthlyRevenue: 50_000, operational: false }),
        machine({ name: 'D', placement: 'street', monthlyRevenue: 150_000, operational: false, needsRestock: true }),
      ],
      [],
    );
    expect(s.machines.readable).toBe(4);
    expect(s.machines.operating).toBe(2);
    expect(s.machines.operatingRate).toBe(0.5);
    expect(s.machines.revenue).toBe(600_000);
    expect(s.machines.averageRevenue).toBe(150_000);
    expect(s.machines.restockNames).toEqual(['B', 'D']);
    expect(s.machines.stoppedNames).toEqual(['C', 'D']);
    expect(s.machines.byPlacement).toEqual([
      { placement: 'station', machines: 1, revenue: 300_000 },
      { placement: 'office', machines: 2, revenue: 150_000 },
      { placement: 'street', machines: 1, revenue: 150_000 },
    ]);
    expect(s.combinedRevenue).toBe(600_000);
    // 店の記録が無いので、店の割れる値は null のまま。
    expect(s.stores.averageSpend).toBeNull();
  });

  it('客単価と、売上で重み付けしたロス率 (店の数で割る平均ではない)', () => {
    const s = summarizeVendingBusiness([], [
      store({ monthlyRevenue: 900_000, monthlyCustomers: 900, lossRatePct: 1 }),
      store({ monthlyRevenue: 100_000, monthlyCustomers: 100, lossRatePct: 11 }),
    ]);
    expect(s.stores.revenue).toBe(1_000_000);
    expect(s.stores.customers).toBe(1000);
    expect(s.stores.averageSpend).toBe(1000);
    expect(s.stores.lossRatePct).toBeCloseTo(2, 10); // (900k×1 + 100k×11) / 1,000k
    expect((1 + 11) / 2).toBe(6); // 単純平均ならこうなる (取り違えの標本)
    expect(s.combinedRevenue).toBe(1_000_000);
  });

  it('客が 0 人・売上が 0 円なら客単価とロス率は null', () => {
    const s = summarizeVendingBusiness([], [store({ monthlyRevenue: 0, monthlyCustomers: 0, lossRatePct: 3 })]);
    expect(s.stores.readable).toBe(1);
    expect(s.stores.averageSpend).toBeNull();
    expect(s.stores.lossRatePct).toBeNull();
    expect(s.combinedRevenue).toBe(0); // 読める行が在るので 0 は事実
  });

  it('★ 読めない行は合計から外して件数を返す (合計・件数・内訳は同じ部分集合から)', () => {
    const rows = [
      machine({ name: 'ok', monthlyRevenue: 100_000 }),
      { ...machine(), placement: 'rooftop' } as unknown as VendingMachineEntry,
      { ...machine(), monthlyRevenue: '100000' } as unknown as VendingMachineEntry,
      { ...machine(), operational: 'yes' } as unknown as VendingMachineEntry,
      { ...machine(), name: 42 } as unknown as VendingMachineEntry,
    ];
    const storesIn = [store(), { ...store(), lossRatePct: 120 } as UnmannedStoreEntry, { ...store(), monthlyCustomers: -1 } as UnmannedStoreEntry];
    const s = summarizeVendingBusiness(rows, storesIn);
    expect(s.machines.readable).toBe(1);
    expect(s.machines.unreadable).toBe(4);
    expect(s.machines.revenue).toBe(100_000);
    expect(s.machines.operatingRate).toBe(1);
    expect(s.machines.byPlacement).toEqual([{ placement: 'office', machines: 1, revenue: 100_000 }]);
    expect(s.stores.readable).toBe(1);
    expect(s.stores.unreadable).toBe(2);
    expect(s.stores.revenue).toBe(400_000);
  });
});

describe('読みと断り', () => {
  it('vendingAmountOf / lossRateOf は範囲外と数でない値を null にする', () => {
    expect(vendingAmountOf(0)).toBe(0);
    expect(vendingAmountOf(-1)).toBeNull();
    expect(vendingAmountOf('5')).toBeNull();
    expect(vendingAmountOf(Number.NaN)).toBeNull();
    expect(lossRateOf(100)).toBe(100);
    expect(lossRateOf(100.01)).toBeNull();
    expect(lossRateOf(-0.01)).toBeNull();
  });

  it('外した行が無ければ断りは null、在れば件数と逃げ口 (一覧の ×) を言う', () => {
    expect(unreadableVendingNote(0, 0)).toBeNull();
    expect(unreadableVendingNote(Number.NaN, 0)).toBeNull();
    expect(unreadableVendingNote(Number.POSITIVE_INFINITY, 1.5)).toBeNull();
    expect(unreadableVendingNote(2, 0)).toBe('項目のいずれかが読めない記録が 自販機 2 台 あります。集計には入れていません。その行も下の一覧に出ています —— 一覧の × で消して、入れ直してください。');
    expect(unreadableVendingNote(1, 3)).toContain('自販機 1 台・無人店舗 3 店');
  });
});
