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
  EFFLUENT_TP_UNIFORM_MG_L,
  WPCL_NP_APPLICABILITY_M3_PER_DAY,
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

/*
 * 境界と組み合わせ。
 *
 * ここは**法規制の答えを出す**場所である (水質汚濁防止法の一律排水基準)。
 * `>` を `>=` に、`&&` を `||` に取り違えると「基準を超えていません」と
 * 言ってしまう。2026-08-20 の実測で、`checkEffluent` と `planRoSizing` の
 * 判定に生存 42 件が残っていた (このモジュールは `mutate` に載っていなかった)。
 */
describe('checkEffluent — 基準の境界はどちら側か', () => {
  const at = (tn: number, tp: number, toPublic = true) =>
    checkEffluent({
      concentrateTnMgL: tn,
      concentrateTpMgL: tp,
      annualDischargeL: 1_000,
      dischargeToPublicWater: toPublic,
    });

  it('一律基準ちょうどは「超過」にしない (超えて初めて超過)', () => {
    const r = at(EFFLUENT_TN_UNIFORM_MG_L, EFFLUENT_TP_UNIFORM_MG_L);
    expect(r.exceedsTn).toBe(false);
    expect(r.exceedsTp).toBe(false);
    expect(r.recommendReuse).toBe(false);
  });

  it('基準を 1 だけ超えたら超過', () => {
    const r = at(EFFLUENT_TN_UNIFORM_MG_L + 1, EFFLUENT_TP_UNIFORM_MG_L + 1);
    expect(r.exceedsTn).toBe(true);
    expect(r.exceedsTp).toBe(true);
  });

  it('窒素とりんは別々に判定する (片方だけ超過が両方に伝染しない)', () => {
    const tnOnly = at(EFFLUENT_TN_UNIFORM_MG_L + 1, EFFLUENT_TP_UNIFORM_MG_L);
    expect(tnOnly.exceedsTn).toBe(true);
    expect(tnOnly.exceedsTp).toBe(false);

    const tpOnly = at(EFFLUENT_TN_UNIFORM_MG_L, EFFLUENT_TP_UNIFORM_MG_L + 1);
    expect(tpOnly.exceedsTn).toBe(false);
    expect(tpOnly.exceedsTp).toBe(true);
  });

  it('放流しないなら濃度がいくら高くても排水基準の超過は立たない', () => {
    // 土壌施用・再利用は公共用水域への放流ではないので、一律排水基準の
    // 適用対象ではない。ここを `||` に取り違えると、放流していない事業者に
    // 「基準超過」と告げることになる。
    const r = at(10_000, 10_000, false);
    expect(r.exceedsTn).toBe(false);
    expect(r.exceedsTp).toBe(false);
    expect(r.wpclNpApplicable).toBe(false);
  });

  it('再利用の推奨は放流の有無に関わらず濃度だけで決まる', () => {
    // 「捨てずに希釈施用へ回す」は放流していなくても成り立つ助言。
    expect(at(EFFLUENT_TN_UNIFORM_MG_L + 1, 0, false).recommendReuse).toBe(true);
    expect(at(0, EFFLUENT_TP_UNIFORM_MG_L + 1, false).recommendReuse).toBe(true);
  });

  it('推奨はどちらか一方の超過で立つ (両方要求しない)', () => {
    expect(at(EFFLUENT_TN_UNIFORM_MG_L + 1, 0).recommendReuse).toBe(true);
    expect(at(0, EFFLUENT_TP_UNIFORM_MG_L + 1).recommendReuse).toBe(true);
    expect(at(EFFLUENT_TN_UNIFORM_MG_L + 1, EFFLUENT_TP_UNIFORM_MG_L + 1).recommendReuse).toBe(true);
    expect(at(0, 0).recommendReuse).toBe(false);
  });

  it('窒素りん規制の適用は 1 日 50m³ ちょうどから', () => {
    // 50 m³/日 = 年間 50 × 1000 × 365 L。境界は「以上」。
    const litersFor = (m3PerDay: number) => m3PerDay * 1000 * 365;
    const justUnder = checkEffluent({
      concentrateTnMgL: 0,
      concentrateTpMgL: 0,
      annualDischargeL: litersFor(WPCL_NP_APPLICABILITY_M3_PER_DAY) - 365_000,
      dischargeToPublicWater: true,
    });
    const exactly = checkEffluent({
      concentrateTnMgL: 0,
      concentrateTpMgL: 0,
      annualDischargeL: litersFor(WPCL_NP_APPLICABILITY_M3_PER_DAY),
      dischargeToPublicWater: true,
    });
    expect(justUnder.wpclNpApplicable).toBe(false);
    expect(exactly.wpclNpApplicable).toBe(true);
  });

  it('窒素が 0 なら地下水基準との倍率は 0 (0 除算にも NaN にもしない)', () => {
    expect(at(0, 0).nitrateVsGroundwaterFactor).toBe(0);
    expect(at(GROUNDWATER_NITRATE_N_STANDARD_MG_L, 0).nitrateVsGroundwaterFactor).toBe(1);
  });

  it('年間の窒素・りん量は濃度と排出量の積 (取り違えていない)', () => {
    const r = checkEffluent({
      concentrateTnMgL: 200,
      concentrateTpMgL: 20,
      annualDischargeL: 1_000_000,
      dischargeToPublicWater: true,
    });
    // 200 mg/L × 1,000,000 L = 200,000,000 mg = 200 kg
    expect(r.annualNitrogenKg).toBe(200);
    expect(r.annualPhosphorusKg).toBe(20);
    expect(r.annualNitrogenKg).not.toBe(r.annualPhosphorusKg);
  });
});

