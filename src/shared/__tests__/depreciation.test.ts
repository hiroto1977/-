import { describe, expect, it } from 'vitest';
import {
  straightLineAnnual,
  straightLineSchedule,
  decliningBalanceSchedule,
  classifySmallAsset,
  decliningBalanceRate,
  usedAssetUsefulLife,
  proratedDepreciation,
  decliningBalanceScheduleStrict,
  compareMethods,
  lumpSum3YearSchedule,
  smeImmediateDeduction,
  SME_UNIT_LIMIT,
  SME_ANNUAL_CAP,
} from '../depreciation';

describe('straightLineAnnual', () => {
  it('divides acquisition cost by useful life', () => {
    expect(straightLineAnnual(1_000_000, 5)).toBe(200_000);
  });
  it('returns 0 for non-positive inputs', () => {
    expect(straightLineAnnual(0, 5)).toBe(0);
    expect(straightLineAnnual(1_000_000, 0)).toBe(0);
    expect(straightLineAnnual(-1_000, 5)).toBe(0); // 負値は早期 return (計算経路は負)
  });
});

describe('straightLineSchedule', () => {
  it('depreciates evenly and leaves a 1-yen memo value in the final year', () => {
    const s = straightLineSchedule(1_000_000, 5);
    expect(s).toHaveLength(5);
    expect(s.slice(0, 4).map((r) => r.depreciation)).toEqual([200_000, 200_000, 200_000, 200_000]);
    expect(s[4]!.depreciation).toBe(199_999); // 200,000 - 1 (memo)
    expect(s[4]!.bookValue).toBe(1);
    const total = s.reduce((sum, r) => sum + r.depreciation, 0);
    expect(total).toBe(999_999);
  });

  it('final-year memo differs from the even amount when rounding leaves >1 yen', () => {
    // 12 ÷ 5 → annual=2。4年で 8 償却 → 残4。最終年は備忘1円のため 3 (=book−1)、
    // 均等 (min(annual, book−1)=2) とは異なる。y===usefulLife 分岐と book−1 を kill。
    const s = straightLineSchedule(12, 5);
    expect(s.map((r) => [r.depreciation, r.bookValue])).toEqual([
      [2, 10], [2, 8], [2, 6], [2, 4], [3, 1],
    ]);
  });

  it('returns [] for non-positive cost / life (loop yields [])', () => {
    expect(straightLineSchedule(0, 5)).toEqual([]); // cost=0 は計算経路だと 0 行が出る
    expect(straightLineSchedule(-100, 5)).toEqual([]);
    expect(straightLineSchedule(1_000, 0)).toEqual([]);
  });
});

describe('decliningBalanceSchedule (200% declining balance)', () => {
  it('applies book-value × rate then switches to even depreciation, ending at 1 yen', () => {
    const s = decliningBalanceSchedule(1_000_000, 5, 2); // rate 0.4
    expect(s.map((r) => r.depreciation)).toEqual([400_000, 240_000, 144_000, 108_000, 107_999]);
    expect(s[4]!.bookValue).toBe(1);
    expect(s.reduce((sum, r) => sum + r.depreciation, 0)).toBe(999_999);
  });

  it('front-loads depreciation relative to the straight-line method', () => {
    const db = decliningBalanceSchedule(1_000_000, 5);
    const sl = straightLineSchedule(1_000_000, 5);
    expect(db[0]!.depreciation).toBeGreaterThan(sl[0]!.depreciation);
  });

  it('switches to even depreciation and caps at book−1 (life 4, mult 2)', () => {
    // rate=0.5。y3 で declining(125,000)=even(125,000) の同値。最終年は備忘1円。
    const s = decliningBalanceSchedule(1_000_000, 4, 2);
    expect(s.map((r) => [r.depreciation, r.bookValue])).toEqual([
      [500_000, 500_000], [250_000, 250_000], [125_000, 125_000], [124_999, 1],
    ]);
    expect(s.reduce((sum, r) => sum + r.depreciation, 0)).toBe(999_999);
  });

  it('caps the declining amount at book−1 with a high multiplier', () => {
    // mult=4, life=2 → rate=2。1年目の定率額 200万 は book−1 (999,999) で頭打ち。
    // Math.min(dep, book−1) の cap が binding する経路を踏み、cap 系 mutant を kill。
    const s = decliningBalanceSchedule(1_000_000, 2, 4);
    expect(s.map((r) => [r.depreciation, r.bookValue])).toEqual([[999_999, 1], [0, 1]]);
  });

  it('returns [] for non-positive cost / life', () => {
    expect(decliningBalanceSchedule(0, 5)).toEqual([]);
    expect(decliningBalanceSchedule(-100, 5)).toEqual([]);
    expect(decliningBalanceSchedule(1_000, 0)).toEqual([]);
  });
});

