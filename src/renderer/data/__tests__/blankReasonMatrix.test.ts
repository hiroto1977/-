/** @vitest-environment jsdom */
/**
 * **空欄には理由を、しかも正しい理由を —— 面ごとに** (2026-09-22 · パス 389)。
 *
 * ## なぜ行列で見るのか
 *
 * 2026-09-21〜22 の 4 パスが**続けて同じ家系**から出た。どれも「算定できない状態」を
 * 面 (画面 / レポート / 書面) ごとに別の言い方で答えていたことが原因である:
 *
 * | パス | 面 | 何が起きていたか |
 * | --- | --- | --- |
 * | 382 | 画面 | 門を `staleDerived` (結果) に掛け、45 欄のうち **28 欄で断りが出なかった** |
 * | 386 | 画面 (KPI) | `∞` を値として刷り、**理由を 1 文も出さなかった** |
 * | 387 | **書面** | `―` だけで、**理由が書面のどこにも無かった** |
 * | 388 | 画面 | 理由は出したが**原因が違った** (売上 0 に「限界利益 ≤ 0」と言う) |
 *
 * 4 回とも**人が grep して見つけた**。共通の不変条件は 1 つで、面の側から数えれば
 * 機械にできる —— **ある状態で欄が空になるなら、その欄を出している面はすべて
 * 理由を出し、しかもその理由は原因を言い当てている**。
 *
 * ## 表の読み方
 *
 * 各 `state` は「欄を空にする状態」で、`cells` が面ごとの要求を持つ:
 *
 * - `kind: 'reason'` —— その面はこの文を**出す**。
 * - `kind: 'silent-but-correct'` —— その面は**その欄そのものを出さない**ので理由は
 *   要らない。**これは主張であって免除ではない** —— `absent` の綴りが本当に画面に
 *   無いことを確かめる (出すようになった日に鳴る)。
 * - `kind: 'wrong-reason-would-be'` —— **出してはいけない文**。パス 388 の欠陥は
 *   「理由が無い」ではなく「別の原因の文が出ていた」ことなので、**否定の側も要る**。
 *
 * **どの行も、このセッションで実測した事実だけを書いている** —— 測っていない面に
 * 「たぶん要らない」とは書かない (法則 `measure-before-claim`)。
 */
import 'fake-indexeddb/auto';
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { act, createElement, type ComponentType } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { SERVICES } from '../../services';
import { _resetRecordStoreForTests, getRecordStore } from '../store';
import { _resetCollectionSubscribersForTests } from '../useCollection';
import { buildBusinessOverview, type BusinessOverview } from '../overview';
import { buildManagementReport } from '../managementReport';
import { buildManagementHighlights } from '../managementHighlights';
import { buildBankSubmissionSheet, type BankSubmissionSettings } from '../bankSubmission';
import { combineCashflowDebtService } from '../cashflowDebtService';
import { buildManagementScorecard } from '../../../shared/managementScorecard';
import { BANK_FORMAT_DEFAULT } from '../../../shared/bankFormat';
import { NO_MANUAL_OVERRIDES } from '../overviewOverrides';
import {
  KPI_ACTUALS_COLLECTION,
  NO_BEP_REASON,
  ZERO_REVENUE_BEP_REASON,
  monthlyTrendSeries,
  readablePeriodRows,
  summarizeFundamentals,
  zeroMembersPerCapitaNote,
  zeroRevenueRatioNote,
  type KpiActual,
} from '../kpiActuals';
import {
  SALES_COLLECTION,
  duplicateOrdersNote,
  duplicateOrdersOverviewNote,
  duplicateOrdersSheetNote,
  findDuplicateOrders,
  type SalesEntry,
} from '../sales';
import { waitForText } from '../../__tests__/jsdomWait';

// --- 状態を作る見本 -----------------------------------------------------------

/** 限界利益 ≤ 0 (売上 100 万・変動費 120 万・固定費 30 万)。損益分岐点が存在しない。 */
const CONTRIBUTION_LE_0: KpiActual = {
  period: '2026-08', unit: '全社',
  revenue: 1_000_000, cogs: 1_200_000, advertising: 0, sga: 300_000, depreciation: 0,
};
/** 売上 0 で費用だけ (売上前・取り込み前)。比率が空になるが**原因は別**。 */
const ZERO_REVENUE: KpiActual = {
  period: '2026-08', unit: '全社',
  revenue: 0, cogs: 0, advertising: 0, sga: 300_000, depreciation: 0,
};

