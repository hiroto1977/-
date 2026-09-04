/** @vitest-environment jsdom */
/**
 * 経営サマリー → 金融機関等提出用の書面。**実物の record store** (fake-indexeddb) を通して、
 * ボタンで書面が開き、数字が千円単位・△ で並び、書式の選択と提出者情報が保存されて
 * 読み直しても残ること、印刷の入口が書面だけを出す印を付けることを確かめる。
 */
import 'fake-indexeddb/auto';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { SERVICES } from '../../services';
import { _resetRecordStoreForTests, getRecordStore } from '../../data/store';
import { _resetCollectionSubscribersForTests } from '../../data/useCollection';
import { KPI_ACTUALS_COLLECTION, type KpiActual } from '../../data/kpiActuals';
import { BALANCE_SHEET_COLLECTION, type BalanceSheet } from '../../data/balanceSheet';
import { BANK_SUBMISSION_COLLECTION, type BankSubmissionSettings } from '../../data/bankSubmission';

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

const KPI: KpiActual = {
  period: '2026-04', unit: '全社', revenue: 12_345_678, cogs: 5_000_000, advertising: 1_000_000, sga: 8_000_000, depreciation: 200_000,
};
const BS: BalanceSheet = {
  asOf: '2026-03-31', currentAssets: 8_000_000, cash: 3_000_000, inventory: 1_000_000, accountsReceivable: 2_000_000,
  fixedAssets: 4_000_000, currentLiabilities: 5_000_000, accountsPayable: 1_500_000, fixedLiabilities: 3_000_000, netIncome: 600_000,
};

function setNative(el: HTMLInputElement | HTMLSelectElement, value: string, event: 'input' | 'change'): void {
  const proto = el instanceof HTMLSelectElement ? window.HTMLSelectElement.prototype : window.HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
  if (!setter) throw new Error('value setter not found');
  setter.call(el, value);
  el.dispatchEvent(new Event(event, { bubbles: true }));
}

async function settle(): Promise<void> {
  for (let i = 0; i < 8; i += 1) {
    await act(async () => {
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    });
  }
}

let container: HTMLDivElement;
let root: Root | null = null;

async function mountOverview(): Promise<void> {
  const def = SERVICES.find((s) => s.id === 'overview');
  if (!def) throw new Error('overview service missing');
  root = createRoot(container);
  await act(async () => {
    root!.render(createElement(def.page));
  });
  await settle();
}

async function unmountOverview(): Promise<void> {
  if (root) {
    await act(async () => {
      root!.unmount();
    });
    root = null;
  }
}

const q = {
  button: (text: string) => {
    const b = Array.from(container.querySelectorAll('button')).find((el) => el.textContent === text);
    if (!b) throw new Error(`button "${text}" not found`);
    return b;
  },
  select: (label: string) => container.querySelector<HTMLSelectElement>(`select[aria-label="${label}"]`)!,
  input: (label: string) => container.querySelector<HTMLInputElement>(`input[aria-label="${label}"]`)!,
  sheet: () => container.querySelector<HTMLElement>('.bank-sheet'),
  /** 節の表から「項目 → 数値」を読む。 */
  cell: (label: string): string | null => {
    for (const tr of Array.from(container.querySelectorAll('.bank-table tbody tr'))) {
      const tds = tr.querySelectorAll('td');
      if (tds[0]?.textContent === label) return tds[1]?.textContent ?? null;
    }
    return null;
  },
};

async function click(el: HTMLElement): Promise<void> {
  await act(async () => {
    el.click();
  });
  await settle();
}

async function openSheet(): Promise<void> {
  await mountOverview();
  await click(q.button('金融機関等提出用の書式で表示'));
}

async function savedSettings(): Promise<readonly BankSubmissionSettings[]> {
  const list = await getRecordStore().list<BankSubmissionSettings>(BANK_SUBMISSION_COLLECTION);
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
  await getRecordStore().insert(KPI_ACTUALS_COLLECTION, KPI);
  await getRecordStore().insert(BALANCE_SHEET_COLLECTION, BS);
  container = document.createElement('div');
  document.body.appendChild(container);
});

afterEach(async () => {
  await unmountOverview();
  document.body.removeChild(container);
  document.body.classList.remove('ds-printing');
});

