/**
 * 数値パラメータの台帳 —— 各機能が計算に使う**法定値・参考値・しきい値・前提**を
 * 1 か所に登録し、利用者が任意の値で上書きできるようにする。
 *
 * 依頼 (2026-09-03)「全ての機能の数値を任意で設定出来る仕様に」。
 *
 * ## 設計
 * - **既定値は各モジュールの定数をそのまま参照する** (写さない)。ここに数字を
 *   書き写すと、法改正で定数を直したときに台帳だけ古くなる。
 * - **計算は純粋なまま**。各モジュールの関数は省略可の引数で値を受け取り、
 *   省略時は従来の定数を使う (既存の検査は 1 行も変えずに通る)。画面が
 *   `useParameters()` で有効値を読み、関数へ渡す。台帳を読む大域の状態は置かない。
 * - **登録した値は必ず配線する**。「設定できるのに効かない」項目は、画面が
 *   嘘をつく最悪の形なので、台帳に載せる = その値で計算が変わる、を検査で留める。
 * - **範囲は桁誤りを止める幅**。値の正しさ (この率が今年の法定値か) は見ない —
 *   それを決めるのは利用者と出典。
 *
 * ## 載せないもの
 * - 安全上限 (通信の打ち切り・応答サイズ・保存の上限・暗号の反復回数・入力長) は
 *   利用者に触らせない。緩めても画面上は何も変わらず、緩めたことに気付けない。
 * - 画面の入力欄に**直接ある**値 (水耕栽培の電力原単位・単価など) は載せない。
 *   同じ値を 2 か所で置けると、どちらが効いているかが画面から読めなくなる。
 */
import {
  PANEL_AREA_SQM,
  DAYS_PER_YEAR,
  REFERENCE_LETTUCE_POTASSIUM_MG,
  SALT_EQUIVALENT_FACTOR,
  LOW_K_SWITCH_DAYS_MIN,
  LOW_K_SWITCH_DAYS_MAX,
  CKD_POTASSIUM_LIMIT_MG,
  type CkdStage,
  type ProductionParams,
  type LowPotassiumParams,
} from './hydroponics';
import { COMMUTE_PUBLIC_TRANSPORT_CAP } from './payroll';
import { DSCR_DANGER_THRESHOLD, DSCR_CAUTION_THRESHOLD, type DscrThresholds } from './realEstateMetrics';
import {
  CONSUMPTION_TAX_STANDARD,
  CONSUMPTION_TAX_REDUCED,
  RECONSTRUCTION_SURTAX_RATE,
  RESIDENT_TAX_RATE,
  RESIDENT_TAX_PER_CAPITA,
  SOCIAL_INSURANCE_RATE,
  type MunicipalityOverride,
  type NetSalaryParams,
  type SalaryTaxParams,
} from './taxCalc';
import {
  PENSION_RATE,
  HEALTH_RATE,
  CARE_RATE,
  EMPLOYMENT_INSURANCE_RATE,
  PENSION_BONUS_CAP_PER_PAYMENT,
  HEALTH_BONUS_CAP_ANNUAL,
  type SocialInsuranceRates,
} from './taxSocialInsurance';
import { DEFAULT_EFFECTIVE_TAX_RATE } from './funding';

/** 値の性格。画面の印と、変えるときの注意書きが変わる。 */
export type ParameterKind =
  | 'law' // 法令・公的な基準で決まる値 (改正で変わる)
  | 'reference' // 公開資料の参考値 (自分の実測で置き換える)
  | 'threshold' // 判定のしきい値 (警告を出す境目)
  | 'assumption'; // 試算の前提 (置き値)

export const PARAMETER_KIND_LABEL: Readonly<Record<ParameterKind, string>> = {
  law: '法定値',
  reference: '参考値',
  threshold: 'しきい値',
  assumption: '前提',
};

export interface ParameterDef {
  readonly id: string;
  /** 画面のまとまり (機能名)。 */
  readonly feature: string;
  readonly label: string;
  /** 画面に出す単位。`scale` を掛けた後の単位 (割合なら % と 100)。 */
  readonly unit: string;
  /** 画面表示の倍率。内部値 0.1 を画面では 10 (%) と見せる。省略は 1。 */
  readonly scale?: number;
  readonly defaultValue: number;
  readonly min: number;
  readonly max: number;
  readonly integer?: boolean;
  readonly kind: ParameterKind;
  /** 出典 (法令名・資料名)。 */
  readonly source?: string;
  readonly note?: string;
}

