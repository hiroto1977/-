import { describe, expect, it } from 'vitest';
import {
  projectIso,
  checkFloorFit,
  buildIsoModel,
  buildSchematicFloors,
  type FloorSpec,
  type RoomSpec,
} from '../buildingIso';

const OPT = { scale: 10, originX: 0, originY: 0, floorGapPx: 100, slabPx: 8 };

describe('projectIso — 等角投影', () => {
  it('原点はそのまま原点に写る', () => {
    expect(projectIso(0, 0, 0, OPT)).toEqual({ x: 0, y: 0 });
  });

  it('x は右下へ、y は左下へ倒れる', () => {
    const px = projectIso(1, 0, 0, OPT);
    const py = projectIso(0, 1, 0, OPT);
    expect(px.x).toBeGreaterThan(0);
    expect(py.x).toBeLessThan(0);
    expect(px.y).toBeGreaterThan(0);
    expect(py.y).toBeGreaterThan(0);
    // 対称: x 方向と y 方向は左右反転で同じ高さ
    expect(px.x).toBeCloseTo(-py.x, 5);
    expect(px.y).toBeCloseTo(py.y, 5);
  });

  it('lift は画面上方向へ持ち上げる', () => {
    expect(projectIso(2, 3, 50, OPT).y).toBe(projectIso(2, 3, 0, OPT).y - 50);
  });

  it('原点オフセットが効く', () => {
    expect(projectIso(0, 0, 0, { ...OPT, originX: 40, originY: 25 })).toEqual({ x: 40, y: 25 });
  });

  it('既定値でも投影できる (オプション省略)', () => {
    const p = projectIso(0, 0, 0);
    expect(p.x).toBe(250);
    expect(p.y).toBe(320);
  });

  it('縮尺を変えると比例する (0.1 に丸めるため誤差は許容)', () => {
    const a = projectIso(4, 0, 0, { ...OPT, scale: 10 });
    const b = projectIso(4, 0, 0, { ...OPT, scale: 20 });
    expect(a.x).toBe(34.6); // 4 × cos30 × 10 = 34.641 → 34.6
    expect(b.x).toBe(69.3); // 4 × cos30 × 20 = 69.282 → 69.3
    expect(Math.abs(b.x - a.x * 2)).toBeLessThan(0.2);
  });
});

describe('checkFloorFit — 室が外形を埋めているか', () => {
  const full: RoomSpec[] = [
    { x1: 0, y1: 0, x2: 12, y2: 12.5, name: 'A', kind: 'workshop' },
    { x1: 0, y1: 12.5, x2: 12, y2: 18, name: 'B', kind: 'retail' },
  ];

  it('過不足なく埋まっていれば fits=true', () => {
    const r = checkFloorFit(full, 12, 18);
    expect(r.roomsSqm).toBe(216);
    expect(r.outlineSqm).toBe(216);
    expect(r.fits).toBe(true);
  });

  it('区画を定義し忘れた隙間を検出する', () => {
    // 実際に踏んだ失敗: コアを L 字にせず 1 枚で置き 12 ㎡ 足りなかった
    const missing = full.slice(0, 1);
    const r = checkFloorFit(missing, 12, 18);
    expect(r.roomsSqm).toBe(150);
    expect(r.outlineSqm).toBe(216);
    expect(r.fits).toBe(false);
  });

  it('はみ出しも検出する', () => {
    const over = [...full, { x1: 0, y1: 0, x2: 2, y2: 2, name: 'C', kind: 'other' as const }];
    expect(checkFloorFit(over, 12, 18).fits).toBe(false);
  });

  it('座標が逆順でも面積は正で数える', () => {
    const rev: RoomSpec[] = [{ x1: 12, y1: 18, x2: 0, y2: 0, name: 'R', kind: 'other' }];
    expect(checkFloorFit(rev, 12, 18).fits).toBe(true);
  });

  it('室が無ければ埋まっていない', () => {
    expect(checkFloorFit([], 12, 18).fits).toBe(false);
  });

  it('外形が 0 で室も無ければ一致とみなす', () => {
    expect(checkFloorFit([], 0, 0).fits).toBe(true);
  });

  it('負の寸法は 0 に丸める', () => {
    expect(checkFloorFit([], -12, -18).outlineSqm).toBe(0);
  });
});

