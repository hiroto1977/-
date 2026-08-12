/**
 * チャート幾何の自己検査。
 *
 * ## なぜ要るのか
 *
 * グラフは**壊れていても「それらしい図」が出る**のが厄介で、目視では
 * 気づけない。「描画された」ことと「正しく描画された」ことは別なので、
 * 座標が満たすべき条件を明示的に検査し、画面にも結果を出す。
 *
 * 検査は純関数なので単体テストからも同じものを回せる。画面で緑なのに
 * テストが赤（またはその逆）にならないよう、**同じ検査を共有する**。
 */

import {
  lineChart,
  pieChart,
  radarChart,
  type LineSeries,
  type PieSlice,
  type RadarSeries,
} from './charts';
import { CHART_DATASETS, type ChartDataset } from './chartFixtures';

export interface CheckResult {
  readonly name: string;
  readonly ok: boolean;
  /** 失敗したときだけ埋まる。何がどうおかしいかを具体的に書く。 */
  readonly detail: string | null;
}

function ok(name: string): CheckResult {
  return { name, ok: true, detail: null };
}
function ng(name: string, detail: string): CheckResult {
  return { name, ok: false, detail };
}

/** 折れ線: 全点がビューポート内にあり、系列と点の数が入力と一致するか。 */
export function checkLine(
  series: readonly LineSeries[],
  width: number,
  height: number,
): CheckResult[] {
  const geo = lineChart(series, { width, height });
  const out: CheckResult[] = [];

  out.push(
    geo.series.length === series.length
      ? ok('折れ線: 系列数が入力と一致')
      : ng('折れ線: 系列数が入力と一致', `入力 ${series.length} / 出力 ${geo.series.length}`),
  );

  const countMismatch = geo.series.find((g, i) => g.points.length !== (series[i]?.values.length ?? -1));
  out.push(
    countMismatch === undefined
      ? ok('折れ線: 各系列の点数が入力と一致')
      : ng('折れ線: 各系列の点数が入力と一致', `系列「${countMismatch.label}」でずれ`),
  );

  const outside = geo.series
    .flatMap((g) => g.points.map((p) => ({ label: g.label, p })))
    .find(({ p }) => !Number.isFinite(p.x) || !Number.isFinite(p.y) || p.x < 0 || p.x > width || p.y < 0 || p.y > height);
  out.push(
    outside === undefined
      ? ok('折れ線: 全点が描画領域に収まる')
      : ng(
          '折れ線: 全点が描画領域に収まる',
          `系列「${outside.label}」に領域外の点 (${outside.p.x}, ${outside.p.y})`,
        ),
  );

  // 値が大きいほど上（y が小さい）になっているか — 軸の反転漏れを捕まえる
  const first = series.find((s) => s.values.length >= 2 && Math.min(...s.values) !== Math.max(...s.values));
  if (first !== undefined) {
    const gi = series.indexOf(first);
    const vals = first.values;
    let lo = 0;
    let hi = 0;
    vals.forEach((v, i) => {
      if (v < (vals[lo] ?? Infinity)) lo = i;
      if (v > (vals[hi] ?? -Infinity)) hi = i;
    });
    const pts = geo.series[gi]?.points ?? [];
    const pHi = pts[hi];
    const pLo = pts[lo];
    if (pHi !== undefined && pLo !== undefined) {
      out.push(
        pHi.y < pLo.y
          ? ok('折れ線: 大きい値ほど上に描かれる')
          : ng(
              '折れ線: 大きい値ほど上に描かれる',
              `最大値の y=${pHi.y} が最小値の y=${pLo.y} より下にある（軸が反転している）`,
            ),
      );
    }
  }

  return out;
}

