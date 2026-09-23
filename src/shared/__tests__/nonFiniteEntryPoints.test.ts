/**
 * 非有限な入力を入口に当てて、**出てくる物が有限か・明示的に断るか**を測る (パス 203)。
 *
 * ## なぜ走査ではなく振る舞いを測るか
 *
 * パス 201 / 202 は走査 (`sanitizerCensus`) で「消毒の書き方」を留めた。それは
 * 綴りの規律には効くが、**到達可能性を見られない** —— 数行上で守っている形も、
 * 上流で消毒済みの局所値も、区別するには読むしかなかった。パス 202 は
 * 「比較だけの関門」49 件 (46 関数) を母集団として数え、**そのうち 1 件だけ**を
 * 実測で直して「残り 48 件を安全とは言わない」と書いた。
 *
 * **パス 203 でその 48 件を測ったら、機械的に呼べる 14 件のうち 14 件が
 * 非有限を返すか投げた。** 「分母のほとんどは無害だろう」という私の見立ては
 * 外れていた —— パス 198 の教訓 (「測る前に書いた severity は外れる」) が
 * そのまま当てはまる。
 *
 * 実測 (直す前・2026-09-13):
 *
 * | 入口 | 直す前 |
 * | --- | --- |
 * | `calcBaseIncomeTax(NaN)` | **TypeError で落ちる** (`bracket!.rate`) |
 * | `marginalIncomeTaxRate(NaN)` | **TypeError で落ちる** |
 * | `straightLineSchedule(NaN, 10)` | 10 年分すべて `NaN` の償却表 |
 * | `calcEarthquakeInsuranceDeduction(NaN)` | `{incomeTax: NaN, residentTax: NaN}` |
 * | `computeRunwayMonths(1e6, NaN)` | `NaN` か月 |
 * | `noBreakEvenNote(NaN, 10)` | 「10 期のうち **NaN 期**は…」という**文章** |
 * | `unrunnableSkillsNote(NaN)` | 「このうち **NaN 件**は実行できません」 |
 * | ほか 7 件 | `NaN` / `Infinity` |
 *
 * `calcBaseIncomeTax` の落ちる理由は残しておく価値がある: 速算表の `find` に
 * 「Infinity 上限ブラケットが必ず最後に在るので `bracket` は常に定義される」と
 * **コメントで書かれていた**。それは**有限な入力についてだけ成り立つ** ——
 * `NaN <= Infinity` は false なので `find` は `undefined` を返し、`!` が
 * 型検査器の異議を消していた。**前提を書いたコメントと、前提を消す `!` が
 * 並んでいるときは疑う。**
 *
 * ## 直し方は戻り値の契約で決まる
 *
 * | 契約 | 非有限のとき | 理由 |
 * | --- | --- | --- |
 * | `number` (金額・税額) | `0` (`nonNeg`) | 既に `<= 0` の枝が在り、そこへ届ける |
 * | `number \\| null` | **`null`** (`finiteOrNull`) | 「算定不能」の道が既に在る。0 は「0 である」という主張になる |
 * | 文 (`string \\| null` ほか) | 文を出さない | **NaN を文章に埋めない** |
 *
 * ## 走査が挙げなかった側も見る
 *
 * `noBreakEvenNote(missing, total)` は `if (missing <= 0)` しか持たないので
 * 走査は `missing` だけを挙げた。だが `total` も**文章に埋め込まれる** ——
 * `noBreakEvenNote(3, NaN)` は「NaN 期のうち 3 期は…」になる。
 * **だからこの検査は、各入口の数値の位置を 1 つずつ全部置き換える。**
 *
 * ## 守りが重なっている所がある (対照が鳴らなかった記録)
 *
 * `calcBaseIncomeTax` の入口の消毒**だけ**を外しても、この検査は落ちない ——
 * 下流の `floorTaxableThousand` が既に 0 に倒すため。つまりあの経路で
 * **荷重を持っているのは `floorTaxableThousand` 側の消毒**で、
 * `calcBaseIncomeTax` 自身のものは重ね着である。
 *
 * **鳴らない対照は「合格」ではなく、その対照についての報せ。** 両方を外すと
 * `TypeError` が戻り、`marginalIncomeTaxRate` (下流に守りが無い経路) は
 * 単独で外しても投げるようになる —— そこまで測って初めて「守られている」と言える。
 *
 * ## パス 204 — 台帳が片側だけだった (双方向にした)
 *
 * パス 203 の台帳 16 件は**手で選んでいた**。リポジトリの規律
 * 「数を 2 か所に書くと必ず食い違う」/「母集団の総当たりをゲートにする」
 * (パス 117) に照らして、これは片側の台帳である。パス 204 で
 * `findComparisonOnlyGuards` を足し、**走査が挙げた export 関数はすべて
 * 台帳か免除台帳のどちらかに在ること**をゲートにした (★ 双方向)。
 *
 * 免除には理由を書かせる。今のところ理由は 4 種類しかない:
 *
 * | 理由 | 例 |
 * | --- | --- |
 * | 宣言された `@throws` (`assertNonNegativeFinite`) で**明示的に断る** | `inheritanceTaxOnShare` ほか 7 モジュール |
 * | 引数がコードの定数からしか来ない | `sma/ema/rsi(closes, period)` の `period` (14 / 20 / 50) |
 * | 型が非有限を許さない | `interimBandLabel(count: 0 \| 1 \| 3 \| 11)` |
 * | 上流の漏斗が非有限を落としてから渡す | `computeLaborMetrics` / `buildManagementReport` |
 *
 * ### `!(x > 0)` と `x <= 0` は同じではない。だが否定形も十分ではない
 *
 * **これがこの家系の中心にある区別である。** `NaN <= 0` は false なので
 * `if (x <= 0)` は NaN を通すが、`!(NaN > 0)` は **true** なので
 * `if (!(x > 0))` は NaN を落とす。リポジトリには両方の綴りが在り、
 * 通っていたのは前者だけだった —— **規準は毎回、隣のファイルか隣の関数に在った。**
 *
 * ★ **そして否定形も非有限の片側しか落とさない。** この節の初版で私は
 * 「否定形の関門を持つから免除してよい」と書いた。台帳に足して測った直後に
 * この検査が落ちた:
 *
 *     roundUpYearsOfService(Infinity) → Infinity   （勤続年数が Infinity 年）
 *     calcDscr(1e6, Infinity)         → {dscr: 0, band: 'danger'}
 *
 * `Infinity > 0` は **true** なので否定形の関門を通り抜ける。
 * `roundUpYearsOfService` の関門には「`!(>0)` で 0・負値・NaN を一括ガード」と
 * **コメントで書かれていた** —— パス 203 の `calcBaseIncomeTax` と同じ形
 * (「前提を書いたコメントが、前提の成り立つ範囲を書いていない」)。
 * だから免除の理由から否定形を外し、走査が `!(x > 0)` を関門として認める一方で
 * **両方を台帳に載せて実測する**形にした。`nonNeg` / `finiteOrNull` は
 * NaN と ±Infinity の**両方**を落とすので、そちらが正典である。
 *
 * ### パス 204 の実測から (直す前)
 *
 * | 入口 | 直す前 | 向き |
 * | --- | --- | --- |
 * | `humanizeCrackTime(NaN)` | **「事実上解読不能」** | 最も安心させる側 |
 * | `calcDscr(NaN, 1e6)` | `{dscr: NaN, band: **'healthy'**}` | 銀行に渡る側 |
 * | `furusatoOneStopEligibility(NaN, false)` | **`eligible: true`** | 申告不要と告げる側 |
 * | `calcLifeInsuranceDeduction({general/medical/pension: NaN})` | **`{120,000, 70,000}`** = 満額 | 税額を小さく見せる側 |
 * | `calcSalaryIncomeDeduction(x, NaN)` | 改正前の表 | 年分が黙って古くなる |
 * | `residentPerCapitaBreakdown(NaN)` | 総額 4,000 円 (2013 年度以前) | 同上・**しかも逆向きの兄弟が在る** |
 * | `calcSocialInsurance(NaN)` | `{96,624, 34,800, NaN, NaN}` | もっともらしい数と NaN の混合 |
 * | `decliningBalanceSchedule(NaN, 10)` / `amortizationSchedule(NaN, …)` | 全行 NaN の表 | — |
 * | `clampToCeiling('abcdef', NaN)` | **切らずにそのまま返す** | 天井が黙って外れる |
 * | `restoreResultMessage(plan, NaN, 0)` | 「**NaN 件**のレコードを復元しました」 | 文に NaN |
 * | `shigyoDemoMixNote(NaN, 2, …)` | 「連携 **NaN** 名」 | 文に NaN |
 *
 * **「読めない値から最も都合のよい答えを作る」向きが 4 件在った** ——
 * パス 86 (「安全側に倒す」が逆向き) と同じ形が、今度は 4 か所で見つかった。
 */

