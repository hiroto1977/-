/**
 * **経営サマリーの「読めなかった行」の件数は、実績と予算の和で、予算が無ければ 0。** (パス 502)
 *
 * 変異検査の生存 2 件と、形を消した 1 件の確認。
 *
 * - `readableKpiRows(input.kpiBudgets ?? [])` の既定の空配列: 予算を渡さない入力で、空でない配列
 *   (読めない行 1 件) に替わっても `kpi.unreadablePeriods` が 0 のまま通っていた。既存の検査は
 *   どれも `kpiBudgets: []` を明示するので、**予算を省いた入力**の件数を 1 度も見ていなかった。
 * - `unreadableNumbers: 実績 + 予算` の `+`: 既存の検査 (`unreadableKpiAmounts.test.ts`) は
 *   金額が読めない行を**実績にだけ**置くので、予算の分を引いても足しても件数が同じだった。
 * - `validKpiPeriods` の 2 度目の `isValidPeriod` の選別 (形を消した): 上流の漏斗
 *   (`readableKpiRows`) が同じ判定で読める期の行だけを通すので、ここの選別は同じ答えを返す
 *   写しだった。消した後も「読めない期は `kpi.periods` に入らない・昇順」が保たれることをここで留める。
 */
import { describe, expect, it } from 'vitest';
import { buildBusinessOverview } from '../overview';
import type { KpiActual } from '../kpiActuals';

const GOOD: KpiActual = {
  period: '2026-04',
  unit: '全社',
  revenue: 1_000_000,
  cogs: 300_000,
  advertising: 50_000,
  sga: 200_000,
  depreciation: 10_000,
};

/** 型の外の値を持つ行 (復元・古い版の控えが持ち込める形)。 */
const row = (over: Record<string, unknown>): KpiActual => ({ ...GOOD, ...over }) as unknown as KpiActual;

/** 期が読めない行 (`YYYY-MM` でない) と、金額が数として読めない行。 */
const BAD_PERIOD = row({ period: '全社' });
const BAD_NUMBER = row({ period: '2026-05', revenue: '9000000' });

describe('buildBusinessOverview — 読めなかった行の件数 (パス 502)', () => {
  it('★ 予算を渡さなくても、読めなかった行の件数は 0 (予算の既定は空)', () => {
    const noBudgets = buildBusinessOverview({ plan: 'pro', sales: [], kpiActuals: [GOOD], members: [] });
    expect(noBudgets.kpi.unreadablePeriods).toBe(0);
    expect(noBudgets.kpi.unreadableNumbers).toBe(0);
    // 実績も無い入力でも同じ (既定の空配列が空でなくなる形は、実績の有無に依らず件数を作る)
    const nothing = buildBusinessOverview({ plan: 'pro', sales: [], kpiActuals: [], members: [] });
    expect(nothing.kpi.unreadablePeriods).toBe(0);
    expect(nothing.kpi.unreadableNumbers).toBe(0);
  });

  it('★ 期が読めない行も金額が読めない行も、実績の分と予算の分を足した件数になる', () => {
    const o = buildBusinessOverview({
      plan: 'pro',
      sales: [],
      // 実績: 期 1 件・金額 1 件 / 予算: 期 2 件・金額 3 件 (引き算や片側だけでは一致しない数)
      kpiActuals: [GOOD, BAD_PERIOD, BAD_NUMBER],
      kpiBudgets: [
        GOOD,
        BAD_PERIOD,
        row({ period: '全体' }),
        row({ period: '2026-06', revenue: null }),
        row({ period: '2026-07', cogs: { z: 1 } }),
        row({ period: '2026-08', sga: [1] }),
      ],
      members: [],
    });
    expect(o.kpi.unreadablePeriods).toBe(1 + 2);
    expect(o.kpi.unreadableNumbers).toBe(1 + 3);
  });

  it('★ 実績が全部読めて、予算だけが読めない行を持つとき、件数は予算の分になる (符号が負にならない)', () => {
    const o = buildBusinessOverview({
      plan: 'pro',
      sales: [],
      kpiActuals: [GOOD],
      kpiBudgets: [row({ period: '2026-05', revenue: true }), row({ period: '2026-06', revenue: 'x' })],
      members: [],
    });
    expect(o.kpi.unreadablePeriods).toBe(0);
    expect(o.kpi.unreadableNumbers).toBe(2);
  });
});

describe('buildBusinessOverview — kpi.periods は読める期だけで昇順 (パス 502)', () => {
  it('★ 期が読めない行・金額が読めない行は期の一覧に入らず、読める期は並べ直される', () => {
    const o = buildBusinessOverview({
      plan: 'pro',
      sales: [],
      kpiActuals: [
        row({ period: '2026-06' }),
        BAD_PERIOD,
        row({ period: '2026-04' }),
        row({ period: '2026-13' }), // 暦に無い月
        BAD_NUMBER, // 期は読めるが金額が読めない行 (2026-05) は集計にも期の一覧にも入らない
        row({ period: '2026-05-01' }),
        row({ period: '2026-03' }),
      ],
      members: [],
    });
    expect(o.kpi.periods).toEqual(['2026-03', '2026-04', '2026-06']);
    expect(o.kpi.periodWindow).toEqual({ from: '2026-03', to: '2026-06', months: 3 });
    expect(o.kpi.unreadablePeriods).toBe(3);
    expect(o.kpi.unreadableNumbers).toBe(1);
  });
});
