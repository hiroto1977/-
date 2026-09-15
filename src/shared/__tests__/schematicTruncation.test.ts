/**
 * **模式図が 8 層で黙って打ち切り、商業地域では延べ床の過半を落としていた。**
 * (2026-09-09 · パス 104)
 *
 * `buildSchematicFloors` の `while (remaining > 0 && level <= 8)` は 9 層以上の
 * 床を**返り値のどこにも残さず**捨てていた。画面はその 8 層の図を完全なものとして
 * 出していた。
 *
 * この図の目的は関数自身の注記が書いている ——
 * 「作業場がどれだけを占め、**上階に何層積むことになるか**を立体で掴むための概形」。
 * つまり**層を落とすことは図の主題を落とすこと**である。
 *
 * ## 実測 (敷地 500 ㎡ · 建蔽率 80% → 建築面積 400 ㎡ = 間口 20 m × 奥行 20 m)
 *
 * | 容積率 | 延べ床 | 2 階以上 | 必要な階数 | 図の階数 | 図に入らない床 |
 * | ---: | ---: | ---: | ---: | ---: | ---: |
 * | 600% | 3,000 ㎡ | 2,600 ㎡ | 8 | 8 | 0 ㎡ |
 * | 800% | 4,000 ㎡ | 3,600 ㎡ | 10 | 8 | **800 ㎡** |
 * | 1000% | 5,000 ㎡ | 4,600 ㎡ | 13 | 8 | **1,800 ㎡** |
 * | 1300% | 6,500 ㎡ | 6,100 ㎡ | 17 | 8 | **3,300 ㎡** (過半) |
 *
 * **1300% は商業地域の法定上限**で、架空の入力ではない。しかも同じ画面が
 * 「2階以上に回せる面積 6,100 ㎡」を数字で出しているので、図と数字が食い違う。
 *
 * ## 規準はリポジトリに在った
 *
 * `depreciation.ts` の `MAX_SCHEDULE_YEARS` の注記が
 * 「**黙って切り詰めない**のが要点で、途中まで作った表を出すと『100 年で償却し
 * 終わる』という誤った内容になる」と書き、上限超えは `[]` を返す。ここは図なので
 * 空にするのではなく、**打ち切った量を一緒に返して画面に述べさせる** (パス 103 で
 * 逆算に対してやったのと同じ形)。
 */
import { describe, expect, it } from 'vitest';
import {
  MAX_SCHEMATIC_FLOORS,
  buildSchematic,
  buildSchematicFloors,
  type SchematicInput,
} from '../buildingIso';
import { MAX_SCHEDULE_YEARS, straightLineSchedule } from '../depreciation';

/** 敷地 500 ㎡ · 建蔽率 80% → 建築面積 400 ㎡ (間口 20 m × 奥行 20 m)。 */
const WIDTH_M = 20;
const DEPTH_M = 20;
const FOOTPRINT_SQM = WIDTH_M * DEPTH_M;
const SITE_SQM = 500;

const base: SchematicInput = {
  widthM: WIDTH_M,
  depthM: DEPTH_M,
  workshopSqm: 200,
  groundOtherSqm: 200,
  upperFloorsSqm: 0,
};

/** 容積率 (%) から「2 階以上に回せる面積」を出す (zoningPlanner と同じ引き算)。 */
const upperFor = (farPct: number): number => Math.max(0, SITE_SQM * (farPct / 100) - FOOTPRINT_SQM);
const at = (farPct: number) => buildSchematic({ ...base, upperFloorsSqm: upperFor(farPct) });

