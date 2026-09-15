/**
 * **図を実際に刷る —— `components/Charts.tsx` は 2026-09-12 まで 0% だった。** (2026-09-12 · パス 150)
 *
 * 全域の行カバレッジを初めて測ったところ (`test:cov` は `src/main` だけを見ていた)、
 * `components/Charts.tsx` の **33 行が一度も実行されていなかった**。座標計算
 * (`data/charts.ts`) は `charts.test.ts` が数値として厚く留めているが、**その座標を
 * SVG に載せる側は誰も動かしていなかった** —— 幾何が正しくても、載せ間違えれば
 * 図は壊れる (`stroke` を index からずらす・`points` を別の属性に書く・
 * 1 点の系列で `<circle>` を落とす、どれも幾何のテストは通る)。
 *
 * ここで刷るのは**実物の見本データ全件 × 3 種**と、**「データなし」の 3 枝**である。
 * 期待値はこの検査の中に持たず、`lineChart` / `pieChart` / `radarChart` を呼んで
 * 作る —— 幾何の規則を 2 か所に書くと片方が腐る (`barChartSign.test.ts` の作法)。
 *
 * ## ここで実際に見つけた 2 つ
 *
 * 1. **1 点だけの系列は `<polyline>` が何も描かない** (`points="60,76"` の 1 組)。
 *    描画側のコメントがそう述べており、`<circle>` を必ず打つことで見えている。
 *    **その `<circle>` を落としても幾何のテストは全部通る** —— だから刷って数える。
 * 2. **100% の円は `A` の円弧では消える** ので `a` の相対円弧 2 本で円として描く。
 *    実測 `M 4 110 a 106 106 0 1 0 212 0 a 106 106 0 1 0 -212 0 Z`。
 *    見本の `quality` が 1 区分 (= 100%) なので、この枝は既定の画面に出ている。
 */
import { describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { LineChartView, PieChartView, RadarChartView } from '../Charts';
import { CHART_DATASETS, seriesColor } from '../../data/chartFixtures';
import { lineChart, pieChart, radarChart } from '../../data/charts';

/** 走査が実物に当たっていることの床 (見本が消えたら落とす)。実測 2026-09-12: 4。 */
const DATASET_FLOOR = 4;

/** `<name …>` の開始札を全部取る。 */
function tagsOf(html: string, name: string): string[] {
  return [...html.matchAll(new RegExp(`<${name}\\b[^>]*>`, 'g'))].map((m) => m[0]);
}

/** 開始札から属性 1 つを読む (無ければ null)。 */
function attr(tag: string, name: string): string | null {
  return new RegExp(`${name}="([^"]*)"`).exec(tag)?.[1] ?? null;
}

/** `<text …>中身</text>` の中身を全部取る。 */
function textsOf(html: string): string[] {
  return [...html.matchAll(/<text\b[^>]*>([^<]*)<\/text>/g)].map((m) => m[1] ?? '');
}

/** 凡例 (`<li>`) の中身。`<span …></span>` の後ろに来る。 */
function legendLabels(html: string): string[] {
  return [...html.matchAll(/<li\b[^>]*>.*?<\/span>([^<]*)<\/li>/g)].map((m) => m[1] ?? '');
}

function line(...args: Parameters<typeof LineChartView>): string {
  return renderToStaticMarkup(createElement(LineChartView, ...args));
}
function pie(...args: Parameters<typeof PieChartView>): string {
  return renderToStaticMarkup(createElement(PieChartView, ...args));
}
function radar(...args: Parameters<typeof RadarChartView>): string {
  return renderToStaticMarkup(createElement(RadarChartView, ...args));
}

const LINE_OPTS = { width: 560, height: 220 } as const;
const PIE_SIZE = 220;
const RADAR_SIZE = 240;

describe('チャート 3 種を実際に刷る (カバレッジ 0% だった 33 行 · パス 150)', () => {
  it('★ 走査が実物に当たる (見本データが空でない)', () => {
    expect(CHART_DATASETS.length).toBeGreaterThanOrEqual(DATASET_FLOOR);
    // 3 種すべての形を持っていること (どれかが空だと下の総当たりが痩せる)。
    for (const d of CHART_DATASETS) {
      expect(d.line.length, `${d.id} の折れ線`).toBeGreaterThan(0);
      expect(d.pie.length, `${d.id} の円`).toBeGreaterThan(0);
      expect(d.radarAxes.length, `${d.id} のレーダー軸`).toBeGreaterThan(0);
    }
  });

  /* ---------------- 折れ線 ---------------- */

  describe.each(CHART_DATASETS.map((d) => [d.id, d] as const))('折れ線: %s', (_id, d) => {
    const gutter = 52;
    const opts = { ...LINE_OPTS, xLabels: d.xLabels, gutter };
    const geo = lineChart(d.line, opts);
    const html = line({ series: d.line, unit: d.unit, title: `${d.label}の推移`, options: opts });

    it('系列ごとに polyline が 1 本、点ごとに circle が 1 つ', () => {
      const polylines = tagsOf(html, 'polyline');
      expect(polylines).toHaveLength(geo.series.length);
      // **点の数だけ丸を打つ** —— 1 点の系列は polyline が何も描かないので、
      // ここを落とすと「凡例に居るのに見えない系列」になる。
      const points = geo.series.reduce((n, s) => n + s.points.length, 0);
      expect(tagsOf(html, 'circle')).toHaveLength(points);
    });

    it('polyline の points は幾何そのもの / 色は index で決まる', () => {
      tagsOf(html, 'polyline').forEach((tag, i) => {
        expect(attr(tag, 'points')).toBe(geo.series[i]?.polyline);
        expect(attr(tag, 'stroke')).toBe(seriesColor(i));
      });
    });

    it('縦軸の目盛りと横軸のラベルを刷る (単位は「—」のときだけ付けない)', () => {
      const texts = textsOf(html);
      const suffix = d.unit === '—' ? '' : ` ${d.unit}`;
      for (const t of geo.yTicks) expect(texts).toContain(`${t.label}${suffix}`);
      for (const t of geo.xTicks) expect(texts).toContain(t.label);
    });

    it('凡例が系列と同じ順・同じ色', () => {
      expect(legendLabels(html)).toEqual(geo.series.map((s) => s.label));
      for (let i = 0; i < geo.series.length; i += 1) {
        expect(html).toContain(`background:${seriesColor(i)}`);
      }
    });

    it('図の中に NaN / Infinity / undefined が無い', () => {
      for (const bad of ['NaN', 'Infinity', 'undefined']) expect(html).not.toContain(bad);
    });

    it('図か「データなし」のどちらかを必ず出す (黙って空にならない)', () => {
      // `nodata` は描ける値が無いので理由が出る。上の総当たりが**空振りで通る**
      // のを防ぐ枝でもある (件数 0 === 件数 0 はどちらの側でも成り立つ)。
      if (geo.series.length === 0) expect(html).toContain('role="status"');
      else expect(html).toContain('<svg');
    });
  });

  it('0 線は値域が 0 をまたぐときだけ引く', () => {
    const across = lineChart([{ label: 'a', values: [-10, 10] }], LINE_OPTS);
    expect(across.zeroY).not.toBeNull();
    const dashed = (html: string): string[] =>
      tagsOf(html, 'line').filter((t) => attr(t, 'stroke-dasharray') !== null);
    expect(dashed(line({ series: [{ label: 'a', values: [-10, 10] }], options: LINE_OPTS }))).toHaveLength(1);
    // 正の値だけなら 0 は値域の外 → 引かない。
    expect(lineChart([{ label: 'a', values: [10, 20] }], LINE_OPTS).zeroY).toBeNull();
    expect(dashed(line({ series: [{ label: 'a', values: [10, 20] }], options: LINE_OPTS }))).toHaveLength(0);
  });

  it('1 点だけの系列は polyline が線にならないので circle が唯一の印', () => {
    const html = line({ series: [{ label: '単一点', values: [20] }], options: LINE_OPTS });
    const [polyline] = tagsOf(html, 'polyline');
    // 座標が 1 組 = 区切りの空白が無い = SVG は何も描かない。
    expect(attr(polyline ?? '', 'points')).not.toContain(' ');
    expect(tagsOf(html, 'circle')).toHaveLength(1);
  });

  it('題名は figcaption と aria-label に出る / 無ければ既定の名前', () => {
    const withTitle = line({ series: [{ label: 'a', values: [1, 2] }], title: '売上', options: LINE_OPTS });
    expect(withTitle).toContain('<figcaption');
    expect(attr(tagsOf(withTitle, 'svg')[0] ?? '', 'aria-label')).toBe('売上（1 系列）');
    const without = line({ series: [{ label: 'a', values: [1, 2] }], options: LINE_OPTS });
    expect(without).not.toContain('<figcaption');
    expect(attr(tagsOf(without, 'svg')[0] ?? '', 'aria-label')).toBe('折れ線グラフ（1 系列）');
  });

  /* ---------------- 円 ---------------- */

  describe.each(CHART_DATASETS.map((d) => [d.id, d] as const))('円: %s', (_id, d) => {
    const opts = { size: PIE_SIZE } as const;
    const geo = pieChart(d.pie, opts);
    const html = pie({ slices: d.pie, title: `${d.label}の内訳`, options: opts });

    it('正の値だけがスライスになり、path は幾何そのもの', () => {
      const paths = tagsOf(html, 'path');
      expect(paths).toHaveLength(geo.slices.length);
      paths.forEach((tag, i) => {
        expect(attr(tag, 'd')).toBe(geo.slices[i]?.path);
        expect(attr(tag, 'fill')).toBe(seriesColor(i));
      });
    });

    it('スライスごとに title (ラベル・値・割合) を持つ', () => {
      const titles = [...html.matchAll(/<title>([^<]*)<\/title>/g)].map((m) => m[1] ?? '');
      expect(titles).toHaveLength(geo.slices.length);
      geo.slices.forEach((s, i) => {
        expect(titles[i]).toContain(s.label);
        expect(titles[i]).toContain(String(s.value));
      });
    });

    it('割合の札は 6% 以上のスライスにだけ載せる (重なって読めなくなるので)', () => {
      const shown = geo.slices.filter((s) => s.ratio >= 0.06);
      expect(textsOf(html)).toHaveLength(shown.length);
      for (const s of shown) expect(textsOf(html)).toContain(`${Math.round(s.ratio * 100)}%`);
    });

    it('図の中に NaN / Infinity / undefined が無い', () => {
      for (const bad of ['NaN', 'Infinity', 'undefined']) expect(html).not.toContain(bad);
      for (const bad of ['NaN', 'undefined']) {
        expect(pie({ slices: d.pie, options: { size: PIE_SIZE, innerRadius: 60 } })).not.toContain(bad);
      }
    });

    it('図か「データなし」のどちらかを必ず出す (黙って空にならない)', () => {
      if (geo.slices.length === 0) expect(html).toContain('role="status"');
      else expect(html).toContain('<svg');
    });
  });

  it('1 区分だけ (= 100%) の円は消えず、円として描かれる', () => {
    /*
     * SVG の円弧は始点と終点が一致すると**何も描かない**。`arcPath` は 360° を
     * 相対円弧 (`a`) 2 本の円に切り替えており、見本の `quality` が実際にこの枝を通る
     * (= 既定の画面に出ている枝)。扇形の形 (`L` で中心へ戻る) になっていたら消える。
     */
    const [tag] = tagsOf(pie({ slices: [{ label: '全部', value: 5 }], options: { size: PIE_SIZE } }), 'path');
    const d = attr(tag ?? '', 'd') ?? '';
    expect(d).not.toContain(' L ');
    expect([...d.matchAll(/ a /g)]).toHaveLength(2);
    // ドーナツなら外周 + 内周の 2 つの部分経路になる。
    const donut = attr(tagsOf(pie({ slices: [{ label: '全部', value: 5 }], options: { size: PIE_SIZE, innerRadius: 60 } }), 'path')[0] ?? '', 'd') ?? '';
    expect([...donut.matchAll(/M /g)]).toHaveLength(2);
    expect([...donut.matchAll(/ a /g)]).toHaveLength(4);
  });

  /* ---------------- レーダー ---------------- */

  describe.each(CHART_DATASETS.map((d) => [d.id, d] as const))('レーダー: %s', (_id, d) => {
    const opts = { size: RADAR_SIZE } as const;
    const geo = radarChart(d.radarAxes, d.radar, opts);
    const html = radar({ axes: d.radarAxes, series: d.radar, title: `${d.label}の評価`, options: opts });

    it('目盛りの輪 + 系列が polygon、軸の数だけ spoke を引く', () => {
      const polygons = tagsOf(html, 'polygon');
      expect(polygons).toHaveLength(geo.rings.length + geo.series.length);
      geo.rings.forEach((ring, i) => expect(attr(polygons[i] ?? '', 'points')).toBe(ring));
      geo.series.forEach((s, i) =>
        expect(attr(polygons[geo.rings.length + i] ?? '', 'points')).toBe(s.polygon),
      );
      expect(tagsOf(html, 'line')).toHaveLength(geo.axes.length);
    });

    it('軸のラベルを全部刷る / 凡例は系列と同じ順', () => {
      const texts = textsOf(html);
      for (const a of geo.axes) expect(texts).toContain(a.label);
      expect(legendLabels(html)).toEqual(geo.series.map((s) => s.label));
    });

    it('値が軸より少ない系列も頂点を軸数だけ持つ (図が閉じる)', () => {
      for (const s of geo.series) {
        expect(s.points).toHaveLength(geo.axes.length);
      }
    });

    it('図の中に NaN / Infinity / undefined が無い', () => {
      for (const bad of ['NaN', 'Infinity', 'undefined']) expect(html).not.toContain(bad);
    });

    it('図か「データなし」のどちらかを必ず出す (黙って空にならない)', () => {
      if (geo.axes.length === 0) expect(html).toContain('role="status"');
      else expect(html).toContain('<svg');
    });
  });

  /* ---------------- 「データなし」の 3 枝 ---------------- */

  describe('「データなし」は空の図を出さずに理由を書く (3 枝すべて)', () => {
    const cases: readonly (readonly [string, string, string])[] = [
      ['折れ線 · 系列が空', line({ series: [], options: LINE_OPTS }), 'データがありません'],
      ['折れ線 · 値が 1 つも無い', line({ series: [{ label: 'a', values: [] }], options: LINE_OPTS }), 'データがありません'],
      ['円 · 正の値が無い', pie({ slices: [] }), '正の値'],
      ['円 · 0 と負だけ', pie({ slices: [{ label: 'z', value: 0 }, { label: 'n', value: -5 }] }), '正の値'],
      ['レーダー · 軸 0 本', radar({ axes: [], series: [] }), '3 本以上の軸'],
      ['レーダー · 軸 2 本', radar({ axes: ['a', 'b'], series: [{ label: 's', values: [1, 2] }] }), '3 本以上の軸'],
    ];

    it.each(cases.map(([name, html, reason]) => [name, html, reason] as const))(
      '%s → 理由を書き、図も凡例も出さない',
      (_name, html, reason) => {
        expect(html).toContain(reason);
        expect(html).toContain('role="status"');
        // **空の図を描かない** (枠だけの SVG は「データが 0 である」と読めてしまう)。
        expect(html).not.toContain('<svg');
        expect(html).not.toContain('<li');
      },
    );

    it('★ 対照: 同じ入力に値を 1 つ足すと図が出る (枝の判定が効いている)', () => {
      expect(line({ series: [{ label: 'a', values: [1] }], options: LINE_OPTS })).toContain('<svg');
      expect(pie({ slices: [{ label: 'z', value: 0 }, { label: 'p', value: 1 }] })).toContain('<svg');
      expect(radar({ axes: ['a', 'b', 'c'], series: [{ label: 's', values: [1, 2, 3] }] })).toContain('<svg');
    });
  });

  /* ---------------- 描けない値 (パス 150 で直した側) ---------------- */

  describe('★ 対照 + 直し: 描けない値 (NaN / ±Infinity) を図に持ち込まない', () => {
    /*
     * **上の「NaN が無い」は不在の主張なので、標本を添える** (CLAUDE.md の規約)。
     *
     * ここは同時に**直した側の検査**でもある。2026-09-12 まで `lineChart` は
     * 非有限値を素通しし、値に 1 つ NaN が混じるだけで実測こうなっていた:
     *
     *   <line y1="NaN" …/>  <text …>NaN 件</text>  points="NaN,NaN NaN,120"
     *
     * SVG は NaN の座標を**何も描かない**ので、画面には
     * **枠と凡例だけが在って線が無い図**が出ていた。`pieChart` / `radarChart` は
     * 同じファイルの中で既に `Number.isFinite` で弾いていた —— 素通しは
     * この 1 関数だけだった。
     */
    it('混じった NaN はその点だけ落ちる (残りは横軸の位置を保つ)', () => {
      const html = line({ series: [{ label: 'x', values: [Number.NaN, 10, 20] }], unit: '件', options: LINE_OPTS });
      expect(html).not.toContain('NaN');
      // 3 つの値のうち描けるのは 2 つ。
      expect(tagsOf(html, 'circle')).toHaveLength(2);
      // 落ちた点の位置に別の点が繰り上がっていないこと (添字はそのまま)。
      const full = lineChart([{ label: 'x', values: [0, 10, 20] }], LINE_OPTS);
      const kept = lineChart([{ label: 'x', values: [Number.NaN, 10, 20] }], LINE_OPTS);
      expect(kept.series[0]?.points.map((pt) => pt.x)).toEqual(
        full.series[0]?.points.slice(1).map((pt) => pt.x),
      );
    });

    it.each([[Number.NaN], [Number.POSITIVE_INFINITY], [Number.NEGATIVE_INFINITY]])(
      '全部が %p なら「データなし」を出す (それらしい図を描かない)',
      (bad) => {
        const html = line({ series: [{ label: 'x', values: [bad, bad] }], unit: '件', options: LINE_OPTS });
        expect(html).toContain('role="status"');
        expect(html).not.toContain('<svg');
        expect(html).not.toContain('NaN');
        expect(html).not.toContain('Infinity');
      },
    );

    it('対照: 走査は実際に NaN を掴む (弾く前の姿を標本で確かめる)', () => {
      // `lineChart` を通さず、同じ読み取りで NaN 入りの札を見せる。
      // ここが通らないなら上の `not.toContain('NaN')` は綴り違いで黙っている。
      const sample = '<text x="48" y="NaN" font-size="9">NaN 件</text>';
      expect(sample).toContain('NaN');
      expect(textsOf(sample)).toEqual(['NaN 件']);
    });
  });

  /* ---------------- 描画そのものの警告 ---------------- */

  it('★ 全見本 × 3 種を刷って React の警告が 1 件も出ない (鍵の重複・不正な属性)', () => {
    /*
     * `key` の重複や DOM に無い属性は**投げずに警告だけ**出す。カバレッジは
     * 埋まったまま図が崩れる形なので、刷りながら console を見る。
     */
    const errors: unknown[][] = [];
    const spyE = vi.spyOn(console, 'error').mockImplementation((...a: unknown[]) => void errors.push(a));
    const spyW = vi.spyOn(console, 'warn').mockImplementation((...a: unknown[]) => void errors.push(a));
    try {
      for (const d of CHART_DATASETS) {
        line({ series: d.line, unit: d.unit, title: d.label, options: { ...LINE_OPTS, xLabels: d.xLabels, gutter: 52 } });
        pie({ slices: d.pie, title: d.label, options: { size: PIE_SIZE, innerRadius: 60 } });
        radar({ axes: d.radarAxes, series: d.radar, title: d.label, options: { size: RADAR_SIZE } });
      }
    } finally {
      spyE.mockRestore();
      spyW.mockRestore();
    }
    expect(errors.map((a) => String(a[0]))).toEqual([]);
  });
});