describe('planRoSizing — 境界と欠測', () => {
  const base = { batchVolumeL: 200, processingWindowHours: 8, exchangeCycleDays: 14 };

  it('処理時間が 0 なら必要能力は出せない (0 除算にしない)', () => {
    const r = planRoSizing({ ...base, processingWindowHours: 0 });
    expect(r.requiredCapacityLPerDay).toBe(0);
  });

  it('能力未指定なら実処理時間も充足判定も出さない', () => {
    const r = planRoSizing(base);
    expect(r.actualProcessingHours).toBeNull();
    expect(r.capacityAdequate).toBeNull();
  });

  it('能力 0 は「未指定」と同じ扱い (0 L/日 の機械では処理できない)', () => {
    const r = planRoSizing({ ...base, machineCapacityLPerDay: 0 });
    expect(r.actualProcessingHours).toBeNull();
    expect(r.capacityAdequate).toBeNull();
  });

  it('目標時間ちょうどで終われば充足 (超えて初めて不足)', () => {
    // 200L を 8h で処理するには 600L/日。ちょうどなら 8.0h。
    const exact = planRoSizing({ ...base, machineCapacityLPerDay: 600 });
    expect(exact.actualProcessingHours).toBe(8);
    expect(exact.capacityAdequate).toBe(true);

    const slower = planRoSizing({ ...base, machineCapacityLPerDay: 500 });
    expect(slower.actualProcessingHours!).toBeGreaterThan(8);
    expect(slower.capacityAdequate).toBe(false);
  });

  it('能力があっても目標時間が 0 なら充足は判定できない', () => {
    const r = planRoSizing({ ...base, processingWindowHours: 0, machineCapacityLPerDay: 600 });
    expect(r.actualProcessingHours).toBe(8);
    expect(r.capacityAdequate).toBeNull();
  });

  it('交換周期が 0 なら稼働率も止水日数も出せない', () => {
    const r = planRoSizing({ ...base, exchangeCycleDays: 0, machineCapacityLPerDay: 600 });
    expect(r.dutyCyclePct).toBeNull();
    expect(r.idleDays).toBeNull();
    expect(r.stagnationRisk).toBe(false);
  });

  it('止水警告は「稼働率が低い」と「連続 2 日以上止まる」の両方が要る', () => {
    // 稼働率は低いが止水が 2 日に満たない → 警告しない。
    // 200L を 600L/日 で 8h、周期 1 日 → 止水 0.67 日。
    const daily = planRoSizing({
      batchVolumeL: 200,
      processingWindowHours: 8,
      exchangeCycleDays: 1,
      machineCapacityLPerDay: 600,
    });
    expect(daily.idleDays!).toBeLessThan(2);
    expect(daily.stagnationRisk).toBe(false);

    // 周期 14 日 → 稼働率 2.4%・止水 13.7 日 → 警告する。
    const batch = planRoSizing({ ...base, machineCapacityLPerDay: 600 });
    expect(batch.dutyCyclePct!).toBeLessThan(10);
    expect(batch.idleDays!).toBeGreaterThanOrEqual(2);
    expect(batch.stagnationRisk).toBe(true);
  });

  it('稼働率が 10% 以上なら止水日数が長くても警告しない', () => {
    // 200L を 60L/日 で処理 = 80h 運転。周期 14 日 → 稼働率 23.8%。
    const r = planRoSizing({ ...base, machineCapacityLPerDay: 60 });
    expect(r.dutyCyclePct!).toBeGreaterThanOrEqual(10);
    expect(r.idleDays!).toBeGreaterThanOrEqual(2);
    expect(r.stagnationRisk).toBe(false);
  });
});

