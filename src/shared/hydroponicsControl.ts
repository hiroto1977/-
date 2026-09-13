/**
 * 水耕栽培の **運転管理** —— 日々の測定を集め、判定し、次にやることを出す
 * (2026-09-13 · パス 194 で新設)。
 *
 * ## この層と、既に在る層の違い
 *
 * | ファイル | 答える問い |
 * | --- | --- |
 * | `hydroponics.ts` | **どれだけ採れて、いくらになるか** (設備 → 生産量 → 損益) |
 * | `waterCyclePlanner.ts` | **水と排水をどう回すか** (水収支・RO・硝化・曝気・排水基準) |
 * | `hydroponicCrops.ts` | **何を育てるか** (品目の一覧と栽培条件の編集) |
 * | **`hydroponicsControl.ts` (ここ)** | **今日、何をするか** (測定 → 判定 → 作業) |
 *
 * 試算の層は「事業として成り立つか」を見る。ここは**動いている栽培室を回す**ための
 * 層で、入力は毎日変わる実測値である。
 *
 * ## 設計の約束 (このリポジトリの規律をそのまま当てる)
 *
 * 1. **測っていない値は `null`。0 に倒さない。** 「未測定」と「0」は打ち手が違う
 *    (前者は測りに行く・後者は調製する)。`assessReading` は `'unmeasured'` を
 *    **`'ok'` とは別の状態**として返し、1 つでも未測定なら `allOk` は false。
 *    「全部緑」は**全項目を測ったうえで全部範囲内**のときだけ。
 * 2. **「測っていない」と「読めない」も混ぜない。** 測定器の異常値・入力ミス
 *    (pH 99・EC −3・NaN) は `'unreadable'` で、値そのものは刷らない。
 * 3. **算定できない量は出さない。** EC の調製量は原液の EC 上昇率が要り、酸の量は
 *    アルカリ度が要る。無ければ `{ kind: 'cannot', missing, how }` を返す ——
 *    **推定値で「この量を入れてください」と言うのは、養液を壊す指示になる。**
 * 4. **pH は「目標 pH までの酸の量」を出さない。** 必要量は水のアルカリ度と
 *    緩衝曲線で決まり、水量だけからは決まらない。出すのは
 *    **アルカリ度を中和する当量計算** (`acidToNeutralizeAlkalinity`) と、
 *    少量ずつ加えて測り直す手順である。当量は化学量論で決まるので嘘にならない。
 * 5. **根拠の強さを値ごとに持つ** (`basis`)。`hydroponics.ts` の品目表が
 *    「リーフレタスだけが出典で裏付けた値」と正直に書いているのと同じ姿勢で、
 *    環境の目標域は**実務で広く使われる幅を置いた目安** (`'reference'`) であり、
 *    出典で検証した値ではない。**利用者が自分の実測に置き換えて使う前提**。
 * 6. **目標域は画面の入力欄に直接在る** ので `parameters.ts` の台帳には載せない
 *    (台帳の冒頭が定めている「入力欄に直接ある値は載せない」)。ここの定数は
 *    入力欄の**初期値**である。
 */

import { addIsoDays, isCalendarDate, isoDaysBetween, parseIsoDate } from './isoDate';
import {
  DEFAULT_CROP_LIST,
  HYDROPONIC_CROP_BOUNDS,
  findCrop,
  type CropNumericField,
} from './hydroponicCrops';
import type { HydroponicCrop, HydroponicCropId } from './hydroponics';

// --- 1. 測定項目の台帳 ----------------------------------------------------

/**
 * 日々測る項目。**この配列が唯一の一覧**で、画面の入力欄・判定・作業リストが
 * すべてここから導かれる (数を 2 か所に書くと必ず食い違う)。
 */
export const READING_FIELDS = [
  'ec',
  'ph',
  'waterTempC',
  'airTempC',
  'humidityPct',
  'co2Ppm',
  'dissolvedOxygenMgL',
  'waterLevelPct',
] as const;
export type ReadingField = (typeof READING_FIELDS)[number];

/** 目標域の出所。 */
export type TargetSource =
  /** 品目ごと (`HydroponicCrop` の ecLow/ecHigh・phLow/phHigh)。 */
  | 'crop'
  /** 栽培室ごと (`EnvironmentTargets`。品目に依らず室全体で決まる)。 */
  | 'facility';

/** 根拠の強さ。**出典で裏付けた値と、実務の幅を置いた目安を分ける。** */
export type TargetBasis = 'sourced' | 'reference';

export interface ReadingFieldSpec {
  readonly label: string;
  readonly unit: string;
  /** 画面と指摘文が同じ桁で語るための小数桁。 */
  readonly digits: number;
  /**
   * **桁誤りと測定器の異常を止める幅**であって、栽培上の適正域ではない
   * (`HYDROPONIC_CROP_BOUNDS` と同じ役目・同じ言い方)。外は `'unreadable'`。
   */
  readonly plausibleMin: number;
  readonly plausibleMax: number;
  readonly targetFrom: TargetSource;
  /** 下限が効く項目か (溶存酸素・液位は「高すぎ」を咎めない)。 */
  readonly lowerBoundMatters: boolean;
  readonly upperBoundMatters: boolean;
}

/**
 * 項目ごとの仕様。EC / pH の妥当範囲は **`HYDROPONIC_CROP_BOUNDS` から読む**
 * (品目の編集欄と同じ幅。数を写さない)。
 */
const CROP_BOUND = (f: CropNumericField): { min: number; max: number } => ({
  min: HYDROPONIC_CROP_BOUNDS[f].min,
  max: HYDROPONIC_CROP_BOUNDS[f].max,
});

