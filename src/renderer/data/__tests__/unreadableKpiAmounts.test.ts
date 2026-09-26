/**
 * **KPI 実績・予算の金額が数として読めない行は、集計に入れず、入れなかったと言う。**
 * (2026-09-24 · パス 443)
 *
 * パス 442 は販売記録の `amount` について同じ家系を閉じた。**その隣が KPI** で、
 * 形 (`KPI_SHAPE`) は `revenue` ほか 5 欄を `num` と宣言するのに、
 * 漏斗 `readablePeriodRows` (パス 225) は**期しか見ていなかった**。
 *
 * ## なぜ投げないのに危ないか
 *
 * `summarizeFundamentals` は `acc.revenue + a.revenue` と**素で足す**ので、
 * JS の `+` の規則がそのまま答えになる —— **投げないので「投げた画面」を数える
 * 走査 (`npm run audit:malformed-fields`) には 1 件も映らない**。
 *
 * 実測 (2026-09-24 · 直す前 · 正しい 1 件 (revenue 100 万) + 金額だけ壊した 1 件):
 *
 * | revenue | 書面 §1 売上高 | 書面 §1 営業利益 | 営業利益率 | 損益分岐点 |
 * | --- | ---: | ---: | ---: | ---: |
 * | (正しい 2 行) | 2,000 千円 | 880 千円 | 44.0% | 646 千円 |
 * | `'9000000'` | **―** | **10,000,007,880 千円** | **100.0%** | **420 千円** |
 * | `[1]` | **―** | **8,880 千円** | **88.8%** | **451 千円** |
 * | `true` | **1,000 千円** | **△119 千円** | **△12.0%** | **1,399 千円** |
 * | `null` | **1,000 千円** | **△120 千円** | **△12.0%** | **1,400 千円** |
 *
 * 10 進の文字列がいちばん重い —— `1_000_000 + '9000000'` は**連結**なので売上高は
 * `―` になる一方、`revenue - cost` は**数に戻る**ので営業利益だけが刷られる。
 * その紙は「上記のとおり相違ありません。」と代表者名つきで金融機関へ出す。
 *
 * `null` と `true` はもっと静かで、壊れた行が**黙って 0 円として合算される**。
 */
import { describe, expect, it } from 'vitest';
import {
  KPI_SUM_FIELDS,
  kpiNumbersReadable,
  readableKpiRows,
  summarizeFundamentals,
  unreadableKpiRowsNote,
  unreadableKpiRowsOverviewNote,
  unreadableKpiRowsSheetNote,
  unreadableNumberNote,
  unreadableNumberSheetNote,
  unreadablePeriodNote,
  unreadablePeriodSheetNote,
  type KpiActual,
} from '../kpiActuals';
import { buildBusinessOverview } from '../overview';
import { buildBankSubmissionSheet, type BankSubmissionSettings, type SheetSection } from '../bankSubmission';
import { buildManagementReport } from '../managementReport';
import { buildManagementHighlights } from '../managementHighlights';
import { NO_MANUAL_OVERRIDES } from '../overviewOverrides';
import { buildManagementScorecard } from '../../../shared/managementScorecard';
import { combineCashflowDebtService } from '../cashflowDebtService';
import { BANK_FORMAT_DEFAULT } from '../../../shared/bankFormat';
import { hasCollectionShape } from '../collectionShapes';
import { KPI_ACTUALS_COLLECTION } from '../kpiActuals';

/** 形が拒む 5 形 —— どれも `structuredClone` が通すので保管値として実在しうる。 */
const NON_NUMBERS: readonly [string, unknown][] = [
  ['10進の文字列', '9000000'],
  ['物', { z: 1 }],
  ['配列', [1]],
  ['真偽', true],
  ['null', null],
];

const GOOD: KpiActual = {
  period: '2026-04',
  unit: '全社',
  revenue: 1_000_000,
  cogs: 300_000,
  advertising: 50_000,
  sga: 200_000,
  depreciation: 10_000,
};

const row = (over: Record<string, unknown>): KpiActual => ({ ...GOOD, ...over }) as unknown as KpiActual;

