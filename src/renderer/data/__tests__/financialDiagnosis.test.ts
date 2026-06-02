import { describe, expect, it } from 'vitest';
import { diagnoseFinancials } from '../financialDiagnosis';
import { computeFinancialRatios, radarAxes } from '../financialRatios';
import { deriveBusinessFinancials } from '../businessFinancials';
import type { RadarAxis } from '../financialRatios';

function axis(key: string, label: string, score: number): RadarAxis {
  return { key, label, unit: '', raw: score, score };
}

describe('diagnoseFinancials', () => {
  it('averages all axis scores into the overall score and grade', () => {
    const axes = [axis('equityRatio', '自己資本比率', 90), axis('operatingMargin', '営業利益率', 90), axis('ccc', 'CCC', 90)];
    const d = diagnoseFinancials(axes);
    expect(d.overallScore).toBe(90);
    expect(d.grade).toBe('S');
  });

  it('grades a weak profile as D and surfaces weaknesses', () => {
    const axes = [axis('equityRatio', '自己資本比率', 10), axis('operatingMargin', '営業利益率', 5), axis('ccc', 'CCC', 20)];
    const d = diagnoseFinancials(axes);
    expect(d.grade).toBe('D');
    expect(d.strengths).toHaveLength(0);
    // 最も低い軸が先頭に来る
    expect(d.weaknesses[0]?.key).toBe('operatingMargin');
    expect(d.weaknesses[0]?.level).toBe('bad');
  });

  it('groups axes into 安全性 / 収益性 / 効率性', () => {
    const axes = [
      axis('equityRatio', '自己資本比率', 80), axis('currentRatio', '流動比率', 60),
      axis('operatingMargin', '営業利益率', 40), axis('roe', 'ROE', 20),
      axis('ccc', 'CCC', 100),
    ];
    const d = diagnoseFinancials(axes);
    const safety = d.categories.find((c) => c.category === '安全性')!;
    const eff = d.categories.find((c) => c.category === '効率性')!;
    expect(safety.score).toBe(70); // (80+60)/2
    expect(eff.score).toBe(100);
    expect(d.categories.map((c) => c.category)).toEqual(['安全性', '収益性', '効率性']);
  });

  it('limits strengths and weaknesses to 3 each', () => {
    const axes = Array.from({ length: 8 }, (_, i) => axis(`k${i}`, `軸${i}`, 90)); // 全部 good
    const d = diagnoseFinancials(axes);
    expect(d.strengths.length).toBeLessThanOrEqual(3);
  });

  it('integrates with the real ratio → radar pipeline', () => {
    const f = deriveBusinessFinancials({ revenue: 1_000_000, variableCost: 400_000, fixedCost: 300_000, profit: 200_000, profitMargin: 20 });
    const d = diagnoseFinancials(radarAxes(computeFinancialRatios(f)));
    expect(d.overallScore).toBeGreaterThanOrEqual(0);
    expect(d.overallScore).toBeLessThanOrEqual(100);
    expect(['S', 'A', 'B', 'C', 'D']).toContain(d.grade);
  });
});
