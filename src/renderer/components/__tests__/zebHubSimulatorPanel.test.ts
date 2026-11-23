/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import {
  CONTAINER_BATTERY_CANDIDATES_KWH,
  OUTAGE_HOURS,
  ZEB_BATTERY_CANDIDATES_KWH,
  ZebHubSimulatorPanel,
  initialZebFields,
  outageView,
  zebInputFromFields,
  type ZebScale,
} from '../ZebHubSimulatorPanel';
import { CONTAINER_START_ZEB_HUB_INPUT as C, DEFAULT_ZEB_HUB_INPUT as D, simulateZebHub } from '../../../shared/zebHubFinance';
import { jpyWhole } from '../../../shared/formatters';
import { waitForText } from '../../__tests__/jsdomWait';

/*
 * 防災オフグリッド ZEB 拠点の収支の節 (2026-11-23)。
 * 計算は `zebHubFinance.ts` が持つので、ここは「画面の欄が計算へ届く」「結果と断りが出る」を見る。
 */
let container: HTMLDivElement;
let root: Root | null = null;

beforeEach(async () => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root!.render(createElement(ZebHubSimulatorPanel));
  });
});

afterEach(async () => {
  await act(async () => {
    root!.unmount();
  });
  root = null;
  document.body.removeChild(container);
});

const text = (): string => container.textContent ?? '';

function field(label: string): HTMLInputElement {
  const el = container.querySelector<HTMLInputElement>(`input[aria-label="${label}"]`);
  expect(el, label).toBeTruthy();
  return el!;
}