export const READING_FIELD_SPECS: Readonly<Record<ReadingField, ReadingFieldSpec>> = {
  ec: {
    label: '養液 EC',
    unit: 'mS/cm',
    digits: 2,
    plausibleMin: CROP_BOUND('ecLow').min,
    plausibleMax: CROP_BOUND('ecHigh').max,
    targetFrom: 'crop',
    lowerBoundMatters: true,
    upperBoundMatters: true,
  },
  ph: {
    label: '養液 pH',
    unit: '',
    digits: 1,
    plausibleMin: CROP_BOUND('phLow').min,
    plausibleMax: CROP_BOUND('phHigh').max,
    targetFrom: 'crop',
    lowerBoundMatters: true,
    upperBoundMatters: true,
  },
  waterTempC: {
    label: '養液温度',
    unit: '℃',
    digits: 1,
    // 氷点下の養液も 60℃ の養液も測定器か入力の誤り。
    plausibleMin: -5,
    plausibleMax: 60,
    targetFrom: 'facility',
    lowerBoundMatters: true,
    upperBoundMatters: true,
  },
  airTempC: {
    label: '室温',
    unit: '℃',
    digits: 1,
    plausibleMin: -20,
    plausibleMax: 60,
    targetFrom: 'facility',
    lowerBoundMatters: true,
    upperBoundMatters: true,
  },
  humidityPct: {
    label: '相対湿度',
    unit: '%',
    digits: 0,
    plausibleMin: 0,
    plausibleMax: 100,
    targetFrom: 'facility',
    lowerBoundMatters: true,
    upperBoundMatters: true,
  },
  co2Ppm: {
    label: 'CO₂ 濃度',
    unit: 'ppm',
    digits: 0,
    // 5% (50,000 ppm) を超える室内は人が入れない。
    plausibleMin: 0,
    plausibleMax: 50_000,
    targetFrom: 'facility',
    lowerBoundMatters: true,
    upperBoundMatters: true,
  },
  dissolvedOxygenMgL: {
    label: '溶存酸素',
    unit: 'mg/L',
    digits: 1,
    // 常圧の水の飽和溶存酸素は 25℃ で約 8.3 mg/L。過飽和でも 25 が上限の目安。
    plausibleMin: 0,
    plausibleMax: 25,
    targetFrom: 'facility',
    lowerBoundMatters: true,
    // **高すぎは咎めない** —— 曝気が効いているだけで、害にならない。
    upperBoundMatters: false,
  },
  waterLevelPct: {
    label: '養液タンク液位',
    unit: '%',
    digits: 0,
    plausibleMin: 0,
    plausibleMax: 100,
    targetFrom: 'facility',
    lowerBoundMatters: true,
    // 満水は問題ない。
    upperBoundMatters: false,
  },
};

// --- 2. 栽培室の目標域 ----------------------------------------------------

/**
 * 栽培室ごとの目標域。**画面の入力欄に直接在る値**なので `parameters.ts` には
 * 載せない (台帳の規則)。ここの既定値は入力欄の初期値である。
 */
export interface EnvironmentTargets {
  readonly waterTempLowC: number;
  readonly waterTempHighC: number;
  readonly airTempLowC: number;
  readonly airTempHighC: number;
  readonly humidityLowPct: number;
  readonly humidityHighPct: number;
  readonly co2LowPpm: number;
  readonly co2HighPpm: number;
  readonly dissolvedOxygenLowMgL: number;
  readonly waterLevelLowPct: number;
}

/**
 * 目標域の初期値。**すべて `'reference'` (実務で広く使われる幅を置いた目安) で、
 * この環境から出典に当たって検証した値ではない。**
 *
 * `hydroponics.ts` の品目表が「リーフレタスだけが出典で裏付けた値。他の 4 品目は
 * 相対で置いた目安」と書いているのと同じ姿勢である。**自分の実測が取れたら
 * 置き換えること** —— 品目・季節・光量で適正域は動く。
 *
 * 幅の置き方 (葉物の人工光型を前提):
 * - 養液温度 18〜22℃: 高いと根圏の溶存酸素が落ち、低いと吸水が鈍る。
 * - 室温 18〜25℃: 葉物の生育適温帯。
 * - 相対湿度 60〜80%: 低いと蒸散が過剰、高いと病害と葉先枯れ。
 * - CO₂ 400〜1,500 ppm: 外気が約 420 ppm。施用するなら 800〜1,200 ppm を狙う。
 *   上限を 1,500 にしてあるのは**施用の行き過ぎを咎める**ため。
 * - 溶存酸素 5 mg/L 以上: 下限だけが効く (`upperBoundMatters: false`)。
 * - 液位 60% 以上: 補水の合図。満水は問題ない。
 */
export const DEFAULT_ENVIRONMENT_TARGETS: EnvironmentTargets = {
  waterTempLowC: 18,
  waterTempHighC: 22,
  airTempLowC: 18,
  airTempHighC: 25,
  humidityLowPct: 60,
  humidityHighPct: 80,
  co2LowPpm: 400,
  co2HighPpm: 1_500,
  dissolvedOxygenLowMgL: 5,
  waterLevelLowPct: 60,
};

/** 目標域の根拠の強さ。**項目ごとに持つ** (画面が印を出せるように)。 */
export const TARGET_BASIS: Readonly<Record<ReadingField, TargetBasis>> = {
  // EC / pH は品目の編集欄から来る。参考値の 5 品目のうち出典で裏付けたのは
  // リーフレタスだけ (`HYDROPONIC_CROPS` の注記)。利用者が入れた品目は利用者の値。
  ec: 'reference',
  ph: 'reference',
  waterTempC: 'reference',
  airTempC: 'reference',
  humidityPct: 'reference',
  co2Ppm: 'reference',
  dissolvedOxygenMgL: 'reference',
  waterLevelPct: 'reference',
};

// --- 3. 1 回の測定 --------------------------------------------------------

/** 測定 1 回分。**測っていない項目は `null`** (欄が無いのと同じ扱い)。 */
export interface HydroponicReading {
  /** 測定日 `YYYY-MM-DD`。 */
  readonly at: string;
  /** 項目 → 値。`null` = 測っていない。 */
  readonly values: Readonly<Partial<Record<ReadingField, number | null>>>;
  /** どのロットの養液か (タンクが 1 つなら null)。 */
  readonly batchId: string | null;
  readonly note: string;
}

