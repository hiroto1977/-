/**
 * **算定できなかった軸を、レーダーの中心へ落とさない・要改善として名指ししない。**
 *
 * `linScore` は 2026-09-08 まで `raw == null` に **0 点**を返していた。0 点は:
 *
 * 1. レーダーの**頂点を中心に落とす** (パス 59「0 が座標に入ると主張ではなく
 *    幾何になる」/ パス 65「欠けた頂点を通る多角形を描かない」)
 * 2. `diagnoseFinancials` の総合・カテゴリ平均・**要改善の名指し**に混ざる
 *
 * **実測 (production 経路)**: 仕入が無い事業 (変動費 0 —— 士業・コンサル・
 * サービス業) は棚卸資産回転率と CCC が算定不能なので、
 * **「棚卸資産回転率が低め。在庫の滞留に注意。」**が要改善の先頭に出ていた ——
 * **在庫を持たない事業に、在庫の滞留を警告していた。**
 */
import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { FinancialAnalysis, type FinancialUnit } from '../FinancialAnalysis';
import { computeFinancialRatios, radarAxes } from '../../data/financialRatios';
import { deriveBusinessFinancials } from '../../data/businessFinancials';

/** 仕入が無い事業 (変動費 0)。棚卸資産回転率と CCC が算定不能になる。 */
const SERVICE: FinancialUnit = {
  id: 'svc',
  label: 'コンサル事業',
  current: { revenue: 12_000_000, variableCost: 0, fixedCost: 8_400_000, profit: 3_600_000, profitMargin: 30 },
  history: [],
};
/** 対照: 物販 (変動費あり)。15 軸すべて算定できる。 */
const GOODS: FinancialUnit = {
  id: 'goods',
  label: '物販事業',
  current: { revenue: 12_000_000, variableCost: 4_800_000, fixedCost: 3_600_000, profit: 3_600_000, profitMargin: 30 },
  history: [],
};

const render = (u: FinancialUnit) => renderToStaticMarkup(createElement(FinancialAnalysis, { units: [u] }));

/** レーダーの実測多角形 (破線のグリッドではなく、塗りのある 1 本) の points。 */
function radarPolygonPoints(html: string): string {
  const m = /<polygon points="([^"]+)" fill="rgba\(91,141,239,0\.20\)"/.exec(html);
  return m?.[1] ?? '';
}

describe('財務分析 — 算定できなかった軸の扱い', () => {
  it('★ 実測の前提: 仕入が無い事業では 2 軸が算定不能 (標本が効いている)', () => {
    const axes = radarAxes(computeFinancialRatios(deriveBusinessFinancials(SERVICE.current)));
    const unscored = axes.filter((a) => a.score === null).map((a) => a.key);
    expect(unscored.sort()).toEqual(['ccc', 'inventoryTurnover']);
    // 対照側は 15 軸すべて出る。
    const ok = radarAxes(computeFinancialRatios(deriveBusinessFinancials(GOODS.current)));
    expect(ok.every((a) => a.score !== null)).toBe(true);
  });

  it('★ 在庫を持たない事業に「在庫の滞留」と言わない', () => {
    const html = render(SERVICE);
    // 直す前は要改善の先頭に出ていた文面。
    expect(html).not.toContain('在庫の滞留に注意');
    expect(html).not.toContain('CCC（現金化日数）が長め');
  });

  it('★ 対照: 在庫があって回転が悪ければ今も警告する (床が本物を消さない)', () => {
    // 物販は棚卸資産回転率が実測でき、既定の帯では低めに出る。
    const html = render(GOODS);
    expect(html).toContain('在庫の滞留に注意');
  });

  it('★ 未評価の軸を名前で示し、平均から外したことを述べる', () => {
    const html = render(SERVICE);
    expect(html).toContain('data-unscored-axes');
    expect(html).toContain('未評価の 2 軸');
    expect(html).toContain('棚卸資産回転率・CCC');
    expect(html).toContain('総合スコア・カテゴリ平均・強み／要改善のいずれからも除いています');
  });

  it('★ 対照: 15 軸すべて算定できれば未評価の帯は出ない', () => {
    expect(render(GOODS)).not.toContain('data-unscored-axes');
  });

  it('★ レーダーの多角形は未評価の軸を通らない (頂点が中心に落ちない)', () => {
    const svcPoints = radarPolygonPoints(render(SERVICE)).split(' ').filter(Boolean);
    const goodsPoints = radarPolygonPoints(render(GOODS)).split(' ').filter(Boolean);
    // 物販は 15 頂点、サービス業は算定できた 13 頂点だけ。
    expect(goodsPoints).toHaveLength(15);
    expect(svcPoints).toHaveLength(13);
    // 中心 (180.0,180.0) の頂点が 1 つも無い —— 直す前は 2 つ在った。
    expect(svcPoints).not.toContain('180.0,180.0');
  });

  it('★ 未評価の軸はラベルに印を付ける (頂点が無い理由が図の中で読める)', () => {
    const html = render(SERVICE);
    expect(html).toContain('CCC（未評価）');
    expect(html).toContain('棚卸資産回転率（未評価）');
    expect(render(GOODS)).not.toContain('（未評価）');
  });
});
