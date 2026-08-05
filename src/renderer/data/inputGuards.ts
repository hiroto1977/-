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
 */

export type GuardLevel = 'fatal' | 'warn' | 'info';

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
  | 'ppm'; // mg/L・ppm など濃度

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

const FULLWIDTH = /[！-～]/g;
const toHalfWidth = (s: string) => s.replace(FULLWIDTH, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0));

/** 単位語を含むか（含む場合は数値として読み替えず、指摘に回す）。 */
const UNIT_WORD = /[万億兆千]|[０-９0-9]\s*[kKmMbB]\b/;

/** 読み取りで無視してよい飾り（通貨記号・単位・区切り）。 */
const DECORATION = /[¥￥$,\s円％%人年月日個株㎡ｍm]/g;

/**
 * 入力文字列を数値として読む。読めなければ null。
 *
 * - 全角英数記号を半角化
 * - 通貨記号・単位・桁区切り・空白を除去
 * - 空文字は null（「未入力」は呼び出し側で 0 に倒す）
 * - `1e3` `0x10` `Infinity` `NaN` `1..2` `++5` は読まない
 * - `万` `億` などの単位語を含むものは読まない（誤解釈より未読を選ぶ）
 */
export function readNumber(raw: string | undefined | null): number | null {
  if (raw === undefined || raw === null) return null;
  const half = toHalfWidth(String(raw)).trim();
  if (half.length === 0) return null;
  if (UNIT_WORD.test(half)) return null;
  const bare = half.replace(DECORATION, '');
  if (!/^[+-]?\d+(\.\d+)?$/.test(bare)) return null;
  const n = Number(bare);
  return Number.isFinite(n) ? n : null;
}

/** 読めなければ 0。計算側はこれを使い、警告側は guardNumber を使う。 */
export function readNumberOr0(raw: string | undefined | null): number {
  return readNumber(raw) ?? 0;
}

/** 単位語（万・億）が含まれているか。指摘の文面を変えるために使う。 */
export function hasUnitWord(raw: string | undefined | null): boolean {
  if (!raw) return false;
  return UNIT_WORD.test(toHalfWidth(String(raw)));
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
};

/**
 * 1 つの入力を検査する。問題がなければ null。
 * 「読めない＝0 で計算されている」ことを必ず本文に書く（黙って 0 にしない）。
 */
export function guardNumber(raw: string | undefined | null, spec: NumSpec): GuardIssue | null {
  const rule = KIND[spec.kind];
  const text = raw === undefined || raw === null ? '' : String(raw).trim();

  if (text.length === 0) {
    if (spec.allowEmpty) return null;
    return { level: 'warn', label: spec.label, message: `未入力です。0 ${rule.unit} として計算されています。` };
  }

  const value = readNumber(text);
  if (value === null) {
    if (hasUnitWord(text)) {
      return {
        level: 'fatal',
        label: spec.label,
        message: `「${text}」は単位付きのため読み取れません。0 ${rule.unit} として計算されています。単位を付けず ${rule.unit} の数値だけを入力してください。`,
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
  if (spec.min !== undefined && value < spec.min) {
    return { level: 'fatal', label: spec.label, message: `${spec.min} ${rule.unit} 以上で入力してください（現在 ${value}）。` };
  }
  const max = spec.max ?? rule.max;
  if (max !== undefined && value > max) {
    return { level: 'fatal', label: spec.label, message: `${max} ${rule.unit} 以下で入力してください（現在 ${value}）。` };
  }
  if (rule.integer && !Number.isInteger(value)) {
    return { level: 'warn', label: spec.label, message: `整数で入力してください（現在 ${value}）。小数は切り捨てられます。` };
  }
  const sane = spec.sane ?? rule.sane;
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
  const rank: Record<GuardLevel, number> = { fatal: 0, warn: 1, info: 2 };
  return out.map((x, i) => ({ x, i })).sort((a, b) => rank[a.x.level] - rank[b.x.level] || a.i - b.i).map(({ x }) => x);
}

/** 画面のバッジ表示用の件数。 */
export function guardCounts(issues: readonly GuardIssue[]): { fatal: number; warn: number } {
  return {
    fatal: issues.filter((i) => i.level === 'fatal').length,
    warn: issues.filter((i) => i.level === 'warn').length,
  };
}