/**
 * 保存値から測定 1 件を読む。**読めない日付は `null`** (記録として使えない)。
 *
 * 値そのものは**ここでは弾かない** —— 「入っていたが読めない」ことを
 * `assessReading` が `'unreadable'` として言えるように、生の値を通す。
 * ここで捨てると「測っていない」と区別が付かなくなる (規律 2)。
 */
export function readingFromStored(v: unknown): HydroponicReading | null {
  if (typeof v !== 'object' || v === null) return null;
  const r = v as Record<string, unknown>;
  if (!isCalendarDate(r.at)) return null;
  const raw = typeof r.values === 'object' && r.values !== null ? (r.values as Record<string, unknown>) : {};
  const values: Partial<Record<ReadingField, number | null>> = {};
  for (const f of READING_FIELDS) {
    const x = raw[f];
    if (x === undefined || x === null) {
      values[f] = null;
      continue;
    }
    // 数でない物・NaN・±Infinity は「読めない値が入っていた」——
    // NaN にして下流へ伝える (`null` にすると「測っていない」に化ける)。
    // `Number.isFinite` を使うのは形の判定の規律 (パス 98) —— `typeof` だけでは
    // 既に NaN だった値を「数値」として通してしまう。
    values[f] = Number.isFinite(x) ? (x as number) : Number.NaN;
  }
  return {
    at: r.at,
    values,
    batchId: typeof r.batchId === 'string' && r.batchId !== '' ? r.batchId : null,
    note: typeof r.note === 'string' ? r.note : '',
  };
}

// --- 4. 判定 --------------------------------------------------------------

export type FieldStatus = 'ok' | 'low' | 'high' | 'unmeasured' | 'unreadable';

export interface FieldAssessment {
  readonly field: ReadingField;
  readonly status: FieldStatus;
  /** 読めた値だけ。`'unmeasured'` / `'unreadable'` は `null` (刷らない)。 */
  readonly value: number | null;
  /** 目標域。片側だけ効く項目は反対側が `null`。 */
  readonly targetLow: number | null;
  readonly targetHigh: number | null;
}

export interface ReadingAssessment {
  readonly at: string;
  readonly fields: readonly FieldAssessment[];
  readonly measured: number;
  readonly outOfRange: number;
  readonly unmeasured: number;
  readonly unreadable: number;
  /**
   * **全項目を測ったうえで、全部が範囲内**のときだけ true。
   * 未測定が 1 つでもあれば false —— 測っていない物を「正常」と言わない。
   */
  readonly allOk: boolean;
}

/** 品目と栽培室の目標域から、1 項目の目標域を引く。 */
export function targetFor(
  field: ReadingField,
  crop: HydroponicCrop,
  targets: EnvironmentTargets,
): { low: number | null; high: number | null } {
  switch (field) {
    case 'ec':
      return { low: crop.ecLow, high: crop.ecHigh };
    case 'ph':
      return { low: crop.phLow, high: crop.phHigh };
    case 'waterTempC':
      return { low: targets.waterTempLowC, high: targets.waterTempHighC };
    case 'airTempC':
      return { low: targets.airTempLowC, high: targets.airTempHighC };
    case 'humidityPct':
      return { low: targets.humidityLowPct, high: targets.humidityHighPct };
    case 'co2Ppm':
      return { low: targets.co2LowPpm, high: targets.co2HighPpm };
    case 'dissolvedOxygenMgL':
      // 上限は無い (`upperBoundMatters: false`) —— 曝気が効いているだけで害にならない。
      return { low: targets.dissolvedOxygenLowMgL, high: null };
    case 'waterLevelPct':
      return { low: targets.waterLevelLowPct, high: null };
    // Stryker disable next-line all: 網羅性チェック用の到達不能 default
    // (型で全項目を処理済み。新項目追加時に never 代入で型エラーになる安全網)。
    default: {
      const _exhaustive: never = field;
      return _exhaustive;
    }
  }
}

/** 1 項目を判定する。 */
export function assessField(
  field: ReadingField,
  raw: number | null | undefined,
  crop: HydroponicCrop,
  targets: EnvironmentTargets,
): FieldAssessment {
  const spec = READING_FIELD_SPECS[field];
  const t = targetFor(field, crop, targets);
  const low = spec.lowerBoundMatters ? t.low : null;
  const high = spec.upperBoundMatters ? t.high : null;
  const base = { field, targetLow: low, targetHigh: high } as const;

  if (raw === null || raw === undefined) return { ...base, status: 'unmeasured', value: null };
  // 妥当範囲の外・NaN・±Infinity は「読めない」。**値は刷らない。**
  if (!Number.isFinite(raw) || raw < spec.plausibleMin || raw > spec.plausibleMax) {
    return { ...base, status: 'unreadable', value: null };
  }
  if (low !== null && raw < low) return { ...base, status: 'low', value: raw };
  if (high !== null && raw > high) return { ...base, status: 'high', value: raw };
  return { ...base, status: 'ok', value: raw };
}

/** 測定 1 回を全項目まとめて判定する。 */
export function assessReading(
  reading: HydroponicReading,
  crop: HydroponicCrop,
  targets: EnvironmentTargets,
): ReadingAssessment {
  const fields = READING_FIELDS.map((f) => assessField(f, reading.values[f], crop, targets));
  const count = (s: FieldStatus): number => fields.filter((x) => x.status === s).length;
  const unmeasured = count('unmeasured');
  const unreadable = count('unreadable');
  const outOfRange = count('low') + count('high');
  return {
    at: reading.at,
    fields,
    measured: fields.length - unmeasured - unreadable,
    outOfRange,
    unmeasured,
    unreadable,
    allOk: unmeasured === 0 && unreadable === 0 && outOfRange === 0,
  };
}

// --- 5. 調製 (何を、どれだけ入れるか) -------------------------------------

/**
 * 調製の答え。**算定できないときは量を出さず、何が足りないかと手順を返す**
 * (規律 3)。推定値で「この量を入れてください」と言うのは養液を壊す指示になる。
 */
