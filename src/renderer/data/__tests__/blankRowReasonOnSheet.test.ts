/**
 * **空欄を出す節は、必ず理由を持つ** —— 金融機関等提出用の書面 (2026-09-22 · パス 395)。
 *
 * ## なぜ「節」の単位なのか (最初の針は間違っていた)
 *
 * 最初は「空欄の**行**の label が紙のどこかに出ていること」を測った。実測すると
 * 健全な状態でも空欄は 37 行あり、その大半は節の caption
 * (「貸借対照表が未入力のため算定していません。」が 10 行をまとめて説明する) で
 * 正しく覆われていた —— **行ごとに名指しさせると馬鹿げた注記になる**。
 * 針を節の単位に直すと、7 状態のうち 6 つで**ただ 1 つの節**が鳴った: §7「成長性」
 * (`caption: has ? null : …` なので実績が 1 期でも在れば caption が消え、4 行が
 * 理由なしで `―` のまま並ぶ)。**人が読んで見つけた 2 件 (§2・§1) の外に、
 * 機械が 3 件目を出した。**
 *
 * ## この書面が自分でその規約を宣言している
 *
 * 冒頭の注記は「該当なし・算定不能は「―」」と述べる。つまり `―` は
 * *算定していない*という主張であって、その理由は読み手に要る ——
 * この紙は「上記のとおり相違ありません。」で代表者名つきで終わる。
 *
 * ## 対照 (2026-09-22 に実際に回した)
 *
 * | 壊す物 | 落ちる |
 * | --- | --- |
 * | §7 の caption を `has ? null : …` へ戻す | ★ 節の不変条件 (§7 を名指し) |
 * | §2 の数値を無条件の `amt` / `formatCount` へ戻す | §2 の 2 件 |
 * | §2 の caption から `noSalesRecordsSheetNote` を外す | 節の不変条件 + §2 |
 * | `zeroRevenueRatioNote` から損益分岐点の 1 文を外す | §1 の 2 件 |
 * | `hasData` を `totalAmount > 0` にする | 返品で 0 になった月の 1 件 |
 */
import { describe, expect, it } from 'vitest';
import { buildBusinessOverview, type BusinessOverview } from '../overview';
import { buildManagementReport } from '../managementReport';
import { buildManagementHighlights } from '../managementHighlights';
import { buildManagementScorecard } from '../../../shared/managementScorecard';
import { BANK_FORMAT_DEFAULT } from '../../../shared/bankFormat';
import { NO_MANUAL_OVERRIDES } from '../overviewOverrides';
import { combineCashflowDebtService } from '../cashflowDebtService';
import {
  buildBankSubmissionSheet,
  type BankSubmissionSheetModel,
  type BankSubmissionSettings,
} from '../bankSubmission';
import { growthBlankSheetNote, zeroRevenueRatioNote, type KpiActual } from '../kpiActuals';
import { noSalesRecordsNote, noSalesRecordsSheetNote, type SalesEntry } from '../sales';

// --- 状態を作る ---------------------------------------------------------------

const KPI = (period: string, revenue: number): KpiActual => ({
  period, unit: '全社', revenue, cogs: 400_000, advertising: 0, sga: 200_000, depreciation: 0,
});
/** 売上 0 で費用だけ (§1 の比率と損益分岐点がまとめて空になる)。 */
const ZERO_REVENUE: KpiActual = {
  period: '2026-08', unit: '全社', revenue: 0, cogs: 0, advertising: 0, sga: 300_000, depreciation: 0,
};
/** 限界利益 ≤ 0 (損益分岐点が存在しない)。 */
const CONTRIBUTION_LE_0: KpiActual = {
  period: '2026-08', unit: '全社', revenue: 1_000_000, cogs: 1_200_000, advertising: 0, sga: 300_000, depreciation: 0,
};
const ONE_SALE: readonly SalesEntry[] = [
  { date: '2026-08-01', channel: 'shopify', amount: 500_000, orders: 2, note: '' },
];
/** **返品で合計が 0 になった月** —— 記録は在るので「未入力」ではない。 */
const REFUNDED_TO_ZERO: readonly SalesEntry[] = [
  { date: '2026-08-01', channel: 'shopify', amount: 500_000, orders: 1, note: 'A' },
  { date: '2026-08-02', channel: 'shopify', amount: -500_000, orders: -1, note: 'B' },
];

