import { describe, expect, it } from 'vitest';
import {
  planSite,
  planFactory,
  NEIGHBORHOOD_COMMERCIAL_WORKSHOP_CAP,
} from '../zoningPlanner';

// 想定ケース: 近隣商業地域 (建ぺい80% / 容積200%)・敷地300㎡・前面道路6m。
const KINSHO = {
  siteArea: 300,
  coverageRatioPct: 80,
  farPct: 200,
  roadWidthM: 6,
  category: 'other' as const,
};

describe('planSite (建築面積・延べ床の上限)', () => {
  it('近隣商業 300㎡・80/200・道路6m: 建築面積240㎡・延べ床600㎡ (道路制限360%は指定200%より緩く効かない)', () => {
    const r = planSite(KINSHO);
    expect(r.effectiveCoveragePct).toBe(80);
    expect(r.maxFootprint).toBe(240);
    expect(r.roadLimitedFarPct).toBe(360); // 6m × 6/10 = 360%
    expect(r.effectiveFarPct).toBe(200);
    expect(r.maxTotalFloor).toBe(600);
    expect(r.floorsToUseAll).toBe(3); // 600 ÷ 240 → 3 階建て相当
  });

  it('前面道路 4m の商業系: 道路制限 240% が指定 300% を下回り実効になる', () => {
    const r = planSite({ ...KINSHO, farPct: 300, roadWidthM: 4 });
    expect(r.roadLimitedFarPct).toBe(240);
    expect(r.effectiveFarPct).toBe(240);
    expect(r.maxTotalFloor).toBe(720);
  });

  it('住居系の乗数は 4/10 (4m → 160%)', () => {
    const r = planSite({ ...KINSHO, category: 'residential', roadWidthM: 4 });
    expect(r.roadLimitedFarPct).toBe(160);
    expect(r.effectiveFarPct).toBe(160);
  });

  it('前面道路 12m 以上は道路による容積率制限なし (null)', () => {
    const r = planSite({ ...KINSHO, roadWidthM: 12 });
    expect(r.roadLimitedFarPct).toBeNull();
    expect(r.effectiveFarPct).toBe(200);
  });

  it('角地 +10% (80→90%)、60% 指定 + 角地 + 耐火 = 80%', () => {
    expect(planSite({ ...KINSHO, cornerLot: true }).effectiveCoveragePct).toBe(90);
    const r = planSite({ ...KINSHO, coverageRatioPct: 60, cornerLot: true, fireproofBonus: true });
    expect(r.effectiveCoveragePct).toBe(80);
  });

  it('指定 80% × 防火地域内の耐火建築物等 → 適用除外 (100%)', () => {
    const r = planSite({ ...KINSHO, fireproofBonus: true });
    expect(r.effectiveCoveragePct).toBe(100);
    expect(r.maxFootprint).toBe(300);
  });

  it('不正入力 (負・NaN) は 0 に丸めてクラッシュしない', () => {
    const r = planSite({ siteArea: -5, coverageRatioPct: NaN, farPct: 200, roadWidthM: 0, category: 'other' });
    expect(r.maxFootprint).toBe(0);
    expect(r.maxTotalFloor).toBe(0);
    expect(r.roadLimitedFarPct).toBeNull();
    expect(r.floorsToUseAll).toBeNull();
  });

  // 符号付きゼロ (-0) はフォームの "-0" 入力 (Number('-0') === -0) から入り込む。
  // String(-0) は "0" だが Intl.NumberFormat('ja-JP').format(-0) は "-0" を返すため、
  // 結果に -0 を残すと「-0 ㎡」と表示されてしまう。0 へ正規化されることを固定する。
  it('-0 入力は +0 に正規化して結果へ持ち込まない (「-0 ㎡」表示の防止)', () => {
    const far0 = planSite({ ...KINSHO, farPct: -0 });
    expect(far0.effectiveFarPct).toBe(0);
    expect(Object.is(far0.effectiveFarPct, 0)).toBe(true);
    expect(new Intl.NumberFormat('ja-JP').format(far0.effectiveFarPct)).toBe('0');

    const site0 = planSite({ ...KINSHO, siteArea: -0 });
    expect(Object.is(site0.maxFootprint, 0)).toBe(true);
    expect(Object.is(site0.maxTotalFloor, 0)).toBe(true);
    expect(site0.floorsToUseAll).toBeNull();
  });
});

