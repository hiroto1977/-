/** @vitest-environment jsdom */
/**
 * **保管層から読んだ文字列も、型から始めて画面では天井を通る。** (2026-09-22 · パス 417)
 *
 * パス 411 / 415 は第三者の応答について、パス 414 は書き込みの結果についてこれを閉じた。
 * **4 つ目の家系は「保管層から読んだ値」**で、理由は出どころではなく
 * **宣言の型を誰も読みで確かめていない**ことである —— `COLLECTION_SHAPES` の
 * `note: opt(str)` は**入口**で型を見るが、`store.list()` は `cur.value as StoredRecord<T>`
 * で何も検めない (`recordShapeAudit.ts` の設計 —— 読みで落とすと壊れた行が UI から
 * 触れなくなる · パス 360)。だから復元・古い版・別の道具が入れた行がそのまま届く。
 *
 * ## 実測 (2026-09-22 · 直す前)
 *
 * | 壊し方 (販売記録 1 件・**日付は正しい**) | 売上集計 | 経営サマリー |
 * | --- | --- | --- |
 * | `note: 42` / `{z:1}` / `[1]` / `true` | **4 形とも投げる** | **4 形とも投げる** |
 * | `note` が 200,000 字 | **画面 200,257 字** | 10,692 字 |
 *
 * 投げていたのは `(e.note ?? '').trim()` の **3 つの写し** (`salesOrderRef` /
 * `duplicateOrderMessage` / `salesRowKey`) —— `??` は null / undefined しか受けない。
 * 投げると `PageErrorBoundary` が受けるので**その画面は開けず、開けないので
 * その画面からは消せない** (逃げ口は設定の点検パネルだけになる · 法則 `escape-hatch-stays-open`)。
 *
 * 長さの側は**紙にも届いていた** (実測・同じ 200,000 字のメモ 2 件):
 *
 * | 行き先 | 直す前 |
 * | --- | ---: |
 * | 金融機関等提出用の書面 §2 の但し書き | **200,056 字** |
 * | Shopify の断りの文 | **200,112 字** |
 * | 売上集計の一覧の上の警告 | **200,076 字** |
 *
 * ★ **天井は同一性の側には通さない** —— `salesOrderRef` は注文の同一性を決めるので、
 *   切った注文名は**別の注文を指す** (パス 414 の「URL の欄には天井を通さない」と同じ理由)。
 *   `salesRowKey` も同じ (切ると別の行が「同じ内容」に見え、CSV の 2 度読みを誤判定する)。
 *   天井は**画面に出す 3 か所**だけに掛かる。
 * ★ **天井の数は入口が既に持っていた 200** (`MAX_SALES_NOTE_CHARS`) ——
 *   だから**正当な値は 1 つも変わらない** (入口が 200 字を超えるメモを断る)。
 *
 * ## もう 1 つ: 画面の断りが、合計に入っていない行を「2 度数えた」と言っていた
 *
 * `overview.ts` は 2026-09-22 (パス 400) から `findDuplicateOrders(readableSales)` と
 * 部分集合から数え、その行に理由まで書いている —— **売上集計の画面だけが素の購読**
 * だった。実測 (同じ注文名 2 件・片方の日付が `2026-02-31`): 画面は
 * 「売上高と受注件数に 2 度数えられています」と言うのに**総売上は 1,000,000** で
 * 倍になっていない (法則 `one-subset-per-answer`)。
 *
 * 背骨は**振る舞い** —— 実物の保管層へ入れて実物の画面を描く。
 */
import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import path from 'node:path';
import { act, createElement, type ComponentType } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { SalesPage } from '../SalesPage';
import { OverviewPage } from '../OverviewPage';
import {
  MAX_SALES_NOTE_CHARS,
  SALES_COLLECTION,
  duplicateOrderMessage,
  duplicateOrdersNote,
  duplicateOrdersSheetNote,
  findDuplicateOrders,
  salesNoteText,
  salesOrderRef,
  salesRowKey,
  summarizeSales,
  type SalesEntry,
} from '../../data/sales';
import { getRecordStore } from '../../data/store';
import { _resetCollectionSubscribersForTests } from '../../data/useCollection';
import { _resetNavigationIntentForTests } from '../../navigate';
import { resetRecordStore } from '../../__tests__/recordStoreHarness';
import { readOriginalSource } from '../../../shared/__tests__/originalSource';
import { stripNonCode } from '../../../shared/__tests__/stripNonCode';
import { waitForText } from '../../__tests__/jsdomWait';

/** 画面の総文字数の上限 —— 1 件のメモで画面が膨らんだら鳴る (直す前は 200,257 字)。 */
const SCREEN_BOUND = 20_000;
const BIG = 'x'.repeat(200_000);

