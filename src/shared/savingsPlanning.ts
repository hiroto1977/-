import { nonNeg, finiteOrNull } from './num';
/**
 * 家計・貯蓄計画 (savings planning) — 概算試算。
 *
 * 目標達成に必要な毎月積立額・72 の法則 (資産倍増年数)・緊急予備資金を求める
 * 純粋関数群。毎月末積立・年率一定を仮定した概算で、IO は持たない。
 *
 * **重要 — 概算試算であり投資助言ではありません。** 実際の運用成績は変動し、
 * 元本割れの可能性があります。
 */

/** 月利 r = (1 + 年率)^(1/12) − 1。年率は % 値 (5 → 0.05)。 */
function monthlyRate(annualRatePct: number): number {
  return Math.pow(1 + annualRatePct / 100, 1 / 12) - 1;
}

const yen = (n: number): number => Math.round(n);

/**
 * 緊急予備資金の月数の目安 (既定 6 か月)。
 *
 * 一般的な目安は雇用形態で変わる —— 会社員 3〜6 か月 / 自営 6〜12 か月。
 * つまりこれは**判断の要る参考値**なので、台帳 `savings.emergencyFundMonths`
 * に登録してあり、画面は `useParameters()` で読んだ値を引数で渡す。
 * ここはその既定値の**唯一の出所**である (2 か所に書き写さない)。
 */
export const EMERGENCY_FUND_MONTHS_DEFAULT = 6;

/**
 * 積立・貯蓄計画を組み立てられる年数の上限。**画面の宣言と同じ数の唯一の出所。**
 *
 * `MutualFundsPage` の 積立年数 / 達成年数 の欄は `GuardedNumber` で
 * `max: 80` を宣言し、`guardNumber` は 81 年以上に ⛔ (fatal) を出す。だが
 * **`GuardedNumber` は入力を書き換えない** (黙って丸めないための意図的な設計)。
 * 上限の強制は計算側の責任であり、`depreciation.ts` の `MAX_SCHEDULE_YEARS` /
 * `isSchedulableLife` が 2026-08 監査で同じ形を先に直している。
 *
 * 2026-09-13 (パス 198) まで、この上限は**画面の literal `80` にしか無かった**。
 * 実測した結果:
 *
 * | 入力 | 実際に出ていた物 |
 * | --- | --- |
 * | 積立年数 100,000 年 | 将来評価額 **`¥∞`** · 運用益 `¥∞` · 運用益率 `Infinity%` |
 * | 達成年数 100,000 年 | 到達見込み **`¥∞`** で `onTrack === true` = **「達成」** |
 * | 達成年数 99,999,999 年 | 必要な毎月積立額 **`¥0`** (= 「積み立てなくてよい」) |
 *
 * `annual` 複利の枝は `for (i < Math.round(years))` を回すので、年数がそのまま
 * 反復回数になる —— **実測 1 億年で 243 ms** (答えは `Infinity`)。`useMemo` の中で
 * 1 文字打つたびに走るので、描画スレッドがその間止まる。
 *
 * 上限は 80 年 —— 人の資産形成の計画期間として実在の最長側 (20 歳から 100 歳) で、
 * これを超える入力は打ち間違いである。**黙って 80 に丸めない**: 丸めると
 * 「100,000 年の計画が 80 年で成り立つ」という別の誤りになるので、`null`
 * (算定不能) を返し、画面が「—」と理由を出す。
 */
export const MAX_PLAN_YEARS = 80;

/**
 * 計画を組み立てられる年数か (上限は {@link MAX_PLAN_YEARS})。
 *
 * **下限は見ない** —— 0 年・負の年数・非有限は各関数の既存の契約
 * (「0 を返す」) のままにしてある。`0 年積み立てたら 0 円` は**正しい答え**で、
 * 算定不能ではない。この述語が見るのは**上限だけ**である。
 */
export function isPlannableYears(years: number): boolean {
  return Number.isFinite(years) && years <= MAX_PLAN_YEARS;
}

/**
 * 目標額に到達するために必要な毎月積立額 (年金終価の逆算)。
 *
 * FV = PMT × ((1 + r)^n − 1) / r  を PMT について解く。r≈0 のときは PMT = FV / n。
 * 目標額・年数が 0 以下なら 0。
 *
 * @param targetFutureValue 目標額 (円)
 * @param annualRatePct 想定年率 (%)
 * @param years 積立年数
 */
