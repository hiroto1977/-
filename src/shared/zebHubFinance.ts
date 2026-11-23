/**
 * 防災オフグリッド ZEB 拠点の収支シミュレーター (2026-11-23)。
 *
 * ペロブスカイト太陽電池 + 大型蓄電池 + 水循環プラントを持つ 1 拠点について、
 * 年ごとのお金の流れ・正味現在価値 (NPV)・内部収益率 (IRR)・投資回収年数を出し、
 * 蓄電池の容量の候補から最も得な物を選ぶ純関数群。
 *
 * ## 電力の配り方 (カスケード)
 *   1. 敷地内で使う (買う電気を減らす —— 1 kWh あたり `gridPurchasePrice` の得)
 *   2. 余りは同じ送配電エリアの自社拠点へ自己託送 (`wheelingValue`)。
 *      **エリアを跨ぐ自己託送は制度上できない**ので、`selfWheelingSameArea` が偽なら
 *      この段は 0 で、余りはすべて 3 へ回す (制度を緩める計算はしない)。
 *   3. 市場へ売る (`marketSalePrice`) と、蓄電池の空いた容量で値差取引をする。
 * 蓄電池のうち `reserveShare` は**災害用に常に満たしておく分**で、値差取引にも
 * 夜の自家消費にも使わない (平時の儲けのために防災の持ち時間を削らない)。
 *
 * ## 補助金
 * 補助率・上限・対象は**利用者が公募要領で確かめて入れる値**で、ここは法令の事実を持たない。
 * 「同じ費用に 2 つの補助金を重ねない」を規則として守り、守れる組み合わせの中から
 * 補助額が最大になる物を総当たりで選ぶ (`chooseSubsidies`)。同じ `exclusiveGroup` の
 * 補助金も同時には選ばない。
 *
 * **概算であり、設計・法務・税務・投資の助言ではありません。** 系統連系・保安・消防・
 * 水道法・下水道法の要件は、所管と専門家の確認で決まります。
 */

/** 補助の対象になりうる費用の区分。 */
export type CostComponent = 'building' | 'pv' | 'battery' | 'water';

export const COST_COMPONENTS: readonly CostComponent[] = ['building', 'pv', 'battery', 'water'];

export const COST_COMPONENT_LABEL: Readonly<Record<CostComponent, string>> = {
  building: '建築本体',
  pv: 'ペロブスカイト発電',
  battery: '大型蓄電池',
  water: '水循環・生産プラント',
};

export interface SubsidyOption {
  readonly id: string;
  readonly name: string;
  /** この補助金が対象にする費用の区分。 */
  readonly targets: readonly CostComponent[];
  /** 補助率 (0〜1)。 */
  readonly rate: number;
  /** 上限 (円)。上限が無いなら null。 */
  readonly cap: number | null;
  /** 同じ値の補助金どうしは同時に選べない (制度どうしの併用不可)。 */
  readonly exclusiveGroup?: string;
}

export interface ZebHubInput {
  /* ── 初期費用 (補助前・円) ── */
  readonly buildingCost: number;
  readonly pvCost: number;
  readonly waterPlantCost: number;
  /** 蓄電池の固定費 (容量に依らない分・円)。 */
  readonly batteryFixedCost: number;
  /** 蓄電池の容量あたりの費用 (円/kWh)。 */
  readonly batteryCostPerKwh: number;
  readonly batteryKwh: number;

  /* ── 発電と需要 ── */
  readonly pvKw: number;
  /** 1 kW あたりの 1 日の平均発電量 (kWh/kW/日)。エリアと設置面で変わる。 */
  readonly specificYieldKwhPerKwDay: number;
  /** 発電量の年あたりの低下率 (0〜1)。 */
  readonly pvDegradationPerYear: number;
  /** 拠点の 1 日の消費 (kWh/日)。 */
  readonly baseLoadKwhPerDay: number;
  /** 消費のうち日中 (発電中) に使う割合 (0〜1)。 */
  readonly daytimeLoadShare: number;
  /** 災害時に止めない負荷 (水循環ポンプ・殺菌灯など・kWh/日)。 */
  readonly criticalLoadKwhPerDay: number;
  /** 蓄電池の往復効率 (0〜1)。 */
  readonly roundTripEfficiency: number;
  /** 蓄電池のうち使ってよい深さ (0〜1)。 */
  readonly usableDepth: number;
  /** 使える容量のうち、災害用に常に満たしておく割合 (0〜1)。 */
  readonly reserveShare: number;

