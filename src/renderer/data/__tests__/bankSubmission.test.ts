/**
 * 金融機関等提出用の書面 — 経営サマリーの値が書式を通って表に並ぶこと、
 * 出せない値は「―」で埋まり行は消えないこと、書式を変えると数字が変わること (対照)。
 */
import { describe, expect, it, vi } from 'vitest';
import {
  BANK_SUBMISSION_COLLECTION,
  DEFAULT_SUBMISSION_SETTINGS,
  EMPTY_PROFILE,
  PROFILE_MAX_LENGTH,
  buildBankSubmissionSheet,
  periodScopeNote,
  parseSubmissionProfile,
  periodRange,
  settingsFromRecord,
  type BankSubmissionInput,
  type BankSubmissionSettings,
  type SheetSection,
} from '../bankSubmission';
import { buildBusinessOverview, type BusinessOverview } from '../overview';
import { NO_MANUAL_OVERRIDES } from '../overviewOverrides';
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
    scorecard: buildManagementScorecard({
      operatingMarginPct: overview.kpi.operatingMarginPct ?? undefined,
      grossMarginPct: overview.kpi.grossMarginPct ?? undefined,
    }),
    debtService: combineCashflowDebtService(ACCOUNTING, REPAYMENTS),
    balanceSheetAsOf: '2026-03-31',
    today: '2026-09-04',
    settings,
    manual: NO_MANUAL_OVERRIDES,
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
  /**
   * **この検査は、ヘッダが図と別の期を語る書面を作っていた。** (2026-09-08)
   *
   * 旧: `kpiPeriods: ['2026-01' … '2026-06']` を**別の引数で**渡し、overview は
   * `KPI` (2026-04 の 1 件) から作っていたので、対象期間は「令和8年1月〜令和8年6月」・
   * §1 の売上高は 1 か月の累計、という書面が組めていた。期は overview の
   * `kpi.periods` **1 か所**から来るようにしたので、この食い違いは型として作れない。
   */
  it('対象期間は期の最初と最後 (overview と同じ出所)、貸借対照表が無ければ基準日は「―」', () => {
    const m = buildBankSubmissionSheet(
      inputWith(overviewWith({ balanceSheet: null }), SETTINGS, { balanceSheetAsOf: null }),
    );
    expect(m.meta.find((x) => x.label === '対象期間')?.value).toBe('令和8年4月');
    expect(m.meta.find((x) => x.label === '貸借対照表 基準日')?.value).toBe(BLANK);
  });

  it('★ 期が複数あれば対象期間は最初〜最後 (overview の期から出す)', () => {
    const many = ['2026-01', '2026-03', '2026-06'].map((period) => ({ ...KPI[0]!, period }));
    const m = buildBankSubmissionSheet(inputWith(overviewWith({ kpiActuals: many }), SETTINGS));
    expect(m.meta.find((x) => x.label === '対象期間')?.value).toBe('令和8年1月〜令和8年6月');
  });
});