describe('buildIsoModel — 分解アイソメの組み立て', () => {
  const floors: FloorSpec[] = [
    {
      name: '1F',
      rooms: [
        { x1: 0, y1: 0, x2: 12, y2: 12.5, name: '栽培室', kind: 'workshop' },
        { x1: 0, y1: 12.5, x2: 12, y2: 18, name: '直売', kind: 'retail' },
      ],
    },
    {
      name: '2F',
      rooms: [{ x1: 0, y1: 0, x2: 12, y2: 18, name: '事務', kind: 'other' }],
    },
  ];

  it('階数ぶんのプレートを返す', () => {
    const m = buildIsoModel(12, 18, floors, OPT);
    expect(m.floors).toHaveLength(2);
    expect(m.floors[0]?.name).toBe('1F');
    expect(m.floors[1]?.name).toBe('2F');
  });

  it('上階は floorGapPx ぶん持ち上がる', () => {
    const m = buildIsoModel(12, 18, floors, OPT);
    expect(m.floors[1]?.outline[0]?.y).toBe((m.floors[0]?.outline[0]?.y ?? 0) - 100);
  });

  it('外形は 4 点、側面は 4 点ずつ', () => {
    const m = buildIsoModel(12, 18, floors, OPT);
    expect(m.floors[0]?.outline).toHaveLength(4);
    expect(m.floors[0]?.sideSouth).toHaveLength(4);
    expect(m.floors[0]?.sideEast).toHaveLength(4);
  });

  it('側面はスラブ厚ぶん下へ落ちる', () => {
    const m = buildIsoModel(12, 18, floors, OPT);
    const f = m.floors[0];
    expect(f?.sideSouth[2]?.y).toBe((f?.sideSouth[1]?.y ?? 0) + 8);
    expect(f?.sideEast[2]?.y).toBe((f?.sideEast[1]?.y ?? 0) + 8);
  });

  it('室の面積とラベル位置を持つ', () => {
    const m = buildIsoModel(12, 18, floors, OPT);
    const grow = m.floors[0]?.rooms[0];
    expect(grow?.areaSqm).toBe(150);
    expect(grow?.points).toHaveLength(4);
    expect(grow?.label).toEqual(projectIso(6, 6.25, 0, OPT));
  });

  it('補助線は階の継ぎ目ごとに 3 本', () => {
    const m = buildIsoModel(12, 18, floors, OPT);
    expect(m.leaders).toHaveLength(3);
    const three = buildIsoModel(12, 18, [...floors, { name: '3F', rooms: [] }], OPT);
    expect(three.leaders).toHaveLength(6);
  });

  it('全階が埋まっていれば allFit=true', () => {
    expect(buildIsoModel(12, 18, floors, OPT).allFit).toBe(true);
  });

  it('どこか 1 階でも隙間があれば allFit=false', () => {
    const broken: FloorSpec[] = [{ name: '1F', rooms: floors[0]?.rooms ?? [] }, { name: '2F', rooms: [] }];
    const m = buildIsoModel(12, 18, broken, OPT);
    expect(m.floors[0]?.fits).toBe(true);
    expect(m.floors[1]?.fits).toBe(false);
    expect(m.allFit).toBe(false);
  });

  it('階ごとの奥行 (セットバック) を反映する', () => {
    const setback: FloorSpec[] = [
      { name: '1F', rooms: floors[0]?.rooms ?? [] },
      { name: '2F', depthM: 14, rooms: [{ x1: 0, y1: 0, x2: 12, y2: 14, name: 'S', kind: 'other' }] },
    ];
    const m = buildIsoModel(12, 18, setback, OPT);
    expect(m.floors[1]?.outlineSqm).toBe(168);
    expect(m.floors[1]?.fits).toBe(true);
  });

  it('bounds が全点を包含する', () => {
    const m = buildIsoModel(12, 18, floors, OPT);
    const all = m.floors.flatMap((f) => [...f.outline, ...f.sideSouth, ...f.sideEast]);
    expect(m.bounds.minX).toBe(Math.min(...all.map((p) => p.x)));
    expect(m.bounds.maxX).toBe(Math.max(...all.map((p) => p.x)));
    expect(m.bounds.minY).toBe(Math.min(...all.map((p) => p.y)));
    expect(m.bounds.maxY).toBe(Math.max(...all.map((p) => p.y)));
  });

  it('階が無ければ bounds は 0 で潰れる', () => {
    const m = buildIsoModel(12, 18, [], OPT);
    expect(m.floors).toHaveLength(0);
    expect(m.leaders).toHaveLength(0);
    expect(m.allFit).toBe(true);
    expect(m.bounds).toEqual({ minX: 0, minY: 0, maxX: 0, maxY: 0 });
  });

  it('オプション省略でも既定値で組める', () => {
    const m = buildIsoModel(12, 18, floors);
    expect(m.floors[1]?.outline[0]?.y).toBe((m.floors[0]?.outline[0]?.y ?? 0) - 134);
    expect(m.floors[0]?.sideSouth[2]?.y).toBe((m.floors[0]?.sideSouth[1]?.y ?? 0) + 9);
  });
});