import * as path from 'node:path';

import { describe, expect, it } from 'vitest';

import { computeRunwayMonths } from '../../renderer/data/accounting';
import { restoreResultMessage, type RestorePlan } from '../../renderer/data/backup';
import { computeBudgetVarianceFromFundamentals } from '../../renderer/data/budgetVariance';
import { noBreakEvenNote, unreadablePeriodNote, unreadablePeriodSheetNote } from '../../renderer/data/kpiActuals';
import { shigyoDemoMixNote } from '../../renderer/data/shigyoDirectory';
import { villageSummary } from '../../renderer/data/villageData';
import { acceptRateOf } from '../api/cursor';
import {
  straightLineAnnual,
  straightLineSchedule,
  proratedDepreciation,
  decliningBalanceSchedule,
} from '../depreciation';
import { amortizationSchedule, monthlyPayment } from '../funding';
import { clampToCeiling } from '../inputCeiling';
import { calcSharpeRatio } from '../mutualFundsMetrics';
import { calcMonthlySocialInsurance } from '../payroll';
import { estimateCrackSeconds, humanizeCrackTime, CRACK_TIME_UNMEASURABLE } from '../passwordStrength';
import { groupByTaxKind, resolveRate } from '../invoiceTax';
import { calcDscr } from '../realEstateMetrics';
import { requiredMonthlyContribution, yearsToDouble } from '../savingsPlanning';
import { unrunnableSkillsNote } from '../skillIdentity';
import {
  calcBaseIncomeTax,
  calcBasicDeduction,
  calcConsumptionTax,
  calcNetSalary,
  calcResidentAdjustmentCredit,
  calcResidentTax,
  calcSalaryIncomeDeduction,
  calcSalaryWithDeductions,
  floorTaxableThousand,
  marginalIncomeTaxRate,
  residentPerCapitaBreakdown,
} from '../taxCalc';
import { roundRefund } from '../taxConsumptionSchedule';
import {
  calcEarthquakeInsuranceDeduction,
  calcLifeInsuranceDeduction,
  spouseIncomeLimitYen,
} from '../taxDeductions';
import { furusatoOneStopEligibility } from '../taxFurusato';
import { inheritanceTaxOnShare } from '../taxInheritance';
import { calcRetirementTax, retirementDeduction, roundUpYearsOfService } from '../taxRetirement';
import { calcSocialInsurance } from '../taxSocialInsurance';
import { solveGrossForTakeHomeChecked } from '../welfareScheme';