describe('機構 — 打ち切りは実在し、実在する容積率で起きる', () => {
  it('★ 商業地域の法定上限 (1300%) では過半が図に入らない', () => {
    const s = at(1300);
    expect(upperFor(1300)).toBe(6_100);
    expect(s.floors.length).toBe(MAX_SCHEMATIC_FLOORS);
    expect(s.floorsNeeded).toBe(17);
    expect(s.unplacedSqm).toBe(3_300);
    // 「過半」を主張するので、実際に半分を超えていることを確かめる。
    expect(s.unplacedSqm).toBeGreaterThan(upperFor(1300) / 2);
  });

  it('★ 打ち切りが始まるのは 800% (架空の高さではない)', () => {
    expect(at(600).unplacedSqm).toBe(0);
    expect(at(800).unplacedSqm).toBe(800);
    expect(at(1000).unplacedSqm).toBe(1_800);
  });

  it('★ 上限ちょうどでは打ち切らない (境目の両側)', () => {
    // 8 層 = 1F + 上階 7 層。ちょうど収まる床とその 1 ㎡ 上を見る。
    const exact = FOOTPRINT_SQM * (MAX_SCHEMATIC_FLOORS - 1);
    const fits = buildSchematic({ ...base, upperFloorsSqm: exact });
    expect(fits.floors.length).toBe(MAX_SCHEMATIC_FLOORS);
    expect(fits.unplacedSqm).toBe(0);
    expect(fits.floorsNeeded).toBe(MAX_SCHEMATIC_FLOORS);
    const over = buildSchematic({ ...base, upperFloorsSqm: exact + 1 });
    expect(over.floors.length).toBe(MAX_SCHEMATIC_FLOORS);
    expect(over.unplacedSqm).toBe(1);
    expect(over.floorsNeeded).toBe(MAX_SCHEMATIC_FLOORS + 1);
  });

  it('★ 同じ方針が depreciation に既に在る (借りてきた規準)', () => {
    // 上限超えは途中まで作った表を出さず空を返す。ここが「黙って切り詰めない」の先例。
    expect(straightLineSchedule(1_000_000, MAX_SCHEDULE_YEARS + 1)).toEqual([]);
    // 対照: 上限内なら表が出る (この検査が「常に空」を見ていない)。
    expect(straightLineSchedule(1_000_000, MAX_SCHEDULE_YEARS).length).toBe(MAX_SCHEDULE_YEARS);
  });
});

describe('buildSchematic — 打ち切りを値と一緒に返す', () => {
  it('★ 収まるときは floorsNeeded が図の階数と一致し、unplaced は 0', () => {
    for (const far of [200, 400, 600]) {
      const s = at(far);
      expect(s.unplacedSqm, `${far}%`).toBe(0);
      expect(s.floorsNeeded, `${far}%`).toBe(s.floors.length);
    }
  });

  it('★ 端数階でも数え間違えない (端数は最上階の奥行で表す)', () => {
    // 950 ㎡ / 400 ㎡ = 2.375 → 上階 3 層 (最上階は端数)。1F を足して 4。
    const s = buildSchematic({ ...base, upperFloorsSqm: 950 });
    expect(s.floors.length).toBe(4);
    expect(s.floorsNeeded).toBe(4);
    expect(s.unplacedSqm).toBe(0);
  });

  it('★ 寸法が未入力 (0) なら偽の警告を出さない', () => {
    const s = buildSchematic({ widthM: 0, depthM: 0, workshopSqm: 0, groundOtherSqm: 0, upperFloorsSqm: 0 });
    expect(s.floors).toEqual([]);
    expect(s.unplacedSqm).toBe(0);
    // 建築面積 0 で割らない (∞ や NaN の階数を作らない)。
    expect(Number.isFinite(s.floorsNeeded)).toBe(true);
  });

  it('★ 平屋 (上階 0) も打ち切りではない', () => {
    const s = buildSchematic({ ...base, upperFloorsSqm: 0 });
    expect(s.floors.length).toBe(1);
    expect(s.floorsNeeded).toBe(1);
    expect(s.unplacedSqm).toBe(0);
  });

  it('★ 対照: 階だけを返す従来の関数は今までどおり (呼び出し元を壊していない)', () => {
    for (const far of [200, 800, 1300]) {
      const input = { ...base, upperFloorsSqm: upperFor(far) };
      expect(buildSchematicFloors(input)).toEqual(buildSchematic(input).floors);
    }
  });
});
