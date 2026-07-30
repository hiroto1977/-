/**
 * 水循環プランナー — 有機水耕のクローズド水循環プラント
 * (生物処理タンク → 前処理 → RO) の **水収支と必要機材規模** を概算する純関数群。
 *
 * 設計思想の検証で判明した「そのまま作ると破綻する点」を数値で潰すためのツール:
 *
 *   1. 物質収支上「100% 再利用」は成立しない。RO 回収率 r なら回収は r・排出は
 *      (1−r) で、この **ブリード (濃縮廃液の排出) こそが塩類の唯一の出口**。
 *      排出をゼロにすると閉ループでは塩類が無限に蓄積する。
 *   2. 濃縮廃液は 1/(1−r) 倍に濃縮される → 処分・再利用の判断材料。
 *   3. RO 膜はバッチ運転だと大半の時間が止水状態になり、バイオファウリングの
 *      温床になる (この設計が防ごうとしている故障モードを運用で作ってしまう)。
 *   4. 硝化はアルカリ度を消費し (N 1mg あたり CaCO3 換算 7.14mg)、給水は
 *      緩衝能ゼロの RO 水なので pH 制御が発振する → アルカリ度の再付与が要る。
 *   5. 濃縮廃液の窒素・りんは水質汚濁防止法/環境基準の閾値を超えうる。
 *
 * **概算であり設計・法務・水処理の専門助言ではありません。** 実際の可否は水質・
 * 膜仕様・自治体の排水規制・条例を含めて専門家と設備メーカーの設計で決まります。
 */

/* ─────────────────────────────  定数  ───────────────────────────── */

/** 硝化 1 段で消費するアルカリ度 (N 1mg あたり CaCO3 換算 mg)。硝化の化学量論。 */
export const NITRIFICATION_ALKALINITY_MG_CACO3_PER_MG_N = 7.14;
/** 硝化の酸素要求量 (N 1mg あたり O2 mg)。 */
export const NITRIFICATION_O2_MG_PER_MG_N = 4.57;
/** 消費アルカリ度 (CaCO3 換算) を炭酸水素カリウムで戻すときの質量比 (KHCO3 g / CaCO3 g)。
 *  KHCO3 分子量 100.12 ÷ 当量 50.04 ≒ 2.0。 */
export const KHCO3_G_PER_G_CACO3_ALKALINITY = 2.0;

/** 地下水の環境基準: 硝酸性窒素及び亜硝酸性窒素 (mg/L)。土壌施用時の目安。 */
export const GROUNDWATER_NITRATE_N_STANDARD_MG_L = 10;
/** 水質汚濁防止法 一律排水基準の目安 (公共用水域への排出時)。要・自治体確認。 */
export const EFFLUENT_TN_UNIFORM_MG_L = 120; // 窒素含有量 (日間平均は 60)
export const EFFLUENT_TN_DAILY_AVG_MG_L = 60;
export const EFFLUENT_TP_UNIFORM_MG_L = 16; // りん含有量 (日間平均は 8)
export const EFFLUENT_TP_DAILY_AVG_MG_L = 8;
/** 窒素・りん規制の対象になる排出水量の目安 (m³/日)。これ未満は対象外のことが多い。 */
export const WPCL_NP_APPLICABILITY_M3_PER_DAY = 50;