import { readOriginalSource, readOriginalDirEntries, isInstrumented } from './originalSource';

/** 非有限の 3 形。`-Infinity` も入れる —— `Math.max(0, -Infinity)` は 0 に落ちるので見逃しやすい。 */
const NON_FINITE: readonly number[] = [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY];

/**
 * 入口の台帳。`args` は正常な引数で、検査はその**各位置**を順に非有限へ置き換える。
 *
 * 新しい「比較だけで測れるかを決める」入口を足したら、ここにも足す
 * (下の ★ が走査と突き合わせる)。
 */
interface EntryPoint {
  readonly label: string;
  readonly args: readonly number[];
  readonly call: (...a: readonly number[]) => unknown;
  /**
   * **宣言された断り**として投げる入口 (`assertNonNegativeFinite`)。
   *
   * 投げること自体は 3 番目の正しい答えである —— 0 でも `null` でもなく
   * 「その入力は受け取らない」。ただし**偶然の `TypeError` と区別が付かなければ
   * 意味が無い**ので、この印を付けた入口には「投げた Error の文面が
   * 渡した値を名指しすること」を要求する。パス 203 で見つけた
   * `calcBaseIncomeTax` の `bracket!.rate`
   * (`Cannot read properties of undefined`) はこの検査を通らない。
   */
  readonly refusesByThrow?: true;
  /** 台帳と走査を突き合わせるための、走査側の関数名 (label と違うときだけ)。 */
  readonly scanName?: string;
}

/** 復元計画の最小の実物 (件数だけを差し替えて文面を測る)。 */
const MERGE_PLAN: RestorePlan = {
  mode: 'merge',
  exportedAt: '2026-09-13T00:00:00.000Z',
  incoming: 1,
  existing: 1,
  toImport: [],
  added: 1,
  overwritten: 0,
  newerLocal: 0,
  lost: 0,
  localOnly: 0,
  unusableLocal: 0,
  dropped: 0,
};