  /* ── 価格 (円/kWh ほか) ── */
  /** 系統から買う電気の単価 (託送料金・再エネ賦課金を含む)。 */
  readonly gridPurchasePrice: number;
  /** 同じエリアの自社拠点へ自己託送したときの 1 kWh の価値 (買う単価 − 託送料金など)。 */
  readonly wheelingValue: number;
  /** 同じ送配電エリアに送り先の自社拠点があるか。偽なら自己託送はしない。 */
  readonly selfWheelingSameArea: boolean;
  /** 余りを市場へ売る単価。 */
  readonly marketSalePrice: number;
  /** 値差取引の 1 kWh あたりの正味の差益 (効率の損を引いた後)。 */
  readonly arbitrageSpread: number;
  /** 値差取引の年あたりの回数。 */
  readonly arbitrageCyclesPerYear: number;
  /** 調整力・容量市場などの収入 (取引に使える容量 1 kWh あたり・円/年)。分からなければ 0。 */
  readonly ancillaryRevenuePerKwhYear: number;
  /** EV 充電・店舗など、ほかの年間の純収入 (円/年)。 */
  readonly otherRevenuePerYear: number;

  /* ── 維持費と貼り替え ── */
  /** 年間の維持費 (初期費用に対する割合・0〜1)。 */
  readonly omRate: number;
  /** ペロブスカイトの貼り替え 1 回の費用 (円)。 */
  readonly pvReplacementCost: number;
  /** 貼り替えの間隔 (年)。 */
  readonly pvReplacementIntervalYears: number;
  /** 蓄電池の寿命 (年)。この間隔で取り替える。 */
  readonly batteryLifeYears: number;
  /** 取り替えのときの費用 (最初の蓄電池の費用に対する割合)。 */
  readonly batteryReplacementCostRatio: number;

  /* ── 資金 ── */
  /** 計算する年数。 */
  readonly horizonYears: number;
  /** 割引率 (0〜1)。 */
  readonly discountRate: number;
  readonly subsidies: readonly SubsidyOption[];
}

/**
 * 標準ハブ拠点 (敷地 100 坪・延床 400 坪・5 階) の初期値。
 * 数字は事業の前提として与えられた値で、補助金の率は**仮置き** —— 公募要領で確かめて入れ直す。
 * 蓄電池の固定費と容量単価は「550 kWh で約 0.75 億円・2,000 kWh で約 2.00 億円」を通る直線。
 */
export const DEFAULT_ZEB_HUB_INPUT: ZebHubInput = {
  buildingCost: 440_000_000,
  pvCost: 142_000_000,
  waterPlantCost: 45_000_000,
  batteryFixedCost: 28_000_000,
  batteryCostPerKwh: 86_000,
  batteryKwh: 550,
  pvKw: 118,
  specificYieldKwhPerKwDay: 379 / 118,
  pvDegradationPerYear: 0.01,
  baseLoadKwhPerDay: 175,
  daytimeLoadShare: 0.5,
  criticalLoadKwhPerDay: 95,
  roundTripEfficiency: 0.9,
  usableDepth: 0.9,
  reserveShare: 0.3,
  gridPurchasePrice: 30,
  wheelingValue: 18,
  selfWheelingSameArea: true,
  marketSalePrice: 10,
  arbitrageSpread: 8,
  arbitrageCyclesPerYear: 300,
  ancillaryRevenuePerKwhYear: 0,
  otherRevenuePerYear: 0,
  omRate: 0.01,
  pvReplacementCost: 35_000_000,
  pvReplacementIntervalYears: 13,
  batteryLifeYears: 15,
  batteryReplacementCostRatio: 0.6,
  horizonYears: 30,
  discountRate: 0.04,
  subsidies: [
    { id: 'perovskite', name: 'ペロブスカイト導入支援 (仮置き)', targets: ['pv'], rate: 2 / 3, cap: null },
    { id: 'storage-parity', name: 'ストレージパリティ (仮置き)', targets: ['battery'], rate: 1 / 3, cap: 60_000_000 },
  ],
};