describe('classifySmallAsset', () => {
  it('classifies by acquisition-cost thresholds', () => {
    expect(classifySmallAsset(90_000)).toBe('immediate');
    expect(classifySmallAsset(150_000)).toBe('lump-3year');
    expect(classifySmallAsset(250_000)).toBe('sme-special');
    expect(classifySmallAsset(300_000)).toBe('normal');
    expect(classifySmallAsset(500_000)).toBe('normal');
  });

  it('treats the boundaries exclusively (10万/20万/30万)', () => {
    expect(classifySmallAsset(100_000)).toBe('lump-3year');
    expect(classifySmallAsset(200_000)).toBe('sme-special');
  });
});

// ===========================================================================
// Round 66 追加分のテスト
// ===========================================================================

describe('decliningBalanceRate', () => {
  it('returns multiplier ÷ useful life (default 200%)', () => {
    expect(decliningBalanceRate(5)).toBe(0.4); // 2 / 5
    expect(decliningBalanceRate(10)).toBe(0.2);
  });

  it('honours an explicit multiplier', () => {
    expect(decliningBalanceRate(4, 2.5)).toBe(0.625); // 2.5 / 4
    // multiplier=1 (定額相当) で 1/n を返す — multiplier 引数の使用を kill。
    expect(decliningBalanceRate(5, 1)).toBe(0.2);
  });

  it('returns null for non-positive / non-finite useful life', () => {
    expect(decliningBalanceRate(0)).toBeNull();
    expect(decliningBalanceRate(-5)).toBeNull();
    expect(decliningBalanceRate(Infinity)).toBeNull();
    expect(decliningBalanceRate(NaN)).toBeNull();
  });

  it('returns null for non-positive / non-finite multiplier', () => {
    expect(decliningBalanceRate(5, 0)).toBeNull();
    expect(decliningBalanceRate(5, -2)).toBeNull();
    expect(decliningBalanceRate(5, Infinity)).toBeNull();
    expect(decliningBalanceRate(5, NaN)).toBeNull();
  });
});

describe('usedAssetUsefulLife (simplified method)', () => {
  it('uses (statutory − elapsed) + elapsed × 0.2 when partly elapsed', () => {
    // 法定10年・経過4年 → (10−4) + 4×0.2 = 6 + 0.8 = 6.8 → floor 6。
    expect(usedAssetUsefulLife(10, 4)).toEqual({ usefulLife: 6, fullyElapsed: false });
  });

  it('floors the fractional part (does not round up)', () => {
    // 法定6年・経過3年 → (6−3) + 3×0.2 = 3 + 0.6 = 3.6 → floor 3 (not 4)。
    expect(usedAssetUsefulLife(6, 3)).toEqual({ usefulLife: 3, fullyElapsed: false });
  });

  it('applies statutory × 0.2 when fully elapsed (elapsed ≥ statutory)', () => {
    // 経過10年 ≥ 法定10年 → 10×0.2 = 2.0 → floor 2、fullyElapsed。
    expect(usedAssetUsefulLife(10, 10)).toEqual({ usefulLife: 2, fullyElapsed: true });
    // 経過 > 法定 でも同じ式。
    expect(usedAssetUsefulLife(15, 20)).toEqual({ usefulLife: 3, fullyElapsed: true });
  });

  it('treats elapsed == statutory as the fully-elapsed branch (>= boundary)', () => {
    // 法定5年・経過5年 → fully elapsed: 5×0.2 = 1 → max(2,1) = 2。
    const r = usedAssetUsefulLife(5, 5)!;
    expect(r.fullyElapsed).toBe(true);
    expect(r.usefulLife).toBe(2);
  });

  it('clamps to a minimum of 2 years', () => {
    // 法定3年・経過2年 → (3−2) + 2×0.2 = 1.4 → floor 1 → max(2,1) = 2。
    expect(usedAssetUsefulLife(3, 2)).toEqual({ usefulLife: 2, fullyElapsed: false });
  });

  it('handles elapsedYears == 0 (brand new but treated as used)', () => {
    // 経過0 → (10−0) + 0 = 10。fullyElapsed=false (0 < 10)。
    expect(usedAssetUsefulLife(10, 0)).toEqual({ usefulLife: 10, fullyElapsed: false });
  });

  it('returns null for invalid statutory life', () => {
    expect(usedAssetUsefulLife(0, 1)).toBeNull();
    expect(usedAssetUsefulLife(-10, 1)).toBeNull();
    expect(usedAssetUsefulLife(Infinity, 1)).toBeNull();
    expect(usedAssetUsefulLife(NaN, 1)).toBeNull();
  });

  it('returns null for negative / non-finite elapsed years', () => {
    expect(usedAssetUsefulLife(10, -1)).toBeNull();
    expect(usedAssetUsefulLife(10, Infinity)).toBeNull();
    expect(usedAssetUsefulLife(10, NaN)).toBeNull();
  });
});

