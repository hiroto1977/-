/** @vitest-environment jsdom */
/**
 * 数値パラメータの**配線**の検査 — 「設定できるのに効かない」を止める。
 *
 * 台帳 (`shared/parameters.ts`) に載せた値ごとに、上書きを実物の record store
 * (fake-indexeddb) へ置いてから画面を描き、**画面の数字・文言が動く**ことを見る。
 * 既定のままの描画を対照に置く (上書きが効かなければ対照と同じ文になって落ちる)。
 */
import 'fake-indexeddb/auto';
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { act, createElement, type ComponentType } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { SERVICES } from '../../services';
import { TeamPage } from '../TeamPage';
import { RealEstatePage } from '../RealEstatePage';
import { TaxPage } from '../TaxPage';
import { _resetRecordStoreForTests, getRecordStore } from '../../data/store';
import { _resetCollectionSubscribersForTests } from '../../data/useCollection';
import { PARAMETER_OVERRIDES_COLLECTION } from '../../data/parameterOverrides';
import {
  HYDROPONICS_COLLECTION,
  HYDROPONICS_DEFAULTS,
  economicsFromSetup,
  type HydroponicsSetup,
} from '../../data/hydroponicsSetup';
import { DEFAULT_CROP_LIST } from '../../../shared/hydroponicCrops';
import { publicTransportCommute } from '../../../shared/payroll';
import { jpy } from '../../../shared/formatters';
import type { ParameterOverrides } from '../../../shared/parameters';

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

async function seed(overrides: ParameterOverrides): Promise<void> {
  await getRecordStore().insert(PARAMETER_OVERRIDES_COLLECTION, { values: { ...overrides } });
}

async function mount(page: ComponentType): Promise<void> {
  root = createRoot(container);
  await act(async () => {
    root!.render(createElement(page));
  });
  await settle();
}

async function unmount(): Promise<void> {
  if (root) {
    await act(async () => {
      root!.unmount();
    });
    root = null;
  }
}

const text = () => container.textContent ?? '';

/** ラベル → 値 の 2 段の枠 (Stat / Tile / stat) を読む。 */
function statValue(label: string): string {
  const tile = Array.from(container.querySelectorAll('div')).find(
    (d) => d.firstElementChild?.textContent === label && d.children.length >= 2,
  );
  if (!tile) throw new Error(`stat "${label}" not found`);
  return tile.children[1]!.textContent ?? '';
}

function tile(label: string): HTMLElement {
  const el = Array.from(container.querySelectorAll('div')).find(
    (d) => d.firstElementChild?.textContent === label && d.children.length >= 2,
  );
  if (!el) throw new Error(`tile "${label}" not found`);
  return el;
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
  await unmount();
  document.body.removeChild(container);
});

// --- 水耕栽培 (経営サマリー) ------------------------------------------------

const OverviewPage = SERVICES.find((s) => s.id === 'overview')!.page;

/** 低カリウムとして扱い、実測 100 mg/100g、切替 4 日で保存した設定。 */
const LOW_K_SETUP: HydroponicsSetup = {
  ...HYDROPONICS_DEFAULTS,
  lowPotassium: true,
  measuredPotassiumMgPer100g: 100,
  switchDaysBeforeHarvest: 4,
};

describe('水耕栽培 — 台帳の値が試算と文言に効く', () => {
  it('対照: 既定のままなら 7〜10 日・学会の上限・既定の日産', async () => {
    await getRecordStore().insert(HYDROPONICS_COLLECTION, LOW_K_SETUP);
    await mount(OverviewPage);
    expect(text()).toContain('収穫前 7〜10 日に');
    expect(text()).toContain('目安は 7〜10 日です'); // 4 日は範囲外
    expect(text()).toContain('G3b で 2,000 mg/日以下、G4 で 1,500 mg/日以下、G5 で 1,500 mg/日以下');
    expect(text()).toContain('（日本腎臓学会）');
    expect(statValue('G3b の方が食べられる量')).toBe('400 g'); // 2,000 × 20% ÷ 100 × 100
    expect(statValue('G4 の方が食べられる量')).toBe('300 g');
    const expected = economicsFromSetup(LOW_K_SETUP, DEFAULT_CROP_LIST)!;
    expect(text()).toContain(`日産 ${expected.production.shippedPlantsPerDay.toLocaleString('ja-JP')} 株`);
  });

  it('切替の目安・CKD の上限・稼働日数とパネル面積の上書きが画面に出る', async () => {
    await getRecordStore().insert(HYDROPONICS_COLLECTION, LOW_K_SETUP);
    await seed({
      'hydroponics.lowKSwitchDaysMin': 3,
      'hydroponics.lowKSwitchDaysMax': 5,
      'hydroponics.ckdPotassiumLimitG3b': 1000,
      'hydroponics.ckdPotassiumLimitG4': 800,
      'hydroponics.ckdPotassiumLimitG5': 600,
      'hydroponics.daysPerYear': 100,
      'hydroponics.panelAreaSqm': 1,
    });
    await mount(OverviewPage);
    expect(text()).toContain('収穫前 3〜5 日に');
    expect(text()).toContain('目安 3〜5 日の範囲内'); // 4 日が範囲内になった
    expect(text()).toContain('G3b で 1,000 mg/日以下、G4 で 800 mg/日以下、G5 で 600 mg/日以下');
    expect(text()).toContain('設定画面で上書きした値');
    expect(text()).not.toContain('（日本腎臓学会）');
    expect(statValue('G3b の方が食べられる量')).toBe('200 g'); // 1,000 × 20% ÷ 100 × 100
    expect(statValue('G4 の方が食べられる量')).toBe('160 g');
    const expected = economicsFromSetup(LOW_K_SETUP, DEFAULT_CROP_LIST, { panelAreaSqm: 1, daysPerYear: 100 })!;
    const control = economicsFromSetup(LOW_K_SETUP, DEFAULT_CROP_LIST)!;
    expect(expected.production.shippedPlantsPerDay).not.toBe(control.production.shippedPlantsPerDay);
    expect(text()).toContain(`日産 ${expected.production.shippedPlantsPerDay.toLocaleString('ja-JP')} 株`);
    expect(text()).not.toContain(`日産 ${control.production.shippedPlantsPerDay.toLocaleString('ja-JP')} 株`);
  });

  it('比較基準と換算係数の上書きが削減率と食塩相当量に効く', async () => {
    await getRecordStore().insert(HYDROPONICS_COLLECTION, { ...LOW_K_SETUP, measuredSodiumMgPer100g: 500 });
    await seed({ 'hydroponics.referenceLettucePotassiumMg': 400, 'hydroponics.saltEquivalentFactor': 2 });
    await mount(OverviewPage);
    // 通常品 400 比 −75%、食塩相当量 500 × 2 ÷ 1000 = 1.00 g。
    expect(tile('実測カリウム').textContent).toContain('通常品 400 mg/100g 比 −75.0%');
    expect(statValue('食塩相当量')).toBe('1.00 g/100g');
  });
});

