/**
 * 消費税・地方消費税の年間スケジュール試算 — 税率 0%〜50% の範囲で、
 * 納付税額 / 還付税額と、その「いつ・いくら」を算定する。
 *
 * **重要 — 概算試算であり、正確な税額計算・税務助言ではありません。**
 * 実際の申告書は課税標準額の1,000円未満切捨て、非課税売上に対応する仕入れの
 * 調整（課税売上割合・個別対応方式/一括比例配分方式）、貸倒れ、特定課税仕入れ
 * （リバースチャージ）、棚卸資産の調整、免税事業者からの仕入れの経過措置など
 * 多くの要素を含みます。本モジュールはそれらを扱いません。
 *
 * 実装している要素:
 *   - 本則課税 / 簡易課税 / 2割特例
 *   - 国税と地方消費税の区分（現行法の 78 : 22 を仮定）
 *   - 100円未満切捨て（国税通則法119条1項）と、還付側の1円未満切捨て
 *   - 中間申告の要否・回数・各回の納付額と期限（消費税法42条・48条）
 *   - 確定申告の期限（個人=翌年3月31日 / 法人=課税期間末日の翌日から2か月、
 *     申告期限延長の特例を受けている法人は3か月）
 *   - 中間納付を差し引いた「確定申告時に実際に動く金額」と、その符号が
 *     入れ替わる税率（分岐税率）
 *
 * 出典（2026-08 時点で確認）:
 *   国税庁 No.6609 中間申告の方法 / No.6610 法人に係る消費税の確定申告書の
 *   提出期限 / No.6371 端数計算、国税通則法119条、e-Tax 還付金処理状況確認。
 */

import { floorHundred } from './num';
import { TWENTY_PERCENT_RATE } from './taxConsumption';

/** 現行法における消費税（国税）の割合。標準10% = 国税7.8% + 地方2.2%。 */
export const NATIONAL_SHARE = 0.78;
/** 地方消費税は「納付すべき消費税額（国税）」× 22/78。 */
export const LOCAL_RATIO = 22 / 78;

/**
 * 国税分の割合から地方消費税の比 (既定 22/78) を作る。百万分率の整数比で割るので、
 * 既定の 0.78 では `22 / 78` と同じ double になる (1 − 0.78 の丸め誤差を持ち込まない)。
 */
export function localRatioOf(nationalShare: number): number {
  const ppm = Math.round(nationalShare * 1_000_000);
  return (1_000_000 - ppm) / ppm;
}

/** 中間申告の回数の境目 (前課税期間の確定消費税額・国税分・円。消費税法 42 条)。 */
export const INTERIM_TIER1 = 480_000;
export const INTERIM_TIER2 = 4_000_000;
export const INTERIM_TIER3 = 48_000_000;

/** 申告・納付の計算が読む法定値 (台帳 `parameters.ts` から渡せる)。省略時は上の定数。 */
export interface ScheduleParams {
  /** 消費税のうち国税分の割合 (7.8 / 10)。地方消費税は (1 − 割合) ÷ 割合 で組む。 */
  readonly nationalShare: number;
  /** 2 割特例で納める割合 (売上税額 × 20%)。 */
  readonly twentyPercentRate: number;
  /** これ以下なら中間申告なし。 */
  readonly interimTier1: number;
  /** これ以下なら年 1 回。 */
  readonly interimTier2: number;
  /** これ以下なら年 3 回、超は年 11 回。 */
  readonly interimTier3: number;
}

export const DEFAULT_SCHEDULE_PARAMS: ScheduleParams = {
  nationalShare: NATIONAL_SHARE,
  twentyPercentRate: TWENTY_PERCENT_RATE,
  interimTier1: INTERIM_TIER1,
  interimTier2: INTERIM_TIER2,
  interimTier3: INTERIM_TIER3,
};

/** 試算できる税率の上限（50%）。 */
export const MAX_RATE = 0.5;

