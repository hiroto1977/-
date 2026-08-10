/**
 * 建物の立体プレビュー — 平面 (m) を等角投影して「分解アイソメ」の描画データを作る
 * 純関数群。SVG は描かず、投影済みの座標だけを返す (描画は renderer の責務)。
 *
 * ## なぜ投影を関数にするのか
 *
 * 室境界は 1 フロアで 10 本以上あり、手で座標を書くと必ずズレる。実際に
 * 図面を手作業で起こしたとき、ある階のコアを L 字ではなく 1 枚の矩形として
 * 定義してしまい、**面積表は 228 ㎡ なのに図形の合計は 216 ㎡** という
 * 12 ㎡ の隙間が生まれた。数字だけ合っていて図が埋まっていない状態は
 * 目視では気づきにくい。だから投影と一緒に **面積の突き合わせも機械化する**
 * (`checkFloorFit`)。
 *
 * ## 座標系
 *
 * 平面はメートル。x は西→東、y は北→南 (図面の見た目と一致)。
 * 等角投影は X = (x − y)·cos30·s ／ Y = (x + y)·sin30·s − z·s。
 * 分解アイソメでは実際の階高ではなく `floorGapPx` で階を離して描く。
 */

import { nonNeg, round1 } from './num';

/** 投影後の画面座標 (px)。 */
export interface IsoPoint {
  readonly x: number;
  readonly y: number;
}

/** 室の用途区分。描画側で色を引くためのキー。 */
export type RoomKind = 'workshop' | 'retail' | 'water' | 'core' | 'other';

/** 平面上の室 (m・建物ローカル座標)。x1<x2 / y1<y2。 */
export interface RoomSpec {
  readonly x1: number;
  readonly y1: number;
  readonly x2: number;
  readonly y2: number;
  readonly name: string;
  readonly kind: RoomKind;
}

/** 1 フロアの定義。depthM を省略すると建物全体の奥行を使う。 */
export interface FloorSpec {
  readonly name: string;
  readonly rooms: readonly RoomSpec[];
  readonly depthM?: number;
}

export interface IsoOptions {
  /** 縮尺 (px/m)。既定 11。 */
  readonly scale?: number;
  /** 原点の画面位置。 */
  readonly originX?: number;
  readonly originY?: number;
  /** 階と階の分解間隔 (px)。既定 134。 */
  readonly floorGapPx?: number;
  /** スラブ厚として描く側面の高さ (px)。既定 9。 */
  readonly slabPx?: number;
}

export interface IsoRoom {
  readonly name: string;
  readonly kind: RoomKind;
  readonly areaSqm: number;
  readonly points: readonly IsoPoint[];
  readonly label: IsoPoint;
}

export interface IsoFloor {
  readonly name: string;
  /** 外形面積 (㎡) = 幅 × 奥行。 */
  readonly outlineSqm: number;
  /** 室の面積合計 (㎡)。outlineSqm と一致すべき。 */
  readonly roomsSqm: number;
  /** 室が外形を過不足なく埋めているか。 */
  readonly fits: boolean;
  /** 北西・北東・南東・南西の 4 点。タプルにして添字アクセスを型で保証する
   *  (実行時ガードを足すと、到達しない分岐が変異として残ってしまう)。 */
  readonly outline: readonly [IsoPoint, IsoPoint, IsoPoint, IsoPoint];
  readonly sideSouth: readonly IsoPoint[];
  readonly sideEast: readonly IsoPoint[];
  readonly rooms: readonly IsoRoom[];
}

export interface IsoModel {
  readonly floors: readonly IsoFloor[];
  /** 上下階の位置合わせに使う補助線 (北西・北東・南東の 3 隅)。 */
  readonly leaders: readonly (readonly [IsoPoint, IsoPoint])[];
  /** すべての階で室が外形を埋めているか。 */
  readonly allFit: boolean;
  /** 描画に必要な範囲 (viewBox 用)。 */
  readonly bounds: { readonly minX: number; readonly minY: number; readonly maxX: number; readonly maxY: number };
}

const COS30 = Math.cos(Math.PI / 6);
const DEFAULTS = { scale: 11, originX: 250, originY: 320, floorGapPx: 134, slabPx: 9 } as const;