const ACCOUNTING = [{ month: '2026-04', income: 1_100_000, expense: 800_000, net: 300_000 }];
const SETTINGS: BankSubmissionSettings = {
  profile: {
    companyName: '株式会社テスト',
    representative: '代表取締役 山田 太郎',
    address: '東京都千代田区1-1',
    fiscalYearEnd: '2026-03',
  },
  format: BANK_FORMAT_DEFAULT,
};

function overviewOf(rows: readonly KpiActual[]) {
  return buildBusinessOverview({
    plan: 'business',
    sales: [],
    kpiActuals: rows,
    kpiBudgets: [],
    balanceSheet: null,
    accounting: ACCOUNTING,
    members: [{ role: 'owner' }],
  });
}

function sheetOf(rows: readonly KpiActual[]): SheetSection {
  const ov = overviewOf(rows);
  const m = buildBankSubmissionSheet({
    overview: ov,
    scorecard: buildManagementScorecard({
      operatingMarginPct: ov.kpi.operatingMarginPct ?? undefined,
      grossMarginPct: ov.kpi.grossMarginPct ?? undefined,
    }),
    debtService: combineCashflowDebtService(ACCOUNTING, []),
    balanceSheetAsOf: null,
    today: '2026-09-24',
    settings: SETTINGS,
    manual: NO_MANUAL_OVERRIDES,
  });
  const s1 = m.sections.find((s) => s.title.startsWith('1.'));
  if (!s1) throw new Error('§1 missing');
  return s1;
}

const rowValue = (s: SheetSection, label: string): string => {
  const r = s.rows.find((x) => x.label === label);
  if (!r) throw new Error(`row ${label} missing`);
  return r.value;
};

describe('漏斗は金額も見る (パス 443)', () => {
  it('★ 合計に入る欄は `summarizeFundamentals` の出力から導く (手書きの一覧を置かない)', () => {
    expect([...KPI_SUM_FIELDS].sort()).toEqual(Object.keys(summarizeFundamentals([])).sort());
    // 床 —— 走査が死んで「0 欄だから健全」にならないため。
    expect(KPI_SUM_FIELDS.length).toBeGreaterThanOrEqual(5);
  });

  it.each(KPI_SUM_FIELDS.map((f) => [f] as const))('★ %s が非数の行は落ちる (5 形すべて)', (field) => {
    for (const [label, bad] of NON_NUMBERS) {
      const r = readableKpiRows([GOOD, row({ period: '2026-05', [field]: bad })]);
      expect(r.rows, `${field} = ${label}`).toHaveLength(1);
      expect(r.unreadableNumbers, `${field} = ${label}`).toBe(1);
      expect(r.unreadablePeriods, `${field} = ${label}`).toBe(0);
      expect(r.dropped).toBe(r.unreadablePeriods + r.unreadableNumbers);
    }
  });

  it('★ 正しい行の答えは 1 つも変わらない', () => {
    const r = readableKpiRows([GOOD, { ...GOOD, period: '2026-05' }]);
    expect(r.rows).toHaveLength(2);
    expect(r.dropped).toBe(0);
    expect(summarizeFundamentals(r.rows).revenue).toBe(2_000_000);
  });

  it('★ 期と金額は別々に数える (原因が違えば直す手も違う)', () => {
    const r = readableKpiRows([GOOD, row({ period: 'bad' }), row({ period: '2026-05', revenue: null })]);
    expect(r.unreadablePeriods).toBe(1);
    expect(r.unreadableNumbers).toBe(1);
    expect(r.dropped).toBe(2);
  });

  it('★ 期が読めない行は「期」に数える (両方壊れていても二重に数えない)', () => {
    const r = readableKpiRows([row({ period: 'bad', revenue: null })]);
    expect(r.unreadablePeriods).toBe(1);
    expect(r.unreadableNumbers).toBe(0);
  });

  it('★ 人件費は任意 —— 不在・null は通し、数でない値は落とす (入口と同じ境目)', () => {
    expect(kpiNumbersReadable(GOOD)).toBe(true);
    expect(kpiNumbersReadable(row({ laborCost: undefined }))).toBe(true);
    expect(kpiNumbersReadable(row({ laborCost: null }))).toBe(true);
    expect(kpiNumbersReadable(row({ laborCost: 100 }))).toBe(true);
    for (const [label, bad] of NON_NUMBERS) {
      if (bad === null) continue; // null は入口が「未入力」として通す
      expect(kpiNumbersReadable(row({ laborCost: bad })), `laborCost = ${label}`).toBe(false);
    }
  });

  it('★ 形の表もこの行を拒む (だから点検パネルが見つけて消せる)', () => {
    expect(hasCollectionShape(KPI_ACTUALS_COLLECTION, { ...GOOD })).toBe(true);
    for (const [label, bad] of NON_NUMBERS) {
      expect(
        hasCollectionShape(KPI_ACTUALS_COLLECTION, { ...GOOD, revenue: bad } as Record<string, unknown>),
        `revenue = ${label}`,
      ).toBe(false);
    }
  });
});

