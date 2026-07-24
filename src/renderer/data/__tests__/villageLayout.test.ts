import { describe, it, expect } from 'vitest';
import { buildVillagers, buildRegions, type VillageRegistry } from '../villageData';
import {
  regionRects,
  layoutDistrict,
  computeHomePositions,
  computeDistrictFocus,
  wanderOffset,
  FOCUS_RECT,
  WORK_PLAZA,
  type Rect,
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
