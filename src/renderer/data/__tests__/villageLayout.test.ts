import { describe, it, expect } from 'vitest';
import {
  buildVillagers,
  buildRegions,
  type VillageRegistry,
  type Villager,
  type VillageRegion,
} from '../villageData';
import {
  regionRects,
  layoutDistrict,
  computeHomePositions,
  computeDistrictFocus,
  wanderOffset,
  FOCUS_RECT,
  WORK_PLAZA,
  type Rect,
  type Point,
} from '../villageLayout';
import { org, teams, rounds, backlog } from '../../../../orchestration/registry.json';

const REG: VillageRegistry = {
  org: org as VillageRegistry['org'],
  teams: teams as VillageRegistry['teams'],
  rounds: rounds as VillageRegistry['rounds'],
  backlog: backlog as VillageRegistry['backlog'],
};

const VILLAGERS = buildVillagers(REG);
const REGIONS = buildRegions(REG);

/** 点が矩形（余白付き）内にあるか。 */
function inRect(p: { x: number; y: number }, r: Rect, pad = 0): boolean {
  return p.x >= r.x - pad && p.x <= r.x + r.w + pad && p.y >= r.y - pad && p.y <= r.y + r.h + pad;
}

describe('regionRects', () => {
  const rects = regionRects(REGIONS);

  it('has a rect for ceo, coo and every exec region', () => {
    expect(rects.get('ceo')).toBeTruthy();
    expect(rects.get('coo')).toBeTruthy();
    for (const r of REGIONS.filter((x) => x.kind === 'exec')) {
      expect(rects.get(r.id)).toBeTruthy();
    }
  });

  it('keeps every rect inside the 0–100 scene', () => {
    for (const r of rects.values()) {
      expect(r.x).toBeGreaterThanOrEqual(0);
      expect(r.y).toBeGreaterThanOrEqual(0);
      expect(r.x + r.w).toBeLessThanOrEqual(100.01);
      expect(r.y + r.h).toBeLessThanOrEqual(100.01);
    }
  });

  it('lays exec districts out left-to-right without horizontal overlap', () => {
    const execRects = REGIONS.filter((r) => r.kind === 'exec')
      .map((r) => rects.get(r.id)!)
      .sort((a, b) => a.x - b.x);
    for (let i = 1; i < execRects.length; i++) {
      // 前の街区の右端 ≤ 次の街区の左端（重なり無し）
      expect(execRects[i - 1]!.x + execRects[i - 1]!.w).toBeLessThanOrEqual(execRects[i]!.x + 0.01);
    }
  });

  it('is deterministic', () => {
    const a = JSON.stringify([...regionRects(REGIONS)]);
    const b = JSON.stringify([...regionRects(REGIONS)]);
    expect(a).toBe(b);
  });
});