const G3B = CKD_POTASSIUM_LIMIT_MG.G3b as number;
const G4 = CKD_POTASSIUM_LIMIT_MG.G4 as number;
const G5 = CKD_POTASSIUM_LIMIT_MG.G5 as number;

/**
 * 台帳の本体。関数にしてあるのは変異検査のため — モジュール読込時にだけ走る表は
 * `ignoreStatic` で測られず、`vi.resetModules()` で読み直すと**依存先の表まで**
 * 測定対象に入ってしまう (2026-09-03 に踏んだ: hydroponics / payroll の参考値表が
 * 生存として 47 件出た)。関数なら検査が呼ぶだけで表の文字と数が測れる。
 */
export function parameterDefinitions() {
  return [
  // --- 水耕栽培 -----------------------------------------------------------
  {
    id: 'hydroponics.panelAreaSqm', feature: '水耕栽培', label: '栽培パネル 1 枚の面積', unit: 'm²',
    defaultValue: PANEL_AREA_SQM, min: 0.05, max: 10, kind: 'reference',
    source: 'ALIC 野菜情報 (60cm × 90cm)', note: '株密度 = パネル穴数 ÷ この面積',
  },
  {
    id: 'hydroponics.daysPerYear', feature: '水耕栽培', label: '年間の稼働日数', unit: '日',
    defaultValue: DAYS_PER_YEAR, min: 1, max: 366, integer: true, kind: 'assumption',
    note: '年回転数 = 稼働日数 ÷ 定植後日数。休業日を除くなら減らす',
  },
  {
    id: 'hydroponics.referenceLettucePotassiumMg', feature: '水耕栽培', label: '通常レタスのカリウム (比較基準)', unit: 'mg/100g',
    defaultValue: REFERENCE_LETTUCE_POTASSIUM_MG, min: 1, max: 5_000, kind: 'reference',
    source: '日本食品標準成分表 八訂 増補2023 (土耕結球葉)', note: '低カリウムの削減率の分母',
  },
  {
    id: 'hydroponics.saltEquivalentFactor', feature: '水耕栽培', label: '食塩相当量の換算係数', unit: '',
    defaultValue: SALT_EQUIVALENT_FACTOR, min: 1, max: 5, kind: 'law',
    source: '食品表示基準 (Na mg × 2.54 ÷ 1000 = 食塩相当量 g)',
  },
  {
    id: 'hydroponics.lowKSwitchDaysMin', feature: '水耕栽培', label: '低カリウム切替の目安 (下限)', unit: '日',
    defaultValue: LOW_K_SWITCH_DAYS_MIN, min: 1, max: 60, integer: true, kind: 'reference',
    source: 'ALIC 野菜情報 (収穫前 7〜10 日)',
  },
  {
    id: 'hydroponics.lowKSwitchDaysMax', feature: '水耕栽培', label: '低カリウム切替の目安 (上限)', unit: '日',
    defaultValue: LOW_K_SWITCH_DAYS_MAX, min: 1, max: 60, integer: true, kind: 'reference',
    source: 'ALIC 野菜情報 (収穫前 7〜10 日)',
  },
  {
    id: 'hydroponics.ckdPotassiumLimitG3b', feature: '水耕栽培', label: 'CKD G3b の 1 日カリウム上限', unit: 'mg',
    defaultValue: G3B, min: 100, max: 10_000, integer: true, kind: 'reference',
    source: '日本腎臓学会 (2,000mg)', note: '医師の指示があればその値に。食べられる g 数の計算に使う',
  },
  {
    id: 'hydroponics.ckdPotassiumLimitG4', feature: '水耕栽培', label: 'CKD G4 の 1 日カリウム上限', unit: 'mg',
    defaultValue: G4, min: 100, max: 10_000, integer: true, kind: 'reference',
    source: '日本腎臓学会 (1,500mg)', note: '医師の指示があればその値に',
  },
  {
    id: 'hydroponics.ckdPotassiumLimitG5', feature: '水耕栽培', label: 'CKD G5 の 1 日カリウム上限', unit: 'mg',
    defaultValue: G5, min: 100, max: 10_000, integer: true, kind: 'reference',
    source: '日本腎臓学会 (1,500mg)', note: '医師の指示があればその値に',
  },
  // --- 給与 ---------------------------------------------------------------
  {
    id: 'payroll.commutePublicTransportCap', feature: '給与', label: '通勤手当 (公共交通機関) の非課税限度 / 月', unit: '円',
    defaultValue: COMMUTE_PUBLIC_TRANSPORT_CAP, min: 0, max: 1_000_000, integer: true, kind: 'law',
    source: '所得税法施行令 20 条の 2 (月 15 万円)',
  },
  // --- 不動産 -------------------------------------------------------------
  {
    id: 'realEstate.dscrDangerThreshold', feature: '不動産', label: 'DSCR の危険水域 (未満)', unit: '倍',
    defaultValue: DSCR_DANGER_THRESHOLD, min: 0.1, max: 10, kind: 'threshold',
    note: 'NOI で返済を賄えない境目。1.0 未満は元利返済が NOI を超える',
  },
  {
    id: 'realEstate.dscrCautionThreshold', feature: '不動産', label: 'DSCR の注意水域 (未満)', unit: '倍',
    defaultValue: DSCR_CAUTION_THRESHOLD, min: 0.1, max: 10, kind: 'threshold',
    note: '金融機関が求めることの多い 1.2〜1.3 の下側',
  },
  // --- 税 -----------------------------------------------------------------
  {
    id: 'tax.consumptionStandardRate', feature: '税', label: '消費税率 (標準)', unit: '%', scale: 100,
    defaultValue: CONSUMPTION_TAX_STANDARD, min: 0, max: 0.5, kind: 'law', source: '消費税法 (10%)',
  },
  {
    id: 'tax.consumptionReducedRate', feature: '税', label: '消費税率 (軽減)', unit: '%', scale: 100,
    defaultValue: CONSUMPTION_TAX_REDUCED, min: 0, max: 0.5, kind: 'law', source: '消費税法 (8%)',
  },
  // --- 所得税・住民税 -------------------------------------------------------
  {
    id: 'incomeTax.reconstructionSurtaxRate', feature: '所得税・住民税', label: '復興特別所得税の付加率', unit: '%', scale: 100,
    defaultValue: RECONSTRUCTION_SURTAX_RATE, min: 0, max: 0.2, kind: 'law',
    source: '復興財源確保法 (基準所得税額 × 2.1%、2037 年分まで)',
  },
  {
    id: 'incomeTax.socialInsuranceEstimateRate', feature: '所得税・住民税', label: '手取り試算の社会保険料率 (額面比例の概算)', unit: '%', scale: 100,
    defaultValue: SOCIAL_INSURANCE_RATE, min: 0, max: 0.5, kind: 'assumption',
    note: '簡易な手取り試算だけが使う。精密な社会保険料は等級表と下の料率で別に出す',
  },
  {
    id: 'residentTax.incomeRate', feature: '所得税・住民税', label: '住民税の所得割率 (都道府県 + 市町村)', unit: '%', scale: 100,
    defaultValue: RESIDENT_TAX_RATE, min: 0, max: 0.3, kind: 'law',
    source: '地方税法 (標準 4% + 6%)', note: '超過課税の自治体はその率に',
  },
  {
    id: 'residentTax.perCapita', feature: '所得税・住民税', label: '住民税の均等割 (森林環境税を含む年額)', unit: '円',
    defaultValue: RESIDENT_TAX_PER_CAPITA, min: 0, max: 100_000, integer: true, kind: 'law',
    source: '地方税法 (基礎 4,000 円) + 森林環境税 1,000 円', note: '上乗せのある自治体はその額に',
  },
  // --- 社会保険 -------------------------------------------------------------
  {
    id: 'socialInsurance.pensionRate', feature: '社会保険', label: '厚生年金保険料率 (本人負担)', unit: '%', scale: 100,
    defaultValue: PENSION_RATE, min: 0, max: 0.3, kind: 'law', source: '厚生年金保険法 (18.3% の半分)',
  },
  {
    id: 'socialInsurance.healthRate', feature: '社会保険', label: '健康保険料率 (本人負担・40 歳未満)', unit: '%', scale: 100,
    defaultValue: HEALTH_RATE, min: 0, max: 0.3, kind: 'reference',
    source: '協会けんぽ 全国平均 (約 10% の半分)', note: '都道府県別の率に置き換える',
  },
  {
    id: 'socialInsurance.careRate', feature: '社会保険', label: '介護保険料率 (本人負担・40〜64 歳の上乗せ)', unit: '%', scale: 100,
    defaultValue: CARE_RATE, min: 0, max: 0.1, kind: 'law', source: '協会けんぽ 令和8年度 (1.62% の半分)',
  },
  {
    id: 'socialInsurance.employmentRate', feature: '社会保険', label: '雇用保険料率 (本人負担・一般の事業)', unit: '%', scale: 100,
    defaultValue: EMPLOYMENT_INSURANCE_RATE, min: 0, max: 0.1, kind: 'law', source: '雇用保険法 令和8年度 (0.5%)',
  },
  {
    id: 'socialInsurance.pensionBonusCapPerPayment', feature: '社会保険', label: '厚生年金の標準賞与額の上限 (1 回あたり)', unit: '円',
    defaultValue: PENSION_BONUS_CAP_PER_PAYMENT, min: 0, max: 100_000_000, integer: true, kind: 'law',
    source: '厚生年金保険法 (150 万円)',
  },
  {
    id: 'socialInsurance.healthBonusCapAnnual', feature: '社会保険', label: '健康保険の標準賞与額の上限 (年度累計)', unit: '円',
    defaultValue: HEALTH_BONUS_CAP_ANNUAL, min: 0, max: 100_000_000, integer: true, kind: 'law',
    source: '健康保険法 (573 万円)',
  },
  // --- 財務 ---------------------------------------------------------------
  {
    id: 'finance.effectiveTaxRate', feature: '財務', label: '実効税率 (NOPAT・税引後の試算)', unit: '%', scale: 100,
    defaultValue: DEFAULT_EFFECTIVE_TAX_RATE, min: 0, max: 1, kind: 'assumption',
    note: '中小法人の目安 30%。実績の税負担率が分かれば置き換える',
  },
  ] as const satisfies readonly ParameterDef[];
}

