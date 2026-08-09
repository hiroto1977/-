/**
 * 資金繰り表 — 月ごとの入出金を積み上げて、資金がいつ尽きるかを先に出す。
 *
 * 既存の `cashForecast.ts` は「月次CFがこの調子で続いたら」という外挿で、
 * 1 本の平均値を将来へ引き延ばす。傾向を掴むには足りるが、資金繰り表ではない。
 * 実際に資金が詰まるのは平均ではなく特定の月で、賞与・納税・借入返済・設備投資が
 * 重なる月に落ちる。だから月ごとに入れて、月ごとに残高を見る必要がある。
 *
 * ## 繰越は入力させない
 *
 * 資金繰り表で人が最も間違えるのは前月繰越の転記で、1 か月ずれると以降の残高が
 * すべて狂う。そのうえ表としては辻褄が合って見える。ここでは前月繰越を入力項目に
 * せず、必ず前月の翌月繰越から引き継ぐ。人が転記しないので、ずれようがない。
 *
 * ## 出したい答えはひとつ
 *
 * 「何月に足りなくなるか」。合計や平均ではなく、残高が初めてマイナスに落ちる月を
 * 名指しする。それが分かって初めて、いつまでに何を手当てするかが決まる。
 *
 * **概算であり財務助言ではありません。** 入金・支払のサイト（掛け・手形）は
 * 入力する側が反映させる前提で、ここでは月に入れた金額をその月の現金として扱う。
 */

import { readNumber } from './inputGuards';

/** 資金繰り表の月数。1 年分。 */
export const PLAN_MONTHS = 12;

/** 月ごとに入力する項目。キーは `m{月}{id}` で組み立てる。 */
export interface PlanItem {
  readonly id: string;
  readonly label: string;
  /** 収入か支出か。財務は別枠で集計する。 */
  readonly kind: 'operating-in' | 'operating-out' | 'finance-in' | 'finance-out';
}

export const PLAN_ITEMS: readonly PlanItem[] = [
  { id: 'sales', label: '売上入金', kind: 'operating-in' },
  { id: 'otherIn', label: 'その他収入', kind: 'operating-in' },
  { id: 'purchase', label: '仕入・外注費', kind: 'operating-out' },
  { id: 'labor', label: '人件費', kind: 'operating-out' },
  { id: 'expense', label: 'その他経費', kind: 'operating-out' },
  { id: 'borrow', label: '借入金入金', kind: 'finance-in' },
  { id: 'repay', label: '借入金返済', kind: 'finance-out' },
];

/** 入力フォームのキー。 */
export function planKey(month: number, itemId: string): string {
  return `m${month}${itemId}`;
}

export type Amounts = Record<string, string>;

const amount = (v: Amounts, k: string): number => readNumber(v[k]) ?? 0;

/** 資金繰り表の 1 か月分。 */
export interface CashMonth {
  /** 期の何か月目か（1 始まり）。 */
  readonly month: number;
  /** 前月繰越。入力ではなく前月の closing を引き継ぐ。 */
  readonly opening: number;
  readonly operatingIn: number;
  readonly operatingOut: number;
  /** 経常収支。ここが継続してマイナスなら本業で資金が減っている。 */
  readonly operatingNet: number;
  readonly financeIn: number;
  readonly financeOut: number;
  readonly financeNet: number;
  /** 当月収支（経常 + 財務）。 */
  readonly net: number;
  /** 翌月繰越。 */
  readonly closing: number;
}

/** 資金繰り表ぜんたい。 */
export interface CashPlan {
  readonly openingBalance: number;
  readonly months: readonly CashMonth[];
  /** 期間中の最低残高。 */
  readonly minClosing: number;
  /** 残高が初めてマイナスになる月（1 始まり）。起きなければ null。 */
  readonly shortfallMonth: number | null;
  /** 経常収支がマイナスだった月数。 */
  readonly negativeOperatingMonths: number;
  readonly totalOperatingIn: number;
  readonly totalOperatingOut: number;
  readonly totalFinanceIn: number;
  readonly totalFinanceOut: number;
  /** 期末残高。 */
  readonly endingBalance: number;
}

/** 区分ごとの月次合計。 */
function kindTotal(v: Amounts, month: number, kind: PlanItem['kind']): number {
  let sum = 0;
  for (const it of PLAN_ITEMS) {
    if (it.kind !== kind) continue;
    sum += amount(v, planKey(month, it.id));
  }
  return sum;
}

/**
 * 期首残高と月ごとの入出金から資金繰り表を組む。
 *
 * 繰越の連鎖はここだけで起きる。呼び出し側は前月繰越を渡さない。
 */