const SETTINGS: BankSubmissionSettings = {
  profile: {
    companyName: '株式会社テスト', representative: '代表取締役 山田 太郎',
    address: '東京都千代田区1-1', fiscalYearEnd: '2026-03',
  },
  format: BANK_FORMAT_DEFAULT,
};

function overviewOf(
  kpiActuals: readonly KpiActual[],
  sales: readonly SalesEntry[] = [],
  members = 1,
): BusinessOverview {
  return buildBusinessOverview({
    plan: 'pro',
    sales: [...sales],
    kpiActuals: [...kpiActuals],
    members: Array.from({ length: members }, () => ({ role: 'member' })) as never,
  });
}

function sheetOf(ov: BusinessOverview): BankSubmissionSheetModel {
  return buildBankSubmissionSheet({
    overview: ov,
    scorecard: buildManagementScorecard({
      operatingMarginPct: ov.kpi.operatingMarginPct ?? undefined,
      grossMarginPct: ov.kpi.grossMarginPct ?? undefined,
      safetyMarginPct: ov.kpi.safetyMargin ?? undefined,
    }),
    debtService: combineCashflowDebtService([], []),
    balanceSheetAsOf: '2026-03-31',
    today: '2026-09-22',
    settings: SETTINGS,
    manual: NO_MANUAL_OVERRIDES,
  });
}

/** 紙の上で「算定していない」を意味する字。**書面の冒頭の注記が宣言している値。** */
const BLANKS = new Set(['―', '—', '']);
const isBlank = (v: string): boolean => BLANKS.has(v);

const sectionOf = (m: BankSubmissionSheetModel, title: string) => {
  const sec = m.sections.find((s) => s.title.includes(title));
  expect(sec, `節「${title}」が書面に無い`).toBeDefined();
  return sec!;
};
const valueOf = (m: BankSubmissionSheetModel, title: string, label: string): string => {
  const r = sectionOf(m, title).rows.find((x) => x.label === label);
  expect(r, `${title} に行「${label}」が無い`).toBeDefined();
  return r!.value;
};

// --- ① 節の不変条件 (§7 を出した機械) -----------------------------------------

const STATES: readonly { readonly name: string; readonly ov: () => BusinessOverview }[] = [
  { name: '実績 0 件', ov: () => overviewOf([]) },
  { name: '実績 1 期・販売記録なし', ov: () => overviewOf([KPI('2026-08', 5_000_000)]) },
  { name: '実績 1 期・販売記録あり', ov: () => overviewOf([KPI('2026-08', 5_000_000)], ONE_SALE) },
  { name: '売上 0', ov: () => overviewOf([ZERO_REVENUE]) },
  { name: '限界利益 ≤ 0', ov: () => overviewOf([CONTRIBUTION_LE_0]) },
  { name: '従業員 0 名', ov: () => overviewOf([KPI('2026-08', 5_000_000)], ONE_SALE, 0) },
  {
    name: '実績 13 期 (成長の 3 指標すべて算定できる)',
    ov: () => overviewOf(Array.from({ length: 13 }, (_, i) =>
      KPI(`${2025 + Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, '0')}`, 1_000_000 + i * 100_000))),
  },
];

