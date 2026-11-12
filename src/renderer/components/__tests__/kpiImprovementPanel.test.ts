/** @vitest-environment jsdom */
/**
 * 月次KPI改善の輪の画面を、実物の保管層に載せて通す。
 * 目標の保存 → 候補の提示 → 打ち手を選ぶ → 翌月の実績で判定 → 外れが続けば人へ戻す、
 * そして読めない記録に消す口があること。
 */
import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { getRecordStore } from '../../data/store';
import { _resetCollectionSubscribersForTests } from '../../data/useCollection';
import { KPI_ACTUALS_COLLECTION, type KpiActual } from '../../data/kpiActuals';
import { KPI_IMPROVEMENT_COLLECTION, type ImprovementRecord } from '../../data/kpiImprovementStore';
import { settleUntil, waitForElement, waitForText } from '../../__tests__/jsdomWait';
import { resetRecordStore } from '../../__tests__/recordStoreHarness';
import { KpiImprovementPanel } from '../KpiImprovementPanel';

let container: HTMLDivElement;
let root: Root | null = null;

const text = (): string => (container.textContent ?? '').replace(/\s+/g, ' ');
const step = (): string | null => container.querySelector('[data-kpi-step]')?.getAttribute('data-kpi-step') ?? null;

/** 売上 1,000,000・営業利益が marginPct% になる月 (原価で調整)。 */
const month = (period: string, marginPct: number): KpiActual => ({
  period,
  unit: '全社',
  revenue: 1_000_000,
  cogs: 1_000_000 - 100_000 - 300_000 - 50_000 - marginPct * 10_000,
  advertising: 100_000,
  sga: 300_000,
  depreciation: 50_000,
});

async function seedActuals(...rows: KpiActual[]): Promise<void> {
  for (const r of rows) await getRecordStore().insert(KPI_ACTUALS_COLLECTION, r);
}
async function seedLoop(...rows: ImprovementRecord[]): Promise<void> {
  for (const r of rows) await getRecordStore().insert(KPI_IMPROVEMENT_COLLECTION, r);
}
const goal = (t: number): ImprovementRecord => ({ kind: 'goal', targetMarginPct: t });
const cycle = (leverId: string, from: string, to: string): ImprovementRecord => ({
  kind: 'cycle', leverId: leverId as never, expectedGainPt: 2, beforePeriod: from, afterPeriod: to,
});

async function mount(readyStep: string | null): Promise<void> {
  root = createRoot(container);
  await act(async () => {
    root!.render(createElement(KpiImprovementPanel));
  });
  await settleUntil(() => step() === readyStep, `次の一手が ${readyStep} になる`);
}

