/** @vitest-environment jsdom */
/**
 * **同じ CSV を 2 度読まない・同じ注文名の重複を言う。** (2026-09-09 · パス 126)
 *
 * 売上集計の CSV 取り込みは既存の記録と照合せず `addMany` していたので、同じファイルを 2 度読むと
 * 売上高と受注件数が 2 倍になり、金融機関等提出用の書面 §2「売上高（販売記録）」まで届いた。
 * 行の内容は「断る鍵」にはならない (同じ日に同じ額の別の注文はありうる) ので、**全行が既存と同じ**
 * ときだけ「同じファイルを 2 度読んだ」として断り、一部が同じなら取り込んで件数を言う。
 *
 * ここは実物の画面で 3 面を読む: 全行同じ CSV は断られ件数が増えない・一部同じ CSV は取り込まれ
 * 件数を言う・同じ注文名の記録が既に在れば一覧の上に警告が出る (対照: 無ければ出ない)。
 *
 * ## ★ 一覧が届く前に CSV を選ぶと、重複の検出が丸ごと働かなかった (2026-09-21 · パス 384)
 *
 * `onImportFile` は比較の相手に画面の `entries` (= `useCollection` の**購読の写し**) を
 * 渡していた。一覧が IndexedDB から届く前は空なので `stored = 0` / `allStored = false` に
 * なり、**同じファイルを 2 度読んでも断られない**。実測 (固定回数の待ちを 0 周にして再現):
 * 画面は「2 件を取り込みました」だけを出し、総売上は重複を含んだ ￥1,100 になった ——
 * 断りの句も拒否も 1 文も出ない。**パス 126 が直した欠陥が読み込み順の窓から戻っていた。**
 *
 * 直しは比較の相手を `readSalesForImport()` (保管層の読み直し) にし、読めなければ
 * 「重複が無い」と混ぜずに断る。下の ★「一覧が届く前に」がその錠である。
 *
 * ## 待ちは回数ではなく条件で
 *
 * `mount(waitFor)` が錠を持ち、`pickCsv` は**選ぶだけ**で待たない (何が出るかは
 * `it` ごとに違う)。0 周でも落ちない形になっている。
 */
import 'fake-indexeddb/auto';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { SalesPage } from '../SalesPage';
import { _resetRecordStoreForTests, getRecordStore } from '../../data/store';
import { _resetCollectionSubscribersForTests } from '../../data/useCollection';
import { SALES_COLLECTION, type SalesEntry } from '../../data/sales';
import { salesToCsv } from '../../data/salesCsv';
import { waitForElement, waitForText } from '../../__tests__/jsdomWait';

beforeAll(() => {
  (globalThis as unknown as { serviceHub: unknown }).serviceHub = {
    getVersion: () => Promise.resolve('0.1.0-web'),
    listConfigured: () => Promise.resolve([]),
    fetchSnapshot: () => Promise.resolve({ ok: false, code: 'x', message: 'x' }),
    invoke: () => Promise.resolve({ ok: false, code: 'x', message: 'x' }),
    openExternal: () => Promise.resolve(),
    oauthSupported: () => Promise.resolve(false),
    setToken: () => Promise.resolve(),
    clearToken: () => Promise.resolve(),
  };
});

let container: HTMLDivElement;
let root: Root | null = null;

const text = (): string => (container.textContent ?? '').replace(/\s+/g, ' ');

/** 画面を描くだけ。**待たない** —— 一覧が届く前の窓を作るために使う。 */
async function mountNow(): Promise<void> {
  root = createRoot(container);
  await act(async () => {
    root!.render(createElement(SalesPage));
  });
}

/** 画面を描いて、`waitFor` が一覧に出るまで待つ (保管層の往復が済んだ印)。 */
async function mount(waitFor: string): Promise<void> {
  await mountNow();
  await waitForText(text, waitFor);
}

/**
 * 本物の `File` を選んだことにする (`importSizeGuard.test.ts` と同じ形)。
 * **選んだ後は待たない** —— 何が出るかは `it` ごとに違う (パス 378)。
 */
async function pickCsv(content: string): Promise<void> {
  const file = new File([content], 'sales.csv');
  Object.defineProperty(file, 'text', { value: vi.fn(async () => content) });
  const input = await waitForElement(
    () => container.querySelector('input[type="file"]'),
    'CSV の file input',
  );
  Object.defineProperty(input, 'files', { value: [file], configurable: true });
  await act(async () => {
    input.dispatchEvent(new Event('change', { bubbles: true }));
  });
}

const ROWS: SalesEntry[] = [
  { date: '2026-05-01', channel: 'amazon', amount: 200, orders: 2, note: 'セール' },
  { date: '2026-05-02', channel: 'shopify', amount: 300, orders: 1 },
];

