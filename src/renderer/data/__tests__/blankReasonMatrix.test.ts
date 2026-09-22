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
  zeroMembersPerCapitaNote,
  zeroRevenueRatioNote,
  type KpiActual,
} from '../kpiActuals';
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

type Surface = 'screen-overview' | 'screen-kpi' | 'report' | 'sheet';

type Cell =
  /** この面はこの文を出す。 */
  | { readonly surface: Surface; readonly kind: 'reason'; readonly contains: string }
  /** この面はその欄を出さないので理由は要らない (`absent` が無いことを確かめる)。 */
  | { readonly surface: Surface; readonly kind: 'silent-but-correct'; readonly absent: string; readonly why: string }
  /** この面がこの文を出してはいけない (別の原因の文)。 */
  | { readonly surface: Surface; readonly kind: 'wrong-reason-would-be'; readonly forbidden: string };

interface Row {
  readonly state: string;
  readonly kpi: KpiActual;
  readonly members: number;
  readonly cells: readonly Cell[];
  readonly why: string;
}

const MATRIX: readonly Row[] = [
  {
    state: 'contribution-le-0',
    kpi: CONTRIBUTION_LE_0,
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
    kpi: ZERO_REVENUE,
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
    kpi: CONTRIBUTION_LE_0,
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

const PAGE: Record<'screen-overview' | 'screen-kpi', ComponentType> = {
  'screen-overview': SERVICES.find((s) => s.id === 'overview')!.page,
  'screen-kpi': SERVICES.find((s) => s.id === 'kpi')!.page,
};

/** 画面を描き、**その状態でだけ出る印**を待つ (ラベルで待つと届く前に測る・パス 388)。 */
async function renderScreen(which: 'screen-overview' | 'screen-kpi', waitFor: string): Promise<string> {
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
    plan: 'pro', sales: [], kpiActuals: [row.kpi], members: members as never,
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
      await getRecordStore().insert(KPI_ACTUALS_COLLECTION, row.kpi);
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
      await getRecordStore().insert(KPI_ACTUALS_COLLECTION, row.kpi);
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
  },
);
