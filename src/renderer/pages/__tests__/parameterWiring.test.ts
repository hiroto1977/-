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
import { EmotionsPage } from '../EmotionsPage';
import { MutualFundsPage } from '../MutualFundsPage';
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
import { calcIncomeTax, calcNetSalary, calcResidentTax } from '../../../shared/taxCalc';
import { DEFAULT_SOCIAL_INSURANCE_RATES, calcSocialInsurance } from '../../../shared/taxSocialInsurance';
import { calcFixedAssetTaxTotal } from '../../../shared/taxFixedAsset';
import { calcCapitalGainsTax, DEFAULT_CAPITAL_GAINS_PARAMS } from '../../../shared/taxCapitalGains';
import { compareBusinessTaxMethods, DEFAULT_BUSINESS_CONSUMPTION_PARAMS } from '../../../shared/taxConsumptionBusiness';
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

/** React の onChange を発火させる (native setter を通さないと React が拾わない)。 */
function changeInput(input: HTMLInputElement, value: string): void {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
  if (!setter) throw new Error('HTMLInputElement value setter not found');
  setter.call(input, value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
}

/**
 * `<label>文言<input/></label>` の形の欄に入れる (税ページ ③ の入力欄)。同じ文言の
 * ラベルが ② にもある (そちらは input を子に持たない) ので、input を内包する物を選ぶ。
 */
async function typeIntoLabeled(labelText: string, value: string): Promise<void> {
  const label = Array.from(container.querySelectorAll('label')).find(
    (l) => l.textContent?.startsWith(labelText) && l.querySelector('input') !== null,
  );
  const input = label?.querySelector('input');
  if (!input) throw new Error(`labeled input "${labelText}" not found`);
  await act(async () => {
    changeInput(input, value);
  });
  await settle();
}

/** ラベル → 値 の 2 段の枠 (Stat / Tile / stat) を読む。 */
function statValue(label: string): string {
  // 値の枠は要素を子に持たない — 見出しだけ同じ注記の div (<strong> を含む) を掴まないため。
  const tile = Array.from(container.querySelectorAll('div')).find(
    (d) => d.firstElementChild?.textContent === label && d.children.length >= 2 && d.children[1]!.children.length === 0,
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

  it('対照: 所得税・住民税・手取りの既定 (復興税 2.1% / 所得割 10% / 均等割 5,000 / 社保概算 15%)', async () => {
    await mount(TaxPage);
    expect(statValue('所得税 (速算表 + 復興税2.1%)')).toBe(jpy(calcIncomeTax(5_000_000)));
    expect(statValue('住民税 (所得割10% + 均等割)')).toBe(jpy(calcResidentTax(5_000_000)));
    expect(text()).toContain('均等割5,000円の内訳');
    expect(text()).toContain('(約15%)');
    expect(statValue('手取り (年)')).toBe(jpy(calcNetSalary(6_000_000).takeHome));
    expect(text()).toContain(`厚生年金 ${jpy(calcSocialInsurance(6_000_000).pension)}`);
  });

  it('復興税・住民税の自治体の値・社保概算率・厚生年金料率の上書きが計算と文言に出る', async () => {
    await seed({
      'incomeTax.reconstructionSurtaxRate': 0,
      'residentTax.incomeRate': 0.05,
      'residentTax.perCapita': 6_000,
      'incomeTax.socialInsuranceEstimateRate': 0.2,
      'socialInsurance.pensionRate': 0.1,
    });
    await mount(TaxPage);
    expect(statValue('所得税 (速算表 + 復興税0%)')).toBe(jpy(calcIncomeTax(5_000_000, 0)));
    expect(statValue('住民税 (所得割5% + 均等割)')).toBe(jpy(calcResidentTax(5_000_000, { incomeRate: 0.05, perCapita: 6_000 })));
    expect(text()).toContain(`均等割は設定 › 数値パラメータ の値 ${jpy(6_000)}`);
    expect(text()).not.toContain('均等割5,000円の内訳');
    expect(text()).toContain('(約20%)');
    const net = calcNetSalary(6_000_000, undefined, {
      socialInsuranceRate: 0.2,
      surtaxRate: 0,
      resident: { incomeRate: 0.05, perCapita: 6_000 },
    });
    expect(net.takeHome).not.toBe(calcNetSalary(6_000_000).takeHome);
    expect(statValue('手取り (年)')).toBe(jpy(net.takeHome));
    const si = calcSocialInsurance(6_000_000, false, { ...DEFAULT_SOCIAL_INSURANCE_RATES, pensionRate: 0.1 });
    expect(si.pension).not.toBe(calcSocialInsurance(6_000_000).pension);
    expect(text()).toContain(`厚生年金 ${jpy(si.pension)}`);
  });

  it('所得控除・税額控除: 人的控除差の底が調整控除に、配当割の源泉率が控除額と文言に効く', async () => {
    // 調整控除は課税所得 200 万以下で min(人的控除差, 課税所得) × 5%。既定の年収 600 万では
    // 課税所得が 200 万を超えて下限 2,500 円に張り付き、差を変えても動かない — 年収 300 万にして見る。
    await mount(TaxPage);
    await typeIntoLabeled('額面年収 (円)', '3000000');
    const residentByDefault = statValue('住民税 (税額控除後)');
    expect(text()).toContain('(配当×5%)');
    expect(text()).toContain('小規模企業共済 (年・上限¥840,000)');
    await unmount();

    await seed({ 'deduction.basicHumanDeductionDiff': 100_000, 'credit.residentLevyWithholdingRate': 0.1, 'deduction.smallBizMutualAnnualCap': 900_000 });
    await mount(TaxPage);
    await typeIntoLabeled('額面年収 (円)', '3000000');
    // 差が 5 万 → 10 万で調整控除が 2,500 → 5,000 円になり、住民税がその分減る。
    const toNumber = (s: string) => Number(s.replace(/[^0-9-]/g, ''));
    expect(toNumber(statValue('住民税 (税額控除後)'))).toBe(toNumber(residentByDefault) - 2_500);
    expect(text()).toContain('(配当×10%)');
    expect(text()).toContain(`配当割控除 約${jpy(100_000)}`); // 配当 100 万 × 10%
    expect(text()).toContain('小規模企業共済 (年・上限¥900,000)');
  });

  it('不動産・登記・印紙・譲渡: 対照 (既定の率・免税点・特例)', async () => {
    await mount(TaxPage);
    const fa = calcFixedAssetTaxTotal({ assessedValue: 30_000_000, areaSqm: 200, dwellings: 1 });
    expect(statValue('固定資産税 (1.4%)')).toBe(jpy(fa.fixedAssetTax));
    expect(statValue('都市計画税 (0.3%)')).toBe(jpy(fa.cityPlanningTax));
    expect(text()).toContain('本則4%、土地・住宅は軽減3%');
    expect(statValue('適用税率')).toBe('3.0%');
    expect(statValue('適用税率 (本則)')).toBe('2.0%');
    expect(statValue('登録免許税')).toBe(jpy(400_000)); // 2,000 万 × 2%
    expect(text()).toContain('概算取得費5%');
    expect(text()).toContain('居住用財産 (¥30,000,000控除+軽減税率)');
    const cg = calcCapitalGainsTax(50_000_000, 30_000_000, 2_000_000, 'real-estate-long');
    expect(statValue('所得税 (譲渡所得)')).toBe(jpy(cg.incomeTax));
  });

  it('不動産・登記・印紙・譲渡: 率・免税点・特例・付加率の上書きが計算と文言に出る', async () => {
    await seed({
      'fixedAsset.standardRate': 0.02,
      'fixedAsset.cityPlanningRate': 0.002,
      'acquisition.reducedRate': 0.02,
      'registration.rateTransferSale': 0.015,
      'stamp.continuousBasicContractDuty': 5_000,
      'capitalGains.estimatedAcquisitionCostRate': 0.1,
      'capitalGains.residentialSpecialDeduction': 10_000_000,
      'incomeTax.reconstructionSurtaxRate': 0,
    });
    await mount(TaxPage);
    const fa = calcFixedAssetTaxTotal({ assessedValue: 30_000_000, areaSqm: 200, dwellings: 1, fixedRate: 0.02, cityPlanningRate: 0.002 });
    expect(statValue('固定資産税 (2%)')).toBe(jpy(fa.fixedAssetTax));
    expect(statValue('都市計画税 (0.2%)')).toBe(jpy(fa.cityPlanningTax));
    expect(text()).toContain('本則4%、土地・住宅は軽減2%');
    expect(statValue('適用税率')).toBe('2.0%');
    expect(statValue('適用税率 (本則)')).toBe('1.5%');
    expect(statValue('登録免許税')).toBe(jpy(300_000)); // 2,000 万 × 1.5%
    expect(text()).toContain('概算取得費10%');
    expect(text()).toContain('居住用財産 (¥10,000,000控除+軽減税率)');
    // 付加率 0 は譲渡所得の所得税にも効く (所得税の項と共有)。
    const cg = calcCapitalGainsTax(50_000_000, 30_000_000, 2_000_000, 'real-estate-long', { ...DEFAULT_CAPITAL_GAINS_PARAMS, surtaxRate: 0 });
    expect(cg.incomeTax).not.toBe(calcCapitalGainsTax(50_000_000, 30_000_000, 2_000_000, 'real-estate-long').incomeTax);
    expect(statValue('所得税 (譲渡所得)')).toBe(jpy(cg.incomeTax));
    // 印紙税: 第 7 号文書に切り替えると一律額が台帳の値になる。
    const select = Array.from(container.querySelectorAll('select')).find((el) =>
      Array.from(el.options).some((o) => o.value === 'continuousBasicContract'),
    );
    if (!select) throw new Error('stamp document select not found');
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value')?.set;
      setter?.call(select, 'continuousBasicContract');
      select.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await settle();
    expect(statValue('印紙税額')).toBe(jpy(5_000));
  });

  it('事業者の消費税: 税率・2 割特例の割合・境目の上書きが ⑩ の 3 方式と文言に出る', async () => {
    await mount(TaxPage);
    const control = compareBusinessTaxMethods(
      [{ type: 'service', sales: { standard: 8_000_000, reduced: 0 } }],
      { standard: 3_000_000, reduced: 0 },
    );
    expect(statValue('2割特例')).toBe(jpy(control.twentyPercent));
    expect(text()).toContain('簡易課税は基準期間の課税売上¥50,000,000以下');
    expect(text()).toContain('課税売上が¥10,000,000以下です');
    await unmount();

    await seed({
      'tax.consumptionStandardRate': 0.12,
      'consumptionBusiness.twentyPercentRate': 0.3,
      'consumptionBusiness.exemptionThreshold': 20_000_000,
      'consumptionBusiness.simplifiedEligibilityThreshold': 60_000_000,
    });
    await mount(TaxPage);
    const p = {
      ...DEFAULT_BUSINESS_CONSUMPTION_PARAMS,
      rates: { standard: 0.12, reduced: 0.08 },
      twentyPercentRate: 0.3,
      exemptionThreshold: 20_000_000,
      simplifiedEligibilityThreshold: 60_000_000,
    };
    const seeded = compareBusinessTaxMethods(
      [{ type: 'service', sales: { standard: 8_000_000, reduced: 0 } }],
      { standard: 3_000_000, reduced: 0 },
      p,
    );
    expect(seeded.twentyPercent).not.toBe(control.twentyPercent);
    expect(statValue('2割特例')).toBe(jpy(seeded.twentyPercent));
    expect(statValue('本則課税')).toBe(jpy(seeded.standard));
    expect(text()).toContain('簡易課税は基準期間の課税売上¥60,000,000以下');
    expect(text()).toContain('課税売上が¥20,000,000以下です');
  });

  /**
   * ⑩-3 の全額控除の要件は**台帳に載っているのに、ここで留められていなかった**。
   * 2026-09-06 の実測では、判定 (`canDeductFully`) は上書きされた値で行いながら、
   * 説明文と ⚠ 警告は**モジュールの既定定数を刷っていた** —— 割合の境目を 90% に
   * した利用者に、90% で発火した警告が「割合 95% 未満」と言う状態。
   */
  it('消費税 (事業者): 全額控除の要件の上書きが ⑩-3 の文言と判定の両方に出る', async () => {
    await mount(TaxPage);
    expect(text()).toContain('課税売上割合 95% 以上');
    expect(text()).toContain('課税売上高 ¥500,000,000 以下');
    await unmount();

    await seed({
      'consumptionBusiness.fullCreditRatioThreshold': 0.6,
      'consumptionBusiness.fullCreditSalesThreshold': 300_000_000,
    });
    await mount(TaxPage);
    expect(text()).toContain('課税売上割合 60% 以上');
    expect(text()).toContain('課税売上高 ¥300,000,000 以下');
    // 既定の入力 (課税 800 万 + 免税 0 / 非課税 200 万) の割合は 80% —— 既定の 95% では
    // 満たさないが、60% に緩めると**満たす**。文言だけでなく判定も動く。
    expect(text()).toContain('全額控除の要件を満たします');
    expect(text()).not.toContain('全額控除の要件を満たしません');
  });

  it('年金・一時所得・ふるさと納税・貿易: 上書きが計算と文言に出る', async () => {
    await mount(TaxPage);
    expect(statValue('課税所得への算入額 (×1/2)')).toBe(jpy(250_000)); // (300 万 − 200 万 − 50 万) ÷ 2
    expect(statValue('公的年金等控除')).toBe(jpy(1_100_000));
    expect(text()).toContain('自己負担¥2,000');
    expect(text()).toContain('寄附先5自治体以内');
    expect(text()).toContain('国税 7.8% (軽減 6.24%)');
    expect(text()).toContain('¥10,000以下の輸入');
    await unmount();

    await seed({
      'casual.specialDeduction': 300_000,
      'pension.deductionMinOver65': 1_200_000,
      'furusato.selfPay': 3_000,
      'furusato.oneStopMaxMunicipalities': 3,
      'trade.nationalStandardRate': 0.1,
      'trade.smallValueLimit': 20_000,
      'trade.personalUseFactor': 0.5,
    });
    await mount(TaxPage);
    expect(statValue('課税所得への算入額 (×1/2)')).toBe(jpy(350_000)); // (300 万 − 200 万 − 30 万) ÷ 2
    expect(text()).toContain('特別控除¥300,000');
    expect(statValue('公的年金等控除')).toBe(jpy(1_200_000));
    expect(text()).toContain('最低¥1,200,000');
    expect(text()).toContain('自己負担¥3,000');
    expect(text()).toContain('寄附先3自治体以内');
    expect(text()).toContain('国税 10% (軽減 6.24%)');
    expect(text()).toContain('小売価格の50%で計算');
    expect(text()).toContain('¥20,000以下の輸入');
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

// --- 敷地計画 (建築基準法) と水循環 (排水基準) — 不動産ページ -----------------

describe('敷地計画 (建築基準法) と水循環 (排水基準) — 台帳の値が試算と文言に効く', () => {
  it('対照: 既定の勾配 1.5・乗数 6/10・角地 +10・12m 未満・基準 120/16・地下水 10', async () => {
    await mount(RealEstatePage);
    // 初期値 (道路 6 m・後退 1.5 m・その他・高さ 12.1 m): 限度 = (6 + 3) × 1.5。
    expect(statValue('道路斜線の高さ限度')).toBe('13.5 m');
    expect(text()).toContain('商業系ほか (6/10)');
    expect(text()).toContain('角地 (+10%)');
    expect(text()).toContain('前面道路 12m 未満');
    // 濃縮廃液の初期値 (全窒素 400 mg/L) ÷ 地下水基準 10。
    expect(statValue('地下水基準比 (硝酸性N)')).toBe('40倍');
    expect(text()).toContain('全窒素 120mg/L・全りん 16mg/L');
  });

  it('勾配・乗数・緩和・幅員の上限・排水基準の上書きが数字と文言に出る', async () => {
    await seed({
      'zoning.roadSlopeOther': 2,
      'zoning.roadFarMultiplierOther': 50,
      'zoning.cornerLotBonusPct': 15,
      'zoning.roadFarWidthThresholdM': 15,
      'effluent.groundwaterNitrateNMgL': 20,
      'effluent.tnUniformMgL': 200,
    });
    await mount(RealEstatePage);
    expect(statValue('道路斜線の高さ限度')).toBe('18 m'); // (6 + 3) × 2
    expect(text()).toContain('商業系ほか (5/10)');
    expect(text()).not.toContain('商業系ほか (6/10)');
    expect(text()).toContain('角地 (+15%)');
    expect(text()).toContain('前面道路 15m 未満');
    expect(statValue('地下水基準比 (硝酸性N)')).toBe('20倍');
    expect(text()).toContain('全窒素 200mg/L・全りん 16mg/L');
  });
});

// --- 財務診断 (経営サマリーの財務分析) ----------------------------------------

describe('財務診断 — 台帳の下限と水準が経営サマリーの格付けと総合スコアに効く', () => {
  const summary = () => /([SABCD])総合 (\d+)\/100/.exec(text());

  it('対照: 既定では格付けと総合スコアが出る (全軸 0 点ではない)', async () => {
    await mount(OverviewPage);
    const m = summary();
    expect(m).not.toBeNull();
    expect(Number(m![2])).toBeGreaterThan(0);
  });

  it('格付けの下限を全部 100 にすると D になる', async () => {
    await seed({ 'financeHealth.gradeSMin': 100, 'financeHealth.gradeAMin': 100, 'financeHealth.gradeBMin': 100, 'financeHealth.gradeCMin': 100 });
    await mount(OverviewPage);
    expect(summary()![1]).toBe('D');
  });

  it('格付けの下限を全部 0 にすると S になる', async () => {
    await seed({ 'financeHealth.gradeSMin': 0, 'financeHealth.gradeAMin': 0, 'financeHealth.gradeBMin': 0, 'financeHealth.gradeCMin': 0 });
    await mount(OverviewPage);
    expect(summary()![1]).toBe('S');
  });

  it('レーダーの水準で全 15 軸を 0 点にすると総合 0 / D になる', async () => {
    // 0 点の水準を範囲の上端の手前、100 点を上端に置く: 実測値はどれも上端に届かないので全軸 0 点。
    await seed({
      'financeHealth.equityRatioBad': 999,
      'financeHealth.equityRatioGood': 1_000,
      'financeHealth.currentRatioBad': 999,
      'financeHealth.currentRatioGood': 1_000,
      'financeHealth.fixedLongTermFitBad': 999,
      'financeHealth.fixedLongTermFitGood': 1_000,
      'financeHealth.debtToMonthlySalesBad': 1_199,
      'financeHealth.debtToMonthlySalesGood': 1_200,
      'financeHealth.debtRepaymentYearsBad': 999,
      'financeHealth.debtRepaymentYearsGood': 1_000,
      'financeHealth.operatingMarginBad': 999,
      'financeHealth.operatingMarginGood': 1_000,
      'financeHealth.ordinaryMarginBad': 999,
      'financeHealth.ordinaryMarginGood': 1_000,
      'financeHealth.netMarginBad': 999,
      'financeHealth.netMarginGood': 1_000,
      'financeHealth.laborShareBad': 999,
      'financeHealth.laborShareGood': 1_000,
      'financeHealth.ebitdaMarginBad': 999,
      'financeHealth.ebitdaMarginGood': 1_000,
      'financeHealth.receivablesTurnoverBad': 9_999,
      'financeHealth.receivablesTurnoverGood': 10_000,
      'financeHealth.inventoryTurnoverBad': 9_999,
      'financeHealth.inventoryTurnoverGood': 10_000,
      'financeHealth.cccBad': 3_649,
      'financeHealth.cccGood': 3_650,
      'financeHealth.roaBad': 999,
      'financeHealth.roaGood': 1_000,
      'financeHealth.roeBad': 999,
      'financeHealth.roeGood': 1_000,
    });
    await mount(OverviewPage);
    const m = summary();
    expect(m![2]).toBe('0');
    expect(m![1]).toBe('D');
  });
});

// --- 消費税 (申告・納付) と配当 — 税ページ ⑩ / ⑧ ----------------------------

describe('消費税の申告・納付と配当 — 台帳の値が試算と文言に効く', () => {
  it('対照: 既定の国税 78%・境目 48 万・源泉 15% (+2.1%) + 5%', async () => {
    await mount(TaxPage);
    await typeIntoLabeled('前課税期間の確定消費税額', '500000');
    // 課税ベース 500 万 × 10% = 50 万 → 国税 39 万 / 地方 11 万。前期 50 万は 48 万超なので年 1 回。
    expect(text()).toContain(`（国税 ${jpy(390_000)} ／ 地方 ${jpy(110_000)}）`);
    expect(text()).toContain('中間納付 1 回');
    expect(text()).toContain('48万円超 400万円以下 — 年1回');
    // 配当 100 万: 源泉の所得税 15.315% = 153,150 円。
    expect(text()).toContain('源泉徴収20.315%');
    expect(text()).toContain(`所得税 ${jpy(153_150)}`);
  });

  it('国税分の割合・中間申告の境目・源泉の所得税率の上書きが数字と文言に出る', async () => {
    await seed({
      'consumptionSchedule.nationalShare': 0.8,
      'consumptionSchedule.interimTier1': 600_000,
      'dividend.withholdingIncomeRate': 0.2,
    });
    await mount(TaxPage);
    await typeIntoLabeled('前課税期間の確定消費税額', '500000');
    expect(text()).toContain(`（国税 ${jpy(400_000)} ／ 地方 ${jpy(100_000)}）`);
    expect(text()).toContain('中間納付 なし');
    expect(text()).not.toContain('48万円超 400万円以下');
    // 20% × 1.021 + 5% = 25.42%、所得税 204,200 円。
    expect(text()).toContain('源泉徴収25.42%');
    expect(text()).toContain(`所得税 ${jpy(204_200)}`);
    expect(text()).not.toContain('源泉徴収20.315%');
  });
});

// --- 感情ログ — 寄り添いカウンセリングの見立て ---------------------------------

describe('感情ログ — 台帳のしきい値が見立ての文言に効く', () => {
  // 10 日: 5 が 5 日、2 が 5 日。「会議」は 3 回。
  const moods = [5, 5, 5, 5, 5, 2, 2, 2, 2, 2].map((score, i) => ({
    date: `2026-08-${String(i + 1).padStart(2, '0')}`,
    score,
    note: i === 0 || i === 5 || i === 7 ? '会議 が長い' : '',
  }));
  // 画面は「設定済み」のサービスだけ起動時に取りに行くので、listConfigured にも名乗らせる。
  const hub = () => (globalThis as unknown as { serviceHub: { fetchSnapshot: unknown; listConfigured: unknown } }).serviceHub;
  let originalFetch: unknown;
  let originalConfigured: unknown;

  beforeEach(() => {
    originalFetch = hub().fetchSnapshot;
    originalConfigured = hub().listConfigured;
    hub().listConfigured = () => Promise.resolve(['emotions']);
    hub().fetchSnapshot = (id: string) =>
      Promise.resolve(id === 'emotions' ? { ok: true, data: { moods, analyses: [], keyConfigured: false } } : { ok: false, code: 'x', message: 'x' });
  });
  afterEach(() => {
    hub().fetchSnapshot = originalFetch;
    hub().listConfigured = originalConfigured;
  });

  it('対照: 既定では下向き・連続して低調 5 日・よく出る言葉「会議」', async () => {
    await mount(EmotionsPage);
    expect(text()).toContain('傾向 下向き ↘');
    expect(text()).toContain('連続して低調 5 日');
    expect(text()).toContain('よく出る言葉: 会議');
  });

  it('ヒステリシス・低調の上限・出現回数の上書きで見立てが変わる', async () => {
    await seed({ 'emotion.trendHysteresis': 4, 'emotion.lowScore': 1, 'emotion.triggerMinCount': 5, 'emotion.recentWindow': 3 });
    await mount(EmotionsPage);
    expect(text()).toContain('傾向 横ばい →');
    expect(text()).not.toContain('連続して低調');
    expect(text()).not.toContain('よく出る言葉');
  });
});

// --- 貯蓄・資産形成 -------------------------------------------------------
//
// 緊急予備資金の月数は「会社員 3〜6 / 自営 6〜12 か月」と幅のある参考値で、
// この画面 (投資信託) の**目標額と充足率の分母**になる。2026-09-06 まで 6 が
// 4 か所 (関数の既定値 2・呼び出し 2) にリテラルで散っており、自営業者向けの
// 目安 (6〜12) に合わせる手段が無かった。
describe('savings.emergencyFundMonths — 緊急予備資金の月数', () => {
  // 生活費 300,000 円 / 手元現金 900,000 円 は画面の初期値。
  it('対照: 既定は生活費 6 か月分 (充足率 50%)', async () => {
    await mount(MutualFundsPage);
    expect(statValue('緊急予備資金 (生活費6か月)')).toBe(jpy(1_800_000));
    expect(statValue('予備資金 充足率')).toBe('50%');
    expect(text()).toContain('生活費の6か月分');
  });

  it('12 か月に上書きすると目標額・充足率・文言が動く', async () => {
    await seed({ 'savings.emergencyFundMonths': 12 });
    await mount(MutualFundsPage);
    expect(statValue('緊急予備資金 (生活費12か月)')).toBe(jpy(3_600_000));
    expect(statValue('予備資金 充足率')).toBe('25%');
    expect(text()).toContain('生活費の12か月分');
  });
});
