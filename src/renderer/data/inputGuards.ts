/**
 * 数値入力のガード — 「黙って 0 として計算される」を潰す。
 *
 * このアプリの試算画面は、入力を `Number(x) || 0` や「数字以外を除去して
 * Number()」で読んでいた。どちらも読めない入力を静かに 0 に落とすため、
 * 打ち間違いがそのまま自信のある間違った答えになる。しかも画面ごとに
 * パーサが違い、`Number('30,000')` は NaN → 0、桁区切りを消す方は 30000 と、
 * 同じ入力で結果が食い違っていた。
 *
 * ここでは
 *   1. 読み取りを `readNumber()` 1 本に統一し（計算も警告も同じ関数を使う）、
 *   2. 読めなかった / 単位付き / 範囲外を `guardNumber()` が指摘する。
 * 警告と計算が同じ関数から出るので、「警告は出ないのに 0 で計算されていた」
 * が構造的に起きない。
 *
 * 単位（万・億）は**解釈しない**。`4200万` を 42,000,000 と読み替えるのは
 * 親切に見えて、読み替えを誤ったときに気づけない。読み取れないものは
 * 読み取れないと言い、円単位での入力を促す方が安全と判断した。
 *
 * 同じ理由で、飾り（通貨記号・単位・桁区切り）は**位置**まで見る。
 * 位置を見ずに落としていた 2026-09-06 までは `100m2` が 1002、
 * `2024年12月31日` が 20241231 と読めてしまい、**読めている以上
 * 指摘も出なかった** —— 詳細は `shared/readNumeric.ts` の `NUMBER_SHAPE` の注記。
 */

import { byIssueLevel, type IssueLevel } from '../../shared/issueLevel';
import { hasInteriorNoise, hasUnitWord, readNumeric } from '../../shared/readNumeric';

// 読み取り自体は `shared/readNumeric.ts` が 1 つだけ持つ (画面と共有検査で
// 同じ文字列が別の数にならないように)。ここは「読めなかったときに何と言うか」。
export { hasInteriorNoise, hasUnitWord };
export { readNumeric as readNumber };

/** 重大度はアプリ全体で 1 つ（`shared/issueLevel.ts`）。 */
export type GuardLevel = IssueLevel;

export interface GuardIssue {
  readonly level: GuardLevel;
  readonly label: string;
  readonly message: string;
}

/** 入力欄の性質。既定の範囲チェックがこれで決まる。 */
export type NumKind =
  | 'money' // 円
  | 'percent' // %
  | 'years' // 年
  | 'months' // か月
  | 'count' // 個数・人数（整数）
  | 'area' // ㎡
  | 'length' // m
  | 'ratio' // 倍率
  | 'ppm' // mg/L・ppm など濃度
  | 'days' // 日数（整数）
  | 'energy' // kWh/kg（電力原単位）
  | 'mgPer100g' // mg/100g（食品成分）
  | 'km'; // 距離 (km)

export interface NumSpec {
  readonly label: string;
  readonly kind: NumKind;
  /** 未入力を許す（省略時は「未入力＝0 として計算」を warn で知らせる）。 */
  readonly allowEmpty?: boolean;
  /** 0 を許す（既定は kind ごと。area/length/count は 0 を fatal にする）。 */
  readonly allowZero?: boolean;
  readonly min?: number;
  readonly max?: number;
  /** この値を超えたら「桁を間違えていないか」を尋ねる。 */
  readonly sane?: number;
}

/** 読めなければ 0。計算側はこれを使い、警告側は guardNumber を使う。 */
export function readNumberOr0(raw: string | undefined | null): number {
  return readNumeric(raw) ?? 0;
}

interface KindRule {
  readonly unit: string;
  readonly zeroIsFatal?: boolean;
  readonly negativeIsFatal?: boolean;
  readonly integer?: boolean;
  readonly max?: number;
  readonly sane?: number;
}

const KIND: Record<NumKind, KindRule> = {
  money: { unit: '円', sane: 1e13 },
  percent: { unit: '%', negativeIsFatal: false, max: 1000, sane: 100 },
  years: { unit: '年', negativeIsFatal: true, sane: 100 },
  months: { unit: 'か月', negativeIsFatal: true, sane: 1200 },
  count: { unit: '件', negativeIsFatal: true, integer: true, sane: 100000 },
  area: { unit: '㎡', negativeIsFatal: true, zeroIsFatal: true, sane: 1e6 },
  length: { unit: 'm', negativeIsFatal: true, zeroIsFatal: true, sane: 1000 },
  ratio: { unit: '倍', negativeIsFatal: true, sane: 1000 },
  ppm: { unit: 'mg/L', negativeIsFatal: true, sane: 100000 },
  // 水耕栽培の入力欄が足した 3 種。単位語は「0 X として計算されています」の
  // 文面にそのまま出るので、近い kind を借りると (倍・mg/L) 嘘の単位を言う。
  days: { unit: '日', negativeIsFatal: true, integer: true, sane: 3650 },
  energy: { unit: 'kWh/kg', negativeIsFatal: true, sane: 100 },
  mgPer100g: { unit: 'mg/100g', negativeIsFatal: true, sane: 10000 },
  // 通勤距離 (片道 km)。`length` は m で 0 を断るが、マイカー通勤なし = 0 km は正当。
  km: { unit: 'km', negativeIsFatal: true, sane: 1000 },
};