/**
 * 非有限・負は 0 に丸める。
 * `n > 0 ? n : 0` だと `>= 0` との差が出ず区別できない変異が残るため、
 * 大小比較は Math.max に寄せて分岐を持たせない。
 */

/** 平面座標 (m) を等角投影する。z は px 単位の持ち上げ量。 */
export function projectIso(xM: number, yM: number, liftPx: number, opts: IsoOptions = {}): IsoPoint {
  const s = opts.scale ?? DEFAULTS.scale;
  const ox = opts.originX ?? DEFAULTS.originX;
  const oy = opts.originY ?? DEFAULTS.originY;
  return {
    x: round1(ox + (xM - yM) * COS30 * s),
    y: round1(oy + (xM + yM) * 0.5 * s - liftPx),
  };
}

/**
 * 室が外形を過不足なく埋めているかを検査する。
 *
 * 重なりまでは見ない (矩形の重なり判定は用途に対して過剰) が、合計面積の
 * 一致だけでも「定義し忘れた区画」は確実に捕まる — 実際にそれで 12 ㎡ の
 * 隙間を検出した。
 */
export function checkFloorFit(
  rooms: readonly RoomSpec[],
  widthM: number,
  depthM: number,
): { readonly roomsSqm: number; readonly outlineSqm: number; readonly fits: boolean } {
  const roomsSqm = round1(
    rooms.reduce((sum, r) => sum + Math.abs(r.x2 - r.x1) * Math.abs(r.y2 - r.y1), 0),
  );
  const outlineSqm = round1(nonNeg(widthM) * nonNeg(depthM));
  // 両辺とも round1 済みなので差は 0.1 刻み。許容誤差を挟むと `<` と `<=` の
  // 区別が付かない変異が残るため、厳密一致で判定する。
  return { roomsSqm, outlineSqm, fits: roomsSqm === outlineSqm };
}

/** 分解アイソメの描画データを組み立てる。floors[0] が最下階。 */
export function buildIsoModel(
  widthM: number,
  depthM: number,
  floors: readonly FloorSpec[],
  opts: IsoOptions = {},
): IsoModel {
  const w = nonNeg(widthM);
  const baseDepth = nonNeg(depthM);
  const gap = opts.floorGapPx ?? DEFAULTS.floorGapPx;
  const slab = opts.slabPx ?? DEFAULTS.slabPx;

  const built: IsoFloor[] = [];
  const xs: number[] = [];
  const ys: number[] = [];
  const track = (p: IsoPoint): IsoPoint => {
    xs.push(p.x);
    ys.push(p.y);
    return p;
  };

  floors.forEach((floor, i) => {
    const d = floor.depthM === undefined ? baseDepth : nonNeg(floor.depthM);
    const lift = gap * i;
    const at = (x: number, y: number) => track(projectIso(x, y, lift, opts));
    const nw = at(0, 0);
    const ne = at(w, 0);
    const se = at(w, d);
    const sw = at(0, d);
    const drop = (p: IsoPoint): IsoPoint => track({ x: p.x, y: round1(p.y + slab) });

    const fit = checkFloorFit(floor.rooms, w, d);
    built.push({
      name: floor.name,
      outlineSqm: fit.outlineSqm,
      roomsSqm: fit.roomsSqm,
      fits: fit.fits,
      outline: [nw, ne, se, sw],
      sideSouth: [sw, se, drop(se), drop(sw)],
      sideEast: [se, ne, drop(ne), drop(se)],
      rooms: floor.rooms.map((r) => {
        const pts = [at(r.x1, r.y1), at(r.x2, r.y1), at(r.x2, r.y2), at(r.x1, r.y2)];
        return {
          name: r.name,
          kind: r.kind,
          areaSqm: round1(Math.abs(r.x2 - r.x1) * Math.abs(r.y2 - r.y1)),
          points: pts,
          label: projectIso((r.x1 + r.x2) / 2, (r.y1 + r.y2) / 2, lift, opts),
        };
      }),
    });
  });

  // 上下階の 3 隅 (北西・北東・南東) を結ぶ。添字で前要素を取らず prev を持ち回る
  // ことで、配列アクセスの undefined ガードを不要にしている。
  const leaders: (readonly [IsoPoint, IsoPoint])[] = [];
  let prev: IsoFloor | undefined;
  for (const floor of built) {
    if (prev !== undefined) {
      leaders.push([floor.outline[0], prev.outline[0]]);
      leaders.push([floor.outline[1], prev.outline[1]]);
      leaders.push([floor.outline[2], prev.outline[2]]);
    }
    prev = floor;
  }

  return {
    floors: built,
    leaders,
    allFit: built.every((f) => f.fits),
    bounds: {
      minX: xs.length > 0 ? Math.min(...xs) : 0,
      minY: ys.length > 0 ? Math.min(...ys) : 0,
      maxX: xs.length > 0 ? Math.max(...xs) : 0,
      maxY: ys.length > 0 ? Math.max(...ys) : 0,
    },
  };
}

