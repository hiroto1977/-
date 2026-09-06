/**
 * 金融機関等提出用の書面 — 経営サマリーの値が書式を通って表に並ぶこと、
 * 出せない値は「―」で埋まり行は消えないこと、書式を変えると数字が変わること (対照)。
 */
import { describe, expect, it } from 'vitest';
import {
  BANK_SUBMISSION_COLLECTION,
  DEFAULT_SUBMISSION_SETTINGS,
  EMPTY_PROFILE,
  PROFILE_MAX_LENGTH,
  buildBankSubmissionSheet,
  parseSubmissionProfile,
  periodRange,
  settingsFromRecord,
  type BankSubmissionInput,
  type BankSubmissionSettings,
  type SheetSection,
} from '../bankSubmission';
import { buildBusinessOverview, type BusinessOverview } from '../overview';
import { buildManagementScorecard } from '../../../shared/managementScorecard';
import { combineCashflowDebtService } from '../cashflowDebtService';
import { BANK_FORMAT_DEFAULT, BLANK, formatAmount } from '../../../shared/bankFormat';
import type { KpiActual } from '../kpiActuals';
import type { BalanceSheet } from '../balanceSheet';

const KPI: KpiActual[] = [
  { period: '2026-04', unit: '全社', revenue: 12_345_678, cogs: 5_000_000, advertising: 1_000_000, sga: 8_000_000, depreciation: 200_000, laborCost: 3_000_000 },
];
const BUDGET: KpiActual[] = [
  { period: '2026-04', unit: '全社', revenue: 10_000_000, cogs: 4_000_000, advertising: 1_000_000, sga: 4_000_000, depreciation: 0 },
];
const BS: BalanceSheet = {
  asOf: '2026-03-31',
  currentAssets: 8_000_000,
  cash: 3_000_000,
  inventory: 1_000_000,
  accountsReceivable: 2_000_000,
  fixedAssets: 4_000_000,
  currentLiabilities: 5_000_000,
  accountsPayable: 1_500_000,
  fixedLiabilities: 3_000_000,
  netIncome: 600_000,
};
const ACCOUNTING = [
  { month: '2026-03', income: 1_000_000, expense: 700_000, net: 300_000 },
  { month: '2026-04', income: 1_100_000, expense: 800_000, net: 300_000 },
];
const REPAYMENTS = [
  { month: '2026-03', repayment: 100_000 },
  { month: '2026-04', repayment: 100_000 },
];

function overviewWith(extra: Partial<Parameters<typeof buildBusinessOverview>[0]> = {}): BusinessOverview {
  return buildBusinessOverview({
    plan: 'business',
    sales: [],
    kpiActuals: KPI,
    kpiBudgets: BUDGET,
    balanceSheet: BS,
    accounting: ACCOUNTING,
    members: [{ role: 'owner' }, { role: 'admin' }],
    ...extra,
  });
}

const SETTINGS: BankSubmissionSettings = {
  profile: { companyName: '株式会社テスト', representative: '代表取締役 山田 太郎', address: '東京都千代田区1-1', fiscalYearEnd: '2026-03' },
  format: BANK_FORMAT_DEFAULT,
};

function inputWith(
  overview: BusinessOverview,
  settings: BankSubmissionSettings = SETTINGS,
  extra: Partial<BankSubmissionInput> = {},
): BankSubmissionInput {
  return {
    overview,
    scorecard: buildManagementScorecard({ operatingMarginPct: overview.kpi.operatingMarginPct, grossMarginPct: overview.kpi.grossMarginPct }),
    debtService: combineCashflowDebtService(ACCOUNTING, REPAYMENTS),
    kpiPeriods: ['2026-04'],
    balanceSheetAsOf: '2026-03-31',
    today: '2026-09-04',
    settings,
    ...extra,
  };
}