describe('★ 空欄を出す節は理由を持つ (金融機関等提出用の書面)', () => {
  it.each(STATES.map((s) => [s.name, s] as const))('%s', (_name, state) => {
    const m = sheetOf(state.ov());
    const silent = m.sections
      .filter((sec) => sec.rows.some((r) => isBlank(r.value)) && sec.caption === null)
      .map((sec) => sec.title);
    expect(silent, `空欄を出しているのに理由を述べていない節: ${silent.join(' / ')}`).toEqual([]);
  });

  it('★ 走査が空虚でない —— どの状態でも空欄を出す節が複数ある', () => {
    for (const state of STATES) {
      const m = sheetOf(state.ov());
      const withBlank = m.sections.filter((sec) => sec.rows.some((r) => isBlank(r.value)));
      // 実測 (2026-09-22): いちばん少ない状態でも 6 節。床は「黙って縮んだら落とす」ため。
      expect(withBlank.length, `${state.name}: 空欄を出す節が少なすぎる (針が実物に当たっていない)`)
        .toBeGreaterThanOrEqual(5);
    }
  });
});

// --- ② §2 販売の状況: 未入力を「0」と言わない ---------------------------------

describe('★ §2 は未入力の販売記録を「0」と刷らない', () => {
  it('記録が 1 件も無ければ 3 つの数値は空欄で、理由を述べる', () => {
    const m = sheetOf(overviewOf([KPI('2026-08', 5_000_000)]));
    expect(valueOf(m, '2. 販売の状況', '売上高（販売記録）')).toBe('―');
    expect(valueOf(m, '2. 販売の状況', '受注件数')).toBe('―');
    expect(valueOf(m, '2. 販売の状況', '販売チャネル数')).toBe('―');
    expect(sectionOf(m, '2. 販売の状況').caption).toContain('販売記録が未入力のため算定していません');
  });

  it('★ 対照: 記録が在れば値を刷り、断りは出さない', () => {
    const m = sheetOf(overviewOf([KPI('2026-08', 5_000_000)], ONE_SALE));
    expect(valueOf(m, '2. 販売の状況', '売上高（販売記録）')).toBe('500');
    expect(valueOf(m, '2. 販売の状況', '受注件数')).toBe('2件');
    expect(valueOf(m, '2. 販売の状況', '販売チャネル数')).toBe('1');
    expect(sectionOf(m, '2. 販売の状況').caption ?? '').not.toContain('販売記録が未入力');
  });

  it('★ 返品で合計が 0 になった月は「未入力」ではない (記録の件数で測る)', () => {
    const ov = overviewOf([KPI('2026-08', 5_000_000)], REFUNDED_TO_ZERO);
    expect(ov.sales.hasData).toBe(true);
    expect(ov.sales.totalAmount).toBe(0);
    const m = sheetOf(ov);
    // 合計は 0 だが**それが実績**なので刷る (`―` にすると測れなかったと読める)。
    expect(valueOf(m, '2. 販売の状況', '売上高（販売記録）')).toBe('0');
    expect(sectionOf(m, '2. 販売の状況').caption ?? '').not.toContain('販売記録が未入力');
  });

  it('★ 紙は画面の言い方をしない (面ごとに別の文)', () => {
    const sheetNote = noSalesRecordsSheetNote({ hasData: false, unreadableDates: 0, unreadableAmounts: 0 }) ?? '';
    const screenNote = noSalesRecordsNote({ hasData: false, unreadableDates: 0, unreadableAmounts: 0 }) ?? '';
    expect(sheetNote).not.toBe('');
    expect(screenNote).not.toBe('');
    // 画面は逃げ口を名指しする / 紙は「本表」の言い方で、画面の操作を指示しない。
    expect(screenNote).toContain('「売上集計」の画面');
    expect(sheetNote).not.toContain('画面');
    expect(noSalesRecordsSheetNote({ hasData: true, unreadableDates: 0, unreadableAmounts: 0 })).toBeNull();
    expect(noSalesRecordsNote({ hasData: true, unreadableDates: 0, unreadableAmounts: 0 })).toBeNull();
  });
});

// --- ③ §1 売上 0 の断りは空欄 3 つとも名指しする -------------------------------