/**
 * 初年度に小さく始める拠点の初期値 —— 2 階建てのコンテナハウス 1 棟 (2026-11-23)。
 * 20 フィートのコンテナ 4 台 (1 階 2 台・2 階 2 台・延床 約 60 ㎡) を 1 台 600 万円と置いた**仮の値**で、
 * 見積もりを取ったら入れ直す (相場の目安は「1 台で工事費込み少なくとも約 500 万円」)。
 * 太陽電池は屋根に置ける 5 kW (本格拠点と同じ 1 kW あたりの単価)・蓄電池は小型の 30 kWh (20 万円/kWh・固定費なし)、
 * 雨水はトイレと散水だけに使うのでタンク 100 万円。1 拠点だけなので自己託送はしない。
 * 小さい蓄電池で止めない負荷を賄うため、使える容量の半分を災害用に取り置く。
 */
export const CONTAINER_START_ZEB_HUB_INPUT: ZebHubInput = {
  ...DEFAULT_ZEB_HUB_INPUT,
  buildingCost: 24_000_000,
  pvCost: 6_000_000,
  waterPlantCost: 1_000_000,
  batteryFixedCost: 0,
  batteryCostPerKwh: 200_000,
  batteryKwh: 30,
  pvKw: 5,
  baseLoadKwhPerDay: 40,
  criticalLoadKwhPerDay: 10,
  reserveShare: 0.5,
  selfWheelingSameArea: false,
  pvReplacementCost: 1_500_000,
};

/* ─────────────────────────  入力の検め  ───────────────────────── */

type NumberKey = { [K in keyof ZebHubInput]: ZebHubInput[K] extends number ? K : never }[keyof ZebHubInput];

/** 0〜1 でなければならない欄。 */
const SHARE_FIELDS: readonly NumberKey[] = [
  'pvDegradationPerYear',
  'daytimeLoadShare',
  'roundTripEfficiency',
  'usableDepth',
  'reserveShare',
  'omRate',
  'batteryReplacementCostRatio',
  'discountRate',
];

/** 1 以上の整数でなければならない欄。 */
const POSITIVE_INTEGER_FIELDS: readonly NumberKey[] = ['pvReplacementIntervalYears', 'batteryLifeYears', 'horizonYears'];

/** 計算に使う数の欄 (順序は入力の宣言どおり)。 */
const NUMBER_FIELDS: readonly NumberKey[] = [
  'buildingCost',
  'pvCost',
  'waterPlantCost',
  'batteryFixedCost',
  'batteryCostPerKwh',
  'batteryKwh',
  'pvKw',
  'specificYieldKwhPerKwDay',
  'pvDegradationPerYear',
  'baseLoadKwhPerDay',
  'daytimeLoadShare',
  'criticalLoadKwhPerDay',
  'roundTripEfficiency',
  'usableDepth',
  'reserveShare',
  'gridPurchasePrice',
  'wheelingValue',
  'marketSalePrice',
  'arbitrageSpread',
  'arbitrageCyclesPerYear',
  'ancillaryRevenuePerKwhYear',
  'otherRevenuePerYear',
  'omRate',
  'pvReplacementCost',
  'pvReplacementIntervalYears',
  'batteryLifeYears',
  'batteryReplacementCostRatio',
  'horizonYears',
  'discountRate',
];

/** 計算する年数の上限 (桁誤りで 1 億年を回さないため)。 */
export const MAX_HORIZON_YEARS = 60;

/**
 * 入力の誤りを欄ごとに返す (空なら計算してよい)。
 * 読めない数・負の数・範囲の外の割合で計算すると、それらしい数字が出てしまうので断る。
 */
export function zebHubInputErrors(input: ZebHubInput): string[] {
  const errors: string[] = [];
  for (const key of NUMBER_FIELDS) {
    const v = input[key];
    if (!Number.isFinite(v)) {
      errors.push(`${key}: 数として読めません`);
    } else if (v < 0) {
      errors.push(`${key}: 負の値は使えません`);
    } else if (SHARE_FIELDS.includes(key) && v > 1) {
      errors.push(`${key}: 0〜1 の割合で入れてください`);
    } else if (POSITIVE_INTEGER_FIELDS.includes(key) && (!Number.isInteger(v) || v < 1)) {
      errors.push(`${key}: 1 以上の整数で入れてください`);
    }
  }
  if (input.horizonYears > MAX_HORIZON_YEARS) errors.push(`horizonYears: ${MAX_HORIZON_YEARS} 年までです`);
  if (input.roundTripEfficiency === 0) errors.push('roundTripEfficiency: 0 では蓄電池が働きません');
  input.subsidies.forEach((s, i) => {
    if (!Number.isFinite(s.rate) || s.rate < 0 || s.rate > 1) errors.push(`subsidies[${i}] ${s.name}: 補助率は 0〜1 です`);
    if (s.cap !== null && (!Number.isFinite(s.cap) || s.cap < 0)) errors.push(`subsidies[${i}] ${s.name}: 上限は 0 以上の数です`);
    if (s.targets.length === 0) errors.push(`subsidies[${i}] ${s.name}: 対象の費用がありません`);
  });
  return errors;
}

