/** @vitest-environment jsdom */
/**
 * **保管した行の欄を、画面は型から読む。** (2026-09-24 · パス 442)
 *
 * パス 441 が足した走査 (`npm run audit:malformed-fields`) を **6 形**へ広げて
 * 初めて通したところ (`組 726 × 画面 74 = 53,724 回の描画`)、**4 件**出た ——
 * どれも**物 (`{z:1}`) を React の子として素で置いた**形で、2 形の標本では
 * 構造的に届かなかった側である (数と文字列は `.trim` / `.toFixed` を落とすが、
 * 物と配列は JSX が落とす。配列は落ちない —— React は `[1]` を子の一覧として描く)。
 *
 * ```
 * business-units.name       (obj) → overview        Objects are not valid as a React child
 * sales-entries.date        (obj) → sales           同
 * sales-entries.orders      (obj) → sales           同
 * shigyo-consultations.date (obj) → tax-accountant  同
 * ```
 *
 * ## 走査に映らなかった 2 つを、読んで見つけた (どちらも走査より重い)
 *
 * **① 並べ替えは 5 形すべてで投げる** —— `sortBusinessUnits` の
 * `a.data.name.localeCompare(...)` は、**`Array.prototype.sort` が要素 1 つでは
 * 比較関数を呼ばない**ので 1 行だけ置く走査からは見えない。2 行置くと:
 *
 * | 事業名 | 直す前 (良い行の**後ろ**に置く) |
 * | --- | --- |
 * | `42` / `{z:1}` / `[1]` / `true` | **TypeError: localeCompare is not a function** |
 * | `null` | **TypeError: Cannot read properties of null** |
 *
 * ここが投げると重いのは `ManualDataSection` が **`App.tsx` の側から
 * 目録を持つ全画面に描かれる**ためで、1 行の壊れた事業登録で**その画面すべてが
 * 開けなくなる** (法則 `escape-hatch-stays-open`: 開けない画面からその行は消せない)。
 *
 * **② 金額は投げずに嘘を刷る** —— `Intl.NumberFormat#format` は何を渡しても
 * 投げないので走査の網 (「投げたか」) に掛からない。実測 (2026-09-24 · 直す前):
 *
 * | `amount` | 画面が刷っていた物 |
 * | --- | --- |
 * | `{z:1}` | `￥NaN` |
 * | `[1]` / `true` | **`￥1`** |
 * | `null` | **`￥0`** —— 「0 円で売れた」という**事実の主張**になる |
 *
 * ★ **天井は同一性の側に通さない**・**一覧は素の購読を描く** (× で消せるように)
 *   という パス 425 / 441 の判断はそのまま。変えたのは**読み方**だけである。
 */
import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import path from 'node:path';
import { act, createElement, type ComponentType } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { SalesPage } from '../pages/SalesPage';
import { OverviewPage } from '../pages/OverviewPage';
import { TaxAccountantPage } from '../pages/TaxAccountantPage';
import {
  BUSINESS_UNITS_COLLECTION,
  businessUnitName,
  financialUnitsFromBusinessUnits,
  findBusinessName,
  sortBusinessUnits,
  type BusinessUnitRecord,
} from '../data/businessUnits';
import {
  SALES_COLLECTION,
  blankSalesCause,
  droppedSalesRowsNote,
  droppedSalesRowsSheetNote,
  readableSalesRows,
  summarizeSales,
  type SalesEntry,
} from '../data/sales';
import { SHIGYO_CONSULTATIONS_COLLECTION } from '../data/shigyoDirectory';
import { getRecordStore } from '../data/store';
import { _resetCollectionSubscribersForTests } from '../data/useCollection';
import { _resetNavigationIntentForTests } from '../navigate';
import { installPageRenderGlobals } from './pageRenderHarness';
import { resetRecordStore } from './recordStoreHarness';
import { readOriginalSource } from '../../shared/__tests__/originalSource';
import { stripNonCode } from '../../shared/__tests__/stripNonCode';
import { waitForText } from './jsdomWait';

/** 形が拒む 6 形 —— 走査の `ONE_FIELD_VALUES` と同じ並び。 */
const NON_STRINGS: readonly [string, unknown][] = [
  ['文字列', '1000'],
  ['数', -987654.321],
  ['物', { z: 1 }],
  ['配列', [1]],
  ['真偽', true],
  ['null', null],
];

/** 文字列を受け付ける欄について「読めない」側だけを見るとき。 */
const NOT_STRINGS = NON_STRINGS.filter(([label]) => label !== '文字列');

