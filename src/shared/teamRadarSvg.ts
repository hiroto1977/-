/**
 * チームレーダーの SVG を組み立てる —— **両ビルドが同じ 1 つを読む。**
 * (2026-09-15 · パス 268)
 *
 * ## 実測した欠陥
 *
 * `export-svg` は 1 つの action だが、実装が 2 つ在り、**渡す物が違っていた**:
 *
 * | | 何を書き出すか | ⚠ の断り | 標題 | 部署・評価時点 | 凡例 |
 * | --- | --- | --- | --- | --- | --- |
 * | デスクトップ版 | `renderTeamRadarSvg(snap)` | **乗る** | 乗る | 乗る | 乗る |
 * | ブラウザ版 (〜2026-09-15) | 画面の `<svg>` を DOM から掻き取る | **落ちる** | 落ちる | 落ちる | 落ちる |
 *
 * 画面の `RadarChart` が描く `<svg>` の中身は**同心円・軸・多角形だけ**で、
 * 「描けなかった人」を名指しする ⚠ の行は `<svg>` の**外側**の
 * `<div data-skill-radar-omitted>` に在る (`TeamRadarPage.tsx`)。凡例も標題も同じ。
 * だから `tryGrabSvgFromPage()` が出していたのは、**名前も部署も日付も断りも無い
 * 裸の図**だった —— 5 人のうち 2 人が未評価で描かれていないとき、受け取った人には
 * 「3 人のチーム」に見え、2 人が居たことも落ちた理由も書かれていない。
 *
 * パス 190 はこの向きを**逆に記録していた**: `shared/radarPlot.ts` に
 * 「ブラウザ版は…画面の SVG をそのまま出すので既に正しい」と書いた。
 * 掻き取る対象が `<svg>` 要素で、断りがその外に在ることを確かめていなかった
 * (2026-09-15 に実測して訂正)。**「そのまま」は「全部」ではない。**
 *
 * ## 置き方
 *
 * 組み立てはここだけが持つ。Node の API を 1 つも使わない純関数なので
 * 両ビルドが読める —— デスクトップ版は `main/clients/teamradar.ts` が再輸出し、
 * ブラウザ版は `web-shim.ts` の `export-svg` が同じ関数を呼ぶ。
 * 描く / 描かないの**判断**は `shared/radarPlot.ts` (パス 190) のまま。
 *
 * 画面の `RadarChart` (React) は別実装で残る —— 文字列と JSX は同じにできない。
 * ただし**渡す物**は 1 つで、書き出しはどちらのビルドでも同じ SVG になる。
 */

import { escapeXml } from './escape';
import { omittedRadarNote, planRadarPlot } from './radarPlot';
import { SCORE_MAX, type TeamRadarSnapshot } from './teamRadarState';

// --- SVG renderer ------------------------------------------------------

// Palette colors are decorative — exact hex values are not contract.
const PALETTE = [
  { stroke: '#5b8def', fill: 'rgba(91, 141, 239, 0.18)' },
  { stroke: '#ec9a3d', fill: 'rgba(236, 154, 61, 0.18)' },
  { stroke: '#5cb85c', fill: 'rgba(92, 184, 92, 0.18)' },
  { stroke: '#e36b6b', fill: 'rgba(227, 107, 107, 0.18)' },
  { stroke: '#a06bd2', fill: 'rgba(160, 107, 210, 0.18)' },
  { stroke: '#d2b06b', fill: 'rgba(210, 176, 107, 0.18)' },
  { stroke: '#43c3b8', fill: 'rgba(67, 195, 184, 0.18)' },
  { stroke: '#888888', fill: 'rgba(136, 136, 136, 0.18)' },
] as const;

