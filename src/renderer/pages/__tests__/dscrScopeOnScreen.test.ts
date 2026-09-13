/** @vitest-environment jsdom */
/**
 * **返済が無い期の DSCR を「0.00」と刷らない。**
 *
 * `shared/funding.ts` の `debtServiceMetrics` は 2026-09-08 まで
 * `overallDscr = totalRepayment > 0 ? cf / rep : 0` で、しかも**型の doc 自身が
 * 「返済が無いときは 0 (指標として意味を持たない)」と書いていた** ——
 * 意味を持たないと述べてから数を返していた。`worstMonthDscr` は `Infinity` で
 * 始めて最小値を採る (= **「無い」の印は既に在った**) のに 0 に倒していた。
 *
 * **規準は姉妹モジュールに在った** —— `renderer/data/cashflowDebtService.ts`
 * (パス 45 が作った側) は同じ量を `null` で返し、経営サマリーは「—」を刷って
 * 色も付けず、金融機関等提出用の書面もそちらを読む。
 * **同じ量の双子で、片方だけが 0 に倒れていた。**
 *
 * 画面は `totalRepayment > 0` で節ごと隠していたので**表には出ていなかった**
 * (パス 52 の「規則が関門にしか無い」形)。ここで留めるのは:
 *
 * 1. 返済が在る期は数で出る (節と値の両方が生きている)
 * 2. **算定不能を「返済を下回る」警告に化けさせない** —— 警告の条件を
 *    `?? 0` で書くと `0 < 1` で鳴る
 */
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { SERVICES } from '../../services';
import { SNAPSHOT } from '../../data/snapshot';
import type { DebtServiceMetrics } from '../../../shared/funding';

/**
 * `SNAPSHOT` は `as const` なので `typeof SNAPSHOT.funding` の各欄はリテラル型
 * (`0` / `false`) になる。live fetch で届く payload は**任意の JSON** なので、
 * 差し替える欄だけを構造で書き、受け口は `unknown` にする
 * (`fetchSnapshot` の返り値は元から検査を通ってから使われる)。
 *
 * **差し替える形は本体の型をそのまま使う** (2026-09-12 · パス 182)。
 * ここは 2026-09-12 まで `DebtServicePatch` という手写しの interface を持っており、
 * 受け口が `unknown` なので**欄が変わっても tsc が黙った** —— パス 182 で
 * `totalOperatingCashflow` が無くなったあとも、この検査は存在しない欄を渡し、
 * 画面には `¥NaN` が出ていた (パス 62 / 80 / 116 で 3 度直した「手写しの payload 型」)。
 */

const hub = () =>
  (globalThis as unknown as { serviceHub: { fetchSnapshot: unknown; listConfigured: unknown } }).serviceHub;

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

async function settle(): Promise<void> {
  for (let i = 0; i < 6; i += 1) {
    await act(async () => {
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    });
  }
}

/**
 * snapshot を土台に `debtService` だけ差し替えた payload。
 *
 * 画面は `live.items.length > 0` で本体を出すので**案件を 1 件入れる**
 * (snapshot は空配列。返済余力の節は ⑤ ランウェイの中に在る)。
 */
function payload(debtService: DebtServiceMetrics, accountingLinked: boolean): unknown {
  return {
    ...SNAPSHOT.funding,
    items: [
      {
        id: 'l1',
        kind: 'loan' as const,
        name: '確定融資',
        amount: 5_000_000,
        status: 'received' as const,
        month: '2026-01',
        repayable: true,
        repayment: { annualRate: 0.02, months: 60, startMonth: '2026-02' },
      },
    ],
    debtService,
    accountingLinked,
  };
}

async function mountWith(p: unknown): Promise<void> {
  hub().listConfigured = () => Promise.resolve(['funding']);
  hub().fetchSnapshot = (id: string) =>
    Promise.resolve(id === 'funding' ? { ok: true, data: p } : { ok: false, code: 'x', message: 'x' });
  const def = SERVICES.find((s) => s.id === 'funding');
  if (!def) throw new Error('funding service missing');
  root = createRoot(container);
  await act(async () => {
    root!.render(createElement(def.page));
  });
  await settle();
}

const text = (): string => (container.textContent ?? '').replace(/\s+/g, ' ');

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
});

afterEach(async () => {
  if (root) {
    await act(async () => {
      root!.unmount();
    });
    root = null;
  }
  container.remove();
});

describe('資金調達 — 返済余力 (DSCR) が算定できない期', () => {
  it('★ 対照: 返済が在れば DSCR は数で出る (節と値の両方が生きている)', async () => {
    await mountWith(
      payload(
        {
          totalRepayment: 1_200_000, coveredOperatingCashflow: 2_400_000, coveredRepayment: 1_200_000,
          overallDscr: 2, worstMonthDscr: 1.5, shortfallMonths: 0, coveredMonths: 6, unmatchedMonths: 0,
        },
        true,
      ),
    );
    const t = text();
    expect(t).toContain('返済余力 (DSCR)');
    expect(t).toContain('2.00');
    expect(t).toContain('1.50');
    expect(t).not.toContain('⚠️ 営業CFが返済を下回っています');
  });

  it('★ 算定不能を「返済を下回る」警告に化けさせない', async () => {
    // 返済額はあるが (節が出る) DSCR が算定できていない控え。`?? 0` で条件を
    // 書くと `0 < 1` で警告が鳴る —— それを鳴らさないことを留める。
    await mountWith(
      payload(
        {
          // 返済額はあるが突合が 0 件 = 算定不能 (パス 182 の形)。
          totalRepayment: 1_200_000, coveredOperatingCashflow: 0, coveredRepayment: 0,
          overallDscr: null, worstMonthDscr: null, shortfallMonths: 0, coveredMonths: 0, unmatchedMonths: 12,
        },
        true,
      ),
    );
    const t = text();
    expect(t).toContain('返済余力 (DSCR)');
    expect(t).toContain('—'); // 値は「—」
    expect(t).not.toContain('0.00');
    expect(t).not.toContain('⚠️ 営業CFが返済を下回っています');
  });

  it('★ 対照: DSCR が 1 を下回れば警告は出る (警告そのものが生きている)', async () => {
    await mountWith(
      payload(
        {
          totalRepayment: 1_200_000, coveredOperatingCashflow: 600_000, coveredRepayment: 1_200_000,
          overallDscr: 0.5, worstMonthDscr: 0.4, shortfallMonths: 3, coveredMonths: 6, unmatchedMonths: 0,
        },
        true,
      ),
    );
    expect(text()).toContain('⚠️ 営業CFが返済を下回っています');
  });

  it('★ 出荷する既定データに「返済ゼロで DSCR 0」を同梱しない', async () => {
    // snapshot は totalRepayment: 0 なので DSCR は算定不能。
    expect(SNAPSHOT.funding.debtService.totalRepayment).toBe(0);
    expect(SNAPSHOT.funding.debtService.overallDscr).toBeNull();
    expect(SNAPSHOT.funding.debtService.worstMonthDscr).toBeNull();
  });
});
