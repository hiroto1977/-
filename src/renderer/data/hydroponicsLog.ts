/**
 * 水耕栽培の **運転記録の保存** (2026-09-13 · パス 194)。
 *
 * 既に在る `hydroponicsSetup.ts` は**試算の入力** (設備・費用・品目) を 1 レコードで
 * 持つ。こちらは**毎日増える記録**を 2 つの collection に分けて持つ:
 *
 * | collection | 1 レコード | なぜ分けるか |
 * | --- | --- | --- |
 * | `hydroponics-readings` | 測定 1 回 | 日に何度も増える。最新 1 件ではなく履歴として読む |
 * | `hydroponics-batches` | 栽培ロット 1 つ | 数週間生きる。状態が変わる (育苗 → 定植 → 収穫) |
 * | `hydroponics-control` | 運転の設定 1 件 | 目標域・タンク・周期。**最新の 1 件を採用** |
 *
 * **読めない控えは「読めない」として数え、黙って空にしない** (パス 121 / 188 の規律)。
 * `readingFromStored` / `batchFromStored` が `null` を返した件数を持ち帰り、画面が
 * 「N 件は読めませんでした」と言えるようにする。
 */

import { charsOverCeiling, refusedCeilingNote } from '../../shared/inputCeiling';
import { isCalendarDate } from '../../shared/isoDate';
import { MAX_RECORD_NOTE_CHARS } from '../../shared/recordEntryLimits';
import {
  batchFromStored,
  isBatchState,
  readingFromStored,
  READING_FIELDS,
  READING_FIELD_SPECS,
  DEFAULT_CONTROL_SETTINGS,
  DEFAULT_DOSING_SETUP,
  DEFAULT_ENVIRONMENT_TARGETS,
  type ControlSettings,
  type CultivationBatch,
  type DosingSetup,
  type EnvironmentTargets,
  type HydroponicReading,
} from '../../shared/hydroponicsControl';
import { latestRecord } from './latestRecord';

/** 測定の記録。1 レコード = 1 回の測定。 */
export const HYDROPONICS_READINGS_COLLECTION = 'hydroponics-readings';
/** 栽培ロット。1 レコード = 1 ロット。 */
export const HYDROPONICS_BATCHES_COLLECTION = 'hydroponics-batches';
/** 運転の設定。**最新の 1 件を採用** (`hydroponics-setup` と同じ扱い)。 */
export const HYDROPONICS_CONTROL_COLLECTION = 'hydroponics-control';

/** 保存する測定 1 件 (record store の data)。 */
export interface HydroponicReadingRecord extends Record<string, unknown> {
  readonly at: string;
  readonly values: Readonly<Record<string, number | null>>;
  readonly batchId: string | null;
  readonly note: string;
}

/** 保存するロット 1 件。 */
export interface CultivationBatchRecord extends Record<string, unknown> {
  readonly id: string;
  readonly cropId: string;
  readonly sowDate: string;
  readonly panels: number;
  readonly state: string;
  readonly transplantedDate: string | null;
  readonly harvestedDate: string | null;
  readonly solutionChangedDate: string | null;
  readonly note: string;
}

/**
 * 運転の設定を保存する形。**目標域・タンク・周期を 1 つの平らなレコードに畳む**
 * (入れ子にすると `collectionShapes` が欄ごとに見られない)。
 */
export interface HydroponicsControlRecord extends Record<string, unknown> {
  // 栽培室の目標域
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
  // 調製の設備
  readonly tankLiters: number | null;
  readonly stockEcRisePerMlPerL: number | null;
  readonly alkalinityMgCaCO3PerL: number | null;
  readonly acidNormality: number | null;
  readonly residualAlkalinityMgCaCO3PerL: number;
  // 運転
  readonly solutionChangeIntervalDays: number;
  readonly readingStaleDays: number;
  readonly harvestNoticeDays: number;
}