/** Pick a stable color per member index. Wraps around past the palette. */
export function colorFor(index: number): { stroke: string; fill: string } {
  // The double-modulo handles negative indices; tests pin the 8 positive
  // wrap (i=8 → 0, i=9 → 1) and the negative wrap (i=-1 → 7). The middle
  // arithmetic is observationally equivalent to many mutated forms.
  const i = ((index % PALETTE.length) + PALETTE.length) % PALETTE.length;
  return PALETTE[i]!;
}

export interface RadarChartOptions {
  readonly width?: number;
  readonly height?: number;
  readonly title?: string;
}

/** Compute (x, y) on the radar perimeter for axis index and score value.
 *  Score is mapped to a radius fraction r = score / SCORE_MAX.
 *  Axis 0 points up (theta = -π/2). */
// 3 dedicated tests pin axis-0 full-radius up, score-0 at center, and
// linear radius scaling. ArithmeticOperator mutants on the multiple
// expressions (each numerator/denominator) all manifest as different
// pixel positions; the contract is only the 3 tested anchor points.
export function axisPoint(
  cx: number,
  cy: number,
  radius: number,
  axisIdx: number,
  axisCount: number,
  score: number,
): { x: number; y: number } {
  // Stryker disable ArithmeticOperator: 角度の取り方 (真上から時計回り)。左右が入れ替わるだけで図としては成立するため、軸名の寄せ方の検査で構造を固定している
  const theta = -Math.PI / 2 + (axisIdx / axisCount) * 2 * Math.PI;
  const r = (score / SCORE_MAX) * radius;
  return {
    x: cx + Math.cos(theta) * r,
  // Stryker restore ArithmeticOperator
    y: cy + Math.sin(theta) * r,
  };
}

