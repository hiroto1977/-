/**
 * 売上集計の「今月と先月」「月ごとの推移」の読み方 (`salesTrend.ts`)。
 *
 * 守る約束は 2 つ:
 *   - 記録が無い月を 0 円と言わない (`null` —— 画面は「—」と理由を出す)
 *   - 前月比は暦の上で 1 つ前の月と比べる (間の月が抜けていたら「—」。2 か月前との比を前月比と呼ばない)
 */
import { describe, expect, it } from 'vitest';
import {
  changePct,
  changePctText,
  compareThisMonth,
  monthLabel,
  monthTrendRows,
  previousMonth,
} from '../salesTrend';

describe('previousMonth —— 1 つ前の月', () => {
  it('同じ年の中では月を 1 つ戻す (2 桁に揃える)', () => {
    expect(previousMonth('2026-11')).toBe('2026-10');
    expect(previousMonth('2026-10')).toBe('2026-09');
    expect(previousMonth('2026-02')).toBe('2026-01');
  });

  it('★ 1 月の前は前の年の 12 月', () => {
    expect(previousMonth('2026-01')).toBe('2025-12');
    expect(previousMonth('2000-01')).toBe('1999-12');
  });

  it('年は 4 桁に揃える', () => {
    expect(previousMonth('0001-01')).toBe('0000-12');
    expect(previousMonth('0999-03')).toBe('0999-02');
  });

  it('月として読めない綴りは null (日付・13 月・空・ただの文字)', () => {
    for (const bad of ['2026-11-18', '2026-13', '2026-00', '', 'abcdefg', '2026-1']) {
      expect(previousMonth(bad), bad).toBeNull();
    }
  });
});

describe('changePct —— 前の額に対する増減', () => {
  it('増えた・減った・同じ', () => {
    expect(changePct(31_000, 12_000)).toBeCloseTo(158.333, 2);
    expect(changePct(6_000, 12_000)).toBe(-50);
    expect(changePct(12_000, 12_000)).toBe(0);
    expect(changePct(0, 12_000)).toBe(-100);
  });

  it('★ 前の額が無ければ null (記録が無い月は 0 円ではない)', () => {
    expect(changePct(31_000, null)).toBeNull();
  });

  it('★ 前の額が 0 以下・数でなければ null (割れない)', () => {
    expect(changePct(31_000, 0)).toBeNull();
    expect(changePct(31_000, -1)).toBeNull();
    expect(changePct(31_000, Number.NaN)).toBeNull();
  });

  it('前の額がごく小さくても正なら割る (境目は 0)', () => {
    expect(changePct(2, 1)).toBe(100);
    expect(changePct(1, 0.5)).toBe(100);
  });
});

describe('changePctText —— 増減の文字', () => {
  it('増えたら + を付け、減ったら - が付き、四捨五入で 0 なら ±0%', () => {
    expect(changePctText(158.333)).toBe('+158%');
    expect(changePctText(-50)).toBe('-50%');
    expect(changePctText(0)).toBe('±0%');
    expect(changePctText(0.4)).toBe('±0%');
    expect(changePctText(-0.4)).toBe('±0%');
    expect(changePctText(0.5)).toBe('+1%');
    expect(changePctText(-0.6)).toBe('-1%');
  });

  it('★ null は「—」(0% と言わない)', () => {
    expect(changePctText(null)).toBe('—');
  });
});

describe('monthLabel —— 月の呼び名', () => {
  it('YYYY-MM を「YYYY年M月」にする (月の頭の 0 は付けない)', () => {
    expect(monthLabel('2026-11')).toBe('2026年11月');
    expect(monthLabel('2026-03')).toBe('2026年3月');
  });

  it('月として読めない綴りはそのまま返す (作り話の月にしない)', () => {
    expect(monthLabel('bad')).toBe('bad');
    expect(monthLabel('2026-13')).toBe('2026-13');
    expect(monthLabel('2026-11-18')).toBe('2026-11-18');
  });
});

const MONTHS = [
  { month: '2026-11', amount: 31_000 },
  { month: '2026-10', amount: 12_000 },
  { month: '2026-08', amount: 24_000 },
];