describe('layoutDistrict — clustering inside one district', () => {
  const rect: Rect = { x: 10, y: 20, w: 40, h: 60 };
  const list = VILLAGERS.filter((v) => v.execId === 'cfo');
  const home = layoutDistrict(list, rect);

  it('places every villager of the district', () => {
    expect(home.size).toBe(list.length);
    for (const v of list) expect(home.get(v.id)).toBeTruthy();
  });

  it('keeps every position inside the district rect', () => {
    for (const p of home.values()) expect(inRect(p, rect, 0.5)).toBe(true);
  });

  it('puts the executive at the top of the district', () => {
    const exec = list.find((v) => v.kind === 'executive')!;
    const others = list.filter((v) => v.id !== exec.id);
    const execY = home.get(exec.id)!.y;
    // 役員は街区上部（大半の他村人より上）
    const below = others.filter((v) => home.get(v.id)!.y >= execY).length;
    expect(below).toBeGreaterThan(others.length * 0.6);
  });

  it('clusters each team nearest to its own manager cluster', () => {
    // 部長マーカーはクラスタ上端に置かれ、チームはその下に詰められる。よって
    // 「最寄りの部長マーカー」ではなく「最寄りのクラスタ重心」でまとまりを検証する
    // （重心＝部長＋配下チームの平均座標）。
    const mgrs = list.filter((v) => v.kind === 'manager');
    const centroid = new Map<string, { x: number; y: number }>();
    for (const m of mgrs) {
      const members = [m, ...list.filter((v) => v.kind === 'team' && v.managerId === m.id)];
      const cx = members.reduce((s, v) => s + home.get(v.id)!.x, 0) / members.length;
      const cy = members.reduce((s, v) => s + home.get(v.id)!.y, 0) / members.length;
      centroid.set(m.id, { x: cx, y: cy });
    }
    let checked = 0;
    for (const m of mgrs) {
      const teamKids = list.filter((v) => v.kind === 'team' && v.managerId === m.id);
      const own = centroid.get(m.id)!;
      for (const t of teamKids) {
        const tp = home.get(t.id)!;
        const dOwn = Math.hypot(tp.x - own.x, tp.y - own.y);
        for (const o of mgrs) {
          if (o.id === m.id) continue;
          const oc = centroid.get(o.id)!;
          const dOther = Math.hypot(tp.x - oc.x, tp.y - oc.y);
          expect(dOwn).toBeLessThanOrEqual(dOther + 0.01);
        }
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(0);
  });

  it('is deterministic', () => {
    expect(JSON.stringify([...layoutDistrict(list, rect)])).toBe(JSON.stringify([...layoutDistrict(list, rect)]));
  });
});

describe('computeHomePositions — full 143-body overview', () => {
  const home = computeHomePositions(VILLAGERS, REGIONS);

  it('places every villager', () => {
    expect(home.size).toBe(VILLAGERS.length);
    for (const v of VILLAGERS) expect(home.get(v.id)).toBeTruthy();
  });

  it('keeps every position inside the 0–100 scene', () => {
    for (const p of home.values()) {
      expect(p.x).toBeGreaterThanOrEqual(-0.5);
      expect(p.x).toBeLessThanOrEqual(100.5);
      expect(p.y).toBeGreaterThanOrEqual(-0.5);
      expect(p.y).toBeLessThanOrEqual(100.5);
    }
  });

  it('lands each villager inside (or near) its own district rect', () => {
    const rects = regionRects(REGIONS);
    let inside = 0;
    for (const v of VILLAGERS) {
      const rect = rects.get(v.regionId);
      if (rect && inRect(home.get(v.id)!, rect, 2)) inside++;
    }
    // 圧倒的多数が自分の街区内（CEO/COO の帯配置も rect 内）
    expect(inside).toBeGreaterThan(VILLAGERS.length * 0.9);
  });

  it('is deterministic', () => {
    const a = JSON.stringify([...computeHomePositions(VILLAGERS, REGIONS)]);
    const b = JSON.stringify([...computeHomePositions(VILLAGERS, REGIONS)]);
    expect(a).toBe(b);
  });
});

describe('computeDistrictFocus — zoomed single district', () => {
  const list = VILLAGERS.filter((v) => v.execId === 'cio');
  const focus = computeDistrictFocus(list);

  it('places every villager of the focused district', () => {
    expect(focus.size).toBe(list.length);
  });

  it('uses the large FOCUS_RECT so labels have room', () => {
    for (const p of focus.values()) expect(inRect(p, FOCUS_RECT, 0.5)).toBe(true);
    // FOCUS_RECT は概観の街区より広い
    expect(FOCUS_RECT.w).toBeGreaterThan(50);
    expect(FOCUS_RECT.h).toBeGreaterThan(50);
  });

  it('is deterministic', () => {
    expect(JSON.stringify([...computeDistrictFocus(list)])).toBe(JSON.stringify([...computeDistrictFocus(list)]));
  });
});

describe('wanderOffset', () => {
  it('is bounded by the amplitude', () => {
    for (let i = 0; i < 50; i++) {
      for (let t = 0; t < 20; t++) {
        const o = wanderOffset(i, t, 0.5);
        expect(Math.abs(o.x)).toBeLessThanOrEqual(0.5 + 1e-9);
        expect(Math.abs(o.y)).toBeLessThanOrEqual(0.5 + 1e-9);
      }
    }
  });

  it('scales with amplitude and is deterministic', () => {
    expect(wanderOffset(3, 7, 1)).toEqual(wanderOffset(3, 7, 1));
    const small = wanderOffset(3, 7, 0.5);
    const big = wanderOffset(3, 7, 1);
    expect(Math.abs(big.x)).toBeGreaterThanOrEqual(Math.abs(small.x) - 1e-9);
  });

  it('defaults to a gentle amplitude', () => {
    const o = wanderOffset(1, 1);
    expect(Math.abs(o.x)).toBeLessThanOrEqual(0.5 + 1e-9);
  });
});

describe('WORK_PLAZA', () => {
  it('sits in the upper-central scene', () => {
    expect(WORK_PLAZA.x).toBeGreaterThan(30);
    expect(WORK_PLAZA.x).toBeLessThan(70);
    expect(WORK_PLAZA.y).toBeGreaterThan(0);
    expect(WORK_PLAZA.y).toBeLessThan(100);
  });
});


/*
 * 座標そのものを固定する golden。
 *
 * ここは純幾何なので、既存の検査のように「矩形の中に入っている」「重ならない」と
 * いった**性質**だけを見ると、式を 1 つ書き換えても保たれてしまう。2026-08-21 の
 * 実測で 13.30% (生存 159) だった。`charts.ts` を 72.01% → 100% にしたときと
 * 同じで、値を手で計算して置く。
 *
 * 手計算 (rect = {0,0,100,100} の街区):
 *   content = {x: 3, y: 18, w: 94, h: 80}
 *   管理職 2 人 → mCols = round(sqrt(2×94/80)) = round(1.53) = 2、mRows = 1
 *   cellW = 47, cellH = 80 → m1 は x = 3 + 23.5 = 26.5, y = 18 + 11.2 = 29.2
 *   m1 のチーム矩形 = {x: 5.82, y: 42, w: 41.36, h: 52.8}
 *   2 人 → cols = round(sqrt(2×41.36/52.8)) = round(1.25) = 1、rows = 2
 *   → t1 は y = 42 + 13.2 = 55.2、t2 は y = 42 + 39.6 = 81.6
 */
describe('villageLayout — 座標の golden', () => {
  const V = (
    id: string,
    kind: string,
    regionId = 'e1',
    managerId?: string,
  ): Villager => ({ id, name: id, kind, emoji: '🙂', regionId, managerId }) as Villager;

  const REGIONS = [
    { id: 'ceo', kind: 'ceo' },
    { id: 'coo', kind: 'coo' },
    { id: 'e1', kind: 'exec' },
    { id: 'e2', kind: 'exec' },
  ] as unknown as VillageRegion[];

  const DISTRICT = [
    V('x1', 'executive'),
    V('s1', 'secretary'),
    V('s2', 'secretary'),
    V('m1', 'manager'),
    V('m2', 'manager'),
    V('t1', 'team', 'e1', 'm1'),
    V('t2', 'team', 'e1', 'm1'),
    V('t3', 'team', 'e1', 'm2'),
  ];

  const near = (p: Point, x: number, y: number) => {
    expect(p.x).toBeCloseTo(x, 6);
    expect(p.y).toBeCloseTo(y, 6);
  };

  describe('regionRects', () => {
    it('CEO / COO は固定の矩形', () => {
      const r = regionRects(REGIONS);
      expect(r.get('ceo')).toEqual({ x: 40, y: 3, w: 20, h: 10 });
      expect(r.get('coo')).toEqual({ x: 38, y: 14, w: 24, h: 8 });
    });

    it('役員の列幅は溝を n+1 本引いて等分する', () => {
      // colW = (100 − 1.4×3)/2 = 47.9、x は 1.4 と 1.4+47.9+1.4 = 50.7。
      const r = regionRects(REGIONS);
      const e1 = r.get('e1')!;
      const e2 = r.get('e2')!;
      expect(e1.w).toBeCloseTo(47.9, 6);
      expect(e1.x).toBeCloseTo(1.4, 6);
      expect(e2.x).toBeCloseTo(50.7, 6);
      expect(e1.y).toBe(38);
      expect(e1.h).toBe(60);
      // 右端が画面内に収まる (溝 1 本ぶん余る)。
      expect(e2.x + e2.w).toBeCloseTo(98.6, 6);
    });

    it('役員 1 人なら 1 列で幅 97.2', () => {
      const r = regionRects([{ id: 'e1', kind: 'exec' }] as unknown as VillageRegion[]);
      expect(r.get('e1')!.w).toBeCloseTo(97.2, 6);
      expect(r.get('e1')!.x).toBeCloseTo(1.4, 6);
    });

    it('役員が 0 人でも落ちない (CEO/COO だけ返す)', () => {
      const r = regionRects([] as unknown as VillageRegion[]);
      expect([...r.keys()]).toEqual(['ceo', 'coo']);
    });

    it('exec 以外の region は列に数えない', () => {
      // ceo/coo が n に混ざると列幅が変わる。
      const withOnlyExecs = regionRects([
        { id: 'e1', kind: 'exec' },
        { id: 'e2', kind: 'exec' },
      ] as unknown as VillageRegion[]);
      expect(withOnlyExecs.get('e1')!.w).toBeCloseTo(regionRects(REGIONS).get('e1')!.w, 6);
    });
  });

  describe('layoutDistrict', () => {
    const rect: Rect = { x: 0, y: 0, w: 100, h: 100 };

    it('役員は上部中央 (幅の 50% / 高さの 5%)', () => {
      near(layoutDistrict(DISTRICT, rect).get('x1')!, 50, 5);
    });

    it('秘書は役員の下の帯に等間隔 (高さの 12%)', () => {
      const d = layoutDistrict(DISTRICT, rect);
      near(d.get('s1')!, 100 / 3, 12);
      near(d.get('s2')!, 200 / 3, 12);
    });

    it('管理職はコンテンツ領域のグリッド', () => {
      const d = layoutDistrict(DISTRICT, rect);
      near(d.get('m1')!, 26.5, 29.2);
      near(d.get('m2')!, 73.5, 29.2);
    });

    it('チームは所属管理職の直下にクラスタされる', () => {
      const d = layoutDistrict(DISTRICT, rect);
      // m1 の 2 人は縦 1 列 (cols=1, rows=2)。
      near(d.get('t1')!, 26.5, 55.2);
      near(d.get('t2')!, 26.5, 81.6);
      // m2 の 1 人は自分のセルの中央。
      near(d.get('t3')!, 73.5, 68.4);
    });

    it('チームは管理職と同じ列に入る (別の管理職の下へ流れない)', () => {
      const d = layoutDistrict(DISTRICT, rect);
      expect(d.get('t1')!.x).toBeCloseTo(d.get('m1')!.x, 6);
      expect(d.get('t3')!.x).toBeCloseTo(d.get('m2')!.x, 6);
      expect(d.get('t1')!.x).not.toBeCloseTo(d.get('m2')!.x, 6);
    });

    it('チームは管理職より下に置く', () => {
      const d = layoutDistrict(DISTRICT, rect);
      expect(d.get('t1')!.y).toBeGreaterThan(d.get('m1')!.y);
      expect(d.get('t3')!.y).toBeGreaterThan(d.get('m2')!.y);
    });

    it('id の昇順で並べる (入力順に依存しない)', () => {
      const shuffled = [DISTRICT[4]!, DISTRICT[2]!, DISTRICT[6]!, DISTRICT[1]!, DISTRICT[3]!, DISTRICT[5]!, DISTRICT[0]!, DISTRICT[7]!];
      const a = layoutDistrict(DISTRICT, rect);
      const b = layoutDistrict(shuffled, rect);
      for (const id of ['x1', 's1', 's2', 'm1', 'm2', 't1', 't2', 't3']) {
        near(b.get(id)!, a.get(id)!.x, a.get(id)!.y);
      }
    });

    it('矩形の原点をずらすと全員が同じだけ動く', () => {
      const moved = layoutDistrict(DISTRICT, { x: 10, y: 20, w: 100, h: 100 });
      const base = layoutDistrict(DISTRICT, rect);
      for (const id of ['x1', 's1', 'm1', 't1']) {
        near(moved.get(id)!, base.get(id)!.x + 10, base.get(id)!.y + 20);
      }
    });

    it('空の街区は空の Map', () => {
      expect(layoutDistrict([], rect).size).toBe(0);
    });

    it('管理職が 0 人でもチームは落ちない (置かれないだけ)', () => {
      const d = layoutDistrict([V('t9', 'team', 'e1', 'mX')], rect);
      expect(d.has('t9')).toBe(false);
    });

    it('managerId の無いチームは どの管理職の下にも入らない', () => {
      const d = layoutDistrict([V('m1', 'manager'), V('t0', 'team', 'e1', undefined)], rect);
      expect(d.has('m1')).toBe(true);
      expect(d.has('t0')).toBe(false);
    });

    it('秘書が 1 人なら中央 (n+1 で割る)', () => {
      near(layoutDistrict([V('s1', 'secretary')], rect).get('s1')!, 50, 12);
    });

    it('役員が複数でも全員同じ位置 (上部中央)', () => {
      const d = layoutDistrict([V('x1', 'executive'), V('x2', 'executive')], rect);
      near(d.get('x1')!, 50, 5);
      near(d.get('x2')!, 50, 5);
    });
  });

  describe('computeHomePositions', () => {
    it('CEO / COO は自分の矩形に等間隔で中央高さ', () => {
      const home = computeHomePositions(
        [V('c1', 'ceo', 'ceo'), V('o1', 'coo', 'coo')],
        REGIONS,
      );
      near(home.get('c1')!, 50, 8); // 40 + 20×0.5, 3 + 10×0.5
      near(home.get('o1')!, 50, 18); // 38 + 24×0.5, 14 + 8×0.5
    });

    it('CEO が 2 人なら横に等間隔 (n+1 で割る)', () => {
      const home = computeHomePositions(
        [V('c1', 'ceo', 'ceo'), V('c2', 'ceo', 'ceo')],
        REGIONS,
      );
      near(home.get('c1')!, 40 + 20 / 3, 8);
      near(home.get('c2')!, 40 + 40 / 3, 8);
    });

    it('役員街区は layoutDistrict の結果を街区の矩形で返す', () => {
      const home = computeHomePositions(DISTRICT, REGIONS);
      // e1 の矩形は {1.4, 38, 47.9, 60}。
      near(home.get('x1')!, 1.4 + 47.9 * 0.5, 38 + 60 * 0.05);
      expect(home.get('m1')).toBeDefined();
      expect(home.get('t1')).toBeDefined();
    });

    it('矩形の無い region はフォールバックの中央 10×10 を使う', () => {
      const home = computeHomePositions(
        [V('z1', 'ceo', 'ghost')],
        [{ id: 'ghost', kind: 'ceo' }] as unknown as VillageRegion[],
      );
      // フォールバック {45,45,10,10} の中央高さ、1 人なので x は中央。
      near(home.get('z1')!, 50, 50);
    });

    it('region に属さない村人は置かれない', () => {
      const home = computeHomePositions([V('lost', 'team', 'nowhere', 'm1')], REGIONS);
      expect(home.has('lost')).toBe(false);
    });

    it('並び順は kind → id (未知の kind は最後)', () => {
      const home = computeHomePositions(
        [V('b', 'unknown-kind', 'ceo'), V('a', 'ceo', 'ceo')],
        [{ id: 'ceo', kind: 'ceo' }] as unknown as VillageRegion[],
      );
      // ceo (順位 0) が先、未知 (順位 9) が後 → x が小さいのが a。
      expect(home.get('a')!.x).toBeLessThan(home.get('b')!.x);
    });
  });

  describe('computeDistrictFocus', () => {
    it('FOCUS_RECT を使って layoutDistrict へ委譲する', () => {
      expect(FOCUS_RECT).toEqual({ x: 5, y: 15, w: 90, h: 82 });
      const focus = computeDistrictFocus(DISTRICT);
      const direct = layoutDistrict(DISTRICT, FOCUS_RECT);
      for (const [id, p] of direct) near(focus.get(id)!, p.x, p.y);
    });

    it('全体表示より大きく広がる (拡大の意味がある)', () => {
      const full = computeHomePositions(DISTRICT, REGIONS);
      const focus = computeDistrictFocus(DISTRICT);
      const spread = (m: Map<string, Point>) => {
        const xs = [...m.values()].map((p) => p.x);
        return Math.max(...xs) - Math.min(...xs);
      };
      expect(spread(focus)).toBeGreaterThan(spread(full));
    });
  });

  describe('wanderOffset', () => {
    it('原点は x=0 / y=amp×0.8', () => {
      near(wanderOffset(0, 0), 0, 0.4);
    });

    it('添字で位相がずれる', () => {
      // sin(1.7)×0.5 = 0.4958324、cos(1.3)×0.4 = 0.1069995
      near(wanderOffset(1, 0), 0.4958324052262343, 0.10699953144983494);
    });

    it('時刻で位相がずれる (x と y で速さが違う)', () => {
      // sin(0.8)×0.5 = 0.3586780、cos(0.6)×0.4 = 0.3301342
      near(wanderOffset(0, 1), 0.3586780454497614, 0.33013424596387136);
    });

    it('振幅は amp に比例し、y は 0.8 倍', () => {
      const a = wanderOffset(3, 2, 1);
      const b = wanderOffset(3, 2, 2);
      expect(b.x).toBeCloseTo(a.x * 2, 6);
      expect(b.y).toBeCloseTo(a.y * 2, 6);
      // 同じ位相での y/x の比は sin/cos の比に 0.8 が掛かる。
      expect(Math.abs(a.y)).toBeLessThanOrEqual(1 * 0.8 + 1e-9);
    });

    it('既定の amp は 0.5', () => {
      near(wanderOffset(2, 3), wanderOffset(2, 3, 0.5).x, wanderOffset(2, 3, 0.5).y);
    });

    it('amp 0 なら動かない', () => {
      near(wanderOffset(5, 7, 0), 0, 0);
    });
  });
});


/*
 * 変異検査で残った箇所から起こした検査。
 *
 * 前の golden は「別の呼び出しと一致するか」で並び順を見ていた箇所があり、
 * **両方が同じ変異体を通る**ので差が出なかった。ここでは期待する並びを
 * 直に書く。グリッドの段数・セルの高さ・並び順の規則も、実際に段が 2 つ
 * 以上できる形を作って固定する。
 */
describe('villageLayout — 並び順とグリッドの段', () => {
  const V = (
    id: string,
    kind: string,
    regionId = 'e1',
    managerId?: string,
  ): Villager => ({ id, name: id, kind, emoji: '🙂', regionId, managerId }) as Villager;

  const rect: Rect = { x: 0, y: 0, w: 100, h: 100 };

  /** x が小さい順に id を並べる (同じ x なら y の小さい順)。 */
  const orderByPos = (m: Map<string, Point>): string[] =>
    [...m.entries()]
      .sort((a, b) => (a[1].x - b[1].x) || (a[1].y - b[1].y))
      .map(([id]) => id);

  it('秘書は id の昇順で左から並ぶ (期待する並びを直に書く)', () => {
    const d = layoutDistrict(
      [V('s3', 'secretary'), V('s1', 'secretary'), V('s2', 'secretary')],
      rect,
    );
    expect(orderByPos(d)).toEqual(['s1', 's2', 's3']);
    // 位置も等間隔 (n+1 で割る)。
    expect(d.get('s1')!.x).toBeCloseTo(25, 6);
    expect(d.get('s2')!.x).toBeCloseTo(50, 6);
    expect(d.get('s3')!.x).toBeCloseTo(75, 6);
  });

  it('管理職も id の昇順でグリッドへ入る (左上から行優先)', () => {
    // 3 人 → mCols = round(sqrt(3×94/80)) = round(1.88) = 2、mRows = 2。
    // m1 = 左上 / m2 = 右上 / m3 = 左下 なので、**行優先**で読む。
    const d = layoutDistrict([V('m3', 'manager'), V('m1', 'manager'), V('m2', 'manager')], rect);
    const rowMajor = [...d.entries()]
      .sort((a, b) => (a[1].y - b[1].y) || (a[1].x - b[1].x))
      .map(([id]) => id);
    expect(rowMajor).toEqual(['m1', 'm2', 'm3']);
    // 左上と左下は同じ列、右上は別の列。
    expect(d.get('m1')!.x).toBeCloseTo(d.get('m3')!.x, 6);
    expect(d.get('m2')!.x).toBeGreaterThan(d.get('m1')!.x);
    expect(d.get('m3')!.y).toBeGreaterThan(d.get('m1')!.y);
  });

  it('同じ id なら順序は変わらない (比較が 0 を返す)', () => {
    const d = layoutDistrict([V('s1', 'secretary'), V('s1', 'secretary')], rect);
    // 同じ id は同じ鍵なので 1 つに畳まれ、最後の位置が残る。
    expect(d.size).toBe(1);
  });

  it('チームは id の昇順で管理職の下に並ぶ', () => {
    const d = layoutDistrict(
      [
        V('m1', 'manager'),
        V('t3', 'team', 'e1', 'm1'),
        V('t1', 'team', 'e1', 'm1'),
        V('t2', 'team', 'e1', 'm1'),
      ],
      rect,
    );
    const teams = [...d.entries()]
      .filter(([id]) => id.startsWith('t'))
      .sort((a, b) => (a[1].y - b[1].y) || (a[1].x - b[1].x))
      .map(([id]) => id);
    expect(teams).toEqual(['t1', 't2', 't3']);
  });

  it('管理職グリッドは 2 段以上になると段の高さで割る', () => {
    // 管理職 5 人 → mCols = round(sqrt(5×94/80)) = round(2.42) = 2、mRows = 3。
    // cellH = 80/3、m1 の y = 18 + (80/3)×0.14、m3 (2 段目) は 1 段ぶん下。
    const mgrs = ['m1', 'm2', 'm3', 'm4', 'm5'].map((id) => V(id, 'manager'));
    const d = layoutDistrict(mgrs, rect);
    const cellH = 80 / 3;
    expect(d.get('m1')!.y).toBeCloseTo(18 + cellH * 0.14, 6);
    expect(d.get('m3')!.y).toBeCloseTo(18 + cellH * 1 + cellH * 0.14, 6);
    expect(d.get('m5')!.y).toBeCloseTo(18 + cellH * 2 + cellH * 0.14, 6);
    // 列は 2 本。m1/m3/m5 が左、m2/m4 が右。
    expect(d.get('m1')!.x).toBeCloseTo(d.get('m3')!.x, 6);
    expect(d.get('m2')!.x).toBeCloseTo(d.get('m4')!.x, 6);
    expect(d.get('m1')!.x).toBeLessThan(d.get('m2')!.x);
  });

  it('チームのグリッドも 2 列以上になると列の幅で割る', () => {
    // 横長のチーム矩形にすると cols > 1 になる。管理職 1 人・チーム 4 人。
    const wide: Rect = { x: 0, y: 0, w: 1000, h: 100 };
    const d = layoutDistrict(
      [V('m1', 'manager'), ...['t1', 't2', 't3', 't4'].map((id) => V(id, 'team', 'e1', 'm1'))],
      wide,
    );
    const xs = ['t1', 't2', 't3', 't4'].map((id) => d.get(id)!.x);
    // 少なくとも 2 つの異なる列がある (1 列に潰れていない)。
    expect(new Set(xs.map((x) => Math.round(x))).size).toBeGreaterThan(1);
    // 横長なので 1 段に収まる。**段数の式が効くので y を実値で固定する** —
    // 段の数を取り違えるとセルの高さが変わり、同じ「1 段」でも y がずれる。
    //   content = {x: 30, y: 18, w: 940, h: 80}、管理職 1 人なので cellH = 80
    //   チーム矩形 = {y: 18 + 80×0.3 = 42, h: 80×0.66 = 52.8}
    //   4 人・1 段 → cellH = 52.8 → y = 42 + 26.4 = 68.4
    for (const id of ['t1', 't2', 't3', 't4']) {
      expect(d.get(id)!.y).toBeCloseTo(68.4, 6);
    }
  });

  it('チームの居ない管理職があってもグリッドは崩れない', () => {
    const d = layoutDistrict(
      [V('m1', 'manager'), V('m2', 'manager'), V('t1', 'team', 'e1', 'm2')],
      rect,
    );
    expect(d.get('m1')).toBeDefined();
    expect(d.get('t1')!.x).toBeCloseTo(d.get('m2')!.x, 6);
  });

  it('チーム以外は managerId を持っていてもチームとして束ねない', () => {
    // 秘書に管理職の id を付けても、秘書の帯 (高さの 12%) に居ること。
    // 種別の判定が外れると、この秘書が管理職の下のクラスタへ流れ込む。
    const d = layoutDistrict(
      [V('m1', 'manager'), V('s1', 'secretary', 'e1', 'm1')],
      rect,
    );
    expect(d.get('s1')!.y).toBeCloseTo(12, 6);
    expect(d.get('s1')!.x).toBeCloseTo(50, 6);
  });

  it('managerId が空文字のチームは実在の管理職の下に入らない', () => {
    // 実装は managerId 未設定を '' に寄せる。'' という id の管理職は居ない。
    const d = layoutDistrict(
      [V('m1', 'manager'), V('t0', 'team', 'e1', ''), V('t1', 'team', 'e1', 'm1')],
      rect,
    );
    expect(d.has('t0')).toBe(false);
    expect(d.has('t1')).toBe(true);
  });
});

describe('computeHomePositions — 並び順の規則', () => {
  const V = (
    id: string,
    kind: string,
    regionId: string,
  ): Villager => ({ id, name: id, kind, emoji: '🙂', regionId }) as Villager;

  const CEO_ONLY = [{ id: 'ceo', kind: 'ceo' }] as unknown as VillageRegion[];

  it('kind の順位が違えば kind で決まる (executive → manager → secretary → team)', () => {
    const home = computeHomePositions(
      [
        V('z-team', 'team', 'ceo'),
        V('a-secretary', 'secretary', 'ceo'),
        V('z-manager', 'manager', 'ceo'),
        V('z-executive', 'executive', 'ceo'),
      ],
      CEO_ONLY,
    );
    const order = [...home.entries()].sort((a, b) => a[1].x - b[1].x).map(([id]) => id);
    // id の昇順なら a-secretary が先頭になるが、kind の順位が優先される。
    expect(order).toEqual(['z-executive', 'z-manager', 'a-secretary', 'z-team']);
  });

  it('kind が同じなら id の昇順', () => {
    const home = computeHomePositions(
      [V('c', 'team', 'ceo'), V('a', 'team', 'ceo'), V('b', 'team', 'ceo')],
      CEO_ONLY,
    );
    expect([...home.entries()].sort((x, y) => x[1].x - y[1].x).map(([id]) => id)).toEqual([
      'a',
      'b',
      'c',
    ]);
  });

  it('未知の kind は既知の kind より後ろ (順位 9 のフォールバック)', () => {
    const home = computeHomePositions(
      [V('a-unknown', 'no-such-kind', 'ceo'), V('z-team', 'team', 'ceo')],
      CEO_ONLY,
    );
    // id では a-unknown が先だが、順位 9 なので後ろへ回る。
    expect([...home.entries()].sort((x, y) => x[1].x - y[1].x).map(([id]) => id)).toEqual([
      'z-team',
      'a-unknown',
    ]);
  });

  it('未知の kind どうしは id の昇順', () => {
    const home = computeHomePositions(
      [V('b', 'no-such-kind', 'ceo'), V('a', 'other-unknown', 'ceo')],
      CEO_ONLY,
    );
    expect([...home.entries()].sort((x, y) => x[1].x - y[1].x).map(([id]) => id)).toEqual(['a', 'b']);
  });
});


/*
 * cos は偶関数なので、`tick*0.6 + index*1.3` の符号は**どちらか一方が 0 の
 * 間は観測できない** — cos(0+1.3) と cos(0−1.3) は同じ値になる。
 * 両方を 0 でない値にして初めて差が出る。
 */
describe('wanderOffset — 位相の合成', () => {
  it('index と tick の両方が効いているとき、符号を取り違えると値が変わる', () => {
    // y = cos(0.6 + 1.3) × 0.5 × 0.8 = cos(1.9) × 0.4
    const got = wanderOffset(1, 1);
    expect(got.y).toBeCloseTo(Math.cos(1.9) * 0.4, 12);
    // 引き算に化けた場合の値 (cos(-0.7) = cos(0.7)) とは違う。
    expect(got.y).not.toBeCloseTo(Math.cos(0.7) * 0.4, 6);
  });

  it('x 側も同様に両方を 0 でなくして固定する', () => {
    // x = sin(0.8 + 1.7) × 0.5 = sin(2.5) × 0.5
    const got = wanderOffset(1, 1);
    expect(got.x).toBeCloseTo(Math.sin(2.5) * 0.5, 12);
    expect(got.x).not.toBeCloseTo(Math.sin(-0.9) * 0.5, 6);
  });
});

describe('computeHomePositions — 村人の居ない region', () => {
  const CEO_EMPTY = [{ id: 'ceo', kind: 'ceo' }] as unknown as VillageRegion[];

  it('村人が 1 人も居ない CEO region は何も置かない', () => {
    // 空の一覧のフォールバックが「空でない配列」に化けると、
    // 中身の無い要素を置こうとして undefined の鍵が生える。
    const home = computeHomePositions([], CEO_EMPTY);
    expect(home.size).toBe(0);
    expect([...home.keys()]).toEqual([]);
  });

  it('村人の居ない役員街区も何も置かない', () => {
    const home = computeHomePositions([], [
      { id: 'e1', kind: 'exec' },
    ] as unknown as VillageRegion[]);
    expect(home.size).toBe(0);
  });
});