export function requiredMonthlyContribution(
  targetFutureValue: number,
  annualRatePct: number,
  years: number,
): number | null {
  // 上限を超えた年数は算定不能 (`null`)。**0 を返すと「積み立てなくてよい」**
  // という最も安心させる向きの断定になる (実測: 99,999,999 年 → `¥0`)。
  // 目標額・年率も同じ契約で扱う (パス 204 の実測: どちらが非有限でも NaN が返っていた)。
  if (
    !isPlannableYears(years)
    || finiteOrNull(targetFutureValue) === null
    || finiteOrNull(annualRatePct) === null
  ) return null;
  // years <= 0 は下の n <= 0 (= round(years*12)) で捕捉されるため、ここでは
  // targetFutureValue のみ判定する。targetFutureValue===0 は計算経路でも 0 に
  // なり <= → < は equivalent のため EqualityOperator を無効化。
  // Stryker disable next-line EqualityOperator
  if (targetFutureValue <= 0) return 0;
  const n = Math.round(years * 12);
  if (n <= 0) return 0;
  const r = monthlyRate(annualRatePct);
  // r がほぼ 0 のとき元本均等割。1e-9 ちょうどは浮動小数で到達不能 → < / <= は equivalent。
  // Stryker disable next-line EqualityOperator
  if (Math.abs(r) < 1e-9) return yen(targetFutureValue / n);
  const factor = (Math.pow(1 + r, n) - 1) / r;
  // 防御分岐: 有効な年率では r≠0 のとき factor>0 が常に成立し、この分岐には到達しない
  // (異常な負率に対する除算保護)。到達不能のため各 mutator を無効化する。
  // Stryker disable next-line ConditionalExpression,EqualityOperator,ArithmeticOperator
  if (factor <= 0) return yen(targetFutureValue / n);
  return yen(targetFutureValue / factor);
}

/**
 * 72 の法則 — 資産が倍になるおおよその年数 = 72 ÷ 年率(%)。
 * 年率が 0 以下なら null (倍増しない / 算定不能)。
 */
export function yearsToDouble(annualRatePct: number): number | null {
  // 非有限は「0 年で倍になる」ではなく「算定不能」。
  if (finiteOrNull(annualRatePct) === null) return null;
  if (annualRatePct <= 0) return null;
  return Math.round((72 / annualRatePct) * 10) / 10;
}

/**
 * 緊急予備資金 = 毎月の生活費 (支出) × 月数。
 * 月数の既定は `EMERGENCY_FUND_MONTHS_DEFAULT` (一般的な目安: 会社員 3〜6 / 自営 6〜12 か月)。
 */
export function emergencyFund(
  monthlyExpense: number,
  months: number = EMERGENCY_FUND_MONTHS_DEFAULT,
): number {
  const e = nonNeg(monthlyExpense);
  const m = nonNeg(months);
  return yen(e * m);
}

// ---------------------------------------------------------------------------
// 追加指標 (round63) — いずれも純粋関数・概算試算であり投資助言ではありません。
// 既存関数の挙動は変更していません (加算的)。
// ---------------------------------------------------------------------------

/** 複利頻度。月複利 (monthly) と年複利 (annual) を区別する。 */
export type CompoundingFrequency = 'monthly' | 'annual';

/**
 * 複利頻度を選べる将来価値 (毎月末積立)。
 *
 * - `monthly`: 月利 r = (1 + 年率)^(1/12) − 1 を用い毎月複利。
 * - `annual` : 年 1 回複利。その年に積み立てた 12 × PMT は年内は無利息で、年末に
 *   既存残高 (前年までの繰越) にのみ年率を乗じてから当年積立を加える近似
 *   (利息付与は年 1 回・当年積立は翌年から運用)。同じ名目年率なら monthly より低くなる。
 *
 * 毎月積立額・年数が 0 以下、または非有限なら 0。
 *
 * @param monthlyContribution 毎月積立額 (円)
 * @param annualRatePct 想定年率 (%)
 * @param years 積立年数
 * @param frequency 複利頻度 (既定 'monthly')
 */
export function futureValueWithFrequency(
  monthlyContribution: number,
  annualRatePct: number,
  years: number,
  // 既定は月複利。分岐は frequency==='annual' のみを判定するため、'monthly' を
  // 他の文字列に変えても monthly 経路に落ち結果は不変 (equivalent) → StringLiteral 無効化。
  // Stryker disable next-line StringLiteral
  frequency: CompoundingFrequency = 'monthly',
): number | null {
  if (!Number.isFinite(monthlyContribution) || !Number.isFinite(annualRatePct) || !Number.isFinite(years)) {
    return 0;
  }
  // 上限を超えた年数は算定不能 (`null`)。`annual` の枝は年数を反復回数にするので、
  // ここは**答えの正しさと描画スレッドの両方**の関門である (実測 1 億年 = 243 ms)。
  if (!isPlannableYears(years)) return null;
  // 負の積立額・年数は 0 にクランプ。これ以降 pmt>=0・yrs>=0 が保証され、
  // 年数 0 (= periods/n が 0) のときは各計算経路がそのまま 0 を返すため、
  // 追加の <=0 早期 return ガードは冗長 (equivalent) として置かない。
  const pmt = nonNeg(monthlyContribution);
  const yrs = nonNeg(years);

  if (frequency === 'annual') {
    const annual = annualRatePct / 100;
    const yearlyContribution = pmt * 12;
    const periods = Math.round(yrs);
    let balance = 0;
    for (let i = 0; i < periods; i += 1) {
      // 既存残高にのみ利息を付与し、当年積立を年末に無利息で加える。
      balance = balance * (1 + annual) + yearlyContribution;
    }
    return yen(balance);
  }

  const n = Math.round(yrs * 12);
  const r = monthlyRate(annualRatePct);
  // r がほぼ 0 のとき元本そのまま。1e-9 ちょうどは浮動小数で到達不能 → < / <= は equivalent。
  // Stryker disable next-line EqualityOperator
  if (Math.abs(r) < 1e-9) return yen(pmt * n);
  return yen(pmt * ((Math.pow(1 + r, n) - 1) / r));
}