/** 非文字列の 4 形 —— どれも `opt(str)` が入口で拒むが、読みは検めない。 */
const NON_STRINGS: readonly [string, unknown][] = [
  ['数', 42],
  ['物', { z: 1 }],
  ['配列', [1]],
  ['真偽', true],
];

let container: HTMLDivElement;
let root: Root | null = null;

function stubBridge(): void {
  (globalThis as unknown as { serviceHub: unknown }).serviceHub = {
    getVersion: () => Promise.resolve('0.1.0'),
    listConfigured: () => Promise.resolve([]),
    fetchSnapshot: () => Promise.resolve({ ok: false, code: 'x', message: 'x' }),
    invoke: vi.fn(() => Promise.resolve({ ok: false, code: 'x', message: 'x' })),
    openExternal: () => Promise.resolve(),
    oauthSupported: () => Promise.resolve(false),
    setToken: () => Promise.resolve(),
    clearToken: () => Promise.resolve(),
    storageProtection: () => Promise.resolve({ mechanism: 'none', counts: {} }),
    checkUpdate: () => Promise.resolve({ ok: true }),
    revealInFolder: () => Promise.resolve({ ok: true }),
    openPath: () => Promise.resolve({ ok: true }),
    setColorScheme: () => Promise.resolve(),
    eraseAll: () => Promise.resolve({ ok: true }),
    authorize: () => Promise.resolve({ ok: false }),
  };
}