/* ─────────────────────────  初期費用と補助金  ───────────────────────── */

export function batteryCapex(input: Pick<ZebHubInput, 'batteryFixedCost' | 'batteryCostPerKwh' | 'batteryKwh'>): number {
  return input.batteryKwh > 0 ? input.batteryFixedCost + input.batteryCostPerKwh * input.batteryKwh : 0;
}

export function capexByComponent(input: ZebHubInput): Record<CostComponent, number> {
  return {
    building: input.buildingCost,
    pv: input.pvCost,
    battery: batteryCapex(input),
    water: input.waterPlantCost,
  };
}

export interface SubsidyChoice {
  /** 選んだ補助金と、それぞれの補助額 (円)。 */
  readonly chosen: readonly { readonly id: string; readonly name: string; readonly amount: number }[];
  readonly total: number;
}

function subsidyAmount(s: SubsidyOption, capex: Record<CostComponent, number>): number {
  const base = s.targets.reduce((sum, c) => sum + capex[c], 0);
  const raw = base * s.rate;
  return s.cap === null ? raw : Math.min(raw, s.cap);
}

/** 補助金を総当たりで選ぶときの件数の上限 (2^n 通りを数えるので)。 */
export const MAX_SUBSIDY_OPTIONS = 12;

/**
 * 重ならない組み合わせの中から、補助額の合計が最大になる物を選ぶ。
 * 重ならない = 同じ費用の区分を 2 つの補助金が対象にしない・同じ `exclusiveGroup` を 2 つ選ばない。
 * 同額なら、件数の少ない組み合わせ (申請の手間が少ない) を採る。
 */
export function chooseSubsidies(options: readonly SubsidyOption[], capex: Record<CostComponent, number>): SubsidyChoice {
  if (options.length > MAX_SUBSIDY_OPTIONS) {
    throw new Error(`補助金の候補は ${MAX_SUBSIDY_OPTIONS} 件までです (${options.length} 件)`);
  }
  const conflicts = (a: SubsidyOption, b: SubsidyOption): boolean =>
    a.targets.some((c) => b.targets.includes(c)) || (a.exclusiveGroup !== undefined && a.exclusiveGroup === b.exclusiveGroup);
  type Candidate = { readonly picked: readonly SubsidyOption[]; readonly total: number };
  const candidates: Candidate[] = [];
  // 入れる側を先に辿る —— 同額のときは件数の少ない物、件数も同じなら先に見つけた物を残す。
  const search = (rest: readonly SubsidyOption[], picked: readonly SubsidyOption[], total: number): void => {
    const [head, ...tail] = rest;
    if (head === undefined) {
      candidates.push({ picked, total });
      return;
    }
    if (!picked.some((p) => conflicts(p, head))) search(tail, [...picked, head], total + subsidyAmount(head, capex));
    search(tail, picked, total);
  };
  search(options, [], 0);
  // 空の組 (何も選ばない) は必ず候補に入るので、reduce は空にならない。
  const best = candidates.reduce((a, b) =>
    b.total > a.total || (b.total === a.total && b.picked.length < a.picked.length) ? b : a,
  );
  return { chosen: best.picked.map((s) => ({ id: s.id, name: s.name, amount: subsidyAmount(s, capex) })), total: best.total };
}

/* ─────────────────────────  電力の流れ (1 日)  ───────────────────────── */

export interface DailyEnergy {
  /** 発電量 (kWh/日)。 */
  readonly generation: number;
  /** 日中にそのまま使った量。 */
  readonly directUse: number;
  /** 蓄電池から夜に使った量。 */
  readonly batteryToLoad: number;
  /** 系統から買った量。 */
  readonly gridImport: number;
  /** 敷地の外へ出した余り (自己託送か市場売電)。 */
  readonly exported: number;
  /** 値差取引に使える容量 (kWh)。 */
  readonly arbitrageCapacity: number;
}