/** 非有限・負を 0 に丸める。 */
function nonNegative(n: number): number {
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/** 0.1 単位に丸める。 */
function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

/* ───────────────────────────  1. 水収支  ─────────────────────────── */

export interface WaterBalanceInput {
  /** ラック内を循環する養液量 (L)。 */
  readonly systemVolumeL: number;
  /** 水交換の周期 (日)。連続循環なら 1 日あたり入替量に相当する値を入れる。 */
  readonly exchangeCycleDays: number;
  /** RO 回収率 = 透過水/供給水 (%)。既定 75。 */
  readonly roRecoveryPct: number;
  /** RO 塩除去率 (%)。既定 90。透過水は供給 EC の (1−除去率) を持ち越す。 */
  readonly roRejectionPct: number;
}

export interface WaterBalanceResult {
  /** 1 バッチの RO 供給量 (L) = 循環量。 */
  readonly feedPerBatchL: number;
  /** 1 バッチで回収・再利用する透過水 (L) = 供給 × 回収率。 */
  readonly permeatePerBatchL: number;
  /** 1 バッチで排出する濃縮廃液 (L) = 供給 × (1−回収率)。 */
  readonly concentratePerBatchL: number;
  /** 1 バッチで補給する新水 (L) = 濃縮廃液と同量 (回収できなかった分)。 */
  readonly freshMakeupPerBatchL: number;
  /** 実際の水回収率 (%) = 回収率そのもの。100 にはならないことの明示。 */
  readonly recoveryPct: number;
  /** 濃縮廃液の濃縮倍率 = 1/(1−回収率)。回収率 100% は無限大 (排出口が無い)。 */
  readonly concentrationFactor: number | null;
  /** 透過水が持ち越す EC 比率 (= 1−除去率)。これが「純水」の EC の下限になる。 */
  readonly permeateEcCarryoverPct: number;
  /** 年間 RO 処理量 (L)。 */
  readonly annualThroughputL: number;
  /** 年間排出量 (L) = 年間の濃縮廃液。 */
  readonly annualDischargeL: number;
  /** 年間新水消費 (L・循環あり)。 */
  readonly annualFreshWithRecycleL: number;
  /** 年間新水消費 (L・循環なし = 毎回全量新水)。 */
  readonly annualFreshNoRecycleL: number;
  /** 年間節水量 (L) = 循環なし − 循環あり。 */
  readonly annualWaterSavedL: number;
  /** 塩類蓄積の懸念フラグ: 除去率が低いと透過水の持ち越しで EC が下がりきらない。 */
  readonly accumulationRisk: boolean;
}

/**
 * 循環量・交換周期・RO 性能から水収支を概算する。
 * 「100% 再利用」がなぜ成立しないか (排出 = 塩類の唯一の出口) を数値で示す。
 */
export function planWaterBalance(input: WaterBalanceInput): WaterBalanceResult {
  const feed = nonNegative(input.systemVolumeL);
  const cycleDays = nonNegative(input.exchangeCycleDays);
  const r = Math.min(100, nonNegative(input.roRecoveryPct)) / 100;
  const rej = Math.min(100, nonNegative(input.roRejectionPct)) / 100;

  const permeate = feed * r;
  const concentrate = feed * (1 - r);
  const batchesPerYear = cycleDays > 0 ? 365 / cycleDays : 0;

  return {
    feedPerBatchL: round1(feed),
    permeatePerBatchL: round1(permeate),
    concentratePerBatchL: round1(concentrate),
    freshMakeupPerBatchL: round1(concentrate),
    recoveryPct: round1(r * 100),
    // r=1 なら排出ゼロ = 濃縮しきれない = 物理的に成立しない → null で表す。
    concentrationFactor: r < 1 ? round1(1 / (1 - r)) : null,
    permeateEcCarryoverPct: round1((1 - rej) * 100),
    annualThroughputL: round1(feed * batchesPerYear),
    annualDischargeL: round1(concentrate * batchesPerYear),
    annualFreshWithRecycleL: round1(concentrate * batchesPerYear),
    annualFreshNoRecycleL: round1(feed * batchesPerYear),
    annualWaterSavedL: round1(permeate * batchesPerYear),
    // 除去率 90% 未満だと透過水に 10% 超の塩が残り、閉ループで積み上がりやすい。
    accumulationRisk: rej < 0.9,
  };
}

/* ─────────────────────────  2. RO 稼働率  ───────────────────────── */

export interface RoSizingInput {
  /** 1 バッチで RO 処理する量 (L)。 */
  readonly batchVolumeL: number;
  /** 1 バッチを処理しきる目標時間 (h)。 */
  readonly processingWindowHours: number;
  /** 水交換の周期 (日)。この間に膜が止水する時間を評価する。 */
  readonly exchangeCycleDays: number;
  /** 導入予定の RO 機の日産能力 (L/日)。省略時は必要能力のみ返す。 */
  readonly machineCapacityLPerDay?: number;
}

export interface RoSizingResult {
  /** バッチを目標時間で処理するのに必要な能力 (L/日)。 */
  readonly requiredCapacityLPerDay: number;
  /** 導入機での実処理時間 (h)。能力未指定なら null。 */
  readonly actualProcessingHours: number | null;
  /** 導入機の能力は足りているか (要求時間内に処理できるか)。能力未指定なら null。 */
  readonly capacityAdequate: boolean | null;
  /** 交換周期に占める運転時間の割合 (%)。低いほど止水時間が長い。 */
  readonly dutyCyclePct: number | null;
  /** 膜が連続で止水する日数の目安 = 周期 − 運転。 */
  readonly idleDays: number | null;
  /** バイオファウリング懸念: 稼働率が低く、かつ止水日数が長い。 */
  readonly stagnationRisk: boolean;
}

/**
 * RO の必要能力と、バッチ運転時の「止水によるバイオファウリング」リスクを評価する。
 * 200L を 14 日ごとに一括処理するような運用は稼働率が数 % になり、膜が大半の時間
 * 止水して詰まる — その故障モードをここで顕在化させる。
 */
export function planRoSizing(input: RoSizingInput): RoSizingResult {
  const batch = nonNegative(input.batchVolumeL);
  const windowH = nonNegative(input.processingWindowHours);
  const cycleDays = nonNegative(input.exchangeCycleDays);
  const cap = input.machineCapacityLPerDay;

  const requiredCapacity = windowH > 0 ? (batch * 24) / windowH : 0;

  let actualHours: number | null = null;
  let adequate: boolean | null = null;
  if (cap !== undefined && nonNegative(cap) > 0) {
    actualHours = round1((batch / cap) * 24);
    adequate = windowH > 0 ? actualHours <= windowH : null;
  }

  const runHours = actualHours ?? windowH;
  const cycleHours = cycleDays * 24;
  const dutyCyclePct = cycleHours > 0 ? round1((runHours / cycleHours) * 100) : null;
  const idleDays = cycleHours > 0 ? round1(Math.max(0, cycleDays - runHours / 24)) : null;

  // バイオフィルムを育てるのは「連続で止水する日数」。日々入れ替える連続循環
  // (周期が短い) は毎日フラッシュされるので安全側。14 日バッチのように 2 日以上
  // 連続で止水し、かつ稼働率が極端に低い場合だけ警告する。
  const stagnationRisk = dutyCyclePct !== null && dutyCyclePct < 10 && (idleDays ?? 0) >= 2;

  return {
    requiredCapacityLPerDay: round1(requiredCapacity),
    actualProcessingHours: actualHours,
    capacityAdequate: adequate,
    dutyCyclePct,
    idleDays,
    stagnationRisk,
  };
}

/* ───────────────────────  3. 硝化とアルカリ度  ─────────────────── */

export interface NitrificationInput {
  /** 硝化対象の窒素濃度 (mg/L・アンモニア態＋有機態を N 換算)。 */
  readonly ammoniacalNMgL: number;
  /** 処理量 (L・= バッチ)。 */
  readonly volumeL: number;
}

export interface NitrificationResult {
  /** 硝化する窒素の総量 (g)。 */
  readonly nitrogenLoadG: number;
  /** 硝化で消費されるアルカリ度 (g・CaCO3 換算)。 */
  readonly alkalinityConsumedGCaCO3: number;
  /** 硝化の酸素要求量 (g)。曝気能力の目安。 */
  readonly oxygenDemandG: number;
  /** 給水タンクで戻すべき炭酸水素カリウム量 (g)。RO 水は緩衝能ゼロのため。 */
  readonly khco3ToRedoseG: number;
}

/**
 * 硝化によるアルカリ度消費と酸素要求量を概算する。給水は緩衝能ゼロの RO 水なので、
 * 消費したアルカリ度を炭酸水素カリウム等で戻さないと pH 制御が発振する。
 */
export function planNitrification(input: NitrificationInput): NitrificationResult {
  const nMgL = nonNegative(input.ammoniacalNMgL);
  const volumeL = nonNegative(input.volumeL);
  const nLoadG = (nMgL * volumeL) / 1000; // mg/L × L = mg → /1000 = g

  const alkalinityG = nLoadG * NITRIFICATION_ALKALINITY_MG_CACO3_PER_MG_N;

  return {
    nitrogenLoadG: round1(nLoadG),
    alkalinityConsumedGCaCO3: round1(alkalinityG),
    oxygenDemandG: round1(nLoadG * NITRIFICATION_O2_MG_PER_MG_N),
    khco3ToRedoseG: round1(alkalinityG * KHCO3_G_PER_G_CACO3_ALKALINITY),
  };
}

/* ─────────────────────  4. 曝気タンクの滞留時間  ─────────────────── */

export interface AerationInput {
  /** 曝気・生物浄化タンクの容量 (L)。 */
  readonly tankVolumeL: number;
  /** タンクへ流入する 1 日あたりの水量 (L/日)。 */
  readonly inflowLPerDay: number;
  /** 有機物の無機化に必要な最低滞留時間 (h)。既定 24 (保守側)。 */
  readonly minRequiredHrtHours?: number;
}

export interface AerationResult {
  /** 水理学的滞留時間 HRT (h) = タンク容量 ÷ 1 日流入 × 24。 */
  readonly hrtHours: number | null;
  /** 必要滞留時間を満たすか。 */
  readonly adequate: boolean | null;
  /** 必要 HRT を満たすためのタンク容量 (L)。 */
  readonly requiredTankVolumeL: number;
}

/**
 * 曝気タンクの滞留時間を評価する。ここが全体の生死を決める — 溶存有機物 (低分子)
 * は UF/RO では止まらず、実際の防波堤は硝化・有機物無機化だからである。
 */
export function planAeration(input: AerationInput): AerationResult {
  const tankL = nonNegative(input.tankVolumeL);
  const inflowPerDay = nonNegative(input.inflowLPerDay);
  const minHrt = input.minRequiredHrtHours === undefined ? 24 : nonNegative(input.minRequiredHrtHours);

  const hrtHours = inflowPerDay > 0 ? (tankL / inflowPerDay) * 24 : null;

  return {
    hrtHours: hrtHours === null ? null : round1(hrtHours),
    adequate: hrtHours === null ? null : hrtHours >= minHrt,
    requiredTankVolumeL: round1((inflowPerDay * minHrt) / 24),
  };
}

/* ───────────────────────  5. 排水の法規制判定  ─────────────────── */

export interface EffluentInput {
  /** 濃縮廃液の全窒素濃度 (mg/L)。 */
  readonly concentrateTnMgL: number;
  /** 濃縮廃液の全りん濃度 (mg/L)。 */
  readonly concentrateTpMgL: number;
  /** 年間排出量 (L)。 */
  readonly annualDischargeL: number;
  /** 公共用水域へ放流するか (放流しない=土壌施用や再利用なら false)。 */
  readonly dischargeToPublicWater: boolean;
}

export interface EffluentResult {
  /** 1 日あたり排出量 (m³/日・年間 ÷ 365)。 */
  readonly dailyDischargeM3: number;
  /** 年間の窒素排出量 (kg)。 */
  readonly annualNitrogenKg: number;
  /** 年間のりん排出量 (kg)。 */
  readonly annualPhosphorusKg: number;
  /** 水質汚濁防止法の窒素・りん規制の対象になりうるか (放流かつ 50m³/日以上)。 */
  readonly wpclNpApplicable: boolean;
  /** 全窒素が一律排水基準を超えるか (放流時のみ意味を持つ)。 */
  readonly exceedsTn: boolean;
  /** 全りんが一律排水基準を超えるか。 */
  readonly exceedsTp: boolean;
  /** 地下水環境基準 (硝酸性窒素 10mg/L) の何倍か。土壌施用時のリスク指標。 */
  readonly nitrateVsGroundwaterFactor: number;
  /** 濃縮廃液を「捨てずに土耕・露地へ希釈施用」する運用を推奨するか。 */
  readonly recommendReuse: boolean;
}

/**
 * 濃縮廃液の排出が法規制の閾値を超えるかを概算判定する。閾値は目安であり、
 * 実際の適用は自治体の上乗せ条例・地域指定で変わるため要確認。
 */
export function checkEffluent(input: EffluentInput): EffluentResult {
  const tn = nonNegative(input.concentrateTnMgL);
  const tp = nonNegative(input.concentrateTpMgL);
  const annualL = nonNegative(input.annualDischargeL);
  const toPublic = input.dischargeToPublicWater === true;

  const dailyM3 = annualL / 365 / 1000;
  const annualNKg = (tn * annualL) / 1_000_000; // mg/L × L = mg → /1e6 = kg
  const annualPKg = (tp * annualL) / 1_000_000;

  return {
    dailyDischargeM3: round1(dailyM3),
    annualNitrogenKg: round1(annualNKg),
    annualPhosphorusKg: round1(annualPKg),
    wpclNpApplicable: toPublic && dailyM3 >= WPCL_NP_APPLICABILITY_M3_PER_DAY,
    exceedsTn: toPublic && tn > EFFLUENT_TN_UNIFORM_MG_L,
    exceedsTp: toPublic && tp > EFFLUENT_TP_UNIFORM_MG_L,
    nitrateVsGroundwaterFactor:
      tn > 0 ? round1(tn / GROUNDWATER_NITRATE_N_STANDARD_MG_L) : 0,
    // 放流すると基準超過が濃厚 → 捨てずに希釈施用へ回すのが技術的にも法的にも安全。
    recommendReuse: tn > EFFLUENT_TN_UNIFORM_MG_L || tp > EFFLUENT_TP_UNIFORM_MG_L,
  };
}