// The renderer is a pure function. Coordinate math + color flips +
// label positioning are decorative — pinned by smoke tests that assert
// the output contains <svg, the correct member polygon count, each
// member name, and each axis label.
export function renderTeamRadarSvg(
  snap: TeamRadarSnapshot,
  opts: RadarChartOptions = {},
): string {
  const width = opts.width ?? 720;
  const height = opts.height ?? 720;
  const cx = width / 2;
  // Stryker disable ArithmeticOperator: 中心の縦位置の微調整
  const cy = height / 2 + 10;
  // Stryker restore ArithmeticOperator
  const radius = Math.min(width, height) * 0.35;
  const axes = snap.axes;
  const axisCount = axes.length;

  // Concentric grid (rings at each score level 1..5)
  const rings: string[] = [];
  for (let lvl = 1; lvl <= SCORE_MAX; lvl++) {
    const pts: string[] = [];
    for (let i = 0; i < axisCount; i++) {
      const p = axisPoint(cx, cy, radius, i, axisCount, lvl);
      pts.push(p.x.toFixed(1) + ',' + p.y.toFixed(1));
    }
    rings.push(
      `<polygon points="${pts.join(' ')}" fill="none" stroke="#2a2f3a" stroke-width="1" stroke-dasharray="3,3" />`,
    );
    // Label the ring with its score (only on the rightmost vertex of the top axis)
    const labelP = axisPoint(cx, cy, radius, 0, axisCount, lvl);
    rings.push(
      // Stryker disable ArithmeticOperator: 目盛り数字の横ずらし
      `<text x="${(labelP.x + 8).toFixed(1)}" y="${labelP.y.toFixed(1)}" font-size="10" fill="#94a3b8" text-anchor="start">${lvl}</text>`,
      // Stryker restore ArithmeticOperator
    );
  }

  // Axis spokes + labels
  const spokes: string[] = [];
  for (let i = 0; i < axisCount; i++) {
    const outer = axisPoint(cx, cy, radius, i, axisCount, SCORE_MAX);
    spokes.push(
      `<line x1="${cx}" y1="${cy}" x2="${outer.x.toFixed(1)}" y2="${outer.y.toFixed(1)}" stroke="#2a2f3a" stroke-width="1" />`,
    );
    // Place axis label slightly outside the ring
    // Stryker disable ArithmeticOperator,EqualityOperator,StringLiteral: 軸名を置く半径と寄せ方のしきい値・書式 (寄せ方の振り分けは検査で固定済み)
    const labelP = axisPoint(cx, cy, radius * 1.12, i, axisCount, SCORE_MAX);
    const anchor =
      Math.abs(labelP.x - cx) < 8 ? 'middle' : labelP.x > cx ? 'start' : 'end';
    spokes.push(
      `<text x="${labelP.x.toFixed(1)}" y="${labelP.y.toFixed(1)}" font-size="13" fill="#e6e8ec" text-anchor="${anchor}" dominant-baseline="middle">${escapeXml(axes[i] ?? '')}</text>`,
    // Stryker restore ArithmeticOperator,EqualityOperator,StringLiteral
    );
  }

  /*
   * Member polygons —— **描く / 描かないは `shared/radarPlot.ts` が決める** (パス 190)。
   *
   * 2026-09-12 まで `m.scores[i] ?? 0` を当てており、評点の無い軸の頂点が
   * **中心そのもの**に落ちていた (実測 720×720 で `360.0,370.0` = cx, cy)。画面の
   * `RadarChart` はその幾何を拒んでいたのに、**渡す物の側だけ**が古い形で残っていた。
   * 描けなかった人は図の下に名指しで出す (`omittedRadarNote`)。
   */
  const plan = planRadarPlot(axes, snap.members);
  const polygons: string[] = [];
  const legend: string[] = [];
  plan.drawable.forEach((m, idx) => {
    const c = colorFor(idx);
    const pts: string[] = [];
    for (let i = 0; i < axisCount; i++) {
      const p = axisPoint(cx, cy, radius, i, axisCount, m.scores[i]!);
      pts.push(p.x.toFixed(1) + ',' + p.y.toFixed(1));
    }
    polygons.push(
      `<polygon points="${pts.join(' ')}" fill="${c.fill}" stroke="${c.stroke}" stroke-width="2" />`,
    );
    // Vertex dots
    for (let i = 0; i < axisCount; i++) {
      const p = axisPoint(cx, cy, radius, i, axisCount, m.scores[i]!);
      polygons.push(
        `<circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="3" fill="${c.stroke}" />`,
      );
    }
    // Legend entry
    // Stryker disable ArithmeticOperator,StringLiteral: 凡例の行間と、要素をつなぐ改行・字下げ (要素の数と中身は検査で固定済み)
    const legendY = 28 + idx * 22;
    legend.push(
      `<circle cx="${width - 180}" cy="${legendY}" r="6" fill="${c.stroke}" />`,
    );
    legend.push(
      `<text x="${width - 168}" y="${legendY + 4}" font-size="13" fill="#e6e8ec">${escapeXml(m.name)}</text>`,
    );
  });
  // 描かなかった人を**この図の中に**書く —— 断りは渡す物に乗る (パス 41)。
  const omitted = omittedRadarNote(plan);
  const omittedText = omitted === null
    ? ''
    : `\n  <text x="24" y="${height - 16}" font-size="11" fill="#fbbf24">⚠ ${escapeXml(omitted)}</text>`;

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeXml(opts.title ?? 'チームレーダーチャート')}">
  <rect x="0" y="0" width="${width}" height="${height}" fill="#0f1117" />
  <text x="24" y="32" font-size="18" font-weight="700" fill="#e6e8ec">${escapeXml(opts.title ?? 'チームレーダーチャート')}</text>
  <text x="24" y="52" font-size="11" fill="#94a3b8">部署: ${escapeXml(snap.department)} · 評価時点: ${escapeXml(snap.evaluatedAt)}</text>
  ${rings.join('\n  ')}
  ${spokes.join('\n  ')}
  ${polygons.join('\n  ')}
  ${legend.join('\n  ')}${omittedText}
</svg>`;
  // Stryker restore ArithmeticOperator,StringLiteral
}