describe('直す前の嘘を、算術で残す (製品は直したので再現できない)', () => {
  /**
   * `summarizeFundamentals` が素で足していたときの答え。
   * **`Intl.NumberFormat#format` は何を渡しても投げない**ので、この family は
   * 「投げた画面」を数える走査には 1 件も映らない (だから別に留める)。
   */
  const SUMS: readonly [string, unknown, string][] = [
    ['10進の文字列', '9000000', '10000009000000'],
    ['物', { z: 1 }, '1000000[object Object]'],
    ['配列', [1], '10000001'],
    ['真偽', true, '1000001'],
    ['null', null, '1000000'],
  ];

  it.each(SUMS)('素の + は %s をこう畳んでいた', (_label, bad, was) => {
    expect(`${(0 + 1_000_000 + (bad as number)) as unknown}`).toBe(was);
  });

  it('★ Intl は投げないので、嘘は静かに紙へ載る', () => {
    const yen = new Intl.NumberFormat('ja-JP');
    for (const [, bad] of NON_NUMBERS) {
      expect(() => yen.format(bad as number)).not.toThrow();
    }
    expect(yen.format(null as unknown as number)).toBe('0');
    expect(yen.format([1] as unknown as number)).toBe('1');
  });
});

/** 原因を見分ける針 —— どちらも同じ `it` の中で**当たる標本**を添える (規約: 不在の主張には標本)。 */
const PERIOD_WORDS = /期 \(YYYY-MM\) が読めない/;
const MONEY_WORDS = /金額の欄/;

