/**
 * **`budgetComparedRangeLabel` の全文を値ごとに留める。** (パス 502)
 *
 * 既存の検査は範囲ラベルを正規表現 (`^\d{4}-\d{2}〜\d{4}-\d{2}・1 か月$`) と
 * `toContain('・3 か月')` でしか見ておらず、**末尾の期を別の物にしても**
 * (3 か月のとき先頭と同じ期を末尾に出すなど) 通っていた。
 * 画面は「予算は KPI ページで入力できます」の前に `${ラベル}分です。` と述べる。
 * 「端の 2 か月しか無い控えを 1 年分と読まれない」ために、範囲と月数は別の量で出す。
 *
 * 期は**並べ替えない** —— 突合 (`budgetPeriodAlignment`) が昇順で渡す前提で、先頭と末尾をそのまま採る。
 */
import { describe, expect, it } from 'vitest';
import { budgetComparedRangeLabel, type BudgetPeriodAlignment } from '../budgetVariance';

const aligned = (comparedPeriods: readonly string[]): BudgetPeriodAlignment => ({
  comparedPeriods,
  budgetOnlyPeriods: [],
  actualOnlyPeriods: [],
});

describe('budgetComparedRangeLabel — 範囲と月数の全文 (パス 502)', () => {
  it('★ 3 か月: 先頭の期〜末尾の期・月数 (末尾は先頭と別の期)', () => {
    expect(budgetComparedRangeLabel(aligned(['2026-04', '2026-05', '2026-06']))).toBe('2026-04〜2026-06・3 か月');
  });

  it('★ 1 か月: 先頭と末尾は同じ期', () => {
    expect(budgetComparedRangeLabel(aligned(['2026-04']))).toBe('2026-04〜2026-04・1 か月');
  });

  it('★ 端の 2 か月だけ: 範囲は 1 年近くに見えるが、月数は突合した 2 か月', () => {
    expect(budgetComparedRangeLabel(aligned(['2026-04', '2027-03']))).toBe('2026-04〜2027-03・2 か月');
  });

  it('★ 12 か月: 月数は突合した期の数', () => {
    const months = Array.from({ length: 12 }, (_, i) => `2026-${String(i + 1).padStart(2, '0')}`);
    expect(budgetComparedRangeLabel(aligned(months))).toBe('2026-01〜2026-12・12 か月');
  });

  it('★ 対照: 突合が 0 のときは範囲を作らず、undefined を刷らない', () => {
    const label = budgetComparedRangeLabel(aligned([]));
    expect(label).toBe('突合できた期なし');
    expect(label).not.toContain('undefined');
  });
});