export function buildCashPlan(v: Amounts, openingBalance: number): CashPlan {
  const months: CashMonth[] = [];
  let carry = openingBalance;
  let minClosing = Number.POSITIVE_INFINITY;
  let shortfallMonth: number | null = null;
  let negativeOperatingMonths = 0;
  let totalOperatingIn = 0;
  let totalOperatingOut = 0;
  let totalFinanceIn = 0;
  let totalFinanceOut = 0;

  for (let m = 1; m <= PLAN_MONTHS; m += 1) {
    const operatingIn = kindTotal(v, m, 'operating-in');
    const operatingOut = kindTotal(v, m, 'operating-out');
    const financeIn = kindTotal(v, m, 'finance-in');
    const financeOut = kindTotal(v, m, 'finance-out');
    const operatingNet = operatingIn - operatingOut;
    const financeNet = financeIn - financeOut;
    const net = operatingNet + financeNet;
    const closing = carry + net;

    months.push({
      month: m, opening: carry,
      operatingIn, operatingOut, operatingNet,
      financeIn, financeOut, financeNet,
      net, closing,
    });

    // 比較して代入する形だと < と <= が同値になって区別できない。Math.min に畳む。
    minClosing = Math.min(minClosing, closing);
    // 「初めて」なので、すでに見つかっていれば更新しない。
    if (closing < 0 && shortfallMonth === null) shortfallMonth = m;
    if (operatingNet < 0) negativeOperatingMonths += 1;
    totalOperatingIn += operatingIn;
    totalOperatingOut += operatingOut;
    totalFinanceIn += financeIn;
    totalFinanceOut += financeOut;
    carry = closing;
  }

  return {
    openingBalance,
    months,
    minClosing,
    shortfallMonth,
    negativeOperatingMonths,
    totalOperatingIn, totalOperatingOut, totalFinanceIn, totalFinanceOut,
    endingBalance: carry,
  };
}

/**
 * 手元資金が平均月次経常支出の何か月分あるか。
 *
 * 支出が 0 なら割れないので null。「何か月もつか」の目安で、
 * 資金調達の相談で最初に聞かれる数字でもある。
 */
export function monthsOfRunway(plan: CashPlan): number | null {
  const avgOut = plan.totalOperatingOut / PLAN_MONTHS;
  if (avgOut <= 0) return null;
  return plan.endingBalance / avgOut;
}

export type PlanIssueLevel = 'fatal' | 'warn' | 'info';

export interface PlanIssue {
  readonly level: PlanIssueLevel;
  readonly message: string;
  /** 該当する月（1 始まり）。表で強調する。 */
  readonly month?: number;
}

/** 資金繰り表の検算。合計ではなく「いつ詰まるか」を見る。 */
export function checkCashPlan(plan: CashPlan): readonly PlanIssue[] {
  const out: PlanIssue[] = [];
  const yen = (n: number) => `${Math.round(n).toLocaleString('ja-JP')} 円`;

  if (plan.shortfallMonth !== null) {
    const row = plan.months[plan.shortfallMonth - 1]!;
    out.push({
      level: 'fatal',
      month: plan.shortfallMonth,
      message: `${plan.shortfallMonth} か月目に資金がショートします（残高 ${yen(row.closing)}）。`
        + 'この月までに、入金の前倒し・支払の繰延べ・追加調達のいずれかを決めておく必要があります。',
    });
  }

  if (plan.negativeOperatingMonths >= PLAN_MONTHS / 2) {
    out.push({
      level: 'warn',
      message: `経常収支がマイナスの月が ${plan.negativeOperatingMonths} か月あります。`
        + '本業で資金が出ていく状態が続いており、借入で埋めても残高が戻らないため返済で先細ります。',
    });
  }

  if (plan.totalFinanceIn > 0 && plan.totalOperatingIn - plan.totalOperatingOut < 0) {
    out.push({
      level: 'warn',
      message: '年間の経常収支がマイナスのまま借入で穴を埋めています。返済原資は経常収支から出るため、'
        + '調達額よりも先に経常収支を黒字にする道筋が要ります。',
    });
  }

  const runway = monthsOfRunway(plan);
  if (runway !== null && runway < 1) {
    out.push({
      level: 'warn',
      message: `期末残高が平均月次経常支出の ${runway.toFixed(1)} か月分しかありません。`
        + '不測の入金遅延で即座に資金が詰まる水準です。',
    });
  }

  if (plan.openingBalance <= 0) {
    out.push({
      level: 'warn',
      message: '期首残高が 0 以下です。実際の現預金残高を入れないと、以降の月の残高がすべてずれます。',
      month: 1,
    });
  }

  out.push({
    level: 'info',
    message: '前月繰越はこの表が前月の翌月繰越から自動で引き継ぎます（手で転記しません）。'
      + '掛け取引がある場合は、売上の月ではなく入金の月に金額を入れてください。',
  });

  return out;
}