const section = (sections: readonly SheetSection[], prefix: string): SheetSection => {
  const s = sections.find((x) => x.title.startsWith(prefix));
  if (!s) throw new Error(`section ${prefix} missing`);
  return s;
};
const value = (s: SheetSection, label: string): string => {
  const r = s.rows.find((x) => x.label === label);
  if (!r) throw new Error(`row ${label} missing in ${s.title}`);
  return r.value;
};
const note = (s: SheetSection, label: string): string => s.rows.find((x) => x.label === label)?.note ?? '';

describe('buildBankSubmissionSheet — 表題と提出者情報', () => {
  it('表題・提出用の印・提出者情報・対象期間・基準日・作成日・表示単位', () => {
    const m = buildBankSubmissionSheet(inputWith(overviewWith()));
    expect(m.title).toBe('経営サマリー');
    expect(m.stamp).toBe('金融機関等提出用');
    expect(m.unitCaption).toBe('（単位：千円）');
    expect(m.meta).toEqual([
      { label: '商号', value: '株式会社テスト' },
      { label: '代表者', value: '代表取締役 山田 太郎' },
      { label: '所在地', value: '東京都千代田区1-1' },
      { label: '決算期', value: '令和8年3月期' },
      { label: '対象期間', value: '令和8年4月' },
      { label: '貸借対照表 基準日', value: '令和8年3月31日' },
      { label: '作成日', value: '令和8年9月4日' },
      { label: '表示単位', value: '千円（千円未満切捨て）' },
    ]);
    expect(m.attestation).toEqual({
      statement: '上記のとおり相違ありません。',
      date: '令和8年9月4日',
      companyName: '株式会社テスト',
      representative: '代表取締役 山田 太郎',
    });
  });
  it('提出者情報が空なら「―」。西暦にすると日付が変わる (対照)', () => {
    const m = buildBankSubmissionSheet(
      inputWith(overviewWith(), { profile: EMPTY_PROFILE, format: { ...BANK_FORMAT_DEFAULT, era: 'seireki' } }),
    );
    expect(m.meta.slice(0, 4).map((x) => x.value)).toEqual([BLANK, BLANK, BLANK, BLANK]);
    expect(m.meta.find((x) => x.label === '作成日')?.value).toBe('2026年9月4日');
    expect(m.meta.find((x) => x.label === '対象期間')?.value).toBe('2026年4月');
    expect(m.attestation.companyName).toBe(BLANK);
    expect(m.attestation.representative).toBe(BLANK);
  });
  it('対象期間は期の最初と最後、貸借対照表が無ければ基準日は「―」', () => {
    const m = buildBankSubmissionSheet(
      inputWith(overviewWith({ balanceSheet: null }), SETTINGS, { kpiPeriods: ['2026-06', '2026-01', 'bad', '2026-03'], balanceSheetAsOf: null }),
    );
    expect(m.meta.find((x) => x.label === '対象期間')?.value).toBe('令和8年1月〜令和8年6月');
    expect(m.meta.find((x) => x.label === '貸借対照表 基準日')?.value).toBe(BLANK);
  });
});