// --- 給与 (チーム) -----------------------------------------------------------

describe('給与 — 通勤手当の非課税限度', () => {
  it('対照: 既定の 15 万円で分ける', async () => {
    await mount(TeamPage);
    const pt = publicTransportCommute(160_000);
    expect(statValue('公共交通: 非課税')).toBe(jpy(pt.nonTaxable));
    expect(statValue('公共交通: 課税(超過)')).toBe(jpy(pt.taxable));
    expect(text()).toContain(`公共交通機関の非課税限度は月 ${jpy(150_000)}`);
  });

  it('上書きした限度で分け、文言もその額を言う', async () => {
    await seed({ 'payroll.commutePublicTransportCap': 100_000 });
    await mount(TeamPage);
    expect(statValue('公共交通: 非課税')).toBe(jpy(100_000));
    expect(statValue('公共交通: 課税(超過)')).toBe(jpy(60_000));
    expect(text()).toContain(`公共交通機関の非課税限度は月 ${jpy(100_000)}`);
    expect(text()).not.toContain(`月 ${jpy(150_000)}`);
  });
});

// --- 不動産 (DSCR) ------------------------------------------------------------

const GREEN = 'rgb(34, 197, 94)';
const RED = 'rgb(239, 68, 68)';

describe('不動産 — DSCR の判定しきい値', () => {
  it('対照: 既定 (1.0 / 1.2) では初期値の DSCR 0.88 は危険水域 (赤)', async () => {
    await mount(RealEstatePage);
    expect(statValue('DSCR')).toBe('0.88');
    expect(text()).toContain('1.0 未満は危険水域');
    expect(text()).toContain('1.2 以上が目安');
    expect((tile('DSCR').children[1] as HTMLElement).style.color).toBe(RED);
  });

  it('しきい値を下げれば同じ 0.88 が健全 (緑) になり、文言もその値を言う', async () => {
    await seed({ 'realEstate.dscrDangerThreshold': 0.5, 'realEstate.dscrCautionThreshold': 0.8 });
    await mount(RealEstatePage);
    expect(statValue('DSCR')).toBe('0.88');
    expect(text()).toContain('0.5 未満は危険水域');
    expect(text()).toContain('0.8 以上が目安');
    expect((tile('DSCR').children[1] as HTMLElement).style.color).toBe(GREEN);
  });
});

// --- 税 (消費税率) -------------------------------------------------------------

describe('税 — 消費税率', () => {
  it('対照: 既定は 10% / 8%', async () => {
    await mount(TaxPage);
    expect(text()).toContain('消費税 (10%)');
    expect(text()).toContain('軽減税率 (8%)');
  });

  it('上書きした率で計算し、% の表示も動く', async () => {
    await seed({ 'tax.consumptionStandardRate': 0.12, 'tax.consumptionReducedRate': 0.05 });
    await mount(TaxPage);
    expect(text()).toContain('消費税 (12%)');
    expect(text()).toContain('軽減税率 (5%)');
    expect(text()).not.toContain('消費税 (10%)');
    // 軽減にすると 5% の表示に切り替わる。
    const box = Array.from(container.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')).find((el) =>
      el.parentElement?.textContent?.includes('軽減税率'),
    );
    if (!box) throw new Error('軽減税率 checkbox not found');
    await act(async () => {
      box.click();
    });
    await settle();
    expect(text()).toContain('消費税 (5%)');
  });
});
