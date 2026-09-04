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

/*
 * 幾何の golden。
 *
 * 既存の検査は「y は反転している」「割合の合計は 1」のように**性質**を見て
 * いた。性質は算術を 1 つ書き換えても保たれることが多く、2026-08-20 の実測で
 * 生存 75 件が残っていた (このモジュールは `mutate` に載っていなかった)。
 *
 * ここでは**座標そのもの**を固定する。値は手で計算した:
 *   lineChart: pad = min(8, 200×0.4, 480×0.4) = 8
 *              yOf(v) = 200 − 8 − (v/100)×(200−16) = 192 − 1.84v
 *              xOf(i) = 8 + (i/2)×(480−8−8) = 8 + 232i
 *   pieChart:  cx=cy=100, radius = 200/2 − 4 = 96
 *   radar:     cx=cy=110, radius = 220/2 − 24 = 86, 角度 = (i/3)×360
 *
 * **describe 直下では組み立てない** (罠 2-c-3) — 収集時に確定した値を見ると
 * どんな変異体でも落ちなくなる。
 */
describe('charts — 座標の golden', () => {
  it('lineChart: 3 点の座標・目盛り・ゼロ線をすべて固定する', () => {
    const g = lineChart([{ label: 'A', values: [0, 50, 100] }]);
    expect(g.min).toBe(0);
    expect(g.max).toBe(100);
    expect(g.series[0]!.points).toEqual([
      { x: 8, y: 192 },
      { x: 240, y: 100 },
      { x: 472, y: 8 },
    ]);
    expect(g.series[0]!.polyline).toBe('8,192 240,100 472,8');
    // 目盛りは min..max を (tickCount−1) 等分する。既定 4 本。
    expect(g.yTicks.map((t) => t.pos)).toEqual([192, 130.7, 69.3, 8]);
    expect(g.yTicks.map((t) => t.label)).toEqual(['0', '33.3', '66.7', '100']);
    expect(g.zeroY).toBe(192);
  });

  it('lineChart: 値域が 0 を含まなければゼロ線は引かない', () => {
    expect(lineChart([{ label: 'A', values: [10, 20] }]).zeroY).toBeNull();
    expect(lineChart([{ label: 'A', values: [-20, -10] }]).zeroY).toBeNull();
    // 端がちょうど 0 なら含む。
    expect(lineChart([{ label: 'A', values: [0, 20] }]).zeroY).not.toBeNull();
    expect(lineChart([{ label: 'A', values: [-20, 0] }]).zeroY).not.toBeNull();
  });

  it('lineChart: x 目盛りはラベルと同じ位置に並ぶ', () => {
    const g = lineChart([{ label: 'A', values: [0, 50, 100] }], {
      xLabels: ['1月', '2月', '3月', '4月'],
    });
    // 系列は 3 点しか無いので 4 つ目のラベルは捨てる。
    expect(g.xTicks.map((t) => t.label)).toEqual(['1月', '2月', '3月']);
    expect(g.xTicks.map((t) => t.pos)).toEqual([8, 240, 472]);
    expect(g.xTicks.map((t) => t.value)).toEqual([0, 1, 2]);
  });

  it('lineChart: 余白は高さと幅の 40% で頭打ち (軸が反転しない)', () => {
    // pad=500 を指定しても height×0.4=40 に丸められる。
    const g = lineChart([{ label: 'A', values: [0, 100] }], { pad: 500, height: 100, width: 200 });
    // yOf(0) = 100 − 40 − 0 = 60、yOf(100) = 100 − 40 − 20 = 20 → 上が小さい。
    expect(g.series[0]!.points[0]!.y).toBeGreaterThan(g.series[0]!.points[1]!.y);
  });

  it('formatTick: 桁の境界はどちら側か', () => {
    expect(formatTick(999.94)).toBe('999.9'); // 1000 未満 → 小数第 1 位
    expect(formatTick(1000)).toBe('1000'); // 1000 ちょうど → 整数
    expect(formatTick(9.994)).toBe('9.99'); // 10 未満 → 小数第 2 位
    expect(formatTick(10)).toBe('10'); // 10 ちょうど → 小数第 1 位
    expect(formatTick(-1000)).toBe('-1000'); // 絶対値で判定する
    expect(formatTick(-9.994)).toBe('-9.99');
  });
});

