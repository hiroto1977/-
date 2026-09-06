/**
 * 金融機関等へ提出する書面の数値書式 — 経営サマリーの数字を「決算書と同じ読み方」に揃える。
 *
 * 銀行・信用金庫・信用保証協会・公庫の様式に共通する約束:
 * - 金額は千円 (または円・百万円) 単位、3 桁区切り、単位は表頭に「(単位：千円)」
 * - 端数は単位未満**切捨て** (決算書の慣行)。四捨五入も選べる
 * - 負数は「△」(または「▲」「-」)。マイナス記号のまま出さない
 * - 比率は小数第 1 位まで (未満四捨五入)、% 付き
 * - 該当なし・算定不能は「―」(全角ダッシュ)。0 とは区別する
 * - 年月日は和暦 (令和) が既定。西暦も選べる
 *
 * ここは純粋関数だけ。書式の選択 (`BankFormat`) は呼び出し側が持って渡す
 * (`shared/parameters.ts` と同じ約束 — 大域の状態を置かない)。
 */

export type AmountUnit = 'yen' | 'thousand' | 'million';
export type NegativeStyle = 'triangle' | 'solid' | 'minus';
export type RoundingMode = 'truncate' | 'round';
export type EraStyle = 'wareki' | 'seireki';

export interface BankFormat {
  /** 金額の表示単位。 */
  readonly unit: AmountUnit;
  /** 負数の記号。 */
  readonly negative: NegativeStyle;
  /** 単位未満の端数処理 (金額のみ。比率は常に四捨五入)。 */
  readonly rounding: RoundingMode;
  /** 年月日の表記。 */
  readonly era: EraStyle;
}

export const AMOUNT_UNITS: readonly AmountUnit[] = ['yen', 'thousand', 'million'];
export const NEGATIVE_STYLES: readonly NegativeStyle[] = ['triangle', 'solid', 'minus'];
export const ROUNDING_MODES: readonly RoundingMode[] = ['truncate', 'round'];
export const ERA_STYLES: readonly EraStyle[] = ['wareki', 'seireki'];

/** 既定 = 決算書・試算表の一般的な読み方 (千円単位・切捨て・△・和暦)。 */
export const BANK_FORMAT_DEFAULT: BankFormat = {
  unit: 'thousand',
  negative: 'triangle',
  rounding: 'truncate',
  era: 'wareki',
};

/** 該当なし・算定不能の欄。0 ではないことを示す。 */
export const BLANK = '―';

export const UNIT_LABEL: Readonly<Record<AmountUnit, string>> = { yen: '円', thousand: '千円', million: '百万円' };
export const UNIT_DIVISOR: Readonly<Record<AmountUnit, number>> = { yen: 1, thousand: 1_000, million: 1_000_000 };
export const NEGATIVE_MARK: Readonly<Record<NegativeStyle, string>> = { triangle: '△', solid: '▲', minus: '-' };
export const NEGATIVE_LABEL: Readonly<Record<NegativeStyle, string>> = {
  triangle: '△ (白三角)',
  solid: '▲ (黒三角)',
  minus: '- (マイナス)',
};
export const ROUNDING_LABEL: Readonly<Record<RoundingMode, string>> = { truncate: '切捨て', round: '四捨五入' };
export const ERA_LABEL: Readonly<Record<EraStyle, string>> = { wareki: '和暦', seireki: '西暦' };

/** 表頭の単位表示。 */
export function unitCaption(f: BankFormat): string {
  return `（単位：${UNIT_LABEL[f.unit]}）`;
}

/** 端数処理の説明 (注記に使う)。例: 「千円未満切捨て」。 */
export function roundingCaption(f: BankFormat): string {
  return `${UNIT_LABEL[f.unit]}未満${ROUNDING_LABEL[f.rounding]}`;
}

/** 四捨五入 (0 から遠いほうへ)。`Math.round` は負数で +∞ 側へ丸めるので使わない。 */
function roundHalfUp(x: number): number {
  return Math.sign(x) * Math.round(Math.abs(x));
}

const grouping = new Intl.NumberFormat('ja-JP', { maximumFractionDigits: 0, useGrouping: true });

/** 有限の数だけを通す。null / undefined / NaN / ±∞ はここで 1 度に落とす。 */
function isFiniteNumber(v: number | null | undefined): v is number {
  return Number.isFinite(v);
}