describe('proratedDepreciation (month-based)', () => {
  it('prorates the annual amount by months ÷ 12', () => {
    expect(proratedDepreciation(120_000, 7)).toBe(70_000); // 120,000 × 7/12
    expect(proratedDepreciation(120_000, 12)).toBe(120_000); // full year
  });

  it('rounds to the nearest yen', () => {
    // 100,000 × 1/12 = 8333.33… → 8333。
    expect(proratedDepreciation(100_000, 1)).toBe(8_333);
  });

  it('caps months at 12 (does not exceed the annual amount)', () => {
    expect(proratedDepreciation(120_000, 18)).toBe(120_000);
  });

  it('returns 0 for non-positive / non-finite annual amount', () => {
    expect(proratedDepreciation(0, 6)).toBe(0);
    expect(proratedDepreciation(-120_000, 6)).toBe(0);
    expect(proratedDepreciation(Infinity, 6)).toBe(0);
    expect(proratedDepreciation(NaN, 6)).toBe(0);
  });

  it('returns 0 for non-positive / non-finite months', () => {
    expect(proratedDepreciation(120_000, 0)).toBe(0);
    expect(proratedDepreciation(120_000, -3)).toBe(0);
    expect(proratedDepreciation(120_000, Infinity)).toBe(0);
    expect(proratedDepreciation(120_000, NaN)).toBe(0);
  });
});