function changeInput(input: HTMLInputElement, value: string): void {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
  if (!setter) throw new Error('value setter not found');
  setter.call(input, value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
}
async function clickButton(label: string): Promise<void> {
  const button = Array.from(container.querySelectorAll('button')).find((b) => b.textContent?.trim() === label);
  if (!button) throw new Error(`button "${label}" not found`);
  await act(async () => {
    button.click();
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
    await act(async () => {
      root!.unmount();
    });
    root = null;
  }
  document.body.removeChild(container);
});

describe('月次KPI改善の輪の画面', () => {
  it('目標が無ければ未設定と言い、候補は出さない', async () => {
    await mount('no-goal');
    expect(text()).toContain('目標は未設定です');
    expect(container.querySelector('[data-kpi-lever]')).toBeNull();
  });

  it('目標を保存すると、実績との差と候補 (利益の大きい順) が出る', async () => {
    await seedActuals(month('2026-04', 15));
    await mount('no-goal');
    await act(async () => {
      changeInput(container.querySelector<HTMLInputElement>('input[aria-label="目標の営業利益率 (%)"]')!, '20');
    });
    await clickButton('目標を保存');
    await waitForText(text, '現在の目標 20.0%');
    await settleUntil(() => step() === 'propose', '候補が出る');
    expect(text()).toContain('最新 2026-04 の営業利益率 15.0%');
    expect(text()).toContain('目標まであと 5.0 ポイント');
    const ids = Array.from(container.querySelectorAll('[data-kpi-lever]')).map((e) => e.getAttribute('data-kpi-lever'));
    expect(ids).toEqual(['revenue', 'sga', 'cogs', 'advertising']);
    expect(text()).toContain('試算で、予測ではありません');
  });

  it('範囲外の目標は保存せず理由を出す', async () => {
    await mount('no-goal');
    await act(async () => {
      changeInput(container.querySelector<HTMLInputElement>('input[aria-label="目標の営業利益率 (%)"]')!, '150');
    });
    await clickButton('目標を保存');
    await waitForText(text, '0% より大きく 100% 未満');
    expect((await getRecordStore().list(KPI_IMPROVEMENT_COLLECTION)).length).toBe(0);
  });

  it('打ち手を選ぶと翌月の実績待ちになり、記録が 1 件だけ保存される', async () => {
    await seedActuals(month('2026-04', 15));
    await seedLoop(goal(20));
    await mount('propose');
    await clickButton('この打ち手を試す');
    await settleUntil(() => step() === 'await-actuals', '翌月の実績待ちになる');
    expect(text()).toContain('2026-05 の実績が入ると');
    const rows = await getRecordStore().list(KPI_IMPROVEMENT_COLLECTION);
    const cycles = rows.filter((r) => r.data.kind === 'cycle');
    expect(cycles).toHaveLength(1);
    expect(cycles[0]!.data).toMatchObject({ leverId: 'revenue', beforePeriod: '2026-04', afterPeriod: '2026-05' });
    expect(container.querySelector('[data-kpi-cycle="revenue"]')?.textContent).toContain('待ち');
  });

  it('翌月の実績が見込みどおりなら「当たり」と出る', async () => {
    await seedActuals(month('2026-04', 15), month('2026-05', 17.5));
    await seedLoop(goal(30), cycle('sga', '2026-04', '2026-05'));
    await mount('propose');
    expect(container.querySelector('[data-kpi-cycle="sga"]')?.textContent).toContain('当たり');
  });

  it('外れが連続 3 回に達したら人へ戻し、候補は出さない', async () => {
    await seedActuals(month('2026-01', 10), month('2026-02', 10), month('2026-03', 10), month('2026-04', 10));
    await seedLoop(
      goal(30),
      cycle('sga', '2026-01', '2026-02'),
      cycle('cogs', '2026-02', '2026-03'),
      cycle('advertising', '2026-03', '2026-04'),
    );
    await mount('stop-for-human');
    expect(text()).toContain('連続 3 回');
    expect(container.querySelector('[role="alert"]')).not.toBeNull();
    expect(container.querySelector('[data-kpi-lever]')).toBeNull();
    expect(container.querySelectorAll('[data-kpi-cycle]').length).toBe(3);
  });

  it('目標に届いていれば、そう言う', async () => {
    await seedActuals(month('2026-04', 22));
    await seedLoop(goal(20));
    await mount('goal-reached');
    expect(text()).toContain('目標に届いています（22.0%）');
  });

  it('読めない実績の行は判定に使わず、件数を言う', async () => {
    await seedActuals(month('2026-04', 15), { ...month('bad', 15) });
    await seedLoop(goal(20));
    await mount('propose');
    expect(text()).toContain('期または金額が読めない実績 1 件');
  });

  it('読めない記録は使わず、消す口がある (消すと 0 件)', async () => {
    await seedActuals(month('2026-04', 15));
    await seedLoop(goal(20), cycle('nope', '2026-04', '2026-05'));
    await mount('propose');
    const note = await waitForElement<HTMLElement>(
      () => container.querySelector<HTMLElement>('[data-kpi-unreadable]'),
      '読めない記録の注記',
    );
    expect(note.getAttribute('data-kpi-unreadable')).toBe('1');
    await clickButton('読めない記録を消す');
    await settleUntil(() => container.querySelector('[data-kpi-unreadable]') === null, '注記が消える');
    const rows = await getRecordStore().list(KPI_IMPROVEMENT_COLLECTION);
    expect(rows.map((r) => r.data.kind)).toEqual(['goal']);
  });
});