/** 入力欄の初期値。**目標域と調製と運転の既定をここで 1 度だけ組む。** */
export const HYDROPONICS_CONTROL_DEFAULTS: HydroponicsControlRecord = {
  ...DEFAULT_ENVIRONMENT_TARGETS,
  tankLiters: DEFAULT_DOSING_SETUP.tankLiters,
  stockEcRisePerMlPerL: DEFAULT_DOSING_SETUP.stockEcRisePerMlPerL,
  alkalinityMgCaCO3PerL: DEFAULT_DOSING_SETUP.alkalinityMgCaCO3PerL,
  acidNormality: DEFAULT_DOSING_SETUP.acidNormality,
  residualAlkalinityMgCaCO3PerL: DEFAULT_DOSING_SETUP.residualAlkalinityMgCaCO3PerL,
  solutionChangeIntervalDays: DEFAULT_CONTROL_SETTINGS.solutionChangeIntervalDays,
  readingStaleDays: DEFAULT_CONTROL_SETTINGS.readingStaleDays,
  harvestNoticeDays: DEFAULT_CONTROL_SETTINGS.harvestNoticeDays,
};

/**
 * 読み込みの結果。**読めた物と、読めなかった件数の両方を返す** ——
 * 「0 件」と「10 件あったが全部読めなかった」を画面が区別できるように。
 */
export interface LoadedLog<T> {
  readonly items: readonly T[];
  /** 控えは在ったが読めなかった件数。 */
  readonly unreadable: number;
}

type StoredLike = { readonly createdAt: number; readonly data: unknown };

/** 測定の記録を読む。日付の新しい順。 */
export function readingsFromRecords(records: readonly StoredLike[]): LoadedLog<HydroponicReading> {
  const items: HydroponicReading[] = [];
  let unreadable = 0;
  for (const r of records) {
    const v = readingFromStored(r.data);
    if (v === null) {
      unreadable += 1;
      continue;
    }
    items.push(v);
  }
  // 新しい順。同じ日は入力順 (安定ソート) のまま。
  return { items: [...items].sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0)), unreadable };
}

/** ロットを読む。播種日の新しい順。 */
export function batchesFromRecords(records: readonly StoredLike[]): LoadedLog<CultivationBatch> {
  const items: CultivationBatch[] = [];
  let unreadable = 0;
  for (const r of records) {
    const v = batchFromStored(r.data);
    if (v === null) {
      unreadable += 1;
      continue;
    }
    items.push(v);
  }
  return {
    items: [...items].sort((a, b) => (a.sowDate < b.sowDate ? 1 : a.sowDate > b.sowDate ? -1 : 0)),
    unreadable,
  };
}

/** 数値の欄を読む。**読めなければ既定へ倒す** (入力欄の初期値と同じ値)。 */
function numOr(v: unknown, fallback: number): number {
  return Number.isFinite(v) ? (v as number) : fallback;
}

/** 「入っていなければ null」の欄。**0 に倒さない** —— 未入力は量を出さない理由になる。 */
function numOrNull(v: unknown): number | null {
  return Number.isFinite(v) ? (v as number) : null;
}

/**
 * 運転の設定を読む。**最新の 1 件を採用**し、欄ごとに既定へ倒す
 * (`hydroponicsSetup.ts` と同じ扱い)。
 */
export function controlRecordFromRecords(records: readonly StoredLike[]): HydroponicsControlRecord {
  const raw = latestRecord(records)?.data;
  if (typeof raw !== 'object' || raw === null) return HYDROPONICS_CONTROL_DEFAULTS;
  const r = raw as Record<string, unknown>;
  const d = HYDROPONICS_CONTROL_DEFAULTS;
  return {
    waterTempLowC: numOr(r.waterTempLowC, d.waterTempLowC),
    waterTempHighC: numOr(r.waterTempHighC, d.waterTempHighC),
    airTempLowC: numOr(r.airTempLowC, d.airTempLowC),
    airTempHighC: numOr(r.airTempHighC, d.airTempHighC),
    humidityLowPct: numOr(r.humidityLowPct, d.humidityLowPct),
    humidityHighPct: numOr(r.humidityHighPct, d.humidityHighPct),
    co2LowPpm: numOr(r.co2LowPpm, d.co2LowPpm),
    co2HighPpm: numOr(r.co2HighPpm, d.co2HighPpm),
    dissolvedOxygenLowMgL: numOr(r.dissolvedOxygenLowMgL, d.dissolvedOxygenLowMgL),
    waterLevelLowPct: numOr(r.waterLevelLowPct, d.waterLevelLowPct),
    // **設備の 4 欄は null のまま持つ** —— 既定を入れると「量を出せる」に化ける。
    tankLiters: numOrNull(r.tankLiters),
    stockEcRisePerMlPerL: numOrNull(r.stockEcRisePerMlPerL),
    alkalinityMgCaCO3PerL: numOrNull(r.alkalinityMgCaCO3PerL),
    acidNormality: numOrNull(r.acidNormality),
    residualAlkalinityMgCaCO3PerL: numOr(
      r.residualAlkalinityMgCaCO3PerL,
      d.residualAlkalinityMgCaCO3PerL,
    ),
    solutionChangeIntervalDays: numOr(r.solutionChangeIntervalDays, d.solutionChangeIntervalDays),
    readingStaleDays: numOr(r.readingStaleDays, d.readingStaleDays),
    harvestNoticeDays: numOr(r.harvestNoticeDays, d.harvestNoticeDays),
  };
}

