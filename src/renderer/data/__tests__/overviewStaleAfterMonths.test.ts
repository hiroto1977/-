/**
 * **経営サマリーの「基準日が古い」の判定は、設定したしきい値 (か月) で決まる。** (パス 502)
 *
 * 貸借対照表の基準日と、実績の最新期・会計連携の最新月との隔たりが**しきい値を超えたら**
 * 「別の期の数字」と見なす。しきい値は台帳 (`overview.balanceSheetStaleAfterMonths`) から
 * 上書きでき、渡さなければ既定 (`BALANCE_SHEET_STALE_AFTER_MONTHS` = 12 か月)。
 *
 * 2 つの隔たり —— ① 貸借対照表が実績より何か月古いか (`balanceSheetFreshness`)・
 * ② 会計連携が現預金の基準日より何か月古いか (`accountingRecency`) —— は**別の呼び出し**で、
 * 両方が同じしきい値を読む。②は画面の側で上書きの効き目が見えず (所見は ① の経路で出る)、
 * しきい値を渡しても既定へ戻されても、誰も気付かなかった。ここで両方の判定を値ごとに留める。
 *
 * 標本は 2 つの隔たりをどちらも**ちょうど 5 か月**にする (貸借対照表 2026-06-30・
 * 実績の最新期 2026-11・会計連携の最新月 2026-01)。
 */
import { describe, expect, it } from 'vitest';
import { buildBusinessOverview } from '../overview';
import { BALANCE_SHEET_STALE_AFTER_MONTHS } from '../../../shared/balanceSheetFreshness';
import type { KpiActual } from '../kpiActuals';

const BS = {
  asOf: '2026-06-30',
  currentAssets: 1_000_000,
  fixedAssets: 0,
  currentLiabilities: 500_000,
  fixedLiabilities: 0,
  netIncome: 0,
} as const;
const kpiAt = (period: string): KpiActual =>
  ({ period, unit: '全社', revenue: 1_000_000, cogs: 400_000, advertising: 0, sga: 0, depreciation: 0 });
const ACCOUNTING = [{ month: '2026-01', income: 1_000_000, expense: 900_000, net: 100_000 }];

function overviewWith(staleAfter: number | undefined) {
  return buildBusinessOverview({
    plan: 'pro',
    sales: [],
    members: [],
    kpiActuals: [kpiAt('2026-11')],
    accounting: ACCOUNTING,
    balanceSheet: BS as never,
    ...(staleAfter === undefined ? {} : { balanceSheetStaleAfterMonths: staleAfter }),
  });
}

describe('buildBusinessOverview — 古さのしきい値 (パス 502)', () => {
  it('★ 前提: 既定のしきい値は 12 か月で、標本の隔たりはどちらもちょうど 5 か月', () => {
    expect(BALANCE_SHEET_STALE_AFTER_MONTHS).toBe(12);
    const o = overviewWith(undefined);
    expect(o.balanceSheetFreshness!.monthsBehind).toBe(5);
    expect(o.accountingRecency!.monthsBehind).toBe(5);
  });

  it('★ 渡さなければ既定 (12 か月): どちらも古いとは言わない', () => {
    const o = overviewWith(undefined);
    expect(o.balanceSheetFreshness!.stale).toBe(false);
    expect(o.accountingRecency!.stale).toBe(false);
  });

  it('★ 4 か月に下げると、5 か月の隔たりは両方とも古い (上書きが両方に効く)', () => {
    const o = overviewWith(4);
    expect(o.balanceSheetFreshness!.stale).toBe(true);
    expect(o.accountingRecency!.stale).toBe(true);
    // 先 (ahead) ではない。
    expect(o.balanceSheetFreshness!.ahead).toBe(false);
    expect(o.accountingRecency!.ahead).toBe(false);
  });

  it('★ 境目: しきい値と隔たりが同じ 5 か月なら古くない (超えたときだけ古い)', () => {
    const o = overviewWith(5);
    expect(o.balanceSheetFreshness!.stale).toBe(false);
    expect(o.accountingRecency!.stale).toBe(false);
  });

  it('★ 上げても効く: 24 か月にしても古くない・隔たりそのものは変わらない', () => {
    const o = overviewWith(24);
    expect(o.balanceSheetFreshness!.stale).toBe(false);
    expect(o.accountingRecency!.stale).toBe(false);
    expect(o.balanceSheetFreshness!.monthsBehind).toBe(5);
    expect(o.accountingRecency!.monthsBehind).toBe(5);
  });

  it('★ 対照: 貸借対照表が無ければ、どちらの隔たりも測らない (null)', () => {
    const o = buildBusinessOverview({
      plan: 'pro',
      sales: [],
      members: [],
      kpiActuals: [kpiAt('2026-11')],
      accounting: ACCOUNTING,
      balanceSheetStaleAfterMonths: 4,
    });
    expect(o.balanceSheetFreshness).toBeNull();
    expect(o.accountingRecency).toBeNull();
  });
});
