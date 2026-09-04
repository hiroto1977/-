/**
 * 金融機関等提出用の書面の**全文**を固定する — 書面の文言 (項目名・算式・注記・断り書き) は
 * 成果物そのものなので、黙って変わらないように実装から写した値をここに留める。
 * 値を変えるときはこの表も意図して直す (「印刷用の検査」で出した今日の実物)。
 */
import { describe, expect, it } from 'vitest';
import { buildBankSubmissionSheet, type BankSubmissionSettings } from '../bankSubmission';
import { buildBusinessOverview } from '../overview';
import { buildManagementScorecard } from '../../../shared/managementScorecard';
import { combineCashflowDebtService } from '../cashflowDebtService';
import { BANK_FORMAT_DEFAULT } from '../../../shared/bankFormat';
import type { KpiActual } from '../kpiActuals';
import type { SalesEntry } from '../sales';

const KPI: KpiActual[] = [
  { period: '2026-04', unit: '全社', revenue: 12_345_678, cogs: 5_000_000, advertising: 1_000_000, sga: 8_000_000, depreciation: 200_000, laborCost: 3_000_000 },
];
const BUDGET: KpiActual[] = [
  { period: '2026-04', unit: '全社', revenue: 10_000_000, cogs: 4_000_000, advertising: 1_000_000, sga: 4_000_000, depreciation: 0 },
];
const BS = {
  asOf: '2026-03-31', currentAssets: 8_000_000, cash: 3_000_000, inventory: 1_000_000, accountsReceivable: 2_000_000,
  fixedAssets: 4_000_000, currentLiabilities: 5_000_000, accountsPayable: 1_500_000, fixedLiabilities: 3_000_000, netIncome: 600_000,
};
const ACCOUNTING = [
  { month: '2026-03', income: 1_000_000, expense: 700_000, net: 300_000 },
  { month: '2026-04', income: 1_100_000, expense: 800_000, net: 300_000 },
];
const REPAYMENTS = [
  { month: '2026-03', repayment: 100_000 },
  { month: '2026-04', repayment: 100_000 },
];
const SALES: SalesEntry[] = [
  { date: '2026-04-03', channel: 'amazon', amount: 60_000, orders: 12 },
  { date: '2026-04-10', channel: 'shopify', amount: 40_000, orders: 8 },
];
const SETTINGS: BankSubmissionSettings = {
  profile: { companyName: '株式会社テスト', representative: '代表取締役 山田 太郎', address: '東京都千代田区1-1', fiscalYearEnd: '2026-03' },
  format: BANK_FORMAT_DEFAULT,
};

