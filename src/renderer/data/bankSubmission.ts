/**
 * 金融機関等提出用の書面 — 経営サマリーの各項目を、決算書と同じ読み方の
 * 「項目 / 数値 / 備考」の表に組み直す。
 *
 * ここは**数字を書式に通して並べるだけ**で、計算はしない。計算はすべて
 * `overview.ts` (経営サマリー) と `shared/managementScorecard.ts` /
 * `cashflowDebtService.ts` が済ませた値を受け取る — 画面と書面で数字が
 * 食い違わない。書式 (`shared/bankFormat.ts`) は保存した設定から渡す。
 *
 * 出さない値は「―」で埋め、0 と区別する。行は消さない — 金融機関の様式は
 * 「項目があって空欄」を読むので、項目ごと消えると未入力か未算定かが
 * 分からなくなる。
 */
import { hasControlChar } from '../../shared/controlChars';
import { isCalendarMonth } from '../../shared/isoDate';
// `fiscalYearWindow` は決算期から事業年度の 12 か月を出す唯一の実装 (計算書類の
// 取り込みと書類の差込も同じ物を使う)。**写さずに読む。** kessanImport から
// こちらへの辺は `import type` だけなので実行時の循環にはならない。
import { fiscalYearMonths, fiscalYearWindow } from './kessanImport';
import { isValidPeriod, zeroMembersPerCapitaNote, zeroRevenueRatioNote } from './kpiActuals';
import {
  BANK_FORMAT_DEFAULT,
  BLANK,
  NEGATIVE_MARK,
  UNIT_LABEL,
  formatAmount,
  formatScaled,
  scaleAmount,
  formatCount,
  formatDate,
  formatFiscalPeriod,
  formatPercent,
  formatPeriodRange,
  formatRatio,
  parseBankFormat,
  roundingCaption,
  unitCaption,
  type BankFormat,
} from '../../shared/bankFormat';
import { verdictLabel, type ManagementScorecard } from '../../shared/managementScorecard';
import { budgetUnmatchedNote, type BudgetPeriodAlignment } from './budgetVariance';
import { manualOverrideNote, staleDerivedNote, type ManualOverrideDisclosure } from './overviewOverrides';
import { monthsPerYear, periodDaysForMonths } from './workingCapital';
import type { BusinessOverview } from './overview';
import type { CashflowDebtService } from './cashflowDebtService';

/** 書式と提出者情報の保存先 (1 レコード = 1 回の保存。最新を採用する)。 */
export const BANK_SUBMISSION_COLLECTION = 'bank-submission-settings';

/** 提出者情報の各欄の上限 (文字)。 */
export const PROFILE_MAX_LENGTH = 100;

export interface SubmissionProfile {
  readonly companyName: string;
  readonly representative: string;
  readonly address: string;
  /** 決算期 (`YYYY-MM`)。未入力は空。 */
  readonly fiscalYearEnd: string;
}

export const EMPTY_PROFILE: SubmissionProfile = { companyName: '', representative: '', address: '', fiscalYearEnd: '' };

export interface BankSubmissionSettings extends Record<string, unknown> {
  readonly profile: SubmissionProfile;
  readonly format: BankFormat;
}

export const DEFAULT_SUBMISSION_SETTINGS: BankSubmissionSettings = { profile: EMPTY_PROFILE, format: BANK_FORMAT_DEFAULT };

export type ProfileResult = { ok: true; profile: SubmissionProfile } | { ok: false; reason: string };

const PROFILE_LABEL: Readonly<Record<keyof SubmissionProfile, string>> = {
  companyName: '商号',
  representative: '代表者',
  address: '所在地',
  fiscalYearEnd: '決算期',
};

/**
 * 提出者情報を検証する。空は許す (書面には「―」が出る)。断るのは、書面に
 * 出せない値だけ — 文字以外・制御文字・長すぎる文字列・読めない決算期。
 */
export function parseSubmissionProfile(input: {
  companyName?: unknown;
  representative?: unknown;
  address?: unknown;
  fiscalYearEnd?: unknown;
}): ProfileResult {
  const out: Record<keyof SubmissionProfile, string> = { ...EMPTY_PROFILE };
  for (const key of ['companyName', 'representative', 'address', 'fiscalYearEnd'] as const) {
    const v = input[key];
    if (v === undefined || v === null) continue;
    if (typeof v !== 'string') return { ok: false, reason: `${PROFILE_LABEL[key]}は文字で入力してください` };
    const t = v.trim();
    if (hasControlChar(t)) return { ok: false, reason: `${PROFILE_LABEL[key]}に制御文字が含まれています` };
    if (t.length > PROFILE_MAX_LENGTH) {
      return { ok: false, reason: `${PROFILE_LABEL[key]}は ${PROFILE_MAX_LENGTH} 文字以内で入力してください` };
    }
    out[key] = t;
  }
  if (out.fiscalYearEnd !== '' && !isCalendarMonth(out.fiscalYearEnd)) {
    return { ok: false, reason: '決算期は 2026-03 のように「年-月」で入力してください' };
  }
  return { ok: true, profile: out };
}