const ENTRY_POINTS: readonly EntryPoint[] = [
  { label: 'computeRunwayMonths', args: [1_000_000, -100_000], call: (a, b) => computeRunwayMonths(a!, b!) },
  { label: 'noBreakEvenNote', args: [3, 10], call: (a, b) => noBreakEvenNote(a!, b!) },
  { label: 'acceptRateOf', args: [5, 20], call: (a, b) => acceptRateOf(a!, b!) },
  { label: 'straightLineAnnual', args: [1_000_000, 10], call: (a, b) => straightLineAnnual(a!, b!) },
  { label: 'straightLineSchedule', args: [1_000_000, 10], call: (a, b) => straightLineSchedule(a!, b!) },
  { label: 'proratedDepreciation', args: [120_000, 6], call: (a, b) => proratedDepreciation(a!, b!) },
  { label: 'monthlyPayment', args: [10_000_000, 0.02, 360], call: (a, b, c) => monthlyPayment(a!, b!, c!) },
  { label: 'yearsToDouble', args: [5], call: (a) => yearsToDouble(a!) },
  { label: 'unrunnableSkillsNote', args: [3], call: (a) => unrunnableSkillsNote(a!) },
  // 期が読めず除いた件数の断り (パス 225)。非有限・未定義は「言うことが無い」と同じ null。
  { label: 'unreadablePeriodNote', args: [2], call: (a) => unreadablePeriodNote('実績', a!) },
  { label: 'unreadablePeriodSheetNote', args: [2], call: (a) => unreadablePeriodSheetNote(a!) },
  { label: 'floorTaxableThousand', args: [1_234_567], call: (a) => floorTaxableThousand(a!) },
  { label: 'calcBaseIncomeTax', args: [5_000_000], call: (a) => calcBaseIncomeTax(a!) },
  { label: 'marginalIncomeTaxRate', args: [5_000_000], call: (a) => marginalIncomeTaxRate(a!) },
  { label: 'calcConsumptionTax', args: [1_000_000, 0.1], call: (a, b) => calcConsumptionTax(a!, b!) },
  { label: 'calcResidentAdjustmentCredit', args: [1_500_000, 50_000], call: (a, b) => calcResidentAdjustmentCredit(a!, b!) },
  { label: 'roundRefund', args: [1_234.56], call: (a) => roundRefund(a!) },
  { label: 'calcEarthquakeInsuranceDeduction', args: [40_000], call: (a) => calcEarthquakeInsuranceDeduction(a!) },

  // ── パス 204 で足した入口 (走査が挙げたが機械的に呼べなかった側) ──
  { label: 'calcRetirementTax', args: [5_000_000, 10], call: (a, b) => calcRetirementTax(a!, b!) },
  { label: 'retirementDeduction', args: [10], call: (a) => retirementDeduction(a!) },
  { label: 'roundUpYearsOfService', args: [5.5], call: (a) => roundUpYearsOfService(a!) },
  { label: 'calcSocialInsurance', args: [5_000_000], call: (a) => calcSocialInsurance(a!) },
  { label: 'calcMonthlySocialInsurance', args: [300_000], call: (a) => calcMonthlySocialInsurance(a!) },
  { label: 'calcNetSalary', args: [5_000_000, 2026], call: (a, b) => calcNetSalary(a!, b!) },
  { label: 'calcResidentTax', args: [3_000_000], call: (a) => calcResidentTax(a!) },
  { label: 'calcSalaryIncomeDeduction', args: [5_000_000, 2026], call: (a, b) => calcSalaryIncomeDeduction(a!, b!) },
  { label: 'calcBasicDeduction', args: [3_000_000, 2026], call: (a, b) => calcBasicDeduction(a!, b!) },
  {
    label: 'calcSalaryWithDeductions',
    args: [5_000_000, 500_000, 400_000, 30_000, 50_000, 1, 2026],
    call: (a, b, c, d, e, f, g) => calcSalaryWithDeductions(a!, b!, c!, d!, e!, f!, g!),
  },
  { label: 'residentPerCapitaBreakdown', args: [2026], call: (a) => residentPerCapitaBreakdown(a!) },
  { label: 'spouseIncomeLimitYen', args: [2026], call: (a) => spouseIncomeLimitYen(a!) },
  { label: 'solveGrossForTakeHomeChecked', args: [4_000_000], call: (a) => solveGrossForTakeHomeChecked(a!) },
  { label: 'calcSharpeRatio', args: [5, 10, 0.5], call: (a, b, c) => calcSharpeRatio(a!, b!, c!) },
  { label: 'requiredMonthlyContribution', args: [10_000_000, 3, 10], call: (a, b, c) => requiredMonthlyContribution(a!, b!, c!) },
  { label: 'decliningBalanceSchedule', args: [1_000_000, 10, 2], call: (a, b, c) => decliningBalanceSchedule(a!, b!, c!) },
  { label: 'amortizationSchedule', args: [10_000_000, 0.02, 12, 0], call: (a, b, c, d) => amortizationSchedule(a!, b!, c!, '2026-01', d!) },
  { label: 'estimateCrackSeconds', args: [60, 1e10], call: (a, b) => estimateCrackSeconds(a!, b!) },
  { label: 'humanizeCrackTime', args: [3600], call: (a) => humanizeCrackTime(a!) },
  { label: 'clampToCeiling', args: [4], call: (a) => clampToCeiling('abcdef', a!) },
  { label: 'calcDscr', args: [1_200_000, 1_000_000], call: (a, b) => calcDscr(a!, b!) },
  { label: 'furusatoOneStopEligibility', args: [3, 5], call: (a, b) => furusatoOneStopEligibility(a!, false, b!) },
  { label: 'calcLifeInsuranceDeduction', args: [80_000, 80_000, 80_000, 100_000], call: (a, b, c, d) => calcLifeInsuranceDeduction({ general: a!, medical: b!, pension: c!, generalOld: d! }) },
  { label: 'restoreResultMessage', args: [5, 0], call: (a, b) => restoreResultMessage(MERGE_PLAN, a!, b!) },
  { label: 'shigyoDemoMixNote', args: [2, 3], call: (a, b) => shigyoDemoMixNote(a!, b!, '¥50,000') },
  {
    label: 'computeBudgetVarianceFromFundamentals',
    args: [1_000_000, 600_000, 1_200_000, 700_000],
    call: (a, b, c, d) => computeBudgetVarianceFromFundamentals(
      { revenue: a!, cogs: b!, advertising: 0, sga: 0, depreciation: 0 },
      { revenue: c!, cogs: d!, advertising: 0, sga: 0, depreciation: 0 },
    ),
  },
  // ── パス 205 で足した入口 (`Math.max(0, <アローの仮引数の欄>)` の側) ──
  { label: 'resolveRate', args: [0.1], call: (a) => resolveRate('customA', { customRateA: a! }) },
  // **税率の位置だけを振る。** `groups[].lines` は**呼び側が渡した行をそのまま
  // 返す**設計 (画面が明細を並べるため) なので、非有限の単価・数量はそこに
  // 「渡されたまま」現れる —— それは計算結果ではなく入力の写しである。
  // 導出される `subtotal` / `tax` / `total` は `lineAmount` が 0 に倒す
  // (パス 94)。下の `it` でその 2 つを別々に留める。
  {
    label: 'groupByTaxKind',
    args: [0.1],
    call: (a) => groupByTaxKind([{ name: 'A', qty: 2, unitPrice: 1000, kind: 'standard' }], { standardRate: a! }),
  },
  { label: 'villageSummary', args: [4], call: (a) => villageSummary({
    org: { ceo: { id: 'c', title: 'CEO', name: 'c' }, coo: { id: 'o', title: 'COO', name: 'o' },
      executives: [], secretaries: [{ id: 's', title: '秘書室', members: a! }], managers: [] },
    teams: [], rounds: [], backlog: [],
  } as never) },
  // **宣言された断り**: `@throws taxableShare が負値・非有限のとき` (`assertNonNegativeFinite`)。
  // 7 モジュール・24 か所で使われているリポジトリの方針で、0 や null を推測せず断る。
  { label: 'inheritanceTaxOnShare', args: [50_000_000], call: (a) => inheritanceTaxOnShare(a!), refusesByThrow: true },
];