describe('waterCyclePlanner — 残りの境界', () => {
  it('年間量は 1 バッチ量 × 年間バッチ数 (割っていない)', () => {
    // 周期 73 日 = 年 5 バッチ。掛けると 5 倍、割ると 1/5 で符号ではなく桁が変わる。
    const r = planWaterBalance({
      systemVolumeL: 200,
      exchangeCycleDays: 73,
      roRecoveryPct: 75,
      roRejectionPct: 90,
    });
    expect(r.concentratePerBatchL).toBe(50);
    expect(r.annualDischargeL).toBe(250); // 50 × 5
    expect(r.annualThroughputL).toBe(1_000); // 200 × 5
    expect(r.annualWaterSavedL).toBe(750); // 150 × 5
  });

  it('止水日数は「周期 − 運転日数」(足していない)', () => {
    const r = planRoSizing({
      batchVolumeL: 200,
      processingWindowHours: 8,
      exchangeCycleDays: 14,
      machineCapacityLPerDay: 600,
    });
    expect(r.actualProcessingHours).toBe(8);
    expect(r.idleDays).toBe(13.7); // 14 − 8/24 = 13.667
  });

  it('稼働率ちょうど 10% は警告しない (下回って初めて警告)', () => {
    // 600L を 600L/日 で処理 = 24h。周期 10 日 = 240h → 稼働率ちょうど 10%。
    const r = planRoSizing({
      batchVolumeL: 600,
      processingWindowHours: 24,
      exchangeCycleDays: 10,
      machineCapacityLPerDay: 600,
    });
    expect(r.dutyCyclePct).toBe(10);
    expect(r.idleDays).toBe(9);
    expect(r.stagnationRisk).toBe(false);
  });

  it('止水ちょうど 2 日は警告する (2 日以上が条件)', () => {
    // 能力未指定・目標時間 0 → 運転 0h。周期 2 日 → 止水ちょうど 2 日・稼働率 0%。
    const r = planRoSizing({
      batchVolumeL: 100,
      processingWindowHours: 0,
      exchangeCycleDays: 2,
    });
    expect(r.dutyCyclePct).toBe(0);
    expect(r.idleDays).toBe(2);
    expect(r.stagnationRisk).toBe(true);
  });

  it('HRT の要求時間は指定があればそれを使う (既定 24h に固定しない)', () => {
    const base = { tankVolumeL: 300, inflowLPerDay: 200 };
    const dflt = planAeration(base);
    expect(dflt.hrtHours).toBe(36);
    expect(dflt.adequate).toBe(true);
    expect(dflt.requiredTankVolumeL).toBe(200); // 200 × 24 / 24

    const strict = planAeration({ ...base, minRequiredHrtHours: 48 });
    expect(strict.hrtHours).toBe(36);
    expect(strict.adequate).toBe(false);
    expect(strict.requiredTankVolumeL).toBe(400); // 200 × 48 / 24
  });

  it('HRT が要求ちょうどなら充足 (下回って初めて不足)', () => {
    const r = planAeration({ tankVolumeL: 200, inflowLPerDay: 200, minRequiredHrtHours: 24 });
    expect(r.hrtHours).toBe(24);
    expect(r.adequate).toBe(true);
  });
});
