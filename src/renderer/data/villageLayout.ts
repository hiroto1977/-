/**
 * villageLayout — 村シーンの純幾何（IO なし・決定論的）。
 * 座標はシーン矩形に対する百分率（0–100）。React 側はここが返す
 * ホーム座標に緩やかな wander を足して CSS transform で歩かせるだけ。
 */
import type { Villager, VillageRegion } from './villageData';

export interface Rect {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}
export interface Point {
  readonly x: number;
  readonly y: number;
}

/** 中央の「作業広場」。ディスパッチ実演でチームが集まる。 */
export const WORK_PLAZA: Point = { x: 50, y: 30.5 };

/** 各区画の矩形（CEO 上部中央 → COO → 役員 5 街区を横並び）。 */
export function regionRects(regions: readonly VillageRegion[]): Map<string, Rect> {
  const rects = new Map<string, Rect>();
  rects.set('ceo', { x: 38, y: 3, w: 24, h: 11 });
  rects.set('coo', { x: 36, y: 15, w: 28, h: 9 });
  const execs = regions.filter((r) => r.kind === 'exec');
  const n = Math.max(1, execs.length);
  const gutter = 1;
  const colW = (100 - gutter * (n + 1)) / n;
  execs.forEach((r, i) => {
    rects.set(r.id, { x: gutter + i * (colW + gutter), y: 37, w: colW, h: 61 });
  });
  return rects;
}

const KIND_ORDER: Record<string, number> = { executive: 0, manager: 1, secretary: 2, team: 3, ceo: 0, coo: 0 };

/** 区画内で村人を決定論的にグリッド配置し、ホーム座標を返す。 */
export function computeHomePositions(
  villagers: readonly Villager[],
  regions: readonly VillageRegion[],
): Map<string, Point> {
  const rects = regionRects(regions);
  const byRegion = new Map<string, Villager[]>();
  for (const v of villagers) {
    const arr = byRegion.get(v.regionId) ?? [];
    arr.push(v);
    byRegion.set(v.regionId, arr);
  }
  const home = new Map<string, Point>();
  for (const [regionId, list] of byRegion) {
    const rect = rects.get(regionId) ?? { x: 45, y: 45, w: 10, h: 10 };
    list.sort((a, b) => {
      const ko = (KIND_ORDER[a.kind] ?? 9) - (KIND_ORDER[b.kind] ?? 9);
      if (ko !== 0) return ko;
      return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
    });
    const count = list.length;
    // 区画のアスペクトに合わせた列数（1..count）。
    const cols = Math.min(count, Math.max(1, Math.round(Math.sqrt((count * rect.w) / Math.max(1, rect.h)))));
    const rows = Math.ceil(count / cols);
    const cellW = rect.w / cols;
    const cellH = rect.h / rows;
    list.forEach((v, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      home.set(v.id, {
        x: rect.x + cellW * (col + 0.5),
        y: rect.y + cellH * (row + 0.5),
      });
    });
  }
  return home;
}

/**
 * 緩やかな徘徊オフセット（百分率）。乱数を使わず tick と index の
 * 三角関数で滑らかに揺らす（決定論・GPU フレンドリー）。
 */
export function wanderOffset(index: number, tick: number): Point {
  return {
    x: Math.sin(tick * 0.9 + index * 1.7) * 1.1,
    y: Math.cos(tick * 0.7 + index * 1.3) * 0.9,
  };
}