/**
 * **同じ (期, 事業) が 2 件** —— 利用者が二重に入力した形。欄は空にならず、
 * **金額が合算されて倍になる**。空欄より重い: 空欄は気付くが、倍の金額は正しく見える。
 */
/**
 * **同じ注文名が 2 件** —— 販売記録の側の同じ家系 (パス 391)。`totalAmount` が
 * 500,000 → 1,000,000・`totalOrders` が 1 → 2 になる (実測)。
 */
const DUPLICATE_ORDERS: readonly SalesEntry[] = [
  { date: '2026-08-01', channel: 'shopify', amount: 500_000, orders: 1, note: 'Shopify #1001' },
  { date: '2026-08-01', channel: 'shopify', amount: 500_000, orders: 1, note: 'Shopify #1001' },
];

const DUPLICATE_ACTUALS: readonly KpiActual[] = [
  { period: '2026-08', unit: '全社', revenue: 1_000_000, cogs: 400_000, advertising: 0, sga: 200_000, depreciation: 0 },
  { period: '2026-08', unit: '全社', revenue: 1_000_000, cogs: 400_000, advertising: 0, sga: 200_000, depreciation: 0 },
];

/**
 * **期が読めない行** (パス 392)。書き手は `YYYY-MM` を強制するが保管層の形は
 * `period: str` だけなので、復元や古い版の控えはこういう行を持ち込める
 * (`collectionShapes.ts` の `KPI_SHAPE` で実測)。読める 2 件 + 読めない 1 件 ——
 * 月次推移が出る (`length >= 2`) 状態にしておくと「`bad` の行が並ばない」を見られる。
 */
const UNREADABLE_PERIODS: readonly KpiActual[] = [
  { period: '2026-07', unit: '全社', revenue: 1_000_000, cogs: 400_000, advertising: 0, sga: 200_000, depreciation: 0 },
  { period: '2026-08', unit: '全社', revenue: 1_200_000, cogs: 400_000, advertising: 0, sga: 200_000, depreciation: 0 },
  { period: 'bad', unit: '全社', revenue: 9_999_999, cogs: 0, advertising: 0, sga: 0, depreciation: 0 } as unknown as KpiActual,
];

type Surface = 'screen-overview' | 'screen-kpi' | 'screen-sales' | 'report' | 'sheet';

type Cell =
  /** この面はこの文を出す。 */
  | { readonly surface: Surface; readonly kind: 'reason'; readonly contains: string }
  /** この面はその欄を出さないので理由は要らない (`absent` が無いことを確かめる)。 */
  | { readonly surface: Surface; readonly kind: 'silent-but-correct'; readonly absent: string; readonly why: string }
  /** この面がこの文を出してはいけない (別の原因の文)。 */
  | { readonly surface: Surface; readonly kind: 'wrong-reason-would-be'; readonly forbidden: string };

interface Row {
  readonly state: string;
  /** この状態を作る KPI 実績 (複数行の状態も在る)。 */
  readonly rows: readonly KpiActual[];
  /** この状態を作る販売記録 (売上の側の状態だけが使う)。 */
  readonly salesRows?: readonly SalesEntry[];
  readonly members: number;
  readonly cells: readonly Cell[];
  readonly why: string;
}