export type DoseAdvice =
  /** 範囲内・何もしない。 */
  | { readonly kind: 'none'; readonly why: string }
  /** 原液を足す。 */
  | { readonly kind: 'add-stock'; readonly ml: number; readonly targetEc: number; readonly why: string }
  /** 水で薄める。 */
  | { readonly kind: 'dilute'; readonly liters: number; readonly targetEc: number; readonly why: string }
  /** 酸・アルカリを足す当量。 */
  | { readonly kind: 'add-acid'; readonly ml: number; readonly why: string }
  /** 水を足す (補水)。 */
  | { readonly kind: 'top-up'; readonly liters: number; readonly why: string }
  /** 量を出せない。**足りない物の名前と、埋め方を返す。** */
  | { readonly kind: 'cannot'; readonly missing: readonly string[]; readonly how: string };

/** 調製に必要な設備の値。 */
export interface DosingSetup {
  /** 養液タンクの容量 (L)。 */
  readonly tankLiters: number | null;
  /**
   * 原液 1 mL を水 1 L に入れたときの EC 上昇 (mS/cm)。**製品ごとに違うので
   * 実測して入れる値** —— 無ければ量を出さない。
   */
  readonly stockEcRisePerMlPerL: number | null;
  /** 原水のアルカリ度 (mg-CaCO₃/L)。無ければ酸の量を出さない。 */
  readonly alkalinityMgCaCO3PerL: number | null;
  /** 使う酸の規定度 (N = mol H⁺/L)。例: 1 規定なら 1。 */
  readonly acidNormality: number | null;
  /** 中和後に残すアルカリ度 (mg-CaCO₃/L)。全部抜くと pH が振れやすい。 */
  readonly residualAlkalinityMgCaCO3PerL: number;
}

export const DEFAULT_DOSING_SETUP: DosingSetup = {
  tankLiters: null,
  stockEcRisePerMlPerL: null,
  alkalinityMgCaCO3PerL: null,
  acidNormality: null,
  // 30 mg/L 程度を残すのが実務の目安 (これも `'reference'`)。
  residualAlkalinityMgCaCO3PerL: 30,
};

/** アルカリ度 1 当量 (meq) に相当する CaCO₃ の質量 (mg)。CaCO₃ 100.09 / 2。 */
export const MG_CACO3_PER_MEQ = 50.04;

/** 目標 EC = 品目の適正域の中央。**どこを狙うかを 1 か所で決める。** */
export function targetEcFor(crop: HydroponicCrop): number {
  return (crop.ecLow + crop.ecHigh) / 2;
}

/**
 * EC の調製量。
 *
 * - 低い → 原液 mL = (目標 EC − 現在 EC) ÷ 上昇率 × タンク容量
 * - 高い → 足す水 L = タンク容量 × (現在 EC ÷ 目標 EC − 1)
 *   (薄めても溶けている量は変わらないので、EC は体積に反比例する)
 * - 上昇率 / タンク容量が無ければ **量を出さない**。
 */
export function ecDose(
  ec: number | null,
  crop: HydroponicCrop,
  setup: DosingSetup,
): DoseAdvice {
  const spec = READING_FIELD_SPECS.ec;
  if (ec === null || !Number.isFinite(ec) || ec < spec.plausibleMin || ec > spec.plausibleMax) {
    return {
      kind: 'cannot',
      missing: ['読める EC の測定値'],
      how: 'EC を測って記録してください (測定器の校正も確認)。',
    };
  }
  const target = targetEcFor(crop);
  if (ec >= crop.ecLow && ec <= crop.ecHigh) {
    return { kind: 'none', why: `EC ${ec} は適正域 ${crop.ecLow}〜${crop.ecHigh} mS/cm の中です。` };
  }
  const tank = setup.tankLiters;
  if (tank === null || !Number.isFinite(tank) || tank <= 0) {
    return {
      kind: 'cannot',
      missing: ['養液タンクの容量 (L)'],
      how: 'タンクの容量を設定に入れてください。容量が分からないと足す量が決まりません。',
    };
  }
  if (ec < crop.ecLow) {
    const rise = setup.stockEcRisePerMlPerL;
    if (rise === null || !Number.isFinite(rise) || rise <= 0) {
      return {
        kind: 'cannot',
        missing: ['原液の EC 上昇率 (mS/cm per mL/L)'],
        how: '水 1 L に原液を 1 mL 入れて EC の上がり幅を測り、設定に入れてください (製品ごとに違います)。',
      };
    }
    const ml = ((target - ec) / rise) * tank;
    return {
      kind: 'add-stock',
      ml,
      targetEc: target,
      why: `EC ${ec} は下限 ${crop.ecLow} を下回っています。中央の ${round(target, 2)} mS/cm を狙います。`,
    };
  }
  // 高い → 薄める。目標が 0 なら割れないが、目標は適正域の中央で下限 > 0 が
  // 前提 (EC 0 を適正とする品目は無い)。念のため守る。
  if (target <= 0) {
    return {
      kind: 'cannot',
      missing: ['0 より大きい EC 適正域'],
      how: '品目の EC 下限・上限を見直してください (適正域の中央が 0 では薄める量が決まりません)。',
    };
  }
  const liters = tank * (ec / target - 1);
  return {
    kind: 'dilute',
    liters,
    targetEc: target,
    why: `EC ${ec} は上限 ${crop.ecHigh} を超えています。中央の ${round(target, 2)} mS/cm まで薄めます。`,
  };
}

/**
 * **アルカリ度を中和する酸の量。**
 *
 * 「pH を 6.0 にする酸の量」ではない —— それは緩衝曲線で決まり、水量からは
 * 決まらない (規律 4)。ここが出すのは**化学量論で決まる当量**である:
 *
 * ```
 *   抜くアルカリ度 (mg/L) = 原水のアルカリ度 − 残すアルカリ度
 *   必要な H⁺ (meq)      = 抜くアルカリ度 ÷ 50.04 × タンク容量
 *   酸の量 (mL)          = 必要な H⁺ (meq) ÷ 規定度 (meq/mL)
 *                          ※ 1 N = 1 meq/mL
 * ```
 */