describe('buildBankSubmissionSheet — 各節の数値', () => {
  it('損益: 千円単位・切捨て、赤字は △', () => {
    const o = overviewWith();
    const m = buildBankSubmissionSheet(inputWith(o));
    const s = section(m.sections, '1.');
    expect(s.caption).toBeNull();
    expect(value(s, '売上高')).toBe('12,345');
    expect(value(s, '売上総利益')).toBe('7,345');
    expect(value(s, '売上総利益率')).toBe('59.5%');
    expect(o.kpi.operatingProfit).toBeLessThan(0);
    expect(value(s, '営業利益')).toBe(formatAmount(o.kpi.operatingProfit, BANK_FORMAT_DEFAULT));
    expect(value(s, '営業利益')).toMatch(/^△[\d,]+$/);
    expect(value(s, '営業利益率')).toMatch(/^△\d+\.\d%$/);
    expect(value(s, 'EBITDA')).toBe(formatAmount(o.kpi.ebitda, BANK_FORMAT_DEFAULT));
    expect(value(s, '売上原価率')).toBe('40.5%');
    expect(note(s, '営業利益')).toContain('売上総利益');
    expect(s.rows.map((r) => r.label)).toEqual([
      '売上高', '売上総利益', '売上総利益率', '営業利益', '営業利益率', 'EBITDA', 'EBITDA マージン',
      '売上原価率', '広告宣伝費率', '販売費及び一般管理費率', '限界利益率', '損益分岐点売上高', '安全余裕率',
    ]);
  });
  it('書式を変えると数字が変わる (円・マイナス記号・四捨五入・百万円)', () => {
    const o = overviewWith();
    const yen = buildBankSubmissionSheet(inputWith(o, { ...SETTINGS, format: { ...BANK_FORMAT_DEFAULT, unit: 'yen', negative: 'minus' } }));
    const s = section(yen.sections, '1.');
    expect(value(s, '売上高')).toBe('12,345,678');
    expect(value(s, '営業利益')).toMatch(/^-[\d,]+$/);
    expect(yen.unitCaption).toBe('（単位：円）');
    const mil = buildBankSubmissionSheet(inputWith(o, { ...SETTINGS, format: { ...BANK_FORMAT_DEFAULT, unit: 'million', rounding: 'round' } }));
    expect(value(section(mil.sections, '1.'), '売上高')).toBe('12');
    expect(mil.meta.find((x) => x.label === '表示単位')?.value).toBe('百万円（百万円未満四捨五入）');
    expect(mil.notes[0]).toContain('百万円未満四捨五入');
  });
  it('KPI 未入力なら損益・成長性は「―」で行は残り、断り書きが付く。経営スコアの節は出ない', () => {
    const o = overviewWith({ kpiActuals: [], kpiBudgets: [] });
    const m = buildBankSubmissionSheet(inputWith(o, SETTINGS, { kpiPeriods: [] }));
    const s = section(m.sections, '1.');
    expect(s.rows).toHaveLength(13);
    expect(s.rows.every((r) => r.value === BLANK)).toBe(true);
    expect(s.caption).toContain('未入力');
    const g = section(m.sections, '7.');
    expect(g.rows.every((r) => r.value === BLANK)).toBe(true);
    expect(m.sections.some((x) => x.title.includes('経営スコア'))).toBe(false);
    expect(m.sections.some((x) => x.title.startsWith('8.'))).toBe(false);
    expect(m.meta.find((x) => x.label === '対象期間')?.value).toBe(BLANK);
  });
  it('販売: 記録が無ければ単価・主力チャネルは「―」、件数は 0', () => {
    const m = buildBankSubmissionSheet(inputWith(overviewWith()));
    const s = section(m.sections, '2.');
    expect(value(s, '売上高（販売記録）')).toBe('0');
    expect(value(s, '受注件数')).toBe('0件');
    expect(value(s, '主力チャネル')).toBe(BLANK);
    expect(value(s, '売上分散スコア')).toBe(BLANK);
    expect(value(s, '販売チャネル数')).toBe('0');
  });
  it('人員・生産性: 名数と一人当たり、人件費の率', () => {
    const m = buildBankSubmissionSheet(inputWith(overviewWith()));
    const s = section(m.sections, '3.');
    expect(value(s, '従業員数')).toBe('2名');
    expect(value(s, '一人当たり売上高')).toBe('6,172');
    expect(value(s, '人件費')).toBe('3,000');
    expect(value(s, '労働分配率')).toBe('40.8%');
    expect(value(s, '人件費率')).toBe('24.3%');
    expect(value(s, '一人当たり人件費')).toBe('1,500');
  });
  it('財政状態: 貸借対照表の額と比率。無ければ「―」と断り書き', () => {
    const m = buildBankSubmissionSheet(inputWith(overviewWith()));
    const s = section(m.sections, '4.');
    expect(s.caption).toBeNull();
    expect(value(s, '総資産')).toBe('12,000');
    expect(value(s, '負債合計')).toBe('8,000');
    expect(value(s, '純資産')).toBe('4,000');
    expect(note(s, '純資産')).toBe('総資産 − 負債合計');
    expect(value(s, '自己資本比率')).toBe('33.3%');
    expect(value(s, '流動比率')).toBe('160.0%');
    expect(value(s, '当座比率')).toBe('140.0%');
    expect(value(s, '固定比率')).toBe('100.0%');
    expect(value(s, '総資産利益率（ROA）')).toBe('5.0%');
    expect(value(s, '自己資本利益率（ROE）')).toBe('15.0%');
    const none = buildBankSubmissionSheet(inputWith(overviewWith({ balanceSheet: null }), SETTINGS, { balanceSheetAsOf: null }));
    const n = section(none.sections, '4.');
    expect(n.rows.every((r) => r.value === BLANK)).toBe(true);
    expect(n.caption).toContain('貸借対照表');
    expect(section(none.sections, '5.').rows.every((r) => r.value === BLANK)).toBe(true);
  });
  it('債務超過は純資産の備考に出る', () => {
    const m = buildBankSubmissionSheet(inputWith(overviewWith({ balanceSheet: { ...BS, fixedLiabilities: 30_000_000 } })));
    const s = section(m.sections, '4.');
    expect(value(s, '純資産')).toBe('△23,000');
    expect(note(s, '純資産')).toBe('債務超過');
  });
  it('運転資本: 日数と額', () => {
    const m = buildBankSubmissionSheet(inputWith(overviewWith()));
    const s = section(m.sections, '5.');
    expect(value(s, '売上債権回転日数（DSO）')).toMatch(/^\d+\.\d日$/);
    expect(value(s, '現金化サイクル（CCC）')).toMatch(/^△?\d+\.\d日$/);
    expect(value(s, '運転資本')).toBe('1,500');
  });
  it('資金繰り・返済余力: 会計連携の CF と DSCR。連携が無ければ「―」', () => {
    const m = buildBankSubmissionSheet(inputWith(overviewWith()));
    const s = section(m.sections, '6.');
    expect(value(s, '営業キャッシュフロー（累計）')).toBe('600');
    expect(note(s, '営業キャッシュフロー（累計）')).toBe('2か月分');
    expect(value(s, '営業キャッシュフロー（月次平均）')).toBe('300');
    expect(value(s, '返済余力（DSCR）')).toBe('3.00倍');
    expect(value(s, '最悪月の返済余力')).toBe('3.00倍');
    expect(value(s, '返済不足の月数')).toBe('0／2か月');
    const none = buildBankSubmissionSheet(inputWith(overviewWith({ accounting: [] }), SETTINGS, { debtService: null }));
    const n = section(none.sections, '6.');
    expect(n.rows.every((r) => r.value === BLANK)).toBe(true);
    expect(n.caption).toContain('freee');
  });
  it('資金ランウェイと予測残高は現預金 + 資金流出のときだけ', () => {
    const burn = [
      { month: '2026-03', income: 100_000, expense: 700_000, net: -600_000 },
      { month: '2026-04', income: 100_000, expense: 700_000, net: -600_000 },
    ];
    const o = overviewWith({ accounting: burn });
    const m = buildBankSubmissionSheet(inputWith(o, SETTINGS, { debtService: combineCashflowDebtService(burn, REPAYMENTS) }));
    const s = section(m.sections, '6.');
    expect(o.runwayMonths).not.toBeNull();
    expect(value(s, '資金ランウェイ')).toBe(`${o.runwayMonths}か月`);
    expect(value(s, '12か月後の予測残高')).toMatch(/^△[\d,]+$/);
    expect(value(s, '資金ショート予測')).toMatch(/^\d+か月後$/);
    expect(value(s, '返済余力（DSCR）')).toBe('△6.00倍');
    // 対照: 資金が流入していればランウェイは「―」
    const calm = buildBankSubmissionSheet(inputWith(overviewWith()));
    expect(value(section(calm.sections, '6.'), '資金ランウェイ')).toBe(BLANK);
  });
  it('成長性: 期が 1 つなら成長率は「―」、期が並べばトレンドと前期比が出る', () => {
    const one = buildBankSubmissionSheet(inputWith(overviewWith()));
    const g1 = section(one.sections, '7.');
    expect(value(g1, '前期比売上高成長率')).toBe(BLANK);
    expect(value(g1, '売上トレンド')).toBe(BLANK);
    expect(value(g1, '当年度売上着地見込み')).toMatch(/^[\d,]+$/);
    expect(note(g1, '当年度売上着地見込み')).toBe('2026年（1か月経過、実績 12,345）');
    const many: KpiActual[] = ['2025-04', '2026-01', '2026-02', '2026-03', '2026-04'].map((period, i) => ({
      period, unit: '全社', revenue: 1_000_000 * (i + 1), cogs: 100_000, advertising: 0, sga: 100_000, depreciation: 0,
    }));
    const m = buildBankSubmissionSheet(inputWith(overviewWith({ kpiActuals: many }), SETTINGS, { kpiPeriods: many.map((k) => k.period) }));
    const g = section(m.sections, '7.');
    expect(value(g, '前期比売上高成長率')).toBe('25.0%');
    expect(value(g, '売上トレンド')).toBe('上昇');
    expect(value(g, '前年同月比')).toBe('400.0%');
    expect(note(g, '前年同月比')).toBe('令和8年4月 対 令和7年4月');
  });
  it('予算実績差異は予算があるときだけ。経営スコアの番号はその後ろ', () => {
    const m = buildBankSubmissionSheet(inputWith(overviewWith()));
    const b = section(m.sections, '8. 予算');
    expect(value(b, '売上高（予算）')).toBe('10,000');
    expect(value(b, '売上高（実績）')).toBe('12,345');
    expect(value(b, '売上高（差異）')).toBe('2,345');
    expect(value(b, '売上高 達成率')).toBe('123.5%');
    expect(value(b, '営業利益（予算）')).toBe('1,000');
    expect(value(b, '営業利益（差異）')).toMatch(/^△[\d,]+$/);
    expect(m.sections.some((x) => x.title.startsWith('9. 参考：経営スコア'))).toBe(true);
    const noBudget = buildBankSubmissionSheet(inputWith(overviewWith({ kpiBudgets: [] })));
    expect(noBudget.sections.some((x) => x.title.startsWith('8. 予算'))).toBe(false);
    expect(noBudget.sections.some((x) => x.title.startsWith('8. 参考：経営スコア'))).toBe(true);
  });
  it('経営スコアは総合と分野ごと、内部評価の断り書きつき', () => {
    const input = inputWith(overviewWith());
    const m = buildBankSubmissionSheet(input);
    const s = section(m.sections, '9.');
    expect(value(s, '総合スコア')).toBe(`${input.scorecard.overallScore}／100`);
    expect(['要改善', '注意', '良好', '優良']).toContain(value(s, '評価'));
    expect(s.caption).toContain('信用格付けとは関係がありません');
    for (const c of input.scorecard.categories) {
      expect(value(s, c.label)).toBe(c.score === null ? BLANK : `${c.score}／100`);
    }
    expect(input.scorecard.categories.some((c) => c.score === null)).toBe(true);
    expect(input.scorecard.categories.some((c) => c.score !== null)).toBe(true);
  });
  it('水耕栽培の試算は計画値として最後に付く (無ければ付かない)', () => {
    const base = overviewWith();
    expect(buildBankSubmissionSheet(inputWith(base)).sections.some((x) => x.title.includes('水耕栽培'))).toBe(false);
    const withHydro: BusinessOverview = {
      ...base,
      hydroponics: {
        shippedPlantsPerMonth: 12_000, shippedPlantsPerDay: 400, shippedKgPerYear: 14_400, revenue: 1_800_000,
        operatingProfit: 250_000, operatingMarginPct: 13.9, contributionRatio: 55.5, bep: 1_400_000,
        breakEvenPlantsPerMonth: 9_333, meetsBreakEven: true, costPerShippedPlantYen: 85.4, energyKwhPerYear: 30_000,
        electricityYenPerYear: 900_000, electricityCostRatioPct: 22.1, lowPotassium: null,
      },
    };
    const m = buildBankSubmissionSheet(inputWith(withHydro));
    const s = m.sections[m.sections.length - 1]!;
    expect(s.title).toBe('参考：水耕栽培事業の試算（計画値・実績ではありません）');
    expect(s.rows).toEqual([
      { label: '月商（計画）', value: '1,800', note: '' },
      { label: '営業利益（計画）', value: '250', note: '' },
      { label: '営業利益率（計画）', value: '13.9%', note: '' },
      { label: '限界利益率（計画）', value: '55.5%', note: '' },
      { label: '損益分岐点売上高（月）', value: '1,400', note: '' },
      { label: '出荷株数（月）', value: '12,000株', note: '' },
      { label: '出荷 1 株当たり原価', value: '85円', note: '' },
    ]);
    expect(s.caption).toBe('設備・品目・費用の入力から算出した計画値です。上の各節の実績とは混ぜていません。');
  });
  it('注記は書式と出所を言う', () => {
    const m = buildBankSubmissionSheet(inputWith(overviewWith()));
    expect(m.notes).toHaveLength(5);
    expect(m.notes[0]).toBe('金額は千円単位（千円未満切捨て）で表示し、負数は「△」で示す。比率は小数第 1 位未満を四捨五入。該当なし・算定不能は「―」。');
    expect(m.notes[1]).toContain('対象期間 令和8年4月');
    expect(m.notes[1]).toContain('基準日 令和8年3月31日');
    expect(m.notes[3]).toContain('信用格付け');
    const minus = buildBankSubmissionSheet(inputWith(overviewWith(), { ...SETTINGS, format: { ...BANK_FORMAT_DEFAULT, negative: 'minus' } }));
    expect(minus.notes[0]).toContain('負数は「-」');
  });
});