/** 保存レコード → 目標域。 */
export function targetsFrom(r: HydroponicsControlRecord): EnvironmentTargets {
  return {
    waterTempLowC: r.waterTempLowC,
    waterTempHighC: r.waterTempHighC,
    airTempLowC: r.airTempLowC,
    airTempHighC: r.airTempHighC,
    humidityLowPct: r.humidityLowPct,
    humidityHighPct: r.humidityHighPct,
    co2LowPpm: r.co2LowPpm,
    co2HighPpm: r.co2HighPpm,
    dissolvedOxygenLowMgL: r.dissolvedOxygenLowMgL,
    waterLevelLowPct: r.waterLevelLowPct,
  };
}

/** 保存レコード → 調製の設備。 */
export function dosingFrom(r: HydroponicsControlRecord): DosingSetup {
  return {
    tankLiters: r.tankLiters,
    stockEcRisePerMlPerL: r.stockEcRisePerMlPerL,
    alkalinityMgCaCO3PerL: r.alkalinityMgCaCO3PerL,
    acidNormality: r.acidNormality,
    residualAlkalinityMgCaCO3PerL: r.residualAlkalinityMgCaCO3PerL,
  };
}

/**
 * 保存レコード + 試算側の設定 → 運転の設定。
 *
 * **低カリウムの 2 欄は `hydroponics-setup` から来る** —— 同じ値を 2 か所に
 * 置かない (試算の「低カリウム栽培として扱うか」と切替日数がそのまま効く)。
 */
export function settingsFrom(
  r: HydroponicsControlRecord,
  lowPotassium: boolean,
  switchDaysBeforeHarvest: number | null,
): ControlSettings {
  return {
    solutionChangeIntervalDays: r.solutionChangeIntervalDays,
    readingStaleDays: r.readingStaleDays,
    harvestNoticeDays: r.harvestNoticeDays,
    lowPotassium,
    lowPotassiumSwitchDays: switchDaysBeforeHarvest,
  };
}

// --- 書く側 (入力 → 保存レコード) ------------------------------------------
//
// 慣習どおり `parseX` は**利用者に見せる文で投げる** (`parseSalesEntry` と同じ)。
//
// **空欄は `null` (未測定) にする。0 に倒さない。** 読めない値 (数でない・範囲外) は
// **黙って落とさず断る** —— 「測っていない」と「間違って入れた」は打ち手が違う。

/** ロット名の天井 (画面の一覧と作業リストに出る名前)。 */
export const MAX_BATCH_ID_CHARS = 40;
/** パネル枚数の天井。桁誤りを止める幅であって、設備の上限ではない。 */
export const MAX_BATCH_PANELS = 100_000;

/** メモの天井。業務メモと同じ値を読む (数を 2 か所に書かない)。 */
export const MAX_HYDROPONICS_NOTE_CHARS = MAX_RECORD_NOTE_CHARS;

/** 空欄か。`''` / 空白だけ / undefined / null。 */
function blank(v: unknown): boolean {
  return v === undefined || v === null || (typeof v === 'string' && v.trim() === '');
}