export function acidToNeutralizeAlkalinity(setup: DosingSetup): DoseAdvice {
  const missing: string[] = [];
  const tank = setup.tankLiters;
  const alk = setup.alkalinityMgCaCO3PerL;
  const n = setup.acidNormality;
  if (tank === null || !Number.isFinite(tank) || tank <= 0) missing.push('養液タンクの容量 (L)');
  if (alk === null || !Number.isFinite(alk) || alk < 0) missing.push('原水のアルカリ度 (mg-CaCO₃/L)');
  if (n === null || !Number.isFinite(n) || n <= 0) missing.push('使う酸の規定度 (N)');
  if (missing.length > 0) {
    return {
      kind: 'cannot',
      missing,
      how: 'アルカリ度は水質検査か簡易試薬で測れます。埋まるまでは、酸を少量ずつ加えて撹拌し、pH を測り直してください。',
    };
  }
  const remove = alk! - setup.residualAlkalinityMgCaCO3PerL;
  if (remove <= 0) {
    return {
      kind: 'none',
      why: `アルカリ度 ${alk!} mg/L は残す量 ${setup.residualAlkalinityMgCaCO3PerL} mg/L 以下です。中和する分がありません。`,
    };
  }
  const meq = (remove / MG_CACO3_PER_MEQ) * tank!;
  return {
    kind: 'add-acid',
    ml: meq / n!,
    why: `アルカリ度を ${alk!} → ${setup.residualAlkalinityMgCaCO3PerL} mg-CaCO₃/L にする当量です。**目標 pH までの量ではありません** —— 少量ずつ加えて pH を測り直してください。`,
  };
}

/** 補水の量。液位が読めなければ量を出さない。 */
export function topUpLiters(levelPct: number | null, setup: DosingSetup): DoseAdvice {
  const spec = READING_FIELD_SPECS.waterLevelPct;
  const tank = setup.tankLiters;
  const missing: string[] = [];
  if (
    levelPct === null ||
    !Number.isFinite(levelPct) ||
    levelPct < spec.plausibleMin ||
    levelPct > spec.plausibleMax
  ) {
    missing.push('読める液位 (%)');
  }
  if (tank === null || !Number.isFinite(tank) || tank <= 0) missing.push('養液タンクの容量 (L)');
  if (missing.length > 0) {
    return { kind: 'cannot', missing, how: '液位とタンク容量を入れてください。' };
  }
  if (levelPct! >= 100) return { kind: 'none', why: '満水です。' };
  return {
    kind: 'top-up',
    liters: (tank! * (100 - levelPct!)) / 100,
    why: `液位 ${levelPct!}% を満水まで戻す量です (原液も同じ比で足すこと —— 水だけ足すと EC が下がります)。`,
  };
}

// --- 6. 工程の日程 --------------------------------------------------------

/** 栽培ロットの状態。 */
export type BatchState = 'nursery' | 'growing' | 'harvested' | 'discarded';

export const BATCH_STATE_LABELS: Readonly<Record<BatchState, string>> = {
  nursery: '育苗中',
  growing: '定植済み',
  harvested: '収穫済み',
  discarded: '廃棄',
};

export function isBatchState(v: unknown): v is BatchState {
  return v === 'nursery' || v === 'growing' || v === 'harvested' || v === 'discarded';
}

/** 栽培ロット 1 つ。 */
export interface CultivationBatch {
  readonly id: string;
  readonly cropId: HydroponicCropId;
  /** 播種日 `YYYY-MM-DD`。 */
  readonly sowDate: string;
  /** パネル枚数。 */
  readonly panels: number;
  readonly state: BatchState;
  /** 実際に定植した日 (まだなら null)。 */
  readonly transplantedDate: string | null;
  /** 実際に収穫した日 (まだなら null)。 */
  readonly harvestedDate: string | null;
  /** 最後に養液を交換した日 (一度も交換していなければ null)。 */
  readonly solutionChangedDate: string | null;
  readonly note: string;
}

/** 保存値からロット 1 件を読む。**日付が読めない控えは記録として使えないので `null`。** */
export function batchFromStored(v: unknown): CultivationBatch | null {
  if (typeof v !== 'object' || v === null) return null;
  const r = v as Record<string, unknown>;
  if (typeof r.id !== 'string' || r.id === '') return null;
  if (!isCalendarDate(r.sowDate)) return null;
  if (typeof r.cropId !== 'string' || r.cropId === '') return null;
  const panels = typeof r.panels === 'number' && Number.isFinite(r.panels) && r.panels > 0 ? r.panels : 0;
  const day = (x: unknown): string | null => (isCalendarDate(x) ? x : null);
  return {
    id: r.id,
    cropId: r.cropId,
    sowDate: r.sowDate,
    panels,
    state: isBatchState(r.state) ? r.state : 'nursery',
    transplantedDate: day(r.transplantedDate),
    harvestedDate: day(r.harvestedDate),
    solutionChangedDate: day(r.solutionChangedDate),
    note: typeof r.note === 'string' ? r.note : '',
  };
}

export interface BatchSchedule {
  readonly sowDate: string;
  /** 定植予定日 = 播種 + 育苗日数。 */
  readonly transplantDue: string;
  /**
   * 収穫予定日。**実際の定植日が在ればそこから数える** —— 予定どおりに
   * 定植できなかったロットの収穫日を、予定のままにしておくと嘘になる。
   */
  readonly harvestDue: string;
  /** 収穫日をどこから数えたか (画面が「実績起算」と言えるように)。 */
  readonly harvestCountedFrom: 'planned-transplant' | 'actual-transplant';
  readonly nurseryDays: number;
  readonly growOutDays: number;
}

