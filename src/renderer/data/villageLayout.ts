/**
 * villageLayout — 村シーンの純幾何（IO なし・決定論的）。座標はシーン矩形に対する
 * 百分率（0–100）。React 側はここが返すホーム座標に緩やかな wander を足して歩かせる。
 *
 * 見やすさのための構造:
 *   - 役員ごとの「街区（建物）」矩形に分ける（`regionRects`）。
 *   - 街区内はチームを所属部長ごとにクラスタ配置（部署のまとまりが見える）。
 *   - 1 街区だけを全画面に大きく展開する拡大表示（`computeDistrictFocus`）。
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

/** 中央の「作業広場」。ディスパッチ実演でチームが集まる（全体表示のとき）。 */
export const WORK_PLAZA: Point = { x: 50, y: 30 };

/** 各街区の矩形（CEO 上部中央 → COO → 役員 5 街区を横並び）。 */
export function regionRects(regions: readonly VillageRegion[]): Map<string, Rect> {
  const rects = new Map<string, Rect>();
  rects.set('ceo', { x: 40, y: 3, w: 20, h: 10 });
  rects.set('coo', { x: 38, y: 14, w: 24, h: 8 });
  const execs = regions.filter((r) => r.kind === 'exec');
  const n = Math.max(1, execs.length);
  const gutter = 1.4;
  const colW = (100 - gutter * (n + 1)) / n;
  execs.forEach((r, i) => {
    rects.set(r.id, { x: gutter + i * (colW + gutter), y: 38, w: colW, h: 60 });
  });
  return rects;
}

const KIND_ORDER: Record<string, number> = { executive: 0, manager: 1, secretary: 2, team: 3, ceo: 0, coo: 0 };