describe('planFactory (作業場150㎡制限を踏まえた平面プラン)', () => {
  const site = planSite(KINSHO); // footprint 240 / total 600

  it('既定は法定上限いっぱい: 作業場150㎡ + 1階残り90㎡ + 上階360㎡', () => {
    const p = planFactory({ maxFootprint: site.maxFootprint, maxTotalFloor: site.maxTotalFloor });
    expect(p.workshopArea).toBe(NEIGHBORHOOD_COMMERCIAL_WORKSHOP_CAP);
    expect(p.groundFloorOther).toBe(90);
    expect(p.upperFloorsArea).toBe(360);
    expect(p.totalPlanned).toBe(600);
    expect(p.workshopSharePct).toBe(25);
    expect(p.overCap).toBe(false);
    expect(p.fitsOneFloor).toBe(true);
  });

  it('希望 200㎡ は法定上限 150㎡ にクランプし overCap を立てる', () => {
    const p = planFactory({ maxFootprint: 240, maxTotalFloor: 600, desiredWorkshopSqm: 200 });
    expect(p.workshopArea).toBe(150);
    expect(p.overCap).toBe(true);
  });

  it('希望 100㎡ なら 1 階の残りが増える (240−100=140)', () => {
    const p = planFactory({ maxFootprint: 240, maxTotalFloor: 600, desiredWorkshopSqm: 100 });
    expect(p.workshopArea).toBe(100);
    expect(p.groundFloorOther).toBe(140);
    expect(p.overCap).toBe(false);
  });

  it('建築面積が 150㎡ 未満の小さな敷地では作業場が建築面積にクランプされる', () => {
    const p = planFactory({ maxFootprint: 120, maxTotalFloor: 300 });
    expect(p.workshopArea).toBe(120);
    expect(p.groundFloorOther).toBe(0);
    expect(p.fitsOneFloor).toBe(true);
  });

  it('別の上限値 (準住居 50㎡ など) も workshopCapSqm で指定できる', () => {
    const p = planFactory({ maxFootprint: 240, maxTotalFloor: 600, workshopCapSqm: 50 });
    expect(p.workshopArea).toBe(50);
  });

  it('workshopCapSqm = Infinity は制限なし (建築面積いっぱいまで作業場にできる)', () => {
    const p = planFactory({ maxFootprint: 240, maxTotalFloor: 600, workshopCapSqm: Number.POSITIVE_INFINITY });
    expect(p.workshopArea).toBe(240);
    expect(p.groundFloorOther).toBe(0);
    expect(p.overCap).toBe(false);
  });

  it('ゼロ敷地は全て 0 (ゼロ除算なし)', () => {
    const p = planFactory({ maxFootprint: 0, maxTotalFloor: 0 });
    expect(p.workshopArea).toBe(0);
    expect(p.workshopSharePct).toBeNull();
    expect(p.fitsOneFloor).toBe(false);
  });

  // 狭小前面道路 (52条2項) で実効容積率が建ぺい率を下回ると 延べ床 < 建築面積 になる。
  // 上階は 0 なので totalPlanned は「建築面積」ではなく「延べ床」で頭打ちになる。
  it('延べ床が建築面積を下回る敷地は totalPlanned が延べ床で頭打ち (建築面積ではない)', () => {
    const p = planFactory({ maxFootprint: 240, maxTotalFloor: 180 });
    expect(p.upperFloorsArea).toBe(0);
    expect(p.totalPlanned).toBe(180);
    expect(p.workshopArea).toBe(150);
    expect(p.groundFloorOther).toBe(90);
    expect(p.workshopSharePct).toBe(83.3);
  });

  // 0.1㎡ 丸めの境界: 建築面積 149.96㎡ は表示上 150.0㎡ に丸まるが、作業場 150.0㎡ は
  // 実際には収まらない。丸め後の数値どおり fitsOneFloor = false を返すこと。
  it('建築面積に 0.1㎡ 未満の端数があると丸め後の作業場は 1 フロアに収まらない', () => {
    const p = planFactory({ maxFootprint: 149.96, maxTotalFloor: 600 });
    expect(p.workshopArea).toBe(150);
    expect(p.fitsOneFloor).toBe(false);
    expect(p.groundFloorOther).toBe(0);
  });
});
