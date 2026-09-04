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
import {
  BANK_FORMAT_DEFAULT,
  BLANK,
  NEGATIVE_MARK,
  UNIT_LABEL,
  formatAmount,
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
import { VERDICT_LABEL, type ManagementScorecard } from '../../shared/managementScorecard';
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
  if (out.fiscalYearEnd !== '' && !/^\d{4}-(0[1-9]|1[0-2])$/.test(out.fiscalYearEnd)) {
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
  /** KPI 実績の期 (`YYYY-MM`)。対象期間の表示に使う。 */
  readonly kpiPeriods: readonly string[];
  /** 貸借対照表の基準日 (`YYYY-MM-DD`)。未入力は null。 */
  readonly balanceSheetAsOf: string | null;
  /** 作成日 (現地の `YYYY-MM-DD`)。 */
  readonly today: string;
  readonly settings: BankSubmissionSettings;
}

const TREND_LABEL: Readonly<Record<'up' | 'down' | 'flat', string>> = { up: '上昇', down: '下降', flat: '横ばい' };

/** KPI の期から対象期間 (最初と最後の月) を取る。読めない期は無視。 */
export function periodRange(periods: readonly string[]): { from: string; to: string } | null {
  const valid = periods.filter((p) => /^\d{4}-(0[1-9]|1[0-2])$/.test(p)).sort();
  if (valid.length === 0) return null;
  return { from: valid[0]!, to: valid[valid.length - 1]! };
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

  const range = periodRange(input.kpiPeriods);
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
  const sections: SheetSection[] = [];

  sections.push({
    title: '1. 損益の状況（対象期間の累計）',
    caption: has ? null : 'KPI 実績が未入力のため算定していません。',
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

  const conc = o.sales.concentration;
  sections.push({
    title: '2. 販売の状況',
    caption: null,
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
  sections.push({
    title: '3. 人員・生産性',
    caption: null,
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
    caption: fp === null ? '貸借対照表が未入力のため算定していません。' : null,
    rows: [
      row('総資産', fp === null ? BLANK : amt(fp.totalAssets)),
      row('負債合計', fp === null ? BLANK : amt(fp.totalLiabilities)),
      row('純資産', fp === null ? BLANK : amt(fp.netAssets), fp !== null && fp.insolvent ? '債務超過' : '総資産 − 負債合計'),
      row('自己資本比率', fp === null ? BLANK : pct(fp.equityRatioPct), '純資産 ÷ 総資産'),
      row('流動比率', fp === null ? BLANK : pct(fp.currentRatioPct), '流動資産 ÷ 流動負債'),
      row('当座比率', fp === null ? BLANK : pct(fp.quickRatioPct), '(流動資産 − 棚卸資産) ÷ 流動負債'),
      row('固定比率', fp === null ? BLANK : pct(fp.fixedRatioPct), '固定資産 ÷ 純資産'),
      row('総資産利益率（ROA）', fp === null ? BLANK : pct(fp.roaPct), '当期純利益 ÷ 総資産'),
      row('自己資本利益率（ROE）', fp === null ? BLANK : pct(fp.roePct), '当期純利益 ÷ 純資産'),
    ],
  });

  const wc = o.workingCapital;
  sections.push({
    title: '5. 運転資本',
    caption: wc === null ? '貸借対照表と売上高が揃っていないため算定していません。' : null,
    rows: [
      row('売上債権回転日数（DSO）', wc === null ? BLANK : days(wc.dso), '売上債権 ÷ 売上高 × 365'),
      row('棚卸資産回転日数（DIO）', wc === null ? BLANK : days(wc.dio), '棚卸資産 ÷ 売上原価 × 365'),
      row('仕入債務回転日数（DPO）', wc === null ? BLANK : days(wc.dpo), '仕入債務 ÷ 売上原価 × 365'),
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
      row('営業キャッシュフロー（累計）', acc === null ? BLANK : amt(acc.totalNet), acc === null ? '' : `${acc.months}か月分`),
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

  const b = o.budget;
  if (b !== null) {
    sections.push({
      title: '8. 予算実績差異',
      caption: null,
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
    });
  }

  if (has) {
    sections.push({
      title: `${b === null ? 8 : 9}. 参考：経営スコア（当社内部の評価）`,
      caption: '本アプリの採点であり、金融機関等の信用格付けとは関係がありません。',
      rows: [
        row('総合スコア', `${scorecard.overallScore}／100`),
        row('評価', VERDICT_LABEL[scorecard.verdict]),
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

  const notes = [
    `金額は${UNIT_LABEL[f.unit]}単位（${roundingCaption(f)}）で表示し、負数は「${NEGATIVE_MARK[f.negative]}」で示す。比率は小数第 1 位未満を四捨五入。該当なし・算定不能は「${BLANK}」。`,
    `損益・販売・人員の数値は当社が入力した実績（対象期間 ${rangeLabel}）の累計。財政状態・運転資本は基準日 ${bsLabel} の貸借対照表による。`,
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
