/**
 * 財務健全度のしきい値 — 表そのものを固定する (台帳の既定値がここを参照する)。
 */
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_HEALTH_BANDS,
  HEALTH_GRADE_A_MIN,
  HEALTH_GRADE_B_MIN,
  HEALTH_GRADE_C_MIN,
  HEALTH_GRADE_S_MIN,
  HEALTH_LEVEL_GOOD_MIN,
  HEALTH_LEVEL_WARN_MIN,
  RADAR_AXIS_BANDS,
  RADAR_AXIS_KEYS,
} from '../financialHealthBands';

describe('財務健全度のしきい値 (表の固定)', () => {
  it('レーダー 15 軸の並びと 0 点 / 100 点の水準', () => {
    expect(RADAR_AXIS_KEYS).toEqual(['equityRatio', 'currentRatio', 'fixedLongTermFit', 'debtToMonthlySales', 'debtRepaymentYears', 'operatingMargin', 'ordinaryMargin', 'netMargin', 'laborShare', 'ebitdaMargin', 'receivablesTurnover', 'inventoryTurnover', 'ccc', 'roa', 'roe']);
    expect(RADAR_AXIS_BANDS).toEqual({
      equityRatio: { bad: 0, good: 50 },
      currentRatio: { bad: 80, good: 200 },
      fixedLongTermFit: { bad: 130, good: 80 },
      debtToMonthlySales: { bad: 6, good: 1 },
      debtRepaymentYears: { bad: 15, good: 3 },
      operatingMargin: { bad: -5, good: 20 },
      ordinaryMargin: { bad: -5, good: 20 },
      netMargin: { bad: -5, good: 15 },
      laborShare: { bad: 80, good: 40 },
      ebitdaMargin: { bad: 0, good: 25 },
      receivablesTurnover: { bad: 4, good: 24 },
      inventoryTurnover: { bad: 4, good: 24 },
      ccc: { bad: 90, good: 0 },
      roa: { bad: 0, good: 10 },
      roe: { bad: 0, good: 15 },
    });
    // 幅 0 の帯は無い (採点の割り算が壊れる)。低いほど良い軸は bad > good。
    for (const k of RADAR_AXIS_KEYS) expect(RADAR_AXIS_BANDS[k].bad, k).not.toBe(RADAR_AXIS_BANDS[k].good);
    const lowerIsBetter = RADAR_AXIS_KEYS.filter((k) => RADAR_AXIS_BANDS[k].bad > RADAR_AXIS_BANDS[k].good);
    expect(lowerIsBetter).toEqual(['fixedLongTermFit', 'debtToMonthlySales', 'debtRepaymentYears', 'laborShare', 'ccc']);
  });

  it('軸の評価と総合格付けの下限', () => {
    expect([HEALTH_LEVEL_GOOD_MIN, HEALTH_LEVEL_WARN_MIN]).toEqual([70, 45]);
    expect([HEALTH_GRADE_S_MIN, HEALTH_GRADE_A_MIN, HEALTH_GRADE_B_MIN, HEALTH_GRADE_C_MIN]).toEqual([80, 65, 50, 35]);
    expect(DEFAULT_HEALTH_BANDS).toEqual({ goodMin: 70, warnMin: 45, gradeSMin: 80, gradeAMin: 65, gradeBMin: 50, gradeCMin: 35 });
  });
});