describe('periodRange', () => {
  it('読める期だけを並べて最初と最後', () => {
    expect(periodRange(['2026-06', 'x', '2026-01', '2026-13', '2025-12'])).toEqual({ from: '2025-12', to: '2026-06' });
    expect(periodRange(['2026-04'])).toEqual({ from: '2026-04', to: '2026-04' });
    expect(periodRange([])).toBeNull();
    expect(periodRange(['bad'])).toBeNull();
  });
});

describe('parseSubmissionProfile / settingsFromRecord', () => {
  it('空でも通る。前後の空白は落とす', () => {
    expect(parseSubmissionProfile({})).toEqual({ ok: true, profile: EMPTY_PROFILE });
    expect(parseSubmissionProfile({ companyName: '  株式会社テスト ', fiscalYearEnd: '2026-03' })).toEqual({
      ok: true, profile: { ...EMPTY_PROFILE, companyName: '株式会社テスト', fiscalYearEnd: '2026-03' },
    });
  });
  it('断る: 文字以外・制御文字・長すぎ・読めない決算期', () => {
    const controlChar = String.fromCharCode(1);
    expect(parseSubmissionProfile({ companyName: 12 })).toEqual({ ok: false, reason: '商号は文字で入力してください' });
    expect(parseSubmissionProfile({ representative: `a${controlChar}b` })).toEqual({ ok: false, reason: '代表者に制御文字が含まれています' });
    expect(parseSubmissionProfile({ address: 'あ'.repeat(PROFILE_MAX_LENGTH + 1) })).toEqual({
      ok: false, reason: `所在地は ${PROFILE_MAX_LENGTH} 文字以内で入力してください`,
    });
    expect(parseSubmissionProfile({ address: 'あ'.repeat(PROFILE_MAX_LENGTH) }).ok).toBe(true);
    expect(parseSubmissionProfile({ fiscalYearEnd: '2026/03' })).toEqual({ ok: false, reason: '決算期は 2026-03 のように「年-月」で入力してください' });
    expect(parseSubmissionProfile({ fiscalYearEnd: '2026-13' }).ok).toBe(false);
    expect(parseSubmissionProfile({ fiscalYearEnd: null }).ok).toBe(true);
  });
  it('保存レコードを読む: 壊れていても書面は出る', () => {
    expect(settingsFromRecord(undefined)).toEqual(DEFAULT_SUBMISSION_SETTINGS);
    expect(settingsFromRecord('x')).toEqual(DEFAULT_SUBMISSION_SETTINGS);
    expect(settingsFromRecord({ profile: 'x', format: 'y' })).toEqual(DEFAULT_SUBMISSION_SETTINGS);
    expect(settingsFromRecord({ profile: { companyName: 7 }, format: { unit: 'yen' } })).toEqual({
      profile: EMPTY_PROFILE, format: { ...BANK_FORMAT_DEFAULT, unit: 'yen' },
    });
    expect(settingsFromRecord(SETTINGS)).toEqual(SETTINGS);
    expect(BANK_SUBMISSION_COLLECTION).toBe('bank-submission-settings');
  });
});