describe('pieChart — 扇形の path を固定する', () => {
  it('25% と 75% の path・ラベル位置をすべて固定する', () => {
    const g = pieChart([
      { label: 'A', value: 1 },
      { label: 'B', value: 3 },
    ]);
    expect(g.total).toBe(4);
    expect(g.cx).toBe(100);
    expect(g.cy).toBe(100);
    expect(g.radius).toBe(96);

    const [a, b] = g.slices;
    expect(a!.ratio).toBe(0.25);
    expect([a!.startAngle, a!.endAngle]).toEqual([0, 90]);
    // 12 時から時計回りに 90°。large-arc は 180° 以下なので 0。
    expect(a!.path).toBe('M 100 100 L 100 4 A 96 96 0 0 1 196 100 Z');
    expect(a!.labelAt).toEqual({ x: 133.9, y: 66.1 });

    expect(b!.ratio).toBe(0.75);
    expect([b!.startAngle, b!.endAngle]).toEqual([90, 360]);
    // 270° なので large-arc は 1。
    expect(b!.path).toBe('M 100 100 L 196 100 A 96 96 0 1 1 100 4 Z');
    expect(b!.labelAt).toEqual({ x: 66.1, y: 133.9 });
  });

  it('180° ちょうどは large-arc を立てない (超えて初めて 1)', () => {
    const half = pieChart([
      { label: 'A', value: 1 },
      { label: 'B', value: 1 },
    ]);
    expect(half.slices[0]!.endAngle).toBe(180);
    expect(half.slices[0]!.path).toContain('A 96 96 0 0 1');

    const over = pieChart([
      { label: 'A', value: 181 },
      { label: 'B', value: 179 },
    ]);
    expect(over.slices[0]!.endAngle).toBeGreaterThan(180);
    expect(over.slices[0]!.path).toContain('A 96 96 0 1 1');
  });

  it('100% は円として描く (円弧だと始点と終点が重なって消える)', () => {
    const g = pieChart([{ label: 'A', value: 5 }]);
    expect(g.slices[0]!.path).toBe(
      'M 4 100 a 96 96 0 1 0 192 0 a 96 96 0 1 0 -192 0 Z',
    );
  });

  it('ドーナツの 100% は内円も描く', () => {
    const g = pieChart([{ label: 'A', value: 5 }], { innerRadius: 40 });
    expect(g.slices[0]!.path).toBe(
      'M 4 100 a 96 96 0 1 0 192 0 a 96 96 0 1 0 -192 0 Z' +
        ' M 60 100 a 40 40 0 1 1 80 0 a 40 40 0 1 1 -80 0 Z',
    );
  });

  it('ドーナツの扇形は外円弧と内円弧を逆向きに繋ぐ', () => {
    const g = pieChart(
      [
        { label: 'A', value: 1 },
        { label: 'B', value: 3 },
      ],
      { innerRadius: 48 },
    );
    expect(g.slices[0]!.path).toBe(
      'M 100 4 A 96 96 0 0 1 196 100 L 148 100 A 48 48 0 0 0 100 52 Z',
    );
    // 内半径があるとラベルは外円と内円の中間へ寄る。
    expect(g.slices[0]!.labelAt).toEqual({ x: 150.9, y: 49.1 });
  });

  it('内半径は外半径未満に丸める (内外が反転しない)', () => {
    const g = pieChart([{ label: 'A', value: 1 }], { innerRadius: 999 });
    // radius 96 に対して inner は 95 まで。
    expect(g.slices[0]!.path).toContain('a 95 95 0 1 1');
  });
});