/** 値の中に非有限な数、または "NaN" / "Infinity" を含む文が在れば、その説明を返す。 */
export function describeNonFinite(v: unknown, path = ''): string | null {
  if (typeof v === 'number') {
    return Number.isFinite(v) ? null : `${path || '戻り値'} = ${String(v)}`;
  }
  if (typeof v === 'string') {
    // **文章に NaN / Infinity が埋まっていないか。** 数として有限でも、
    // 文に書かれていれば利用者はそれを読む。
    const m = /NaN|Infinity/.exec(v);
    return m === null ? null : `${path || '戻り値'} の文に "${m[0]}" が入っている`;
  }
  if (Array.isArray(v)) {
    for (const [i, x] of v.entries()) {
      const r = describeNonFinite(x, `${path}[${i}]`);
      if (r !== null) return r;
    }
    return null;
  }
  if (v !== null && typeof v === 'object') {
    for (const [k, x] of Object.entries(v as Record<string, unknown>)) {
      const r = describeNonFinite(x, path === '' ? k : `${path}.${k}`);
      if (r !== null) return r;
    }
    return null;
  }
  return null;
}

describe('非有限な入力を入口に当てる (出てくる物は有限か、明示的に断るか)', () => {
  it('★ 実物: どの入口も、どの位置に非有限を入れても、非有限を返さず投げない', () => {
    const found: string[] = [];
    for (const ep of ENTRY_POINTS) {
      for (const [pos] of ep.args.entries()) {
        for (const bad of NON_FINITE) {
          const args = ep.args.map((a, i) => (i === pos ? bad : a));
          let out: unknown;
          try {
            out = ep.call(...args);
          } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            // **宣言された断り**なら、文面が渡した値を名指ししていることを要求する。
            // これで偶然の `TypeError` (パス 203 の `bracket!.rate`) とは区別が付く。
            if (ep.refusesByThrow === true && msg.includes(String(bad))) continue;
            found.push(`${ep.label}(第${pos + 1}引数=${String(bad)}) が投げる: ${msg}`);
            continue;
          }
          const why = describeNonFinite(out);
          if (why !== null) found.push(`${ep.label}(第${pos + 1}引数=${String(bad)}) → ${why}`);
        }
      }
    }
    expect(found).toEqual([]);
  });

  it('★ 正常な引数では答えが変わっていない (消毒は有限の値を素通りさせるだけ)', () => {
    // 直す前後で動いてはいけない値を明示的に留める。消毒が「ついでに何かを
    // 変えていない」ことの対照 —— これが無いと「全部 0 にした」でも ★ が通る。
    expect(floorTaxableThousand(1_234_567)).toBe(1_234_000);
    expect(marginalIncomeTaxRate(5_000_000)).toBe(0.2);
    expect(calcConsumptionTax(1_000_000, 0.1)).toBe(100_000);
    expect(straightLineAnnual(1_000_000, 10)).toBe(100_000);
    expect(monthlyPayment(10_000_000, 0.02, 360)).toBe(36_962);
    expect(yearsToDouble(5)).toBe(14.4);
    expect(acceptRateOf(5, 20)).toBe(25);
    expect(computeRunwayMonths(1_000_000, -100_000)).toBe(10);
    expect(roundRefund(1_234.56)).toBe(1_234);
    expect(calcEarthquakeInsuranceDeduction(40_000)).toEqual({ incomeTax: 40_000, residentTax: 20_000 });
    expect(unrunnableSkillsNote(3)).toContain('3 件');
    expect(noBreakEvenNote(3, 10)).toContain('10 期のうち 3 期');
  });

  it('契約ごとの倒し方 — 金額は 0・算定不能は null・文は出さない', () => {
    // number (金額・税額) → 0
    expect(floorTaxableThousand(Number.NaN)).toBe(0);
    expect(calcBaseIncomeTax(Number.NaN)).toBe(0);
    expect(calcConsumptionTax(Number.NaN)).toBe(0);
    // number | null → null (「0 である」と言わない)
    expect(computeRunwayMonths(Number.NaN, -100_000)).toBeNull();
    expect(computeRunwayMonths(1_000_000, Number.NaN)).toBeNull();
    expect(acceptRateOf(5, Number.NaN)).toBeNull();
    expect(yearsToDouble(Number.NaN)).toBeNull();
    // 文 → 出さない
    expect(noBreakEvenNote(Number.NaN, 10)).toBeNull();
    expect(noBreakEvenNote(3, Number.NaN)).toBeNull();
    expect(unrunnableSkillsNote(Number.NaN)).toBeUndefined();
  });

  // ── describeNonFinite そのものが鳴ること (鳴らない検査は報せでしかない) ──

  it('対照: 非有限な数を見つける', () => {
    expect(describeNonFinite(Number.NaN)).toBe('戻り値 = NaN');
    expect(describeNonFinite(Number.POSITIVE_INFINITY)).toBe('戻り値 = Infinity');
    expect(describeNonFinite(Number.NEGATIVE_INFINITY)).toBe('戻り値 = -Infinity');
    expect(describeNonFinite(0)).toBeNull();
    expect(describeNonFinite(-1.5)).toBeNull();
  });

  it('対照: 入れ子の中の非有限も見つける', () => {
    expect(describeNonFinite({ a: { b: Number.NaN } })).toBe('a.b = NaN');
    expect(describeNonFinite([1, 2, Number.NaN])).toBe('[2] = NaN');
    expect(describeNonFinite([{ x: 1 }, { x: Number.POSITIVE_INFINITY }])).toBe('[1].x = Infinity');
    expect(describeNonFinite({ a: 1, b: [2, 3] })).toBeNull();
  });

  it('対照: 文に埋まった NaN / Infinity も見つける', () => {
    expect(describeNonFinite('このうち NaN 件')).toBe('戻り値 の文に "NaN" が入っている');
    expect(describeNonFinite('Infinity 円')).toBe('戻り値 の文に "Infinity" が入っている');
    expect(describeNonFinite({ note: '10 期のうち NaN 期' })).toBe('note の文に "NaN" が入っている');
    expect(describeNonFinite('3 件')).toBeNull();
  });

  it('対照: null / undefined / 真偽値は非有限ではない (断りは通す)', () => {
    expect(describeNonFinite(null)).toBeNull();
    expect(describeNonFinite(undefined)).toBeNull();
    expect(describeNonFinite(false)).toBeNull();
  });

  it('台帳は空でない (入口を 1 つも測っていない検査は合格ではない)', () => {
    expect(ENTRY_POINTS.length).toBeGreaterThanOrEqual(46);
    // 各入口が少なくとも 1 つの数値の位置を持つ (置き換える先が無ければ何も測らない)
    for (const ep of ENTRY_POINTS) expect(ep.args.length).toBeGreaterThan(0);
  });

  it('パス 204 の実測を記録として留める (直した向きが逆でないこと)', () => {
    // 「最も都合のよい答え」へ倒れていた 4 件。**倒す先が正しい向きであることを留める。**
    expect(humanizeCrackTime(Number.NaN)).toBe(CRACK_TIME_UNMEASURABLE);
    expect(humanizeCrackTime(Number.NaN)).not.toContain('解読不能');
    expect(calcDscr(Number.NaN, 1_000_000)).toEqual({ dscr: null, band: null });
    expect(furusatoOneStopEligibility(Number.NaN, false).eligible).toBe(false);
    expect(calcLifeInsuranceDeduction({ general: Number.NaN, medical: Number.NaN, pension: Number.NaN }))
      .toEqual({ incomeTax: 0, residentTax: 0 });
    // 天井が黙って外れない (測れない天井は「余地なし」)
    expect(clampToCeiling('abcdef', Number.NaN)).toBe('');
    // 年分は 1 つに揃う (新旧の表が混ざらない)。2026 年時点の既定へ倒る。
    expect(residentPerCapitaBreakdown(Number.NaN)).toEqual(residentPerCapitaBreakdown(new Date().getFullYear()));
    expect(spouseIncomeLimitYen(Number.NaN)).toBe(spouseIncomeLimitYen(new Date().getFullYear()));
    expect(calcSalaryIncomeDeduction(1_500_000, Number.NaN)).toBe(calcSalaryIncomeDeduction(1_500_000));
    // `calcNetSalary` は給与所得控除にも年分を渡す (表が 2 つの年分に割れない)
    const y2023 = calcNetSalary(1_500_000, 2023);
    expect(1_500_000 - y2023.employmentIncome).toBe(calcSalaryIncomeDeduction(1_500_000, 2023));
    // 文に NaN を出さない
    expect(restoreResultMessage(
      MERGE_PLAN,
      Number.NaN,
      0,
    )).not.toContain('NaN');
    expect(shigyoDemoMixNote(Number.NaN, 2, '¥1')).toBeNull();
  });

  it('パス 205: `Math.max(0, …)` の天井は NaN だけを落とす (±Infinity は天井へ丸める約束)', () => {
    // ★ **ここで `nonNeg` を使うのは誤りだった。** 最初そう直して実測で捕まえた ——
    // `nonNeg(Infinity)` は 0 なので、`Infinity` が**上限 50% ではなく 0% に化けた**。
    // `Infinity` は「範囲外の上」なので `0.9 → 0.5` と同じく天井へ丸めるのが
    // 書いてある約束で、`NaN` だけが「数でない」= 0 に倒す対象である。
    expect(resolveRate('customA', { customRateA: Number.NaN })).toBe(0);
    expect(resolveRate('reduced', { reducedRate: Number.POSITIVE_INFINITY })).toBe(0.5);
    expect(resolveRate('customA', { customRateA: 0.9 })).toBe(0.5); // 範囲外 (上) は天井へ
    expect(resolveRate('customA', { customRateA: -1 })).toBe(0); // 範囲外 (下) は床へ
    // 導出される金額は 0 に倒れる。**返ってくる明細は入力の写しなので非有限が残る** ——
    // そこは `lineAmount` の守りが効く場所ではない (画面が刷るのは導出値)。
    const bad = groupByTaxKind(
      [{ name: 'A', qty: Number.NaN, unitPrice: Number.NaN, kind: 'standard' }],
      { standardRate: Number.NaN },
    );
    expect(bad.totalTax).toBe(0);
    expect(bad.grandTotal).toBe(0);
    expect(bad.groups[0]?.subtotal).toBe(0);
    expect(bad.groups[0]?.rate).toBe(0);
    expect(Number.isNaN(bad.groups[0]?.lines[0]?.unitPrice)).toBe(true); // 入力の写し
    // 文に NaN を埋めない (秘書室の人数)
    expect(villageSummary({
      org: { ceo: { id: 'c', title: 'CEO', name: 'c' }, coo: { id: 'o', title: 'COO', name: 'o' },
        executives: [], secretaries: [{ id: 's', title: '秘書室', members: Number.NaN }], managers: [] },
      teams: [], rounds: [], backlog: [],
    } as never)).not.toContain('NaN');
  });

  it('★ 否定形の関門 `!(x > 0)` は NaN を落とす / 比較 `x <= 0` は落とさない (この家系の中心)', () => {
    // **綴りの違いが振る舞いの違いである。** 対照として両方を実測で留める。
    const nan: number = Number.NaN;
    expect(nan <= 0).toBe(false); // 比較は NaN をどちらの枝にも落とさない
    expect(!(nan > 0)).toBe(true); // 否定形は落とす
    // 否定形を持つ 2 つの実物 (免除台帳がこれを根拠にしている)
    expect(roundUpYearsOfService(Number.NaN)).toBe(0);
    expect(calcDscr(1_000_000, Number.NaN)).toEqual({ dscr: null, band: null });
  });
});

