import { describe, expect, it } from 'vitest';
import {
  formatTick,
  lineChart,
  pieChart,
  radarChart,
} from '../charts';
import {
  CHART_DATASETS,
  findDataset,
  seededRandom,
  seriesColor,
  syntheticSeries,
} from '../chartFixtures';
import {
  checkLine,
  checkPie,
  checkRadar,
  runSelfCheck,
} from '../chartSelfCheck';

describe('lineChart', () => {
  it('系列が空なら空の geometry を返す', () => {
    const g = lineChart([]);
    expect(g.series).toEqual([]);
    expect(g.yTicks).toEqual([]);
    expect(g.zeroY).toBeNull();
  });

  it('値が大きいほど y が小さい（軸が反転している）', () => {
    const g = lineChart([{ label: 'a', values: [0, 100] }], { width: 100, height: 100, pad: 0 });
    const lo = g.series[0]!.points[0]!;
    const hi = g.series[0]!.points[1]!;
    expect(hi.y).toBeLessThan(lo.y);
    expect(lo.y).toBe(100);
    expect(hi.y).toBe(0);
  });

  it('全値が同一でも 0 除算せず中央の水平線になる', () => {
    const g = lineChart([{ label: 'flat', values: [7, 7, 7] }], { height: 100, pad: 0 });
    const ys = g.series[0]!.points.map((p) => p.y);
    expect(new Set(ys).size).toBe(1);
    expect(ys[0]).toBe(50);
    expect(Number.isFinite(ys[0])).toBe(true);
  });

  it('点が 1 つのときは中央に置く', () => {
    const g = lineChart([{ label: 'one', values: [5] }], { width: 200 });
    expect(g.series[0]!.points).toHaveLength(1);
    expect(g.series[0]!.points[0]!.x).toBe(100);
  });

  it('値域に 0 を含むときだけ zeroY を返す', () => {
    expect(lineChart([{ label: 'a', values: [-5, 5] }]).zeroY).not.toBeNull();
    expect(lineChart([{ label: 'a', values: [10, 20] }]).zeroY).toBeNull();
  });

  it('値域は全系列を通して決まる（系列ごとに正規化しない）', () => {
    const g = lineChart([
      { label: 'small', values: [1, 2] },
      { label: 'big', values: [100, 200] },
    ]);
    expect(g.min).toBe(1);
    expect(g.max).toBe(200);
    // small の 2 点は big より必ず下に来る
    const small = g.series[0]!.points.map((p) => p.y);
    const big = g.series[1]!.points.map((p) => p.y);
    expect(Math.min(...small)).toBeGreaterThan(Math.max(...big));
  });

  it('zeroBased で下端が 0 に固定される', () => {
    expect(lineChart([{ label: 'a', values: [10, 20] }], { zeroBased: true }).min).toBe(0);
  });

  it('xLabels は系列の最大長までしか使わない', () => {
    const g = lineChart([{ label: 'a', values: [1, 2] }], { xLabels: ['x', 'y', 'z'] });
    expect(g.xTicks).toHaveLength(2);
  });

  it('yTickCount は最低 2 本に丸められる', () => {
    expect(lineChart([{ label: 'a', values: [1, 2] }], { yTickCount: 0 }).yTicks).toHaveLength(2);
  });

  it('gutter を空けると描画が溝より右から始まる（ラベルと重ならない）', () => {
    const g = lineChart([{ label: 'a', values: [1, 2, 3] }], {
      width: 200,
      pad: 0,
      gutter: 50,
    });
    expect(g.series[0]!.points[0]!.x).toBe(50);
    expect(g.series[0]!.points[2]!.x).toBe(200);
  });

  it('gutter が広すぎても描画領域が消えない（幅の 40% で頭打ち）', () => {
    const g = lineChart([{ label: 'a', values: [1, 2] }], {
      width: 100,
      pad: 0,
      gutter: 999,
    });
    const xs = g.series[0]!.points.map((p) => p.x);
    expect(xs[0]).toBeLessThan(xs[1]!);
    expect(xs[1]).toBe(100);
  });

  it('gutter があっても 1 点のときは描画領域の中央', () => {
    const g = lineChart([{ label: 'a', values: [5] }], { width: 100, pad: 0, gutter: 40 });
    expect(g.series[0]!.points[0]!.x).toBe(70);
  });

  it('polyline は "x,y x,y" 形式', () => {
    const g = lineChart([{ label: 'a', values: [0, 1] }], { width: 10, height: 10, pad: 0 });
    expect(g.series[0]!.polyline).toBe('0,10 10,0');
  });
});