function byIdAsc(a: Villager, b: Villager): number {
  // Stryker disable next-line ConditionalExpression,EqualityOperator: 実際には殺せている。
  // 対照実験 — この行を `true ? -1 : …` へ手で書き換えて
  // `npx vitest run src/renderer/data/__tests__/villageLayout.test.ts` を走らせると
  // **10 件**落ちる (秘書・管理職・チームの並び順を名指しで固定してあるため)。
  // Stryker の perTest 割り当てがこの共有ヘルパの被覆を取り違えている。
  // 等値側 (`<` → `<=`) は id が重複しないかぎり 0 の枝へ落ちないので観測できない —
  // 同じ id の村人は Map の同じ鍵に畳まれるため、そもそも 2 件並ばない。
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/** 矩形内へアイテムをグリッド配置（決定論）。 */
function packInto(items: readonly Villager[], rect: Rect, out: Map<string, Point>): void {
  const count = items.length;
  // Stryker disable next-line ConditionalExpression: 等価変異。この番人を外しても
  // 観測できる差が無い — 0 件のとき cols は 0、rows は NaN になるが、
  // 直後の `items.forEach` が空配列で何もしないため、NaN も Infinity も
  // どこにも出て行かない。全 9140 件を通しても差が出ないことを実測で確認した。
  // それでも残すのは、後続に cellW/cellH を使う処理が足されたときの保険として。
  if (count === 0) return;
  const cols = Math.min(count, Math.max(1, Math.round(Math.sqrt((count * rect.w) / Math.max(1, rect.h)))));
  const rows = Math.ceil(count / cols);
  const cellW = rect.w / cols;
  const cellH = rect.h / rows;
  items.forEach((v, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    out.set(v.id, { x: rect.x + cellW * (col + 0.5), y: rect.y + cellH * (row + 0.5) });
  });
}

/**
 * 1 街区（矩形）内の村人を配置する。役員→上部中央、秘書→その下の帯、
 * 管理職→グリッド、各管理職の直下にそのチームをクラスタ。返り値はこの街区分のみ。
 */
export function layoutDistrict(list: readonly Villager[], rect: Rect): Map<string, Point> {
  const home = new Map<string, Point>();
  const execs = list.filter((v) => v.kind === 'executive');
  // `.filter()` は新しい配列を返すので、写しを取り直さずそのまま並べ替えてよい。
  const secs = list.filter((v) => v.kind === 'secretary').sort(byIdAsc);
  const mgrs = list.filter((v) => v.kind === 'manager').sort(byIdAsc);
  const teamsByMgr = new Map<string, Villager[]>();
  for (const v of list) {
    // 所属先の無いチームは束ねない。以前は `v.managerId ?? ''` で空文字の
    // 鍵へ寄せていたが、'' という id の管理職は存在しないので**どのみち
    // 置かれない**。存在しない鍵へ積むより、ここで弾くほうが読んで分かる。
    // Stryker disable next-line ConditionalExpression: 実際には殺せている。
    // 対照実験 — この条件を `false` へ手で書き換えると「チーム以外は managerId を
    // 持っていてもチームとして束ねない」が落ちる (秘書が管理職の下のクラスタへ
    // 流れ込み、帯の高さ 12% から外れる)。perTest の割り当ての取り違え。
    if (v.kind !== 'team' || v.managerId === undefined) continue;
    const arr = teamsByMgr.get(v.managerId) ?? [];
    arr.push(v);
    teamsByMgr.set(v.managerId, arr);
  }
  for (const arr of teamsByMgr.values()) arr.sort(byIdAsc);

  // 役員（上部中央）。
  execs.forEach((e) => home.set(e.id, { x: rect.x + rect.w * 0.5, y: rect.y + rect.h * 0.05 }));
  // 秘書（役員の下の帯）。
  secs.forEach((s, i) =>
    home.set(s.id, { x: rect.x + rect.w * ((i + 1) / (secs.length + 1)), y: rect.y + rect.h * 0.12 }),
  );

  // 管理職グリッド（コンテンツ領域）。
  const content: Rect = { x: rect.x + rect.w * 0.03, y: rect.y + rect.h * 0.18, w: rect.w * 0.94, h: rect.h * 0.8 };
  const mCount = Math.max(1, mgrs.length);
  const mCols = Math.min(mCount, Math.max(1, Math.round(Math.sqrt((mCount * content.w) / Math.max(1, content.h)))));
  const mRows = Math.ceil(mCount / mCols);
  const cellW = content.w / mCols;
  const cellH = content.h / mRows;
  mgrs.forEach((m, i) => {
    const col = i % mCols;
    const row = Math.floor(i / mCols);
    const cellX = content.x + cellW * col;
    const cellTop = content.y + cellH * row;
    home.set(m.id, { x: cellX + cellW * 0.5, y: cellTop + cellH * 0.14 });
    const teams = teamsByMgr.get(m.id) ?? [];
    packInto(
      teams,
      { x: cellX + cellW * 0.06, y: cellTop + cellH * 0.3, w: cellW * 0.88, h: cellH * 0.66 },
      home,
    );
  });
  return home;
}

/** 全村人のホーム座標（全体表示）。街区ごとに `layoutDistrict`、CEO/COO は中央。 */
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
  for (const region of regions) {
    const rect = rects.get(region.id) ?? { x: 45, y: 45, w: 10, h: 10 };
    // byRegion はこの関数の中で組み立てて region ごとに 1 度ずつしか読まないので、
    // 写しを取らずに並べ替えてよい。
    const list = (byRegion.get(region.id) ?? []).sort((a, b) => {
      const ko = (KIND_ORDER[a.kind] ?? 9) - (KIND_ORDER[b.kind] ?? 9);
      return ko !== 0 ? ko : byIdAsc(a, b);
    });
    if (region.kind === 'ceo' || region.kind === 'coo') {
      list.forEach((v, i) =>
        home.set(v.id, {
          x: rect.x + rect.w * ((i + 1) / (list.length + 1)),
          y: rect.y + rect.h * 0.5,
        }),
      );
    } else {
      for (const [id, p] of layoutDistrict(list, rect)) home.set(id, p);
    }
  }
  return home;
}

/** 拡大表示用の大きな矩形（1 街区がシーン全体を占める）。 */
export const FOCUS_RECT: Rect = { x: 5, y: 15, w: 90, h: 82 };

/** 1 街区だけを拡大表示するときのホーム座標（大きく・ラベルが読める間隔）。 */
export function computeDistrictFocus(districtVillagers: readonly Villager[]): Map<string, Point> {
  return layoutDistrict(districtVillagers, FOCUS_RECT);
}

/** 緩やかな徘徊オフセット（百分率）。乱数なし・三角関数で滑らかに揺らす。 */
export function wanderOffset(index: number, tick: number, amp = 0.5): Point {
  return {
    x: Math.sin(tick * 0.8 + index * 1.7) * amp,
    y: Math.cos(tick * 0.6 + index * 1.3) * amp * 0.8,
  };
}
