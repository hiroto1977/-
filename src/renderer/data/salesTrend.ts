/**
 * 売上集計の画面の「今月と先月」「月ごとの推移」の読み方 (2026-11-20)。
 *
 * 月別の合計 (`sales.ts` の `monthlyTotals` —— 読める日付の行だけ・新しい月が先) を受け取り、
 * 画面が要る 3 つを導く: 今月と先月の比べ・月ごとの棒の長さ・前月比。
 *
 * 約束:
 *   - **記録が無い月は 0 円ではない。** 今月の記録がまだ無いときの「今月の売上」は `null` (画面は「—」と理由を出す)。
 *     0 円と刷ると「売れていない」という事実の主張になる (パス 395)。
 *   - **前月比は、暦の上で 1 つ前の月と比べる。** その月に記録が無い・その月が 0 円なら `null` (割れない)。
 *     記録の在る「1 つ前の行」と比べると、間の月が抜けているときに 2 か月前との比を「前月比」と呼ぶことになる。
 */
import { isCalendarMonth, parseIsoDate } from '../../shared/isoDate';

export interface MonthTotal {
  readonly month: string;
  readonly amount: number;
}

/** `YYYY-MM` の 1 つ前の月。月として読めなければ `null`。 */
export function previousMonth(month: string): string | null {
  if (!isCalendarMonth(month)) return null;
  const d = parseIsoDate(month);
  // `isCalendarMonth` が通した綴りは必ず読める —— 型の絞り込みのためだけの門。
  // Stryker disable next-line ConditionalExpression: 等価 —— 上の isCalendarMonth が同じ parseIsoDate で null を落としている
  if (d === null) return null;
  const year = d.month === 1 ? d.year - 1 : d.year;
  const prev = d.month === 1 ? 12 : d.month - 1;
  return `${String(year).padStart(4, '0')}-${String(prev).padStart(2, '0')}`;
}

/** 前の額に対する増減 (%)。前の額が無い・0 以下なら `null` (割れない)。 */
export function changePct(amount: number, prev: number | null): number | null {
  // 「無い」は数でない値に置く —— 下の 1 つの門 (0 より大きいか) が、無い・0・負・数でない値をまとめて断る。
  const base = prev ?? Number.NaN;
  if (!(base > 0)) return null;
  return ((amount - base) / base) * 100;
}

/** 増減の文字 (「+158%」「-12%」「±0%」)。`null` は「—」。 */
export function changePctText(pct: number | null): string {
  if (pct === null) return '—';
  const rounded = Math.round(pct);
  // 負の数は自分の符号を持つ。0 は「±」(-0 も 0 と刷られる)。
  const sign = rounded > 0 ? '+' : rounded < 0 ? '' : '±';
  return `${sign}${rounded}%`;
}

/** `2026-11` → `2026年11月`。月として読めなければそのまま返す。 */
export function monthLabel(month: string): string {
  if (!isCalendarMonth(month)) return month;
  const d = parseIsoDate(month);
  // Stryker disable next-line ConditionalExpression: 等価 —— 上の isCalendarMonth が同じ parseIsoDate で null を落としている
  if (d === null) return month;
  return `${d.year}年${d.month}月`;
}

const amountOf = (months: readonly MonthTotal[], month: string | null): number | null => {
  // `month` が無い (前の月を作れなかった) ときは、どの行にも当たらない。
  const hit = months.find((m) => m.month === month);
  return hit === undefined ? null : hit.amount;
};

export interface MonthCompare {
  /** 今月 (`YYYY-MM`)。 */
  readonly month: string;
  /** 今月の合計。今月の記録が無ければ `null`。 */
  readonly amount: number | null;
  /** 先月 (`YYYY-MM`)。今月が月として読めなければ `null`。 */
  readonly prevMonth: string | null;
  /** 先月の合計。先月の記録が無ければ `null`。 */
  readonly prevAmount: number | null;
  /** 先月比 (%)。どちらかが無い・先月が 0 以下なら `null`。 */
  readonly changePct: number | null;
}

/** 今月と先月を比べる。`thisMonth` は呼び手が今日の日付から渡す (`YYYY-MM`)。 */
export function compareThisMonth(months: readonly MonthTotal[], thisMonth: string): MonthCompare {
  const prevMonth = previousMonth(thisMonth);
  const amount = amountOf(months, thisMonth);
  const prevAmount = amountOf(months, prevMonth);
  return {
    month: thisMonth,
    amount,
    prevMonth,
    prevAmount,
    changePct: amount === null ? null : changePct(amount, prevAmount),
  };
}

export interface MonthTrendRow {
  readonly month: string;
  readonly amount: number;
  /** 棒の長さ (いちばん売れた月を 100 とする・0〜100)。 */
  readonly barPct: number;
  /** 暦の上で 1 つ前の月との比 (%)。その月の記録が無い・0 以下なら `null`。 */
  readonly changePct: number | null;
}

/** 月ごとの行に、棒の長さと前月比を足す。並びは受け取ったまま (新しい月が先)。 */
export function monthTrendRows(months: readonly MonthTotal[]): readonly MonthTrendRow[] {
  const max = months.reduce((m, r) => Math.max(m, r.amount), 0);
  return months.map((r) => ({
    month: r.month,
    amount: r.amount,
    barPct: max > 0 ? Math.min(100, Math.max(0, (r.amount / max) * 100)) : 0,
    changePct: changePct(r.amount, amountOf(months, previousMonth(r.month))),
  }));
}