/**
 * インフレ調整後の実質価値。将来の名目額を、実質購買力 (現在価値) に割り引く。
 *
 *   実質値 = 名目額 / (1 + インフレ率)^年数
 *
 * 年数が 0 以下なら割引なし (= 名目額をそのまま丸めて返す)。名目額・インフレ率・
 * 年数が非有限なら 0。インフレ率が −100% 以下 (= 1 + i <= 0) は実質値が定義できない
 * ため 0 を返す。
 *
 * @param nominalAmount 将来の名目額 (円)
 * @param annualInflationPct 年率インフレ率 (%)
 * @param years 経過年数
 */
export function inflationAdjustedValue(
  nominalAmount: number,
  annualInflationPct: number,
  years: number,
): number | null {
  // 上限を超えた年数は算定不能 (`null`)。`0` を返すと「実質価値はゼロ」という
  // **別の断定**になる (実測: 99,999,999 年 → `¥0`)。
  if (!isPlannableYears(years)) return null;
  if (!Number.isFinite(nominalAmount) || !Number.isFinite(annualInflationPct) || !Number.isFinite(years)) {
    return 0;
  }
  // years<0 は割引でなく増価になってしまうため早期 return が必要。years===0 ちょうどは
  // 下の式でも pow(1+i,0)=1 → nominal と一致するため <= → < は equivalent。
  // Stryker disable next-line EqualityOperator
  if (years <= 0) return yen(nominalAmount);
  const i = annualInflationPct / 100;
  // 1 + i <= 0 は割引係数が 0 以下/負になり実質値を定義できない。
  if (1 + i <= 0) return 0;
  return yen(nominalAmount / Math.pow(1 + i, years));
}

/**
 * 実質利回り (フィッシャー方程式) = (1 + 名目) / (1 + インフレ) − 1。% 値で返す。
 *
 * 名目・インフレ率が非有限なら null。1 + インフレ率 <= 0 (−100% 以下) は定義不能で null。
 *
 * @param nominalRatePct 名目年率 (%)
 * @param annualInflationPct 年率インフレ率 (%)
 */
export function realRateOfReturn(
  nominalRatePct: number,
  annualInflationPct: number,
): number | null {
  if (!Number.isFinite(nominalRatePct) || !Number.isFinite(annualInflationPct)) return null;
  const nominal = nominalRatePct / 100;
  const inflation = annualInflationPct / 100;
  if (1 + inflation <= 0) return null;
  const real = (1 + nominal) / (1 + inflation) - 1;
  return Math.round(real * 100 * 100) / 100;
}

/** 緊急予備資金の充足状況。 */
export interface EmergencyFundCoverage {
  /** 目標とする緊急予備資金 (円)。 */
  readonly target: number;
  /**
   * 充足率 (%)。**目標が定まらなければ `null`** (2026-09-08 · パス 90)。
   *
   * 目標は `月支出 × 月数` で、`MutualFundsPage` は月支出を
   * `readNumberOr0` で読む —— **空欄なら 0** になる。2026-09-08 まで
   * `target <= 0` のとき `cash > 0 ? 100 : 0` を返していたので、
   * **生活費を 1 円も入力していない人に「予備資金 充足率 100%」**と出していた。
   *
   * **規準は同じ戻り値の中に在った**: すぐ下の `monthsCovered` は
   * `expense > 0` でなければ `null` を返し、画面も「—」を出している。
   * 1 つのオブジェクトの中で、片方が「算定不能」と言い、片方が
   * **最も安心させる向きの断定**をしていた (パス 61 と同じ形で、
   * 今回は**財務の安全性**についての主張)。
   */
  readonly coveragePct: number | null;
  /** 目標に対する不足額 (円)。充足済みなら 0。 */
  readonly shortfall: number;
  /** 現預金でまかなえる月数 (小数第 1 位)。月支出が 0 以下なら null。 */
  readonly monthsCovered: number | null;
}