/** 円: 割合の合計が 1、かつ角度が 360°を埋め、path が空でないか。 */
export function checkPie(slices: readonly PieSlice[], size: number): CheckResult[] {
  const geo = pieChart(slices, { size });
  const out: CheckResult[] = [];
  const positives = slices.filter((s) => Number.isFinite(s.value) && s.value > 0);

  out.push(
    geo.slices.length === positives.length
      ? ok('円: 正の値のみがスライスになる')
      : ng('円: 正の値のみがスライスになる', `正の値 ${positives.length} / スライス ${geo.slices.length}`),
  );

  if (geo.slices.length > 0) {
    const sum = geo.slices.reduce((a, s) => a + s.ratio, 0);
    out.push(
      Math.abs(sum - 1) < 1e-9
        ? ok('円: 割合の合計が 1')
        : ng('円: 割合の合計が 1', `合計 ${sum}`),
    );

    const last = geo.slices[geo.slices.length - 1]!;
    out.push(
      Math.abs(last.endAngle - 360) < 1e-9
        ? ok('円: 角度が 360°を埋める')
        : ng('円: 角度が 360°を埋める', `最終角 ${last.endAngle}°`),
    );

    const empty = geo.slices.find((s) => s.path.trim() === '' || s.path.includes('NaN'));
    out.push(
      empty === undefined
        ? ok('円: path に NaN や空が無い')
        : ng('円: path に NaN や空が無い', `「${empty.label}」の path が不正`),
    );
  }
  return out;
}

/** レーダー: 軸数ぶんの頂点があり、全点が外接円の内側にあるか。 */
export function checkRadar(
  axes: readonly string[],
  series: readonly RadarSeries[],
  size: number,
): CheckResult[] {
  const geo = radarChart(axes, series, { size });
  const out: CheckResult[] = [];

  if (axes.length < 3) {
    out.push(
      geo.axes.length === 0
        ? ok('レーダー: 軸が 3 本未満なら描かない')
        : ng('レーダー: 軸が 3 本未満なら描かない', `軸 ${geo.axes.length} 本を返した`),
    );
    return out;
  }

  out.push(
    geo.axes.length === axes.length
      ? ok('レーダー: 軸数が入力と一致')
      : ng('レーダー: 軸数が入力と一致', `入力 ${axes.length} / 出力 ${geo.axes.length}`),
  );

  const wrong = geo.series.find((s) => s.points.length !== axes.length);
  out.push(
    wrong === undefined
      ? ok('レーダー: 各系列の頂点数が軸数と一致')
      : ng(
          'レーダー: 各系列の頂点数が軸数と一致',
          `系列「${wrong.label}」が ${wrong.points.length} 頂点（軸は ${axes.length} 本）`,
        ),
  );

  const outside = geo.series
    .flatMap((s) => s.points.map((p) => ({ label: s.label, p })))
    .find(({ p }) => {
      const d = Math.hypot(p.x - geo.cx, p.y - geo.cy);
      return !Number.isFinite(d) || d > geo.radius + 0.2;
    });
  out.push(
    outside === undefined
      ? ok('レーダー: 全頂点が外周の内側')
      : ng('レーダー: 全頂点が外周の内側', `系列「${outside.label}」がはみ出している`),
  );

  return out;
}

export interface DatasetCheck {
  readonly datasetId: string;
  readonly label: string;
  readonly results: readonly CheckResult[];
  readonly passed: number;
  readonly failed: number;
}

/** 1 データセットを 3 種すべてに通す。 */
export function checkDataset(d: ChartDataset): DatasetCheck {
  const results = [
    ...checkLine(d.line, 480, 200),
    ...checkPie(d.pie, 200),
    ...checkRadar(d.radarAxes, d.radar, 220),
  ];
  return {
    datasetId: d.id,
    label: d.label,
    results,
    passed: results.filter((r) => r.ok).length,
    failed: results.filter((r) => !r.ok).length,
  };
}

export interface SelfCheckReport {
  readonly datasets: readonly DatasetCheck[];
  readonly passed: number;
  readonly failed: number;
  readonly allPassed: boolean;
}

/** 全データセット × 3 種を検査する。画面とテストで同じ関数を使う。 */
export function runSelfCheck(
  datasets: readonly ChartDataset[] = CHART_DATASETS,
): SelfCheckReport {
  const checked = datasets.map(checkDataset);
  const passed = checked.reduce((a, c) => a + c.passed, 0);
  const failed = checked.reduce((a, c) => a + c.failed, 0);
  return { datasets: checked, passed, failed, allPassed: failed === 0 };
}
