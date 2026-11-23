/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { ZEB_BATTERY_CANDIDATES_KWH, ZebHubSimulatorPanel, zebInputFromFields } from '../ZebHubSimulatorPanel';
import { DEFAULT_ZEB_HUB_INPUT as D } from '../../../shared/zebHubFinance';
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

describe('防災 ZEB 拠点の収支の節', () => {
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