/** ロットの工程。日付か日数が読めなければ `null`。 */
export function batchSchedule(batch: CultivationBatch, crop: HydroponicCrop): BatchSchedule | null {
  const { nurseryDays, growOutDays } = crop;
  if (!Number.isInteger(nurseryDays) || nurseryDays < 0) return null;
  if (!Number.isInteger(growOutDays) || growOutDays < 1) return null;
  const transplantDue = addIsoDays(batch.sowDate, nurseryDays);
  if (transplantDue === null) return null;
  const from = batch.transplantedDate ?? transplantDue;
  const harvestDue = addIsoDays(from, growOutDays);
  if (harvestDue === null) return null;
  return {
    sowDate: batch.sowDate,
    transplantDue,
    harvestDue,
    harvestCountedFrom: batch.transplantedDate === null ? 'planned-transplant' : 'actual-transplant',
    nurseryDays,
    growOutDays,
  };
}

/**
 * 次の養液交換日。一度も交換していなければ**播種日から**数える
 * (0 に倒さず、「起点が無い」を「今日やる」に化けさせない)。
 */
export function nextSolutionChange(batch: CultivationBatch, intervalDays: number): string | null {
  if (!Number.isInteger(intervalDays) || intervalDays < 1) return null;
  return addIsoDays(batch.solutionChangedDate ?? batch.sowDate, intervalDays);
}

/**
 * 低カリウム栽培で K 抜き培養液へ切り替える日 = 収穫予定日 − 切替日数。
 *
 * 既に在る `assessLowPotassium` は切替日数が適正域 (7〜10 日) かを見るだけで、
 * **いつ切り替えるかは誰も出していなかった** (パス 67 が範囲判定だけを直した)。
 */
export function lowPotassiumSwitchDate(schedule: BatchSchedule, switchDays: number): string | null {
  if (!Number.isInteger(switchDays) || switchDays < 0) return null;
  return addIsoDays(schedule.harvestDue, -switchDays);
}

// --- 7. 今日やること ------------------------------------------------------

export type TaskSeverity = 'info' | 'warn' | 'alert';

export interface ControlTask {
  readonly id: string;
  readonly label: string;
  /** なぜ出ているか (画面がそのまま刷る)。 */
  readonly why: string;
  readonly severity: TaskSeverity;
  /** 期限 `YYYY-MM-DD`。期限の無い作業は null。 */
  readonly dueDate: string | null;
  /** 期限からの遅れ (日)。未到来は負、期限が無ければ null。 */
  readonly overdueDays: number | null;
  readonly batchId: string | null;
  /** 調製の答え (調整の作業だけ持つ)。 */
  readonly dose: DoseAdvice | null;
}

/** 運転管理の設定。 */
export interface ControlSettings {
  /** 養液交換の周期 (日)。既定 14 は `'reference'`。 */
  readonly solutionChangeIntervalDays: number;
  /** 測定が何日途絶えたら「管理できていない」と言うか。 */
  readonly readingStaleDays: number;
  /** 収穫予定日の何日前から知らせるか。 */
  readonly harvestNoticeDays: number;
  /** 低カリウム栽培か。 */
  readonly lowPotassium: boolean;
  /** K 抜きへ切り替えるのは収穫前の何日か。 */
  readonly lowPotassiumSwitchDays: number | null;
}

export const DEFAULT_CONTROL_SETTINGS: ControlSettings = {
  solutionChangeIntervalDays: 14,
  readingStaleDays: 3,
  harvestNoticeDays: 3,
  lowPotassium: false,
  lowPotassiumSwitchDays: null,
};

export interface ControlInput {
  /** 今日 `YYYY-MM-DD`。**呼ぶ側が渡す** (純粋関数に時計を持ち込まない)。 */
  readonly today: string;
  readonly crops: readonly HydroponicCrop[];
  readonly batches: readonly CultivationBatch[];
  /** 測定の記録 (順序は問わない)。 */
  readonly readings: readonly HydroponicReading[];
  readonly targets: EnvironmentTargets;
  readonly dosing: DosingSetup;
  readonly settings: ControlSettings;
}

/** 期限と今日から、遅れ日数と重さを決める。 */
function overdue(today: string, due: string | null): { days: number | null; late: boolean } {
  if (due === null) return { days: null, late: false };
  const d = isoDaysBetween(due, today);
  return { days: d, late: d !== null && d >= 0 };
}

/** 直近の測定 (日付が新しい順の先頭)。同じ日が複数あれば配列の後ろを採る。 */
export function latestReading(readings: readonly HydroponicReading[]): HydroponicReading | null {
  let best: HydroponicReading | null = null;
  for (const r of readings) {
    if (parseIsoDate(r.at)?.day == null) continue;
    if (best === null || r.at >= best.at) best = r;
  }
  return best;
}

function round(n: number, digits: number): number {
  const p = 10 ** digits;
  return Math.round(n * p) / p;
}

/**
 * **今日やること。** 測定・工程・養液交換をまとめて 1 本のリストにする。
 *
 * 重さの決め方:
 * - `alert` … 今日すでに害が出ている / 出荷物に影響する (範囲外・収穫遅れ・記録の途絶)
 * - `warn`  … 今日やるべき (定植・養液交換・今日の測定がまだ)
 * - `info`  … 近づいている / 測っていない項目が在る
 *
 * **測っていない項目は `info` で必ず出す** —— 「測っていないこと」が画面から
 * 消えると、緑の画面が「全部正常」に見える (規律 1)。
 */