/**
 * **印刷した式が、印刷した数字で成り立つこと。**
 *
 * 4. 財政状態は「純資産」の備考に **総資産 − 負債合計** と書いてある。
 * 各行を円から別々に丸めていた 2026-09-06 まで、この式は印刷した数字では
 * 成り立たなかった —— 実測で下の 40 通りのうち **21 通り**がずれた
 * (例: 総資産 10,000 千円 − 負債合計 3,999 千円 = 6,001 なのに純資産は 6,000)。
 * 金融機関へ出す書面で、式を隣に書いておきながら数字が合わないのは通らない。
 *
 * 対照は 2 つ: (1) 丸めた値で作った純資産が**厳密値から表示単位 1 つ以上離れない**
 * こと (勝手な数字を書いていない)、(2) 円単位表示では丸めが無いので厳密値と一致すること。
 */
describe('書面の中で式が成り立つ (印刷した行同士の足し算)', () => {
  /** 印刷された金額を数に戻す (△ / ▲ / - と 3 桁区切りを外す)。 */
  const printed = (v: string): number => {
    if (v === BLANK) return Number.NaN;
    const neg = /^[△▲-]/.test(v);
    const body = Number(v.replace(/^[△▲-]/, '').replace(/,/g, ''));
    return neg ? -body : body;
  };

  /** 貸借対照表を 1 つ作る (端数が揃わない値を狙って振る)。 */
  const bsAt = (i: number): BalanceSheet => ({
    asOf: '2026-03-31',
    currentAssets: 6_000_000 + i * 137,
    cash: 3_000_000,
    inventory: 1_000_000 + i * 11,
    accountsReceivable: 2_000_000 + i * 7,
    fixedAssets: 4_000_000 + i * 91,
    currentLiabilities: 999_999 + i * 313,
    accountsPayable: 1_500_000 + i * 3,
    fixedLiabilities: 3_000_000 + i * 29,
    netIncome: 600_000,
  });

  const positionOf = (bs: BalanceSheet, settings: BankSubmissionSettings = SETTINGS): SheetSection =>
    section(buildBankSubmissionSheet(inputWith(overviewWith({ balanceSheet: bs }), settings)).sections, '4.');

  it('★ 純資産 = 総資産 − 負債合計 (40 通り・千円切捨て)', () => {
    const broken: string[] = [];
    for (let i = 0; i < 40; i += 1) {
      const s4 = positionOf(bsAt(i));
      const assets = printed(value(s4, '総資産'));
      const liabilities = printed(value(s4, '負債合計'));
      const net = printed(value(s4, '純資産'));
      if (assets - liabilities !== net) broken.push(`i=${i}: ${assets} − ${liabilities} ≠ ${net}`);
    }
    expect(broken).toEqual([]);
  });

  it('★ 記録に残す 1 例 (2026-09-06 まで 6,000 と出ていた)', () => {
    const s4 = positionOf(bsAt(0));
    expect(value(s4, '総資産')).toBe('10,000');
    expect(value(s4, '負債合計')).toBe('3,999');
    expect(value(s4, '純資産')).toBe('6,001');
    expect(note(s4, '純資産')).toBe('総資産 − 負債合計');
  });

  it('対照: 丸めた値で作っても、厳密値から表示単位 1 つ以上は離れない', () => {
    for (let i = 0; i < 40; i += 1) {
      const bs = bsAt(i);
      const exact = formatAmount(
        bs.currentAssets + bs.fixedAssets - (bs.currentLiabilities + bs.fixedLiabilities),
        BANK_FORMAT_DEFAULT,
      );
      const shown = value(positionOf(bs), '純資産');
      expect(Math.abs(printed(shown) - printed(exact)), `i=${i}`).toBeLessThanOrEqual(1);
    }
  });

  it('対照: 円単位表示なら丸めが無いので厳密値と一致する', () => {
    const yenFormat: BankSubmissionSettings = {
      ...SETTINGS,
      format: { ...BANK_FORMAT_DEFAULT, unit: 'yen' },
    };
    for (let i = 0; i < 5; i += 1) {
      const bs = bsAt(i);
      const s4 = positionOf(bs, yenFormat);
      const exact = bs.currentAssets + bs.fixedAssets - (bs.currentLiabilities + bs.fixedLiabilities);
      expect(printed(value(s4, '純資産')), `i=${i}`).toBe(exact);
    }
  });

  it('対照: CCC は元から合っている (回転日数を先に丸め、その和で作っている)', () => {
    // `data/workingCapital.ts` の `day()` が小数 1 桁へ丸めた値を CCC の材料にする。
    // 同じ形をこちらだけ間違えていた、という記録のために対照を置く。
    const s5 = section(buildBankSubmissionSheet(inputWith(overviewWith())).sections, '5.');
    const days = (label: string): number => Number(value(s5, label).replace('日', ''));
    const sum = Math.round((days('売上債権回転日数（DSO）') + days('棚卸資産回転日数（DIO）') - days('仕入債務回転日数（DPO）')) * 10) / 10;
    expect(days('現金化サイクル（CCC）')).toBe(sum);
  });
});