async function countSales(): Promise<number> {
  return (await getRecordStore().list(SALES_COLLECTION)).length;
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

describe('売上集計 — 同じ CSV を 2 度読まない', () => {
  it('★ 全行が既存の記録と同じ内容の CSV は断られ、件数は増えない (手で足す道を言う)', async () => {
    for (const r of ROWS) await getRecordStore().insert(SALES_COLLECTION, r);
    await mount('セール');
    await pickCsv(salesToCsv(ROWS));
    await waitForText(text, 'この CSV の 2 行はすべて既に取り込まれている記録と同じ内容');
    await waitForText(text, '同じファイルを 2 度読んだと判断し、取り込みませんでした');
    expect(await countSales()).toBe(2);
    expect(text()).not.toContain('件を取り込みました');
  });

  it('★ 一覧が届く前に CSV を選んでも重複は断られる (購読の写しではなく保管層を読む)', async () => {
    for (const r of ROWS) await getRecordStore().insert(SALES_COLLECTION, r);
    // **待たずに描く。** これがこの `it` の前提 —— 一覧が既に出ていたら
    // 「写しを読んでいたら壊れる」形を再現できない。
    await mountNow();
    expect(text(), '一覧が既に描かれており、この it の前提が成り立たない').not.toContain('セール');
    await pickCsv(salesToCsv(ROWS));
    // 直す前はここで「2 件を取り込みました」が出て、総売上に重複が入った。
    await waitForText(text, '同じファイルを 2 度読んだと判断し、取り込みませんでした');
    expect(await countSales()).toBe(2);
    expect(text()).not.toContain('件を取り込みました');
  });

  it('一部だけ同じ CSV は取り込まれ、同じ内容の件数を言う (同じ内容の別の売上はありうる)', async () => {
    for (const r of ROWS) await getRecordStore().insert(SALES_COLLECTION, r);
    await mount('セール');
    await pickCsv(salesToCsv([ROWS[0]!, { date: '2026-05-03', channel: 'rakuten', amount: 400, orders: 1 }]));
    await waitForText(text, '2 件を取り込みました');
    await waitForText(text, 'うち 1 件は既存の記録と同じ内容です');
    expect(await countSales()).toBe(4);
  });

  it('★ 一覧が読めなければ取り込まず、理由を言う (「読めなかった」を「重複が無い」と混ぜない)', async () => {
    for (const r of ROWS) await getRecordStore().insert(SALES_COLLECTION, r);
    await mount('セール');
    // 保管層の読みを落とす。`useCollection` は読みが失敗しても `loading` を落として
    // `records` を `[]` のままにするので、**「空」と「読めなかった」は画面からは
    // 区別できない** —— だから判定の側が読み直し、読めなければ断る。
    const spy = vi.spyOn(getRecordStore(), 'list').mockRejectedValue(new Error('read failed'));
    try {
      await pickCsv(salesToCsv([{ date: '2026-05-03', channel: 'rakuten', amount: 400, orders: 1 }]));
      await waitForText(text, '売上の一覧を読めなかったため、処理を中止しました');
      expect(text()).not.toContain('件を取り込みました');
    } finally {
      spy.mockRestore();
    }
    // 読みを戻してから数える (件数の読みも同じ `list` を通る)。
    expect(await countSales()).toBe(2);
  });

  it('対照: 既存と重ならない CSV は従来どおり (件数の断りは無い)', async () => {
    for (const r of ROWS) await getRecordStore().insert(SALES_COLLECTION, r);
    await mount('セール');
    await pickCsv(salesToCsv([{ date: '2026-05-03', channel: 'rakuten', amount: 400, orders: 1 }]));
    await waitForText(text, '1 件を取り込みました');
    expect(await countSales()).toBe(3);
    expect(text()).not.toContain('既存の記録と同じ内容');
  });
});

describe('売上集計 — 同じ注文名の重複の警告', () => {
  it('★ 同じ注文名 (Shopify #1001) の記録が 2 件あれば、一覧の上で「2 度数えられている」と警告する', async () => {
    await getRecordStore().insert(SALES_COLLECTION, { date: '2026-05-01', channel: 'shopify', amount: 12000, orders: 1, note: 'Shopify #1001' });
    await getRecordStore().insert(SALES_COLLECTION, { date: '2026-05-02', channel: 'shopify', amount: 12000, orders: 1, note: 'Shopify #1001' });
    await mount('Shopify #1001');
    // 警告が出るまで待つ —— 待たずに探すと「まだ描かれていない」を
    // 「警告が無い」と読んでしまう (0 周で実測)。
    const alert = await waitForElement(
      () => Array.from(container.querySelectorAll('[role="alert"]')).find(
        (el) => (el.textContent ?? '').includes('重複'),
      ) ?? null,
      'role="alert" の重複の警告',
    );
    const t = (alert.textContent ?? '').replace(/\s+/g, ' ');
    expect(t).toContain('同じ注文名の記録が 1 組重複しており、売上高と受注件数に 2 度数えられています');
    expect(t).toContain('Shopify #1001 ×2');
  });

  it('対照: 注文名が違えば警告は出ない (同じ日・同じ額でも)', async () => {
    await getRecordStore().insert(SALES_COLLECTION, { date: '2026-05-01', channel: 'shopify', amount: 12000, orders: 1, note: 'Shopify #1001' });
    await getRecordStore().insert(SALES_COLLECTION, { date: '2026-05-01', channel: 'shopify', amount: 12000, orders: 1, note: 'Shopify #1002' });
    await mount('Shopify #1002');
    expect(text()).not.toContain('重複');
  });
});