beforeEach(async () => {
  stubBridge();
  await resetRecordStore();
  _resetCollectionSubscribersForTests();
  _resetNavigationIntentForTests();
  container = document.createElement('div');
  document.body.appendChild(container);
  if (typeof window.matchMedia !== 'function') {
    Object.defineProperty(window, 'matchMedia', {
      value: () => ({
        matches: false,
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
        addListener: () => undefined,
        removeListener: () => undefined,
      }),
      configurable: true,
    });
  }
  for (const name of ['scrollTo', 'scrollIntoView'] as const) {
    if (typeof (Element.prototype as unknown as Record<string, unknown>)[name] !== 'function') {
      Object.defineProperty(Element.prototype, name, { value: () => undefined, configurable: true, writable: true });
    }
  }
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
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

async function seed(rows: readonly Record<string, unknown>[]): Promise<void> {
  const store = getRecordStore();
  for (const r of rows) await store.insert(SALES_COLLECTION, r);
}

/**
 * 素で描く (境界で包まない —— 包むと文面になって「投げた」が区別できない)。
 *
 * ★ **錠は「置いた行が届いた印」にする** —— 見出し (`売上を記録`) はフォームの
 *   ラベルなので**保管層より先に出る**ので、それで待つと行が届く前に測ってしまう
 *   (パス 376 の「ラベルは先に出て、算定された値は後から来る」)。
 * ★ **錠を主張そのものにしない** —— 直しが壊れたときに時間切れではなく
 *   主張の失敗として出るように、待つのは金額にして、天井や断りは待った後に見る。
 */
async function mount(Page: ComponentType, waitFor: string): Promise<string> {
  root = createRoot(container);
  const r = root;
  await act(async () => {
    r.render(createElement(Page));
  });
  await waitForText(() => container.textContent ?? '', waitFor);
  return container.textContent ?? '';
}

const row = (over: Record<string, unknown> = {}): Record<string, unknown> => ({
  date: '2026-04-01',
  channel: 'amazon',
  amount: 1000,
  orders: 1,
  ...over,
});

describe('保管層から読んだメモ — 型と天井 (パス 417)', () => {
  it.each(NON_STRINGS)('★ メモが %s でも売上集計は投げない', async (_label, note) => {
    await seed([row({ note })]);
    // 錠は金額 —— 行が届いた印であり、行そのものを落としていないことも同時に言う。
    const t = await mount(SalesPage, '￥1,000');
    expect(t).toContain('2026-04-01');
  });

  it.each(NON_STRINGS)('★ メモが %s でも経営サマリーは投げない', async (_label, note) => {
    await seed([row({ note })]);
    // 錠は**金額** —— `経営サマリー` は見出しなので保管層より先に出る。
    // 対照 A を回すまで、ここは見出しで待っていて**空の状態を測っていた**
    // (対照が 8 件ではなく 4 件しか鳴らず、それで気付いた)。
    const t = await mount(OverviewPage, '￥1,000');
    expect(t).toContain('総売上');
  });

  it('★ 200,000 字のメモでも売上集計は膨らまない (直す前は 200,257 字)', async () => {
    await seed([row({ note: BIG })]);
    const t = await mount(SalesPage, '￥1,000');
    expect(t.length).toBeLessThan(SCREEN_BOUND);
    // 切ったことを述べる (絞ることと述べることは対 · パス 400)。
    expect(t).toContain('x'.repeat(MAX_SALES_NOTE_CHARS) + '…');
  });

  it('★ 200,000 字の注文名は、画面に出る 3 つの文すべてで天井を通る', () => {
    const long = 'Shopify #' + BIG;
    const rows = [row({ note: long }), row({ date: '2026-04-02', note: long })] as unknown as SalesEntry[];
    const groups = findDuplicateOrders(rows);
    expect(groups).toHaveLength(1);
    for (const [where, text] of [
      ['画面の警告', duplicateOrdersNote(groups)],
      ['書面 §2 の但し書き', duplicateOrdersSheetNote(groups)],
      ['Shopify の断り', duplicateOrderMessage(rows[0]!)],
    ] as const) {
      expect(text, `${where} が null`).not.toBeNull();
      // 直す前は 200,076 / 200,056 / 200,112 字だった。
      expect(text!.length, `${where} が長すぎる`).toBeLessThan(1_000);
      expect(text, `${where} が切ったことを述べていない`).toContain('…');
    }
  });

  it('★ 同一性を決める側には天井を通さない (切った注文名は別の注文を指す)', () => {
    const long = 'Shopify #' + BIG;
    const ref = salesOrderRef({ note: long });
    expect(ref).not.toBeNull();
    expect(ref!.length).toBe(long.length);
    // 内容の印も切らない —— 切ると別の行が「同じ内容」に見え、CSV の 2 度読みを誤判定する。
    expect(salesRowKey(row({ note: long }) as unknown as SalesEntry).length).toBeGreaterThan(BIG.length);
  });

  it('★ 読み手は 1 つ —— 型から始め、前後の空白は落とす', () => {
    expect(salesNoteText({ note: '  a  ' })).toBe('a');
    expect(salesNoteText({})).toBe('');
    expect(salesNoteText({ note: undefined })).toBe('');
    for (const [, v] of NON_STRINGS) {
      expect(salesNoteText({ note: v as unknown as string })).toBe('');
    }
  });

  it('★ メモを素で読む形が sales.ts に 1 つも無い (両方向の床つき)', () => {
    const code = stripNonCode(readOriginalSource(path.resolve(__dirname, '../../data/sales.ts')));
    const raw = [...code.matchAll(/\.note\s*\?\?\s*''/g)];
    expect(raw, `素の読みが残っている: ${raw.length} 件`).toHaveLength(0);
    // 床 —— 走査が死んで「0 件だから健全」にならないこと。
    const viaFunnel = [...code.matchAll(/salesNoteText\(/g)];
    // 宣言 1 + 呼び手 3。**うち 1 つはテンプレートの補間の中に在る** ——
    // `stripNonCode` が `${…}` を落としていた頃は 3 しか見えず、**針は両方向に盲目**
    // だった (素の読みへ戻してもその行は数えられない)。パス 417 でそこを直した。
    expect(viaFunnel.length, '漏斗の呼び手が見つからない (針が実物に当たっていない)').toBeGreaterThanOrEqual(4);
    // 針の標本 —— この形が在れば当たる。
    expect(/\.note\s*\?\?\s*''/.test("const x = (e.note ?? '').trim();")).toBe(true);
    // ★ **補間の中も見えていること** (パス 417 で直した死角そのもの)。
    expect(stripNonCode('const k = `a|${salesNoteText(e)}|b`;')).toContain('salesNoteText(e)');
    expect(stripNonCode("const k = `a|${(e.note ?? '').trim()}|b`;")).toMatch(/\.note\s*\?\?/);
  });
});

describe('画面の断りは、合計と同じ部分集合から数える (パス 417)', () => {
  const same = 'Shopify #1001';
  /** 片方の日付が暦に無い (`2026-02-31`) ので合計には入らない。 */
  const mixed = [
    row({ note: same, amount: 1_000_000 }),
    row({ date: '2026-02-31', note: same, amount: 9_000_000 }),
  ];

  it('★ 合計に入っていない行の重複を「2 度数えられています」と言わない', async () => {
    await seed(mixed);
    // 錠は**合計** (￥1,000,000 = 読める 1 件ぶん)。断りの文そのもので待つと、
    // 待ちが主張を飲み込む (パス 379)。
    const t = await mount(SalesPage, '￥1,000,000');
    expect(summarizeSales(mixed as unknown as SalesEntry[]).totalAmount).toBe(1_000_000);
    expect(t, '合計は倍でないのに「2 度数えられています」と言っている').not.toContain('2 度数えられています');
    // 落としたことは別の (広い) 理由が述べる —— 黙って除かない。
    expect(t).toContain('読めない');
  });

  it('★ 両方の行が読めるなら、今までどおり述べる (黙らせたのではない)', async () => {
    await seed([row({ note: same, amount: 1_000_000 }), row({ date: '2026-04-02', note: same, amount: 9_000_000 })]);
    const t = await mount(SalesPage, '￥10,000,000');
    expect(t).toContain('2 度数えられています');
    expect(t).toContain(same);
  });
});