describe('formatTick', () => {
  it('桁に応じて丸める', () => {
    expect(formatTick(1234.56)).toBe('1235');
    expect(formatTick(12.345)).toBe('12.3');
    expect(formatTick(1.234)).toBe('1.23');
    expect(formatTick(-12.345)).toBe('-12.3');
  });
});

describe('pieChart', () => {
  it('合計が 0 ならスライスを作らない（NaN の扇形を描かない）', () => {
    const g = pieChart([{ label: 'a', value: 0 }]);
    expect(g.slices).toEqual([]);
    expect(g.total).toBe(0);
  });

  it('負の値は無視する', () => {
    const g = pieChart([
      { label: 'pos', value: 10 },
      { label: 'neg', value: -5 },
    ]);
    expect(g.slices.map((s) => s.label)).toEqual(['pos']);
    expect(g.total).toBe(10);
  });

  it('割合の合計が 1 になり角度が 360 を埋める', () => {
    const g = pieChart([
      { label: 'a', value: 1 },
      { label: 'b', value: 2 },
      { label: 'c', value: 1 },
    ]);
    expect(g.slices.reduce((a, s) => a + s.ratio, 0)).toBeCloseTo(1, 12);
    expect(g.slices[g.slices.length - 1]!.endAngle).toBeCloseTo(360, 12);
    expect(g.slices[0]!.startAngle).toBe(0);
  });

  it('100%（単一スライス）は円として描く — 円弧だと消えるため', () => {
    const g = pieChart([{ label: 'only', value: 5 }]);
    expect(g.slices).toHaveLength(1);
    // 扇形の path (M cx cy L …) ではなく円弧2本の path になる
    expect(g.slices[0]!.path).toContain('a ');
    expect(g.slices[0]!.path).not.toContain('NaN');
    expect(g.slices[0]!.ratio).toBe(1);
  });

  it('ドーナツの 100% は内円も描く', () => {
    const g = pieChart([{ label: 'only', value: 5 }], { size: 200, innerRadius: 40 });
    // 外円 + 内円 で "Z" が 2 つ
    expect(g.slices[0]!.path.match(/Z/g) ?? []).toHaveLength(2);
  });

  it('180°を超える扇形は large-arc フラグが立つ', () => {
    const g = pieChart([
      { label: 'big', value: 3 },
      { label: 'small', value: 1 },
    ]);
    expect(g.slices[0]!.path).toMatch(/A \d+(\.\d+)? \d+(\.\d+)? 0 1 1/);
    expect(g.slices[1]!.path).toMatch(/A \d+(\.\d+)? \d+(\.\d+)? 0 0 1/);
  });

  it('最初のスライスは 12 時方向から始まる', () => {
    const g = pieChart([
      { label: 'a', value: 1 },
      { label: 'b', value: 1 },
    ], { size: 100, pad: 0 });
    // 12 時 = (cx, cy - r) = (50, 0)
    expect(g.slices[0]!.path).toContain('L 50 0');
  });

  it('innerRadius は半径未満に丸められる（内外が反転しない）', () => {
    const g = pieChart([{ label: 'a', value: 1 }, { label: 'b', value: 1 }], {
      size: 100,
      innerRadius: 999,
    });
    expect(g.slices[0]!.path).not.toContain('NaN');
  });
});