// ── ★ 双方向の突き合わせ: 走査が挙げた入口はすべて台帳に在ること ──────────

const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');
const SRC = path.join(REPO_ROOT, 'src');

/**
 * 走査が挙げた export 関数のうち、**台帳に載せずに済ませる**もの。理由を書かせる。
 *
 * 理由は 4 種類しかない (doc コメントの表を参照)。5 種類目を足したくなったら、
 * それは新しい家系なので**測ってから**足すこと。
 */
const COMPARISON_GUARD_EXEMPT: Readonly<Record<string, string>> = {
  // 引数がコードの定数からしか来ない (期間 14 / 20 / 50 は呼び出し側のリテラル)
  'src/main/clients/stocks.ts::sma': 'period は呼び出し側のコード定数 (14/20/50)。利用者入力から届かない',
  'src/main/clients/stocks.ts::ema': 'period は呼び出し側のコード定数。利用者入力から届かない',
  'src/main/clients/stocks.ts::rsi': 'period は呼び出し側のコード定数。利用者入力から届かない',
  'src/renderer/data/stocksAnalysisWeb.ts::sma': 'period は呼び出し側のコード定数',
  'src/renderer/data/stocksAnalysisWeb.ts::ema': 'period は呼び出し側のコード定数',
  'src/renderer/data/stocksAnalysisWeb.ts::rsi': 'period は呼び出し側のコード定数',
  'src/renderer/data/stocksAnalysisWeb.ts::percentB': 'period / k は呼び出し側のコード定数',
  'src/renderer/data/stocksAnalysisWeb.ts::detectCross': 'fastPeriod / slowPeriod は呼び出し側のコード定数',
  'src/renderer/data/stocksAnalysisWeb.ts::historicalVolatility': 'tradingDays は年間営業日のコード定数',
  // 型が非有限を許さない
  'src/shared/taxConsumptionSchedule.ts::interimBandLabel': 'count の型が 0 | 1 | 3 | 11 のリテラル union。NaN は型が拒む',
  // 上流の漏斗が非有限を落としてから渡す
  'src/renderer/data/kpiActuals.ts::computeLaborMetrics': 'members が非有限なら null を返す (実測)。集計側は summarizeFundamentals が消毒済み',
  'src/renderer/data/managementReport.ts::buildManagementReport': 'breakEvenDeltaPct は呼び出し側で `number | null` に落ちており、文面は null の枝を持つ',
  'src/shared/api/cursor.ts::isOverCounted': '戻り値が boolean。`total > 0 && …` は NaN で false (「過大計上ではない」= 追加の警告を出さない側)',
  'src/renderer/components/Stat.tsx::positiveIfKnown': '戻り値が boolean|undefined。Stat 自体が「—」に色を付けない (パス 91)',
  'src/renderer/data/chatOrg.ts::confidenceLabel': "NaN は '低' (最も控えめな側)。ラベルのみで金額に入らない",
};

