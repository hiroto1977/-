/**
 * **年率の上限と、必要額が出せない入力の「半端な判定」を作らない** (2026-10-01 · パス 502)。
 *
 * 全掃引 #180 が `savingsPlanning.ts` に残した生存 4 件の分。どれも既存の検査が**答えを主張していなかった**
 * (関数を通すのに値を見ない) 形で、観測できる差が在る 3 件は値ごと留め、観測できない 1 件は等価の根拠を留める。
 *
 * | 位置 | 変異体 | 観測できる差 |
 * | --- | --- | --- |
 * | `futureValueWithFrequency` の年率の関門 | `!isPlannableRate(…)` → `false` | 年率 101% 以上で `null` ではなく**巨大な金額** (999,999,999% で ¥1.06 × 10^163) |
 * | `goalProjection` の `\|\|` | `\|\|` → `&&` | 必要額だけが `null` の入力で、見込み額と「達成」の断定が**半端に出る** |
 * | 同 `requiredMonthly === null` | → `false` | 同上 |
 * | 同 `projected === null` | → `false` | **無い (等価)** —— 下の走査が根拠を留め、実物に理由つきの pragma を置いた |
 */
import { describe, expect, it } from 'vitest';
import {
  MAX_PLAN_RATE_PCT,
  futureValueWithFrequency,
  goalProjection,
  requiredMonthlyContribution,
} from '../savingsPlanning';

describe('futureValueWithFrequency — 年率の上限は複利の頻度に依らず強制される (パス 207)', () => {
  it.each([
    ['monthly', 101],
    ['monthly', 100.0001],
    ['monthly', 999_999_999],
    ['annual', 101],
    ['annual', 100.0001],
    ['annual', 999_999_999],
  ] as const)('★ %s 複利・年率 %s%% は算定不能 (null)。巨大な金額を作らない', (frequency, ratePct) => {
    // 関門を外すと 999,999,999% は ¥1.06 × 10^163 の将来評価額を返す (`MAX_PLAN_RATE_PCT` の注記が実測を持つ)。
    expect(futureValueWithFrequency(10_000, ratePct, 10, frequency)).toBeNull();
  });

  it('対照: ちょうど上限 (100%) の年率は算定できる (断りすぎない・値は独立に求めた)', () => {
    expect(MAX_PLAN_RATE_PCT).toBe(100);
    // 月複利: 月利 r = 2^(1/12) − 1 で 10 年 (120 回) の年金終価 = 10,000 × (2^10 − 1) ÷ r。
    // 50 桁の十進演算で ¥172,039,482.8124… → 四捨五入で ¥172,039,483。
    expect(futureValueWithFrequency(10_000, 100, 10)).toBe(172_039_483);
    expect(futureValueWithFrequency(10_000, 100, 10, 'monthly')).toBe(172_039_483);
    // 年複利: 毎年 残高 × 2 + 12 × 10,000 を 10 年 = 120,000 × (2^10 − 1)。
    expect(futureValueWithFrequency(10_000, 100, 10, 'annual')).toBe(122_760_000);
  });
});

/** 必要額が出せない (`requiredMonthlyContribution` が null) のに、見込み額 (`futureValueWithFrequency`) は数で返る入力。 */
const ONLY_REQUIRED_IS_NULL: ReadonlyArray<readonly [string, number, number, number]> = [
  ['目標額が NaN', Number.NaN, 3, 10],
  ['目標額が +∞', Number.POSITIVE_INFINITY, 3, 10],
  ['目標額が −∞', Number.NEGATIVE_INFINITY, 3, 10],
  ['年率が NaN', 1_000_000, Number.NaN, 10],
  ['年率が +∞', 1_000_000, Number.POSITIVE_INFINITY, 10],
  ['年数が NaN', 1_000_000, 3, Number.NaN],
  ['年数が +∞', 1_000_000, 3, Number.POSITIVE_INFINITY],
];

const NOT_COMPUTABLE = { projected: null, onTrack: null, shortfall: null, requiredMonthly: null, additionalMonthly: null };

describe('goalProjection — 必要額が算定できないとき、見込み額だけを出して判定を作らない', () => {
  it.each(ONLY_REQUIRED_IS_NULL)('★ %s: 見込み額は数で出せても、全欄 null (達成/未達の断定を作らない)', (_label, target, ratePct, years) => {
    // 前提 (題が名乗る状態そのもの): 見込み額の側は数で返り、必要額の側だけが null。
    expect(futureValueWithFrequency(10_000, ratePct, years, 'monthly')).not.toBeNull();
    expect(requiredMonthlyContribution(target, ratePct, years)).toBeNull();
    // 1 つでも null なら全欄 null。見込み額を残すと `onTrack: true` (= 達成) などの半端な判定が出る。
    expect(goalProjection(10_000, target, ratePct, years)).toEqual(NOT_COMPUTABLE);
  });

  it.each([
    ['年数が上限を超える', 1_000_000, 3, 81],
    ['年率が上限を超える', 1_000_000, 101, 10],
    ['年数も年率も上限を超える', 1_000_000, 101, 81],
  ] as const)('対照: %s と、見込み額・必要額の両方が null になり全欄 null', (_label, target, ratePct, years) => {
    expect(futureValueWithFrequency(10_000, ratePct, years, 'monthly')).toBeNull();
    expect(requiredMonthlyContribution(target, ratePct, years)).toBeNull();
    expect(goalProjection(10_000, target, ratePct, years)).toEqual(NOT_COMPUTABLE);
  });

  it('対照: 全部読めて上限の中なら判定が出る (この検査が常に全欄 null を期待する空の検査でない)', () => {
    const p = goalProjection(10_000, 1_200_000, 0, 10);
    expect(p.projected).toBe(1_200_000);
    expect(p.onTrack).toBe(true);
    expect(p.requiredMonthly).toBe(10_000);
    expect(p).not.toEqual(NOT_COMPUTABLE);
  });
});

describe('goalProjection の `projected === null` は多重防御 (等価を支える不変条件)', () => {
  // 実物の `if (requiredMonthly === null || projected === null)` の右の項。「見込み額が null なら必要額も null」が
  // 成り立つ間は、この項を外しても答えが変わらない (理由つきの Stryker pragma を置いた根拠)。成り立たなくなる日
  // (片方の関門だけが増えた日) に、この検査が落ちて pragma を見直させる。
  const GRID = [
    Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, -1e300, -1_000, -1, -0, 0, 0.0001, 1, 5, 80,
    80.0001, 81, 100, 100.0001, 101, 1_000, 1e9, 1e21, 1e300, Number.MAX_VALUE,
  ];

  it('★ 見込み額が null になる入力では、必要額も必ず null (走査)', () => {
    let both = 0;
    let onlyRequired = 0;
    const counterexamples: string[] = [];
    for (const target of GRID) {
      for (const ratePct of GRID) {
        for (const years of GRID) {
          const projected = futureValueWithFrequency(5_000, ratePct, years, 'monthly');
          const required = requiredMonthlyContribution(target, ratePct, years);
          if (projected === null && required === null) both += 1;
          else if (projected === null) counterexamples.push(`target=${target} rate=${ratePct} years=${years}`);
          else if (required === null) onlyRequired += 1;
        }
      }
    }
    expect(counterexamples, '見込み額だけが null になる入力が現れた —— goalProjection の pragma の理由が偽になる').toEqual([]);
    // 走査が空虚でない床: 両方 null の入力も、必要額だけ null の入力も実際に通っている。
    expect(both).toBeGreaterThan(0);
    expect(onlyRequired).toBeGreaterThan(0);
  });
});