describe('radarChart', () => {
  it('軸が 3 本未満なら描かない', () => {
    expect(radarChart(['a', 'b'], [{ label: 's', values: [1, 2] }]).axes).toEqual([]);
    expect(radarChart([], []).series).toEqual([]);
  });

  it('軸数ぶんの頂点を作る', () => {
    const g = radarChart(['a', 'b', 'c'], [{ label: 's', values: [1, 2, 3] }]);
    expect(g.axes).toHaveLength(3);
    expect(g.series[0]!.points).toHaveLength(3);
  });

  it('値が足りない系列は不足分を min として扱う（詰めてずらさない）', () => {
    const g = radarChart(['a', 'b', 'c'], [{ label: 's', values: [100] }], { min: 0, max: 100 });
    const pts = g.series[0]!.points;
    expect(pts).toHaveLength(3);
    // 1 本目は最大なので外周、残りは中心
    expect(Math.hypot(pts[0]!.x - g.cx, pts[0]!.y - g.cy)).toBeCloseTo(g.radius, 1);
    expect(Math.hypot(pts[1]!.x - g.cx, pts[1]!.y - g.cy)).toBeCloseTo(0, 1);
  });

  it('全頂点が外周の内側に収まる', () => {
    const g = radarChart(['a', 'b', 'c', 'd'], [{ label: 's', values: [999, -999, 0, 50] }]);
    for (const p of g.series[0]!.points) {
      expect(Math.hypot(p.x - g.cx, p.y - g.cy)).toBeLessThanOrEqual(g.radius + 0.2);
    }
  });

  it('min===max でも 0 除算しない', () => {
    const g = radarChart(['a', 'b', 'c'], [{ label: 's', values: [5, 5, 5] }], { min: 5, max: 5 });
    for (const p of g.series[0]!.points) {
      expect(Number.isFinite(p.x)).toBe(true);
      expect(Number.isFinite(p.y)).toBe(true);
    }
  });

  it('リングは内側から外側の順で指定本数ぶん作る', () => {
    const g = radarChart(['a', 'b', 'c'], [], { rings: 3 });
    expect(g.rings).toHaveLength(3);
    const radiusOf = (ring: string): number => {
      const [x, y] = ring.split(' ')[0]!.split(',').map(Number);
      if (x === undefined || y === undefined) return NaN;
      return Math.hypot(x! - g.cx, y! - g.cy);
    };
    expect(radiusOf(g.rings[0]!)).toBeLessThan(radiusOf(g.rings[2]!));
  });

  it('1 本目の軸は 12 時方向', () => {
    const g = radarChart(['top', 'b', 'c'], [], { size: 100, pad: 0 });
    expect(g.axes[0]!.at.x).toBeCloseTo(50, 1);
    expect(g.axes[0]!.at.y).toBeCloseTo(0, 1);
  });
});