/** 保存したレコードを読む。壊れていても書面は出す (提出者情報は空、書式は既定へ)。 */
export function settingsFromRecord(data: unknown): BankSubmissionSettings {
  const o: Record<string, unknown> = data !== null && typeof data === 'object' ? (data as Record<string, unknown>) : {};
  const rawProfile: Record<string, unknown> =
    o.profile !== null && typeof o.profile === 'object' ? (o.profile as Record<string, unknown>) : {};
  const parsed = parseSubmissionProfile(rawProfile);
  return {
    profile: parsed.ok ? parsed.profile : EMPTY_PROFILE,
    format: parseBankFormat(o.format),
  };
}

export interface SheetRow {
  readonly label: string;
  readonly value: string;
  /** 算式や出所。空でもよい。 */
  readonly note: string;
}

export interface SheetSection {
  readonly title: string;
  readonly rows: readonly SheetRow[];
  /** 節の下に出す断り書き (未入力の理由など)。 */
  readonly caption: string | null;
}

export interface SheetMeta {
  readonly label: string;
  readonly value: string;
}

export interface BankSubmissionSheetModel {
  readonly title: string;
  readonly subtitle: string;
  readonly stamp: string;
  readonly meta: readonly SheetMeta[];
  readonly unitCaption: string;
  readonly sections: readonly SheetSection[];
  readonly notes: readonly string[];
  readonly attestation: {
    readonly statement: string;
    readonly date: string;
    readonly companyName: string;
    readonly representative: string;
  };
}

export interface BankSubmissionInput {
  readonly overview: BusinessOverview;
  readonly scorecard: ManagementScorecard;
  readonly debtService: CashflowDebtService | null;
  /** 貸借対照表の基準日 (`YYYY-MM-DD`)。未入力は null。 */
  readonly balanceSheetAsOf: string | null;
  /** 作成日 (現地の `YYYY-MM-DD`)。 */
  readonly today: string;
  readonly settings: BankSubmissionSettings;
  /**
   * 手入力の上書きの状況。**必須** —— 既定値を置くと、渡し忘れた呼び手が
   * 断り書きの無い書面を刷る (経緯は `overviewOverrides.ts` の
   * `staleDerivedNote`)。上書きが無いなら `NO_MANUAL_OVERRIDES` を明示して渡す。
   */
  readonly manual: ManualOverrideDisclosure;
}

const TREND_LABEL: Readonly<Record<'up' | 'down' | 'flat', string>> = { up: '上昇', down: '下降', flat: '横ばい' };

/**
 * 読める期 (`YYYY-MM`) だけを昇順で返す。
 *
 * **綴りは 1 か所に置く。** 期の書式を 2 か所に書くと、片方を直したときに
 * もう片方が黙って別の物を通す (対象期間と月数で判定が食い違う)。
 */
function validPeriods(periods: readonly string[]): string[] {
  // **期の綴りの規則は `kpiActuals.ts` の `isValidPeriod` 1 か所。**
  // ここに 2 つ目の正規表現を書いていた (2026-09-07 に畳んだ) —— 同じ規則の
  // 2 つ目の綴りは、片方だけ直したときに書面と入力検査が食い違う。
  return periods.filter(isValidPeriod).sort();
}

/** KPI の期から対象期間 (最初と最後の月) を取る。読めない期は無視。 */
export function periodRange(periods: readonly string[]): { from: string; to: string } | null {
  const valid = validPeriods(periods);
  if (valid.length === 0) return null;
  return { from: valid[0]!, to: valid[valid.length - 1]! };
}

/**
 * 期の一覧を「範囲・月数」の 1 語にする (`令和8年4月〜令和9年3月・12 か月`)。
 * 読める期が無ければ `BLANK`。範囲だけでは端の 2 か月しか無い控えを「1 年分」と
 * 読めてしまうので、**月数も必ず添える** (`periodScopeNote` と同じ規則)。
 */
function periodSpan(periods: readonly string[], f: BankFormat): string {
  const range = periodRange(periods);
  if (range === null) return BLANK;
  const months = new Set(validPeriods(periods)).size;
  return `${formatPeriodRange(range.from, range.to, f)}・${months} か月`;
}