describe('金融機関等提出用の書面 — 全文', () => {
  it('入力が揃った書面 (販売記録・KPI・予算・貸借対照表・会計連携・返済予定)', () => {
    const overview = buildBusinessOverview({
      plan: 'business', sales: SALES, kpiActuals: KPI, kpiBudgets: BUDGET, balanceSheet: BS, accounting: ACCOUNTING,
      members: [{ role: 'owner' }, { role: 'admin' }],
    });
    const m = buildBankSubmissionSheet({
      overview,
      scorecard: buildManagementScorecard({ operatingMarginPct: overview.kpi.operatingMarginPct, grossMarginPct: overview.kpi.grossMarginPct }),
      debtService: combineCashflowDebtService(ACCOUNTING, REPAYMENTS),
      kpiPeriods: ['2026-04'], balanceSheetAsOf: '2026-03-31', today: '2026-09-04', settings: SETTINGS,
    });
    expect(m.title).toBe('経営サマリー');
    expect(m.subtitle).toBe('経営概況・財務指標一覧');
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
    expect(m.sections).toEqual([
      { title: '1. 損益の状況（対象期間の累計）', caption: null, rows: [
          { label: '売上高', value: '12,345', note: 'KPI 実績の合計' },
          { label: '売上総利益', value: '7,345', note: '売上高 − 売上原価' },
          { label: '売上総利益率', value: '59.5%', note: '売上総利益 ÷ 売上高' },
          { label: '営業利益', value: '△1,854', note: '売上総利益 − 広告宣伝費 − 販売費及び一般管理費 − 減価償却費' },
          { label: '営業利益率', value: '△15.0%', note: '営業利益 ÷ 売上高' },
          { label: 'EBITDA', value: '△1,654', note: '営業利益 + 減価償却費' },
          { label: 'EBITDA マージン', value: '△13.4%', note: 'EBITDA ÷ 売上高' },
          { label: '売上原価率', value: '40.5%', note: '売上原価 ÷ 売上高' },
          { label: '広告宣伝費率', value: '8.1%', note: '広告宣伝費 ÷ 売上高' },
          { label: '販売費及び一般管理費率', value: '64.8%', note: '販売費及び一般管理費 ÷ 売上高' },
          { label: '限界利益率', value: '51.4%', note: '(売上高 − 変動費) ÷ 売上高' },
          { label: '損益分岐点売上高', value: '15,953', note: '固定費 ÷ 限界利益率' },
          { label: '安全余裕率', value: '0.0%', note: '(売上高 − 損益分岐点売上高) ÷ 売上高' },
        ] },
      { title: '2. 販売の状況', caption: null, rows: [
          { label: '売上高（販売記録）', value: '100', note: '販売記録の合計' },
          { label: '受注件数', value: '20件', note: '' },
          { label: '平均受注単価', value: '5,000円', note: '売上高 ÷ 受注件数' },
          { label: '販売チャネル数', value: '2', note: '' },
          { label: '主力チャネル', value: 'Amazon', note: '売上に占める割合 60.0%' },
          { label: '売上分散スコア', value: '48／100', note: '(1 − ハーフィンダール指数) × 100' },
        ] },
      { title: '3. 人員・生産性', caption: null, rows: [
          { label: '従業員数', value: '2名', note: '登録メンバー数' },
          { label: '一人当たり売上高', value: '6,172', note: '売上高 ÷ 従業員数' },
          { label: '一人当たり営業利益', value: '△927', note: '営業利益 ÷ 従業員数' },
          { label: '人件費', value: '3,000', note: 'KPI 実績の人件費の合計' },
          { label: '労働分配率', value: '40.8%', note: '人件費 ÷ 売上総利益' },
          { label: '人件費率', value: '24.3%', note: '人件費 ÷ 売上高' },
          { label: '一人当たり人件費', value: '1,500', note: '人件費 ÷ 従業員数' },
        ] },
      { title: '4. 財政状態（貸借対照表 基準日現在）', caption: null, rows: [
          { label: '総資産', value: '12,000', note: '' },
          { label: '負債合計', value: '8,000', note: '' },
          { label: '純資産', value: '4,000', note: '総資産 − 負債合計' },
          { label: '自己資本比率', value: '33.3%', note: '純資産 ÷ 総資産' },
          { label: '流動比率', value: '160.0%', note: '流動資産 ÷ 流動負債' },
          { label: '当座比率', value: '140.0%', note: '(流動資産 − 棚卸資産) ÷ 流動負債' },
          { label: '固定比率', value: '100.0%', note: '固定資産 ÷ 純資産' },
          { label: '総資産利益率（ROA）', value: '5.0%', note: '当期純利益 ÷ 総資産' },
          { label: '自己資本利益率（ROE）', value: '15.0%', note: '当期純利益 ÷ 純資産' },
        ] },
      { title: '5. 運転資本', caption: null, rows: [
          { label: '売上債権回転日数（DSO）', value: '59.1日', note: '売上債権 ÷ 売上高 × 365' },
          { label: '棚卸資産回転日数（DIO）', value: '73.0日', note: '棚卸資産 ÷ 売上原価 × 365' },
          { label: '仕入債務回転日数（DPO）', value: '109.5日', note: '仕入債務 ÷ 売上原価 × 365' },
          { label: '現金化サイクル（CCC）', value: '22.6日', note: 'DSO + DIO − DPO' },
          { label: '運転資本', value: '1,500', note: '売上債権 + 棚卸資産 − 仕入債務' },
        ] },
      { title: '6. 資金繰り・返済余力', caption: null, rows: [
          { label: '営業キャッシュフロー（累計）', value: '600', note: '2か月分' },
          { label: '営業キャッシュフロー（月次平均）', value: '300', note: '' },
          { label: '資金ランウェイ', value: '―', note: '現預金 ÷ 月次の資金流出' },
          { label: '12か月後の予測残高', value: '6,600', note: '現預金に月次キャッシュフローを外挿' },
          { label: '予測最低残高', value: '3,000', note: '' },
          { label: '資金ショート予測', value: 'なし', note: '予測残高がマイナスになる月' },
          { label: '返済余力（DSCR）', value: '3.00倍', note: '営業キャッシュフロー ÷ 借入返済額' },
          { label: '最悪月の返済余力', value: '3.00倍', note: '' },
          { label: '返済不足の月数', value: '0／2か月', note: 'カバー率 1.0 倍未満の月 ／ 対象月' },
        ] },
      { title: '7. 成長性', caption: null, rows: [
          { label: '前期比売上高成長率', value: '―', note: '直近期 ÷ 前期 − 1' },
          { label: '平均成長率（CAGR）', value: '―', note: '1 期あたり' },
          { label: '売上トレンド', value: '―', note: '移動平均の比較' },
          { label: '当年度売上着地見込み', value: '148,148', note: '2026年（1か月経過、実績 12,345）' },
          { label: '前年同月比', value: '―', note: '' },
        ] },
      { title: '8. 予算実績差異', caption: null, rows: [
          { label: '売上高（予算）', value: '10,000', note: '' },
          { label: '売上高（実績）', value: '12,345', note: '' },
          { label: '売上高（差異）', value: '2,345', note: '実績 − 予算' },
          { label: '売上高 達成率', value: '123.5%', note: '実績 ÷ 予算' },
          { label: '営業利益（予算）', value: '1,000', note: '' },
          { label: '営業利益（実績）', value: '△1,854', note: '' },
          { label: '営業利益（差異）', value: '△2,854', note: '実績 − 予算' },
          { label: '営業利益 達成率', value: '△185.4%', note: '実績 ÷ 予算' },
        ] },
      { title: '9. 参考：経営スコア（当社内部の評価）', caption: '本アプリの採点であり、金融機関等の信用格付けとは関係がありません。', rows: [
          { label: '総合スコア', value: '50／100', note: '' },
          { label: '評価', value: '注意', note: '' },
          { label: '収益性', value: '50／100', note: '' },
          { label: '安全性', value: '―', note: '' },
          { label: '資金繰り', value: '―', note: '' },
          { label: '効率性', value: '―', note: '' },
          { label: '成長性', value: '―', note: '' },
        ] },
    ]);
    expect(m.notes).toEqual([
      '金額は千円単位（千円未満切捨て）で表示し、負数は「△」で示す。比率は小数第 1 位未満を四捨五入。該当なし・算定不能は「―」。',
      '損益・販売・人員の数値は当社が入力した実績（対象期間 令和8年4月）の累計。財政状態・運転資本は基準日 令和8年3月31日 の貸借対照表による。',
      '資金繰りは会計ソフト連携（freee）の月次営業キャッシュフロー、返済余力は同キャッシュフローと借入返済予定の突合による。',
      '経営スコアは当社内部の評価指標であり、金融機関等の信用格付けとは関係がない。',
      '本書は決算書・試算表に代わるものではなく、その補足資料として提出する。',
    ]);
    expect(m.attestation).toEqual({ statement: '上記のとおり相違ありません。', date: '令和8年9月4日', companyName: '株式会社テスト', representative: '代表取締役 山田 太郎' });
  });

  it('何も入力していない書面 — 行は残り、断り書きが付く', () => {
    const overview = buildBusinessOverview({ plan: 'free', sales: [], kpiActuals: [], members: [] });
    const m = buildBankSubmissionSheet({
      overview,
      scorecard: buildManagementScorecard({}),
      debtService: null, kpiPeriods: [], balanceSheetAsOf: null, today: '2026-09-04', settings: SETTINGS,
    });
    expect(m.meta).toEqual([
      { label: '商号', value: '株式会社テスト' },
      { label: '代表者', value: '代表取締役 山田 太郎' },
      { label: '所在地', value: '東京都千代田区1-1' },
      { label: '決算期', value: '令和8年3月期' },
      { label: '対象期間', value: '―' },
      { label: '貸借対照表 基準日', value: '―' },
      { label: '作成日', value: '令和8年9月4日' },
      { label: '表示単位', value: '千円（千円未満切捨て）' },
    ]);
    expect(m.sections).toEqual([
      { title: '1. 損益の状況（対象期間の累計）', caption: 'KPI 実績が未入力のため算定していません。', rows: [
          { label: '売上高', value: '―', note: 'KPI 実績の合計' },
          { label: '売上総利益', value: '―', note: '売上高 − 売上原価' },
          { label: '売上総利益率', value: '―', note: '売上総利益 ÷ 売上高' },
          { label: '営業利益', value: '―', note: '売上総利益 − 広告宣伝費 − 販売費及び一般管理費 − 減価償却費' },
          { label: '営業利益率', value: '―', note: '営業利益 ÷ 売上高' },
          { label: 'EBITDA', value: '―', note: '営業利益 + 減価償却費' },
          { label: 'EBITDA マージン', value: '―', note: 'EBITDA ÷ 売上高' },
          { label: '売上原価率', value: '―', note: '売上原価 ÷ 売上高' },
          { label: '広告宣伝費率', value: '―', note: '広告宣伝費 ÷ 売上高' },
          { label: '販売費及び一般管理費率', value: '―', note: '販売費及び一般管理費 ÷ 売上高' },
          { label: '限界利益率', value: '―', note: '(売上高 − 変動費) ÷ 売上高' },
          { label: '損益分岐点売上高', value: '―', note: '固定費 ÷ 限界利益率' },
          { label: '安全余裕率', value: '―', note: '(売上高 − 損益分岐点売上高) ÷ 売上高' },
        ] },
      { title: '2. 販売の状況', caption: null, rows: [
          { label: '売上高（販売記録）', value: '0', note: '販売記録の合計' },
          { label: '受注件数', value: '0件', note: '' },
          { label: '平均受注単価', value: '0円', note: '売上高 ÷ 受注件数' },
          { label: '販売チャネル数', value: '0', note: '' },
          { label: '主力チャネル', value: '―', note: '' },
          { label: '売上分散スコア', value: '―', note: '(1 − ハーフィンダール指数) × 100' },
        ] },
      { title: '3. 人員・生産性', caption: null, rows: [
          { label: '従業員数', value: '0名', note: '登録メンバー数' },
          { label: '一人当たり売上高', value: '0', note: '売上高 ÷ 従業員数' },
          { label: '一人当たり営業利益', value: '0', note: '営業利益 ÷ 従業員数' },
          { label: '人件費', value: '―', note: 'KPI 実績の人件費の合計' },
          { label: '労働分配率', value: '―', note: '人件費 ÷ 売上総利益' },
          { label: '人件費率', value: '―', note: '人件費 ÷ 売上高' },
          { label: '一人当たり人件費', value: '―', note: '人件費 ÷ 従業員数' },
        ] },
      { title: '4. 財政状態（貸借対照表 基準日現在）', caption: '貸借対照表が未入力のため算定していません。', rows: [
          { label: '総資産', value: '―', note: '' },
          { label: '負債合計', value: '―', note: '' },
          { label: '純資産', value: '―', note: '総資産 − 負債合計' },
          { label: '自己資本比率', value: '―', note: '純資産 ÷ 総資産' },
          { label: '流動比率', value: '―', note: '流動資産 ÷ 流動負債' },
          { label: '当座比率', value: '―', note: '(流動資産 − 棚卸資産) ÷ 流動負債' },
          { label: '固定比率', value: '―', note: '固定資産 ÷ 純資産' },
          { label: '総資産利益率（ROA）', value: '―', note: '当期純利益 ÷ 総資産' },
          { label: '自己資本利益率（ROE）', value: '―', note: '当期純利益 ÷ 純資産' },
        ] },
      { title: '5. 運転資本', caption: '貸借対照表と売上高が揃っていないため算定していません。', rows: [
          { label: '売上債権回転日数（DSO）', value: '―', note: '売上債権 ÷ 売上高 × 365' },
          { label: '棚卸資産回転日数（DIO）', value: '―', note: '棚卸資産 ÷ 売上原価 × 365' },
          { label: '仕入債務回転日数（DPO）', value: '―', note: '仕入債務 ÷ 売上原価 × 365' },
          { label: '現金化サイクル（CCC）', value: '―', note: 'DSO + DIO − DPO' },
          { label: '運転資本', value: '―', note: '売上債権 + 棚卸資産 − 仕入債務' },
        ] },
      { title: '6. 資金繰り・返済余力', caption: '会計ソフト連携（freee）の月次キャッシュフローが無いため算定していません。', rows: [
          { label: '営業キャッシュフロー（累計）', value: '―', note: '' },
          { label: '営業キャッシュフロー（月次平均）', value: '―', note: '' },
          { label: '資金ランウェイ', value: '―', note: '現預金 ÷ 月次の資金流出' },
          { label: '12か月後の予測残高', value: '―', note: '現預金に月次キャッシュフローを外挿' },
          { label: '予測最低残高', value: '―', note: '' },
          { label: '資金ショート予測', value: '―', note: '予測残高がマイナスになる月' },
          { label: '返済余力（DSCR）', value: '―', note: '営業キャッシュフロー ÷ 借入返済額' },
          { label: '最悪月の返済余力', value: '―', note: '' },
          { label: '返済不足の月数', value: '―', note: 'カバー率 1.0 倍未満の月 ／ 対象月' },
        ] },
      { title: '7. 成長性', caption: 'KPI 実績が未入力のため算定していません。', rows: [
          { label: '前期比売上高成長率', value: '―', note: '直近期 ÷ 前期 − 1' },
          { label: '平均成長率（CAGR）', value: '―', note: '1 期あたり' },
          { label: '売上トレンド', value: '―', note: '移動平均の比較' },
          { label: '当年度売上着地見込み', value: '―', note: '' },
          { label: '前年同月比', value: '―', note: '' },
        ] },
    ]);
    expect(m.notes).toEqual([
      '金額は千円単位（千円未満切捨て）で表示し、負数は「△」で示す。比率は小数第 1 位未満を四捨五入。該当なし・算定不能は「―」。',
      '損益・販売・人員の数値は当社が入力した実績（対象期間 ―）の累計。財政状態・運転資本は基準日 ― の貸借対照表による。',
      '資金繰りは会計ソフト連携（freee）の月次営業キャッシュフロー、返済余力は同キャッシュフローと借入返済予定の突合による。',
      '経営スコアは当社内部の評価指標であり、金融機関等の信用格付けとは関係がない。',
      '本書は決算書・試算表に代わるものではなく、その補足資料として提出する。',
    ]);
  });
});