describe('decliningBalanceScheduleStrict (200% with guarantee + revised rate)', () => {
  it('matches the official 5-year table (rate .400 / revised .500 / guarantee .10800)', () => {
    // 国税庁 耐用年数5年 200%定率法: 償却率0.400, 改定償却率0.500, 保証率0.10800。
    // 取得100万。償却保証額 = 108,000。
    // y1: 1,000,000×0.4 = 400,000 (≥保証額) → 400,000、簿価600,000
    // y2: 600,000×0.4 = 240,000 → 簿価360,000
    // y3: 360,000×0.4 = 144,000 (≥108,000) → 簿価216,000
    // y4: 216,000×0.4 = 86,400 (<108,000) → 切替。改定取得価額216,000×0.5 = 108,000 → 簿価108,000
    // y5: 改定取得価額216,000×0.5 = 108,000 だが book−1=107,999 で頭打ち → 簿価1。
    const s = decliningBalanceScheduleStrict(1_000_000, 5, {
      rate: 0.4,
      revisedRate: 0.5,
      guaranteeRate: 0.10800,
    });
    expect(s.map((r) => [r.depreciation, r.bookValue])).toEqual([
      [400_000, 600_000],
      [240_000, 360_000],
      [144_000, 216_000],
      [108_000, 108_000],
      [107_999, 1],
    ]);
    expect(s.reduce((sum, r) => sum + r.depreciation, 0)).toBe(999_999);
  });

  it('switches at the guarantee boundary: declining < guaranteed amount triggers revised rate', () => {
    // 切替判定が < (≤ ではない) であることを撃墜。
    // 取得100万, rate0.4, 保証率を y4 でちょうど 86,400 になるよう設定。
    // y4 期首簿価=216,000, declining=86,400。保証額をこの値ぴったり (=86,400/1,000,000=0.0864)
    // にすると 86,400 < 86,400 は false → 切替えず declining を採用。
    const eq = decliningBalanceScheduleStrict(1_000_000, 5, {
      rate: 0.4,
      revisedRate: 0.5,
      guaranteeRate: 0.0864,
    });
    // y4 は切替えず 86,400 (< ではないので保証額に届く)。
    expect(eq[3]!.depreciation).toBe(86_400);

    // 保証率をわずかに上げ 86,401 を上回らせると y4 で切替 → 改定額 108,000。
    const sw = decliningBalanceScheduleStrict(1_000_000, 5, {
      rate: 0.4,
      revisedRate: 0.5,
      guaranteeRate: 0.0864001,
    });
    expect(sw[3]!.depreciation).toBe(108_000);
  });

  it('once switched, stays on the revised rate for all remaining years', () => {
    // 改定取得価額が以後固定であることを確認 (switched フラグの sticky 性)。
    const s = decliningBalanceScheduleStrict(1_000_000, 5, {
      rate: 0.4,
      revisedRate: 0.5,
      guaranteeRate: 0.10800,
    });
    // y4 で切替後、改定取得価額216,000で固定 → y5 も 216,000×0.5 ベース。
    expect(s[3]!.depreciation).toBe(108_000);
    expect(s[4]!.depreciation).toBe(107_999); // 216,000×0.5=108,000 を book−1 で頭打ち
  });

  it('matches the official 6-year table: post-switch year uses 改定取得価額 × 改定償却率 uncapped', () => {
    // 国税庁 耐用年数6年: 償却率0.333, 改定償却率0.334, 保証率0.09911。
    // y4 で切替 (改定取得価額=296,741)。y5 = 296,741×0.334 = 99,111 は book−1 で頭打ち
    // されない「素の改定額」なので、revisedBase × revisedRate の乗算 mutant を撃墜する。
    const s = decliningBalanceScheduleStrict(1_000_000, 6, {
      rate: 0.333,
      revisedRate: 0.334,
      guaranteeRate: 0.09911,
    });
    expect(s.map((r) => [r.depreciation, r.bookValue])).toEqual([
      [333_000, 667_000],
      [222_111, 444_889],
      [148_148, 296_741],
      [99_111, 197_630], // y4: 切替, 改定取得価額296,741×0.334
      [99_111, 98_519], // y5: 改定取得価額×改定償却率 (頭打ちなし) ← 乗算 mutant kill
      [98_518, 1], // y6: 備忘1円で頭打ち
    ]);
    expect(s.reduce((sum, r) => sum + r.depreciation, 0)).toBe(999_999);
  });

  it('with no guarantee rate stays on pure declining (never reaches the 1-yen memo)', () => {
    // guaranteeRate 省略 (=0) → 保証額0、調整前償却額は常に ≥ 0 で切替えない。
    // 純粋な定率のみだと耐用年数内では備忘1円まで償却しきれない (保証率が完了を担保する)。
    const s = decliningBalanceScheduleStrict(1_000_000, 5, { rate: 0.4 });
    expect(s.map((r) => r.depreciation)).toEqual([400_000, 240_000, 144_000, 86_400, 51_840]);
    expect(s[4]!.bookValue).toBe(77_760); // 簿価が残る → 保証率の必要性を示す
  });

  it('defaults rate to multiplier ÷ useful life when factors omitted', () => {
    // factors {} → rate = 2/5 = 0.4。
    const s = decliningBalanceScheduleStrict(1_000_000, 5);
    expect(s[0]!.depreciation).toBe(400_000);
  });

  it('honours an explicit multiplier when rate is omitted', () => {
    // multiplier=2.5, life=5 → rate=0.5。
    const s = decliningBalanceScheduleStrict(1_000_000, 5, { multiplier: 2.5 });
    expect(s[0]!.depreciation).toBe(500_000);
  });

  it('defaults revisedRate to rate when omitted', () => {
    // revisedRate 省略 → rate 流用。保証率を高くして早期切替させ、改定額=期首簿価×rate を確認。
    const s = decliningBalanceScheduleStrict(1_000_000, 5, { rate: 0.4, guaranteeRate: 0.5 });
    // y1: declining=400,000 < 保証額500,000 → 即切替。改定取得価額=1,000,000×0.4(=rate)=400,000。
    expect(s[0]!.depreciation).toBe(400_000);
  });

  it('caps the final/large depreciation at book−1 (high rate)', () => {
    // rate=2 (multiplier4/life2) → y1 定率額200万を book−1=999,999 で頭打ち。
    const s = decliningBalanceScheduleStrict(1_000_000, 2, { rate: 2 });
    expect(s.map((r) => [r.depreciation, r.bookValue])).toEqual([[999_999, 1], [0, 1]]);
  });

  it('returns [] for invalid inputs', () => {
    expect(decliningBalanceScheduleStrict(0, 5, { rate: 0.4 })).toEqual([]);
    expect(decliningBalanceScheduleStrict(-100, 5, { rate: 0.4 })).toEqual([]);
    expect(decliningBalanceScheduleStrict(1_000_000, 0, { rate: 0.4 })).toEqual([]);
    expect(decliningBalanceScheduleStrict(1_000_000, Infinity, { rate: 0.4 })).toEqual([]);
    expect(decliningBalanceScheduleStrict(Infinity, 5, { rate: 0.4 })).toEqual([]);
    // rate <= 0 / 非有限。
    expect(decliningBalanceScheduleStrict(1_000_000, 5, { rate: 0 })).toEqual([]);
    expect(decliningBalanceScheduleStrict(1_000_000, 5, { rate: -0.4 })).toEqual([]);
    expect(decliningBalanceScheduleStrict(1_000_000, 5, { rate: Infinity })).toEqual([]);
    expect(decliningBalanceScheduleStrict(1_000_000, 5, { rate: NaN })).toEqual([]);
  });
});