describe('buildSchematicFloors — 算定値から模式プランを導く', () => {
  // 近隣商業 300 ㎡ の既定シナリオ: 建築面積 216・作業場 150・1F 残 66・上階 384
  const BASE = { widthM: 12, depthM: 18, workshopSqm: 150, groundOtherSqm: 66, upperFloorsSqm: 384 };

  it('1 階に作業場を全幅で敷き、残りを直売と機械室に割る', () => {
    const f = buildSchematicFloors(BASE);
    expect(f[0]?.name).toBe('1F');
    expect(f[0]?.rooms.map((r) => r.kind)).toEqual(['workshop', 'retail', 'water']);
    expect(f[0]?.rooms[0]?.y2).toBeCloseTo(12.5, 5); // 150 / 12
  });

  it('1 階は外形を過不足なく埋める', () => {
    const f = buildSchematicFloors(BASE);
    expect(checkFloorFit(f[0]?.rooms ?? [], 12, 18).fits).toBe(true);
  });

  it('上階は建築面積ぶんずつ積み、端数は最上階に回す', () => {
    const f = buildSchematicFloors(BASE);
    // 384 = 216 + 168 → 2F 満床 / 3F は 168 ㎡
    expect(f.map((x) => x.name)).toEqual(['1F', '2F', '3F']);
    expect(f[1]?.depthM).toBe(18);
    expect(f[2]?.depthM).toBe(14);
  });

  it('作業場が建築面積を超えても 1 階に収める', () => {
    const f = buildSchematicFloors({ ...BASE, workshopSqm: 999 });
    expect(f[0]?.rooms).toHaveLength(1);
    expect(f[0]?.rooms[0]?.kind).toBe('workshop');
    expect(checkFloorFit(f[0]?.rooms ?? [], 12, 18).fits).toBe(true);
  });

  it('作業場ゼロなら直売と機械室だけになる', () => {
    const f = buildSchematicFloors({ ...BASE, workshopSqm: 0 });
    expect(f[0]?.rooms.map((r) => r.kind)).toEqual(['retail', 'water']);
    expect(checkFloorFit(f[0]?.rooms ?? [], 12, 18).fits).toBe(true);
  });

  it('上階ゼロなら 1 階だけ', () => {
    expect(buildSchematicFloors({ ...BASE, upperFloorsSqm: 0 }).map((f) => f.name)).toEqual(['1F']);
  });

  it('寸法が無ければ何も返さない', () => {
    expect(buildSchematicFloors({ ...BASE, widthM: 0 })).toEqual([]);
    expect(buildSchematicFloors({ ...BASE, depthM: 0 })).toEqual([]);
  });

  it('上階が過大でも 8 層で打ち切る (無限ループにしない)', () => {
    const f = buildSchematicFloors({ ...BASE, upperFloorsSqm: 100000 });
    expect(f).toHaveLength(8);
    expect(f[7]?.name).toBe('8F');
  });

  it('負の入力は 0 に丸める', () => {
    const f = buildSchematicFloors({ ...BASE, workshopSqm: -50, upperFloorsSqm: -10 });
    expect(f).toHaveLength(1);
    expect(f[0]?.rooms[0]?.kind).toBe('retail');
  });

  it('模式プランをそのまま立体化できる', () => {
    const m = buildIsoModel(12, 18, buildSchematicFloors(BASE), OPT);
    expect(m.allFit).toBe(true);
    expect(m.floors).toHaveLength(3);
  });
});

