/**
 * **診断カードが「この点数は既定の水準で付いた」と言う。** (2026-09-14 · パス 227)
 *
 * パス 222 は幅 0 の帯 (`good === bad`) の倒し込みを**設定画面**で断るようにしたが、
 * **採点する面**は何も言わなかった。スコアは上書きあり / なしで同じ (実測 60 / 60) なので、
 * **画面に差が出ない = 利用者には区別できない**。既定を対照に置く。
 */
import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { FinancialAnalysis, type FinancialUnit } from '../FinancialAnalysis';
import { RADAR_AXIS_BANDS, type RadarBands } from '../../../shared/financialHealthBands';

const UNIT: FinancialUnit = {
  id: 'u',
  label: 'テスト事業',
  current: { revenue: 50_000_000, variableCost: 20_000_000, fixedCost: 15_000_000, profit: 10_000_000, profitMargin: 20 },
  history: [],
};

const collapsed = (...keys: readonly (keyof RadarBands)[]): RadarBands => {
  const out = { ...RADAR_AXIS_BANDS } as Record<string, { bad: number; good: number }>;
  for (const k of keys) out[k] = { bad: 50, good: 50 };
  return out as RadarBands;
};

describe('FinancialAnalysis — 既定の水準で採点したことを言う', () => {
  it('対照: 既定の帯では断りを出さない', () => {
    const html = renderToStaticMarkup(createElement(FinancialAnalysis, { units: [UNIT] }));
    expect(html).not.toContain('data-default-band-axes');
    expect(html).not.toContain('既定の水準で採点しています');
    // 断りが無いこと自体は「規則がこの文面に当たる」証拠にならないので、
    // 当たる側 (次の 2 本) を同じファイルに置く。
  });

  it('★ 自己資本比率の 0 点 / 100 点が同じ値なら、その軸を名指しして既定で採点したと言う', () => {
    const html = renderToStaticMarkup(createElement(FinancialAnalysis, { units: [UNIT], radarBands: collapsed('equityRatio') }));
    expect(html).toContain('data-default-band-axes="1"');
    expect(html).toContain('role="alert"');
    expect(html).toContain('自己資本比率');
    expect(html).toContain('既定の水準で採点しています');
    expect(html).toContain('数値パラメータ');
  });

  it('★ 3 軸なら 3 軸ぶん名指しする (件数を写していない)', () => {
    const html = renderToStaticMarkup(createElement(FinancialAnalysis, {
      units: [UNIT], radarBands: collapsed('equityRatio', 'laborShare', 'roe'),
    }));
    expect(html).toContain('data-default-band-axes="3"');
    for (const label of ['自己資本比率', '労働分配率', 'ROE']) expect(html).toContain(label);
  });

  it('倒し込みは残す — 断りを出しても格付けは刷り続ける (⛔ 1 件で節全体を黙らせない)', () => {
    const html = renderToStaticMarkup(createElement(FinancialAnalysis, { units: [UNIT], radarBands: collapsed('equityRatio') }));
    expect(html).toContain('財務健全度 総合診断');
    expect(html).toContain('/100');
    expect(html).not.toContain('NaN');
  });
});
