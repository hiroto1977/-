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

  it('maps the overall score to a grade at the exact thresholds', () => {
    const g = (s: number) => diagnoseFinancials([axis('k', 'l', s)]).grade;
    // 境界: 80=S, 65=A, 50=B, 35=C, 未満=D
    expect([g(80), g(79), g(65), g(64), g(50), g(49), g(35), g(34)]).toEqual(
      ['S', 'A', 'A', 'B', 'B', 'C', 'C', 'D'],
    );
  });

  it('classifies axis level as good≥70 / warn≥45 / bad otherwise', () => {
    const lvl = (s: number) => {
      const d = diagnoseFinancials([axis('equityRatio', '自己資本比率', s)]);
      return (d.strengths[0] ?? d.weaknesses[0])!.level;
    };
    expect([lvl(70), lvl(69), lvl(45), lvl(44)]).toEqual(['good', 'warn', 'warn', 'bad']);
  });

  it('uses the per-axis improvement hint for weaknesses and a good note for strengths', () => {
    const weak = diagnoseFinancials([axis('currentRatio', '流動比率', 20)]);
    expect(weak.weaknesses[0]!.comment).toMatch(/流動比率/);
    expect(weak.strengths).toHaveLength(0);
    const strong = diagnoseFinancials([axis('currentRatio', '流動比率', 90)]);
    expect(strong.strengths[0]!.comment).toBe('流動比率は良好な水準です。'); // 良好コメントの厳密値
    // 未知キーの弱みはフォールバック文 (ラベル + 注意) の厳密値
    const unknown = diagnoseFinancials([axis('zzz', '謎指標', 10)]);
    expect(unknown.weaknesses[0]!.comment).toBe('謎指標の水準に注意。');
  });

  it('maps ordinaryMargin / netMargin to 収益性 (full category map)', () => {
    const d = diagnoseFinancials([axis('ordinaryMargin', '経常利益率', 80), axis('netMargin', '当期純利益率', 60)]);
    const profit = d.categories.find((c) => c.category === '収益性')!;
    expect(profit.score).toBe(70); // (80+60)/2 — 両軸が収益性に入る
    expect(profit.axisKeys).toEqual(['ordinaryMargin', 'netMargin']);
  });

  it('golden: pins the exact improvement hint for every one of the 15 axes', () => {
    const HINTS: Record<string, string> = {
      equityRatio: '自己資本比率が低め。利益の内部留保で純資産の積み増しを検討。',
      currentRatio: '流動比率が低め。短期の支払能力・運転資金の確保に注意。',
      fixedLongTermFit: '固定長期適合率が高め。固定資産を長期資金で賄えているか確認を。',
      debtToMonthlySales: '借入金月商倍率が高め。月商に対する借入残高の水準に注意。',
      debtRepaymentYears: '債務償還年数が長め。キャッシュ創出力に対する借入水準を確認。',
      operatingMargin: '営業利益率が低め。本業の採算（原価・固定費）の見直しを。',
      ordinaryMargin: '経常利益率が低め。営業外損益も含めた採算を確認。',
      netMargin: '当期純利益率が低め。特別損益・税負担も含め最終利益を確認。',
      laborShare: '労働分配率が高め。付加価値に対する人件費の水準に注意。',
      ebitdaMargin: 'EBITDAマージンが低め。償却前の稼ぐ力を確認。',
      receivablesTurnover: '売上債権回転率が低め。回収サイトの長期化に注意。',
      inventoryTurnover: '棚卸資産回転率が低め。在庫の滞留に注意。',
      ccc: 'CCC（現金化日数）が長め。回収・在庫・支払のサイト最適化を検討。',
      roa: 'ROA が低め。総資産に対する収益性（資産効率）を確認。',
      roe: 'ROE が低め。自己資本に対する収益性を確認。',
    };
    for (const [key, hint] of Object.entries(HINTS)) {
      const d = diagnoseFinancials([axis(key, key, 10)]);
      expect(d.weaknesses[0]!.comment).toBe(hint);
    }
  });
});
