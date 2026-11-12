/**
 * **`|| 1` は 0 除算の守りに見えて、NaN も吸い込む。** (2026-09-13 · パス 205)
 *
 * 売上構成の円グラフはこう書かれていた:
 *
 *     const total = slices.reduce((s, x) => s + Math.max(0, x.value), 0) || 1;
 *
 * `Math.max(0, NaN)` は `NaN` (パス 201) で、**`NaN` は falsy** なので `|| 1` が
 * 効いてしまう —— 合計が「測れない」ではなく**縮尺 1** に化ける。その結果:
 *
 * | 面 | 消毒前 |
 * | --- | --- |
 * | 円弧 | `frac = NaN` → `arcPath` の座標が `NaN` で**その扇が描かれない** |
 * | 凡例 | `((NaN / 1) * 100).toFixed(1)` = **「NaN%」** |
 *
 * つまり「1 件だけ読めない売上区分」が在ると、**凡例に NaN% が並ぶ**。
 * 金額は負を取らない量なので `nonNeg` で落とし、`|| 1` を本来の
 * 0 除算の守りだけに戻した。
 *
 * ★ この検査は**画面の出力 (markup) に当てる** —— 走査ではなく振る舞いを見る
 * (パス 203 で決めた形)。対照は「消毒を外すと markup に NaN が戻る」。
 */
import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { FinancialAnalysis, type FinancialUnit } from '../FinancialAnalysis';

/** 売上が読めない事業 (外部 JSON・壊れた保存値から来る形)。 */
const UNREADABLE: FinancialUnit = {
  id: 'bad',
  label: '読めない事業',
  current: { revenue: Number.NaN, variableCost: 4_800_000, fixedCost: 3_600_000, profit: Number.NaN, profitMargin: Number.NaN },
  history: [],
};
/** 対照: 正常な事業。凡例に実数の % が出る。 */
const OK: FinancialUnit = {
  id: 'ok',
  label: '物販事業',
  current: { revenue: 12_000_000, variableCost: 4_800_000, fixedCost: 3_600_000, profit: 3_600_000, profitMargin: 30 },
  history: [],
};

const render = (units: readonly FinancialUnit[]) =>
  renderToStaticMarkup(createElement(FinancialAnalysis, { units: [...units] }));

describe('財務分析 — 読めない売上と円グラフの縮尺', () => {
  it('★ 読めない売上が在っても markup に "NaN" を刷らない', () => {
    const html = render([UNREADABLE]);
    expect(html).not.toContain('NaN');
  });

  it('★ 標本が効いている: 正常な事業では凡例に実数の % が出る (空の検査でない)', () => {
    // **不在の主張には標本を添える** (CLAUDE.md)。`not.toContain('NaN')` だけでは
    // 「何も描かれていない」でも通ってしまう。
    const html = render([OK]);
    expect(html).toContain('%');
    expect(html).toContain('物販事業');
    expect(html).not.toContain('NaN');
  });

  it('★ 2 事業のうち 1 つだけ読めないときも、読める側の % は保たれる', () => {
    const html = render([OK, UNREADABLE]);
    expect(html).not.toContain('NaN');
    expect(html).toContain('物販事業');
    expect(html).toContain('読めない事業');
  });

  it('対照の記録: NaN は falsy なので `|| 1` を通り抜ける', () => {
    // この検査が守っている前提そのもの。綴りを戻したときに何が起きるかの根拠。
    const nan: number = Number.NaN;
    expect(nan || 1).toBe(1);
    expect(Number.isNaN(Math.max(0, nan))).toBe(true);
    expect(((nan / 1) * 100).toFixed(1)).toBe('NaN');
  });
});