describe('変異を落とすための境界・同一性の検査', () => {
  it('投影の Y は縮尺に比例する (乗除の取り違えを検出)', () => {
    // (x+y) × 0.5 × scale。除算に化けると 0.05 になり桁が変わる
    expect(projectIso(1, 0, 0, OPT).y).toBe(5);
    expect(projectIso(3, 1, 0, OPT).y).toBe(20);
    expect(projectIso(3, 1, 0, { ...OPT, scale: 20 }).y).toBe(40);
  });

  it('非有限な入力は 0 として扱う', () => {
    expect(checkFloorFit([], Number.NaN, 18).outlineSqm).toBe(0);
    expect(checkFloorFit([], 12, Number.POSITIVE_INFINITY).outlineSqm).toBe(0);
    expect(buildSchematicFloors({ widthM: Number.NaN, depthM: 18, workshopSqm: 1, groundOtherSqm: 0, upperFloorsSqm: 0 })).toEqual([]);
  });

  it('原点から離れた室でも面積は差で求める (和との取り違えを検出)', () => {
    const m = buildIsoModel(12, 18, [
      {
        name: '1F',
        rooms: [
          { x1: 0, y1: 0, x2: 6, y2: 18, name: 'W', kind: 'other' },
          { x1: 6, y1: 0, x2: 12, y2: 6, name: 'NE', kind: 'other' },
          { x1: 6, y1: 6, x2: 12, y2: 18, name: 'SE', kind: 'other' },
        ],
      },
    ], OPT);
    expect(m.floors[0]?.rooms.map((r) => r.areaSqm)).toEqual([
      108, // 6 × 18
      36, //  (12−6) × (6−0)
      72, //  (12−6) × (18−6)
    ]);
    expect(m.floors[0]?.fits).toBe(true);
  });

  it('補助線は上下階の同じ隅を実際に結ぶ', () => {
    const floors: FloorSpec[] = [
      { name: '1F', rooms: [{ x1: 0, y1: 0, x2: 12, y2: 18, name: 'A', kind: 'other' }] },
      { name: '2F', rooms: [{ x1: 0, y1: 0, x2: 12, y2: 18, name: 'B', kind: 'other' }] },
    ];
    const m = buildIsoModel(12, 18, floors, OPT);
    expect(m.leaders).toHaveLength(3);
    for (let k = 0; k < 3; k += 1) {
      expect(m.leaders[k]).toHaveLength(2);
      expect(m.leaders[k]?.[0]).toEqual(m.floors[1]?.outline[k]);
      expect(m.leaders[k]?.[1]).toEqual(m.floors[0]?.outline[k]);
    }
  });

  it('模式プランの室名と用途区分が入っている', () => {
    const f = buildSchematicFloors({ widthM: 12, depthM: 18, workshopSqm: 150, groundOtherSqm: 66, upperFloorsSqm: 384 });
    expect(f.map((fl) => fl.rooms.map((r) => [r.name, r.kind]))).toEqual([
      [
        ['作業場 (栽培室)', 'workshop'],
        ['直売・事務', 'retail'],
        ['機械室・付属', 'water'],
      ],
      [['2F 事務・店舗等', 'other']],
      [['3F 事務・店舗等', 'other']],
    ]);
  });

  it('南帯は西 2/3 が直売、東 1/3 が機械室', () => {
    const f = buildSchematicFloors({ widthM: 12, depthM: 18, workshopSqm: 150, groundOtherSqm: 66, upperFloorsSqm: 0 });
    const rooms = f[0]?.rooms ?? [];
    expect(rooms.map((r) => [r.kind, r.x1, r.x2])).toEqual([
      ['workshop', 0, 12],
      ['retail', 0, 8], // 12 × 2 / 3
      ['water', 8, 12],
    ]);
  });

  it('残余を使い切ったら止まる (0 で止まらないと空フロアが積まれる)', () => {
    // ちょうど 1 フロアぶん → 2F だけ。残余 0 で確実に停止する
    const exact = buildSchematicFloors({ widthM: 12, depthM: 18, workshopSqm: 150, groundOtherSqm: 66, upperFloorsSqm: 216 });
    expect(exact.map((x) => x.name)).toEqual(['1F', '2F']);
    // わずかな端数は 0.1 ㎡ 単位に丸めたうえで 1 層に載せる
    const frac = buildSchematicFloors({ widthM: 12, depthM: 18, workshopSqm: 150, groundOtherSqm: 66, upperFloorsSqm: 216.1 });
    expect(frac.map((x) => x.name)).toEqual(['1F', '2F', '3F']);
    expect(frac.map((x) => x.depthM)).toEqual([undefined, 18, 0]);
  });
});