export const PARAMETERS = parameterDefinitions();

export type ParameterId = (typeof PARAMETERS)[number]['id'];
export type ParameterValues = Readonly<Record<ParameterId, number>>;
export type ParameterOverrides = Readonly<Partial<Record<ParameterId, number>>>;

export const PARAMETER_BY_ID: ReadonlyMap<string, ParameterDef> = new Map(PARAMETERS.map((p) => [p.id, p]));

export function isParameterId(id: unknown): id is ParameterId {
  // 文字列以外は Map に無いので typeof の前置きは要らない (等価な分岐を置かない)。
  return PARAMETER_BY_ID.has(id as string);
}

/** 画面のまとまり (登場順)。 */
export function parameterFeatures(): readonly string[] {
  const out: string[] = [];
  for (const p of PARAMETERS) if (!out.includes(p.feature)) out.push(p.feature);
  return out;
}

/**
 * 内部値 → 画面の値 (scale を掛ける)。0.07 × 100 = 7.000000000000001 を 7 に戻す
 * ため有効桁 12 で丸める (画面に浮動小数の尾を出さない)。
 */
export function toDisplayValue(def: ParameterDef, internal: number): number {
  return Number((internal * (def.scale ?? 1)).toPrecision(12));
}

/**
 * 画面の値 → 内部値 (scale で割る)。こちらも有効桁 12 で丸める —
 * 0.81 ÷ 100 = 0.008100000000000001 のままだと、既定 0.0081 と「違う値」に
 * 見えて保存ボタンが立ち、その尾つきの値が保存される。
 */