const MATRIX: readonly Row[] = [
  {
    state: 'contribution-le-0',
    rows: [CONTRIBUTION_LE_0],
    members: 1,
    why: '限界利益 ≤ 0。どれだけ売っても固定費を回収できない —— 事業として最も重い状態で、損益分岐点と安全余裕率が空になる (パス 386 / 387)',
    cells: [
      { surface: 'screen-overview', kind: 'reason', contains: NO_BEP_REASON },
      { surface: 'screen-kpi', kind: 'reason', contains: NO_BEP_REASON },
      // レポートは BEP の行では述べず、経営ハイライトの critical 所見で述べる (実測)。
      { surface: 'report', kind: 'reason', contains: '限界利益が 0 以下で、売上をいくら伸ばしても固定費を回収できません' },
      { surface: 'sheet', kind: 'reason', contains: '限界利益が 0 以下のため、損益分岐点売上高と安全余裕率は算定していません' },
      // どの面も「売上が 0」とは言わない (売上は在る)。
      { surface: 'screen-overview', kind: 'wrong-reason-would-be', forbidden: ZERO_REVENUE_BEP_REASON },
      { surface: 'sheet', kind: 'wrong-reason-would-be', forbidden: zeroRevenueRatioNote() },
    ],
  },
  {
    state: 'zero-revenue',
    rows: [ZERO_REVENUE],
    members: 1,
    why: '売上 0 で費用だけ。比率と損益分岐点が空になるが、原因は「限界利益 ≤ 0」ではなく「売上がまだ無い」 —— パス 388 で画面がここを取り違えていた',
    cells: [
      { surface: 'screen-overview', kind: 'reason', contains: ZERO_REVENUE_BEP_REASON },
      { surface: 'screen-kpi', kind: 'reason', contains: ZERO_REVENUE_BEP_REASON },
      { surface: 'report', kind: 'reason', contains: zeroRevenueRatioNote() },
      { surface: 'sheet', kind: 'reason', contains: zeroRevenueRatioNote() },
      // ★ パス 388 の欠陥そのもの: 画面が限界利益の文を出していた。
      { surface: 'screen-overview', kind: 'wrong-reason-would-be', forbidden: NO_BEP_REASON },
      { surface: 'screen-kpi', kind: 'wrong-reason-would-be', forbidden: NO_BEP_REASON },
    ],
  },
  {
    state: 'no-members',
    rows: [CONTRIBUTION_LE_0],
    members: 0,
    why: '従業員 0 名。一人当たりの 3 行が空になる —— ただし空欄を出すのは書面だけで、画面とレポートは枠ごと出さない (実測・パス 388)',
    cells: [
      { surface: 'sheet', kind: 'reason', contains: zeroMembersPerCapitaNote() },
      {
        surface: 'report', kind: 'silent-but-correct', absent: '一人当たり',
        why: 'レポートは一人当たりの行を 1 つも出さない (実測 showsPerCapitaRow=false)。空欄が無いので理由も要らない',
      },
      {
        surface: 'screen-overview', kind: 'silent-but-correct', absent: '一人当たり売上',
        why: '画面は「生産性 (一人当たり)」の枠を `revenuePerCapita !== null` で丸ごと隠す。空欄が無いので理由も要らない',
      },
    ],
  },
  {
    state: 'duplicate-actuals',
    rows: DUPLICATE_ACTUALS,
    members: 1,
    why: '同じ (期, 事業) が 2 件 —— 欄は空にならず**金額が合算されて倍になる**。実測で `revenue` が 1,000,000 → 2,000,000 になり、書面とレポートは述べるのに経営サマリーだけが黙って倍の金額を刷っていた (パス 390)',
    cells: [
      { surface: 'screen-overview', kind: 'reason', contains: 'この画面の金額はその合算値です' },
      { surface: 'screen-kpi', kind: 'reason', contains: '合算されています' },
      { surface: 'report', kind: 'reason', contains: '本表の金額はその合算値です' },
      { surface: 'sheet', kind: 'reason', contains: '本表の金額はその合算値です' },
      // ★ 面ごとに直し方の案内が違う —— 経営サマリーには一覧が無いので
      //   「一覧の ×」と言ってはいけない (その画面に無い物を指す)。
      { surface: 'screen-overview', kind: 'wrong-reason-would-be', forbidden: '一覧の × で余分な行を消してください' },
    ],
  },
  {
    state: 'duplicate-orders',
    rows: [],
    salesRows: DUPLICATE_ORDERS,
    members: 1,
    why: '同じ注文名が 2 件 —— 販売記録の側の同じ家系。実測で `totalAmount` が 500,000 → 1,000,000・`totalOrders` が 1 → 2 になり、書面 §2 は述べるのに経営サマリーだけが黙って倍の金額を刷っていた (パス 391)。**KPI 実績の側 (パス 390) を直しても、こちらは別の入力なので残っていた**',
    cells: [
      { surface: 'screen-overview', kind: 'reason', contains: 'この画面の総売上・総注文件数はその重複を 2 度数えた値です' },
      { surface: 'screen-sales', kind: 'reason', contains: '売上高と受注件数に 2 度数えられています' },
      { surface: 'sheet', kind: 'reason', contains: '売上高と受注件数はその重複を含んだ値です' },
      {
        surface: 'report', kind: 'silent-but-correct', absent: '注文名',
        why: '経営レポートは販売記録の節そのものを持たない (実測: 総売上・総注文件数・販売記録のどれも出ない)。重複した値を 1 つも刷らないので述べる必要が無い',
      },
      // ★ パス 390 と同じ —— 経営サマリーに一覧は無いので「一覧の ×」と言ってはいけない。
      { surface: 'screen-overview', kind: 'wrong-reason-would-be', forbidden: '一覧の × で余分な行を消してください' },
    ],
  },
  {
    state: 'unreadable-periods',
    rows: UNREADABLE_PERIODS,
    members: 1,
    why: '期 (YYYY-MM) が読めない行が 1 件 —— **パス 390 / 391 の裏返し**で、落ちた行は集計から除かれるので画面の金額は利用者の記録より**小さく**出る。書面・レポート・KPI 画面は述べるのに経営サマリーは読み手を 0 件しか持たず、しかも月次推移と損益感度分析が**漏斗を通さず**同じ画面に 3 つ目・2 つ目の答えを出していた (パス 392)',
    cells: [
      { surface: 'screen-overview', kind: 'reason', contains: '期 (YYYY-MM) が読めないため' },
      { surface: 'screen-kpi', kind: 'reason', contains: '期 (YYYY-MM) が読めないため' },
      { surface: 'report', kind: 'reason', contains: '期 (YYYY-MM) が読めない' },
      { surface: 'sheet', kind: 'reason', contains: '期 (YYYY-MM) が読めない' },
    ],
  },
];