/** 走査が見つけた「比較だけの関門」1 件。 */
interface GuardHit {
  readonly key: string;
  readonly fn: string;
  readonly file: string;
  readonly params: readonly string[];
}

function stripCommentsAndStrings(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/(^|[^:])\/\/[^\n]*/gm, (m, p1: string) => p1 + ' '.repeat(m.length - p1.length));
}

/** `(` の位置から、対応する `)` の直後の本体 `{…}` を切り出す。 */
export function bodyAfterParams(src: string, openParen: number): { readonly body: string; readonly closeParen: number } {
  let depth = 0;
  let i = openParen;
  for (; i < src.length; i += 1) {
    if (src[i] === '(') depth += 1;
    else if (src[i] === ')') {
      depth -= 1;
      if (depth === 0) break;
    }
  }
  const brace = src.indexOf('{', i);
  if (brace < 0) return { body: '', closeParen: i };
  depth = 0;
  for (let j = brace; j < src.length; j += 1) {
    if (src[j] === '{') depth += 1;
    else if (src[j] === '}') {
      depth -= 1;
      if (depth === 0) return { body: src.slice(brace, j + 1), closeParen: i };
    }
  }
  return { body: src.slice(brace), closeParen: i };
}

/** トップレベルのカンマで仮引数を割る (入れ子の型引数・オブジェクト型を跨がない)。 */
export function splitParams(text: string): readonly string[] {
  const out: string[] = [];
  let depth = 0;
  let cur = '';
  for (const ch of text) {
    if ('([{<'.includes(ch)) depth += 1;
    else if (')]}>'.includes(ch)) depth -= 1;
    if (ch === ',' && depth === 0) {
      out.push(cur);
      cur = '';
    } else cur += ch;
  }
  if (cur.trim() !== '') out.push(cur);
  return out;
}

function establishesFiniteHere(body: string, name: string): boolean {
  const n = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(
    `(?:Number\\.isFinite\\(\\s*${n}\\b|isFiniteNumber\\(\\s*${n}\\b`
    + `|nonNeg\\(\\s*${n}\\b|finiteOr\\w*\\(\\s*${n}\\b`
    + `|assertNonNegativeFinite\\(\\s*${n}\\b|Number\\.isInteger\\(\\s*${n}\\b`
    + `|!\\(\\s*${n}\\s*>=?\\s*0)`,
  ).test(body);
}