/** メモを読む。天井を超えたら**切らずに断る**。 */
function parseNote(v: unknown, label: string): string {
  if (blank(v)) return '';
  const s = String(v).trim();
  const over = charsOverCeiling(s, MAX_HYDROPONICS_NOTE_CHARS);
  if (over > 0) throw new Error(refusedCeilingNote(label, s.length, MAX_HYDROPONICS_NOTE_CHARS));
  return s;
}

/**
 * 測定 1 回を読む。
 *
 * - 空欄 → `null` (未測定)
 * - 数でない → 断る
 * - 妥当範囲の外 → 断る (**保存する前に止める** —— 入った後は `'unreadable'` になるが、
 *   入力の時点で気付けるなら止めたほうがよい)
 */
export function parseReading(input: {
  at?: unknown;
  values?: Readonly<Record<string, unknown>>;
  batchId?: unknown;
  note?: unknown;
}): HydroponicReadingRecord {
  if (!isCalendarDate(input.at)) throw new Error('測定日は YYYY-MM-DD 形式の実在する日付で入力してください');
  const raw = input.values ?? {};
  const values: Record<string, number | null> = {};
  let measured = 0;
  for (const f of READING_FIELDS) {
    const spec = READING_FIELD_SPECS[f];
    const v = raw[f];
    if (blank(v)) {
      values[f] = null;
      continue;
    }
    const n = Number(v);
    if (!Number.isFinite(n)) {
      throw new Error(`${spec.label} は数値で入力してください (空欄にすると「未測定」として記録します)`);
    }
    if (n < spec.plausibleMin || n > spec.plausibleMax) {
      throw new Error(
        `${spec.label} は ${spec.plausibleMin}〜${spec.plausibleMax}${spec.unit} の範囲で入力してください (測定器の校正を確認)`,
      );
    }
    values[f] = n;
    measured += 1;
  }
  if (measured === 0) throw new Error('少なくとも 1 項目は測定値を入れてください');
  return {
    at: input.at,
    values,
    batchId: typeof input.batchId === 'string' && input.batchId !== '' ? input.batchId : null,
    note: parseNote(input.note, '測定メモ'),
  };
}

/** ロット 1 件を読む。 */
export function parseBatch(input: {
  id?: unknown;
  cropId?: unknown;
  sowDate?: unknown;
  panels?: unknown;
  state?: unknown;
  transplantedDate?: unknown;
  harvestedDate?: unknown;
  solutionChangedDate?: unknown;
  note?: unknown;
}): CultivationBatchRecord {
  const id = typeof input.id === 'string' ? input.id.trim() : '';
  if (id === '') throw new Error('ロット名を入力してください');
  if (id.length > MAX_BATCH_ID_CHARS) {
    throw new Error(refusedCeilingNote('ロット名', id.length, MAX_BATCH_ID_CHARS));
  }
  if (typeof input.cropId !== 'string' || input.cropId === '') throw new Error('品目を選んでください');
  if (!isCalendarDate(input.sowDate)) throw new Error('播種日は YYYY-MM-DD 形式の実在する日付で入力してください');
  const panels = Number(input.panels);
  if (!Number.isInteger(panels) || panels < 1) throw new Error('パネル枚数は 1 以上の整数で入力してください');
  if (panels > MAX_BATCH_PANELS) throw new Error(`パネル枚数は ${MAX_BATCH_PANELS} 枚までです`);
  if (!isBatchState(input.state)) throw new Error('ロットの状態が不正です');
  /** 未定なら null、在るなら暦に在る日。**読めない綴りは断る** (今日に倒さない)。 */
  const day = (v: unknown, label: string): string | null => {
    if (blank(v)) return null;
    if (!isCalendarDate(v)) throw new Error(`${label}は YYYY-MM-DD 形式の実在する日付で入力してください`);
    return v;
  };
  const transplantedDate = day(input.transplantedDate, '定植日');
  const harvestedDate = day(input.harvestedDate, '収穫日');
  // **日付の前後を確かめる** —— 播種より前に定植・収穫はできない。
  if (transplantedDate !== null && transplantedDate < input.sowDate) {
    throw new Error('定植日が播種日より前になっています');
  }
  if (harvestedDate !== null && harvestedDate < input.sowDate) {
    throw new Error('収穫日が播種日より前になっています');
  }
  if (transplantedDate !== null && harvestedDate !== null && harvestedDate < transplantedDate) {
    throw new Error('収穫日が定植日より前になっています');
  }
  return {
    id,
    cropId: input.cropId,
    sowDate: input.sowDate,
    panels,
    state: input.state,
    transplantedDate,
    harvestedDate,
    solutionChangedDate: day(input.solutionChangedDate, '養液交換日'),
    note: parseNote(input.note, 'ロットのメモ'),
  };
}


