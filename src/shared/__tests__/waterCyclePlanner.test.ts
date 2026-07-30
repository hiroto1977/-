import { describe, expect, it } from 'vitest';
import {
  planWaterBalance,
  planRoSizing,
  planNitrification,
  planAeration,
  checkEffluent,
  NITRIFICATION_ALKALINITY_MG_CACO3_PER_MG_N,
  GROUNDWATER_NITRATE_N_STANDARD_MG_L,
  EFFLUENT_TN_UNIFORM_MG_L,
} from '../waterCyclePlanner';

/*
 * 想定ケース: 200L の養液を 14 日ごとに全交換、RO 回収率 75%・除去率 90%。
 * ユーザーの元設計そのもの。「100% 再利用」が成立しないこと・止水で膜が詰まること
 * を数値で顕在化させるのが要点。
 */

describe('planWaterBalance — 水収支と「100%再利用は成立しない」', () => {
  const base = {
    systemVolumeL: 200,
    exchangeCycleDays: 14,
    roRecoveryPct: 75,
    roRejectionPct: 90,
  };

  it('回収率75%: 200L供給→透過150L再利用・濃縮50L排出・新水50L補給', () => {
    const r = planWaterBalance(base);
    expect(r.feedPerBatchL).toBe(200);
    expect(r.permeatePerBatchL).toBe(150);
    expect(r.concentratePerBatchL).toBe(50);
    expect(r.freshMakeupPerBatchL).toBe(50); // 排出した分だけ補給する
    expect(r.recoveryPct).toBe(75); // 100 ではない
  });

  it('濃縮倍率は 1/(1−回収率) = 4倍 (排出が塩類の唯一の出口)', () => {
    expect(planWaterBalance(base).concentrationFactor).toBe(4);
  });

  it('回収率100%は濃縮倍率が定義できない (排出口が無く塩類が無限蓄積)', () => {
    const r = planWaterBalance({ ...base, roRecoveryPct: 100 });
    expect(r.concentrationFactor).toBeNull();
    expect(r.concentratePerBatchL).toBe(0);
  });

  it('透過水は除去率の残り (10%) の EC を持ち越す = 純水の EC 下限', () => {
    expect(planWaterBalance(base).permeateEcCarryoverPct).toBe(10);
  });

  it('年間: 14日周期で 26.07バッチ相当。節水量 = 透過水の年間合計', () => {
    const r = planWaterBalance(base);
    // 365/14 = 26.07 バッチ
    expect(r.annualThroughputL).toBeCloseTo(5214.3, 0);
    expect(r.annualFreshNoRecycleL).toBeCloseTo(5214.3, 0);
    expect(r.annualFreshWithRecycleL).toBeCloseTo(1303.6, 0); // 50L × 26.07
    expect(r.annualWaterSavedL).toBeCloseTo(3910.7, 0); // 150L × 26.07
    // 節水 = 循環なし − 循環あり
    expect(r.annualWaterSavedL).toBeCloseTo(
      r.annualFreshNoRecycleL - r.annualFreshWithRecycleL,
      0,
    );
  });

  it('除去率90%以上なら蓄積リスクなし・90%未満は蓄積リスクあり', () => {
    expect(planWaterBalance(base).accumulationRisk).toBe(false);
    expect(planWaterBalance({ ...base, roRejectionPct: 85 }).accumulationRisk).toBe(true);
  });

  it('不正値 (0・負・NaN) はクラッシュせず 0 系で返す', () => {
    const r = planWaterBalance({
      systemVolumeL: -5,
      exchangeCycleDays: 0,
      roRecoveryPct: NaN,
      roRejectionPct: 999,
    });
    expect(r.feedPerBatchL).toBe(0);
    expect(r.annualThroughputL).toBe(0); // 周期0 → バッチ0
    expect(r.permeateEcCarryoverPct).toBe(0); // 除去率は100で頭打ち
  });
});

describe('planRoSizing — 必要能力と止水バイオファウリング', () => {
  it('200Lを8時間で処理するには 600L/日 の能力が要る', () => {
    const r = planRoSizing({ batchVolumeL: 200, processingWindowHours: 8, exchangeCycleDays: 14 });
    expect(r.requiredCapacityLPerDay).toBe(600); // 200 × 24 / 8
  });

  it('600L/日機で200Lは8時間で処理でき、能力充足', () => {
    const r = planRoSizing({
      batchVolumeL: 200,
      processingWindowHours: 8,
      exchangeCycleDays: 14,
      machineCapacityLPerDay: 600,
    });
    expect(r.actualProcessingHours).toBe(8); // 200/600×24
    expect(r.capacityAdequate).toBe(true);
  });

  it('14日ごと8時間運転は稼働率 2.4% → 止水バイオファウリング警告', () => {
    const r = planRoSizing({
      batchVolumeL: 200,
      processingWindowHours: 8,
      exchangeCycleDays: 14,
      machineCapacityLPerDay: 600,
    });
    // 8h / (14×24=336h) = 2.38%
    expect(r.dutyCyclePct).toBeCloseTo(2.4, 1);
    expect(r.idleDays).toBeGreaterThan(13);
    expect(r.stagnationRisk).toBe(true);
  });

  it('連続循環 (周期1日) にすると稼働率が上がり止水リスクが消える', () => {
    const r = planRoSizing({
      batchVolumeL: 14,
      processingWindowHours: 4,
      exchangeCycleDays: 1,
      machineCapacityLPerDay: 600,
    });
    expect(r.stagnationRisk).toBe(false);
  });

  it('能力未指定なら必要能力だけ返し、稼働率は目標時間から算出', () => {
    const r = planRoSizing({ batchVolumeL: 200, processingWindowHours: 8, exchangeCycleDays: 14 });
    expect(r.actualProcessingHours).toBeNull();
    expect(r.capacityAdequate).toBeNull();
    expect(r.dutyCyclePct).toBeCloseTo(2.4, 1); // 8h 想定で評価
  });
});