/**
 * 円の額を表示単位の整数へ。切捨ては 0 に向かって (△1,234,567 円 → △1,234 千円)。
 * 負のゼロは 0 に戻す — `Intl` は -0 を「-0」と出すので、△の判定より前に潰す。
 */
export function scaleAmount(yen: number, f: BankFormat): number {
  const scaled = yen / UNIT_DIVISOR[f.unit];
  const n = f.rounding === 'truncate' ? Math.trunc(scaled) : roundHalfUp(scaled);
  return n === 0 ? 0 : n;
}

/** 金額。null / 非数 / ∞ は「―」。 */
export function formatAmount(yen: number | null | undefined, f: BankFormat): string {
  if (!isFiniteNumber(yen)) return BLANK;
  return formatScaled(scaleAmount(yen, f), f);
}

/**
 * **表示単位の整数**をそのまま書式化する (円ではない)。
 *
 * 使うのは、書面の中で**印刷した行同士の足し算が合う**必要があるとき。
 * 各行を円から別々に丸めると、式を隣に書いておきながら数字が合わない:
 *
 * ```
 *   総資産    10,000,000 円 → 10,000 千円
 *   負債合計   3,999,999 円 →  3,999 千円 (千円未満切捨て)
 *   純資産     6,000,001 円 →  6,000 千円   ← 10,000 − 3,999 = 6,001 と合わない
 * ```
 *
 * 実測 (2026-09-06): 貸借対照表の値を 40 通り振ると **21 通り**で
 * 「純資産 = 総資産 − 負債合計」が印刷した数字では成り立たなかった。
 * 金融機関へ出す書面で式と数字が食い違うのは通らないので、
 * **丸めた後の値で計算してから**書式に通す。差は表示単位未満なので、
 * 表頭の「千円未満切捨て」の範囲に収まる。
 *
 * (同じ形を `data/workingCapital.ts` は正しく扱っている —— DSO / DIO / DPO を
 * 先に小数 1 桁へ丸め、CCC はその**丸めた値の和**で作るので、印刷した 4 行は
 * 必ず合う。実測 3,000 通りで食い違い 0。)
 */
export function formatScaled(units: number | null | undefined, f: BankFormat): string {
  if (!isFiniteNumber(units)) return BLANK;
  // -0 の正規化は**要らない**: `Math.abs(-0)` は +0 で、`-0 < 0` も false なので
  // どちらの経路でも「0」になる (実測 2026-09-06 —— 置いた -0 → 0 は観測できない
  // 分岐だったので落とした)。`scaleAmount` 側の -0 → 0 は表示ではなく
  // **計算へ渡す値**の正規化なので、あちらには残っている。
  const body = grouping.format(Math.abs(units));
  return units < 0 ? `${NEGATIVE_MARK[f.negative]}${body}` : body;
}

/** 比率 (%)。小数 `digits` 桁 (既定 1) で四捨五入。 */
export function formatPercent(pct: number | null | undefined, f: BankFormat, digits = 1): string {
  if (!isFiniteNumber(pct)) return BLANK;
  const k = 10 ** digits;
  const r = roundHalfUp(pct * k) / k;
  const body = Math.abs(r).toFixed(digits);
  return r < 0 ? `${NEGATIVE_MARK[f.negative]}${body}%` : `${body}%`;
}

/** 倍率・日数・年数など、単位語つきの数。例: `formatRatio(1.234, f, '倍', 2)` → 「1.23倍」。 */
export function formatRatio(value: number | null | undefined, f: BankFormat, suffix: string, digits = 1): string {
  if (!isFiniteNumber(value)) return BLANK;
  const k = 10 ** digits;
  const r = roundHalfUp(value * k) / k;
  const body = Math.abs(r).toFixed(digits);
  return r < 0 ? `${NEGATIVE_MARK[f.negative]}${body}${suffix}` : `${body}${suffix}`;
}

/** 件数・人数など (表示単位に依らず 1 の位まで、3 桁区切り、単位語つき)。例: 「12名」「3,400件」。 */
export function formatCount(n: number | null | undefined, f: BankFormat, suffix = ''): string {
  const body = formatAmount(n, { ...f, unit: 'yen' });
  return body === BLANK ? BLANK : `${body}${suffix}`;
}

interface Era {
  readonly name: string;
  /** 元年の西暦。 */
  readonly firstYear: number;
  /** 始まりの日 (YYYYMMDD の整数)。 */
  readonly start: number;
}