describe('compareThisMonth —— 今月と先月', () => {
  it('今月も先月も記録が在れば、両方の額と先月比を返す', () => {
    expect(compareThisMonth(MONTHS, '2026-11')).toEqual({
      month: '2026-11',
      amount: 31_000,
      prevMonth: '2026-10',
      prevAmount: 12_000,
      changePct: ((31_000 - 12_000) / 12_000) * 100,
    });
  });

  it('★ 今月の記録が無ければ額は null (0 円ではない)。先月の額は返す', () => {
    expect(compareThisMonth(MONTHS, '2026-12')).toEqual({
      month: '2026-12',
      amount: null,
      prevMonth: '2026-11',
      prevAmount: 31_000,
      changePct: null,
    });
  });

  it('★ 先月の記録が無ければ先月の額も先月比も null (2 か月前と比べない)', () => {
    expect(compareThisMonth(MONTHS, '2026-10')).toEqual({
      month: '2026-10',
      amount: 12_000,
      prevMonth: '2026-09',
      prevAmount: null,
      changePct: null,
    });
  });

  it('年をまたぐ (1 月の先月は前の年の 12 月)', () => {
    const months = [
      { month: '2027-01', amount: 500 },
      { month: '2026-12', amount: 1_000 },
    ];
    const c = compareThisMonth(months, '2027-01');
    expect(c.prevMonth).toBe('2026-12');
    expect(c.prevAmount).toBe(1_000);
    expect(c.changePct).toBe(-50);
  });

  it('記録が 1 件も無ければ、どの額も null', () => {
    expect(compareThisMonth([], '2026-11')).toEqual({
      month: '2026-11',
      amount: null,
      prevMonth: '2026-10',
      prevAmount: null,
      changePct: null,
    });
  });

  it('今月が月として読めなければ、先月は null (額も null)', () => {
    expect(compareThisMonth(MONTHS, 'bad')).toEqual({
      month: 'bad',
      amount: null,
      prevMonth: null,
      prevAmount: null,
      changePct: null,
    });
  });

  it('今月の額が 0 円の記録なら、額は 0 (記録が在る 0 と、記録が無いは別)', () => {
    const c = compareThisMonth([{ month: '2026-11', amount: 0 }, { month: '2026-10', amount: 1_000 }], '2026-11');
    expect(c.amount).toBe(0);
    expect(c.changePct).toBe(-100);
  });
});

describe('monthTrendRows —— 月ごとの棒と前月比', () => {
  it('★ 棒はいちばん売れた月が 100、他はその割合。並びは受け取ったまま', () => {
    const rows = monthTrendRows(MONTHS);
    expect(rows.map((r) => r.month)).toEqual(['2026-11', '2026-10', '2026-08']);
    expect(rows.map((r) => r.amount)).toEqual([31_000, 12_000, 24_000]);
    expect(rows[0]!.barPct).toBe(100);
    expect(rows[1]!.barPct).toBeCloseTo((12_000 / 31_000) * 100, 6);
    expect(rows[2]!.barPct).toBeCloseTo((24_000 / 31_000) * 100, 6);
  });

  it('★ 前月比は暦の 1 つ前の月と比べる。その月の記録が無ければ null', () => {
    const rows = monthTrendRows(MONTHS);
    expect(rows[0]!.changePct).toBeCloseTo(158.333, 2); // 11 月 ← 10 月
    expect(rows[1]!.changePct).toBeNull(); // 10 月 ← 9 月の記録が無い (8 月とは比べない)
    expect(rows[2]!.changePct).toBeNull(); // 8 月 ← 7 月の記録が無い
  });

  it('どの月も 0 円なら棒は 0 (0 で割らない)', () => {
    const rows = monthTrendRows([{ month: '2026-11', amount: 0 }, { month: '2026-10', amount: 0 }]);
    expect(rows.map((r) => r.barPct)).toEqual([0, 0]);
    expect(rows[0]!.changePct).toBeNull(); // 先月が 0 円 —— 割れない
  });

  it('負の額の月が混ざっても、棒は 0〜100 に収まる', () => {
    const rows = monthTrendRows([{ month: '2026-11', amount: 1_000 }, { month: '2026-10', amount: -500 }]);
    expect(rows[0]!.barPct).toBe(100);
    expect(rows[1]!.barPct).toBe(0);
  });

  it('負の額だけなら、どの棒も 0 (最大を 0 から数える)', () => {
    const rows = monthTrendRows([{ month: '2026-11', amount: -1 }, { month: '2026-10', amount: -5 }]);
    expect(rows.map((r) => r.barPct)).toEqual([0, 0]);
  });

  it('1 か月だけなら、その月が 100 で前月比は null', () => {
    expect(monthTrendRows([{ month: '2026-11', amount: 5 }])).toEqual([
      { month: '2026-11', amount: 5, barPct: 100, changePct: null },
    ]);
  });

  it('記録が無ければ空', () => {
    expect(monthTrendRows([])).toEqual([]);
  });
});