/**
 * **`if (<仮引数> <比較> 0)` で「測れるか」を決め、その仮引数の有限性を同じ関数で
 * 一度も確かめていない** export 関数を数える。
 *
 * これが台帳の母集団である (パス 202 が手で数え、パス 204 でゲートにした)。
 * AST を持たないので限界は在る (アロー関数の仮引数は見られない・スコープを
 * 導けない) —— その限界は `sanitizerCensus` の注記と同じもの。
 */
export function findComparisonOnlyGuards(source: string, file: string): readonly GuardHit[] {
  const src = stripCommentsAndStrings(source);
  const hits: GuardHit[] = [];
  const re = /export\s+(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*(?:<[^>]*>)?\s*\(/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src)) !== null) {
    const openParen = re.lastIndex - 1;
    const { body, closeParen } = bodyAfterParams(src, openParen);
    const params = splitParams(src.slice(openParen + 1, closeParen));
    const flagged: string[] = [];
    for (const raw of params) {
      const nm = /^\s*([A-Za-z_$][\w$]*)/.exec(raw);
      if (nm === null || nm[1] === undefined) continue;
      const name = nm[1];
      const esc = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      if (!new RegExp(`\\b${esc}\\s*(?:<=|<|>=|>|===|!==)\\s*0\\b`).test(body)) continue;
      if (establishesFiniteHere(body, name)) continue;
      flagged.push(name);
    }
    if (flagged.length > 0) {
      hits.push({ key: `${file}::${m[1] ?? ''}`, fn: m[1] ?? '', file, params: flagged });
    }
  }
  return hits;
}

function walkTs(dir: string, out: string[] = []): string[] {
  for (const e of readOriginalDirEntries(dir)) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name !== '__tests__' && e.name !== 'node_modules') walkTs(p, out);
    } else if (/\.tsx?$/.test(e.name)) out.push(p);
  }
  return out;
}

describe('★ 台帳と走査の双方向の突き合わせ (16 という数を手で選ばない)', () => {
  const files = walkTs(SRC);
  const hits = files.flatMap((abs) =>
    findComparisonOnlyGuards(readOriginalSource(abs), path.relative(REPO_ROOT, abs).split(path.sep).join('/')));

  it('走査が生きている (0 件なら走査の死。合格ではない)', () => {
    expect(files.length).toBeGreaterThanOrEqual(200);
    expect(hits.length).toBeGreaterThanOrEqual(15);
  });

  it('★ 走査が挙げた export 関数は、台帳か免除台帳のどちらかに在る', () => {
    const inLedger = new Set(ENTRY_POINTS.map((ep) => ep.scanName ?? ep.label));
    const missing = hits
      .filter((h) => !inLedger.has(h.fn) && COMPARISON_GUARD_EXEMPT[h.key] === undefined)
      .map((h) => `${h.key}(${h.params.join(', ')})`);
    expect(missing).toEqual([]);
  });

  it('免除台帳に死んだ行が無い (直した関数の免除が残り続けない)', () => {
    const keys = new Set(hits.map((h) => h.key));
    const stale = Object.keys(COMPARISON_GUARD_EXEMPT).filter((k) => !keys.has(k));
    expect(stale).toEqual([]);
  });

  it('免除には理由が書かれている (空文字で黙らせられない)', () => {
    for (const [k, why] of Object.entries(COMPARISON_GUARD_EXEMPT)) {
      expect(why.length, k).toBeGreaterThan(10);
    }
  });

  // ── 走査そのものが鳴ること (鳴らない走査は報せでしかない) ──

  it('対照: 比較だけの関門を挙げる', () => {
    const sample = 'export function f(x: number): number {\n  if (x <= 0) return 0;\n  return x * 2;\n}';
    expect(findComparisonOnlyGuards(sample, 'a.ts').map((h) => h.fn)).toEqual(['f']);
  });

  it('対照: 有限を確かめていれば挙げない (4 通りの綴り)', () => {
    for (const guard of [
      'const y = nonNeg(x);',
      'if (!Number.isFinite(x)) return 0;',
      'if (finiteOrNull(x) === null) return 0;',
      'assertNonNegativeFinite(x, "x");',
    ]) {
      const sample = `export function f(x: number): number {\n  ${guard}\n  if (x <= 0) return 0;\n  return x * 2;\n}`;
      expect(findComparisonOnlyGuards(sample, 'a.ts'), guard).toEqual([]);
    }
  });

  it('対照: 否定形 `!(x > 0)` は関門として認める', () => {
    const sample = 'export function f(x: number): number {\n  if (!(x > 0)) return 0;\n  return x * 2;\n}';
    expect(findComparisonOnlyGuards(sample, 'a.ts')).toEqual([]);
  });

  it('対照: 非 export は挙げない (台帳は export だけを覆う)', () => {
    const sample = 'function f(x: number): number {\n  if (x <= 0) return 0;\n  return x * 2;\n}';
    expect(findComparisonOnlyGuards(sample, 'a.ts')).toEqual([]);
  });

  it('対照: コメントの中の関門は数えない', () => {
    const sample = 'export function f(x: number): number {\n  // if (x <= 0) return 0;\n  return x * 2;\n}';
    expect(findComparisonOnlyGuards(sample, 'a.ts')).toEqual([]);
  });

  it('対照: 走査は原文を読む (sandbox の書き換えを踏まない)', () => {
    // `readOriginalSource` を通すこと自体が要件なので、生の `fs` は使わない
    // (`originalSourcePolicy` がそれを門にしている)。読めた中身で確かめる。
    const src = readOriginalSource(path.join(SRC, 'shared', 'taxCalc.ts'));
    expect(src).toContain('export function resolveTaxYear');
    expect(isInstrumented(src)).toBe(false);
  });
});