/**
 * **決算期と、実際に合算した対象期間の関係を 1 文で述べる。** 述べることが無ければ `null`。
 *
 * ## なぜ要るのか (2026-09-07 実測)
 *
 * 書面のヘッダは 決算期 (提出者情報で**利用者が打つ**) と 対象期間 (KPI 実績の期から
 * 機械が出す) を並べて刷り、§1 は「対象期間の累計」を刷る。ところが両者を突き合わせる
 * ものが無く、`OverviewPage` は `kpiRecords` の**全期**を `kpiPeriods` として渡していた。
 *
 * 実測 (決算期 2026-03・KPI 実績 2025-01〜2026-08 の 20 か月):
 *
 * | ヘッダ | 値 |
 * | --- | --- |
 * | 決算期 | 令和8年3月期 |
 * | 対象期間 | 令和7年1月〜令和8年8月 |
 * | §1 売上高 | **20,000 千円** (20 か月の累計) |
 * | §1 の断り書き | **無し** |
 *
 * 事業年度 (2025-04〜2026-03) の売上高は 12,000 千円なので、**決算期の名前の下に
 * 67% 過大な金額**が断り書き無しで並んでいた。同じ入力から `kessanImport` が作る
 * 計算書類は事業年度で切り出して 12,000 千円にし、切り出せないときは理由を注記する ——
 * **同じ資料から作った 2 つの書面が食い違い、注記が在るのは金融機関へ出さない方だけ**
 * だった。
 *
 * ## 切り出さずに述べる理由
 *
 * 期中の試算表 (決算期は来年 3 月・対象期間は 4〜8 月) は**正当な使い方**なので、
 * 事業年度で切り落とすと今度はそれが壊れる。書面が果たすべき責任は「どちらであるか」を
 * 読む人に分からせることなので、金額は動かさず**関係を述べる**。
 *
 * 月数も数える —— 最初と最後の月だけで判定すると、事業年度の端の 2 か月しか入力が
 * 無い場合に「ちょうど 1 年」と読めてしまう。
 */
export function periodScopeNote(
  fiscalYearEnd: string,
  periods: readonly string[],
  f: BankFormat,
): string | null {
  const range = periodRange(periods);
  if (range === null) return null;
  const months = new Set(validPeriods(periods)).size;
  const summed = periodSpan(periods, f);
  const fy = fiscalYearWindow(fiscalYearEnd);
  if (fy === null) {
    return `決算期が未設定のため、上の金額は入力済みの全期間（${summed}）の累計です。提出者情報で決算期を入れると事業年度との関係を示せます。`;
  }
  const fyLabel = formatFiscalPeriod(fy.to, f);
  const fyRange = formatPeriodRange(fy.from, fy.to, f);
  if (range.from === fy.from && range.to === fy.to && months === fiscalYearMonths()) return null;
  if (range.from >= fy.from && range.to <= fy.to) {
    return `上の金額は${summed}の累計で、${fyLabel}（${fyRange}）の期中です。通年の金額ではありません。`;
  }
  return `上の金額は${summed}の累計で、${fyLabel}（${fyRange}）の 12 か月とは一致しません。`;
}

const row = (label: string, value: string, note = ''): SheetRow => ({ label, value, note });

