/**
 * **第三者 (freee API) の取引日が「長さ 7」だけで月キーになっていた**
 * (2026-09-22 · パス 394)。
 *
 * `aggregateDeals` は取引を月次キャッシュフローに畳む。取引日は
 * `(d.issue_date ?? '').slice(0, 7)` を `length !== 7` だけで検めていた ——
 * **形は見ていない**。`jsonFetch` は `JSON.parse(...) as T` なので応答の形は
 * 保証されず、それは**すぐ下の `amount` を `Number.isFinite` で検めている
 * のと同じ理由**である (同関数の注記が「銀行提出用書面がそれを刷る」と
 * 書いている)。**月だけが検められていなかった。**
 *
 * ## 実測 (2026-09-22 · 直す前)
 *
 * | `issue_date` | 結果 |
 * | --- | --- |
 * | `'abcdefg'` | 月キー `'abcdefg'`・`skippedNoDate` は **0** |
 * | `'9999-13-01'` | 月キー `'9999-13'` |
 * | `20250615` (数) | `.slice` が無く **TypeError** —— 1 件で全月が落ちる |
 *
 * `skippedNoDate` の名前は「取引日が読めない取引」で、**元から正しかった** ——
 * 検めの側が名前に追いついていなかった。
 *
 * ## どこまで届くか
 *
 * `latestMonth` は綴りの最大で決まる (`accounting.ts` の
 * 「最新月は**綴りで**決める」) ので、`'abcdefg'` は `'2025-06'` より大きく
 * **「最新月」になる**。そこから:
 *
 * - **金融機関等提出用の書面** —— 会計連携の対象期間として刷る
 * - 経営レポート —— 「会計連携の対象期間: …」
 * - 画面 —— `直近月 (…)` の Tile
 * - 鮮度の判定 —— `accountingRecency`
 *
 * ## 直し
 *
 * 月は**切らずに作る**。このリポジトリは既に 2 か所で同じことを述べている ——
 * `shared/isoDate.ts` の「**`slice(0, 10)` では切る位置がずれる**」と
 * `balanceSheetFreshness.ts` の「月の文字列は**一致した部分から作る**」。
 * 判定は共有の 1 つ `isoMonthOf` (→ `parseIsoDate`) を通す。
 */
import { describe, expect, it } from 'vitest';
import { aggregateDeals } from '../freee';
import { isoMonthOf } from '../../../shared/isoDate';
import { summarizeAccounting } from '../../../renderer/data/accounting';

type Deal = Parameters<typeof aggregateDeals>[0][number];
const deal = (issue_date: unknown, amount: number, type: 'income' | 'expense' = 'income'): Deal =>
  ({ issue_date, amount, type }) as unknown as Deal;

describe('★ isoMonthOf —— 月は切らずに作る (パス 394)', () => {
  it('★ 暦に在る日付から月を作る', () => {
    expect(isoMonthOf('2025-06-15')).toBe('2025-06');
    expect(isoMonthOf('2025-06')).toBe('2025-06');
    expect(isoMonthOf('2025-12-31')).toBe('2025-12');
  });

  it('★ 長さ 7 でも形が違えば null (直す前はこれが月キーになった)', () => {
    for (const s of ['abcdefg', '2025-99', '2025-1x', '2025061', '2025/06']) {
      expect(isoMonthOf(s), `${s} が月として通っている`).toBeNull();
    }
  });

  it('★ 暦に無い日は null', () => {
    expect(isoMonthOf('2025-02-30')).toBeNull();
    expect(isoMonthOf('9999-13-01')).toBeNull();
    expect(isoMonthOf('2025-00-01')).toBeNull();
  });

  it('★ 文字列以外は null —— 配列も (parseIsoDate は String() で通してしまう)', () => {
    // `parseIsoDate` の注記が名指しする穴: `String(['2026-01-31'])` は日付の綴りになる。
    expect(isoMonthOf(['2026-01-31'])).toBeNull();
    expect(isoMonthOf(20250615)).toBeNull();
    expect(isoMonthOf(null)).toBeNull();
    expect(isoMonthOf(undefined)).toBeNull();
    expect(isoMonthOf({ toString: () => '2026-01-31' })).toBeNull();
  });
});

describe('★ freee の取引日を形で検める (パス 394)', () => {
  it('★ 読める取引日は月キーになる (肯定の前提 —— これが通らなければ以下は空虚)', () => {
    const agg = aggregateDeals([deal('2025-06-15', 1000)]);
    expect(agg.monthly.map((m) => m.month)).toEqual(['2025-06']);
    expect(agg.intake.skippedNoDate).toBe(0);
  });

  it('★ 長さ 7 の紛れ物は月にならず、外したことを数える', () => {
    const agg = aggregateDeals([deal('2025-06-15', 1000), deal('abcdefg', 9_999_999)]);
    expect(agg.monthly.map((m) => m.month), "'abcdefg' が月キーになっている").toEqual(['2025-06']);
    expect(agg.intake.skippedNoDate, '外したのに数えていない').toBe(1);
  });

  it('★ 暦に無い月 (13 月) も外す', () => {
    const agg = aggregateDeals([deal('2025-06-15', 1000), deal('9999-13-01', 9_999_999)]);
    expect(agg.monthly.map((m) => m.month)).toEqual(['2025-06']);
    expect(agg.intake.skippedNoDate).toBe(1);
  });

  /**
   * ★ **1 件の不正な取引で全月が落ちない。** 直す前は `.slice` が無くて
   * `TypeError` になり、呼び手の `fetch:snapshot` が `fetch_failed` へ倒すので
   * **読めていた月も含めて 1 件も出なかった**。
   */
  it('★ 取引日が文字列でなくても投げず、その 1 件だけを外す', () => {
    for (const bad of [20250615, null, undefined, { y: 2025 }, ['2025-06-15']]) {
      const agg = aggregateDeals([deal('2025-06-15', 1000), deal(bad, 9_999_999)]);
      expect(agg.monthly.map((m) => m.month), `${JSON.stringify(bad)} で月が壊れた`).toEqual(['2025-06']);
      expect(agg.intake.skippedNoDate, `${JSON.stringify(bad)} を数えていない`).toBe(1);
    }
  });

  it('★ 金額の検めは元から在る (こちらは変えていない)', () => {
    const agg = aggregateDeals([deal('2025-06-15', Number.NaN), deal('2025-06-15', 1000)]);
    expect(agg.intake.skippedBadAmount).toBe(1);
    expect(agg.monthly.map((m) => m.month)).toEqual(['2025-06']);
  });
});

describe('★ 紛れ物が「最新月」にならない —— 書面まで届かせない (パス 394)', () => {
  it('★ latestMonth は綴りの最大なので、直す前は abcdefg が最新月になった', () => {
    // 綴りの大小そのもの (製品を壊さずに、なぜ届くかを標本で示す)。
    expect('abcdefg' > '2025-06').toBe(true);
  });

  it('★ 実物: 紛れ物を混ぜても対象期間は読める月だけ', () => {
    const agg = aggregateDeals([
      deal('2025-06-15', 1000),
      deal('2025-07-15', 2000),
      deal('abcdefg', 9_999_999),
    ]);
    const acc = summarizeAccounting(agg.monthly);
    expect(acc, '会計サマリーが組めない').not.toBeNull();
    expect(acc!.firstMonth).toBe('2025-06');
    expect(acc!.latestMonth, '紛れ物が最新月になっている').toBe('2025-07');
    expect(acc!.months).toBe(2);
    // 紛れ物の 999 万が合計に入っていない。
    expect(acc!.totalIncome).toBe(3000);
  });
});