/**
 * 運転の設定を読む。
 *
 * - 目標域は**下限 ≦ 上限**を確かめる (逆だと全部が範囲外になる)
 * - 設備の 4 欄は**空欄なら `null`** —— 0 を入れると「量を出せる」に化ける
 * - 周期・しきい値は 1 以上の整数
 */
export function parseControlRecord(input: Readonly<Record<string, unknown>>): HydroponicsControlRecord {
  const d = HYDROPONICS_CONTROL_DEFAULTS;
  /** 必須の数値。空欄なら既定へ倒す (入力欄の初期値と同じ)。 */
  const req = (key: keyof HydroponicsControlRecord, label: string): number => {
    const v = input[key];
    if (blank(v)) return d[key] as number;
    const n = Number(v);
    if (!Number.isFinite(n)) throw new Error(`${label} は数値で入力してください`);
    return n;
  };
  /** 未入力を保つ数値。**空欄は null** (0 ではない)。 */
  const optNum = (key: keyof HydroponicsControlRecord, label: string): number | null => {
    const v = input[key];
    if (blank(v)) return null;
    const n = Number(v);
    if (!Number.isFinite(n) || n <= 0) throw new Error(`${label} は 0 より大きい数値で入力してください`);
    return n;
  };
  /** 1 以上の整数。 */
  const days = (key: keyof HydroponicsControlRecord, label: string): number => {
    const n = req(key, label);
    if (!Number.isInteger(n) || n < 1) throw new Error(`${label} は 1 以上の整数で入力してください`);
    return n;
  };

  const out: HydroponicsControlRecord = {
    waterTempLowC: req('waterTempLowC', '養液温度の下限'),
    waterTempHighC: req('waterTempHighC', '養液温度の上限'),
    airTempLowC: req('airTempLowC', '室温の下限'),
    airTempHighC: req('airTempHighC', '室温の上限'),
    humidityLowPct: req('humidityLowPct', '相対湿度の下限'),
    humidityHighPct: req('humidityHighPct', '相対湿度の上限'),
    co2LowPpm: req('co2LowPpm', 'CO₂ の下限'),
    co2HighPpm: req('co2HighPpm', 'CO₂ の上限'),
    dissolvedOxygenLowMgL: req('dissolvedOxygenLowMgL', '溶存酸素の下限'),
    waterLevelLowPct: req('waterLevelLowPct', '液位の下限'),
    tankLiters: optNum('tankLiters', '養液タンクの容量'),
    stockEcRisePerMlPerL: optNum('stockEcRisePerMlPerL', '原液の EC 上昇率'),
    alkalinityMgCaCO3PerL: optNum('alkalinityMgCaCO3PerL', '原水のアルカリ度'),
    acidNormality: optNum('acidNormality', '酸の規定度'),
    residualAlkalinityMgCaCO3PerL: req('residualAlkalinityMgCaCO3PerL', '残すアルカリ度'),
    solutionChangeIntervalDays: days('solutionChangeIntervalDays', '養液交換の周期'),
    readingStaleDays: days('readingStaleDays', '記録の途絶と見なす日数'),
    harvestNoticeDays: days('harvestNoticeDays', '収穫の予告日数'),
  };

  // **下限 ≦ 上限** を組ごとに確かめる。逆だと全項目が「範囲外」になる。
  const pairs: readonly (readonly [number, number, string])[] = [
    [out.waterTempLowC, out.waterTempHighC, '養液温度'],
    [out.airTempLowC, out.airTempHighC, '室温'],
    [out.humidityLowPct, out.humidityHighPct, '相対湿度'],
    [out.co2LowPpm, out.co2HighPpm, 'CO₂'],
  ];
  for (const [low, high, label] of pairs) {
    if (low > high) throw new Error(`${label}の下限が上限を超えています`);
  }
  return out;
}
