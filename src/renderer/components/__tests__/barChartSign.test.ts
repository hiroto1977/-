/**
 * **事業間比較の棒が、符号を長さに畳んでいない。** (2026-09-08 · パス 93)
 *
 * `BarChart` は 2026-09-08 まで `w = Math.abs(v) / max` で棒を引いていた。
 * 実測 (この検査と同じ入力):
 *
 * | 事業 | 数字 | 棒の長さ |
 * | --- | --- | --- |
 * | A 社 | +12.5% | 25.0% |
 * | **B 社** | **−50%** | **100.0%** ← 最長 |
 * | C 社 | — | 0.0% |
 * | D 社 | 0% | 0.0% |
 *
 * **最も悪い事業が最も長い棒を得ていた。** 「1指標の事業間比較」という図で、
 * 視覚的な順位が損失について反転していた。色は `PALETTE[i % …]` = **並び順**で
 * 決まるので符号を伝えず、**右端の数字だけが本当のことを言っていた**
 * (パス 59「0 は座標に入ると主張ではなく幾何になる」の同族)。
 *
 * この本は**この部品の最初の検査**である —— 20 行の描画で、
 * 誰も幾何を測っていなかった。
 *
 * 検査は個別の値を名指しせず、**どの組にも必ず当たる単調性**で書く
 * (「値が大きい行の棒が、より左から始まることはない」)。
 * ある時点の実測を不変条件として固定しない (パス 87 の失敗)。
 */
import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { BarChart } from '../FinancialAnalysis';

const RED = '#ef4444';

/**
 * `BarChart` は `FinancialAnalysis` の内部部品なので、実物の画面を通して測る。
 * `data-bar-fill` / `data-bar-zero` は描画側が持つ目印。
 */
type Bar = { label: string; left: number; width: number; red: boolean };

/** 刷った HTML から棒の幾何を読む。 */
function barsOf(html: string): Bar[] {
  const out: Bar[] = [];
  const re = /data-bar-fill="([^"]*)"[^>]*style="([^"]*)"/g;
  for (const m of html.matchAll(re)) {
    const style = m[2] as string;
    const left = Number(/left:\s*([-\d.]+)%/.exec(style)?.[1] ?? NaN);
    const width = Number(/width:\s*([-\d.]+)%/.exec(style)?.[1] ?? NaN);
    out.push({ label: m[1] as string, left, width, red: style.includes(RED) });
  }
  return out;
}

/**
 * `BarChart` を単体で刷る。**幾何の規則をこの検査の中に持たない** ——
 * 持つと「2 か所に書いた規則」になり、片方が腐る。実物を呼んで刷った物を測る。
 */
function renderBars(rows: { label: string; value: number | null }[]): string {
  return renderToStaticMarkup(createElement(BarChart, { rows, unit: '%' }));
}

describe('事業間比較の棒 — 符号が幾何に出ている', () => {
  const ROWS = [
    { label: 'A 社', value: 12.5 },
    { label: 'B 社', value: -50 },
    { label: 'C 社', value: null },
    { label: 'D 社', value: 0 },
  ];

  it('★ 走査が実物の目印に当たっている (空振りしていない)', () => {
    // **不在を主張する前に、読み取りがその文面へ当たることを標本で確かめる。**
    const sample =
      '<div data-bar-fill="X" style="position:absolute;left:40%;width:10%;background:#ef4444"></div>';
    const bars = barsOf(sample);
    expect(bars).toHaveLength(1);
    expect(bars[0]).toMatchObject({ label: 'X', left: 40, width: 10, red: true });
  });

  it('★ 負の値の棒は基準線より左に収まり、正の値は右に収まる', () => {
    const html = renderBars(ROWS);
    const bars = barsOf(html);
    const zero = Number(/data-bar-zero="" style="[^"]*left:\s*([-\d.]+)%/.exec(html)?.[1] ?? NaN);
    expect(Number.isFinite(zero)).toBe(true);
    const a = bars.find((b) => b.label === 'A 社')!;
    const b = bars.find((b) => b.label === 'B 社')!;
    // 正: 基準線から右へ
    expect(a.left).toBeCloseTo(zero, 5);
    // 負: 右端がちょうど基準線 = 全体が基準線より左
    expect(b.left + b.width).toBeCloseTo(zero, 5);
    expect(b.left).toBeLessThan(zero);
  });

  it('★ 直す前の形の再現: −50% の棒が +12.5% より右へ伸びていない', () => {
    const bars = barsOf(renderBars(ROWS));
    const a = bars.find((x) => x.label === 'A 社')!;
    const b = bars.find((x) => x.label === 'B 社')!;
    // 直す前は b.width(100) > a.width(25) で、B 社の棒が 4 倍長かった。
    expect(b.left + b.width).toBeLessThanOrEqual(a.left + a.width);
    // 図だけを見ても符号が分かること
    expect(b.red).toBe(true);
    expect(a.red).toBe(false);
  });

  it('★ 棒の両端が値の順序に従う (どの組にも必ず当たる形・総当たり)', () => {
    // **左端だけでは足りない。** 直す前の形は「左端はどれも 0・幅が |値|」なので、
    // 左端の単調性だけを見る検査は**元の欠陥を素通りさせる** (自分で 1 度書いて気づいた)。
    // 右端 (= left + width) も値について単調でなければならない ——
    // これが「棒の長さが数字の順序と食い違わない」の意味である。
    const bars = barsOf(renderBars(ROWS));
    const known = ROWS.filter((r): r is { label: string; value: number } => r.value != null);
    for (const p of known) {
      for (const q of known) {
        const bp = bars.find((b) => b.label === p.label)!;
        const bq = bars.find((b) => b.label === q.label)!;
        if (p.value < q.value) continue; // 対称なので片側だけ見れば全組を覆う
        expect(
          bp.left >= bq.left - 1e-9,
          `${p.label}(${p.value}) の左端が ${q.label}(${q.value}) より左に在る`,
        ).toBe(true);
        expect(
          bp.left + bp.width >= bq.left + bq.width - 1e-9,
          `${p.label}(${p.value}) の右端が ${q.label}(${q.value}) より左に在る (棒の長さが順序と逆)`,
        ).toBe(true);
      }
    }
    // 組が 1 つも無ければ上の 2 つは 1 度も走らない。
    expect(known.length).toBeGreaterThan(1);
  });

  it('★ 算定不能 (null) は棒を描かない —— 実測 0% と同じ「長さ 0 の棒」を出さない', () => {
    const bars = barsOf(renderBars(ROWS));
    expect(bars.map((b) => b.label)).not.toContain('C 社');
    // 対照: 実測 0% は棒の枠を持つ (幅 0 でも要素は在る) ので、
    // **図の上で両者は区別が付かない**。区別は数字と title が持つ。
    expect(bars.map((b) => b.label)).toContain('D 社');
    const html = renderBars(ROWS);
    expect(html).toContain('（算定不能）');
  });

  it('★ 対照: すべて正なら基準線を出さず、従来どおり左端から伸びる', () => {
    const html = renderBars([
      { label: 'A 社', value: 10 },
      { label: 'B 社', value: 20 },
    ]);
    expect(html).not.toContain('data-bar-zero');
    const bars = barsOf(html);
    for (const b of bars) expect(b.left).toBeCloseTo(0, 5);
    // 大きい値のほうが長い (符号を殺していない)
    const a = bars.find((x) => x.label === 'A 社')!;
    const b = bars.find((x) => x.label === 'B 社')!;
    expect(b.width).toBeGreaterThan(a.width);
  });
});
