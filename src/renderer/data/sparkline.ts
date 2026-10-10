/**
 * スパークライン (簡易折れ線) の座標計算 — 純粋な幾何ロジック。
 *
 * 月次推移などの数値系列を、指定した幅・高さの SVG ビューポートに収まる
 * ポリライン座標へ正規化する。描画は呼び出し側 (SVG) が行い、本モジュールは
 * 座標計算のみ (IO なし)。
 */

export interface SparklinePoint {
  readonly x: number;
  readonly y: number;
}

export interface SparklineGeometry {
  readonly points: readonly SparklinePoint[];
  /** SVG polyline points 属性用の "x,y x,y ..." 文字列。 */
  readonly polyline: string;
  /** 系列の最小値・最大値 (軸ラベル等に使える)。 */
  readonly min: number;
  readonly max: number;
  /** 値 0 が描画される y 座標 (0 が範囲内のときのみ, 範囲外なら null)。 */
  readonly zeroY: number | null;
}

/**
 * 数値系列をスパークライン座標へ変換する。
 *
 * - x は系列の index を 0..width に等間隔配置 (1 点のときは中央)。
 * - y は値域 [min, max] を上下パディング込みで height にマップ (値が大きいほど上=小さい y)。
 * - 全値が同一 (min===max) のときは中央の水平線。
 *
 * @param values 数値系列 (時系列の昇順を想定)
 * @param width  SVG 幅 (px)。既定 120
 * @param height SVG 高さ (px)。既定 32
 * @param pad    上下の余白 (px)。既定 2
 */
export function sparklinePoints(
  values: readonly number[],
  width = 120,
  height = 32,
  pad = 2,
): SparklineGeometry {
  const n = values.length;
  if (n === 0) {
    return { points: [], polyline: '', min: 0, max: 0, zeroY: null };
  }
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min;
  const innerH = Math.max(0, height - pad * 2);
  const yOf = (v: number): number => {
    if (span === 0) return height / 2;
    // 値が大きいほど上 (y 小)。
    return pad + (1 - (v - min) / span) * innerH;
  };
  const xOf = (i: number): number => {
    if (n === 1) return width / 2;
    return (i / (n - 1)) * width;
  };
  const points: SparklinePoint[] = values.map((v, i) => ({
    x: Math.round(xOf(i) * 10) / 10,
    y: Math.round(yOf(v) * 10) / 10,
  }));
  const zeroY = min <= 0 && max >= 0 ? Math.round(yOf(0) * 10) / 10 : null;
  return {
    points,
    polyline: points.map((p) => `${p.x},${p.y}`).join(' '),
    min,
    max,
    zeroY,
  };
}