describe('断りは原因ごとに言い分ける (パス 443)', () => {
  it('落としていなければ null', () => {
    expect(unreadableNumberNote('実績', 0)).toBeNull();
    expect(unreadableNumberSheetNote(0)).toBeNull();
    expect(unreadableKpiRowsNote('実績', { unreadablePeriods: 0, unreadableNumbers: 0 })).toBeNull();
    expect(unreadableKpiRowsOverviewNote({ unreadablePeriods: 0, unreadableNumbers: 0 })).toBeNull();
    expect(unreadableKpiRowsSheetNote({ unreadablePeriods: 0, unreadableNumbers: 0 })).toBeNull();
  });

  it('★ 金額の文は「期が読めない」と言わない (針が的に当たる標本つき)', () => {
    const n = unreadableNumberNote('実績', 1);
    expect(n).not.toBeNull();
    expect(n!).not.toMatch(PERIOD_WORDS);
    // 標本: 期の文はその綴りを持つ (針が死んでいない)。
    expect(unreadablePeriodSheetNote(1)!).toMatch(PERIOD_WORDS);
  });

  it('★ 期の文は「金額の欄」と言わない (逆向き・標本つき)', () => {
    expect(unreadablePeriodNote('実績', 1)!).not.toMatch(MONEY_WORDS);
    expect(unreadableNumberNote('実績', 1)!).toMatch(MONEY_WORDS);
  });

  it('★ 両方起きていれば 2 文が並ぶ (順序は 期 → 金額 で固定)', () => {
    const both = unreadableKpiRowsSheetNote({ unreadablePeriods: 2, unreadableNumbers: 3 });
    expect(both).not.toBeNull();
    expect(both!.indexOf('期 (YYYY-MM)')).toBeLessThan(both!.indexOf('金額の欄'));
    expect(both).toContain('2 件');
    expect(both).toContain('3 件');
  });

  it('★ 片方だけなら 1 文だけ (起きていない原因を述べない)', () => {
    const onlyMoney = unreadableKpiRowsNote('実績', { unreadablePeriods: 0, unreadableNumbers: 1 });
    expect(onlyMoney).not.toBeNull();
    expect(onlyMoney!).not.toMatch(PERIOD_WORDS);
    // 標本: 同じ針が、期の側の文には当たる (どの入力でも通る空の検査にしない)。
    expect(onlyMoney!).toMatch(MONEY_WORDS);
    const onlyPeriod = unreadableKpiRowsNote('実績', { unreadablePeriods: 1, unreadableNumbers: 0 });
    expect(onlyPeriod!).not.toMatch(MONEY_WORDS);
    expect(onlyPeriod!).toMatch(PERIOD_WORDS);
  });

  it('★ 金額の断りは設定の点検パネルを名指しする (形が拒む行なのでそこで見つかる)', () => {
    expect(unreadableNumberNote('実績', 1)!).toContain('形式の合わないレコード');
    // 経営サマリー向けは件数の種別だけが違う (3 つ目の関数を作らない)。
    expect(unreadableKpiRowsOverviewNote({ unreadablePeriods: 0, unreadableNumbers: 1 })!).toContain('実績・予算のうち 1 件');
  });
});

describe('相手に渡る紙が、除いたことを述べる (パス 443)', () => {
  const BAD = row({ period: '2026-05', revenue: '9000000' });

  it('★ 経営サマリーは良い行だけで集計し、件数を原因ごとに持つ', () => {
    const ov = overviewOf([GOOD, BAD]);
    expect(ov.kpi.revenue).toBe(1_000_000);
    expect(ov.kpi.unreadableNumbers).toBe(1);
    expect(ov.kpi.unreadablePeriods).toBe(0);
  });

  it('★ 書面 §1 は良い行の数字を出し、caption が理由を述べる', () => {
    const s1 = sheetOf([GOOD, BAD]);
    expect(rowValue(s1, '売上高')).toBe('1,000');
    expect(rowValue(s1, '営業利益')).toBe('440');
    expect(rowValue(s1, '営業利益率')).toBe('44.0%');
    expect(s1.caption ?? '').toContain('金額の欄が数として読めない 1 件は集計から除いています');
  });

  it('★ 回帰: 直す前の 10 兆円は、もうどの行にも出ない', () => {
    const s1 = sheetOf([GOOD, BAD]);
    for (const r of s1.rows) {
      expect(r.value, r.label).not.toContain('10,000,007,880');
      expect(r.value, r.label).not.toBe('100.0%');
    }
  });

  it('★ 経営レポートも同じ文を述べる', () => {
    const ov = overviewOf([GOOD, BAD]);
    const sc = buildManagementScorecard({
      operatingMarginPct: ov.kpi.operatingMarginPct ?? undefined,
      grossMarginPct: ov.kpi.grossMarginPct ?? undefined,
    });
    const md = buildManagementReport(ov, sc, buildManagementHighlights(ov), '2026-09-24', NO_MANUAL_OVERRIDES);
    expect(md).toContain('金額の欄が数として読めない 1 件は集計から除いています');
  });

  it('★ 正しい控えでは 1 文も足さない (正常な利用者の紙は 1 字も変わらない)', () => {
    const s1 = sheetOf([GOOD, { ...GOOD, period: '2026-05' }]);
    expect(rowValue(s1, '売上高')).toBe('2,000');
    expect(s1.caption ?? '').not.toContain('金額の欄');
    expect(s1.caption ?? '').not.toContain('期 (YYYY-MM)');
  });
});