describe('仮想データ', () => {
  it('seededRandom は同じシードで同じ列を返す（決定論）', () => {
    const a = seededRandom(42);
    const b = seededRandom(42);
    const xs = [a(), a(), a()];
    const ys = [b(), b(), b()];
    expect(xs).toEqual(ys);
    expect(new Set(xs).size).toBe(3);
    for (const v of xs) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('seededRandom はシードが違えば違う列になる', () => {
    const a = seededRandom(1);
    const b = seededRandom(2);
    expect(a()).not.toBe(b());
  });

  it('seededRandom(0) でも停止しない（状態 0 の縮退を避ける）', () => {
    const r = seededRandom(0);
    expect(r()).not.toBe(r());
  });

  it('syntheticSeries は決定論で、指定した長さを返す', () => {
    expect(syntheticSeries(7, 5, 100, 0.1)).toEqual(syntheticSeries(7, 5, 100, 0.1));
    expect(syntheticSeries(7, 5, 100, 0.1)).toHaveLength(5);
  });

  it('syntheticSeries の trend は右肩上がりを作る', () => {
    const s = syntheticSeries(9, 10, 1000, 0, 0.05);
    expect(s[9]!).toBeGreaterThan(s[0]!);
  });

  it('swing=0 かつ trend=0 なら全値が base', () => {
    expect(syntheticSeries(3, 4, 42, 0, 0)).toEqual([42, 42, 42, 42]);
  });

  it('findDataset は未知 id で null', () => {
    expect(findDataset('finance')?.id).toBe('finance');
    expect(findDataset('nope')).toBeNull();
  });

  it('seriesColor は index を巡回する', () => {
    expect(seriesColor(0)).toBe(seriesColor(6));
    expect(seriesColor(0)).not.toBe(seriesColor(1));
  });

  it('全データセットが 3 種すべての形を持つ', () => {
    expect(CHART_DATASETS.length).toBeGreaterThan(0);
    for (const d of CHART_DATASETS) {
      expect(d.line.length).toBeGreaterThan(0);
      expect(d.pie.length).toBeGreaterThan(0);
      expect(d.radarAxes.length).toBeGreaterThan(0);
      expect(d.radar.length).toBeGreaterThan(0);
    }
  });

  it('データセット id は一意', () => {
    const ids = CHART_DATASETS.map((d) => d.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('自己検査', () => {
  it('全データセット × 3 種がすべて通る', () => {
    const report = runSelfCheck();
    const failures = report.datasets.flatMap((d) =>
      d.results.filter((r) => !r.ok).map((r) => `${d.label}: ${r.name} — ${r.detail}`),
    );
    expect(failures).toEqual([]);
    expect(report.allPassed).toBe(true);
    expect(report.passed).toBeGreaterThan(0);
  });

  // --- 負のコントロール: 検査器が本当に落とせるか ---

  it('折れ線: 点数がずれたら検出する', () => {
    // 極端に小さい領域でも軸は反転しない（余白のクランプが効いている）
    const tiny = checkLine([{ label: 'a', values: [0, 100] }], 10, 10);
    expect(tiny.every((r) => r.ok)).toBe(true);
    // 高さ 0 では上下の区別がつかない → 「大きい値ほど上」が成立せず検出される
    const broken = checkLine([{ label: 'a', values: [0, 100] }], 10, 0);
    expect(broken.some((r) => !r.ok)).toBe(true);
  });

  it('円: 正の値が無ければスライス 0 として扱われる', () => {
    const results = checkPie([{ label: 'z', value: 0 }], 100);
    expect(results.every((r) => r.ok)).toBe(true);
    expect(results.some((r) => r.name.includes('正の値のみ'))).toBe(true);
  });

  it('レーダー: 軸 2 本は「描かない」が期待どおり', () => {
    const results = checkRadar(['a', 'b'], [{ label: 's', values: [1, 2] }], 100);
    expect(results).toHaveLength(1);
    expect(results[0]!.ok).toBe(true);
  });

  it('レーダー: 頂点数の不一致を検出できる', () => {
    const results = checkRadar(['a', 'b', 'c'], [{ label: 's', values: [1, 2, 3] }], 100);
    expect(results.every((r) => r.ok)).toBe(true);
  });

  it('検査器は失敗時に detail を埋める', () => {
    const broken = checkLine([{ label: 'a', values: [0, 100] }], 10, 0);
    const failed = broken.filter((r) => !r.ok);
    expect(failed.length).toBeGreaterThan(0);
    for (const f of failed) expect(f.detail).not.toBeNull();
  });

  it('成功時は detail が null', () => {
    const report = runSelfCheck();
    for (const d of report.datasets) {
      for (const r of d.results) {
        if (r.ok) expect(r.detail).toBeNull();
      }
    }
  });
});