/**
 * 緊急予備資金の充足率。現預金が「月支出 × 月数」の目標をどれだけ満たすか。
 *
 * @param cashOnHand 現預金 (円)
 * @param monthlyExpense 毎月の生活費 (円)
 * @param months 目標月数 (既定 `EMERGENCY_FUND_MONTHS_DEFAULT`)
 */
export function emergencyFundCoverage(
  cashOnHand: number,
  monthlyExpense: number,
  months: number = EMERGENCY_FUND_MONTHS_DEFAULT,
): EmergencyFundCoverage {
  const cash = Number.isFinite(cashOnHand) ? Math.max(0, cashOnHand) : 0;
  const expense = Number.isFinite(monthlyExpense) ? Math.max(0, monthlyExpense) : 0;
  const m = Number.isFinite(months) ? Math.max(0, months) : 0;
  const target = yen(expense * m);

  // **目標が定まらなければ充足率は出さない。** 目標 0 は「予備資金は要らない」
  // ではなく、たいていは**月支出を入力していない**という意味である
  // (画面は `readNumberOr0` で読むので空欄が 0 になる)。
  const coveragePct = target > 0 ? Math.round((cash / target) * 100 * 10) / 10 : null;

  const shortfall = Math.max(0, target - cash);
  const monthsCovered = expense > 0 ? Math.round((cash / expense) * 10) / 10 : null;

  return { target, coveragePct, shortfall, monthsCovered };
}

/**
 * 目標達成見込みの判定結果。
 *
 * **年数が {@link MAX_PLAN_YEARS} を超えると全欄が `null` (算定不能)。**
 * 2026-09-13 (パス 198) まで、この構造体は範囲外の年数から
 * `projected: Infinity` / `onTrack: true` / `shortfall: 0` を作っていた ——
 * 画面はそれを **「到達見込み ¥∞ (達成)」** と刷り、利用者に
 * *目標は達成済み* と告げていた。`onTrack` を `boolean | null` にしたのは、
 * `false` も「未達」という**同じ重さの断定**だからである。
 */
export interface GoalProjection {
  /** 現行積立で到達する将来価値 (円)。算定不能なら `null`。 */
  readonly projected: number | null;
  /** 目標額に届くか。算定不能なら `null` (`false` = 「未達」とは別)。 */
  readonly onTrack: boolean | null;
  /** 目標に対する不足額 (円)。届くなら 0。算定不能なら `null`。 */
  readonly shortfall: number | null;
  /** 目標達成に必要な毎月積立額 (円)。算定不能なら `null`。 */
  readonly requiredMonthly: number | null;
  /** 目標達成に必要な追加積立額 = 必要額 − 現行 (円)。既に十分なら 0。算定不能なら `null`。 */
  readonly additionalMonthly: number | null;
}

/**
 * 現行の毎月積立で目標期日に目標額へ届くかを判定し、不足額・必要追加額を求める。
 *
 * 将来価値は月複利 (年金終価) で概算。目標額・年数が 0 以下なら不足 0・必要額 0 を返す。
 *
 * @param currentMonthly 現行の毎月積立額 (円)
 * @param targetFutureValue 目標額 (円)
 * @param annualRatePct 想定年率 (%)
 * @param years 積立年数
 */
export function goalProjection(
  currentMonthly: number,
  targetFutureValue: number,
  annualRatePct: number,
  years: number,
): GoalProjection {
  const current = Number.isFinite(currentMonthly) ? Math.max(0, currentMonthly) : 0;
  // requiredMonthlyContribution が月複利前提のため、見込み額も 'monthly' で整合させる。
  // 'annual' 以外の文字列は monthly 経路に落ち結果不変 (equivalent) → StringLiteral 無効化。
  // Stryker disable next-line StringLiteral
  const projected = futureValueWithFrequency(current, annualRatePct, years, 'monthly');
  const requiredMonthly = requiredMonthlyContribution(targetFutureValue, annualRatePct, years);
  const target = Number.isFinite(targetFutureValue) ? Math.max(0, targetFutureValue) : 0;

  // **算定できなかった物から判定を作らない。** 到達見込みが出ていないのに
  // 「達成」と答えるのがパス 198 で見つけた形なので、1 つでも `null` なら
  // この構造体は全欄 `null` を返す (値と理由を 1 つの判定から出す・パス 84)。
  if (projected === null || requiredMonthly === null) {
    return { projected: null, onTrack: null, shortfall: null, requiredMonthly: null, additionalMonthly: null };
  }

  const onTrack = projected >= target;
  const shortfall = Math.max(0, target - projected);
  const additionalMonthly = Math.max(0, requiredMonthly - current);

  return { projected, onTrack, shortfall, requiredMonthly, additionalMonthly };
}