describe('経営サマリー — 金融機関等提出用の書面', () => {
  it('ボタンで書面が開き、千円単位・△・和暦で並ぶ。戻ると経営サマリーに戻る', async () => {
    await mountOverview();
    expect(q.sheet()).toBeNull();
    expect(container.textContent).toContain('経営サマリー — ');
    await click(q.button('金融機関等提出用の書式で表示'));
    const sheet = q.sheet();
    expect(sheet).not.toBeNull();
    expect(sheet!.textContent).toContain('金融機関等提出用');
    expect(sheet!.textContent).toContain('（単位：千円）');
    expect(q.cell('売上高')).toBe('12,345');
    expect(q.cell('営業利益')).toMatch(/^△[\d,]+$/);
    expect(q.cell('総資産')).toBe('12,000');
    expect(q.cell('自己資本比率')).toBe('33.3%');
    expect(sheet!.textContent).toMatch(/作成日令和\d+年\d+月\d+日/);
    expect(sheet!.textContent).toContain('貸借対照表 基準日令和8年3月31日');
    expect(sheet!.textContent).toContain('上記のとおり相違ありません。');
    // 経営サマリーの他の節は書面の間は出ない (印刷しても紙に混ざらない)
    expect(container.textContent).not.toContain('経営スコアカード — ');
    await click(q.button('経営サマリーへ戻る'));
    expect(q.sheet()).toBeNull();
    expect(container.textContent).toContain('経営サマリー — ');
  });

  it('表示単位を円にすると数字が桁ごと変わり、保存されて読み直しても残る', async () => {
    await openSheet();
    expect(q.cell('売上高')).toBe('12,345');
    await act(async () => { setNative(q.select('表示単位'), 'yen', 'change'); });
    await settle();
    expect(q.cell('売上高')).toBe('12,345,678');
    expect(q.sheet()!.textContent).toContain('（単位：円）');
    const saved = await savedSettings();
    expect(saved).toHaveLength(1);
    expect(saved[0]!.format.unit).toBe('yen');
    await act(async () => { setNative(q.select('負数の表記'), 'minus', 'change'); });
    await settle();
    expect(q.cell('営業利益')).toMatch(/^-[\d,]+$/);
    expect((await savedSettings()).length).toBe(2);
    // 読み直し: 描き直しても最後に保存した書式 (円・マイナス) で出る
    await unmountOverview();
    await openSheet();
    expect(q.cell('売上高')).toBe('12,345,678');
    expect(q.select('表示単位').value).toBe('yen');
    expect(q.select('負数の表記').value).toBe('minus');
  });

  it('年号を西暦にすると日付が変わる', async () => {
    await openSheet();
    await act(async () => { setNative(q.select('年号'), 'seireki', 'change'); });
    await settle();
    expect(q.sheet()!.textContent).toContain('貸借対照表 基準日2026年3月31日');
    expect(q.sheet()!.textContent).not.toContain('令和');
  });

  it('提出者情報を保存すると書面の頭と末尾に載り、読み直しても残る。読めない決算期は断る', async () => {
    await openSheet();
    expect(q.sheet()!.textContent).toContain('商号―');
    await act(async () => { setNative(q.input('商号'), '株式会社テスト', 'input'); });
    await act(async () => { setNative(q.input('代表者'), '代表取締役 山田 太郎', 'input'); });
    await act(async () => { setNative(q.input('決算期'), '2026/03', 'input'); });
    await click(q.button('提出者情報を保存'));
    expect(container.querySelector('[role="alert"]')?.textContent).toContain('決算期は');
    expect(await savedSettings()).toHaveLength(0);
    await act(async () => { setNative(q.input('決算期'), '2026-03', 'input'); });
    await click(q.button('提出者情報を保存'));
    expect(container.querySelector('[role="alert"]')).toBeNull();
    expect(container.querySelector('[role="status"]')?.textContent).toContain('保存しました');
    const text = q.sheet()!.textContent ?? '';
    expect(text).toContain('商号株式会社テスト');
    expect(text).toContain('決算期令和8年3月期');
    expect(text).toContain('代表者代表取締役 山田 太郎印');
    const saved = await savedSettings();
    expect(saved).toHaveLength(1);
    expect(saved[0]!.profile).toEqual({ companyName: '株式会社テスト', representative: '代表取締役 山田 太郎', address: '', fiscalYearEnd: '2026-03' });
    await unmountOverview();
    await openSheet();
    expect(q.sheet()!.textContent).toContain('商号株式会社テスト');
    expect(q.input('商号').value).toBe('株式会社テスト');
  });

  it('印刷は書面だけを出す印を付けて window.print を呼び、afterprint で外す', async () => {
    await openSheet();
    let markedWhilePrinting: boolean | null = null;
    const original = window.print;
    (window as unknown as { print: () => void }).print = vi.fn(() => {
      markedWhilePrinting = document.body.classList.contains('ds-printing');
    });
    try {
      await click(q.button('印刷 / PDF に保存'));
      expect(window.print).toHaveBeenCalledTimes(1);
      expect(markedWhilePrinting).toBe(true);
      window.dispatchEvent(new Event('afterprint'));
      expect(document.body.classList.contains('ds-printing')).toBe(false);
    } finally {
      (window as unknown as { print: () => void }).print = original;
    }
  });
});