describe('境目の追加検査 (変異検査で残った分岐)', () => {
  it('決算期・期の正規表現は前後に余分な文字を許さない', () => {
    expect(parseSubmissionProfile({ fiscalYearEnd: 'x2026-03' }).ok).toBe(false);
    expect(parseSubmissionProfile({ fiscalYearEnd: '2026-03x' }).ok).toBe(false);
    expect(parseSubmissionProfile({ fiscalYearEnd: '2026-03' }).ok).toBe(true);
    expect(periodRange(['x2026-03', '2026-03x', '2026-3'])).toBeNull();
  });
  it('保存レコードが null / profile が null でも落ちない', () => {
    expect(settingsFromRecord(null)).toEqual(DEFAULT_SUBMISSION_SETTINGS);
    expect(settingsFromRecord({ profile: null, format: null })).toEqual(DEFAULT_SUBMISSION_SETTINGS);
    expect(settingsFromRecord({ profile: { fiscalYearEnd: '2026/03' } }).profile).toEqual(EMPTY_PROFILE);
  });
  it('単価が算定不能なら「―」(「―円」にしない)', () => {
    const base = overviewWith();
    const o: BusinessOverview = { ...base, sales: { ...base.sales, aov: Number.POSITIVE_INFINITY } };
    const m = buildBankSubmissionSheet(inputWith(o));
    expect(value(section(m.sections, '2.'), '平均受注単価')).toBe(BLANK);
  });
  it('運転資本・資金繰りの断り書きは入力が揃っていれば付かない', () => {
    const m = buildBankSubmissionSheet(inputWith(overviewWith()));
    expect(section(m.sections, '5.').caption).toBeNull();
    expect(section(m.sections, '6.').caption).toBeNull();
    expect(section(m.sections, '7.').caption).toBeNull();
    expect(section(m.sections, '2.').caption).toBeNull();
    expect(section(m.sections, '3.').caption).toBeNull();
  });
});