describe('★ 売上 0 の断りは、空になる欄を落とさない', () => {
  it('損益分岐点売上高・限界利益率・安全余裕率の 3 つを名指しする', () => {
    const note = zeroRevenueRatioNote();
    // ★ 2026-09-22 まで名指しは 8 つの**比率**だけで、**損益分岐点売上高だけが
    //   漏れていた** (実測: §1 の空欄 9 行のうち 8 行だけが名指しされていた)。
    expect(note).toContain('損益分岐点売上高');
    expect(note).toContain('限界利益率');
    expect(note).toContain('安全余裕率');
  });

  it('その断りが書面と経営レポートの両方に届く', () => {
    const ov = overviewOf([ZERO_REVENUE]);
    const m = sheetOf(ov);
    expect(valueOf(m, '1. 損益の状況', '損益分岐点売上高')).toBe('―');
    expect(sectionOf(m, '1. 損益の状況').caption).toContain('損益分岐点売上高');
    const report = buildManagementReport(
      ov,
      buildManagementScorecard({ operatingMarginPct: ov.kpi.operatingMarginPct ?? undefined }),
      buildManagementHighlights(ov), '2026-08-31', NO_MANUAL_OVERRIDES,
    );
    expect(report).toContain('損益分岐点売上高');
  });
});

// --- ④ §7 成長性: しきい値は 3 つとも違う ------------------------------------

describe('★ §7 の断りは値から組む (しきい値を写さない)', () => {
  const periods = (n: number): readonly KpiActual[] =>
    Array.from({ length: n }, (_, i) =>
      KPI(`${2025 + Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, '0')}`, 1_000_000 + i * 100_000));

  // 実測 (2026-09-22): 前期比 / CAGR は 2 期から・売上トレンドは 4 期から
  // (移動平均の窓 3 + 1)・前年同月比は 13 期から。**1 つの数では説明できない。**
  it.each([
    [1, ['前期比売上高成長率', '平均成長率（CAGR）', '売上トレンド', '前年同月比']],
    [2, ['売上トレンド', '前年同月比']],
    [4, ['前年同月比']],
    [13, [] as string[]],
  ])('実績 %i 期 → 断りが名指しするのは %j', (n, expected) => {
    const ov = overviewOf(periods(n));
    const note = growthBlankSheetNote(ov.kpi) ?? '';
    const ALL = ['前期比売上高成長率', '平均成長率（CAGR）', '売上トレンド', '前年同月比'];
    const named = ALL.filter((label) => note.includes(label));
    expect(named).toEqual(expected);
    if (expected.length === 0) expect(growthBlankSheetNote(ov.kpi)).toBeNull();
  });

  it('★ 名指しした欄は実際に空欄で、名指ししなかった欄は値が在る', () => {
    for (const n of [1, 2, 4, 13]) {
      const m = sheetOf(overviewOf(periods(n)));
      const note = sectionOf(m, '7. 成長性').caption ?? '';
      for (const label of ['前期比売上高成長率', '平均成長率（CAGR）', '売上トレンド', '前年同月比']) {
        const blank = isBlank(valueOf(m, '7. 成長性', label));
        expect(note.includes(label), `${n} 期: 「${label}」は ${blank ? '空欄' : '値あり'} なのに断りが ${note.includes(label) ? '名指ししている' : '名指ししていない'}`)
          .toBe(blank);
      }
    }
  });

  it('★ 画面とレポートは成長の空欄そのものを出さないので、この文は要らない', () => {
    const ov = overviewOf(periods(1));
    const report = buildManagementReport(
      ov,
      buildManagementScorecard({ operatingMarginPct: ov.kpi.operatingMarginPct ?? undefined }),
      buildManagementHighlights(ov), '2026-08-31', NO_MANUAL_OVERRIDES,
    );
    // 実測 (2026-09-22): レポートは 4 つの label を 1 つも出さない (行ごと積まない)。
    for (const label of ['前期比', '平均成長率', '売上トレンド', '前年同月比', 'CAGR']) {
      expect(report, `レポートが「${label}」を出すなら、その空欄の理由も要る`).not.toContain(label);
    }
  });
});