export type FilerKind = 'individual' | 'corporate';
export type TaxMethod = 'standard' | 'simplified' | 'twenty-percent';

/** 還付額の端数処理: 1円未満切捨て。ただし 1円未満の正値は 1円とする。 */
export function roundRefund(n: number): number {
  if (n <= 0) return 0;
  // 1円未満切捨て。ただし正の値が1円未満なら1円（Math.floor(1) === 1 なので
  // 「1未満なら1」の分岐は Math.max に畳める）。
  return Math.max(1, Math.floor(n));
}

export interface ScheduleInput {
  readonly filer: FilerKind;
  /** 課税期間の末日の月 (1-12)。個人は 12。 */
  readonly fiscalEndMonth: number;
  /** 課税期間の末日の年 (西暦)。 */
  readonly fiscalEndYear: number;
  /** 法人が消費税の申告期限延長の特例を受けているか。 */
  readonly extendedDeadline: boolean;
  readonly method: TaxMethod;
  /** 課税売上高 (税抜, 円)。 */
  readonly taxableSales: number;
  /** 本則課税で控除する課税仕入れ等 (税抜, 円)。 */
  readonly taxablePurchases: number;
  /** 簡易課税のみなし仕入率 (0..1)。 */
  readonly deemedPurchaseRate: number;
  /** 前課税期間の確定消費税額（国税分, 円）。中間申告の判定に使う。 */
  readonly priorNationalTax: number;
  /** e-Tax で申告するか（還付の目安時期が変わる）。 */
  readonly eTax: boolean;
}

/** ある税率における年税額の内訳。 */
export interface AnnualTax {
  /** 消費税率（0..0.5）。国税分と地方分の合計。 */
  readonly rate: number;
  /** 売上に係る消費税額（国税分, 円）。 */
  readonly salesTaxNational: number;
  /** 控除する仕入れに係る消費税額（国税分, 円）。2割特例では売上税額の80%相当。 */
  readonly deductibleNational: number;
  /** 差引（切捨て前, 国税分）。負なら控除不足＝還付。 */
  readonly netNationalRaw: number;
  /** 端数処理後の国税額。納付なら正、還付なら負。 */
  readonly national: number;
  /** 端数処理後の地方消費税額。納付なら正、還付なら負。 */
  readonly local: number;
  /** 国税＋地方の年税額。正=納付 / 負=還付。 */
  readonly total: number;
  readonly isRefund: boolean;
}

/** 中間申告の 1 回分。 */
export interface InterimPayment {
  /** 第何回か (1 始まり)。 */
  readonly no: number;
  /** 中間申告対象期間の末日。 */
  readonly periodEnd: string;
  /** 申告・納付の期限。 */
  readonly due: string;
  /** 国税分の中間納付額（100円未満切捨て後）。 */
  readonly national: number;
  /** 地方消費税分。 */
  readonly local: number;
  /** 合計。 */
  readonly total: number;
}

export interface InterimPlan {
  /** 年間の中間申告回数（0 = 不要）。 */
  readonly count: 0 | 1 | 3 | 11;
  /** 判定に使った前課税期間の確定消費税額（国税分）。 */
  readonly priorNationalTax: number;
  /** 判定区分の説明。 */
  readonly band: string;
  readonly payments: readonly InterimPayment[];
  /** 中間納付の合計（国税＋地方）。 */
  readonly total: number;
  /** 中間納付の合計（国税分のみ）。確定申告での控除に使う。 */
  readonly totalNational: number;
}

/** 確定申告時に実際に動く金額。 */
export interface FinalSettlement {
  /** 確定申告・納付の期限。 */
  readonly due: string;
  /** 年税額（国税＋地方）。 */
  readonly annualTotal: number;
  /** 中間納付の合計。 */
  readonly interimTotal: number;
  /** 年税額 − 中間納付。正=追加で納付 / 負=還付。 */
  readonly amount: number;
  readonly kind: 'payment' | 'refund' | 'none';
  /** 還付の場合の入金時期の目安（幅）。納付の場合は undefined。 */
  readonly refundWindow?: { readonly from: string; readonly to: string; readonly note: string };
}