const GOOD_SALES = { date: '2026-04-01', channel: 'amazon', amount: 1000, orders: 1, note: 'x' };
// 錠は**この it が置いた行にしか無い印**にする (`'税理士'` は画面のラベルなので
// 保管層より先に出る —— そこで測ると行が届く前の姿を掴む・パス 376)。
const CONSULT_MARK = 'QQ442QQ';
const GOOD_CONSULT = { serviceId: 'tax-accountant', date: '2026-04-01', topic: CONSULT_MARK, status: '相談予約' };
// 錠は**この it が置いた事業にしか無い印** —— 「経営サマリー」は見出しなので
// 保管層より先に出る (パス 390 で同じ罠を踏んでいる)。事業間比較の `<option>` に
// 出る名前を待てば、`financialUnitsFromBusinessUnits` を通った印になる。
const UNIT_MARK = 'QQ442UNITQQ';
const GOOD_UNIT = { name: UNIT_MARK, category: '小売', startedOn: '2026-01', note: 'n', revenue: 100, variableCost: 10, fixedCost: 5 };

let container: HTMLDivElement;
let root: Root | null = null;

beforeEach(async () => {
  installPageRenderGlobals((name) => {
    vi.spyOn(console, name).mockImplementation(() => undefined);
  });
  await resetRecordStore();
  _resetCollectionSubscribersForTests();
  _resetNavigationIntentForTests();
  container = document.createElement('div');
  document.body.appendChild(container);
});

afterEach(() => {
  if (root) {
    const r = root;
    root = null;
    act(() => {
      r.unmount();
    });
  }
  container.remove();
  vi.restoreAllMocks();
});

async function seed(collection: string, rows: readonly Record<string, unknown>[]): Promise<void> {
  const store = getRecordStore();
  for (const r of rows) await store.insert(collection, r);
}

/** 素で描く (境界で包まない —— 包むと投げたことが文面になって区別できない)。 */
async function mount(Page: ComponentType, waitFor: string): Promise<string> {
  root = createRoot(container);
  const r = root;
  await act(async () => {
    r.render(createElement(Page));
  });
  await waitForText(() => container.textContent ?? '', waitFor);
  return container.textContent ?? '';
}

describe('保管した行の欄を画面が型から読む — 振る舞い (パス 442)', () => {
  it.each(NOT_STRINGS)('★ 販売記録の日付が %s でも売上集計は投げず、× が残る', async (_label, date) => {
    await seed(SALES_COLLECTION, [GOOD_SALES, { ...GOOD_SALES, date }]);
    // 錠は良い行の金額 —— 行が届いた印であり、行そのものを落としていないことも言う。
    const t = await mount(SalesPage, '2026-04-01');
    expect(t).not.toContain('[object Object]');
    expect(container.querySelectorAll('button[aria-label="削除"]').length).toBe(2);
  });

  it.each(NOT_STRINGS)('★ 受注件数が %s でも売上集計は投げず、その欄は — になる', async (_label, orders) => {
    await seed(SALES_COLLECTION, [GOOD_SALES, { ...GOOD_SALES, orders }]);
    const t = await mount(SalesPage, '2026-04-01');
    expect(t).not.toContain('[object Object]');
    expect(container.querySelectorAll('button[aria-label="削除"]').length).toBe(2);
    expect(t).toContain('—');
  });

  it.each(NOT_STRINGS)('★ 金額が %s でも「￥0」「￥1」「￥NaN」を刷らない (投げないが嘘を刷っていた)', async (_label, amount) => {
    await seed(SALES_COLLECTION, [{ ...GOOD_SALES, amount }]);
    const t = await mount(SalesPage, '2026-04-01');
    for (const lie of ['￥NaN', '￥0', '￥1\t', '￥1 ']) expect(t).not.toContain(lie);
    // 良い行の金額はそのまま (床を足しただけで、読める値の答えは 1 つも変わらない)。
    expect(container.querySelectorAll('button[aria-label="削除"]').length).toBe(1);
  });

  it('対照: 読める販売記録の金額と件数は今までどおり刷る', async () => {
    await seed(SALES_COLLECTION, [{ ...GOOD_SALES, amount: 1234, orders: 7 }]);
    const t = await mount(SalesPage, '2026-04-01');
    expect(t).toContain('￥1,234');
    expect(t).toContain('7');
  });

  it.each(NOT_STRINGS)('★ 相談の日付が %s でも士業の画面は投げない', async (_label, date) => {
    await seed(SHIGYO_CONSULTATIONS_COLLECTION, [{ ...GOOD_CONSULT, date }]);
    const t = await mount(TaxAccountantPage, CONSULT_MARK);
    expect(t).not.toContain('[object Object]');
  });

  // 経営サマリーは jsdom で重い (1 描画あたり数秒) ので 2 形に絞る ——
  // 物 (JSX が落とす) と null (`localeCompare` が落とす)。残りは下の純関数が直接見る。
  it.each([NON_STRINGS[2]!, NON_STRINGS[5]!])('★ 事業名が %s でも経営サマリーは投げない', async (_label, name) => {
    await seed(BUSINESS_UNITS_COLLECTION, [GOOD_UNIT, { ...GOOD_UNIT, name }]);
    const t = await mount(OverviewPage, UNIT_MARK);
    expect(t).not.toContain('[object Object]');
  });
});

