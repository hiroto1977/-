/**
 * **食事補助が非課税の要件を外れたら、会社負担を給与課税として計算に入れる。**
 * (2026-09-14 · パス 228 —— パス 219 の積み残し)
 *
 * パス 219 は要件の判定 (`mealSubsidyVerdict`) を作り、画面に ⛔ を出すところまでで
 * 止めた。理由として「そこまで反映するとスキーム側の逆算ごと組み替えになる」と
 * 書いてあったが、**その見積りは外れていた** —— 逆算の目標を課税現物の分だけ
 * 持ち上げるだけで足りる:
 *
 *     手取り(課税標準 G) − 課税現物 T − 天引き = 目標
 *   ⇔ 手取り(G) = 目標 + 天引き + T
 *
 * ## ここで留める性質
 *
 * 1. **要件を満たすときは 1 円も動かない** (T = 0 で式が元に戻る)。これが最も大事 ——
 *    直したことで正しかった場合の数字が変わっていたら、それは別の欠陥である。
 * 2. 外れたときは課税標準が上がるので**社保・税が増え**、非課税の現物価値からは外れる。
 * 3. それでも**目標手元残りには届く** (逆算が課税現物を織り込んでいる証拠)。
 * 4. 恒等式: `employeeRealValue = freeCash + inKindValue + taxableInKind` /
 *    `companyTotalCost = gross + 会社負担社保 + inKindValue` (課税現物を二重に足さない)。
 */
import { describe, expect, it } from 'vitest';
import {
  designWelfareScheme,
  MEAL_SUBSIDY_TAX_FREE_LIMIT_YEN,
  type WelfareSchemeInput,
} from '../welfareScheme';

/** 要件を満たす組 (会社負担 7,000 ≦ 7,500 かつ 本人 13,000 ≧ 半額)。 */
const OK: WelfareSchemeInput = {
  taxYear: 2026,
  targetFreeCash: 200_000,
  rentTotal: 120_000, rentCompanyShare: 60_000,
  mealTotal: 20_000, mealCompanyShare: 7_000,
  childcare: 30_000, ecPoints: 10_000,
};
/** 会社負担だけを限度額の外へ (本人負担の割合は満たしたまま)。 */
const OVER_LIMIT: WelfareSchemeInput = { ...OK, mealTotal: 40_000, mealCompanyShare: 12_000 };
/** 本人負担が半額未満 (限度額の内側)。 */
const SELF_PAY_SHORT: WelfareSchemeInput = { ...OK, mealTotal: 10_000, mealCompanyShare: 7_000 };

describe('要件を満たすときは 1 円も動かない (パス 228 の no-op 性質)', () => {
  it('★ 課税現物は 0 で、非課税の現物価値に食事が入る', () => {
    const r = designWelfareScheme(OK);
    expect(r.mealSubsidy.taxFree).toBe(true);
    expect(r.scheme.taxableInKind).toBe(0);
    // パス 228 より前と同じ式 —— 数字を写さず、入力から組み立てる。
    expect(r.scheme.inKindValue).toBe(
      OK.rentCompanyShare + OK.mealCompanyShare + OK.childcare + OK.ecPoints,
    );
    expect(r.scheme.employeeRealValue).toBe(r.scheme.freeCash + r.scheme.inKindValue);
    expect(r.normal.taxableInKind).toBe(0);
  });

  it('限度額ちょうど (7,500) は満たす側 —— 境界で no-op が切れない', () => {
    const r = designWelfareScheme({ ...OK, mealTotal: 15_000, mealCompanyShare: MEAL_SUBSIDY_TAX_FREE_LIMIT_YEN });
    expect(r.mealSubsidy.taxFree).toBe(true);
    expect(r.scheme.taxableInKind).toBe(0);
  });
});

