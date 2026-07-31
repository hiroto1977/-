import { describe, expect, it } from 'vitest';
import {
  planSite,
  planFactory,
  planRoadSlope,
  planShadowRegulation,
  planSetbackTradeoff,
  roadSlopeFactor,
  ROAD_SLOPE_OTHER,
  ROAD_SLOPE_RESIDENTIAL,
  SHADOW_HEIGHT_THRESHOLD_M,
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

describe('planRoadSlope — 道路斜線 (法56条1項1号・2項)', () => {
  it('限度 = (幅員 + 後退×2) × 勾配。近隣商業 (その他区分) は 1.5', () => {
    const r = planRoadSlope({ roadWidthM: 6, setbackM: 1.5, category: 'other', plannedHeightM: 12.1 });
    expect(r.slopeFactor).toBe(1.5);
    expect(r.limitM).toBe(13.5); // (6 + 3) × 1.5
    expect(r.ok).toBe(true);
    expect(r.marginM).toBe(1.4);
  });

  it('住居系は勾配 1.25 を使う', () => {
    const r = planRoadSlope({ roadWidthM: 6, setbackM: 0, category: 'residential', plannedHeightM: 10 });
    expect(r.slopeFactor).toBe(1.25);
    expect(r.limitM).toBe(7.5); // 6 × 1.25
    expect(r.ok).toBe(false);
    expect(r.marginM).toBe(-2.5);
  });

  it('必要最小後退を逆算する: a = (高さ ÷ 勾配 − 幅員) ÷ 2', () => {
    // 12.1 / 1.5 = 8.0667 → (8.0667 − 6) / 2 = 1.0333 → 切り上げ 1.04
    const a = planRoadSlope({ roadWidthM: 6, setbackM: 0, category: 'other', plannedHeightM: 12.1 });
    expect(a.minSetbackM).toBe(1.04);
    // 10.0 / 1.5 = 6.6667 → (6.6667 − 6) / 2 = 0.3333 → 切り上げ 0.34
    const b = planRoadSlope({ roadWidthM: 6, setbackM: 0, category: 'other', plannedHeightM: 10 });
    expect(b.minSetbackM).toBe(0.34);
  });

  it('後退なしで通る高さなら必要後退は 0 (負にしない)', () => {
    const r = planRoadSlope({ roadWidthM: 6, setbackM: 0, category: 'other', plannedHeightM: 5 });
    expect(r.minSetbackM).toBe(0);
    expect(r.ok).toBe(true);
  });

  it('限度ちょうどは可 (以下が要件)', () => {
    const r = planRoadSlope({ roadWidthM: 6, setbackM: 0, category: 'other', plannedHeightM: 9 });
    expect(r.limitM).toBe(9);
    expect(r.ok).toBe(true);
    expect(r.marginM).toBe(0);
  });

  it('適用距離は入力が揃ったときだけ判定する (推測しない)', () => {
    const none = planRoadSlope({ roadWidthM: 6, setbackM: 0, category: 'other', plannedHeightM: 30 });
    expect(none.applicationDistanceChecked).toBe(false);
    expect(none.beyondApplicationDistance).toBe(false);
    expect(none.ok).toBe(false);

    const inside = planRoadSlope({
      roadWidthM: 6, setbackM: 0, category: 'other', plannedHeightM: 30,
      applicationDistanceM: 20, distanceFromOppositeBoundaryM: 18,
    });
    expect(inside.applicationDistanceChecked).toBe(true);
    expect(inside.beyondApplicationDistance).toBe(false);
    expect(inside.ok).toBe(false);
  });

  it('適用距離の外なら高さに関わらず斜線の適用を受けない', () => {
    const r = planRoadSlope({
      roadWidthM: 6, setbackM: 0, category: 'other', plannedHeightM: 30,
      applicationDistanceM: 20, distanceFromOppositeBoundaryM: 25,
    });
    expect(r.beyondApplicationDistance).toBe(true);
    expect(r.ok).toBe(true);
  });

  it('適用距離ちょうどは「外」ではない (超える が要件)', () => {
    const r = planRoadSlope({
      roadWidthM: 6, setbackM: 0, category: 'other', plannedHeightM: 30,
      applicationDistanceM: 20, distanceFromOppositeBoundaryM: 20,
    });
    expect(r.beyondApplicationDistance).toBe(false);
    expect(r.ok).toBe(false);
  });

  it('負の入力は 0 に丸める', () => {
    const r = planRoadSlope({ roadWidthM: -6, setbackM: -1, category: 'other', plannedHeightM: -3 });
    expect(r.limitM).toBe(0);
    expect(r.minSetbackM).toBe(0);
    expect(r.ok).toBe(true);
  });
});

describe('planShadowRegulation — 日影規制 (法56条の2)', () => {
  it('既定の閾値は 10m。超えれば対象建築物の高さ要件を満たす', () => {
    const r = planShadowRegulation({ plannedHeightM: 12.1 });
    expect(r.thresholdM).toBe(10);
    expect(r.exceedsThreshold).toBe(true);
    expect(r.headroomM).toBe(-2.1);
    expect(r.maxHeightToAvoidM).toBe(10);
  });

  it('ちょうど 10.0m は対象外 (「超える」が要件)', () => {
    const r = planShadowRegulation({ plannedHeightM: 10 });
    expect(r.exceedsThreshold).toBe(false);
    expect(r.headroomM).toBe(0);
  });

  it('対象区域の指定が不明なら regulated は null (対象でないと断定しない)', () => {
    expect(planShadowRegulation({ plannedHeightM: 12.1 }).regulated).toBeNull();
  });

  it('対象区域かつ閾値超なら regulated=true', () => {
    expect(planShadowRegulation({ plannedHeightM: 12.1, designatedArea: true }).regulated).toBe(true);
  });

  it('対象区域でも閾値以下なら regulated=false', () => {
    expect(planShadowRegulation({ plannedHeightM: 10, designatedArea: true }).regulated).toBe(false);
  });

  it('対象区域でなければ閾値超でも regulated=false', () => {
    expect(planShadowRegulation({ plannedHeightM: 12.1, designatedArea: false }).regulated).toBe(false);
  });

  it('低層住専の軒高 7m 基準は thresholdM で渡す', () => {
    const r = planShadowRegulation({ plannedHeightM: 7, thresholdM: 7 });
    expect(r.thresholdM).toBe(7);
    expect(r.exceedsThreshold).toBe(false);
  });

  it('負の閾値は 0 に丸める', () => {
    const r = planShadowRegulation({ plannedHeightM: 1, thresholdM: -5 });
    expect(r.thresholdM).toBe(0);
    expect(r.exceedsThreshold).toBe(true);
  });
});

describe('planSetbackTradeoff — 高さを下げると奥行が伸びる', () => {
  const site = {
    siteDepthM: 20, siteWidthM: 15, rearSetbackM: 0.5, sideSetbackTotalM: 3,
    maxFootprint: 240, roadWidthM: 6, category: 'other' as const,
  };

  it('案 A (12.1m): 後退 1.04 が要り、奥行 18.46・幅 12.0', () => {
    const r = planSetbackTradeoff({ ...site, plannedHeightM: 12.1 });
    expect(r.requiredSetbackM).toBe(1.04);
    expect(r.buildableDepthM).toBe(18.46); // 20 − 1.04 − 0.5
    expect(r.buildableWidthM).toBe(12);
    expect(r.geometricFootprint).toBe(221.5); // 18.46 × 12
    expect(r.footprint).toBe(221.5);
    expect(r.limitedBy).toBe('geometry');
  });

  it('案 B (10.0m): 後退が 0.34 に減り、奥行が 19.16 に伸びる', () => {
    const r = planSetbackTradeoff({ ...site, plannedHeightM: 10 });
    expect(r.requiredSetbackM).toBe(0.34);
    expect(r.buildableDepthM).toBe(19.16); // 20 − 0.34 − 0.5
    expect(r.geometricFootprint).toBe(229.9);
    expect(r.limitedBy).toBe('geometry');
  });

  it('高さを下げた分だけ建築面積が増える (案 A → 案 B で +8.4 ㎡)', () => {
    const a = planSetbackTradeoff({ ...site, plannedHeightM: 12.1 });
    const b = planSetbackTradeoff({ ...site, plannedHeightM: 10 });
    expect(b.footprint - a.footprint).toBeCloseTo(8.4, 1);
    expect(b.requiredSetbackM).toBeLessThan(a.requiredSetbackM);
  });

  it('建蔽率上限に当たるとそちらに縛られる', () => {
    const r = planSetbackTradeoff({ ...site, maxFootprint: 150, plannedHeightM: 10 });
    expect(r.footprint).toBe(150);
    expect(r.limitedBy).toBe('coverage');
  });

  it('幾何と上限が一致する場合は geometry 扱い (超えていない)', () => {
    const r = planSetbackTradeoff({ ...site, maxFootprint: 229.9, plannedHeightM: 10 });
    expect(r.footprint).toBe(229.9);
    expect(r.limitedBy).toBe('geometry');
  });

  it('後退が敷地奥行を食い尽くすと 0 に丸める', () => {
    const r = planSetbackTradeoff({ ...site, siteDepthM: 1, plannedHeightM: 12.1 });
    expect(r.buildableDepthM).toBe(0);
    expect(r.geometricFootprint).toBe(0);
    expect(r.footprint).toBe(0);
  });
});

describe('定数と勾配の引き当て', () => {
  it('勾配定数は住居系 1.25 / その他 1.5', () => {
    expect(ROAD_SLOPE_RESIDENTIAL).toBe(1.25);
    expect(ROAD_SLOPE_OTHER).toBe(1.5);
    expect(roadSlopeFactor('residential')).toBe(ROAD_SLOPE_RESIDENTIAL);
    expect(roadSlopeFactor('other')).toBe(ROAD_SLOPE_OTHER);
  });

  it('日影規制の既定閾値は 10m', () => {
    expect(SHADOW_HEIGHT_THRESHOLD_M).toBe(10);
  });
});

describe('planRoadSlope — 適用距離は「両方揃ったときだけ」判定する', () => {
  const base = { roadWidthM: 6, setbackM: 0, category: 'other' as const, plannedHeightM: 30 };

  it('適用距離だけ渡しても判定しない', () => {
    const r = planRoadSlope({ ...base, applicationDistanceM: 20 });
    expect(r.applicationDistanceChecked).toBe(false);
    expect(r.beyondApplicationDistance).toBe(false);
    expect(r.ok).toBe(false);
  });

  it('建物までの距離だけ渡しても判定しない', () => {
    const r = planRoadSlope({ ...base, distanceFromOppositeBoundaryM: 25 });
    expect(r.applicationDistanceChecked).toBe(false);
    expect(r.beyondApplicationDistance).toBe(false);
    expect(r.ok).toBe(false);
  });
});