// --- 面を作る -----------------------------------------------------------------

beforeAll(() => {
  (globalThis as unknown as { serviceHub: unknown }).serviceHub = {
    getVersion: () => Promise.resolve('0.1.0-web'),
    listConfigured: () => Promise.resolve([]),
    fetchSnapshot: () => Promise.resolve({ ok: false, code: 'x', message: 'x' }),
    invoke: () => Promise.resolve({ ok: false, code: 'x', message: 'x' }),
    openExternal: () => Promise.resolve(),
    oauthSupported: () => Promise.resolve(false),
    setToken: () => Promise.resolve(),
    clearToken: () => Promise.resolve(),
  };
});

let container: HTMLDivElement;
let root: Root | null = null;
const screenText = (): string => (container.textContent ?? '').replace(/\s+/g, ' ');

type ScreenSurface = 'screen-overview' | 'screen-kpi' | 'screen-sales';

const PAGE: Record<ScreenSurface, ComponentType> = {
  'screen-overview': SERVICES.find((s) => s.id === 'overview')!.page,
  'screen-kpi': SERVICES.find((s) => s.id === 'kpi')!.page,
  'screen-sales': SERVICES.find((s) => s.id === 'sales')!.page,
};

/**
 * この行の状態を保管層へ置く。**画面はどちらの入力も購読している**ので、
 * KPI 実績と販売記録の両方を置く (行が持っていない側は 0 件)。
 */
async function seedFor(row: Row): Promise<void> {
  const store = getRecordStore();
  for (const r of row.rows) await store.insert(KPI_ACTUALS_COLLECTION, r);
  for (const r of row.salesRows ?? []) await store.insert(SALES_COLLECTION, r);
}

/** 画面を描き、**その状態でだけ出る印**を待つ (ラベルで待つと届く前に測る・パス 388)。 */
async function renderScreen(which: ScreenSurface, waitFor: string): Promise<string> {
  root = createRoot(container);
  await act(async () => {
    root!.render(createElement(PAGE[which]));
  });
  await waitForText(screenText, waitFor);
  return screenText();
}

function overviewFor(row: Row): BusinessOverview {
  const members = Array.from({ length: row.members }, () => ({ role: 'member' }));
  return buildBusinessOverview({
    plan: 'pro', sales: [...(row.salesRows ?? [])], kpiActuals: [...row.rows], members: members as never,
  });
}

function reportFor(row: Row): string {
  const ov = overviewFor(row);
  const sc = buildManagementScorecard({
    operatingMarginPct: ov.kpi.operatingMarginPct ?? undefined,
    safetyMarginPct: ov.kpi.safetyMargin ?? undefined,
  });
  return buildManagementReport(ov, sc, buildManagementHighlights(ov), '2026-08-31', NO_MANUAL_OVERRIDES);
}

const SETTINGS: BankSubmissionSettings = {
  profile: {
    companyName: '株式会社テスト', representative: '代表取締役 山田 太郎',
    address: '東京都千代田区1-1', fiscalYearEnd: '2026-03',
  },
  format: BANK_FORMAT_DEFAULT,
};

