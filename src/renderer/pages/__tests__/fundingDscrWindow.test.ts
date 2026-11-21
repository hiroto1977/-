/** @vitest-environment jsdom */
/**
 * **資金調達レーダーの「返済余力」が、測れた期間について述べる** (2026-09-12 · パス 182)。
 *
 * 返済予定は借入期間ぶん将来へ伸びるのに、会計ソフト連携の月次CF は過去しか無い。
 * 直す前は残りの月を「営業CF 0」として割り、**DSCR 0.53・最悪月 0.00・
 * 不足 89 か月**と刷ったうえで赤い警告まで点けていた
 * (同じデータで経営サマリーは DSCR 9.03 = 返済余力十分と出す)。
 *
 * 計算の側は `shared/__tests__/funding.test.ts` と `main/clients/__tests__/funding.test.ts`
 * が対照つきで留めている。ここは**画面**を見る —— 直した値が実際に描かれ、
 * 突合できた期間が読め、誤った警告が出ないこと (パス 175 で踏んだ
 * 「直した側と画面の間が切れている」を作らない)。
 */
import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { FundingPage } from '../FundingPage';
import { SNAPSHOT } from '../../data/snapshot';
import { settleUntil } from '../../__tests__/jsdomWait';
import {
  aggregateByKind,
  barData,
  cashRunway,
  debtServiceMetrics,
  expectedScenario,
  fundingCostMetrics,
  fundingDiversification,
  fundingQualityScore,
  fundingTermStructure,
  monthlyFlow,
  radarScores,
  scenarioRunways,
  summarize,
  type FundingItem,
} from '../../../shared/funding';

/** 同梱の見本と同じ 2 本の借入 (民間 60 回 + 公庫 84 回・据置 6 か月)。 */
const LOANS: FundingItem[] = [
  {
    id: 'f-bank', kind: 'loan', name: '民間金融機関 運転資金融資', amount: 10_000_000,
    status: 'received', month: '2026-02', repayable: true,
    repayment: { annualRate: 0.022, months: 60, startMonth: '2026-03' },
  },
  {
    id: 'f-jfc', kind: 'jfc', name: '公庫 新規開業資金', amount: 6_000_000,
    status: 'approved', month: '2026-05', repayable: true,
    repayment: { annualRate: 0.012, months: 84, startMonth: '2026-06', gracePeriodMonths: 6, graceInterestHandling: 'compound' },
  },
];

/** 会計ソフト連携の実績 6 か月 (2026-01..06)。 */
const ACCOUNTING = new Map([
  ['2026-01', 1_200_000], ['2026-02', 1_350_000], ['2026-03', 1_580_000],
  ['2026-04', 1_410_000], ['2026-05', 1_650_000], ['2026-06', 1_720_000],
]);

/**
 * 画面が受け取る payload を、共有の純粋関数から組む。
 *
 * `main/clients/funding.ts` の `buildFundingSnapshot` と同じ部品を使う
 * (renderer から main は型しか読めないため実装は呼べない)。欄の抜けは
 * 同梱スナップショットを土台にして埋める。
 */
function payload(accounting: ReadonlyMap<string, number> | undefined): typeof SNAPSHOT.funding {
  const byKind = aggregateByKind(LOANS);
  const monthly = monthlyFlow(LOANS, { accountingCashflow: accounting });
  const summary = summarize(LOANS);
  return {
    ...SNAPSHOT.funding,
    items: LOANS,
    byKind,
    radar: radarScores(byKind),
    monthly,
    bars: barData(byKind),
    summary,
    runway: cashRunway(monthly, 5_000_000),
    scenario: expectedScenario(LOANS),
    scenarioRunways: scenarioRunways(LOANS, { openingBalance: 5_000_000, accountingCashflow: accounting }),
    qualityScore: fundingQualityScore(summary),
    diversification: fundingDiversification(byKind),
    termStructure: fundingTermStructure(LOANS),
    debtService: debtServiceMetrics(monthly),
    costMetrics: fundingCostMetrics(LOANS, summary),
    accountingLinked: (accounting?.size ?? 0) > 0,
  } as typeof SNAPSHOT.funding;
}

let container: HTMLDivElement;
let root: Root | null = null;

