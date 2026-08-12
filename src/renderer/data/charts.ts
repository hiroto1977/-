/**
 * チャート 3 種 (折れ線 / 円 / レーダー) の座標計算 — 純粋な幾何ロジック。
 *
 * `sparkline.ts` と同じ方針で、**描画は呼び出し側 (SVG) が行い、本モジュールは
 * 座標計算のみ**を担う (IO なし・DOM なし)。こうしておくと Node のテストで
 * 座標を数値として検証でき、変異テストも効く。
 *
 * ## 退化ケースを黙って通さない
 *
 * グラフは「それらしい図」が出てしまうのが最悪で、値が壊れていても目視では
 * 気づけない。そこで境界を明示的に扱う:
 *
 * - 系列が空      → 空の geometry を返す (呼び出し側が「データなし」を出せる)
 * - 点が 1 つ     → 折れ線は中央に 1 点。レーダーは軸が 3 本未満なら空
 * - 全値が同一    → 折れ線は中央の水平線 (0 除算しない)
 * - 円グラフ合計 0 → スライスを作らない (NaN の扇形を描かない)
 * - 円グラフ 100% → SVG の円弧は 360°を描けないので**円として**返す
 *
 * ## 座標系
 *
 * SVG の y 軸は下向き。値が大きいほど上 (= y が小さい) になるよう反転する。
 * 角度は 12 時方向 (-90°) を 0 とし、時計回りに進む。
 */

/** 丸め — 座標を 0.1px 粒度に揃える (テストで文字列比較できるように)。 */
function r1(n: number): number {
  return Math.round(n * 10) / 10;
}

/* ------------------------------------------------------------------ *
 * 折れ線グラフ
 * ------------------------------------------------------------------ */

export interface ChartPoint {
  readonly x: number;
  readonly y: number;
}

export interface LineSeries {
  readonly label: string;
  readonly values: readonly number[];
}

export interface LineSeriesGeometry {
  readonly label: string;
  readonly points: readonly ChartPoint[];
  /** SVG polyline の points 属性。 */
  readonly polyline: string;
}

export interface AxisTick {
  readonly value: number;
  /** 目盛りを描く座標 (縦軸なら y、横軸なら x)。 */
  readonly pos: number;
  readonly label: string;
}

export interface LineChartGeometry {
  readonly series: readonly LineSeriesGeometry[];
  readonly min: number;
  readonly max: number;
  /** 値 0 の y 座標。値域に 0 を含まないときは null。 */
  readonly zeroY: number | null;
  readonly yTicks: readonly AxisTick[];
  readonly xTicks: readonly AxisTick[];
}

export interface LineChartOptions {
  readonly width?: number;
  readonly height?: number;
  readonly pad?: number;
  /** 横軸のラベル (系列の index に対応)。 */
  readonly xLabels?: readonly string[];
  /** 縦軸の目盛り本数 (既定 4)。 */
  readonly yTickCount?: number;
  /** 値域の下端を 0 に固定する (棒的な見せ方をしたいとき)。 */
  readonly zeroBased?: boolean;
  /**
   * 縦軸ラベルのために左に空ける幅 (px)。既定 0。
   * 0 のままだと**目盛りラベルと折れ線が重なって読めない** — 実機の
   * スクリーンショットで確認した実害。ラベルを出すなら必ず指定する。
   */
  readonly gutter?: number;
}

/**
 * 複数系列を折れ線の座標へ変換する。
 *
 * 値域は**全系列を通じた** min/max で決める（系列ごとに正規化すると、
 * 見た目が揃っているのに実際は桁が違う、という誤読を生むため）。
 */
export function lineChart(
  series: readonly LineSeries[],
  options: LineChartOptions = {},
): LineChartGeometry {
  const width = options.width ?? 480;
  const height = options.height ?? 200;
  // 余白が描画領域を食い潰すと `height - pad*2` が負になり、**軸が反転する**
  // （値が大きいほど下に描かれる）。図としては成立して見えるので目視では
  // 気づけない。テストで実際に踏んだので、余白は領域の 40% までに丸める。
  const pad = Math.min(options.pad ?? 8, height * 0.4, width * 0.4);
  const tickCount = Math.max(2, options.yTickCount ?? 4);

  const all = series.flatMap((s) => s.values);
  if (all.length === 0) {
    return { series: [], min: 0, max: 0, zeroY: null, yTicks: [], xTicks: [] };
  }

  let min = Math.min(...all);
  let max = Math.max(...all);
  if (options.zeroBased === true) min = Math.min(0, min);
  if (min === max) {
    // 全値が同一。上下に幅を持たせて中央の水平線にする（0 除算を避ける）。
    min -= 1;
    max += 1;
  }

  const yOf = (v: number): number =>
    height - pad - ((v - min) / (max - min)) * (height - pad * 2);

  // 左の余白は「目盛りラベルのための溝」。ここを確保しないと折れ線が
  // ラベルの上に重なる。溝が広すぎて描画領域が消えないよう幅の 40% で頭打ち。
  const gutter = Math.min(Math.max(0, options.gutter ?? 0), width * 0.4);
  const left = pad + gutter;
  const longest = Math.max(...series.map((s) => s.values.length));
  const xOf = (i: number): number => {
    if (longest === 1) return (left + (width - pad)) / 2;
    return left + (i / (longest - 1)) * (width - pad - left);
  };

  const geo: LineSeriesGeometry[] = series.map((s) => {
    const points = s.values.map((v, i) => ({ x: r1(xOf(i)), y: r1(yOf(v)) }));
    return {
      label: s.label,
      points,
      polyline: points.map((p) => `${p.x},${p.y}`).join(' '),
    };
  });

  const yTicks: AxisTick[] = [];
  for (let i = 0; i < tickCount; i += 1) {
    const v = min + ((max - min) * i) / (tickCount - 1);
    yTicks.push({ value: v, pos: r1(yOf(v)), label: formatTick(v) });
  }

  const labels = options.xLabels ?? [];
  const xTicks: AxisTick[] = labels.slice(0, longest).map((label, i) => ({
    value: i,
    pos: r1(xOf(i)),
    label,
  }));

  return {
    series: geo,
    min,
    max,
    zeroY: min <= 0 && max >= 0 ? r1(yOf(0)) : null,
    yTicks,
    xTicks,
  };
}