/** 年 `year` (1 始まり) の 1 日あたりの電力の流れ。 */
export function dailyEnergy(input: ZebHubInput, year: number): DailyEnergy {
  const generation = input.pvKw * input.specificYieldKwhPerKwDay * (1 - input.pvDegradationPerYear) ** (year - 1);
  const dayLoad = input.baseLoadKwhPerDay * input.daytimeLoadShare;
  const nightLoad = input.baseLoadKwhPerDay - dayLoad;
  const directUse = Math.min(generation, dayLoad);
  const surplus = generation - directUse;
  const cyclable = input.batteryKwh * input.usableDepth * (1 - input.reserveShare);
  const eta = input.roundTripEfficiency;
  const batteryToLoad = Math.min(surplus * eta, nightLoad, cyclable);
  const exported = surplus - batteryToLoad / eta;
  return {
    generation,
    directUse,
    batteryToLoad,
    gridImport: input.baseLoadKwhPerDay - directUse - batteryToLoad,
    exported,
    arbitrageCapacity: cyclable - batteryToLoad,
  };
}

/* ─────────────────────────  年ごとのお金  ───────────────────────── */

export interface YearCashFlow {
  readonly year: number;
  /** 買う電気が減った分 (円)。 */
  readonly savings: number;
  /** 余りを自己託送・売電した分 (円)。 */
  readonly exportRevenue: number;
  /** 値差取引・調整力などの分 (円)。 */
  readonly marketRevenue: number;
  readonly otherRevenue: number;
  readonly opex: number;
  /** 貼り替え・取り替え (円)。 */
  readonly replacement: number;
  readonly net: number;
}

export interface ZebHubResult {
  readonly capex: Record<CostComponent, number>;
  readonly capexTotal: number;
  readonly subsidy: SubsidyChoice;
  /** 補助後の初期費用 (円)。 */
  readonly netInvestment: number;
  readonly years: readonly YearCashFlow[];
  readonly npv: number;
  /** 内部収益率。求められない (ずっと赤字など) ときは null。 */
  readonly irr: number | null;
  /** 投資回収年数 (割り引かない累計が 0 を越える年・小数)。回収できなければ null。 */
  readonly paybackYears: number | null;
  /** 災害時、発電が無くても止めない負荷を賄える時間 (災害用の取り置き分だけで・時間)。 */
  readonly reserveAutonomyHours: number | null;
  /** 同じく、使える容量のすべてで賄える時間。 */
  readonly fullAutonomyHours: number | null;
  readonly firstYearEnergy: DailyEnergy;
}

function isReplacementYear(year: number, interval: number, horizon: number): boolean {
  return year % interval === 0 && year < horizon;
}

/** 正味現在価値 (年 0 は割り引かない)。 */
export function npvOf(flows: readonly number[], rate: number): number {
  return flows.reduce((sum, f, t) => sum + f / (1 + rate) ** t, 0);
}

/**
 * 内部収益率を二分法で求める。年 0 が負で、どこかで正に転じる流れだけを扱う。
 * -99% と 100% の間で符号が変わらなければ null (それらしい数を作らない)。
 */
export function irrOf(flows: readonly number[]): number | null {
  let lo = -0.99;
  let hi = 1;
  const fLo = npvOf(flows, lo);
  const fHi = npvOf(flows, hi);
  if (fLo === 0) return lo;
  if (Math.sign(fLo) === Math.sign(fHi)) return null;
  Array.from({ length: 200 }).forEach(() => {
    const mid = (lo + hi) / 2;
    if (Math.sign(npvOf(flows, mid)) === Math.sign(fLo)) lo = mid;
    else hi = mid;
  });
  return (lo + hi) / 2;
}

/** 割り引かない累計が初めて 0 以上になる年 (前の年からの直線補間)。 */
export function paybackOf(flows: readonly number[]): number | null {
  const [first = 0, ...rest] = flows;
  if (first >= 0) return 0;
  let cumulative = first;
  for (const [i, f] of rest.entries()) {
    const next = cumulative + f;
    if (next >= 0) return i + -cumulative / f;
    cumulative = next;
  }
  return null;
}