describe('事業名の読みは 1 つの口を通る (パス 442)', () => {
  const units = (name: unknown): readonly BusinessUnitRecord[] =>
    // 開始時期を持たない 2 行 —— `sort` は要素 1 つでは比較関数を呼ばないので、
    // **壊れた行を良い行の後ろに置く**(V8 は `comparefn(arr[1], arr[0])` から始める)。
    [
      { id: 'good', data: { name: 'B' } },
      { id: 'bad', data: { name } },
    ] as unknown as readonly BusinessUnitRecord[];

  it.each(NOT_STRINGS)('★ 並べ替えは事業名が %s でも投げず、行を落とさない', (_label, name) => {
    const sorted = sortBusinessUnits(units(name));
    expect(sorted.map((u) => u.id).sort()).toEqual(['bad', 'good']);
  });

  it.each(NOT_STRINGS)('businessUnitName は %s を空文字にする', (_label, name) => {
    expect(businessUnitName({ name } as unknown as { name: string })).toBe('');
  });

  it('businessUnitName は文字列をそのまま返す (前後の空白も落とさない)', () => {
    expect(businessUnitName({ name: '  EC  ' })).toBe('  EC  ');
  });

  it.each(NOT_STRINGS)('findBusinessName の返り値は %s でも宣言どおり string | null', (_label, name) => {
    const got = findBusinessName(units(name), 'bad');
    expect(got).toBe('');
    expect(typeof got).toBe('string');
  });

  it('findBusinessName は消えた事業に null を返す (「指定なし」と読めない値を混ぜない)', () => {
    expect(findBusinessName(units('X'), 'gone')).toBeNull();
    expect(findBusinessName(units('X'), 'bad')).toBe('X');
  });

  it.each(NOT_STRINGS)('事業間比較の label は %s でも文字列', (_label, name) => {
    const out = financialUnitsFromBusinessUnits([{ id: 'a', data: { name, revenue: 100 } }] as never);
    expect(out).toHaveLength(1);
    expect(typeof out[0]!.label).toBe('string');
  });

  it('★ 素の `.data.name` は 1 つも残っていない (読みは businessUnitName へ寄せた)', () => {
    const src = stripNonCode(readOriginalSource(path.join(__dirname, '..', 'data', 'businessUnits.ts')));
    const RAW = /\.data\.name(?![A-Za-z])/;
    expect(src).not.toMatch(RAW);
    // 針が的に当たること —— 直す前の行そのものを標本にする。
    expect('  undated.sort((a, b) => a.data.name.localeCompare(b.data.name));').toMatch(RAW);
    // 逆向き: 寄せた後の形は針に当たらない (外し方が広すぎない)。
    expect('  undated.sort((a, b) => businessUnitName(a.data).localeCompare(businessUnitName(b.data)));').not.toMatch(RAW);
    // 読みの口そのものは在る (走査が「何も無い」で空虚に通らない)。
    expect(src).toMatch(/export function businessUnitName\(/);
  });
});


/**
 * **読めない金額は 0 でも合計でもない —— 行ごと外して、その件数を述べる。**
 *
 * これは走査には映らない家系である (`Intl.NumberFormat#format` は何を渡しても
 * 投げないので「投げた画面」に数えられない)。見つけたのは、上の振る舞いの検査が
 * 「明細は `—` になったのに、その上の**総売上**は `￥NaN` / `￥0` のままだ」と
 * 落ちたからである。
 */
describe('金額・受注件数が読めない行は集計から外す (パス 442)', () => {
  const good = { date: '2026-04-01', channel: 'amazon', amount: 1000, orders: 1 } as unknown as SalesEntry;
  const bad = (over: Record<string, unknown>): SalesEntry => ({ ...good, ...over } as unknown as SalesEntry);

  // 直す前に実測した 5 形と、その合計 (`1000 + x`)。文字列が最も重い ——
  // 10 進の文字列は手で直した JSON や古い取り込みが普通に作る形で、
  // `+` が文字列連結に落ちて **￥10,001,000 (5,000 倍)** になっていた。
  const AMOUNTS: readonly [string, unknown, string][] = [
    ['10 進の文字列', '1000', '10001000'],
    ['物', { z: 1 }, '1000[object Object]'],
    ['配列', [1], '10001'],
    ['真偽', true, '1001'],
    ['null', null, '1000'],
  ];

  it.each(AMOUNTS)('★ 金額が %s の行は合計に入らない (良い行の 1,000 円だけが残る)', (_label, amount) => {
    const s = summarizeSales([good, bad({ amount })]);
    expect(s.totalAmount).toBe(1000);
    expect(s.totalOrders).toBe(1);
    expect(s.unreadableAmounts).toBe(1);
    expect(s.unreadableDates).toBe(0);
  });

  it.each(AMOUNTS)('対照: 直す前の `+` は %s を合計に混ぜていた', (_label, amount, wasTotal) => {
    // 製品は直したので再現できない —— 同じ式を here で組んで、当時の値を示す。
    expect(`${0 + 1000 + (amount as number)}`).toBe(wasTotal);
  });

  it('★ 受注件数が読めない行も同じく外す (単価の分母が狂わない)', () => {
    const s = summarizeSales([good, bad({ orders: '1000' })]);
    expect(s.totalOrders).toBe(1);
    expect(s.aov).toBe(1000);
    expect(s.unreadableAmounts).toBe(1);
  });

  it('対照: 読める行だけなら答えは 1 つも変わらない', () => {
    const s = summarizeSales([good, bad({ amount: 500, orders: 2 })]);
    expect(s.totalAmount).toBe(1500);
    expect(s.totalOrders).toBe(3);
    expect(s.unreadableAmounts).toBe(0);
    expect(s.unreadableDates).toBe(0);
    expect(s.period).not.toBeNull();
  });

  it('★ 内訳の合計は落とした件数と一致する (分子と分母を同じ部分集合から取る)', () => {
    const r = readableSalesRows([good, bad({ date: 'bad' }), bad({ amount: null }), bad({ date: 'bad', amount: null })]);
    expect(r.rows).toHaveLength(1);
    expect(r.dropped).toBe(3);
    expect(r.unreadableDates).toBe(2);
    expect(r.unreadableAmounts).toBe(1);
    expect(r.unreadableDates + r.unreadableAmounts).toBe(r.dropped);
  });

  it('★ 原因は言い分ける —— 金額だけが読めない利用者に「日付」と言わない', () => {
    const only = summarizeSales([good, bad({ amount: null })]);
    const note = droppedSalesRowsNote({ hasData: true, ...only })!;
    expect(note).toContain('金額または受注件数が数として読めない');
    expect(note).not.toContain('日付 (YYYY-MM-DD) が読めない');
    // 逆向き: 日付だけが読めない利用者に「金額」と言わない。
    const dates = summarizeSales([good, bad({ date: 'bad' })]);
    const dnote = droppedSalesRowsNote({ hasData: true, ...dates })!;
    expect(dnote).toContain('日付 (YYYY-MM-DD) が読めない');
    expect(dnote).not.toContain('金額または受注件数');
  });

  it('★ 両方在れば両方言う (紙の側も同じ)', () => {
    const both = summarizeSales([good, bad({ date: 'bad' }), bad({ amount: null })]);
    const screen = droppedSalesRowsNote({ hasData: true, ...both })!;
    const sheet = droppedSalesRowsSheetNote({ hasData: true, ...both })!;
    for (const t of [screen, sheet]) {
      expect(t).toContain('日付');
      expect(t).toContain('金額または受注件数');
    }
    // 画面は逃げ口を名指しし、紙は事実だけを短く述べる (パス 400 の分業)。
    expect(screen).toContain('形式の合わないレコード');
    expect(sheet).not.toContain('形式の合わないレコード');
  });

  it('対照: 落とす物が無ければ 1 文も出ない', () => {
    const clean = summarizeSales([good]);
    expect(droppedSalesRowsNote({ hasData: true, ...clean })).toBeNull();
    expect(droppedSalesRowsSheetNote({ hasData: true, ...clean })).toBeNull();
  });

  it('★ 金額だけが読めない控えは「未入力」ではない (記録を入れた人に入れていないと告げない)', () => {
    const s = summarizeSales([bad({ amount: null })]);
    expect(blankSalesCause({ hasData: false, ...s })).toBe('all-unreadable');
    expect(blankSalesCause({ hasData: false, unreadableDates: 0, unreadableAmounts: 0 })).toBe('no-records');
  });
});