function sheetTextFor(row: Row): string {
  const ov = overviewFor(row);
  const m = buildBankSubmissionSheet({
    overview: ov,
    scorecard: buildManagementScorecard({
      operatingMarginPct: ov.kpi.operatingMarginPct ?? undefined,
      grossMarginPct: ov.kpi.grossMarginPct ?? undefined,
    }),
    // 返済の入力は無し —— この行列が見るのは「空欄の理由」なので、空で足りる
    // (`combineCashflowDebtService` は accounting が空なら null を返す)。
    debtService: combineCashflowDebtService([], []),
    balanceSheetAsOf: '2026-03-31',
    today: '2026-09-22',
    settings: SETTINGS,
    manual: NO_MANUAL_OVERRIDES,
  });
  return JSON.stringify(m);
}

beforeEach(async () => {
  _resetRecordStoreForTests();
  _resetCollectionSubscribersForTests();
  await new Promise<void>((r) => {
    const req = indexedDB.deleteDatabase('business-hub-data');
    req.onsuccess = () => r(); req.onerror = () => r(); req.onblocked = () => r();
  });
  container = document.createElement('div');
  document.body.appendChild(container);
});

afterEach(async () => {
  if (root) {
    await act(async () => { root!.unmount(); });
    root = null;
  }
  container.remove();
});

// --- 表そのものの健全さ -------------------------------------------------------

describe('空欄の理由の行列 — 表が痩せていない', () => {
  it('★ どの状態も 4 面のうち 2 面以上について何かを述べている', () => {
    for (const row of MATRIX) {
      const surfaces = new Set(row.cells.map((c) => c.surface));
      expect(surfaces.size, `${row.state}: 面が 1 つしか無い`).toBeGreaterThanOrEqual(2);
      expect(row.why.length, `${row.state}: 理由が短すぎる`).toBeGreaterThan(20);
    }
  });

  it('★ 同じ (状態, 面) に「出す」と「出してはいけない」が同じ文で並んでいない', () => {
    for (const row of MATRIX) {
      for (const c of row.cells) {
        if (c.kind !== 'wrong-reason-would-be') continue;
        const positives = row.cells.filter(
          (o) => o.surface === c.surface && o.kind === 'reason',
        ) as Extract<Cell, { kind: 'reason' }>[];
        for (const p of positives) {
          expect(p.contains, `${row.state}/${c.surface}: 同じ文を出すと禁じている`).not.toBe(c.forbidden);
        }
      }
    }
  });

  it('★ 2 つの原因の文は別物 (どちらかに畳んだら片方の原因が言えない)', () => {
    expect(ZERO_REVENUE_BEP_REASON).not.toBe(NO_BEP_REASON);
    expect(zeroRevenueRatioNote()).not.toBe(zeroMembersPerCapitaNote());
  });
});

// --- 面ごとに実際に作って当てる -----------------------------------------------

