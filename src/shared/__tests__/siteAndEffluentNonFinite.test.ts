import { describe, expect, it } from 'vitest';
import { checkEffluent } from '../waterCyclePlanner';
import { planSetbackTradeoff } from '../zoningPlanner';

/**
 * **非有限の年間排出量・敷地寸法は、「分からない」と同じに扱う** (パス 502 · 変異検査の生存 5 件)。
 *
 * `checkEffluent` の `annualDischargeL` と `planSetbackTradeoff` の `siteDepthM` / `siteWidthM` は
 * どちらも **`number | null`** (`null` = 未入力) で、`NaN` と `±Infinity` も**未入力と同じ答え**に
 * 倒す約束だった (有限でなければ「測れていない」)。ところが検査は排出量の `null`・寸法の `null` / 0 / 負 / `NaN`
 * しか見ておらず、**排出量の `NaN` / `±Infinity` も、寸法の `±Infinity` も渡す標本が 1 つも無かった**。
 * そのため、判定を支える `typeof x === 'number' && Number.isFinite(x)` の `&&` を `||` へ
 * (**`typeof` だけが通ると有限でない物も通る**) や、有限の判定をまるごと `true` へ替える変異体が全部生き残っていた:
 *
 * | 入力 | 直す前の変異体の下での答え |
 * | --- | --- |
 * | 年間排出量 `NaN` / `±Infinity` | 排出量が**ある**扱いになり、日量 `0 m³` / 窒素 `0 kg` と「規制の対象にならない (`false`)」を答える |
 * | 敷地の奥行・間口 `+Infinity` | 建てられる寸法が **`Infinity` m** になる (`Infinity > 0` は真なので床も通り抜ける) |
 *
 * 排出量の側は「分からないのに『規制の対象にならない』と答える」(= 一番安心させる向き・
 * `checkEffluent` の docblock が名指しする失敗) が `NaN` から戻る形だった。
 * 判定の綴りは `isFiniteNumber` 1 つへ寄せたので、**答えが変わらないこと**もここで留める。
 */

const NON_FINITE = [
  { label: 'NaN', v: Number.NaN },
  { label: '+Infinity', v: Number.POSITIVE_INFINITY },
  { label: '-Infinity', v: Number.NEGATIVE_INFINITY },
] as const;

describe('checkEffluent — 年間排出量が非有限なら量に依る 4 欄を算定しない', () => {
  const base = { concentrateTnMgL: 300, concentrateTpMgL: 40, dischargeToPublicWater: true } as const;

  it.each(NON_FINITE)('★ 年間排出量が $label なら、4 欄とも null (「規制の対象にならない」を作らない)', ({ v }) => {
    const r = checkEffluent({ ...base, annualDischargeL: v });
    expect(r.dailyDischargeM3).toBeNull();
    expect(r.annualNitrogenKg).toBeNull();
    expect(r.annualPhosphorusKg).toBeNull();
    expect(r.wpclNpApplicable).toBeNull();
    // 未入力 (null) とまったく同じ答え。
    expect(r).toEqual(checkEffluent({ ...base, annualDischargeL: null }));
  });

  it('★ 濃度だけで決まる欄は、排出量が非有限でも答える (床を当てすぎない)', () => {
    const r = checkEffluent({ ...base, annualDischargeL: Number.POSITIVE_INFINITY });
    expect(r.exceedsTn).toBe(true); // 窒素 300 mg/L > 一律排水基準 (放流時)
    expect(r.exceedsTp).toBe(true);
    expect(r.recommendReuse).toBe(true);
  });

  it('★ 対照: 排出量 0 L は「分かっている 0」であり、未入力と混ぜない (4 欄とも数と判定で出る)', () => {
    const r = checkEffluent({ ...base, annualDischargeL: 0 });
    expect(r.dailyDischargeM3).toBe(0);
    expect(r.annualNitrogenKg).toBe(0);
    expect(r.annualPhosphorusKg).toBe(0);
    expect(r.wpclNpApplicable).toBe(false); // 0 m³/日 は 50 m³/日 に届かない = 本物の「対象外」
  });

  it('★ 対照: 有限の排出量は日量・窒素・りんを値ごと出す', () => {
    // 36,500,000 L/年 = 100,000 L/日 = 100 m³/日 (50 m³/日以上)。窒素 300 mg/L → 10,950 kg/年、りん 40 mg/L → 1,460 kg/年。
    const r = checkEffluent({ ...base, annualDischargeL: 36_500_000 });
    expect(r.dailyDischargeM3).toBe(100);
    expect(r.annualNitrogenKg).toBe(10_950);
    expect(r.annualPhosphorusKg).toBe(1_460);
    expect(r.wpclNpApplicable).toBe(true);
  });
});

describe('planSetbackTradeoff — 敷地の奥行・間口が非有限なら未入力と同じに扱う', () => {
  const site = {
    rearSetbackM: 0.5, sideSetbackTotalM: 3, maxFootprint: 240,
    roadWidthM: 6, category: 'other' as const, plannedHeightM: 10,
  };

  it.each(NON_FINITE)('★ 奥行・間口とも $label なら、寸法に依る欄と limitedBy を算定しない', ({ v }) => {
    const r = planSetbackTradeoff({ ...site, siteDepthM: v, siteWidthM: v });
    expect(r.buildableDepthM).toBeNull();
    expect(r.buildableWidthM).toBeNull();
    expect(r.geometricFootprint).toBeNull();
    expect(r.footprint).toBeNull();
    expect(r.limitedBy).toBeNull();
    // 寸法に依らない最小後退は数のまま (全部を null にしない)。
    expect(r.requiredSetbackM).toBe(0.34);
  });

  it.each(NON_FINITE)('★ 奥行だけ $label なら奥行に依る欄だけを落とし、間口は分かっているので数で出す', ({ v }) => {
    const r = planSetbackTradeoff({ ...site, siteDepthM: v, siteWidthM: 15 });
    expect(r.buildableDepthM).toBeNull();
    expect(r.buildableWidthM).toBe(12); // 15 − 3
    expect(r.geometricFootprint).toBeNull(); // 面積は両方が要る
    expect(r.footprint).toBeNull();
    expect(r.limitedBy).toBeNull();
  });

  it.each(NON_FINITE)('★ 間口だけ $label なら間口に依る欄だけを落とし、奥行は分かっているので数で出す', ({ v }) => {
    const r = planSetbackTradeoff({ ...site, siteDepthM: 20, siteWidthM: v });
    expect(r.buildableWidthM).toBeNull();
    expect(r.buildableDepthM).toBe(19.16); // 20 − 0.34 − 0.5
    expect(r.geometricFootprint).toBeNull();
    expect(r.footprint).toBeNull();
    expect(r.limitedBy).toBeNull();
  });

  it('★ 対照: 有限の寸法なら 4 欄と limitedBy が出る (床が邪魔をしない)', () => {
    const r = planSetbackTradeoff({ ...site, siteDepthM: 20, siteWidthM: 15 });
    expect(r.buildableDepthM).toBe(19.16);
    expect(r.buildableWidthM).toBe(12);
    expect(r.geometricFootprint).toBe(229.9);
    expect(r.footprint).toBe(229.9);
    expect(r.limitedBy).toBe('geometry');
  });
});