describe('planNitrification — アルカリ度消費と再付与', () => {
  it('N 50mg/L × 200L = 10g の窒素、アルカリ度 71.4g を消費', () => {
    const r = planNitrification({ ammoniacalNMgL: 50, volumeL: 200 });
    expect(r.nitrogenLoadG).toBe(10);
    expect(r.alkalinityConsumedGCaCO3).toBeCloseTo(
      10 * NITRIFICATION_ALKALINITY_MG_CACO3_PER_MG_N,
      1,
    );
    expect(r.oxygenDemandG).toBeCloseTo(45.7, 1); // 10 × 4.57
  });

  it('消費アルカリ度を炭酸水素カリウムで戻すと約2倍の質量が要る', () => {
    const r = planNitrification({ ammoniacalNMgL: 50, volumeL: 200 });
    expect(r.khco3ToRedoseG).toBeCloseTo(r.alkalinityConsumedGCaCO3 * 2, 1);
  });

  it('窒素ゼロなら消費もゼロ', () => {
    const r = planNitrification({ ammoniacalNMgL: 0, volumeL: 200 });
    expect(r.nitrogenLoadG).toBe(0);
    expect(r.khco3ToRedoseG).toBe(0);
  });
});

describe('planAeration — 曝気タンクの滞留時間', () => {
  it('300Lタンク・流入200L/日 → HRT 36h で 24h 要求を満たす', () => {
    const r = planAeration({ tankVolumeL: 300, inflowLPerDay: 200 });
    expect(r.hrtHours).toBe(36); // 300/200×24
    expect(r.adequate).toBe(true);
    expect(r.requiredTankVolumeL).toBe(200); // 200×24/24
  });

  it('タンクが小さいと HRT 不足を検出', () => {
    const r = planAeration({ tankVolumeL: 100, inflowLPerDay: 200 });
    expect(r.hrtHours).toBe(12);
    expect(r.adequate).toBe(false);
  });

  it('流入ゼロは HRT を null で返す (ゼロ除算を避ける)', () => {
    const r = planAeration({ tankVolumeL: 300, inflowLPerDay: 0 });
    expect(r.hrtHours).toBeNull();
    expect(r.adequate).toBeNull();
  });
});

describe('checkEffluent — 排水の法規制判定', () => {
  const concentrated = {
    concentrateTnMgL: 400, // 硝酸を濃縮すると数百 mg/L になりうる
    concentrateTpMgL: 40,
    annualDischargeL: 1303, // 上の水収支の年間排出量オーダー
    dischargeToPublicWater: true,
  };

  it('全窒素400mg/Lは一律基準120mg/Lを超える', () => {
    const r = checkEffluent(concentrated);
    expect(r.exceedsTn).toBe(true);
    expect(400).toBeGreaterThan(EFFLUENT_TN_UNIFORM_MG_L);
    expect(r.exceedsTp).toBe(true);
  });

  it('地下水基準 (硝酸性窒素10mg/L) の40倍 → 土壌施用は要注意', () => {
    const r = checkEffluent(concentrated);
    expect(r.nitrateVsGroundwaterFactor).toBe(400 / GROUNDWATER_NITRATE_N_STANDARD_MG_L);
  });

  it('放流かつ超過なら「捨てずに希釈施用」を推奨する', () => {
    expect(checkEffluent(concentrated).recommendReuse).toBe(true);
  });

  it('土壌施用 (放流しない) なら排水基準の超過判定は立たない', () => {
    const r = checkEffluent({ ...concentrated, dischargeToPublicWater: false });
    expect(r.exceedsTn).toBe(false);
    expect(r.wpclNpApplicable).toBe(false);
    // ただし地下水リスク指標は放流可否に関係なく出る (土壌施用でも意味を持つ)
    expect(r.nitrateVsGroundwaterFactor).toBe(40);
  });

  it('小規模排出 (50m³/日未満) は窒素・りん規制の対象外', () => {
    const r = checkEffluent(concentrated); // 年1303L = 0.0036 m³/日
    expect(r.dailyDischargeM3).toBeLessThan(50);
    expect(r.wpclNpApplicable).toBe(false);
  });

  it('大規模放流 (50m³/日以上) は規制対象になりうる', () => {
    const r = checkEffluent({
      ...concentrated,
      annualDischargeL: 20_000_000, // 約54.8 m³/日
    });
    expect(r.dailyDischargeM3).toBeGreaterThan(50);
    expect(r.wpclNpApplicable).toBe(true);
  });

  it('年間窒素排出量を kg で出す', () => {
    const r = checkEffluent(concentrated);
    // 400 mg/L × 1303 L = 521,200 mg = 0.52 kg
    expect(r.annualNitrogenKg).toBeCloseTo(0.5, 1);
  });
});