describe('compareMethods', () => {
  it('lines up straight-line and declining-balance year by year', () => {
    const c = compareMethods(1_000_000, 5, 2);
    expect(c).toHaveLength(5);
    expect(c[0]).toEqual({
      year: 1,
      straightLine: 200_000,
      straightLineBookValue: 800_000,
      decliningBalance: 400_000,
      decliningBalanceBookValue: 600_000,
    });
    // 定率は初年度に前倒し、定額は均等。
    expect(c[0]!.decliningBalance).toBeGreaterThan(c[0]!.straightLine);
  });

  it('final year leaves 1-yen memo for both methods', () => {
    const c = compareMethods(1_000_000, 5);
    expect(c[4]!.straightLineBookValue).toBe(1);
    expect(c[4]!.decliningBalanceBookValue).toBe(1);
  });

  it('honours the multiplier for the declining-balance column', () => {
    // multiplier=1 → 定率列の初年度 rate=1/5=0.2 → 200,000 (定額と一致)。
    const c = compareMethods(1_000_000, 5, 1);
    expect(c[0]!.decliningBalance).toBe(200_000);
  });

  it('returns [] for invalid inputs', () => {
    expect(compareMethods(0, 5)).toEqual([]);
    expect(compareMethods(-100, 5)).toEqual([]);
    expect(compareMethods(1_000_000, 0)).toEqual([]);
    expect(compareMethods(1_000_000, Infinity)).toEqual([]);
    expect(compareMethods(Infinity, 5)).toEqual([]);
  });
});

describe('lumpSum3YearSchedule (一括償却資産, 20万円未満 → 3年均等)', () => {
  it('splits into 3 equal years, fully depreciating with no memo value', () => {
    const s = lumpSum3YearSchedule(180_000);
    expect(s.map((r) => [r.depreciation, r.bookValue])).toEqual([
      [60_000, 120_000],
      [60_000, 60_000],
      [60_000, 0],
    ]);
    expect(s.reduce((sum, r) => sum + r.depreciation, 0)).toBe(180_000);
  });

  it('absorbs the rounding remainder in the final year', () => {
    // 100,000 / 3 = 33,333.33 → 33,333。y3 で残額 33,334 を償却し合計=取得価額。
    const s = lumpSum3YearSchedule(100_000);
    expect(s.map((r) => r.depreciation)).toEqual([33_333, 33_333, 33_334]);
    expect(s.reduce((sum, r) => sum + r.depreciation, 0)).toBe(100_000);
    expect(s[2]!.bookValue).toBe(0);
  });

  it('returns [] at and above the 20万円 boundary (not eligible)', () => {
    expect(lumpSum3YearSchedule(200_000)).toEqual([]);
    expect(lumpSum3YearSchedule(250_000)).toEqual([]);
  });

  it('accepts just under the 20万円 boundary', () => {
    expect(lumpSum3YearSchedule(199_999)).toHaveLength(3);
  });

  it('returns [] for non-positive / non-finite cost', () => {
    expect(lumpSum3YearSchedule(0)).toEqual([]);
    expect(lumpSum3YearSchedule(-100)).toEqual([]);
    expect(lumpSum3YearSchedule(Infinity)).toEqual([]);
    expect(lumpSum3YearSchedule(NaN)).toEqual([]);
  });
});