describe.each(MATRIX.map((r) => [r.state, r] as const))(
  '空欄の理由: %s',
  (_state, row) => {
    const cells = (s: Surface) => row.cells.filter((c) => c.surface === s);

    it('★ 書面', () => {
      const t = sheetTextFor(row);
      for (const c of cells('sheet')) {
        if (c.kind === 'reason') expect(t, `書面が「${c.contains}」を述べていない`).toContain(c.contains);
        if (c.kind === 'wrong-reason-would-be') expect(t, '書面が別の原因の文を出している').not.toContain(c.forbidden);
        if (c.kind === 'silent-but-correct') expect(t, `書面に「${c.absent}」が出ている (${c.why})`).not.toContain(c.absent);
      }
    });

    it('★ 経営レポート', () => {
      const t = reportFor(row);
      for (const c of cells('report')) {
        if (c.kind === 'reason') expect(t, `レポートが「${c.contains}」を述べていない`).toContain(c.contains);
        if (c.kind === 'wrong-reason-would-be') expect(t, 'レポートが別の原因の文を出している').not.toContain(c.forbidden);
        if (c.kind === 'silent-but-correct') expect(t, `レポートに「${c.absent}」が出ている (${c.why})`).not.toContain(c.absent);
      }
    });

    it('★ 経営サマリーの画面', async () => {
      const mine = cells('screen-overview');
      if (mine.length === 0) return;
      await seedFor(row);
      // 錠は**その状態でだけ出る文** —— 肯定の cell が在ればそれ、無ければ
      // 「この状態でも必ず描かれる物」(損益分岐点のタイル) を待つ。
      const positive = mine.find((c) => c.kind === 'reason');
      const t = await renderScreen(
        'screen-overview',
        positive !== undefined && positive.kind === 'reason' ? positive.contains : '損益分岐点 (BEP)',
      );
      for (const c of mine) {
        if (c.kind === 'reason') expect(t, `画面が「${c.contains}」を述べていない`).toContain(c.contains);
        if (c.kind === 'wrong-reason-would-be') expect(t, '画面が別の原因の文を出している').not.toContain(c.forbidden);
        if (c.kind === 'silent-but-correct') expect(t, `画面に「${c.absent}」が出ている (${c.why})`).not.toContain(c.absent);
      }
    });

    it('★ KPI 実績の画面', async () => {
      const mine = cells('screen-kpi');
      if (mine.length === 0) return;
      await seedFor(row);
      const positive = mine.find((c) => c.kind === 'reason');
      const t = await renderScreen(
        'screen-kpi',
        positive !== undefined && positive.kind === 'reason' ? positive.contains : '損益分岐点 (BEP)',
      );
      for (const c of mine) {
        if (c.kind === 'reason') expect(t, `KPI 画面が「${c.contains}」を述べていない`).toContain(c.contains);
        if (c.kind === 'wrong-reason-would-be') expect(t, 'KPI 画面が別の原因の文を出している').not.toContain(c.forbidden);
        if (c.kind === 'silent-but-correct') expect(t, `KPI 画面に「${c.absent}」が出ている (${c.why})`).not.toContain(c.absent);
      }
    });

    it('★ 売上集計の画面', async () => {
      const mine = cells('screen-sales');
      if (mine.length === 0) return;
      await seedFor(row);
      // 錠は**その状態でだけ出る文** —— 「総売上」の見出しは記録が届く前から
      // 出ているので待てない (パス 376 / 390 で 2 度踏んだ形)。
      const positive = mine.find((c) => c.kind === 'reason');
      if (positive === undefined || positive.kind !== 'reason') {
        throw new Error('screen-sales の行に肯定の cell が無い —— 何を待てばよいか決まらない');
      }
      const t = await renderScreen('screen-sales', positive.contains);
      for (const c of mine) {
        if (c.kind === 'reason') expect(t, `売上画面が「${c.contains}」を述べていない`).toContain(c.contains);
        if (c.kind === 'wrong-reason-would-be') expect(t, '売上画面が別の原因の文を出している').not.toContain(c.forbidden);
        if (c.kind === 'silent-but-correct') expect(t, `売上画面に「${c.absent}」が出ている (${c.why})`).not.toContain(c.absent);
      }
    });
  },
);

/**
 * ★ **同じ画面が同じ量について 2 つ以上の答えを出さない** (2026-09-22 · パス 392)。
 *
 * これは「空欄の理由」ではなく**値そのもの**の話だが、原因は同じ家系である ——
 * **同じ事実を読む口が複数在り、全部が同じ漏斗を通っていない**。
 *
 * 実測 (読める 1 件 100 万 + 期が `'bad'` の 1 件 999 万 9,999):
 *
 * | 読み手 | 売上高 | 漏斗 |
 * | --- | --- | --- |
 * | `buildBusinessOverview` → 収益性 (KPI) のタイル | **1,000,000** | `readablePeriodRows` |
 * | `summarizeFundamentals(素の購読)` → 損益感度分析 | **10,999,999** | **無し** |
 * | `monthlyTrendSeries(素の購読)` → 月次推移 | 期が `bad` の行・前期比 **+900%** | **無し** |
 *
 * いちばん重いのは月次推移で、**アプリ自身が「読めない」と宣言した期に対して
 * 成長率を計算していた**。しかもその trend は `buildManagementReport` へ渡るので、
 * レポートは「期 (YYYY-MM) が読めない 1 件は集計から除いています」と述べながら
 * 同じ紙に `bad` の行と ￥9,999,999 を刷っていた (実測で 3 つとも true) ——
 * **自分の断りと矛盾する紙**である。
 *
 * ここは**画面を実際に描いて**見る (`.tsx` は変異検査の対象外なので、
 * 漏斗を外しても他の誰も鳴らない)。
 */