describe('buildBankSubmissionSheet — 各節の数値', () => {
  it('損益: 千円単位・切捨て、赤字は △', () => {
    const o = overviewWith();
    const m = buildBankSubmissionSheet(inputWith(o));
    const s = section(m.sections, '1.');
    // この見本は決算期 2026-03 を宣言しつつ KPI 実績が 2026-04 の 1 か月だけなので、
    // 2026-09-07 から**関係を述べる断り書き**が付く (それまでは無言だった)。
    expect(s.caption).toBe('上の金額は令和8年4月・1 か月の累計で、令和8年3月期（令和7年4月〜令和8年3月）の 12 か月とは一致しません。');
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
    const m = buildBankSubmissionSheet(inputWith(o, SETTINGS));
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
    expect(note(s, '営業キャッシュフロー（累計）')).toBe('令和8年3月〜令和8年4月・2か月分');
    expect(value(s, '営業キャッシュフロー（月次平均）')).toBe('300');
    expect(value(s, '返済余力（DSCR）')).toBe('3.00倍');
    expect(value(s, '最悪月の返済余力')).toBe('3.00倍');
    expect(value(s, '返済不足の月数')).toBe('0／2か月');
    const none = buildBankSubmissionSheet(inputWith(overviewWith({ accounting: [] }), SETTINGS, { debtService: null }));
    const n = section(none.sections, '6.');
    expect(n.rows.every((r) => r.value === BLANK)).toBe(true);
    expect(n.caption).toContain('freee');
  });

  /**
   * **返済余力は「突合できた月について」の数字である。**
   * 返済予定は借入期間ぶん将来へ伸びるが実績CFは過去しか無いので、突合できない月がある。
   * 黙って落とすと、数か月の突合が借入期間ぜんぶについての主張に読める
   * (2026-09-07 まで将来の月を「営業CF 0」として数えており、実測 2.85 倍で
   *  返せている会社が 0.24 倍・55/60 か月不足と印刷されていた)。
   */
  it('★ 突合できない返済月があれば、§6 が対象の月数を述べる', () => {
    // 会計は 2026-04 の 1 か月、返済予定は 2026-04〜2026-06 の 3 か月。
    const acc = [{ month: '2026-04', income: 900_000, expense: 600_000, net: 300_000 }];
    const repay = ['2026-04', '2026-05', '2026-06'].map((month) => ({ month, repayment: 100_000 }));
    const m = buildBankSubmissionSheet(
      inputWith(overviewWith({ accounting: acc }), SETTINGS, { debtService: combineCashflowDebtService(acc, repay) }),
    );
    const s = section(m.sections, '6.');
    expect(value(s, '返済余力（DSCR）')).toBe('3.00倍');
    expect(value(s, '返済不足の月数')).toBe('0／1か月');
    expect(s.caption).toContain('1 か月について算定');
    expect(s.caption).toContain('残り 2 か月');
  });

  it('★ 対照: 全ての返済月が突合できていれば、その断り書きは出ない', () => {
    const s = section(buildBankSubmissionSheet(inputWith(overviewWith({}), SETTINGS, {})).sections, '6.');
    expect(s.caption === null || !s.caption.includes('について算定')).toBe(true);
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
    const m = buildBankSubmissionSheet(inputWith(overviewWith({ kpiActuals: many }), SETTINGS));
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

  // 2026-09-07: §8 は突合した期を書いていなかった (§1 は対象期間・§4/§5 は基準日と
  // 隔たり・§6 は会計の窓を書くのに、§8 だけ `caption: null`)。予算と実績は別々に
  // 入力するので、月数を書かないと通年の比較に読める。
  it('★ §8 が突合した期の範囲と月数を書く', () => {
    const m = buildBankSubmissionSheet(inputWith(overviewWith()));
    const b = section(m.sections, '8. 予算');
    expect(b.caption).toBe('対象: 令和8年4月・1 か月（予算と実績の両方が在る期）。');
  });

  it('★ §8 が対象外の期も書く (通期予算に対して実績が 1 か月の控え)', () => {
    const budgets: KpiActual[] = ['2026-04', '2026-05', '2026-06'].map((period) => ({
      period, unit: '全社', revenue: 10_000_000, cogs: 4_000_000, advertising: 1_000_000, sga: 4_000_000, depreciation: 0,
    }));
    const m = buildBankSubmissionSheet(inputWith(overviewWith({ kpiBudgets: budgets })));
    const b = section(m.sections, '8. 予算');
    expect(b.caption).toBe('対象: 令和8年4月・1 か月（予算と実績の両方が在る期）。予算のみ 2 か月は対象外です。');
    // 突合できた 1 か月だけで割る (3 か月ぶんの予算では割らない)
    expect(value(b, '売上高（予算）')).toBe('10,000');
    expect(value(b, '売上高 達成率')).toBe('123.5%');
  });

  it('★ 期が 1 つも重ならなければ §8 は理由と両側の期間を書き、達成率は「―」', () => {
    const budgets: KpiActual[] = ['2025-04', '2025-05'].map((period) => ({
      period, unit: '全社', revenue: 10_000_000, cogs: 4_000_000, advertising: 1_000_000, sga: 4_000_000, depreciation: 0,
    }));
    const m = buildBankSubmissionSheet(inputWith(overviewWith({ kpiBudgets: budgets })));
    const b = section(m.sections, '8. 予算');
    expect(b.caption).toBe('予算と実績で期（年月）が重なっていないため、達成率を算定していません。');
    expect(value(b, '予算の対象期間')).toBe('令和7年4月〜令和7年5月・2 か月');
    expect(value(b, '実績の対象期間')).toBe('令和8年4月・1 か月');
    expect(value(b, '売上高 達成率')).toBe(BLANK);
    // 節は在るので経営スコアは 9 のまま (番号がずれない)
    expect(m.sections.some((x) => x.title.startsWith('9. 参考：経営スコア'))).toBe(true);
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
    // §5 は**実績が 1 か月分**なので、回転日数の基礎を述べる断り書きが付く
    // (KPI の見本 `KPI` は 2026-04 の 1 件。1 年分の控えでは付かない —— 下の ★)。
    expect(section(m.sections, '5.').caption).toBe(
      '回転日数は実績の令和8年4月・1 か月分（30.4 日）で算定しています。1 年分の回転日数ではありません。',
    );
    expect(section(m.sections, '6.').caption).toBeNull();
    expect(section(m.sections, '7.').caption).toBeNull();
    // §2 / §3 は**期間**を述べる (見本は KPI 1 か月・販売記録なし)。
    // 販売記録が 1 件も無い控えでは §2 に述べることが無い。
    expect(section(m.sections, '2.').caption).toBeNull();
    expect(section(m.sections, '3.').caption).toBe(
      '一人当たりの金額と人件費は、実績の令和8年4月・1 か月分の累計を従業員数で割ったものです（年額ではありません）。',
    );
  });

  /**
   * **同じ書面に売上高が 2 つ在り、期間が別だった。** (2026-09-07)
   *
   * §1 は KPI 実績の対象期間の累計 (`periodScopeNote` が述べる)、§2 は販売記録の
   * 全件の累計。2026-09-07 まで §2 は期間を述べていなかったので、KPI 3 か月・
   * 販売記録 3 年分の控えでは 12,000 千円 と 36,000 千円 が並び、読み手には
   * どちらが何か月分かも、なぜ 3 倍違うのかも読めなかった (実測)。
   */
  it('★ §2 が販売記録の期間を述べ、KPI と食い違えばそれも述べる', () => {
    const sales = [
      { date: '2024-01-15', channel: 'base' as const, amount: 1_000_000, orders: 10 },
      { date: '2026-06-20', channel: 'base' as const, amount: 2_000_000, orders: 20 },
    ];
    const m = buildBankSubmissionSheet(inputWith(overviewWith({ sales })));
    expect(section(m.sections, '2.').caption).toBe(
      '上の金額は販売記録の令和6年1月〜令和8年6月・2 か月分の累計です。'
      + '§1 の売上高（KPI 実績）は令和8年4月・1 か月分の累計で、期間が異なります。',
    );
  });

  it('★ 対照: 販売記録と KPI が同じ月なら「期間が異なります」は付かない', () => {
    const sales = [{ date: '2026-04-15', channel: 'base' as const, amount: 1_000_000, orders: 10 }];
    const m = buildBankSubmissionSheet(inputWith(overviewWith({ sales })));
    const caption = section(m.sections, '2.').caption!;
    expect(caption).toBe('上の金額は販売記録の令和8年4月・1 か月分の累計です。');
    expect(caption).not.toContain('期間が異なります');
  });

  it('★ 対照: 1 年分そろえば §3 の但し書きは付かない (年額として読める)', () => {
    const year = ['2026-04', '2026-05', '2026-06', '2026-07', '2026-08', '2026-09',
      '2026-10', '2026-11', '2026-12', '2027-01', '2027-02', '2027-03']
      .map((period) => ({ ...KPI[0]!, period }));
    const m = buildBankSubmissionSheet(
      inputWith(overviewWith({ kpiActuals: year }), DEFAULT_SUBMISSION_SETTINGS),
    );
    expect(section(m.sections, '3.').caption).toBeNull();
  });
});

/**
 * **刷った算式が、刷った数字を出すこと — 安全余裕率** (2026-09-07)
 *
 * §3 は「安全余裕率」の備考に **(売上高 − 損益分岐点売上高) ÷ 売上高** と刷る。
 * 2026-09-07 まで元の値が `Math.max(0, 100 - bepRatio)` で下から止まっていたので、
 * 損益分岐点を下回っている会社の書面は
 *
 *   売上高 10,000 千円 / 損益分岐点売上高 15,000 千円 / **安全余裕率 0.0%**
 *
 * と刷っていた。式の通りに計算すると −50.0% で、**同じ紙の上の 3 つの数字が
 * 両立しない**。金融機関へ出す書面としては通らない (パス 81 の「純資産」と同じ形で、
 * こちらは 2 つ目の行)。
 *
 * 丸めの都合で「刷った千円から出した % 」と「刷った %」は最終桁まで一致しないので、
 * ここで留めるのは**丸めに依らない 2 つの性質**にする:
 *   (1) 売上高 < 損益分岐点売上高 なら安全余裕率は必ず**負**で刷られる、
 *   (2) 損益分岐点売上高が刷れない (算定不能) なら安全余裕率も刷らない。
 */
describe('書面の中で式が成り立つ (安全余裕率と損益分岐点売上高)', () => {
  /** 刷られた数を戻す (△ / ▲ / - と 3 桁区切りと % を外す)。 */
  const printedNum = (v: string): number => {
    const neg = /^[△▲-]/.test(v);
    const body = Number(v.replace(/^[△▲-]/, '').replace(/,/g, '').replace(/%$/, ''));
    return neg ? -body : body;
  };

  /** 固定費だけを振って、損益分岐点の上と下を跨がせる。 */
  const kpiWithFixed = (sga: number): KpiActual[] => [
    { period: '2026-04', unit: '全社', revenue: 10_000_000, cogs: 4_000_000, advertising: 0, sga, depreciation: 0, laborCost: 0 },
  ];
  const sheetWithFixed = (sga: number): SheetSection =>
    section(buildBankSubmissionSheet(inputWith(overviewWith({ kpiActuals: kpiWithFixed(sga) }))).sections, '1.');

  it('★ 売上高が損益分岐点売上高を下回る書面では、安全余裕率が負で刷られる (30 通り)', () => {
    const broken: string[] = [];
    let below = 0;
    for (let i = 0; i < 30; i += 1) {
      const s1 = sheetWithFixed(2_000_000 + i * 200_000); // BEP は 3,333 千円 → 10,000 千円 を跨ぐ
      const bep = value(s1, '損益分岐点売上高');
      const margin = value(s1, '安全余裕率');
      if (bep === BLANK) continue;
      const under = printedNum(bep) > 10_000; // 売上高 10,000 千円
      if (!under) continue;
      below += 1;
      if (!(printedNum(margin) < 0)) broken.push(`i=${i}: BEP=${bep} なのに安全余裕率=${margin}`);
    }
    // 走査が実際に「下回る」側へ入っていること (空回りの検査ではない)。
    expect(below).toBeGreaterThan(0);
    expect(broken).toEqual([]);
  });

  it('★ 記録に残す 1 例 (2026-09-07 まで 0.0% と刷っていた)', () => {
    const s1 = sheetWithFixed(9_000_000); // 限界利益 6,000 千 / 固定費 9,000 千 → BEP 15,000 千
    expect(value(s1, '売上高')).toBe('10,000');
    expect(value(s1, '損益分岐点売上高')).toBe('15,000');
    expect(value(s1, '安全余裕率')).toBe('△50.0%');
    expect(note(s1, '安全余裕率')).toBe('(売上高 − 損益分岐点売上高) ÷ 売上高');
  });

  it('★ 損益分岐点が算定不能なら安全余裕率も刷らない (行は残る)', () => {
    // 限界利益 ≤ 0 — どれだけ売っても固定費を回収できない。
    const kpi: KpiActual[] = [
      { period: '2026-04', unit: '全社', revenue: 10_000_000, cogs: 12_000_000, advertising: 0, sga: 1_000_000, depreciation: 0, laborCost: 0 },
    ];
    const s1 = section(buildBankSubmissionSheet(inputWith(overviewWith({ kpiActuals: kpi }))).sections, '1.');
    expect(value(s1, '損益分岐点売上高')).toBe(BLANK);
    expect(value(s1, '安全余裕率')).toBe(BLANK);
    expect(note(s1, '安全余裕率')).toBe('(売上高 − 損益分岐点売上高) ÷ 売上高');
  });

  it('対照: 損益分岐点を上回る書面では正のまま (直しが良い側を壊していない)', () => {
    const s1 = sheetWithFixed(3_000_000); // BEP 5,000 千 < 売上 10,000 千
    expect(value(s1, '損益分岐点売上高')).toBe('5,000');
    expect(printedNum(value(s1, '安全余裕率'))).toBeGreaterThan(0);
  });
});

/**
 * **書面は、宣言した決算期と実際に合算した期間の関係を述べる。** (2026-09-07)
 *
 * ヘッダは 決算期 (利用者が打つ) と 対象期間 (KPI 実績から機械が出す) を並べて刷り、
 * §1 は「対象期間の累計」を刷る。両者を突き合わせるものが無く、`OverviewPage` は
 * `kpiRecords` の**全期**を渡していたので、決算期 2026-03 の名前の下に 20 か月分の
 * 累計 (実測: 売上高 20,000 千円 / 事業年度は 12,000 千円 = **67% 過大**) が
 * 断り書き無しで並んでいた。同じ入力から `kessanImport` が作る計算書類は事業年度で
 * 切り出し、切り出せないときは注記する —— **注記が在るのは金融機関へ出さない方だけ**
 * だった。
 *
 * 期中の試算表は正当な使い方なので**金額は切り落とさず、関係を述べる**。
 */
describe('決算期と対象期間の関係を述べる (periodScopeNote)', () => {
  const F = BANK_FORMAT_DEFAULT;
  const monthsFrom = (from: string, count: number): string[] => {
    const out: string[] = [];
    let [y, m] = from.split('-').map(Number) as [number, number];
    for (let i = 0; i < count; i += 1) {
      out.push(`${y}-${String(m).padStart(2, '0')}`);
      m += 1;
      if (m > 12) { m = 1; y += 1; }
    }
    return out;
  };

  it('★ 決算期どおりの 12 か月がちょうど揃っていれば述べることは無い', () => {
    expect(periodScopeNote('2026-03', monthsFrom('2025-04', 12), F)).toBeNull();
  });

  it('★ 事業年度の外へはみ出していれば「一致しません」と述べる', () => {
    const note = periodScopeNote('2026-03', monthsFrom('2025-01', 20), F);
    expect(note).toContain('20 か月');
    expect(note).toContain('令和8年3月期');
    expect(note).toContain('12 か月とは一致しません');
  });

  it('★ 事業年度の中に収まっていれば「期中です」と述べる (試算表は正当な使い方)', () => {
    const note = periodScopeNote('2026-03', monthsFrom('2025-04', 5), F);
    expect(note).toContain('期中です');
    expect(note).toContain('通年の金額ではありません');
    expect(note).not.toContain('一致しません');
  });

  it('★ 端の 2 か月だけでも「ちょうど 1 年」に読めない (月数を数えている)', () => {
    // 最初と最後は事業年度の端と同じなので、範囲だけを見ると 12 か月に見える。
    const note = periodScopeNote('2026-03', ['2025-04', '2026-03'], F);
    expect(note).not.toBeNull();
    expect(note).toContain('2 か月');
  });

  it('★ 決算期が未設定なら、全期間の累計であることと入れ方を述べる', () => {
    const note = periodScopeNote('', monthsFrom('2025-01', 20), F);
    expect(note).toContain('決算期が未設定');
    expect(note).toContain('20 か月');
    expect(note).toContain('提出者情報で決算期を入れる');
  });

  it('KPI 実績が 1 件も無ければ述べない (§1 は別の断り書きを持つ)', () => {
    expect(periodScopeNote('2026-03', [], F)).toBeNull();
    expect(periodScopeNote('2026-03', ['not-a-period'], F)).toBeNull();
  });

  // 期の綴りは `periodRange` と月数の両方が使う 1 つの正規表現で決まる。
  // 前後の錨 (^ と $) が外れると、対象期間と月数が別々の物を数え始める。
  it('★ 期の綴りは前後とも錨で留まっている (前に付いた字 / 後ろに付いた字を通さない)', () => {
    expect(periodScopeNote('2026-03', ['x2025-04'], F)).toBeNull(); // ^ が効いている
    expect(periodScopeNote('2026-03', ['2025-045'], F)).toBeNull(); // $ が効いている
    // 対照: 綴りが正しければ数える。
    expect(periodScopeNote('2026-03', ['2025-04'], F)).not.toBeNull();
  });

  // 「ちょうど事業年度」の判定は 3 つの条件すべてが要る。1 つでも真に固定すると
  // 事業年度でない入力を「述べることが無い」と読み違える。
  it('★ 期首が違えば、期末と月数が揃っていても述べる', () => {
    // 2024-12 + 2025-05〜2026-03 (11 か月) = 12 か月。期末は一致、期首は不一致。
    const periods = ['2024-12', ...monthsFrom('2025-05', 11)];
    expect(new Set(periods).size).toBe(12);
    const note = periodScopeNote('2026-03', periods, F);
    expect(note).toContain('12 か月とは一致しません');
  });

  it('★ 期末が違えば、期首と月数が揃っていても述べる', () => {
    // 2025-04〜2026-02 (11 か月) + 2026-05 = 12 か月。期首は一致、期末は不一致。
    const periods = [...monthsFrom('2025-04', 11), '2026-05'];
    expect(new Set(periods).size).toBe(12);
    const note = periodScopeNote('2026-03', periods, F);
    expect(note).toContain('12 か月とは一致しません');
  });

  it('★ 境界: 期末ちょうどまでの入力は「期中」であって「一致しません」ではない', () => {
    // 2025-06〜2026-03 (10 か月)。期末は事業年度の末日と同じ月。
    const note = periodScopeNote('2026-03', monthsFrom('2025-06', 10), F);
    expect(note).toContain('期中です');
    expect(note).not.toContain('一致しません');
  });

  it('★ 実測の再現: 決算期 2026-03 に 20 か月を渡すと、書面の §1 に断り書きが付く', () => {
    const kpi: KpiActual[] = monthsFrom('2025-01', 20).map((period) => ({
      period, unit: '全社', revenue: 1_000_000, cogs: 400_000, advertising: 0, sga: 300_000, depreciation: 0,
    }));
    const m = buildBankSubmissionSheet(
      inputWith(overviewWith({ kpiActuals: kpi }), SETTINGS),
    );
    const s1 = section(m.sections, '1.');
    expect(value(s1, '売上高')).toBe('20,000'); // 20 か月の累計 (事業年度は 12,000)
    expect(s1.caption).toContain('12 か月とは一致しません');
    // 対照: 事業年度どおりの 12 か月なら断り書きは付かず、金額も年商になる。
    const fy = monthsFrom('2025-04', 12);
    const kpiFy: KpiActual[] = fy.map((period) => ({
      period, unit: '全社', revenue: 1_000_000, cogs: 400_000, advertising: 0, sga: 300_000, depreciation: 0,
    }));
    const m2 = buildBankSubmissionSheet(inputWith(overviewWith({ kpiActuals: kpiFy }), SETTINGS));
    const s1b = section(m2.sections, '1.');
    expect(value(s1b, '売上高')).toBe('12,000');
    expect(s1b.caption).toBeNull();
  });
});

/**
 * **古い貸借対照表と当期の売上を割った比率であることを、書面が述べる。** (2026-09-07)
 *
 * 基準日はヘッダに刷られていたが、2026-09-07 まで**どの計算にも入っていなかった** ——
 * 7 年古い貸借対照表でも出力が 1 バイトも変わらなかった。§4 (財政状態) と
 * §5 (運転資本) は溜まりと流れを組み合わせるので、そこに断り書きを出す。
 * 経緯は `src/shared/balanceSheetFreshness.ts`。
 */
describe('基準日が古い書面は、比率が同じ期の数字でないことを述べる', () => {
  const kpi2026: KpiActual[] = ['2026-06', '2026-07', '2026-08'].map((period) => ({
    period, unit: '全社', revenue: 4_000_000, cogs: 1_600_000, advertising: 0, sga: 1_200_000, depreciation: 0, laborCost: 0,
  }));
  const sheetWithBsAsOf = (asOf: string) =>
    buildBankSubmissionSheet(
      inputWith(
        overviewWith({ kpiActuals: kpi2026, balanceSheet: { ...BS, asOf } }),
        SETTINGS,
        { balanceSheetAsOf: asOf },
      ),
    );

  it('★ 7 年古い基準日: §4 と §5 に断り書きが付き、隔たりの月数を言う', () => {
    const m = sheetWithBsAsOf('2019-03-31');
    for (const prefix of ['4.', '5.']) {
      const s = section(m.sections, prefix);
      expect(s.caption).toContain('か月古く');
      expect(s.caption).toContain('同じ期の数字ではありません');
    }
  });

  it('★ 対照: 基準日が対象期間の中なら断り書きは付かない', () => {
    const m = sheetWithBsAsOf('2026-08-31');
    expect(section(m.sections, '4.').caption).toBeNull();
    // §5 に残るのは回転日数の期間の断りだけ (基準日のずれの文は出ない)。
    expect(section(m.sections, '5.').caption).not.toContain('基準日');
  });

  it('★ 境界: 12 か月ちょうどは古くない、13 か月は古い', () => {
    // 対象期間の最終月は 2026-08。
    expect(section(sheetWithBsAsOf('2025-08-31').sections, '4.').caption).toBeNull();
    expect(section(sheetWithBsAsOf('2025-07-31').sections, '4.').caption).toContain('13 か月古く');
  });

  it('貸借対照表そのものが無ければ、従来の「未入力」の断り書きが優先する', () => {
    const m = buildBankSubmissionSheet(
      inputWith(overviewWith({ kpiActuals: kpi2026, balanceSheet: null }), SETTINGS, { balanceSheetAsOf: null }),
    );
    expect(section(m.sections, '4.').caption).toBe('貸借対照表が未入力のため算定していません。');
  });

  /**
   * **隔たりは両側にある。** 2026-09-07 まで `stale` (古い側) しか見ておらず、
   * 基準日が対象期間より**先**のときは隔たりが何年でも、金融機関へ渡す書面に
   * 断り書きが 1 行も出なかった。
   */
  it('★ 基準日が 10 年先: §4 と §5 に「か月後」の断り書きが付く', () => {
    const m = sheetWithBsAsOf('2036-03-31');
    for (const prefix of ['4.', '5.']) {
      const s = section(m.sections, prefix);
      expect(s.caption).toContain('115 か月後');
      expect(s.caption).toContain('同じ期の数字ではありません');
      // 符号を落として述べる (「-115 か月古く」とは書かない)。
      expect(s.caption).not.toContain('-115');
      expect(s.caption).not.toContain('か月古く');
    }
  });

  it('★ 境界 (先の側): 12 か月ちょうど先は付かず、13 か月先で付く', () => {
    // 対象期間の最終月は 2026-08。
    expect(section(sheetWithBsAsOf('2027-08-31').sections, '4.').caption).toBeNull();
    expect(section(sheetWithBsAsOf('2027-09-30').sections, '4.').caption).toContain('13 か月後');
  });

  it('★ 対照: 決算期が実績の 1 か月先 (正常) では付かない', () => {
    expect(section(sheetWithBsAsOf('2026-09-30').sections, '4.').caption).toBeNull();
    expect(section(sheetWithBsAsOf('2026-09-30').sections, '5.').caption).not.toContain('基準日');
  });
});

/**
 * **書面は、空欄の理由を欄の名前で述べる。** (2026-09-07)
 *
 * §5 運転資本の内数 (売上債権・棚卸資産・仕入債務) は貸借対照表の任意欄である。
 * 以前は未入力を 0 に潰していたので、この節に **CCC 0 日**、運転資本 0 円が
 * 印刷されていた —— 即日回収・即日支払という最良の運転資金である。
 * いまは「—」で出し、**なぜ出せないか**を但し書きに書く。
 */
describe('§5 運転資本 — 未入力の欄を名前で述べる', () => {
  const blankInner: BalanceSheet = {
    asOf: '2026-03-31', currentAssets: 8_000_000, cash: 3_000_000, fixedAssets: 4_000_000,
    currentLiabilities: 5_000_000, fixedLiabilities: 3_000_000, netIncome: 600_000,
  };

  it('3 欄が未入力なら日数と運転資本は「―」で、但し書きが欄の名前を並べる', () => {
    const m = buildBankSubmissionSheet(inputWith(overviewWith({ balanceSheet: blankInner })));
    const s = section(m.sections, '5.');
    expect(value(s, '売上債権回転日数（DSO）')).toBe(BLANK);
    expect(value(s, '棚卸資産回転日数（DIO）')).toBe(BLANK);
    expect(value(s, '仕入債務回転日数（DPO）')).toBe(BLANK);
    expect(value(s, '現金化サイクル（CCC）')).toBe(BLANK);
    expect(value(s, '運転資本')).toBe(BLANK);
    expect(s.caption).toContain('売上債権・棚卸資産・仕入債務');
    expect(s.caption).toContain('0 円としては扱っていません');
    // 行は消さない (欄が在ることは見せる)。
    expect(s.rows).toHaveLength(5);
  });

  it('当座比率も §4 で「―」になる (流動比率と同じ値を刷らない)', () => {
    const m = buildBankSubmissionSheet(inputWith(overviewWith({ balanceSheet: blankInner })));
    const s = section(m.sections, '4.');
    expect(value(s, '流動比率')).toBe('160.0%');
    expect(value(s, '当座比率')).toBe(BLANK);
  });

  it('1 欄だけ未入力なら、その欄だけを名前で挙げる', () => {
    const m = buildBankSubmissionSheet(
      inputWith(overviewWith({ balanceSheet: { ...BS, inventory: undefined } })),
    );
    const s = section(m.sections, '5.');
    expect(s.caption).toContain('棚卸資産');
    expect(s.caption).not.toContain('売上債権');
    expect(value(s, '売上債権回転日数（DSO）')).not.toBe(BLANK);
    expect(value(s, '棚卸資産回転日数（DIO）')).toBe(BLANK);
    expect(value(s, '現金化サイクル（CCC）')).toBe(BLANK);
  });

  /**
   * **回転日数の基礎は「打ち込んだ月数」で決まる。** (2026-09-07)
   *
   * §5 は 2026-09-07 まで「× 365」と刷りながら、分母には利用者が打ち込んだ全期の
   * 合計を入れていた —— 実績 1 か月の控えで DSO 182.5 日 (実は 15.2 日)。
   * `computeCashConversionCycle` の `days` 引数は最初から在ったのに、
   * 唯一の呼び手が渡していなかった。
   */
  it('★ 1 年分の実績なら期間の断りは付かず、式は「× 365 日」', () => {
    const year = ['2026-04', '2026-05', '2026-06', '2026-07', '2026-08', '2026-09',
      '2026-10', '2026-11', '2026-12', '2027-01', '2027-02', '2027-03']
      .map((period) => ({ ...KPI[0]!, period }));
    const m = buildBankSubmissionSheet(
      inputWith(overviewWith({ kpiActuals: year }), DEFAULT_SUBMISSION_SETTINGS),
    );
    const s = section(m.sections, '5.');
    expect(s.caption).toBeNull();
    expect(note(s, '売上債権回転日数（DSO）')).toBe('売上債権 ÷ 売上高 × 365 日');
  });

  it('★ 3 か月分なら月数と日数を述べ、式もその日数で刷る', () => {
    const q = ['2026-04', '2026-05', '2026-06'].map((period) => ({ ...KPI[0]!, period }));
    const m = buildBankSubmissionSheet(
      inputWith(overviewWith({ kpiActuals: q }), DEFAULT_SUBMISSION_SETTINGS),
    );
    const s = section(m.sections, '5.');
    expect(s.caption).toBe(
      '回転日数は実績の令和8年4月〜令和8年6月・3 か月分（91.3 日）で算定しています。1 年分の回転日数ではありません。',
    );
    // 刷った数字が刷った式を満たす: 3 か月分の売上で割り、91.3 日を掛けている
    expect(note(s, '棚卸資産回転日数（DIO）')).toBe('棚卸資産 ÷ 売上原価 × 91.3 日');
    expect(note(s, '仕入債務回転日数（DPO）')).toBe('仕入債務 ÷ 売上原価 × 91.3 日');
  });

  it('★ 対照: 埋まった控え (BS) では未入力の但し書きが付かず CCC が出る', () => {
    // `BS` は 3 欄すべて埋まっている。上の 508 行の検査と同じ形をここでも押さえる。
    const s = section(buildBankSubmissionSheet(inputWith(overviewWith())).sections, '5.');
    expect(s.caption).not.toContain('未入力');
    expect(value(s, '現金化サイクル（CCC）')).not.toBe(BLANK);
    expect(value(s, '運転資本')).not.toBe(BLANK);
  });
});

/**
 * **書面が刷る「定数」を、読み直して測る。** (2026-09-07)
 *
 * `EMPTY_PROFILE` / `PROFILE_LABEL` / `BANK_SUBMISSION_COLLECTION` /
 * `DEFAULT_SUBMISSION_SETTINGS` は module 直下の `const` なので**読み込みのときに
 * 1 度だけ**評価され、Stryker の実行時の切り替えが届かない (覆われていても
 * 「生存」と報告される。`stryker.config.json` の `_commentIgnoreStatic`)。
 * ここで刷る文字は**金融機関等へ出す紙の見出し**なので、空にすり替わったことに
 * 気付けない状態のまま置いておけない。読み直せば測れる。
 */
describe('読み直して測る — 書面の定数表', () => {
  it('保存先の collection 名', async () => {
    vi.resetModules();
    const m = await import('../bankSubmission');
    expect(m.BANK_SUBMISSION_COLLECTION).toBe('bank-submission-settings');
  });

  it('空の提出者情報は 4 欄そろって空文字 (欄が消えない)', async () => {
    vi.resetModules();
    const m = await import('../bankSubmission');
    expect(m.EMPTY_PROFILE).toEqual({
      companyName: '', representative: '', address: '', fiscalYearEnd: '',
    });
  });

  it('既定の設定は「空の提出者情報 + 既定の書式」', async () => {
    vi.resetModules();
    const m = await import('../bankSubmission');
    const b = await import('../../../shared/bankFormat');
    expect(m.DEFAULT_SUBMISSION_SETTINGS).toEqual({ profile: m.EMPTY_PROFILE, format: b.BANK_FORMAT_DEFAULT });
  });

  it('読み直しても表の行が組め、売上トレンドの日本語が出る', async () => {
    // `row()` (module 直下の行の組み立て) と `TREND_LABEL` を同時に測る。
    vi.resetModules();
    const m = await import('../bankSubmission');
    const model = m.buildBankSubmissionSheet(inputWith(overviewWith()));
    const growth = model.sections.find((x) => x.title.startsWith('7.'));
    expect(growth).toBeDefined();
    // 行そのものが組めている (row が空にすり替わると undefined の配列になる)。
    expect(growth!.rows.every((r) => typeof r.label === 'string' && r.label.length > 0)).toBe(true);
    const trend = growth!.rows.find((r) => r.label === '売上トレンド');
    expect(trend).toBeDefined();
    expect(['上昇', '下降', '横ばい', BLANK]).toContain(trend!.value);
    expect(trend!.value).not.toBe('');
  });

  it('トレンドのラベルは 3 つとも日本語のまま (どの向きでも空にならない)', async () => {
    vi.resetModules();
    const m = await import('../bankSubmission');
    const base = overviewWith();
    for (const [trend, label] of [['up', '上昇'], ['down', '下降'], ['flat', '横ばい']] as const) {
      const o: BusinessOverview = { ...base, kpi: { ...base.kpi, revenueTrend: trend } };
      const model = m.buildBankSubmissionSheet(inputWith(o));
      const growth = model.sections.find((x) => x.title.startsWith('7.'))!;
      expect(growth.rows.find((r) => r.label === '売上トレンド')!.value, trend).toBe(label);
    }
  });

  it('提出者情報のラベルは 4 欄そろって日本語のまま (入力欄と検証の文面に出る)', async () => {
    vi.resetModules();
    const m = await import('../bankSubmission');
    // ラベルは非公開なので、断る文面で測る (欄ごとに名前が出る)。文字でない値は
    // 4 欄すべてで同じ経路を通るので、ラベルが空になったらここで落ちる。
    for (const [key, label] of [
      ['companyName', '商号'], ['representative', '代表者'],
      ['address', '所在地'], ['fiscalYearEnd', '決算期'],
    ] as const) {
      const r = m.parseSubmissionProfile({ ...m.EMPTY_PROFILE, [key]: 42 as never });
      expect(r.ok, key).toBe(false);
      expect(r.ok === false ? r.reason : '', key).toContain(label);
    }
  });
});

/**
 * §5 の但し書きは 2 つ並ぶことがある (未入力の欄 + 基準日のずれ)。
 * **区切りの空白まで留める** —— `join('')` にすり替わると 2 つの文が地続きになる。
 */
describe('§5 運転資本 — 但し書きが 2 つ並ぶとき', () => {
  it('未入力の欄と基準日のずれを、空白で区切って両方出す', () => {
    // 基準日 2024-03-31 に対し KPI は 2026-04 → 25 か月古い。棚卸資産は未入力。
    const bs: BalanceSheet = { ...BS, asOf: '2024-03-31', inventory: undefined };
    const m = buildBankSubmissionSheet(
      inputWith(overviewWith({ balanceSheet: bs }), SETTINGS, { balanceSheetAsOf: '2024-03-31' }),
    );
    const caption = section(m.sections, '5.').caption ?? '';
    expect(caption).toContain('棚卸資産が未入力');
    expect(caption).toContain('貸借対照表の基準日は対象期間の最終月より');
    // 2 文が地続きにならない (句点の直後に空白が在る)。
    expect(caption).toContain('。 貸借対照表の基準日は');
  });
});

/**
 * **算定不能を 0 として刷らない** —— 売上 0 なら売上高を分母とする 8 行、
 * 従業員 0 名なら一人当たりの 3 行が「―」になり、**なぜ空欄かを但し書きが述べる**。
 *
 * 2026-09-08 まで §1 は「営業利益 △3,000 / 営業利益率 0.0%」という**両立しない
 * 2 行**を並べ、§3 は「一人当たり売上高 0」と「一人当たり人件費 ―」を並べていた。
 */
describe('§1 §3 — 割れないものを 0 として刷らない', () => {
  const PRE_REVENUE: KpiActual[] = [
    { period: '2026-04', unit: '全社', revenue: 0, cogs: 0, advertising: 0, sga: 1_500_000, depreciation: 0 },
    { period: '2026-05', unit: '全社', revenue: 0, cogs: 0, advertising: 0, sga: 1_500_000, depreciation: 0 },
  ];
  const RATIO_ROWS = [
    '売上総利益率', '営業利益率', 'EBITDA マージン', '売上原価率',
    '広告宣伝費率', '販売費及び一般管理費率', '限界利益率', '安全余裕率',
  ] as const;

  it('★ 売上 0 でも費用が在る控え — 比率 8 行はすべて ―、額は出る', () => {
    const o = overviewWith({ kpiActuals: PRE_REVENUE, balanceSheet: undefined, accounting: [] });
    const s1 = section(buildBankSubmissionSheet(inputWith(o)).sections, '1.');
    for (const label of RATIO_ROWS) expect(value(s1, label)).toBe(BLANK);
    // 額は期間の合計なのでそのまま出す (出せない物と出せる物を分ける)
    expect(value(s1, '売上高')).toBe('0');
    expect(value(s1, '営業利益')).toBe('△3,000');
    expect(value(s1, 'EBITDA')).toBe('△3,000');
  });

  it('★ 空欄の理由を §1 の但し書きが述べる (期間の断りに続けて)', () => {
    const o = overviewWith({ kpiActuals: PRE_REVENUE, balanceSheet: undefined, accounting: [] });
    const s1 = section(buildBankSubmissionSheet(inputWith(o)).sections, '1.');
    expect(s1.caption).toContain('対象期間の売上高が 0 のため');
    expect(s1.caption).toContain('算定していません');
    // 決算期 (2026-03) の期中ではないので期間の断りも並ぶ
    expect(s1.caption).toContain('令和8年3月期');
  });

  it('★ 対照: 売上が在れば同じ 8 行は数で出る', () => {
    const s1 = section(buildBankSubmissionSheet(inputWith(overviewWith())).sections, '1.');
    for (const label of RATIO_ROWS) expect(value(s1, label)).not.toBe(BLANK);
    expect(s1.caption ?? '').not.toContain('売上高が 0 のため');
  });

  it('★ 従業員 0 名 — 一人当たりの 3 行が ―、人件費の 3 行は出る', () => {
    const o = overviewWith({ members: [] });
    const s3 = section(buildBankSubmissionSheet(inputWith(o)).sections, '3.');
    expect(value(s3, '従業員数')).toBe('0名');
    expect(value(s3, '一人当たり売上高')).toBe(BLANK);
    expect(value(s3, '一人当たり営業利益')).toBe(BLANK);
    expect(value(s3, '一人当たり人件費')).toBe(BLANK);
    // 分母が売上・粗利の 2 行は従業員数に依らないので出る
    expect(value(s3, '人件費')).not.toBe(BLANK);
    expect(value(s3, '労働分配率')).not.toBe(BLANK);
    expect(value(s3, '人件費率')).not.toBe(BLANK);
    expect(s3.caption).toContain('従業員が 1 名も登録されていない');
  });

  it('★ 対照: 従業員が居れば一人当たりの 3 行は数で出る', () => {
    const s3 = section(buildBankSubmissionSheet(inputWith(overviewWith())).sections, '3.');
    for (const label of ['一人当たり売上高', '一人当たり営業利益', '一人当たり人件費']) {
      expect(value(s3, label)).not.toBe(BLANK);
    }
    expect(s3.caption ?? '').not.toContain('従業員が 1 名も登録されていない');
  });

  it('KPI 実績が未入力なら §3 は分母より先に「KPI 未入力」を述べる (広い理由が先)', () => {
    const o = overviewWith({ kpiActuals: [], members: [] });
    const s3 = section(buildBankSubmissionSheet(inputWith(o)).sections, '3.');
    expect(s3.caption).toBe('KPI 実績が未入力のため、一人当たりの金額は算定していません。');
  });
});

/**
 * **手入力の上書きが在るなら、書面の注記がそれを述べる。**
 *
 * この書面は「上記のとおり相違ありません。」で代表者名つきで終わり、注記は
 * 「損益・販売・人員の数値は当社が入力した実績…の累計」と断言する。上書きは
 * 表示の置き換えで再計算ではないので、**印刷した比率が同じ表の金額どおりに
 * ならない** (経緯は `overviewOverrides.ts` の `staleDerivedNote`)。
 * 2026-09-08 まで書面には「手」の字が 1 つも無かった。
 */
describe('注記 — 手入力の上書きを述べる', () => {
  const overridden = { overridden: ['kpi.revenue'], staleDerived: [
    { path: 'kpi.operatingMarginPct', label: '営業利益率', because: ['kpi.revenue'] },
    { path: 'kpi.grossMarginPct', label: '売上総利益率', because: ['kpi.revenue'] },
  ] };

  it('★ 上書きが在れば注記が 2 本増え、「実績の累計」と断言しない', () => {
    const clean = buildBankSubmissionSheet(inputWith(overviewWith()));
    const dirty = buildBankSubmissionSheet(inputWith(overviewWith(), SETTINGS, { manual: overridden }));
    expect(dirty.notes.length).toBe(clean.notes.length + 2);
    // 上書きなしの注記は「累計。」で言い切る
    expect(clean.notes[1]).toContain('の累計。');
    expect(clean.notes[1]).not.toContain('手入力');
    // 上書きが在れば「累計に、下記の手入力を重ねたもの」
    expect(dirty.notes[1]).toContain('下記の手入力を重ねたもの');
    expect(dirty.notes[1]).not.toContain('の累計。');
  });

  it('★ どの欄を手で置いたか / どの指標が自動値のままかを注記に並べる', () => {
    const body = buildBankSubmissionSheet(inputWith(overviewWith(), SETTINGS, { manual: overridden })).notes.join('\n');
    expect(body).toContain('売上高は手で置いた数値です');
    expect(body).toContain('営業利益率・売上総利益率は自動計算のままで');
    expect(body).toContain('同じ表に並ぶ金額どおりの値にならないことがあります');
  });

  it('★ 対照: 上書きが無ければ手入力の断りはどこにも出ない', () => {
    const all = JSON.stringify(buildBankSubmissionSheet(inputWith(overviewWith())));
    // **綴りを絞る** —— 「手」は「相手」等にも出るので、断りの文面ごと当てる
    // (この文面が実際に出ることは上の 2 件が示している)。
    expect(all).not.toContain('手で置いた数値');
    expect(all).not.toContain('自動計算のままで');
    expect(all).not.toContain('手入力を重ねたもの');
  });

  it('上書きした欄が在っても自動値のままの指標が無ければ 1 本だけ増える', () => {
    const clean = buildBankSubmissionSheet(inputWith(overviewWith()));
    const one = buildBankSubmissionSheet(
      inputWith(overviewWith(), SETTINGS, { manual: { overridden: ['kpi.revenue'], staleDerived: [] } }),
    );
    expect(one.notes.length).toBe(clean.notes.length + 1);
  });
});

/**
 * **§2 平均受注単価 — 注文が 0 件なら算定不能。**
 *
 * 2026-09-08 まで `SalesSummary.aov` は 0 に倒れており、販売記録が 1 件も無い
 * 控えで §2 が「平均受注単価 **0円**」を算式「売上高 ÷ 受注件数」と並べて刷って
 * いた。同じ §2 の 主力チャネル・売上分散スコアは「―」なので、**1 つの節に
 * 答え方が 2 通り**並んでいた。**規準は既に画面に在った** ——
 * `BusinessPage.tsx` は同じ量を `c.aov > 0 ? … : '—'` で「―」と刷っている。
 *
 * パス 52 で「相手に渡る面の『割れないを 0 として刷る』は closed」と書いたが、
 * それは `overview.kpi` と `productivity` の話で、**`sales` は別の値だった**。
 */
describe('§2 平均受注単価 — 割れないものを 0 円として刷らない', () => {
  it('★ 販売記録が無ければ ―、売上高と受注件数は 0 のまま (額と比率を分ける)', () => {
    const o = overviewWith({ sales: [] });
    const s2 = section(buildBankSubmissionSheet(inputWith(o)).sections, '2.');
    expect(value(s2, '売上高（販売記録）')).toBe('0');
    expect(value(s2, '受注件数')).toBe('0件');
    expect(value(s2, '平均受注単価')).toBe(BLANK);
    // 同じ節の他の「算定不能」と答え方が揃っていること
    expect(value(s2, '主力チャネル')).toBe(BLANK);
    expect(value(s2, '売上分散スコア')).toBe(BLANK);
  });

  it('★ 対照: 販売記録が在れば平均受注単価は円で出る', () => {
    const o = overviewWith({
      sales: [{ date: '2026-04-01', channel: 'amazon', amount: 10_000, orders: 4 }],
    });
    const s2 = section(buildBankSubmissionSheet(inputWith(o)).sections, '2.');
    expect(value(s2, '平均受注単価')).toBe('2,500円');
    expect(value(s2, '主力チャネル')).not.toBe(BLANK);
  });
});