describe('smeImmediateDeduction (中小企業者等の少額減価償却資産の特例)', () => {
  it('exposes the statutory limits', () => {
    expect(SME_UNIT_LIMIT).toBe(300_000);
    expect(SME_ANNUAL_CAP).toBe(3_000_000);
  });

  it('immediately deducts the full cost when under 30万円 and within the annual cap', () => {
    expect(smeImmediateDeduction(250_000)).toEqual({
      eligible: true,
      deductible: 250_000,
      cumulativeAfter: 250_000,
      excludedOverCap: 0,
    });
  });

  it('is not eligible at or above the 30万円 unit limit', () => {
    expect(smeImmediateDeduction(300_000)).toEqual({
      eligible: false,
      deductible: 0,
      cumulativeAfter: 0,
      excludedOverCap: 0,
    });
    expect(smeImmediateDeduction(500_000).eligible).toBe(false);
  });

  it('accumulates against a prior total', () => {
    expect(smeImmediateDeduction(250_000, 1_000_000)).toEqual({
      eligible: true,
      deductible: 250_000,
      cumulativeAfter: 1_250_000,
      excludedOverCap: 0,
    });
  });

  it('partially deducts up to the 300万円 annual cap, excluding the overage', () => {
    // 既に 2,900,000 使用、290,000 の資産 → 残枠 100,000 のみ即時、190,000 は超過。
    expect(smeImmediateDeduction(290_000, 2_900_000)).toEqual({
      eligible: true,
      deductible: 100_000,
      cumulativeAfter: 3_000_000,
      excludedOverCap: 190_000,
    });
  });

  it('deducts exactly to the cap when the asset fills the remaining room', () => {
    // 残枠ぴったり 200,000。
    expect(smeImmediateDeduction(200_000, 2_800_000)).toEqual({
      eligible: true,
      deductible: 200_000,
      cumulativeAfter: 3_000_000,
      excludedOverCap: 0,
    });
  });

  it('is not eligible once the annual cap is already reached', () => {
    // 残枠 0 (= 3,000,000 到達) → 全額が excludedOverCap。
    expect(smeImmediateDeduction(100_000, 3_000_000)).toEqual({
      eligible: false,
      deductible: 0,
      cumulativeAfter: 3_000_000,
      excludedOverCap: 100_000,
    });
    // 上限を超えて記録されていた場合 (remainingCap < 0) も同様。
    expect(smeImmediateDeduction(100_000, 3_100_000)).toEqual({
      eligible: false,
      deductible: 0,
      cumulativeAfter: 3_100_000,
      excludedOverCap: 100_000,
    });
  });

  it('treats negative / non-finite prior as 0', () => {
    expect(smeImmediateDeduction(250_000, -500_000).cumulativeAfter).toBe(250_000);
    expect(smeImmediateDeduction(250_000, NaN).cumulativeAfter).toBe(250_000);
    expect(smeImmediateDeduction(250_000, Infinity).cumulativeAfter).toBe(250_000);
  });

  it('is not eligible for non-positive / non-finite cost', () => {
    expect(smeImmediateDeduction(0)).toEqual({
      eligible: false,
      deductible: 0,
      cumulativeAfter: 0,
      excludedOverCap: 0,
    });
    expect(smeImmediateDeduction(-100).eligible).toBe(false);
    expect(smeImmediateDeduction(Infinity).eligible).toBe(false);
    expect(smeImmediateDeduction(NaN).eligible).toBe(false);
  });
});
