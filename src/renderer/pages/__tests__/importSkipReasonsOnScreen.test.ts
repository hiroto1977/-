/** @vitest-environment jsdom */
/**
 * **CSV の取り込みで飛ばした行は、行番号だけでなく理由を言う** (2026-09-27 · パス 496)。
 *
 * パス 496 で保存の書き手を画面と同じ読み方 (`readEntryNumber`) へ寄せ、**空欄の必須の欄は
 * 断る**と決めた (0 円として黙って入れない)。その結果、以前は通っていた CSV の行が
 * 飛ばされるようになりうる —— 表計算ソフトから書き出した CSV の空のセル、`1万` のような
 * 単位語、`1e3` の指数表記。
 *
 * ところが直す前の知らせは `2 件はスキップ (行 3, 4)` と**行番号だけ**だった。どの欄が・
 * なぜ読めなかったのかは書き手が文として返していたのに、画面が捨てていた。利用者は
 * 表計算ソフトで行を開いて自分で原因を探すしかない —— 空のセルと `1万` は見た目では
 * 読めてしまうので、見つけられないこともある。
 *
 * 直しは `skippedRowsDetail` (`data/importFile.ts`) 1 つで、両画面がそれを読む。
 * ここでは**実物の画面**に実物の File を渡し、書き手が返した理由がそのまま知らせに
 * 出ることを見る。期待値は同じ書き手を呼んで導く (文面を写すと、書き手の文を直した日に
 * この検査だけが古びる)。
 */
import 'fake-indexeddb/auto';
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { act, createElement, type ComponentType } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { SalesPage } from '../SalesPage';
import { KpiPage } from '../KpiPage';
import { getRecordStore } from '../../data/store';
import { _resetCollectionSubscribersForTests } from '../../data/useCollection';
import { SALES_COLLECTION } from '../../data/sales';
import { KPI_ACTUALS_COLLECTION } from '../../data/kpiActuals';
import { SALES_CSV_COLUMNS, salesFromCsv } from '../../data/salesCsv';
import { KPI_CSV_COLUMNS, kpiActualsFromCsv } from '../../data/kpiActualsCsv';
import { skippedRowsDetail } from '../../data/importFile';
import { resetRecordStore } from '../../__tests__/recordStoreHarness';
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

async function mount(component: ComponentType): Promise<void> {
  root = createRoot(container);
  await act(async () => {
    root!.render(createElement(component));
  });
}

beforeEach(async () => {
  await resetRecordStore();
  _resetCollectionSubscribersForTests();
  container = document.createElement('div');
  document.body.appendChild(container);
});

afterEach(async () => {
  if (root) {
    const r = root;
    root = null;
    await act(async () => {
      r.unmount();
    });
  }
  container.remove();
});

async function chooseFile(content: string, name: string): Promise<void> {
  const input = await waitForElement(
    () => container.querySelector<HTMLInputElement>('input[type="file"]'),
    'ファイルを選ぶ欄',
  );
  Object.defineProperty(input, 'files', { value: [new File([content], name)], configurable: true });
  await act(async () => {
    input.dispatchEvent(new Event('change', { bubbles: true }));
  });
}

/** 1 つのセル。区切りや引用符を含むなら引用符で囲む (表計算ソフトが書き出す形)。 */
function cell(v: string): string {
  return /[",\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

/** 列の名前 → 値 から 1 行を組む (列の並びは書き手の宣言から借りる)。 */
function csv(columns: readonly string[], rows: readonly Record<string, string>[]): string {
  return [columns.join(','), ...rows.map((r) => columns.map((c) => cell(r[c] ?? '')).join(','))].join('\r\n') + '\r\n';
}

const text = (): string => container.textContent ?? '';

describe('CSV の取り込み —— 飛ばした行の理由が画面に届く (パス 496)', () => {
  it('★ 売上: 空のセルと単位語の行を、書き手の理由つきで言う', async () => {
    const content = csv(SALES_CSV_COLUMNS, [
      { date: '2026-04-01', channel: 'amazon', amount: '1000', orders: '1', note: 'x' },
      { date: '2026-04-02', channel: 'amazon', amount: '', orders: '1', note: 'y' },
      { date: '2026-04-03', channel: 'amazon', amount: '1万', orders: '1', note: 'z' },
    ]);
    const parsed = salesFromCsv(content);
    expect(parsed.entries, '前提: 読める行は 1 つ').toHaveLength(1);
    expect(parsed.errors, '前提: 飛ばす行は 2 つ').toHaveLength(2);
    const detail = skippedRowsDetail(parsed.errors);
    // 理由が行番号だけになっていない (書き手の文が入っている) ことを先に確かめる。
    for (const e of parsed.errors) {
      expect(e.message.trim().length, `行 ${e.row} の理由が空`).toBeGreaterThan(0);
      expect(detail).toContain(`行 ${e.row}: ${e.message}`);
    }

    await mount(SalesPage);
    await chooseFile(content, 'sales.csv');
    await waitForText(text, detail);
    expect(await getRecordStore().count(SALES_COLLECTION)).toBe(1);
  });

  it('★ KPI 実績: 空の必須セルと指数表記の行を、書き手の理由つきで言う', async () => {
    const base = { unit: '全社', revenue: '1000', cogs: '100', advertising: '10', sga: '50', depreciation: '5' };
    const content = csv(KPI_CSV_COLUMNS, [
      { period: '2026-04', ...base },
      { period: '2026-05', ...base, cogs: '' },
      { period: '2026-06', ...base, revenue: '1e3' },
    ]);
    const parsed = kpiActualsFromCsv(content);
    expect(parsed.entries, '前提: 読める行は 1 つ').toHaveLength(1);
    expect(parsed.errors, '前提: 飛ばす行は 2 つ').toHaveLength(2);
    const detail = skippedRowsDetail(parsed.errors);
    for (const e of parsed.errors) {
      expect(e.message.trim().length, `行 ${e.row} の理由が空`).toBeGreaterThan(0);
      expect(detail).toContain(`行 ${e.row}: ${e.message}`);
    }

    await mount(KpiPage);
    await chooseFile(content, 'kpi.csv');
    await waitForText(text, detail);
    expect(await getRecordStore().count(KPI_ACTUALS_COLLECTION)).toBe(1);
  });

  it('対照: 全部読める CSV は飛ばした行を言わない', async () => {
    const content = csv(SALES_CSV_COLUMNS, [
      { date: '2026-04-01', channel: 'amazon', amount: '1,000', orders: '1', note: 'x' },
      { date: '2026-04-02', channel: 'amazon', amount: '１２００', orders: '2', note: 'y' },
    ]);
    expect(salesFromCsv(content).errors, '前提: 飛ばす行は無い').toHaveLength(0);
    await mount(SalesPage);
    await chooseFile(content, 'sales.csv');
    await waitForText(text, '2 件を取り込みました');
    expect(text()).not.toContain('スキップ');
    expect(await getRecordStore().count(SALES_COLLECTION)).toBe(2);
  });
});