/**
 * 1 つの入力を検査する。問題がなければ null。
 * 「読めない＝0 で計算されている」ことを必ず本文に書く（黙って 0 にしない）。
 */
export function guardNumber(raw: string | undefined | null, spec: NumSpec): GuardIssue | null {
  const rule = KIND[spec.kind];
  const text = raw == null ? '' : String(raw).trim();

  if (text.length === 0) {
    if (spec.allowEmpty) return null;
    return { level: 'warn', label: spec.label, message: `未入力です。0 ${rule.unit} として計算されています。` };
  }

  const value = readNumeric(text);
  if (value === null) {
    if (hasUnitWord(text)) {
      return {
        level: 'fatal',
        label: spec.label,
        message: `「${text}」は単位付きのため読み取れません。0 ${rule.unit} として計算されています。単位を付けず ${rule.unit} の数値だけを入力してください。`,
      };
    }
    if (hasInteriorNoise(text)) {
      return {
        level: 'fatal',
        label: spec.label,
        message: `「${text}」は数字の間に単位や区切りが入っているため読み取れません。0 ${rule.unit} として計算されています。3 桁区切り以外の記号を外し、${rule.unit} の数値だけを入力してください。`,
      };
    }
    return {
      level: 'fatal',
      label: spec.label,
      message: `「${text}」を数値として読み取れません。0 ${rule.unit} として計算されています。`,
    };
  }

  if (value < 0 && (spec.min === undefined || spec.min >= 0) && rule.negativeIsFatal !== false) {
    return { level: 'fatal', label: spec.label, message: `マイナスの値（${value}）は指定できません。` };
  }
  if (value === 0 && (spec.allowZero ?? !rule.zeroIsFatal) === false) {
    return { level: 'fatal', label: spec.label, message: `0 ${rule.unit} では計算できません。` };
  }
  // Stryker disable next-line ConditionalExpression: !== undefined を true 固定にしても
  // spec.min が undefined のとき `value < undefined` が常に false になるため結果は同じ（等価変異）。
  if (spec.min !== undefined && value < spec.min) {
    return { level: 'fatal', label: spec.label, message: `${spec.min} ${rule.unit} 以上で入力してください（現在 ${value}）。` };
  }
  const max = spec.max ?? rule.max;
  // Stryker disable next-line ConditionalExpression: 上と同じ理由（`value > undefined` は false）。
  if (max !== undefined && value > max) {
    return { level: 'fatal', label: spec.label, message: `${max} ${rule.unit} 以下で入力してください（現在 ${value}）。` };
  }
  if (rule.integer && !Number.isInteger(value)) {
    return { level: 'warn', label: spec.label, message: `整数で入力してください（現在 ${value}）。小数は切り捨てられます。` };
  }
  const sane = spec.sane ?? rule.sane;
  // Stryker disable next-line ConditionalExpression: 上と同じ理由（`value > undefined` は false）。
  if (sane !== undefined && value > sane) {
    return {
      level: 'warn',
      label: spec.label,
      message: `${value.toLocaleString('ja-JP')} ${rule.unit} は想定の範囲を超えています。桁を間違えていないか確認してください。`,
    };
  }
  return null;
}

/** 複数の入力をまとめて検査し、fatal → warn → info の順に返す。 */
export function guardAll(entries: readonly (readonly [string | undefined | null, NumSpec])[]): readonly GuardIssue[] {
  const out: GuardIssue[] = [];
  for (const [raw, spec] of entries) {
    const issue = guardNumber(raw, spec);
    if (issue) out.push(issue);
  }

  // sort は ES2019 以降 安定ソートが保証されるので、同順位は検出順のまま残る。
  return [...out].sort(byIssueLevel);
}

/** 画面のバッジ表示用の件数。 */
export function guardCounts(issues: readonly GuardIssue[]): { fatal: number; warn: number } {
  return {
    fatal: issues.filter((i) => i.level === 'fatal').length,
    warn: issues.filter((i) => i.level === 'warn').length,
  };
}