/** 経営サマリーの値を書面の表へ。 */
export function buildBankSubmissionSheet(input: BankSubmissionInput): BankSubmissionSheetModel {
  const { overview: o, scorecard, debtService, settings } = input;
  const f = settings.format;
  const amt = (n: number | null | undefined): string => formatAmount(n, f);
  /** 単価など 1 件あたりの額は単位に依らず円で出す (千円単位だと 0 に潰れる)。 */
  const yenAmt = (n: number | null | undefined): string => {
    const s = formatAmount(n, { ...f, unit: 'yen' });
    return s === BLANK ? BLANK : `${s}円`;
  };
  const pct = (n: number | null | undefined): string => formatPercent(n, f);
  const days = (n: number | null | undefined): string => formatRatio(n, f, '日');
  const times = (n: number | null | undefined): string => formatRatio(n, f, '倍', 2);
  const months = (n: number | null | undefined): string => formatCount(n, f, 'か月');

  /**
   * 貸借対照表の基準日が実績より古ければ、**溜まり ÷ 流れ の比率がどの期の数字でも
   * なくなる**ことを述べる (総資産回転率・現金化サイクル・資金ランウェイ)。
   * 経緯は `src/renderer/data/balanceSheet.ts` の `BalanceSheetFreshness`。
   */
  const staleBsNote = (): string | null => {
    const fr = o.balanceSheetFreshness;
    // `fr?.` と `fr.monthsBehind === null` はどちらも**到達しない防御**である ——
    // この関数を呼ぶのは §4 / §5 で、どちらも貸借対照表が在るときだけなので
    // `balanceSheetFreshness` は null にならず、`stale === true` なら
    // `monthsBehind` は必ず数である (不変条件は `shared/balanceSheetFreshness.ts`
    // 側の検査が留めている)。倒し込みを外すと型が通らないので残す (等価変異)。
    // Stryker disable next-line OptionalChaining: 上の不変条件により到達しない (等価変異)
    if (fr?.monthsBehind === null || fr === null || fr === undefined) return null;
    // **古い側と先の側の両方**。隔たりの害は符号ではなく大きさで決まるのに、
    // 2026-09-07 まで `stale` (古い側) しか見ておらず、基準日が実績より何年先でも
    // 書面には断りが 1 行も出なかった (経緯は `shared/balanceSheetFreshness.ts`)。
    if (fr.stale) {
      return `貸借対照表の基準日は対象期間の最終月より ${fr.monthsBehind} か月古く、売上高や原価と組み合わせる比率 (回転率・回転日数) は同じ期の数字ではありません。`;
    }
    if (fr.ahead) {
      return `貸借対照表の基準日は対象期間の最終月より ${-fr.monthsBehind} か月後で、売上高や原価と組み合わせる比率 (回転率・回転日数) は同じ期の数字ではありません。`;
    }
    return null;
  };

  const range = periodRange(o.kpi.periods);
  const rangeLabel = range ? formatPeriodRange(range.from, range.to, f) : BLANK;
  const bsLabel = formatDate(input.balanceSheetAsOf, f);
  const p = settings.profile;
  const today = formatDate(input.today, f);

  const meta: SheetMeta[] = [
    { label: '商号', value: p.companyName === '' ? BLANK : p.companyName },
    { label: '代表者', value: p.representative === '' ? BLANK : p.representative },
    { label: '所在地', value: p.address === '' ? BLANK : p.address },
    { label: '決算期', value: formatFiscalPeriod(p.fiscalYearEnd, f) },
    { label: '対象期間', value: rangeLabel },
    { label: '貸借対照表 基準日', value: bsLabel },
    { label: '作成日', value: today },
    { label: '表示単位', value: `${UNIT_LABEL[f.unit]}（${roundingCaption(f)}）` },
  ];

  const k = o.kpi;
  const has = k.hasData;
  const kv = (n: number): string => (has ? amt(n) : BLANK);
  const kp = (n: number | null): string => (has ? pct(n) : BLANK);
  /**
   * §1 の但し書き。対象期間 (パス 34) に加え、**売上高が 0 なら比率が 8 行まとめて
   * 空欄になる理由**を述べる —— 「営業利益 △3,000 / 営業利益率 ―」を見た読み手が
   * 入力漏れと区別できるように (文は `zeroRevenueRatioNote` が 1 か所で持つ)。
   */
  const sectionOneCaption = (): string | null => {
    if (!has) return 'KPI 実績が未入力のため算定していません。';
    const scope = periodScopeNote(p.fiscalYearEnd, o.kpi.periods, f);
    if (k.revenue > 0) return scope;
    return scope === null ? zeroRevenueRatioNote() : `${scope}${zeroRevenueRatioNote()}`;
  };
  const sections: SheetSection[] = [];

  sections.push({
    title: '1. 損益の状況（対象期間の累計）',
    caption: sectionOneCaption(),
    rows: [
      row('売上高', kv(k.revenue), 'KPI 実績の合計'),
      row('売上総利益', kv(k.grossProfit), '売上高 − 売上原価'),
      row('売上総利益率', kp(k.grossMarginPct), '売上総利益 ÷ 売上高'),
      row('営業利益', kv(k.operatingProfit), '売上総利益 − 広告宣伝費 − 販売費及び一般管理費 − 減価償却費'),
      row('営業利益率', kp(k.operatingMarginPct), '営業利益 ÷ 売上高'),
      row('EBITDA', kv(k.ebitda), '営業利益 + 減価償却費'),
      row('EBITDA マージン', kp(k.ebitdaMarginPct), 'EBITDA ÷ 売上高'),
      row('売上原価率', kp(k.cogsRatioPct), '売上原価 ÷ 売上高'),
      row('広告宣伝費率', kp(k.advertisingRatioPct), '広告宣伝費 ÷ 売上高'),
      row('販売費及び一般管理費率', kp(k.sgaRatioPct), '販売費及び一般管理費 ÷ 売上高'),
      row('限界利益率', kp(k.contributionRatio), '(売上高 − 変動費) ÷ 売上高'),
      row('損益分岐点売上高', kv(k.bep), '固定費 ÷ 限界利益率'),
      row('安全余裕率', kp(k.safetyMargin), '(売上高 − 損益分岐点売上高) ÷ 売上高'),
    ],
  });

  /**
   * §2 の但し書き。**販売記録が覆う期間**を述べ、KPI 実績の対象期間と食い違うなら
   * それも述べる (同じ書面に 2 つの売上高が並ぶので、読み手が突き合わせられるように)。
   */
  const salesScopeCaption = (): string | null => {
    const sp = o.sales.period;
    if (sp === null) return null;
    const salesSpan = `${formatPeriodRange(sp.from.slice(0, 7), sp.to.slice(0, 7), f)}・${sp.months} か月`;
    const head = `上の金額は販売記録の${salesSpan}分の累計です。`;
    const kpi = periodRange(o.kpi.periods);
    // KPI 実績が無ければ比べる相手が居ない。月まで一致していれば述べることは無い。
    if (kpi === null) return head;
    const sameWindow = kpi.from === sp.from.slice(0, 7) && kpi.to === sp.to.slice(0, 7);
    return sameWindow
      ? head
      : `${head}§1 の売上高（KPI 実績）は${periodSpan(o.kpi.periods, f)}分の累計で、期間が異なります。`;
  };

  const conc = o.sales.concentration;
  sections.push({
    title: '2. 販売の状況',
    // **§1 と §2 は別の入力から来た別の期間の売上高である。** §1 は KPI 実績の
    // 対象期間の累計 (`periodScopeNote` が述べる)、§2 は販売記録の全件の累計。
    // 2026-09-07 まで §2 は期間を述べておらず、KPI 3 か月・販売記録 3 年分の控えで
    // 12,000 千円 と 36,000 千円 が並んだまま理由が読めなかった (実測)。
    caption: salesScopeCaption(),
    rows: [
      row('売上高（販売記録）', amt(o.sales.totalAmount), '販売記録の合計'),
      row('受注件数', formatCount(o.sales.totalOrders, f, '件')),
      row('平均受注単価', yenAmt(o.sales.aov), '売上高 ÷ 受注件数'),
      row('販売チャネル数', formatCount(o.sales.channelCount, f)),
      row(
        '主力チャネル',
        o.sales.topChannel === null ? BLANK : o.sales.topChannel,
        conc === null ? '' : `売上に占める割合 ${pct(conc.topSharePct)}`,
      ),
      row('売上分散スコア', conc === null ? BLANK : `${conc.diversityScore}／100`, '(1 − ハーフィンダール指数) × 100'),
    ],
  });

  const pr = o.productivity;
  const labor = pr.labor;
  /**
   * §3 の但し書き。一人当たりの金額は**対象期間の累計 ÷ 従業員数**で、年額ではない。
   * 1 年分そろっていれば述べることは無い (`periodScopeNote` と同じ規則)。
   */
  const perCapitaCaption = (): string | null => {
    // **狭い理由より広い理由を先に述べる** —— KPI 実績が無ければこの節は
    // 丸ごと空欄なので、そちらを言う。KPI は在って従業員が 0 名なら、
    // 空欄になるのは一人当たりの 3 行だけ (人件費・労働分配率・人件費率は出る)。
    const months = new Set(validPeriods(o.kpi.periods)).size;
    if (months === 0) return 'KPI 実績が未入力のため、一人当たりの金額は算定していません。';
    // **分母が 0 なら述べるのは期間ではなく分母のこと** —— 従業員が 1 名も
    // 登録されていなければ一人当たりの 3 行はすべて空欄になる (2026-09-08 まで
    // 一人当たり売上高だけが `0` を刷り、隣の一人当たり人件費は ― だった)。
    if (pr.members <= 0) return zeroMembersPerCapitaNote();
    if (months === fiscalYearMonths()) return null;
    return `一人当たりの金額と人件費は、実績の${periodSpan(o.kpi.periods, f)}分の累計を従業員数で割ったものです（年額ではありません）。`;
  };
  sections.push({
    title: '3. 人員・生産性',
    // 一人当たりの 3 行は**対象期間の累計 ÷ 従業員数**である。年額ではないので、
    // 1 年分でないなら必ず述べる (§1・§5・§8 と同じ規則)。
    caption: perCapitaCaption(),
    rows: [
      row('従業員数', formatCount(pr.members, f, '名'), '登録メンバー数'),
      row('一人当たり売上高', amt(pr.revenuePerCapita), '売上高 ÷ 従業員数'),
      row('一人当たり営業利益', amt(pr.operatingProfitPerCapita), '営業利益 ÷ 従業員数'),
      row('人件費', labor.laborCost > 0 ? amt(labor.laborCost) : BLANK, 'KPI 実績の人件費の合計'),
      row('労働分配率', pct(labor.laborSharePct), '人件費 ÷ 売上総利益'),
      row('人件費率', pct(labor.laborToRevenuePct), '人件費 ÷ 売上高'),
      row('一人当たり人件費', amt(labor.laborPerCapita), '人件費 ÷ 従業員数'),
    ],
  });

  const fp = o.financialPosition;
  sections.push({
    title: '4. 財政状態（貸借対照表 基準日現在）',
    caption: fp === null ? '貸借対照表が未入力のため算定していません。' : staleBsNote(),
    rows: [
      row('総資産', fp === null ? BLANK : amt(fp.totalAssets)),
      row('負債合計', fp === null ? BLANK : amt(fp.totalLiabilities)),
      // **印刷した 2 行の引き算で出す。** 円から別々に丸めると
      // 「純資産 = 総資産 − 負債合計」が印刷した数字では成り立たない
      // (実測 2026-09-06: 40 通りのうち 21 通りで 1 単位ずれた。`formatScaled` の注記)。
      row(
        '純資産',
        fp === null ? BLANK : formatScaled(scaleAmount(fp.totalAssets, f) - scaleAmount(fp.totalLiabilities, f), f),
        fp !== null && fp.insolvent ? '債務超過' : '総資産 − 負債合計',
      ),
      row('自己資本比率', fp === null ? BLANK : pct(fp.equityRatioPct), '純資産 ÷ 総資産'),
      row('流動比率', fp === null ? BLANK : pct(fp.currentRatioPct), '流動資産 ÷ 流動負債'),
      row('当座比率', fp === null ? BLANK : pct(fp.quickRatioPct), '(流動資産 − 棚卸資産) ÷ 流動負債'),
      row('固定比率', fp === null ? BLANK : pct(fp.fixedRatioPct), '固定資産 ÷ 純資産'),
      row('総資産利益率（ROA）', fp === null ? BLANK : pct(fp.roaPct), '当期純利益 ÷ 総資産'),
      row('自己資本利益率（ROE）', fp === null ? BLANK : pct(fp.roePct), '当期純利益 ÷ 純資産'),
    ],
  });

  const wc = o.workingCapital;
  /**
   * §5 の但し書き。**空欄の理由を名前で述べる** —— 「—」だけを刷ると、読む側は
   * 「この会社には運転資金の負担が無い」と読める。未入力を 0 として積んでいない
   * ことも明記する (以前は 0 に倒していたので CCC 0 日が印刷されていた。経緯は
   * `data/balanceSheet.ts` の `BalanceSheet`)。基準日のずれの但し書きと併記する。
   */
  /**
   * 回転日数の分母に掛ける**期間の日数**。1 年分の実績なら 365 日、3 か月分なら 91.3 日。
   * **刷る式の中に実物の日数を入れる** —— 「× 365」と刷ったまま 3 か月分で割ると、
   * 読み手は式を検算できない (「刷った数字は刷った式を満たす」の規則)。
   */
  const periodDayCount = (): number =>
    wc === null ? 0 : Math.round(periodDaysForMonths(wc.periodMonths) * 10) / 10;
  const workingCapitalCaption = (): string | null => {
    if (wc === null) return '貸借対照表と売上高が揃っていないため算定していません。';
    const notes = [
      // **何か月分の実績で出した回転日数か。** 溜まり ÷ 流れ の答えは期間の長さで
      // 決まるので、1 年分でないなら必ず述べる (述べることが無ければ null にするのは
      // §1 の `periodScopeNote` と同じ規則。1 年分なら式の「× 365 日」が既に語っている)。
      wc.periodMonths === monthsPerYear()
        ? null
        : `回転日数は実績の${periodSpan(o.kpi.periods, f)}分（${periodDayCount()} 日）で算定しています。1 年分の回転日数ではありません。`,
      wc.missingStocks.length === 0
        ? null
        : `貸借対照表の${wc.missingStocks.join('・')}が未入力のため、該当する回転日数と運転資本は算定していません（0 円としては扱っていません）。`,
      staleBsNote(),
    ].filter((n): n is string => n !== null);
    return notes.length === 0 ? null : notes.join(' ');
  };
  const perDays = `× ${periodDayCount()} 日`;
  sections.push({
    title: '5. 運転資本',
    caption: workingCapitalCaption(),
    rows: [
      row('売上債権回転日数（DSO）', wc === null ? BLANK : days(wc.dso), `売上債権 ÷ 売上高 ${perDays}`),
      row('棚卸資産回転日数（DIO）', wc === null ? BLANK : days(wc.dio), `棚卸資産 ÷ 売上原価 ${perDays}`),
      row('仕入債務回転日数（DPO）', wc === null ? BLANK : days(wc.dpo), `仕入債務 ÷ 売上原価 ${perDays}`),
      row('現金化サイクル（CCC）', wc === null ? BLANK : days(wc.ccc), 'DSO + DIO − DPO'),
      row('運転資本', wc === null ? BLANK : amt(wc.workingCapital), '売上債権 + 棚卸資産 − 仕入債務'),
    ],
  });

  const acc = o.accounting;
  const cf = o.cashForecast;
  // 予測は 12 か月分 (overview が horizon 12 で組む)。最後の行が 12 か月後。
  const lastForecast = cf === null ? null : cf.rows[cf.rows.length - 1]!.balance;
  sections.push({
    title: '6. 資金繰り・返済余力',
    caption: acc === null ? '会計ソフト連携（freee）の月次キャッシュフローが無いため算定していません。' : null,
    rows: [
      // **月数だけでなく、どの月かを書く。** §1 は対象期間、§4/§5 は基準日と隔たりを
      // 書いているのに、§6 だけ「12 か月分」としか言わず、読む人はそれが今年の
      // 12 か月なのか 3 年前の 12 か月なのか判らなかった (2026-09-07)。
      row(
        '営業キャッシュフロー（累計）',
        acc === null ? BLANK : amt(acc.totalNet),
        acc === null ? '' : `${formatPeriodRange(acc.firstMonth, acc.latestMonth, f)}・${acc.months}か月分`,
      ),
      row('営業キャッシュフロー（月次平均）', acc === null ? BLANK : amt(acc.avgMonthlyNet)),
      row('資金ランウェイ', months(o.runwayMonths), '現預金 ÷ 月次の資金流出'),
      row('12か月後の予測残高', amt(lastForecast), '現預金に月次キャッシュフローを外挿'),
      row('予測最低残高', cf === null ? BLANK : amt(cf.minBalance)),
      row(
        '資金ショート予測',
        cf === null ? BLANK : cf.shortfallMonthIndex === null ? 'なし' : `${cf.shortfallMonthIndex}か月後`,
        '予測残高がマイナスになる月',
      ),
      row('返済余力（DSCR）', debtService === null ? BLANK : times(debtService.overallDscr), '営業キャッシュフロー ÷ 借入返済額'),
      row('最悪月の返済余力', debtService === null ? BLANK : times(debtService.worstMonthDscr)),
      row(
        '返済不足の月数',
        debtService === null ? BLANK : `${debtService.shortfallMonths}／${debtService.coveredMonths}か月`,
        'カバー率 1.0 倍未満の月 ／ 対象月',
      ),
    ],
    // **突合できた月の範囲を述べる。** 返済予定は借入期間ぶん先まで伸びるが実績CFは
    // 過去しか無いので、突合できない月がある。黙って落とすと数か月の突合が借入期間
    // ぜんぶについての主張に読める (経緯は `data/cashflowDebtService.ts`)。
    ...(debtService !== null && debtService.unmatchedMonths > 0
      ? {
          caption:
            `上記の返済余力は、会計キャッシュフローが在る ${debtService.coveredMonths} か月について算定したものです。`
            + `返済予定のある残り ${debtService.unmatchedMonths} か月は実績の営業キャッシュフローがまだ無いため対象外です。`,
        }
      : {}),
  });

  const landing = k.revenueLanding;
  const yoy = k.yoy;
  sections.push({
    title: '7. 成長性',
    caption: has ? null : 'KPI 実績が未入力のため算定していません。',
    rows: [
      row('前期比売上高成長率', kp(k.revenueGrowthPct), '直近期 ÷ 前期 − 1'),
      row('平均成長率（CAGR）', kp(k.revenueCagrPct), '1 期あたり'),
      row('売上トレンド', k.revenueTrend === null ? BLANK : TREND_LABEL[k.revenueTrend], '移動平均の比較'),
      row(
        '当年度売上着地見込み',
        landing === null ? BLANK : amt(landing.runRateForecast),
        landing === null ? '' : `${landing.year}年（${landing.monthsElapsed}か月経過、実績 ${amt(landing.actualToDate)}）`,
      ),
      row(
        '前年同月比',
        yoy === null ? BLANK : pct(yoy.revenueYoYPct),
        yoy === null ? '' : `${formatDate(yoy.period, f)} 対 ${formatDate(yoy.priorPeriod, f)}`,
      ),
    ],
  });

  /**
   * 予算実績差異の**対象期間**。§1 の `periodScopeNote` と同じ考えで、
   * 「何を足した数字か」を書面に残す —— 予算と実績は別々に入力するので、
   * 突合できた期の範囲と月数を書かないと通年の比較に読める。
   */
  const budgetScope = (al: BudgetPeriodAlignment): string => {
    const head = `対象: ${periodSpan(al.comparedPeriods, f)}（予算と実績の両方が在る期）。`;
    const un = budgetUnmatchedNote(al);
    return un === null ? head : `${head}${un}です。`;
  };

  const b = o.budget;
  const bAlign = o.budgetAlignment;
  if (bAlign !== null) {
    sections.push(
      b === null
        ? {
            // 予算も実績も在るのに期が 1 つも重ならない。§1 が「KPI 実績が未入力の
            // ため算定していません」と述べるのと同じで、**算定しなかった理由**を書く
            // (節を黙って消すと、読み手には予算が無いのと区別できない)。
            title: '8. 予算実績差異',
            caption: '予算と実績で期（年月）が重なっていないため、達成率を算定していません。',
            rows: [
              row(
                '予算の対象期間',
                periodSpan(bAlign.budgetOnlyPeriods, f),
                '実績と重なる期がありません',
              ),
              row(
                '実績の対象期間',
                periodSpan(bAlign.actualOnlyPeriods, f),
                '予算と重なる期がありません',
              ),
              row('売上高 達成率', BLANK, '突合できる期がないため算定不能'),
            ],
          }
        : {
            title: '8. 予算実績差異',
            caption: budgetScope(b.alignment),
            rows: [
              row('売上高（予算）', amt(b.revenue.budget)),
              row('売上高（実績）', amt(b.revenue.actual)),
              row('売上高（差異）', amt(b.revenue.variance), '実績 − 予算'),
              row('売上高 達成率', pct(b.revenue.achievementPct), '実績 ÷ 予算'),
              row('営業利益（予算）', amt(b.operatingProfit.budget)),
              row('営業利益（実績）', amt(b.operatingProfit.actual)),
              row('営業利益（差異）', amt(b.operatingProfit.variance), '実績 − 予算'),
              row('営業利益 達成率', pct(b.operatingProfit.achievementPct), '実績 ÷ 予算'),
            ],
          },
    );
  }

  if (has) {
    sections.push({
      title: `${bAlign === null ? 8 : 9}. 参考：経営スコア（当社内部の評価）`,
      caption:
        scorecard.overallScore === null
          ? // **採点できる指標が 1 つも無いときに「0／100 · 要改善」を渡さない。**
            // 相手に渡る書面で、測っていないことを落第点として示すのが最も悪い向き。
            '本アプリの採点であり、金融機関等の信用格付けとは関係がありません。採点できる指標が入力されていないため、総合スコアは未算定です。'
          : '本アプリの採点であり、金融機関等の信用格付けとは関係がありません。',
      rows: [
        row('総合スコア', scorecard.overallScore === null ? BLANK : `${scorecard.overallScore}／100`),
        row('評価', verdictLabel(scorecard.verdict)),
        ...scorecard.categories.map((c) => row(c.label, c.score === null ? BLANK : `${c.score}／100`)),
      ],
    });
  }

  const h = o.hydroponics;
  if (h !== null) {
    sections.push({
      title: '参考：水耕栽培事業の試算（計画値・実績ではありません）',
      caption: '設備・品目・費用の入力から算出した計画値です。上の各節の実績とは混ぜていません。',
      rows: [
        row('月商（計画）', amt(h.revenue)),
        row('営業利益（計画）', amt(h.operatingProfit)),
        row('営業利益率（計画）', pct(h.operatingMarginPct)),
        row('限界利益率（計画）', pct(h.contributionRatio)),
        row('損益分岐点売上高（月）', amt(h.bep)),
        row('出荷株数（月）', formatCount(h.shippedPlantsPerMonth, f, '株')),
        row('出荷 1 株当たり原価', yenAmt(h.costPerShippedPlantYen)),
      ],
    });
  }

  /**
   * 注記。**手入力の上書きが在るなら、それを注記で述べる** ——
   * この書面は「上記のとおり相違ありません。」で代表者名つきで終わるのに、
   * 2026-09-08 まで手入力の文字が 1 つも無く、注記は「実績の累計」と
   * 断言していた (経緯は `overviewOverrides.ts` の `staleDerivedNote`)。
   */
  const manualNote = manualOverrideNote(input.manual);
  const staleNote = staleDerivedNote(input.manual);
  const notes = [
    `金額は${UNIT_LABEL[f.unit]}単位（${roundingCaption(f)}）で表示し、負数は「${NEGATIVE_MARK[f.negative]}」で示す。比率は小数第 1 位未満を四捨五入。該当なし・算定不能は「${BLANK}」。`,
    // 手入力が混ざっているなら「実績の累計」と断言しない (述べ方を変える)。
    manualNote === null
      ? `損益・販売・人員の数値は当社が入力した実績（対象期間 ${rangeLabel}）の累計。財政状態・運転資本は基準日 ${bsLabel} の貸借対照表による。`
      : `損益・販売・人員の数値は当社が入力した実績（対象期間 ${rangeLabel}）の累計に、下記の手入力を重ねたもの。財政状態・運転資本は基準日 ${bsLabel} の貸借対照表による。`,
    ...(manualNote === null ? [] : [manualNote]),
    ...(staleNote === null ? [] : [staleNote]),
    '資金繰りは会計ソフト連携（freee）の月次営業キャッシュフロー、返済余力は同キャッシュフローと借入返済予定の突合による。',
    '経営スコアは当社内部の評価指標であり、金融機関等の信用格付けとは関係がない。',
    '本書は決算書・試算表に代わるものではなく、その補足資料として提出する。',
  ];

  return {
    title: '経営サマリー',
    subtitle: '経営概況・財務指標一覧',
    stamp: '金融機関等提出用',
    meta,
    unitCaption: unitCaption(f),
    sections,
    notes,
    attestation: {
      statement: '上記のとおり相違ありません。',
      date: today,
      companyName: p.companyName === '' ? BLANK : p.companyName,
      representative: p.representative === '' ? BLANK : p.representative,
    },
  };
}