describe('要件を外れたら給与課税として計算に入れる', () => {
  it('★ 会社負担が限度額超え: 課税現物に回り、非課税の現物価値から外れる', () => {
    const r = designWelfareScheme(OVER_LIMIT);
    expect(r.mealSubsidy.taxFree).toBe(false);
    expect(r.scheme.taxableInKind).toBe(OVER_LIMIT.mealCompanyShare);
    // 非課税の側に食事は**入らない**
    expect(r.scheme.inKindValue).toBe(
      OVER_LIMIT.rentCompanyShare + OVER_LIMIT.childcare + OVER_LIMIT.ecPoints,
    );
  });

  it('★ 本人負担が半額未満でも同じ (要件は 2 つとも必要)', () => {
    const r = designWelfareScheme(SELF_PAY_SHORT);
    expect(r.mealSubsidy.taxFree).toBe(false);
    expect(r.scheme.taxableInKind).toBe(SELF_PAY_SHORT.mealCompanyShare);
    expect(r.scheme.inKindValue).toBe(
      SELF_PAY_SHORT.rentCompanyShare + SELF_PAY_SHORT.childcare + SELF_PAY_SHORT.ecPoints,
    );
  });

  it('★ 課税標準が上がるので社保・税が増える (同じ食事総額での比較)', () => {
    // 食事総額は 40,000 で固定し、会社負担だけを 7,500 (満たす) → 12,000 (外れる) に。
    const under = designWelfareScheme({ ...OK, mealTotal: 40_000, mealCompanyShare: MEAL_SUBSIDY_TAX_FREE_LIMIT_YEN });
    const over = designWelfareScheme(OVER_LIMIT);
    expect(under.mealSubsidy.taxFree).toBe(true);
    expect(over.mealSubsidy.taxFree).toBe(false);
    // 会社負担が増えた分、本人の天引きは減る —— それでも課税標準は上がる
    expect(over.scheme.payrollDeduction).toBeLessThan(under.scheme.payrollDeduction);
    expect(over.scheme.gross).toBeGreaterThan(under.scheme.gross);
    expect(over.scheme.employeeSocialInsurance).toBeGreaterThan(under.scheme.employeeSocialInsurance);
    expect(over.scheme.tax).toBeGreaterThan(under.scheme.tax);
  });

  it('★ それでも目標手元残りには届く (逆算が課税現物を織り込んでいる)', () => {
    for (const input of [OK, OVER_LIMIT, SELF_PAY_SHORT]) {
      const r = designWelfareScheme(input);
      expect(r.scheme.reachedTarget).toBe(true);
      expect(r.scheme.freeCash).toBeCloseTo(input.targetFreeCash, -2);
    }
  });
});

describe('恒等式 (課税現物を二重に足さない)', () => {
  it('実質手元残り = 手元残り + 非課税の現物 + 課税現物', () => {
    for (const input of [OK, OVER_LIMIT, SELF_PAY_SHORT]) {
      const r = designWelfareScheme(input);
      for (const sc of [r.normal, r.scheme]) {
        expect(sc.employeeRealValue).toBe(sc.freeCash + sc.inKindValue + sc.taxableInKind);
      }
    }
  });

  it('会社総コスト = 課税標準 + 会社負担社保 + 非課税の現物 (課税現物は課税標準の中)', () => {
    const r = designWelfareScheme(OVER_LIMIT);
    // 課税現物を足し直すと、会社が負担した食事を 2 度数えることになる。
    expect(r.scheme.companyTotalCost).toBe(
      r.scheme.gross + (r.scheme.companyTotalCost - r.scheme.gross - r.scheme.inKindValue) + r.scheme.inKindValue,
    );
    // 食事の会社負担は総コストに 1 度だけ現れる: 限度内 7,500 → 12,000 の差は
    // 課税標準と会社負担社保の増加分に収まり、非課税の現物には出ない。
    const under = designWelfareScheme({ ...OK, mealTotal: 40_000, mealCompanyShare: MEAL_SUBSIDY_TAX_FREE_LIMIT_YEN });
    expect(under.scheme.inKindValue - r.scheme.inKindValue).toBe(MEAL_SUBSIDY_TAX_FREE_LIMIT_YEN);
  });

  it('モデルで表せない高さ (会社負担 100 億) は reachedTarget が false —— パス 103 の枠で断る', () => {
    const r = designWelfareScheme({ ...OK, mealCompanyShare: 9_999_999_999 });
    expect(r.mealSubsidy.taxFree).toBe(false);
    expect(r.scheme.taxableInKind).toBe(9_999_999_999);
    expect(r.scheme.reachedTarget).toBe(false);
    // 100 億が非課税の現物価値として数えられることは、もう無い。
    expect(r.scheme.inKindValue).toBeLessThan(1_000_000);
  });
});