/* ─────────────  敷地プランナーの算定値からの模式プラン  ───────────── */

export interface SchematicInput {
  /** 建物の間口 (m)。 */
  readonly widthM: number;
  /** 建物の奥行 (m)。 */
  readonly depthM: number;
  /** 作業場 (栽培室) の面積 (㎡)。planFactory の workshopArea。 */
  readonly workshopSqm: number;
  /** 1 階の残り (直売・事務等) の面積 (㎡)。planFactory の groundFloorOther。 */
  readonly groundOtherSqm: number;
  /** 2 階以上に回せる面積 (㎡)。planFactory の upperFloorsArea。 */
  readonly upperFloorsSqm: number;
}

/**
 * 敷地プランナーの算定値から**模式的な**階構成を導く。
 *
 * 実施設計の平面ではなく「作業場がどれだけを占め、上階に何層積むことになるか」
 * を立体で掴むための概形。作業場は 1 階の北側に全幅で敷き、残りを南側の帯に
 * 直売と付属で二分する。上階は 1 フロア = 建築面積として積み、端数は最上階に
 * 割り当てる。
 *
 * **作業場を 1 階だけに置く**のは意匠の好みではなく、近隣商業地域の 150 ㎡
 * 制限が床面積の**合計**に掛かるため (法48条9項＋別表第二)。上階に同じ用途を
 * 積むと合計で超える。
 */
export function buildSchematicFloors(input: SchematicInput): FloorSpec[] {
  const w = nonNeg(input.widthM);
  const d = nonNeg(input.depthM);
  const footprint = w * d;
  if (w <= 0 || d <= 0) return [];

  const workshop = Math.min(nonNeg(input.workshopSqm), footprint);
  const workshopDepth = workshop / w;
  const restDepth = Math.max(0, d - workshopDepth);

  const ground: RoomSpec[] = [];
  if (workshopDepth > 0) {
    ground.push({ x1: 0, y1: 0, x2: w, y2: workshopDepth, name: '作業場 (栽培室)', kind: 'workshop' });
  }
  if (restDepth > 0) {
    // 残りの帯を直売 (西 2/3) と付属・機械室 (東 1/3) に割る。
    const split = round1((w * 2) / 3);
    ground.push({ x1: 0, y1: workshopDepth, x2: split, y2: d, name: '直売・事務', kind: 'retail' });
    ground.push({ x1: split, y1: workshopDepth, x2: w, y2: d, name: '機械室・付属', kind: 'water' });
  }

  const floors: FloorSpec[] = [{ name: '1F', rooms: ground }];

  // 残余は 0.1 ㎡ 単位に丸めてから回す。許容誤差 (> 0.05) で判定すると浮動小数の
  // 残差でちょうど境界に乗ることがなく、`>` と `>=` を区別できない変異が残る。
  let remaining = round1(nonNeg(input.upperFloorsSqm));
  let level = 2;
  // 端数フロアは奥行を縮めて表現する。上限 8 層で打ち切り (それ以上は模式図の
  // 意味が薄く、面積 0 が続いたときの空回りも避ける)。
  while (remaining > 0 && level <= 8) {
    const area = Math.min(remaining, footprint);
    const fd = round1(area / w);
    floors.push({
      name: `${level}F`,
      depthM: fd,
      rooms: [{ x1: 0, y1: 0, x2: w, y2: fd, name: `${level}F 事務・店舗等`, kind: 'other' }],
    });
    remaining = round1(remaining - area);
    level += 1;
  }
  return floors;
}
