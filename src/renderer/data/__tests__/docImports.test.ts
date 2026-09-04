/**
 * 資金繰り表・事業計画書への取り込み — 会計連携の 12 か月と KPI 実績が、書式の入力欄のキーへ
 * 正しく写ること (キーは `planKey` と書式の欄名に一致する)。出所の無い欄は触らない。
 */
import { describe, expect, it } from 'vitest';
import { buildBusinessPlanImport, buildCashPlanImport } from '../docImports';
import { PLAN_MONTHS, buildCashPlan, planKey } from '../cashPlan';
import { STUDIO_TEMPLATES } from '../docStudioData';
import { EMPTY_PROFILE, type SubmissionProfile } from '../bankSubmission';
import type { KpiActual } from '../kpiActuals';
import type { BalanceSheet } from '../balanceSheet';

const PROFILE: SubmissionProfile = { companyName: '株式会社テスト', representative: '山田 太郎', address: '', fiscalYearEnd: '2026-03' };
const BS: BalanceSheet = {
  asOf: '2026-03-31', currentAssets: 8_000_000, cash: 3_000_000, inventory: 1_000_000, accountsReceivable: 2_000_000,
  fixedAssets: 4_000_000, currentLiabilities: 5_000_000, accountsPayable: 1_500_000, fixedLiabilities: 3_000_000, netIncome: 600_000,
};
const month = (m: string, income: number, expense: number) => ({ month: m, income, expense, net: income - expense });
const ACC = [
  month('2025-06', 1_000_000, 700_000),
  month('2025-04', 1_200_000, 900_000),
  month('2025-05', 1_100_000, 800_000),
];
const fieldKeys = (id: string) => STUDIO_TEMPLATES.find((d) => d.id === id)!.fields.map((f) => f.k);

describe('buildCashPlanImport — 資金繰り表', () => {
  it('会計連携の月を古い順に 1 か月目から並べ、収入は売上入金・支出はその他経費へ', () => {
    const r = buildCashPlanImport({ accounting: ACC, balanceSheet: BS, profile: PROFILE, existing: {} });
    expect(r.rows.find((x) => x.k === 'company')).toEqual({ k: 'company', label: '会社名・屋号', value: '株式会社テスト', source: '提出者情報' });
    expect(r.rows.find((x) => x.k === 'periodFrom')).toEqual({ k: 'periodFrom', label: '対象期間（自）', value: '2025年4月', source: '会計連携 (2025年4月〜2025年6月)' });
    expect(r.values[planKey(1, 'sales')]).toBe('1200000');
    expect(r.values[planKey(1, 'expense')]).toBe('900000');
    expect(r.values[planKey(2, 'sales')]).toBe('1100000');
    expect(r.values[planKey(3, 'sales')]).toBe('1000000');
    expect(r.values[planKey(3, 'expense')]).toBe('700000');
    expect(r.values[planKey(4, 'sales')]).toBeUndefined();
    expect(r.rows.find((x) => x.k === planKey(2, 'expense'))).toEqual({ k: 'm2expense', label: 'その他経費 2月目', value: '800000', source: '2025年5月 の支出' });
    expect(r.rows.find((x) => x.k === planKey(1, 'sales'))).toEqual({ k: 'm1sales', label: '売上入金 1月目', value: '1200000', source: '2025年4月 の収入' });
    expect(r.rows.find((x) => x.k === 'openingBalance')).toEqual({ k: 'openingBalance', label: '期首の現預金残高（円）', value: '3000000', source: '貸借対照表 (2026-03-31 時点) の現預金' });
    expect(r.notes).toEqual([
      '会計連携の月次は収入・支出の合計しか無いので、収入は売上入金、支出はその他経費に置いた。仕入・外注費・人件費・借入の行へ分け直すこと。',
      '会計連携は 3 か月分。4 か月目以降は空欄のままなので、見込みを入れること。',
      '期首の現預金残高は貸借対照表の現預金。基準日が対象期間の期首と合っているか確かめること。',
    ]);
    expect(r.skipped).toEqual([]);
    // 書式の欄と表のキーに実在するキーだけを書く
    const known = new Set([...fieldKeys('shikin-guri'), ...Array.from({ length: PLAN_MONTHS }, (_, i) => [planKey(i + 1, 'sales'), planKey(i + 1, 'expense')]).flat()]);
    for (const row of r.rows) expect(known.has(row.k), row.k).toBe(true);
    // 取り込んだ値で資金繰り表を組むと、1 か月目の経常収支は 300,000
    const plan = buildCashPlan(r.values, Number(r.values.openingBalance));
    expect(plan.months[0]!.operatingNet).toBe(300_000);
    expect(plan.months[0]!.closing).toBe(3_300_000);
  });
  it('13 か月以上あれば直近 12 か月だけ。12 か月揃えば「残りは空欄」の注記は出ない', () => {
    const many = Array.from({ length: 14 }, (_, i) => month(`2025-${String(i + 1).padStart(2, '0')}`.replace('2025-13', '2026-01').replace('2025-14', '2026-02'), 100 * (i + 1), 10));
    const r = buildCashPlanImport({ accounting: many, balanceSheet: null, profile: EMPTY_PROFILE, existing: {} });
    expect(r.rows.find((x) => x.k === 'periodFrom')?.value).toBe('2025年3月');
    expect(r.values[planKey(1, 'sales')]).toBe('300');
    expect(r.values[planKey(12, 'sales')]).toBe('1400');
    expect(r.values[planKey(13, 'sales')]).toBeUndefined();
    expect(r.notes.some((n) => n.includes('か月分'))).toBe(false);
    expect(r.skipped).toEqual(['会社名・屋号: 提出者情報の商号が未設定', '期首の現預金残高: 貸借対照表の現預金が未入力']);
  });
  it('会計連携が無ければ入出金は取り込まず、既存の値は残る。読めない月は無視', () => {
    const r = buildCashPlanImport({ accounting: [month('bad', 1, 1)], balanceSheet: BS, profile: PROFILE, existing: { m1borrow: '500000' } });
    expect(r.rows.map((x) => x.k)).toEqual(['company', 'openingBalance']);
    expect(r.skipped).toEqual(['月ごとの入出金: 会計連携 (freee) の月次キャッシュフローが無い']);
    expect(r.values.m1borrow).toBe('500000');
  });
  it('現預金の欄が無い貸借対照表なら期首残高は取り込まない', () => {
    const { cash: _omit, ...noCash } = BS;
    const r = buildCashPlanImport({ accounting: ACC, balanceSheet: noCash as BalanceSheet, profile: PROFILE, existing: {} });
    expect(r.rows.find((x) => x.k === 'openingBalance')).toBeUndefined();
    expect(r.skipped).toEqual(['期首の現預金残高: 貸借対照表の現預金が未入力']);
    expect(r.notes.some((n) => n.includes('期首の現預金残高'))).toBe(false);
  });
});