/** 目盛りラベル — 桁に応じて丸める（1234567 → 1.2M のような潰しはしない）。 */
export function formatTick(v: number): string {
  const a = Math.abs(v);
  if (a >= 1000) return String(Math.round(v));
  if (a >= 10) return String(Math.round(v * 10) / 10);
  return String(Math.round(v * 100) / 100);
}

/* ------------------------------------------------------------------ *
 * 円グラフ (ドーナツ対応)
 * ------------------------------------------------------------------ */

export interface PieSlice {
  readonly label: string;
  readonly value: number;
}

export interface PieSliceGeometry {
  readonly label: string;
  readonly value: number;
  /** 全体に占める割合 (0..1)。合計が 0 のときは 0。 */
  readonly ratio: number;
  /** SVG path の d 属性。 */
  readonly path: string;
  /** ラベルを置くのに適した点 (扇の重心寄り)。 */
  readonly labelAt: ChartPoint;
  readonly startAngle: number;
  readonly endAngle: number;
}

export interface PieChartGeometry {
  readonly slices: readonly PieSliceGeometry[];
  readonly total: number;
  readonly cx: number;
  readonly cy: number;
  readonly radius: number;
}

export interface PieChartOptions {
  readonly size?: number;
  /** ドーナツの内径 (0 なら普通の円グラフ)。 */
  readonly innerRadius?: number;
  readonly pad?: number;
}

/** 角度 (度) → 座標。12 時を 0 とし時計回り。 */
function polar(cx: number, cy: number, radius: number, angleDeg: number): ChartPoint {
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  return { x: r1(cx + radius * Math.cos(rad)), y: r1(cy + radius * Math.sin(rad)) };
}

/**
 * 値の配列を円グラフの扇形へ変換する。
 *
 * **負の値は無視する** (面積として意味を持たないため)。合計が 0 なら
 * スライスを 1 つも返さない — NaN の path を描いて「それらしい図」に
 * するより、呼び出し側に「データなし」を出させるほうが安全。
 */
export function pieChart(
  slices: readonly PieSlice[],
  options: PieChartOptions = {},
): PieChartGeometry {
  const size = options.size ?? 200;
  const pad = options.pad ?? 4;
  const cx = size / 2;
  const cy = size / 2;
  const radius = size / 2 - pad;
  const inner = Math.max(0, Math.min(options.innerRadius ?? 0, radius - 1));

  const valid = slices.filter((s) => Number.isFinite(s.value) && s.value > 0);
  const total = valid.reduce((sum, s) => sum + s.value, 0);
  if (total <= 0) return { slices: [], total: 0, cx, cy, radius };

  const out: PieSliceGeometry[] = [];
  let angle = 0;
  for (const s of valid) {
    const ratio = s.value / total;
    const start = angle;
    const end = angle + ratio * 360;
    angle = end;
    out.push({
      label: s.label,
      value: s.value,
      ratio,
      path: arcPath(cx, cy, radius, inner, start, end),
      labelAt: polar(cx, cy, (radius + inner) / 2, (start + end) / 2),
      startAngle: start,
      endAngle: end,
    });
  }
  return { slices: out, total, cx, cy, radius };
}

/**
 * 扇形 (またはドーナツ片) の path を組む。
 *
 * SVG の円弧は始点と終点が一致すると**何も描かれない**ので、360° は
 * 円 (ドーナツなら二重円) として表現する。スライスが 1 つだけのときに
 * 図が消える、という分かりにくい不具合を避けるため。
 */
