/**
 * 金融機関等提出用の書面 — 経営サマリーの値が書式を通って表に並ぶこと、
 * 出せない値は「―」で埋まり行は消えないこと、書式を変えると数字が変わること (対照)。
 */
import { describe, expect, it } from 'vitest';
import {
  buildBankSubmissionSheet,
  type BankSubmissionInput,
  type BankSubmissionSettings,
  type SheetSection,
} from '../bankSubmission';
import { buildBusinessOverview, type BusinessOverview } from '../overview';
import { NO_MANUAL_OVERRIDES } from '../overviewOverrides';
import { buildManagementScorecard } from '../../../shared/managementScorecard';
import { HYDROPONICS_DEFAULTS, economicsFromSetup } from '../hydroponicsSetup';
import { DEFAULT_CROP_LIST } from '../../../shared/hydroponicCrops';
import { combineCashflowDebtService } from '../cashflowDebtService';
import { BANK_FORMAT_DEFAULT } from '../../../shared/bankFormat';
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

/**
 * **損益分岐点が存在しない状態を、相手に渡る書面が黙っていた** (2026-09-22 · パス 387)。
 *
 * 限界利益 ≤ 0 = *どれだけ売っても固定費を回収できない*。2026-09-22 の実測で、
 * 金融機関等提出用の書面はこの状態を次のように出していた:
 *
 * ```
 * 損益分岐点売上高 = ―   (注記「固定費 ÷ 限界利益率」)
 * 安全余裕率       = ―   (注記「(売上高 − 損益分岐点売上高) ÷ 売上高」)
 * ```
 *
 * そして**理由は書面のどこにも無かった** (`hasReasonAnywhere=false`)。同じ状態を:
 *
 * | 面 | 何と言うか |
 * | --- | --- |
 * | 画面 (経営サマリー / KPI 実績) | `—` + 「限界利益が 0 以下です。…」 (パス 386) |
 * | 経営レポート | 経営ハイライトの **critical** 所見として述べる (実測で在った) |
 * | **書面** | **`―` だけ** |
 *
 * **パス 382 の逆向きである** —— あのときは画面が書面より弱かった。
 * ここでは**いちばん重い面 (代表者名つきで金融機関へ出す紙) が最も弱かった**。
 * しかも残る注記は算式なので、この状態では「割った結果が空欄」と読ませる ——
 * 実際は**割るべき点が存在しない**。
 */
describe('★ 損益分岐点が存在しないとき、書面が理由を述べる (パス 387)', () => {
  /** 限界利益 ≤ 0 (売上 100 万・変動費 120 万・固定費 30 万)。BEP は存在しない。 */
  const LOSS: KpiActual[] = [
    { period: '2026-04', unit: '全社', revenue: 1_000_000, cogs: 1_200_000, advertising: 0, sga: 300_000, depreciation: 0 },
  ];

  it('★ §1 の但し書きが理由を述べ、2 行は「―」のまま', () => {
    const ov = overviewWith({ kpiActuals: LOSS });
    // 前提: 上流が「存在しない」の印を立てている (立っていなければこの it は無意味)。
    expect(Number.isFinite(ov.kpi.bep), 'bep が有限 —— この it の前提が成り立たない').toBe(false);
    const m = buildBankSubmissionSheet(inputWith(ov));
    const s1 = section(m.sections, '1.');
    expect(s1.caption ?? '').toContain('限界利益が 0 以下のため、損益分岐点売上高と安全余裕率は算定していません');
    // 値そのものは変えていない (空欄の**理由**を足しただけ)。
    expect(value(s1, '損益分岐点売上高')).toBe('―');
    expect(value(s1, '安全余裕率')).toBe('―');
    // 算式の注記は残す —— 正常なときの読み手には要る。
    expect(note(s1, '損益分岐点売上高')).toContain('固定費 ÷ 限界利益率');
  });

  it('★ 対照: 限界利益が在れば理由は出ず、金額で出る', () => {
    const m = buildBankSubmissionSheet(inputWith(overviewWith()));
    const s1 = section(m.sections, '1.');
    expect(s1.caption ?? '').not.toContain('限界利益が 0 以下のため');
    expect(value(s1, '損益分岐点売上高')).not.toBe('―');
  });

  it('★ 売上 0 のときは重ねて言わない (売上 0 の断りのほうが情報量が多い)', () => {
    const ZERO: KpiActual[] = [
      { period: '2026-04', unit: '全社', revenue: 0, cogs: 0, advertising: 0, sga: 300_000, depreciation: 0 },
    ];
    const ov = overviewWith({ kpiActuals: ZERO });
    expect(Number.isFinite(ov.kpi.bep), '売上 0 でも bep は非有限であること').toBe(false);
    const s1 = section(buildBankSubmissionSheet(inputWith(ov)).sections, '1.');
    const cap = s1.caption ?? '';
    // 肯定の前提: 売上 0 の断りは出ている。
    expect(cap).toContain('対象期間の売上高が 0 のため');
    // その上で、安全余裕率を 2 度名指ししない。
    expect(cap).not.toContain('限界利益が 0 以下のため');
  });

  it('★ 参考の節 (水耕栽培の計画) も同じ答え方をする —— 同じ書面の中で割らない', () => {
    // 単価 10 円 < 株あたり変動費 17 円 (種 3 + 液肥 2 + 包材 12)。計画の限界利益は負。
    const plan = economicsFromSetup({ ...HYDROPONICS_DEFAULTS, unitPriceYen: 10 }, DEFAULT_CROP_LIST);
    const ov = overviewWith({ hydroponics: plan });
    const h = ov.hydroponics;
    expect(h, '水耕栽培の節が組まれていない').not.toBeNull();
    expect(Number.isFinite(h!.bep), '計画の bep が有限 —— 前提が成り立たない').toBe(false);
    const s = section(buildBankSubmissionSheet(inputWith(ov)).sections, '参考：水耕栽培');
    expect(s.caption ?? '').toContain('限界利益が 0 以下のため');
    expect(value(s, '損益分岐点売上高（月）')).toBe('―');
  });

  it('★ 対照: 計画の限界利益が在れば参考の節も理由を出さない', () => {
    const ov = overviewWith({ hydroponics: economicsFromSetup(HYDROPONICS_DEFAULTS, DEFAULT_CROP_LIST) });
    const s = section(buildBankSubmissionSheet(inputWith(ov)).sections, '参考：水耕栽培');
    expect(s.caption ?? '').not.toContain('限界利益が 0 以下のため');
  });
});
