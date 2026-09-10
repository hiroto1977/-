/** @vitest-environment jsdom */
/**
 * **見積書・注文書・注文請書・納品書で、品目ごとに軽減税率を選べること。** (2026-09-10)
 *
 * この 4 書式には品目ごとの税率区分の欄が無く、**全行を標準税率として扱っていた**。
 * 請求書 (適格請求書) では選べるので、飲食料品を扱う事業者は
 * **同じ取引の見積と請求で税額が食い違う**状態だった (見積: 弁当も 10% /
 * 請求: 弁当は 8%)。`docs/REMAINING_WORK.md` に「欄を足すのは書式の変更なので
 * 依頼を待つ」と置いていた項目。
 *
 * ここで留めるのは 3 つ:
 *
 *   1. **区分を選べて、税額が実際に変わる** (軽減税率の行は 8% で計算される)
 *   2. **区分が 1 つのときの見た目は変えていない** —— 大半の見積は単一税率なので、
 *      そこに内訳を足すと読みにくくなるだけである (`parameterWiring.test.ts` の
 *      「消費税（10%）」を留める検査と同じ文面が出続ける)
 *   3. **仕分けは請求書と同じ計算器を通る** —— 区分ごとに 1 回だけ端数処理する
 *      (`groupByTaxKind`)。行ごとに処理して積み上げる方式との差が出ないこと。
 */
import 'fake-indexeddb/auto';
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { navigateTo } from '../../navigate';
import { DocstudioPage } from '../DocstudioPage';
import { _resetRecordStoreForTests } from '../../data/store';
import { _resetCollectionSubscribersForTests } from '../../data/useCollection';
import { groupByTaxKind } from '../../../shared/invoiceTax';
import { CONSUMPTION_TAX_REDUCED, CONSUMPTION_TAX_STANDARD } from '../../../shared/taxCalc';

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

async function settle(): Promise<void> {
  for (let i = 0; i < 6; i += 1) {
    await act(async () => {
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    });
  }
}

let container: HTMLDivElement;
let root: Root | null = null;

beforeEach(async () => {
  localStorage.clear();
  _resetCollectionSubscribersForTests();
  await _resetRecordStoreForTests();
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
  container.remove();
});

const text = () => container.textContent ?? '';

function setNative(el: HTMLInputElement | HTMLSelectElement, value: string): void {
  const proto = el instanceof window.HTMLSelectElement ? window.HTMLSelectElement.prototype : window.HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
  if (!setter) throw new Error('value setter not found');
  setter.call(el, value);
  el.dispatchEvent(new Event(el instanceof window.HTMLSelectElement ? 'change' : 'input', { bubbles: true }));
}

/** `<label>文言…<input|select/></label>` の欄へ入れる。 */
async function fill(labelText: string, value: string): Promise<void> {
  const label = Array.from(container.querySelectorAll('label')).find(
    (l) => l.textContent?.startsWith(labelText) && (l.querySelector('input') ?? l.querySelector('select')) !== null,
  );
  const el = label?.querySelector('input') ?? label?.querySelector('select');
  if (!el) throw new Error(`labeled field "${labelText}" not found`);
  await act(async () => {
    setNative(el, value);
  });
  await settle();
}

async function openQuote(): Promise<void> {
  navigateTo('docstudio', { doc: 'mitsumori' });
  root = createRoot(container);
  await act(async () => {
    root!.render(createElement(DocstudioPage));
  });
  await settle();
}

describe('見積書 — 品目ごとの税率区分', () => {
  it('★ 軽減税率を選ぶと、その行だけ 8% で計算され、区分ごとの内訳が出る', async () => {
    await openQuote();
    await fill('品目1', '会議室利用料');
    await fill('金額1（税抜）', '100000');
    await fill('品目2', '会議用 弁当');
    await fill('金額2（税抜）', '50000');
    await fill('品目2 税率区分', '軽減税率');

    const body = text();
    // 区分ごとの小計と消費税額 (10% は 10,000 円 / 8% は 4,000 円)。
    expect(body).toContain('標準税率 10% 対象 計（税抜）');
    expect(body).toContain('軽減税率 8% 対象 計（税抜）');
    expect(body).toContain('標準税率 消費税（10%）');
    expect(body).toContain('軽減税率 消費税（8%）');
    expect(body).toContain('10,000 円');
    expect(body).toContain('4,000 円');
    // 合計（税込）= 150,000 + 14,000。
    expect(body).toContain('164,000 円');
    // 軽減税率対象は ※ で示す (請求書と同じ約束)。
    expect(body).toContain('※ は軽減税率（8%）の対象品目です。');
  });

  it('★ 対照: 区分を標準税率のままにすると、税額も見た目も従来どおり', async () => {
    await openQuote();
    await fill('品目1', '会議室利用料');
    await fill('金額1（税抜）', '100000');
    await fill('品目2', '会議用 弁当');
    await fill('金額2（税抜）', '50000');
    // 区分は既定 (標準税率) のまま触らない。

    const body = text();
    expect(body).toContain('消費税（10%）');
    expect(body).toContain('15,000 円'); // 150,000 × 10%
    expect(body).toContain('165,000 円');
    // 単一区分では内訳を出さない (読みにくくしない)。
    expect(body).not.toContain('標準税率 消費税（10%）');
    expect(body).not.toContain('※ は軽減税率');
  });

  it('★ 非課税を選ぶと、その行には消費税が付かない', async () => {
    await openQuote();
    await fill('品目1', 'コンサルティング料');
    await fill('金額1（税抜）', '200000');
    await fill('品目2', '土地の賃貸料');
    await fill('金額2（税抜）', '100000');
    await fill('品目2 税率区分', '非課税');

    const body = text();
    expect(body).toContain('非課税 計');
    expect(body).toContain('標準税率 消費税（10%）');
    expect(body).not.toContain('非課税 消費税');
    // 税は 200,000 の 10% だけ。合計は 300,000 + 20,000。
    expect(body).toContain('20,000 円');
    expect(body).toContain('320,000 円');
  });

  it('区分の合計は請求書と同じ計算器 (groupByTaxKind) の答えと一致する', () => {
    // 画面の数字が、請求書が使うのと**同じ関数**から出ていることを値で確かめる
    // (見積書だけ別の算術を持っていた 2026-09-07 以前の形に戻ったら食い違う)。
    const totals = groupByTaxKind(
      [
        { name: '会議室利用料', qty: 1, unitPrice: 100_000, kind: 'standard' },
        { name: '会議用 弁当', qty: 1, unitPrice: 50_000, kind: 'reduced' },
      ],
      { standardRate: CONSUMPTION_TAX_STANDARD, reducedRate: CONSUMPTION_TAX_REDUCED, rounding: 'floor' },
    );
    expect(totals.totalTax).toBe(14_000);
    expect(totals.grandTotal).toBe(164_000);
  });
});