function arcPath(
  cx: number,
  cy: number,
  radius: number,
  inner: number,
  startAngle: number,
  endAngle: number,
): string {
  const sweep = endAngle - startAngle;
  if (sweep >= 359.999) {
    const outer =
      `M ${r1(cx - radius)} ${r1(cy)} ` +
      `a ${radius} ${radius} 0 1 0 ${radius * 2} 0 ` +
      `a ${radius} ${radius} 0 1 0 ${-radius * 2} 0 Z`;
    if (inner <= 0) return outer;
    return (
      `${outer} M ${r1(cx - inner)} ${r1(cy)} ` +
      `a ${inner} ${inner} 0 1 1 ${inner * 2} 0 ` +
      `a ${inner} ${inner} 0 1 1 ${-inner * 2} 0 Z`
    );
  }
  const large = sweep > 180 ? 1 : 0;
  const p1 = polar(cx, cy, radius, startAngle);
  const p2 = polar(cx, cy, radius, endAngle);
  if (inner <= 0) {
    return `M ${r1(cx)} ${r1(cy)} L ${p1.x} ${p1.y} A ${radius} ${radius} 0 ${large} 1 ${p2.x} ${p2.y} Z`;
  }
  const q1 = polar(cx, cy, inner, endAngle);
  const q2 = polar(cx, cy, inner, startAngle);
  return (
    `M ${p1.x} ${p1.y} A ${radius} ${radius} 0 ${large} 1 ${p2.x} ${p2.y} ` +
    `L ${q1.x} ${q1.y} A ${inner} ${inner} 0 ${large} 0 ${q2.x} ${q2.y} Z`
  );
}

/* ------------------------------------------------------------------ *
 * レーダーチャート
 * ------------------------------------------------------------------ */

export interface RadarSeries {
  readonly label: string;
  /** 軸と同じ順・同じ長さの値。 */
  readonly values: readonly number[];
}

export interface RadarSeriesGeometry {
  readonly label: string;
  readonly points: readonly ChartPoint[];
  /** SVG polygon の points 属性。 */
  readonly polygon: string;
}

export interface RadarAxisGeometry {
  readonly label: string;
  /** 軸線の外端。 */
  readonly at: ChartPoint;
  /** ラベルを置く点 (外端よりやや外)。 */
  readonly labelAt: ChartPoint;
}

export interface RadarChartGeometry {
  readonly axes: readonly RadarAxisGeometry[];
  readonly series: readonly RadarSeriesGeometry[];
  /** 同心の目盛り多角形 (内側→外側)。 */
  readonly rings: readonly string[];
  readonly cx: number;
  readonly cy: number;
  readonly radius: number;
  readonly min: number;
  readonly max: number;
}

export interface RadarChartOptions {
  readonly size?: number;
  readonly pad?: number;
  /** 同心リングの本数 (既定 4)。 */
  readonly rings?: number;
  /** 値域を明示する (省略時は系列から算出)。 */
  readonly min?: number;
  readonly max?: number;
}

/**
 * 軸ラベルと系列をレーダーの座標へ変換する。
 *
 * **軸が 3 本未満なら空を返す** — 2 本以下では多角形にならず、線分や点が
 * レーダーのふりをするだけなので、描かせない。
 *
 * 系列の値の個数が軸数と違う場合は、足りない分を min として扱う
 * (勝手に詰めると軸とデータの対応がずれ、どの軸の値か読めなくなる)。
 */
export function radarChart(
  axisLabels: readonly string[],
  series: readonly RadarSeries[],
  options: RadarChartOptions = {},
): RadarChartGeometry {
  const size = options.size ?? 220;
  const pad = options.pad ?? 24;
  const ringCount = Math.max(1, options.rings ?? 4);
  const cx = size / 2;
  const cy = size / 2;
  const radius = size / 2 - pad;
  const n = axisLabels.length;

  if (n < 3) {
    return { axes: [], series: [], rings: [], cx, cy, radius, min: 0, max: 0 };
  }

  const all = series.flatMap((s) => s.values).filter((v) => Number.isFinite(v));
  const min = options.min ?? (all.length > 0 ? Math.min(0, ...all) : 0);
  let max = options.max ?? (all.length > 0 ? Math.max(...all) : 1);
  if (min === max) max = min + 1;

  const angleOf = (i: number): number => (i / n) * 360;
  const radiusOf = (v: number): number => {
    const t = (v - min) / (max - min);
    return radius * Math.min(1, Math.max(0, t));
  };

  const axes: RadarAxisGeometry[] = axisLabels.map((label, i) => ({
    label,
    at: polar(cx, cy, radius, angleOf(i)),
    labelAt: polar(cx, cy, radius + pad * 0.55, angleOf(i)),
  }));

  const rings: string[] = [];
  for (let k = 1; k <= ringCount; k += 1) {
    const rr = (radius * k) / ringCount;
    rings.push(
      axisLabels
        .map((_, i) => {
          const p = polar(cx, cy, rr, angleOf(i));
          return `${p.x},${p.y}`;
        })
        .join(' '),
    );
  }

  const geo: RadarSeriesGeometry[] = series.map((s) => {
    const points = axisLabels.map((_, i) => {
      const v = i < s.values.length ? (s.values[i] ?? min) : min;
      return polar(cx, cy, radiusOf(Number.isFinite(v) ? v : min), angleOf(i));
    });
    return {
      label: s.label,
      points,
      polygon: points.map((p) => `${p.x},${p.y}`).join(' '),
    };
  });

  return { axes, series: geo, rings, cx, cy, radius, min, max };
}