// --- 日付ユーティリティ（すべて UTC。表示は YYYY-MM-DD） -----------------

function lastDayOfMonth(year: number, month1: number): Date {
  // month1 は 1-12。翌月 0 日 = 当月末日。
  return new Date(Date.UTC(year, month1, 0));
}

function iso(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function addDays(d: Date, n: number): Date {
  return new Date(d.getTime() + n * 86_400_000);
}

/**
 * 行政機関の休日にあたる場合は翌開庁日へ送る（国税通則法10条2項）。
 * 土日と 12/29〜1/3 を休日として扱う。**国民の祝日は考慮していない。**
 *
 * ## 理由と、その理由の穴（2026-08-23 実測）
 *
 * 元の注記は「月末にあたる固定祝日が無いため」と書いていた。**固定祝日に
 * ついてはそのとおり**で、2024〜2035 年で確かめると、固定祝日・ハッピー
 * マンデー・春分/秋分（取りうる 3/20〜23・9/20〜23 を全部）のどれも
 * 月末日には当たらない。
 *
 * **だが振替休日を数えていなかった。** 昭和の日 4/29 が日曜だと翌 4/30 が
 * 振替休日になり、**4/30 は月末である**。実測で当たる年:
 *
 * ```
 *   2029-04-29 (日) → 振替 4/30 = 月末
 *   2035-04-29 (日) → 振替 4/30 = 月末
 *   2040-04-29 (日) → 振替 4/30 = 月末
 * ```
 *
 * つまり 3 月決算法人の 2 か月後期限などがこの日に当たると、法律上は 5/1 以降へ
 * 送られるのに、本モジュールは 4/30 を返す。
 *
 * **ずれる向きは安全側である。** 返す期限が法定より*早い*ので、その日までに
 * 申告すれば適法。遅い日を答えて期限を徒過させる向きには外れない。
 * それでも注記が「祝日は無視してよい」と読める形だったのを直すのは、
 * **理由が間違ったまま残ると、次に触る人が同じ結論を再利用する**ため。
 *
 * 祝日を本気で扱うには春分/秋分の天文計算と国民の休日まで要り、
 * 得られるのは「安全側のずれが年に数日消える」だけなので入れていない。
 * 入れるなら内閣府の暦要項を出典にすること。
 */
export function nextBusinessDay(d: Date): Date {
  let cur = d;
  // Stryker disable next-line EqualityOperator,AssignmentOperator: 14 は到達しない安全弁。
  // 実際の送り幅は最大でも 12/29 → 1/4 の 6 日で、7 以上ならどの上限でも同じ結果になる
  // （減算に変えても、開庁日が見つかった時点で return するため観測できない）。
  for (let i = 0; i < 14; i += 1) {
    const dow = cur.getUTCDay();
    const m = cur.getUTCMonth() + 1;
    const day = cur.getUTCDate();
    const yearEnd = (m === 12 && day >= 29) || (m === 1 && day <= 3);
    if (dow !== 0 && dow !== 6 && !yearEnd) return cur;
    cur = addDays(cur, 1);
  }
  return cur;
}

/** n か月後の月末日（暦のとおり。休日送りはしない）。 */
function monthEndAfter(year: number, month1: number, plusMonths: number): string {
  const total = month1 + plusMonths;
  const y = year + Math.floor((total - 1) / 12);
  const m = ((total - 1) % 12) + 1;
  return iso(lastDayOfMonth(y, m));
}

/**
 * n か月後の月末を期限として返す。期限が休日なら翌開庁日へ送る。
 * 対象期間の末日そのものは暦の日付なので `monthEndAfter` を使う。
 */
function dueMonthEndAfter(year: number, month1: number, plusMonths: number): string {
  return iso(nextBusinessDay(new Date(`${monthEndAfter(year, month1, plusMonths)}T00:00:00Z`)));
}

/** 課税期間の開始日（末日の 11 か月前の月初）。 */
function periodStart(input: ScheduleInput): { year: number; month: number } {
  const startTotal = input.fiscalEndMonth - 11;
  const y = input.fiscalEndYear + Math.floor((startTotal - 1) / 12);
  const m = ((((startTotal - 1) % 12) + 12) % 12) + 1;
  return { year: y, month: m };
}

// --- 年税額 -------------------------------------------------------------

/**
 * ある税率における年税額を求める。
 *
 * 国税分は `課税ベース × 税率 × 78/100`、地方消費税は
 * `納付すべき消費税額（国税・100円未満切捨て後）× 22/78`。
 * 78 : 22 は現行法の区分であり、税率が変われば法律上の区分も変わり得る。
 */
export function calcAnnualTax(input: ScheduleInput, rate: number, p: ScheduleParams = DEFAULT_SCHEDULE_PARAMS): AnnualTax {
  const r = Math.min(Math.max(rate, 0), MAX_RATE);
  const sales = Math.max(0, input.taxableSales);
  const purchases = Math.max(0, input.taxablePurchases);
  const localRatio = localRatioOf(p.nationalShare);

  const salesTaxNational = sales * r * p.nationalShare;
  let deductibleNational: number;
  if (input.method === 'simplified') {
    deductibleNational = salesTaxNational * Math.min(Math.max(input.deemedPurchaseRate, 0), 1);
  } else if (input.method === 'twenty-percent') {
    deductibleNational = salesTaxNational * (1 - p.twentyPercentRate);
  } else {
    deductibleNational = purchases * r * p.nationalShare;
  }

  const netNationalRaw = salesTaxNational - deductibleNational;
  const isRefund = netNationalRaw < 0;

  let national: number;
  let local: number;
  if (isRefund) {
    const refundNational = roundRefund(-netNationalRaw);
    national = -refundNational;
    local = -roundRefund(refundNational * localRatio);
  } else {
    national = floorHundred(netNationalRaw);
    local = floorHundred(national * localRatio);
  }

  return {
    rate: r,
    salesTaxNational,
    deductibleNational,
    netNationalRaw,
    national,
    local,
    total: national + local,
    isRefund,
  };
}

// --- 中間申告 -----------------------------------------------------------

/** 前課税期間の確定消費税額（国税分）から中間申告の回数を判定する。境目は `p` (既定 48 万 / 400 万 / 4,800 万)。 */
export function interimCount(priorNationalTax: number, p: ScheduleParams = DEFAULT_SCHEDULE_PARAMS): 0 | 1 | 3 | 11 {
  const t = Math.max(0, priorNationalTax);
  if (t <= p.interimTier1) return 0;
  if (t <= p.interimTier2) return 1;
  if (t <= p.interimTier3) return 3;
  return 11;
}

/** 円を万円で書く (48 / 400 / 4,800)。 */
function man(n: number): string {
  return (n / 10_000).toLocaleString('ja-JP', { maximumFractionDigits: 2 });
}

/** 中間申告の区分の説明文。境目の額は `p` から出す。 */
export function interimBandLabel(count: 0 | 1 | 3 | 11, p: ScheduleParams = DEFAULT_SCHEDULE_PARAMS): string {
  if (count === 0) return `${man(p.interimTier1)}万円以下 — 中間申告は不要（任意の中間申告制度あり）`;
  if (count === 1) return `${man(p.interimTier1)}万円超 ${man(p.interimTier2)}万円以下 — 年1回（6か月中間申告）`;
  if (count === 3) return `${man(p.interimTier2)}万円超 ${man(p.interimTier3)}万円以下 — 年3回（3か月中間申告）`;
  return `${man(p.interimTier3)}万円超 — 年11回（1か月中間申告）`;
}

/**
 * 中間申告の計画（回数・各回の額と期限）を組み立てる。
 *
 * 各回の中間納付額は「前課税期間の確定消費税額（国税分）× 対象月数/12」を
 * 100円未満切捨てしたもの。地方消費税はその 22/78。
 */
export function planInterim(input: ScheduleInput, p: ScheduleParams = DEFAULT_SCHEDULE_PARAMS): InterimPlan {
  const prior = Math.max(0, input.priorNationalTax);
  const count = interimCount(prior, p);
  const localRatio = localRatioOf(p.nationalShare);
  const start = periodStart(input);
  const payments: InterimPayment[] = [];

  if (count === 1) {
    const national = floorHundred((prior * 6) / 12);
    const local = floorHundred(national * localRatio);
    payments.push({
      no: 1,
      periodEnd: monthEndAfter(start.year, start.month, 5),
      due: dueMonthEndAfter(start.year, start.month, 7),
      national,
      local,
      total: national + local,
    });
  } else if (count === 3) {
    for (let i = 0; i < 3; i += 1) {
      const national = floorHundred((prior * 3) / 12);
      const local = floorHundred(national * localRatio);
      payments.push({
        no: i + 1,
        periodEnd: monthEndAfter(start.year, start.month, 3 * i + 2),
        due: dueMonthEndAfter(start.year, start.month, 3 * i + 4),
        national,
        local,
        total: national + local,
      });
    }
  } else if (count === 11) {
    // 課税期間開始後の1か月分は「開始日から2か月を経過した日から2か月以内」。
    // 申告期限延長の特例を受けている法人は開始後2か月分が「3か月を経過した日
    // から2か月以内」となり、以後9か月分は対象期間末日の翌日から2か月以内。
    const headMonths = input.extendedDeadline ? 2 : 1;
    const headDue = dueMonthEndAfter(start.year, start.month, input.extendedDeadline ? 4 : 3);
    for (let k = 1; k <= 11; k += 1) {
      const national = floorHundred(prior / 12);
      const local = floorHundred(national * localRatio);
      payments.push({
        no: k,
        periodEnd: monthEndAfter(start.year, start.month, k - 1),
        due: k <= headMonths ? headDue : dueMonthEndAfter(start.year, start.month, k + 1),
        national,
        local,
        total: national + local,
      });
    }
  }

  const total = payments.reduce((s, p) => s + p.total, 0);
  const totalNational = payments.reduce((s, p) => s + p.national, 0);
  return { count, priorNationalTax: prior, band: interimBandLabel(count, p), payments, total, totalNational };
}

// --- 確定申告 -----------------------------------------------------------

/** 確定申告・納付の期限。 */
export function finalDueDate(input: ScheduleInput): string {
  if (input.filer === 'individual') {
    return iso(nextBusinessDay(new Date(Date.UTC(input.fiscalEndYear + 1, 2, 31))));
  }
  return dueMonthEndAfter(input.fiscalEndYear, input.fiscalEndMonth, input.extendedDeadline ? 3 : 2);
}

/**
 * 年税額から中間納付を差し引いた、確定申告時に実際に動く金額を求める。
 * 中間納付が年税額を上回ると、本則で納付でも確定申告では還付になる。
 */
export function settle(input: ScheduleInput, annual: AnnualTax, interim: InterimPlan): FinalSettlement {
  const due = finalDueDate(input);
  const amount = annual.total - interim.total;
  const kind: FinalSettlement['kind'] = amount > 0 ? 'payment' : amount < 0 ? 'refund' : 'none';

  let refundWindow: FinalSettlement['refundWindow'];
  if (kind === 'refund') {
    const base = new Date(`${due}T00:00:00Z`);
    refundWindow = input.eTax
      ? {
          from: iso(nextBusinessDay(addDays(base, 14))),
          to: iso(nextBusinessDay(addDays(base, 21))),
          note: 'e-Tax で申告した場合のおおむねの目安（申告から2〜3週間程度）。期限より早く申告すればその分早まります。',
        }
      : {
          from: iso(nextBusinessDay(addDays(base, 30))),
          to: iso(nextBusinessDay(addDays(base, 45))),
          note: '書面で申告した場合のおおむねの目安（申告から1か月〜1か月半程度）。期限より早く申告すればその分早まります。',
        };
  }

  return { due, annualTotal: annual.total, interimTotal: interim.total, amount, kind, refundWindow };
}

// --- 税率の掃引 ---------------------------------------------------------

export interface RateRow {
  readonly rate: number;
  readonly annual: AnnualTax;
  readonly settlement: FinalSettlement;
}

/** 既定で表として見せる税率（0%〜50%）。現行の 8% / 10% を含む。 */
export const DEFAULT_RATE_POINTS: readonly number[] = [
  0, 0.03, 0.05, 0.08, 0.1, 0.12, 0.15, 0.2, 0.25, 0.3, 0.4, 0.5,
];

/** 指定した税率の一覧について、年税額と確定申告時の金額を求める。 */
export function sweepRates(
  input: ScheduleInput,
  rates: readonly number[] = DEFAULT_RATE_POINTS,
  p: ScheduleParams = DEFAULT_SCHEDULE_PARAMS,
): readonly RateRow[] {
  const interim = planInterim(input, p);
  return rates
    .filter((r) => r >= 0 && r <= MAX_RATE)
    .map((rate) => {
      const annual = calcAnnualTax(input, rate, p);
      return { rate, annual, settlement: settle(input, annual, interim) };
    });
}

/**
 * 確定申告時の金額の符号が入れ替わる税率（分岐税率）。
 *
 * 年税額は端数処理の前ではおおむね「課税ベース × 税率」に比例するため、
 * 中間納付の合計を課税ベースで割ると、確定申告で納付と還付が入れ替わる
 * 税率が求まる。課税ベースが 0 以下（＝どの税率でも還付、または課税なし）の
 * 場合と、分岐税率が 50% を超える場合は null。
 */
export function breakEvenRate(input: ScheduleInput, p: ScheduleParams = DEFAULT_SCHEDULE_PARAMS): number | null {
  const interim = planInterim(input, p);
  if (interim.total <= 0) return null;

  const sales = Math.max(0, input.taxableSales);
  let base: number;
  if (input.method === 'simplified') {
    base = sales * (1 - Math.min(Math.max(input.deemedPurchaseRate, 0), 1));
  } else if (input.method === 'twenty-percent') {
    base = sales * p.twentyPercentRate;
  } else {
    base = sales - Math.max(0, input.taxablePurchases);
  }
  // Stryker disable next-line EqualityOperator: <= を < にしても base===0 では
  // 除算が Infinity になり、直後の `r > MAX_RATE` で null になるため結果は同じ（等価変異）。
  if (base <= 0) return null;

  const r = interim.total / base;
  return r > MAX_RATE ? null : r;
}

/** 画面から 1 回で使えるようにまとめた結果。 */
export interface ScheduleResult {
  readonly annual: AnnualTax;
  readonly interim: InterimPlan;
  readonly settlement: FinalSettlement;
  readonly breakEven: number | null;
  readonly sweep: readonly RateRow[];
}

export function buildSchedule(input: ScheduleInput, rate: number, p: ScheduleParams = DEFAULT_SCHEDULE_PARAMS): ScheduleResult {
  const annual = calcAnnualTax(input, rate, p);
  const interim = planInterim(input, p);
  return {
    annual,
    interim,
    settlement: settle(input, annual, interim),
    breakEven: breakEvenRate(input, p),
    sweep: sweepRates(input, DEFAULT_RATE_POINTS, p),
  };
}