function install(data: typeof SNAPSHOT.funding): void {
  (globalThis as unknown as { serviceHub: unknown }).serviceHub = {
    getVersion: () => Promise.resolve('0.1.0-web'),
    listConfigured: () => Promise.resolve(['funding']),
    fetchSnapshot: () => Promise.resolve({ ok: true, data }),
    invoke: () => Promise.resolve({ ok: true, data: {} }),
    openExternal: () => Promise.resolve(),
    oauthSupported: () => Promise.resolve(false),
    setToken: () => Promise.resolve(),
    clearToken: () => Promise.resolve(),
  };
}

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
});

afterEach(async () => {
  if (root) {
    const r = root;
    root = null;
    await act(async () => {
      r.unmount();
    });
  }
  container.remove();
});

/** 画面を描き、取得した payload が反映されるまで待つ。 */
async function mount(): Promise<string> {
  root = createRoot(container);
  await act(async () => {
    root!.render(createElement(FundingPage));
  });
  await settleUntil(
    () => container.textContent?.includes('返済余力 (DSCR)') === true,
    '返済余力の節が描かれる',
  );
  return container.textContent ?? '';
}

describe('FundingPage 返済余力 — 突合できた期間を述べる (パス 182)', () => {
  it('★ 会計連携が 6 か月・返済が 93 か月なら、突合した 4 か月を明示する', async () => {
    const data = payload(ACCOUNTING);
    install(data);
    const text = await mount();
    expect(data.debtService.coveredMonths).toBe(4);
    expect(data.debtService.unmatchedMonths).toBe(89);
    // 不足月は「突合できた月のうち」で、分母を添えて刷る。
    expect(text).toContain('カバー率1.0未満の月 0／4 か月');
    const note = container.querySelector('[data-funding-dscr-window]')?.textContent ?? '';
    expect(note).toContain('突合できた 4 か月');
    expect(note, '未突合の月数を述べていない').toContain('89 か月分');
  });

  it('★ 誤った警告を出さない (直す前は 0.53 で ⚠️ が点いていた)', async () => {
    install(payload(ACCOUNTING));
    const text = await mount();
    expect(text, '算定不能な月を混ぜた警告が出ている').not.toContain('営業CFが返済を下回っています');
    // 実績のある 4 か月では 9 倍台でカバーできている。
    expect(text).toMatch(/= 9\.\d\d/);
  });

  it('★ 対照: 実測で 1.0 を下回れば警告は出る (警告そのものが死んでいない)', async () => {
    // **鳴らない対照は「合格」ではない。** 突合できた月の営業CF を実測で
    // 下げると、同じ画面が警告を出すことを見る。
    const thin = new Map([...ACCOUNTING].map(([m]) => [m, 10_000] as const));
    install(payload(new Map(thin)));
    const text = await mount();
    expect(text).toContain('営業CFが返済を下回っています');
    expect(text).toContain('カバー率1.0未満の月 4／4 か月');
  });

  it('★ 会計未連携なら「算定できません」と述べ、数字を出さない', async () => {
    const data = payload(undefined);
    install(data);
    const text = await mount();
    expect(data.debtService.overallDscr).toBeNull();
    expect(text).toContain('返済余力は算定できません');
    expect(text).toContain('会計ソフト連携時に算定されます');
    expect(text, '算定不能なのに警告を出している').not.toContain('営業CFが返済を下回っています');
    // 「—」で刷る (0.00 を出さない)。
    expect(text).toContain('= —');
    expect(text).not.toContain('= 0.00');
  });

  it('★ ランウェイは営業CF 0 の前提を述べる (黙って保守側に倒さない)', async () => {
    install(payload(ACCOUNTING));
    await mount();
    const note = container.querySelector('[data-funding-runway-assumption]')?.textContent ?? '';
    expect(note).toContain('営業CF を 0 として');
    expect(note).toContain('保守側');
  });

  it('★ 営業CF の折れ線は実績のある月だけを繋ぐ (凡例が実績月数を言う)', async () => {
    install(payload(ACCOUNTING));
    const text = await mount();
    // 凡例に実績の月数が出る —— 「7 年ぶんゼロの水平線」を描いていない印。
    expect(text).toContain('営業CF (会計・実績6か月)');
  });
});