export function dailyTasks(input: ControlInput): readonly ControlTask[] {
  const tasks: ControlTask[] = [];
  const { today, settings } = input;
  if (parseIsoDate(today)?.day == null) return tasks;

  // --- 測定 --------------------------------------------------------------
  const latest = latestReading(input.readings);
  if (latest === null) {
    tasks.push({
      id: 'reading:none',
      label: '測定を記録する',
      why: '測定の記録がまだ 1 件もありません。EC・pH・温度から始めてください。',
      severity: 'warn',
      dueDate: today,
      overdueDays: 0,
      batchId: null,
      dose: null,
    });
  } else {
    const gap = isoDaysBetween(latest.at, today);
    if (gap !== null && gap >= settings.readingStaleDays) {
      tasks.push({
        id: 'reading:stale',
        label: '測定を記録する (記録が途絶えています)',
        why: `最後の測定は ${latest.at} で、${gap} 日空いています。この間の養液の状態は分かりません。`,
        severity: 'alert',
        dueDate: today,
        overdueDays: gap,
        batchId: null,
        dose: null,
      });
    } else if (gap !== null && gap >= 1) {
      tasks.push({
        id: 'reading:today',
        label: '今日の測定を記録する',
        why: `最後の測定は ${latest.at} (${gap} 日前) です。`,
        severity: 'warn',
        dueDate: today,
        overdueDays: gap,
        batchId: null,
        dose: null,
      });
    }
  }

  // --- 直近の測定の判定 → 調製 -------------------------------------------
  if (latest !== null) {
    const crop = cropForBatchId(input, latest.batchId);
    const assessment = assessReading(latest, crop, input.targets);
    for (const f of assessment.fields) {
      const spec = READING_FIELD_SPECS[f.field];
      if (f.status === 'ok') continue;
      if (f.status === 'unmeasured') {
        tasks.push({
          id: `measure:${f.field}`,
          label: `${spec.label}を測る`,
          why: `${latest.at} の記録に ${spec.label}が入っていません (未測定です — 正常とは限りません)。`,
          severity: 'info',
          dueDate: null,
          overdueDays: null,
          batchId: latest.batchId,
          dose: null,
        });
        continue;
      }
      if (f.status === 'unreadable') {
        tasks.push({
          id: `reread:${f.field}`,
          label: `${spec.label}を測り直す`,
          why: `${latest.at} の ${spec.label}が読めません (妥当な範囲 ${spec.plausibleMin}〜${spec.plausibleMax}${spec.unit} の外か、数値でない値です)。測定器の校正と入力を確認してください。`,
          severity: 'warn',
          dueDate: null,
          overdueDays: null,
          batchId: latest.batchId,
          dose: null,
        });
        continue;
      }
      // low / high
      const dose = doseFor(f, crop, input.dosing);
      const bound = f.status === 'low' ? f.targetLow : f.targetHigh;
      tasks.push({
        id: `adjust:${f.field}`,
        label: `${spec.label}を${f.status === 'low' ? '上げる' : '下げる'}`,
        why: `${spec.label} ${round(f.value ?? 0, spec.digits)}${spec.unit} は目標${f.status === 'low' ? '下限' : '上限'} ${String(bound)}${spec.unit} の外です。`,
        severity: 'alert',
        dueDate: today,
        overdueDays: 0,
        batchId: latest.batchId,
        dose,
      });
    }
  }

  // --- ロットごとの工程 ---------------------------------------------------
  for (const b of input.batches) {
    if (b.state === 'harvested' || b.state === 'discarded') continue;
    const crop = findCrop(input.crops, b.cropId);
    if (crop === undefined) {
      tasks.push({
        id: `batch:${b.id}:crop-missing`,
        label: 'ロットの品目が見つかりません',
        why: `ロット ${b.id} の品目 "${b.cropId}" が一覧にありません (消された品目です)。品目を戻すか、ロットの品目を選び直してください。`,
        severity: 'warn',
        dueDate: null,
        overdueDays: null,
        batchId: b.id,
        dose: null,
      });
      continue;
    }
    const sched = batchSchedule(b, crop);
    if (sched === null) {
      tasks.push({
        id: `batch:${b.id}:schedule-unreadable`,
        label: 'ロットの日程が計算できません',
        why: `ロット ${b.id} の播種日か品目の日数が読めません。`,
        severity: 'warn',
        dueDate: null,
        overdueDays: null,
        batchId: b.id,
        dose: null,
      });
      continue;
    }

    if (b.state === 'nursery') {
      const o = overdue(today, sched.transplantDue);
      if (o.late) {
        tasks.push({
          id: `batch:${b.id}:transplant`,
          label: '定植する',
          why: `育苗 ${sched.nurseryDays} 日が過ぎています (定植予定 ${sched.transplantDue})。`,
          severity: o.days !== null && o.days > 0 ? 'alert' : 'warn',
          dueDate: sched.transplantDue,
          overdueDays: o.days,
          batchId: b.id,
          dose: null,
        });
      }
    }

    if (b.state === 'growing') {
      const o = overdue(today, sched.harvestDue);
      if (o.late) {
        tasks.push({
          id: `batch:${b.id}:harvest`,
          label: '収穫する',
          why: `収穫予定 ${sched.harvestDue} を過ぎています。遅れると品質が落ちます。`,
          severity: 'alert',
          dueDate: sched.harvestDue,
          overdueDays: o.days,
          batchId: b.id,
          dose: null,
        });
      } else if (o.days !== null && -o.days <= settings.harvestNoticeDays) {
        tasks.push({
          id: `batch:${b.id}:harvest-soon`,
          label: '収穫が近い',
          why: `収穫予定は ${sched.harvestDue} (あと ${-o.days} 日)。出荷先と人手を確かめてください。`,
          severity: 'info',
          dueDate: sched.harvestDue,
          overdueDays: o.days,
          batchId: b.id,
          dose: null,
        });
      }

      // 低カリウム栽培の切替日。
      if (settings.lowPotassium && settings.lowPotassiumSwitchDays !== null) {
        const due = lowPotassiumSwitchDate(sched, settings.lowPotassiumSwitchDays);
        const s = overdue(today, due);
        if (due !== null && s.late) {
          tasks.push({
            id: `batch:${b.id}:low-k-switch`,
            label: 'K 抜き培養液へ切り替える',
            why: `収穫 ${settings.lowPotassiumSwitchDays} 日前 (${due}) を過ぎています。切替が遅れると出荷ロットのカリウムが下がりません。**「低カリウム」と名乗るには出荷ロットの実測が必要です。**`,
            severity: 'alert',
            dueDate: due,
            overdueDays: s.days,
            batchId: b.id,
            dose: null,
          });
        }
      }
    }

    // 養液交換。
    const change = nextSolutionChange(b, settings.solutionChangeIntervalDays);
    const c = overdue(today, change);
    if (change !== null && c.late) {
      tasks.push({
        id: `batch:${b.id}:solution-change`,
        label: '養液を交換する',
        why:
          b.solutionChangedDate === null
            ? `播種 ${b.sowDate} から ${settings.solutionChangeIntervalDays} 日が過ぎています (交換の記録がまだありません)。`
            : `前回の交換 ${b.solutionChangedDate} から ${settings.solutionChangeIntervalDays} 日が過ぎています。`,
        severity: 'warn',
        dueDate: change,
        overdueDays: c.days,
        batchId: b.id,
        dose: null,
      });
    }
  }

  return tasks;
}

