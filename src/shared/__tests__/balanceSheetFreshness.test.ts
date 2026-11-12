/**
 * **基準日と実績の期の隔たり。** 経緯は `src/shared/balanceSheetFreshness.ts`。
 *
 * 実測 (2026-09-07): この隔たりを誰も見ていなかったので、7 年古い貸借対照表が
 * 当月のものと 1 バイトも変わらない出力になっていた。
 */
import { describe, expect, it } from 'vitest';
import {
  BALANCE_SHEET_STALE_AFTER_MONTHS,
  balanceSheetFreshness,
} from '../balanceSheetFreshness';

describe('balanceSheetFreshness', () => {
  it('★ 基準日と実績が同じ月なら隔たり 0・古くない', () => {
    const f = balanceSheetFreshness('2026-08-31', '2026-08');
    expect(f).toEqual({ asOfMonth: '2026-08', latestPeriod: '2026-08', monthsBehind: 0, stale: false, ahead: false });
  });

  it('★ 月数の算術は年をまたぐ', () => {
    expect(balanceSheetFreshness('2025-03-31', '2026-08').monthsBehind).toBe(17);
    expect(balanceSheetFreshness('2019-03-31', '2026-08').monthsBehind).toBe(89);
  });

  it('★ 境界: しきい値ちょうどは古くない、1 か月超えると古い', () => {
    expect(balanceSheetFreshness('2025-08-31', '2026-08', 12).stale).toBe(false); // 12 か月 = ちょうど
    expect(balanceSheetFreshness('2025-07-31', '2026-08', 12).stale).toBe(true); // 13 か月
  });

  it('★ 既定のしきい値は 1 事業年度 (12 か月) —— 数字を写さずモジュールの定数を見る', () => {
    expect(BALANCE_SHEET_STALE_AFTER_MONTHS).toBe(12);
    const justInside = balanceSheetFreshness('2025-08-31', '2026-08');
    const justOutside = balanceSheetFreshness('2025-07-31', '2026-08');
    expect(justInside.monthsBehind).toBe(BALANCE_SHEET_STALE_AFTER_MONTHS);
    expect(justInside.stale).toBe(false);
    expect(justOutside.stale).toBe(true);
  });

  it('★ 基準日のほうが新しければ負の隔たり (古くはない)', () => {
    const f = balanceSheetFreshness('2026-08-31', '2026-03');
    expect(f.monthsBehind).toBe(-5);
    expect(f.stale).toBe(false);
  });

  it('★ 片方が読めなければ隔たりは null —— **測れないときに「新しい」と言わない**', () => {
    for (const [asOf, period] of [
      ['', '2026-08'],
      [null, '2026-08'],
      ['2026-13-01', '2026-08'], // 13 月は無い
      ['2026-08-31', ''],
      ['2026-08-31', 'not-a-period'],
    ] as const) {
      const f = balanceSheetFreshness(asOf, period);
      expect(f.monthsBehind).toBeNull();
      expect(f.stale).toBe(false);
    }
  });

  it('asOf は YYYY-MM でも YYYY-MM-DD でも読む (先頭 7 字)', () => {
    expect(balanceSheetFreshness('2025-03', '2026-08').monthsBehind).toBe(17);
    expect(balanceSheetFreshness('2025-03-31', '2026-08').monthsBehind).toBe(17);
  });

  it('読めた月はそのまま返す (文面が使う)', () => {
    const f = balanceSheetFreshness(' 2019-03-31 ', '2026-08');
    expect(f.asOfMonth).toBe('2019-03');
    expect(f.latestPeriod).toBe('2026-08');
  });

  it('★ 不変条件: monthsBehind が非 null なら、両方の月も非 null', () => {
    // 文面を作る側 (`managementHighlights` / 書面) はこの不変条件に頼って
    // 「読めない月」の枝を持たない。崩れたら文面が undefined を刷る。
    const samples: readonly (readonly [string | null, string | null])[] = [
      ['2026-08-31', '2026-08'],
      ['2019-03', '2026-08'],
      [' 2025-12-01 ', '2026-01'],
      ['2026-13-01', '2026-08'],
      ['', '2026-08'],
      [null, '2026-08'],
      ['2026-08-31', 'not-a-period'],
      ['2026-08-31', null],
    ];
    let withGap = 0;
    for (const [asOf, period] of samples) {
      const f = balanceSheetFreshness(asOf, period);
      if (f.monthsBehind === null) continue;
      withGap += 1;
      expect(f.asOfMonth).not.toBeNull();
      expect(f.latestPeriod).not.toBeNull();
    }
    // 走査が実際に「測れた」側へ入っていること (空回りの検査ではない)。
    expect(withGap).toBe(3);
  });

  it('★ 片方だけ読めたときも、読めた月はそのまま返す (読めた分を捨てない)', () => {
    const onlyAsOf = balanceSheetFreshness('2019-03-31', 'not-a-period');
    expect(onlyAsOf.asOfMonth).toBe('2019-03');
    expect(onlyAsOf.latestPeriod).toBeNull();
    expect(onlyAsOf.monthsBehind).toBeNull();

    const onlyPeriod = balanceSheetFreshness(null, '2026-08');
    expect(onlyPeriod.asOfMonth).toBeNull();
    expect(onlyPeriod.latestPeriod).toBe('2026-08');
    expect(onlyPeriod.monthsBehind).toBeNull();
  });

  it('★ 月の綴りは前後とも効いている (前に付いた字は読まない / 月は 01〜12 だけ)', () => {
    expect(balanceSheetFreshness('x2026-08', '2026-08').monthsBehind).toBeNull();
    expect(balanceSheetFreshness('2026-00', '2026-08').monthsBehind).toBeNull();
    expect(balanceSheetFreshness('2026-13', '2026-08').monthsBehind).toBeNull();
    // 対照: 01 と 12 は読む (境界を締めすぎていない)。
    expect(balanceSheetFreshness('2026-01', '2026-08').monthsBehind).toBe(7);
    expect(balanceSheetFreshness('2025-12', '2026-08').monthsBehind).toBe(8);
  });
});