export function fromDisplayValue(def: ParameterDef, display: number): number {
  return Number((display / (def.scale ?? 1)).toPrecision(12));
}

/** id で引く版 (画面の文言が「いま効いている値」を単位つきで言うため)。 */
export function displayValue(id: ParameterId, internal: number): number {
  return toDisplayValue(PARAMETER_BY_ID.get(id)!, internal);
}

/**
 * 候補の値を検査する。通れば null、通らなければ利用者向けの文。
 * 範囲は**内部値** (scale を掛ける前) で見る。文の数字は画面の値で言う。
 */
export function parameterIssue(def: ParameterDef, raw: unknown): string | null {
  const shown = (v: number) => `${toDisplayValue(def, v)}${def.unit}`;
  // Number.isFinite は変換せずに照合するので、数でない値 (文字列・null・物) も false になる。
  if (!Number.isFinite(raw)) return '数値で入力してください';
  const n = raw as number;
  if (n < def.min) return `${shown(def.min)} 以上で入力してください`;
  if (n > def.max) return `${shown(def.max)} 以下で入力してください`;
  if (def.integer && !Number.isInteger(toDisplayValue(def, n))) return '整数で入力してください';
  return null;
}

/**
 * 保存された上書きを検証して返す。知らない id と通らない値は捨てる
 * (壊れた保存で画面ごと落とさない)。既定と同じ値も「上書き」として残す —
 * 利用者が明示的に置いた値は、既定が改正で動いても動かさない。
 */