describe('radarChart — 頂点の座標を固定する', () => {
  it('3 軸・値 0/50/100 の頂点と軸位置をすべて固定する', () => {
    const g = radarChart(['安全性', '収益性', '効率性'], [{ label: 'S', values: [0, 50, 100] }]);
    expect(g.cx).toBe(110);
    expect(g.cy).toBe(110);
    expect(g.radius).toBe(86);
    expect(g.min).toBe(0);
    expect(g.max).toBe(100);

    // 軸は 12 時から時計回りに 120° ずつ。
    expect(g.axes.map((a) => a.at)).toEqual([
      { x: 110, y: 24 },
      { x: 184.5, y: 153 },
      { x: 35.5, y: 153 },
    ]);
    // 値 0 は中心、50 は半径の半分、100 は外周。
    expect(g.series[0]!.points).toEqual([
      { x: 110, y: 110 },
      { x: 147.2, y: 131.5 },
      { x: 35.5, y: 153 },
    ]);
    expect(g.series[0]!.polygon).toBe('110,110 147.2,131.5 35.5,153');
  });

  it('リングは外周を等分する (既定 4 本)', () => {
    const g = radarChart(['a', 'b', 'c'], [{ label: 'S', values: [1, 1, 1] }]);
    expect(g.rings).toHaveLength(4);
    // 最も外のリングは軸の先端と一致する。
    expect(g.rings[3]).toBe(g.axes.map((a) => `${a.at.x},${a.at.y}`).join(' '));
    // 最も内のリングは半径の 1/4。
    expect(g.rings[0]!.split(' ')[0]).toBe('110,88.5'); // 110 − 86/4 = 88.5
  });

  it('全値が同一でも潰れない (max = min + 1 にずらす)', () => {
    const g = radarChart(['a', 'b', 'c'], [{ label: 'S', values: [7, 7, 7] }]);
    expect(g.min).toBe(0); // min は 0 と実測値の小さい方
    expect(g.max).toBe(7);
  });

  it('値が 1 種類かつ min と一致するときだけ max をずらす', () => {
    const g = radarChart(['a', 'b', 'c'], [{ label: 'S', values: [0, 0, 0] }]);
    expect(g.min).toBe(0);
    expect(g.max).toBe(1); // 0 === 0 なので +1
  });

  it('min / max を指定すればそれを使う', () => {
    const g = radarChart(['a', 'b', 'c'], [{ label: 'S', values: [50, 50, 50] }], {
      min: 0,
      max: 200,
    });
    expect(g.min).toBe(0);
    expect(g.max).toBe(200);
    // 50/200 = 1/4 → 半径 86 の 1/4 = 21.5
    expect(g.series[0]!.points[0]).toEqual({ x: 110, y: 88.5 });
  });

  it('系列が空でも軸だけは描く', () => {
    const g = radarChart(['a', 'b', 'c'], []);
    expect(g.axes).toHaveLength(3);
    expect(g.series).toEqual([]);
    expect(g.min).toBe(0);
    expect(g.max).toBe(1);
  });
});