/**
 * **隔たりは両側にある。** 2026-09-07 まで `stale` (古い側) しか無く、基準日が
 * 実績より**先**のときは隔たりが何年でも `stale === false` で、画面にも
 * 金融機関等提出用の書面にも断りが 1 行も出なかった。害は符号ではなく
 * 隔たりの大きさで決まる (割っている両辺が別の期にある)。
 */
describe('ahead — 基準日が実績より先', () => {
  it('★ 基準日が 10 年先なら ahead。stale は立たない (別の欄である)', () => {
    const f = balanceSheetFreshness('2036-03-31', '2026-08');
    expect(f.monthsBehind).toBe(-115);
    expect(f.ahead).toBe(true);
    expect(f.stale).toBe(false);
  });

  it('★ 対照: 小さな先行 (決算期が実績の 1〜2 か月先) は正常なので鳴らない', () => {
    for (const asOf of ['2026-09-30', '2026-10-31', '2027-08-31']) {
      const f = balanceSheetFreshness(asOf, '2026-08');
      expect(f.monthsBehind, asOf).toBeLessThanOrEqual(0);
      expect(f.ahead, asOf).toBe(false);
    }
  });

  it('★ 境目: しきい値ちょうど先は鳴らず、1 か月先で鳴る (古い側と対称)', () => {
    // 既定 12 か月。`-12` は鳴らず `-13` で鳴る (古い側の `12` / `13` と対称)。
    expect(balanceSheetFreshness('2027-08-31', '2026-08').monthsBehind).toBe(-12);
    expect(balanceSheetFreshness('2027-08-31', '2026-08').ahead).toBe(false);
    expect(balanceSheetFreshness('2027-09-30', '2026-08').monthsBehind).toBe(-13);
    expect(balanceSheetFreshness('2027-09-30', '2026-08').ahead).toBe(true);
    // 対照 (古い側): 12 は鳴らず 13 で鳴る。
    expect(balanceSheetFreshness('2025-08-31', '2026-08').stale).toBe(false);
    expect(balanceSheetFreshness('2025-07-31', '2026-08').stale).toBe(true);
  });

  it('しきい値を渡せば両側とも同じ物差しで動く', () => {
    expect(balanceSheetFreshness('2027-02-28', '2026-08', 6).ahead).toBe(false); // -6
    expect(balanceSheetFreshness('2027-03-31', '2026-08', 6).ahead).toBe(true); // -7
    expect(balanceSheetFreshness('2026-02-28', '2026-08', 6).stale).toBe(false); // 6
    expect(balanceSheetFreshness('2026-01-31', '2026-08', 6).stale).toBe(true); // 7
  });

  it('読めない月では ahead も立たない (測れないときに何も言わない)', () => {
    expect(balanceSheetFreshness('わからない', '2026-08').ahead).toBe(false);
    expect(balanceSheetFreshness('2036-03-31', null).ahead).toBe(false);
  });

  it('★ 古いと先は同時に立たない (排他)', () => {
    for (const asOf of ['2019-03-31', '2026-08-31', '2036-03-31', 'x']) {
      const f = balanceSheetFreshness(asOf, '2026-08');
      expect(f.stale && f.ahead, asOf).toBe(false);
    }
  });
});