export function sanitizeParameterOverrides(raw: unknown): ParameterOverrides {
  if (typeof raw !== 'object' || raw === null) return {};
  const out: Partial<Record<ParameterId, number>> = {};
  for (const [id, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!isParameterId(id)) continue;
    const def = PARAMETER_BY_ID.get(id)!;
    if (parameterIssue(def, value) !== null) continue;
    out[id] = value as number;
  }
  return out;
}

/** 既定に上書きを重ねた有効値。 */
export function resolveParameters(overrides: ParameterOverrides = {}): ParameterValues {
  const out: Record<string, number> = {};
  for (const p of PARAMETERS) {
    const o = overrides[p.id];
    // undefined は parameterIssue が「数値で」と断るので、前置きの判定は要らない。
    out[p.id] = parameterIssue(p, o) === null ? (o as number) : p.defaultValue;
  }
  return out as ParameterValues;
}

/** 既定そのもの (上書きなし)。 */
export const DEFAULT_PARAMETER_VALUES: ParameterValues = resolveParameters();

/** 上書きされている id の数 (画面の見出し用)。 */
export function overriddenCount(overrides: ParameterOverrides): number {
  return Object.keys(overrides).filter((id) => isParameterId(id)).length;
}

// --- 機能ごとの取り出し口 (画面が関数へ渡す形に組む) ---------------------------

export function hydroponicsProductionParams(v: ParameterValues): ProductionParams {
  return { panelAreaSqm: v['hydroponics.panelAreaSqm'], daysPerYear: v['hydroponics.daysPerYear'] };
}

export function lowPotassiumParams(v: ParameterValues): LowPotassiumParams {
  return {
    referencePotassiumMgPer100g: v['hydroponics.referenceLettucePotassiumMg'],
    saltEquivalentFactor: v['hydroponics.saltEquivalentFactor'],
    switchDaysMin: v['hydroponics.lowKSwitchDaysMin'],
    switchDaysMax: v['hydroponics.lowKSwitchDaysMax'],
  };
}

/** 病期別の 1 日上限。制限のない病期 (G1〜G3a) は台帳の null をそのまま保つ。 */
export function ckdPotassiumLimits(v: ParameterValues): Readonly<Record<CkdStage, number | null>> {
  return {
    ...CKD_POTASSIUM_LIMIT_MG,
    G3b: v['hydroponics.ckdPotassiumLimitG3b'],
    G4: v['hydroponics.ckdPotassiumLimitG4'],
    G5: v['hydroponics.ckdPotassiumLimitG5'],
  };
}

export function dscrThresholds(v: ParameterValues): DscrThresholds {
  return { danger: v['realEstate.dscrDangerThreshold'], caution: v['realEstate.dscrCautionThreshold'] };
}

export function socialInsuranceRates(v: ParameterValues): SocialInsuranceRates {
  return {
    pensionRate: v['socialInsurance.pensionRate'],
    healthRate: v['socialInsurance.healthRate'],
    careRate: v['socialInsurance.careRate'],
    employmentRate: v['socialInsurance.employmentRate'],
    pensionBonusCapPerPayment: v['socialInsurance.pensionBonusCapPerPayment'],
    healthBonusCapAnnual: v['socialInsurance.healthBonusCapAnnual'],
  };
}

/** 住民税の自治体の値 (`calcResidentTax` の override の形)。 */
export function residentTaxOverride(v: ParameterValues): MunicipalityOverride {
  return { incomeRate: v['residentTax.incomeRate'], perCapita: v['residentTax.perCapita'] };
}

export function netSalaryParams(v: ParameterValues): NetSalaryParams {
  return {
    socialInsuranceRate: v['incomeTax.socialInsuranceEstimateRate'],
    surtaxRate: v['incomeTax.reconstructionSurtaxRate'],
    resident: residentTaxOverride(v),
  };
}

export function salaryTaxParams(v: ParameterValues): SalaryTaxParams {
  return { surtaxRate: v['incomeTax.reconstructionSurtaxRate'], resident: residentTaxOverride(v) };
}