describe('buildBusinessPlanImport — 事業計画書', () => {
  const kpi = (period: string, revenue: number): KpiActual => ({ period, unit: '全社', revenue, cogs: revenue * 0.4, advertising: 10_000, sga: 100_000, depreciation: 5_000 });
  it('会社名・代表者・作成日と、決算期の 12 か月の実績を 1 年目に置く', () => {
    const r = buildBusinessPlanImport({ kpiActuals: [kpi('2025-03', 9_999_999), kpi('2025-04', 1_000_000), kpi('2026-03', 2_000_000), kpi('2026-04', 5_555_555)], profile: PROFILE, today: '2026-09-04', existing: { y2sales: '30000000' } });
    expect(r.rows.map((x) => x.k)).toEqual(['company', 'rep', 'date', 'y1sales', 'y1profit']);
    expect(r.rows.slice(0, 3)).toEqual([
      { k: 'company', label: '会社名・屋号', value: '株式会社テスト', source: '提出者情報' },
      { k: 'rep', label: '代表者名', value: '山田 太郎', source: '提出者情報' },
      { k: 'date', label: '作成日', value: '2026年9月4日', source: '今日' },
    ]);
    expect(r.rows[4]).toEqual({ k: 'y1profit', label: '1年目 経常利益（円）', value: '1570000', source: 'KPI 実績 (2025年4月〜2026年3月)' });
    expect(r.values.company).toBe('株式会社テスト');
    expect(r.values.rep).toBe('山田 太郎');
    expect(r.values.date).toBe('2026年9月4日');
    expect(r.values.y1sales).toBe('3000000');
    // 3,000,000 − 1,200,000 − 20,000 − 200,000 − 10,000
    expect(r.values.y1profit).toBe('1570000');
    expect(r.rows.find((x) => x.k === 'y1sales')?.source).toBe('KPI 実績 (2025年4月〜2026年3月)');
    expect(r.values.y2sales).toBe('30000000');
    expect(r.notes).toEqual(['1 年目の売上高・経常利益は KPI 実績の実績値 (営業外損益は含まない)。計画の出発点として置いたので、計画値へ直すこと。2・3 年目は数字を作らない。']);
    expect(r.skipped).toEqual([]);
    for (const row of r.rows) expect(fieldKeys('jigyo-keikaku')).toContain(row.k);
  });
  it('決算期に実績が無ければ全期間を合算して注記。決算期が無くても同じ', () => {
    const r = buildBusinessPlanImport({ kpiActuals: [kpi('2024-01', 100), kpi('2024-02', 200)], profile: PROFILE, today: '2026-09-04', existing: {} });
    expect(r.values.y1sales).toBe('300');
    expect(r.notes[0]).toBe('決算期の 12 か月に KPI 実績が無い (または決算期が未設定) ため、入力済みの全期間 (2024年1月〜2024年2月) を合算した。');
    const noFy = buildBusinessPlanImport({ kpiActuals: [kpi('2024-02', 200), kpi('2024-01', 100)], profile: { ...PROFILE, fiscalYearEnd: '' }, today: '2026-09-04', existing: {} });
    expect(noFy.values.y1sales).toBe('300');
    expect(noFy.rows.find((x) => x.k === 'y1sales')?.source).toBe('KPI 実績 (2024年1月〜2024年2月)');
  });
  it('KPI が無ければ 1 年目は取り込まない。提出者情報が空なら会社名・代表者も取り込まない。読めない日付はそのまま', () => {
    const r = buildBusinessPlanImport({ kpiActuals: [kpi('bad', 1)], profile: EMPTY_PROFILE, today: 'x', existing: {} });
    expect(r.rows).toEqual([{ k: 'date', label: '作成日', value: 'x', source: '今日' }]);
    expect(buildBusinessPlanImport({ kpiActuals: [], profile: EMPTY_PROFILE, today: 'x2026-09-04', existing: {} }).values.date).toBe('x2026-09-04');
    expect(buildBusinessPlanImport({ kpiActuals: [], profile: EMPTY_PROFILE, today: '2026-09-04x', existing: {} }).values.date).toBe('2026-09-04x');
    expect(r.skipped).toEqual(['会社名・屋号: 提出者情報の商号が未設定', '代表者名: 提出者情報の代表者が未設定', '1 年目の売上高・経常利益: KPI 実績が未入力']);
    expect(r.notes).toEqual([]);
  });
});