/** 新しい順。昭和より前は扱わない (西暦へ倒す)。 */
const ERAS: readonly Era[] = [
  { name: '令和', firstYear: 2019, start: 20190501 },
  { name: '平成', firstYear: 1989, start: 19890108 },
  { name: '昭和', firstYear: 1926, start: 19261225 },
];

/** 和暦の元号と年。昭和より前は null。元年は 1。 */
export function toWareki(year: number, month: number, day: number): { era: string; year: number } | null {
  const key = year * 10000 + month * 100 + day;
  for (const e of ERAS) {
    if (key >= e.start) return { era: e.name, year: year - e.firstYear + 1 };
  }
  return null;
}

interface ParsedDate {
  readonly year: number;
  readonly month: number;
  /** 「YYYY-MM」だけの入力は null。 */
  readonly day: number | null;
}

/**
 * `YYYY-MM-DD` / `YYYY-MM` を読む。暦に無い日 (2 月 30 日・0 日) は null。
 * 文字列以外は `String()` で「null」などになり、正規表現に当たらず null。
 * 日の検査は 1 つで足りる — 暦から外れた日は `Date.UTC` が隣の月へ繰り越し、
 * 日の数字が必ず変わる (0 日は前月末、32 日は翌月 1〜4 日)。
 */
export function parseIsoDate(iso: string | null | undefined): ParsedDate | null {
  const m = /^(\d{4})-(\d{2})(?:-(\d{2}))?$/.exec(String(iso));
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  if (month < 1 || month > 12) return null;
  if (m[3] === undefined) return { year, month, day: null };
  const day = Number(m[3]);
  const probe = new Date(Date.UTC(year, month - 1, day));
  if (probe.getUTCDate() !== day) return null;
  return { year, month, day };
}

const eraYearLabel = (n: number): string => (n === 1 ? '元' : String(n));

/**
 * 年月日。和暦なら「令和8年9月4日」、西暦なら「2026年9月4日」。`YYYY-MM` は年月まで。
 * 読めない入力は「―」。和暦で昭和より前は西暦へ倒す。
 * 年月だけの入力の元号は月初の日で決める (令和元年 5 月 / 平成 31 年 4 月)。
 */
export function formatDate(iso: string | null | undefined, f: BankFormat): string {
  const d = parseIsoDate(iso);
  if (!d) return BLANK;
  const tail = d.day === null ? `${d.month}月` : `${d.month}月${d.day}日`;
  if (f.era === 'wareki') {
    const w = toWareki(d.year, d.month, d.day ?? 1);
    if (w) return `${w.era}${eraYearLabel(w.year)}年${tail}`;
  }
  return `${d.year}年${tail}`;
}

/** 決算期。「令和8年3月期」。 */
export function formatFiscalPeriod(yearMonth: string | null | undefined, f: BankFormat): string {
  const label = formatDate(yearMonth, f);
  return label === BLANK ? BLANK : `${label}期`;
}

/** 対象期間。同じ月なら 1 つだけ。どちらかが読めなければ「―」。 */
export function formatPeriodRange(from: string | null | undefined, to: string | null | undefined, f: BankFormat): string {
  const a = formatDate(from, f);
  const b = formatDate(to, f);
  if (a === BLANK || b === BLANK) return BLANK;
  return a === b ? a : `${a}〜${b}`;
}

/** 保存した書式を読む。知らない値・欠けた項目は既定へ倒す (壊れた保存で書面が出なくならないように)。 */
export function parseBankFormat(input: unknown): BankFormat {
  const o: Record<string, unknown> = input !== null && typeof input === 'object' ? (input as Record<string, unknown>) : {};
  const pick = <T extends string>(v: unknown, allowed: readonly T[], fallback: T): T =>
    allowed.includes(v as T) ? (v as T) : fallback;
  return {
    unit: pick(o.unit, AMOUNT_UNITS, BANK_FORMAT_DEFAULT.unit),
    negative: pick(o.negative, NEGATIVE_STYLES, BANK_FORMAT_DEFAULT.negative),
    rounding: pick(o.rounding, ROUNDING_MODES, BANK_FORMAT_DEFAULT.rounding),
    era: pick(o.era, ERA_STYLES, BANK_FORMAT_DEFAULT.era),
  };
}