/** 測定に紐づくロットの品目 (紐づいていなければ一覧の先頭)。 */
function cropForBatchId(input: ControlInput, batchId: string | null): HydroponicCrop {
  const batch = batchId === null ? undefined : input.batches.find((b) => b.id === batchId);
  const byBatch = batch === undefined ? undefined : findCrop(input.crops, batch.cropId);
  // 一覧は空にならない (`cropListOrDefault` が参考値を返す)。それでも型を守る。
  return byBatch ?? input.crops[0]!;
}

/** 範囲外の項目に対する調製の答え。 */
export function doseFor(
  f: FieldAssessment,
  crop: HydroponicCrop,
  dosing: DosingSetup,
): DoseAdvice | null {
  switch (f.field) {
    case 'ec':
      return ecDose(f.value, crop, dosing);
    case 'ph':
      // **量は出さない** (規律 4)。出すのはアルカリ度の中和当量と手順。
      return acidToNeutralizeAlkalinity(dosing);
    case 'waterLevelPct':
      return topUpLiters(f.value, dosing);
    default:
      // 温度・湿度・CO₂・溶存酸素は「入れる量」では直らない (空調・曝気の操作)。
      return null;
  }
}

/**
 * 作業リストの要約。**「やることが無い」と「まだ何も測っていない」を分ける。**
 */
export interface ControlSummary {
  readonly total: number;
  readonly alerts: number;
  readonly warns: number;
  readonly infos: number;
  /** 測定の記録が 1 件も無い。 */
  readonly noReadings: boolean;
  /** 直近の測定が全項目 ok (未測定ゼロ)。 */
  readonly allOk: boolean;
}

export function summarize(input: ControlInput): ControlSummary {
  const tasks = dailyTasks(input);
  const latest = latestReading(input.readings);
  const count = (s: TaskSeverity): number => tasks.filter((t) => t.severity === s).length;
  const allOk =
    latest !== null &&
    assessReading(latest, cropForBatchId(input, latest.batchId), input.targets).allOk;
  return {
    total: tasks.length,
    alerts: count('alert'),
    warns: count('warn'),
    infos: count('info'),
    noReadings: latest === null,
    allOk,
  };
}

// --- 8. 台帳の引き渡し (両ビルドが同じ関数を通る) ---------------------
//
// **画面が「何を測るか」を出すための台帳を 1 か所で組む。**
//
// デスクトップ版は `main/clients/hydroponics.ts` がこれを呼び、ブラウザ版は
// `web-shim.ts` の `fetchSnapshot` が同じ関数を呼ぶ。**片方だけに置くと
// ブラウザ版で台帳が空になる** —— それがパス 118 の「口はあるが繋がっていない」
// で、e2e で実測して見つけた (台帳が 0 行だった)。

export interface HydroponicsFieldInfo {
  readonly field: ReadingField;
  readonly label: string;
  readonly unit: string;
  readonly digits: number;
  readonly plausibleMin: number;
  readonly plausibleMax: number;
  /** 目標域の出所 ('crop' = 品目ごと / 'facility' = 栽培室ごと)。 */
  readonly targetFrom: TargetSource;
  /** 根拠の強さ ('sourced' / 'reference')。 */
  readonly basis: TargetBasis;
  readonly lowerBoundMatters: boolean;
  readonly upperBoundMatters: boolean;
}

export interface HydroponicsSnapshot {
  readonly fields: readonly HydroponicsFieldInfo[];
  readonly targetDefaults: EnvironmentTargets;
  readonly settingDefaults: {
    readonly solutionChangeIntervalDays: number;
    readonly readingStaleDays: number;
    readonly harvestNoticeDays: number;
  };
  readonly crops: readonly {
    readonly id: string;
    readonly label: string;
    readonly nurseryDays: number;
    readonly growOutDays: number;
    readonly ecLow: number;
    readonly ecHigh: number;
    readonly phLow: number;
    readonly phHigh: number;
  }[];
}

/**
 * 台帳を組む。**通信も資格情報も要らない** —— 利用者の測定・ロット・設定は
 * renderer の record store (端末内) に在り、ここには入らない。
 */
export function buildHydroponicsSnapshot(): HydroponicsSnapshot {
  return {
    fields: READING_FIELDS.map((field) => {
      const s = READING_FIELD_SPECS[field];
      return {
        field,
        label: s.label,
        unit: s.unit,
        digits: s.digits,
        plausibleMin: s.plausibleMin,
        plausibleMax: s.plausibleMax,
        targetFrom: s.targetFrom,
        basis: TARGET_BASIS[field],
        lowerBoundMatters: s.lowerBoundMatters,
        upperBoundMatters: s.upperBoundMatters,
      };
    }),
    targetDefaults: { ...DEFAULT_ENVIRONMENT_TARGETS },
    settingDefaults: {
      solutionChangeIntervalDays: DEFAULT_CONTROL_SETTINGS.solutionChangeIntervalDays,
      readingStaleDays: DEFAULT_CONTROL_SETTINGS.readingStaleDays,
      harvestNoticeDays: DEFAULT_CONTROL_SETTINGS.harvestNoticeDays,
    },
    crops: DEFAULT_CROP_LIST.map((c) => ({
      id: c.id,
      label: c.label,
      nurseryDays: c.nurseryDays,
      growOutDays: c.growOutDays,
      ecLow: c.ecLow,
      ecHigh: c.ecHigh,
      phLow: c.phLow,
      phHigh: c.phHigh,
    })),
  };
}