/** 1 拠点の収支を計算する。入力に誤りがあれば投げる (先に `zebHubInputErrors` で確かめる)。 */
export function simulateZebHub(input: ZebHubInput): ZebHubResult {
  const errors = zebHubInputErrors(input);
  if (errors.length > 0) throw new Error(`入力を確かめてください: ${errors.join(' / ')}`);
  const capex = capexByComponent(input);
  const capexTotal = COST_COMPONENTS.reduce((sum, c) => sum + capex[c], 0);
  const subsidy = chooseSubsidies(input.subsidies, capex);
  const netInvestment = capexTotal - subsidy.total;
  const exportValue = input.selfWheelingSameArea ? input.wheelingValue : input.marketSalePrice;

  const years: YearCashFlow[] = [];
  for (let year = 1; year <= input.horizonYears; year++) {
    const e = dailyEnergy(input, year);
    const savings = (e.directUse + e.batteryToLoad) * 365 * input.gridPurchasePrice;
    const exportRevenue = e.exported * 365 * exportValue;
    const marketRevenue =
      e.arbitrageCapacity * input.arbitrageCyclesPerYear * input.arbitrageSpread +
      e.arbitrageCapacity * input.ancillaryRevenuePerKwhYear;
    const opex = capexTotal * input.omRate;
    const replacement =
      (isReplacementYear(year, input.pvReplacementIntervalYears, input.horizonYears) ? input.pvReplacementCost : 0) +
      (isReplacementYear(year, input.batteryLifeYears, input.horizonYears)
        ? capex.battery * input.batteryReplacementCostRatio
        : 0);
    const net = savings + exportRevenue + marketRevenue + input.otherRevenuePerYear - opex - replacement;
    years.push({ year, savings, exportRevenue, marketRevenue, otherRevenue: input.otherRevenuePerYear, opex, replacement, net });
  }

  const flows = [-netInvestment, ...years.map((y) => y.net)];
  const usable = input.batteryKwh * input.usableDepth;
  const criticalPerHour = input.criticalLoadKwhPerDay / 24;
  return {
    capex,
    capexTotal,
    subsidy,
    netInvestment,
    years,
    npv: npvOf(flows, input.discountRate),
    irr: irrOf(flows),
    paybackYears: paybackOf(flows),
    reserveAutonomyHours: criticalPerHour > 0 ? (usable * input.reserveShare) / criticalPerHour : null,
    fullAutonomyHours: criticalPerHour > 0 ? usable / criticalPerHour : null,
    firstYearEnergy: dailyEnergy(input, 1),
  };
}

/* ─────────────────────────  蓄電池の容量を選ぶ  ───────────────────────── */

export interface BatterySizeRow {
  readonly batteryKwh: number;
  readonly npv: number;
  readonly irr: number | null;
  readonly paybackYears: number | null;
  readonly reserveAutonomyHours: number | null;
}

export interface BatterySizeChoice {
  readonly rows: readonly BatterySizeRow[];
  /** NPV が最大の容量。 */
  readonly best: BatterySizeRow;
  /**
   * 災害時に止めない負荷を `minAutonomyHours` 以上賄える容量のうち NPV が最大の物。
   * どの候補も届かなければ null (届かないことを隠さない)。
   */
  readonly bestMeetingAutonomy: BatterySizeRow | null;
}

/**
 * 蓄電池の容量の候補ごとに収支を出し、最も得な物を選ぶ。
 * 防災拠点なので、取り置き分で賄える時間の下限 (`minAutonomyHours`) を満たす中での最良も別に返す。
 */
export function chooseBatterySize(
  input: ZebHubInput,
  candidatesKwh: readonly number[],
  minAutonomyHours: number,
): BatterySizeChoice {
  if (candidatesKwh.length === 0) throw new Error('蓄電池の容量の候補がありません');
  const rows = candidatesKwh.map((kwh): BatterySizeRow => {
    const r = simulateZebHub({ ...input, batteryKwh: kwh });
    return { batteryKwh: kwh, npv: r.npv, irr: r.irr, paybackYears: r.paybackYears, reserveAutonomyHours: r.reserveAutonomyHours };
  });
  const byNpv = (a: BatterySizeRow, b: BatterySizeRow): BatterySizeRow => (b.npv > a.npv ? b : a);
  const meeting = rows.filter((r) => r.reserveAutonomyHours !== null && r.reserveAutonomyHours >= minAutonomyHours);
  return {
    rows,
    best: rows.reduce(byNpv),
    bestMeetingAutonomy: meeting.length > 0 ? meeting.reduce(byNpv) : null,
  };
}