async function typeInto(label: string, value: string): Promise<void> {
  const input = field(label);
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

async function chooseScale(k: ZebScale): Promise<void> {
  const button = container.querySelector<HTMLButtonElement>(`[data-zeb-scale="${k}"]`);
  expect(button, k).toBeTruthy();
  await act(async () => {
    button!.click();
  });
}

describe('初年度 (コンテナハウス) の規模', () => {
  it('★ 開いた時は初年度のコンテナハウスで、初期費用 3,700 万円と仮の値である断りを出す', async () => {
    await waitForText(text, '初期費用 (補助前)');
    expect(container.querySelector('[data-zeb-scale="container"]')?.getAttribute('aria-checked')).toBe('true');
    expect(text()).toContain(jpyWhole(37_000_000));
    expect(container.querySelector('[data-zeb-scale-note]')?.textContent).toContain('仮の値');
    // 1 拠点だけなので自己託送はしない前提で始まる。
    expect(container.querySelector('[data-zeb-cross-area]')).not.toBeNull();
  });

  it('★ 蓄電池の比べは小型の候補で出す', () => {
    const rows = [...container.querySelectorAll('[data-zeb-battery-row]')].map((r) => Number(r.getAttribute('data-zeb-battery-row')));
    expect(rows).toEqual([...CONTAINER_BATTERY_CANDIDATES_KWH]);
  });

  it('★ 店舗と賃貸の純収入 (年 500 万円) を入れると回収年数が出る', async () => {
    await typeInto('ほかの年間純収入 (円/年)', '5000000');
    expect(container.querySelector('[data-zeb-no-payback]')).toBeNull();
    const payback = [...container.querySelectorAll('.stat-grid > div')].find((s) => s.textContent?.includes('投資回収年数'));
    expect(payback?.textContent).toMatch(/\d+(\.\d)? 年/);
  });

  it('★ 規模を切り替えると欄は選んだ規模の初期値へ戻り、戻すとまた初年度の値になる', async () => {
    await typeInto('ほかの年間純収入 (円/年)', '5000000');
    await chooseScale('standard');
    expect(field('建築本体 (円)').value).toBe(String(D.buildingCost));
    expect(field('ほかの年間純収入 (円/年)').value).toBe('0');
    expect(text()).toContain(jpyWhole(702_300_000));
    await chooseScale('container');
    expect(field('建築本体 (円)').value).toBe(String(C.buildingCost));
  });

  it('★ 欄に無い前提 (蓄電池の単価・取り置き) は規模の値を使う', () => {
    const input = zebInputFromFields(initialZebFields(C), C.selfWheelingSameArea, C);
    expect(input.batteryCostPerKwh).toBe(200_000);
    expect(input.batteryFixedCost).toBe(0);
    expect(input.reserveShare).toBe(0.5);
    expect(input.selfWheelingSameArea).toBe(false);
    // 補助率は欄の 66.7% / 33.3% (仮置き) —— 補助後の投資は 3,100 万円。
    expect(Math.round(simulateZebHub(input).netInvestment)).toBe(31_000_000);
  });
});

describe('防災 ZEB 拠点の収支の節 (本格拠点)', () => {
  beforeEach(async () => {
    await chooseScale('standard');
  });

  it('★ 標準の拠点: 初期費用と補助後の投資が計算どおりに出て、回収できないことを言う', async () => {
    await waitForText(text, '初期費用 (補助前)');
    expect(text()).toContain(jpyWhole(702_300_000));
    expect(container.querySelector('[data-zeb-no-payback]')).not.toBeNull();
    expect(text()).toContain('回収できません');
  });

  it('★ 建物の使い道の純収入を入れると、回収年数が出て断りが消える', async () => {
    await typeInto('ほかの年間純収入 (円/年)', '60000000');
    await waitForText(text, '年');
    expect(container.querySelector('[data-zeb-no-payback]')).toBeNull();
    const payback = [...container.querySelectorAll('.stat-grid > div')].find((s) => s.textContent?.includes('投資回収年数'));
    expect(payback?.textContent).toMatch(/\d+(\.\d)? 年/);
  });

  it('★ エリアを跨ぐと、自己託送をしない前提であることを言う', async () => {
    expect(container.querySelector('[data-zeb-cross-area]')).toBeNull();
    const box = container.querySelector<HTMLInputElement>('input[type="checkbox"]')!;
    await act(async () => {
      box.click();
    });
    expect(container.querySelector('[data-zeb-cross-area]')?.textContent).toContain('エリアを跨ぐ自己託送は制度上できない');
  });

  it('★ 読めない欄があれば計算せず、欄の名前を挙げて断る', async () => {
    await typeInto('発電の定格 (kW)', '-5');
    expect(container.querySelector('[data-zeb-battery-table]')).toBeNull();
    expect(text()).toContain('発電の定格 (kW)');
    expect(text()).not.toContain('初期費用 (補助前)');
  });

  it('蓄電池の容量の比べは候補ごとに 1 行出し、最も得な容量を名指す', () => {
    const rows = [...container.querySelectorAll('[data-zeb-battery-row]')].map((r) => Number(r.getAttribute('data-zeb-battery-row')));
    expect(rows).toEqual([...ZEB_BATTERY_CANDIDATES_KWH]);
    expect(container.querySelector('[data-zeb-battery-choice]')?.textContent).toMatch(/最も得な容量: [\d,]+ kWh/);
  });

  it('持ち時間の下限を高くすると、賄える候補が無いことを言う', async () => {
    await typeInto('災害時に要る持ち時間 (h)', '700');
    expect(container.querySelector('[data-zeb-battery-choice]')?.textContent).toContain('賄える候補はありません');
  });

  it('★ 停電の持ち時間: 晴れ (取り置き分から) と 雨 (満充電から・発電なし) の 2 つを出す', () => {
    const box = container.querySelector('[data-zeb-outage]')?.textContent ?? '';
    expect(box).toContain('夕方 18 時に停電した場合');
    expect(box).toContain('取り置き分だけが残っているとき: 72 時間以上');
    expect(box).toMatch(/発電が無く、満充電から始めたとき: \d+ 時間/);
    expect(box).toContain('止めない負荷');
  });

  it('★ 蓄電池が無ければ、夜の停電では止めない負荷を動かせないと言う', async () => {
    await typeInto('蓄電池の容量 (kWh)', '0');
    expect(container.querySelector('[data-zeb-outage]')).toBeNull();
    expect(container.querySelector('[data-zeb-outage-none]')).not.toBeNull();
  });

  it('★ 止めない負荷と冷凍冷蔵の合計が 1 日の消費を超えると、計算せずに断る', async () => {
    await typeInto('冷凍冷蔵の消費 (kWh/日)', '500');
    expect(container.querySelector('[data-zeb-outage]')).toBeNull();
    expect(container.querySelector('[data-zeb-outage-loads]')?.textContent).toContain('1 日の消費を超えています');
  });

  it('確かめることの一覧を出す (系統連系・保安・消防・上水と中水の分離・濃縮水)', () => {
    const checks = container.querySelector('[data-zeb-checks]')?.textContent ?? '';
    for (const word of ['系統連系', '電気主任技術者', '消防法', '吐水口空間', '濃縮水']) expect(checks).toContain(word);
  });
});

describe('画面の欄から計算の入力を組む', () => {
  it('★ 欄の値が入力の欄へ届き、割合は 100 で割る', () => {
    const input = zebInputFromFields(
      {
        pvKw: '200',
        yieldPerKw: '3',
        batteryKwh: '1000',
        baseLoad: '300',
        criticalLoad: '100',
        gridPrice: '32',
        wheelingValue: '20',
        marketPrice: '11',
        spread: '9',
        otherRevenue: '5000000',
        buildingCost: '400000000',
        pvCost: '150000000',
        waterCost: '50000000',
        discountPct: '5',
        pvSubsidyPct: '75',
        batterySubsidyPct: '50',
        batterySubsidyCap: '30000000',
        minAutonomyHours: '24',
        refrigeration: '0',
      },
      false,
    );
    expect(input).toMatchObject({
      pvKw: 200,
      specificYieldKwhPerKwDay: 3,
      batteryKwh: 1000,
      baseLoadKwhPerDay: 300,
      criticalLoadKwhPerDay: 100,
      gridPurchasePrice: 32,
      wheelingValue: 20,
      selfWheelingSameArea: false,
      marketSalePrice: 11,
      arbitrageSpread: 9,
      otherRevenuePerYear: 5_000_000,
      buildingCost: 400_000_000,
      pvCost: 150_000_000,
      waterPlantCost: 50_000_000,
      discountRate: 0.05,
    });
    expect(input.subsidies).toEqual([
      { id: 'perovskite', name: 'ペロブスカイト導入支援', targets: ['pv'], rate: 0.75, cap: null },
      { id: 'storage', name: '蓄電池の導入支援', targets: ['battery'], rate: 0.5, cap: 30_000_000 },
    ]);
    // 欄に無い前提は標準値のまま
    expect(input.reserveShare).toBe(D.reserveShare);
    expect(input.pvReplacementIntervalYears).toBe(D.pvReplacementIntervalYears);
  });
});

describe('停電の持ち時間の計算', () => {
  it('★ 蓄電池が無ければ null', () => {
    expect(outageView({ ...D, batteryKwh: 0 }, 0)).toBeNull();
  });

  it('★ 標準の拠点 (550 kWh) は、発電が無くても負荷を絞って 72 時間持つ', () => {
    const v = outageView(D, 20)!;
    expect(v.noSun.survived).toBe(true);
    expect(v.reserveOnly.survived).toBe(true);
  });

  it('★ 小さい蓄電池: 晴れの日は取り置き分からでも持ち、発電が無ければ満充電でも尽きる', () => {
    const v = outageView({ ...D, batteryKwh: 300 }, 20)!;
    expect(v.reserveOnly.survived).toBe(true);
    expect(v.reserveOnly.hours).toHaveLength(OUTAGE_HOURS);
    expect(v.reserveOnly.hours[0]!.socStart).toBeCloseTo(1 - D.usableDepth + D.usableDepth * D.reserveShare);
    // 夕方 6 時から始めるので、最初の時間は発電が無く、翌朝 6 時台から発電する
    expect(v.reserveOnly.hours[0]!.pvKw).toBe(0);
    expect(v.reserveOnly.hours[11]!.pvKw).toBe(0);
    expect(v.reserveOnly.hours[13]!.pvKw).toBeGreaterThan(0);
    expect(v.noSun.hours.every((h) => h.pvKw === 0)).toBe(true);
    expect(v.noSun.hours[0]!.socStart).toBe(1);
    expect(v.noSun.survived).toBe(false);
  });

  it('★ 蓄電池を大きくすると、発電が無いときの持ち時間が延びる', () => {
    const small = outageView({ ...D, batteryKwh: 300 }, 20)!.noSun.criticalHours;
    const big = outageView({ ...D, batteryKwh: 450 }, 20)!.noSun.criticalHours;
    expect(big).toBeGreaterThan(small);
  });

  it('★ 冷凍冷蔵を差し引いた残りを 空調 45 : 店舗 35 に分ける', () => {
    const v = outageView({ ...D, baseLoadKwhPerDay: 175, criticalLoadKwhPerDay: 95 }, 0)!;
    // 満充電の最初の時間は店舗・EV を止め、空調は動かす
    const h0 = v.noSun.hours[0]!;
    expect(h0.tiers).toEqual([0, 1, 2]);
    expect(h0.loadKw).toBeCloseTo((95 + 0 + 80 * (45 / 80)) / 24);
  });
});