describe('★ 同じ画面の読み手が同じ漏斗を通る (パス 392)', () => {
  const ROW: Row = { state: 'unreadable-periods', rows: UNREADABLE_PERIODS, members: 1, why: 'x', cells: [] };

  it('★ 標本: 期が読めない行は保管層に入る (入らなければ以下は空虚)', async () => {
    await seedFor(ROW);
    const stored = await getRecordStore().list<KpiActual>(KPI_ACTUALS_COLLECTION);
    expect(stored.map((r) => r.data.period).sort()).toEqual(['2026-07', '2026-08', 'bad']);
  });

  it('★ 月次推移に「読めない期」の行が並ばない (成長率も計算しない)', async () => {
    await seedFor(ROW);
    const t = await renderScreen('screen-overview', '月次推移');
    // 肯定の前提: 読める 2 期は並んでいる (表そのものが消えていたら空虚)。
    expect(t, '読める期が月次推移に出ていない —— 表が消えている').toContain('2026-07');
    expect(t).toContain('2026-08');
    // 直す前は `bad￥9,999,999￥9,999,999100.0%+900%` が並んでいた。
    expect(t, '期が読めない行が月次推移に並んでいる').not.toContain('9,999,999');
  });

  it('★ 損益感度分析の現状値が、収益性のタイルと同じ売上高を使う', async () => {
    await seedFor(ROW);
    // 錠は感度分析の見出し —— タイルより後に描かれる。
    const t = await renderScreen('screen-overview', '損益感度分析');
    // 読める 2 件の和 = 2,200,000。直す前は 12,199,999 (999 万 9,999 を含む) だった。
    expect(t, '感度分析が漏斗を通っていない (読めない行の額が入っている)').toContain('￥2,200,000');
    expect(t).not.toContain('12,199,999');
  });

  it('★ 対照の標本: 漏斗を通さなければ答えが割れる (この検査が空虚でないこと)', () => {
    const raw = [...UNREADABLE_PERIODS];
    const readable = readablePeriodRows(raw);
    expect(readable.dropped, '走査が 1 件も落としていない').toBe(1);
    // **漏斗の有無で答えが違う**ことを、製品を壊さずに標本で示す。
    expect(summarizeFundamentals(raw).revenue).toBe(12_199_999);
    expect(summarizeFundamentals(readable.rows).revenue).toBe(2_200_000);
    expect(monthlyTrendSeries(raw).map((r) => r.period)).toContain('bad');
    expect(monthlyTrendSeries(readable.rows).map((r) => r.period)).not.toContain('bad');
  });
});

/**
 * ★ **文面が面ごとに本当に違うことを、関数の側からも留める** (パス 391)。
 *
 * 行列は「画面がこの文を出す」を見るが、**3 つの文が同じ物になったら**
 * 行列の主張は満たされたまま「一覧の ×」が経営サマリーへ戻りうる
 * (`wrong-reason-would-be` が 1 つの面しか見ていないため)。
 * だから関数そのものの非対称も別に主張する。
 */
describe('★ 重複の断りは面ごとに別の文 (パス 390 / 391)', () => {
  const groups = findDuplicateOrders([...DUPLICATE_ORDERS]);

  it('★ 標本: 走査が実際に 1 組を見つけている (見つけていなければ以下は空虚)', () => {
    expect(groups).toEqual([{ ref: 'Shopify #1001', count: 2 }]);
  });

  it('★ 売上画面の文は「一覧の ×」を言い、経営サマリーの文は言わない', () => {
    const sales = duplicateOrdersNote(groups);
    const overview = duplicateOrdersOverviewNote(groups);
    expect(sales).not.toBeNull();
    expect(overview).not.toBeNull();
    expect(sales!).toContain('一覧の × で余分な行を消してください');
    // 経営サマリーには一覧が無い —— 代わりに**どの画面で消すか**を名指しする。
    expect(overview!).not.toContain('一覧の ×');
    expect(overview!).toContain('「売上集計」の画面');
    expect(overview).not.toBe(sales);
  });

  it('★ 重複が無ければ 3 つとも null (出しっぱなしにしない)', () => {
    expect(duplicateOrdersNote([])).toBeNull();
    expect(duplicateOrdersOverviewNote([])).toBeNull();
    expect(duplicateOrdersSheetNote([])).toBeNull();
  });
});