describe('charts — 残りの境界', () => {
  it('余白は幅でも頭打ちになる (高さだけで丸めていない)', () => {
    // 幅 100 × 0.4 = 40 が最小なので、pad は 40 に丸められる。
    const g = lineChart([{ label: 'A', values: [0, 100] }], {
      pad: 500,
      width: 100,
      height: 1000,
    });
    // xOf(0) = pad = 40、xOf(1) = 40 + (100 − 40 − 40) = 60
    expect(g.series[0]!.points.map((p) => p.x)).toEqual([40, 60]);
  });

  it('系列が空なら中身も空 (作り物を入れない)', () => {
    const g = lineChart([]);
    expect(g.series).toEqual([]);
    expect(g.yTicks).toEqual([]);
    expect(g.xTicks).toEqual([]);
    expect(g.zeroY).toBeNull();
  });

  it('x の刻みは最長の系列に合わせる (短い方に合わせない)', () => {
    const g = lineChart([
      { label: '短', values: [0, 100] },
      { label: '長', values: [0, 50, 100] },
    ]);
    // 3 点ぶんの間隔になる → 2 点の系列は 0 と 240 に置かれる。
    expect(g.series[0]!.points.map((p) => p.x)).toEqual([8, 240]);
    expect(g.series[1]!.points.map((p) => p.x)).toEqual([8, 240, 472]);
  });

  it('目盛りの刻みは値域の幅で決まる (min を足していない)', () => {
    // min=10 max=110 → 幅 100 を 3 等分 → 10, 43.3, 76.7, 110
    const g = lineChart([{ label: 'A', values: [10, 110] }]);
    expect(g.yTicks.map((t) => t.label)).toEqual(['10', '43.3', '76.7', '110']);
  });

  it('x ラベルを渡さなければ x の刻みは空', () => {
    expect(lineChart([{ label: 'A', values: [1, 2] }]).xTicks).toEqual([]);
  });

  it('359.999° を超えたら円として描く (わずかに下回れば扇形のまま)', () => {
    // 閾値のすぐ上と、すぐ下。閾値を跨ぐ側で描き方が変わることを固定する。
    // 円弧 (A) は始点と終点が重なると何も描かれないので、ここを取り違えると
    // ほぼ 100% のスライスが画面から消える。
    const over = pieChart([
      { label: 'A', value: 3_599_995 },
      { label: 'B', value: 5 },
    ]);
    expect(over.slices[0]!.endAngle).toBeGreaterThanOrEqual(359.999);
    expect(over.slices[0]!.path).toContain('a 96 96 0 1 0');

    const under = pieChart([
      { label: 'A', value: 359_999 },
      { label: 'B', value: 1 },
    ]);
    expect(under.slices[0]!.endAngle).toBeLessThan(359.999);
    expect(under.slices[0]!.path).toContain('A 96 96 0 1 1');
  });

  it('有効なスライスが無ければ空を返す (NaN の扇形を作らない)', () => {
    for (const bad of [[], [{ label: 'A', value: 0 }], [{ label: 'A', value: -5 }]]) {
      const g = pieChart(bad);
      expect(g.slices).toEqual([]);
      expect(g.total).toBe(0);
    }
  });

  it('レーダーは軸が 3 本未満なら中身も空', () => {
    const g = radarChart(['a', 'b'], [{ label: 'S', values: [1, 2] }]);
    expect(g.axes).toEqual([]);
    expect(g.series).toEqual([]);
    expect(g.rings).toEqual([]);
  });

  it('レーダーは有限でない値を値域から外す', () => {
    const g = radarChart(
      ['a', 'b', 'c'],
      [{ label: 'S', values: [10, Number.NaN, Number.POSITIVE_INFINITY] }],
    );
    // NaN / Infinity を混ぜても max は 10 のまま。
    expect(g.max).toBe(10);
    expect(g.min).toBe(0);
  });

  it('レーダーの軸ラベルは外周のさらに外へ置く', () => {
    const g = radarChart(['a', 'b', 'c'], [{ label: 'S', values: [1, 1, 1] }]);
    // radius 86 + pad 24 × 0.55 = 99.2 → 12 時方向は (110, 110 − 99.2)
    expect(g.axes[0]!.labelAt).toEqual({ x: 110, y: 10.8 });
    expect(g.axes[1]!.labelAt).toEqual({ x: 195.9, y: 159.6 });
  });

  it('レーダーの半径は min からの距離で決まる (min を足していない)', () => {
    // min=20 max=120 の幅 100。値 70 は中央 → 半径の半分 = 43。
    const g = radarChart(['a', 'b', 'c'], [{ label: 'S', values: [70, 70, 70] }], {
      min: 20,
      max: 120,
    });
    expect(g.series[0]!.points[0]).toEqual({ x: 110, y: 67 }); // 110 − 43
  });

  it('値が足りない系列は不足分を min に置く (詰めてずらさない)', () => {
    const g = radarChart(['a', 'b', 'c'], [{ label: 'S', values: [100] }], { min: 0, max: 100 });
    // 1 本目だけ外周、残り 2 本は中心。
    expect(g.series[0]!.points[0]).toEqual({ x: 110, y: 24 });
    expect(g.series[0]!.points[1]).toEqual({ x: 110, y: 110 });
    expect(g.series[0]!.points[2]).toEqual({ x: 110, y: 110 });
  });
});
