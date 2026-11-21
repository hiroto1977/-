/**
 * 見張りアシスタントの週ごとの数字 —— エックス・グーグル広告・アナリティクスの数字を
 * 利用者が週に 1 度写し、前の週と比べた週次レポートを作る。
 *
 * このアプリはエックスにも広告にもアナリティクスにもつながない (連携の口を持たない)。
 * それぞれの管理画面で見た数字を利用者が写し、記録は端末の record store
 * (collection `watch-weekly`) に置く。ここは純関数だけを持つ (保存は `data/store.ts`、
 * 画面は `useCollection(WATCH_WEEKLY_COLLECTION)` で読む)。
 *
 * 守る物:
 * - 空欄を 0 として入れない (0 と「未入力」は別の事実)。未入力の数字は欄ごと持たない。
 * - 増減・率は、両方の値が読めるときだけ出す。出せないときは「—」と理由。
 * - 記録・レポートの数は同じ「読める行」から取り、外した件数を返す。
 */

import { finiteNumberOf } from '../../shared/apiResponse';
import { DASH } from '../../shared/formatters';
import { addIsoDays, isCalendarDate } from '../../shared/isoDate';
import { readEntryNumber } from '../../shared/readNumeric';
import { isoWeekday } from '../../shared/watchAssistant';

export const WATCH_WEEKLY_COLLECTION = 'watch-weekly';

export const WATCH_NUMBER_SOURCES = ['x', 'ads', 'analytics'] as const;
export type WatchNumberSource = (typeof WATCH_NUMBER_SOURCES)[number];

export const WATCH_NUMBER_SOURCE_LABEL: Readonly<Record<WatchNumberSource, string>> = {
  x: 'エックス (X)',
  ads: 'グーグル広告 (Google Ads)',
  analytics: 'アナリティクス (Google Analytics)',
};

/**
 * 1 つの数字の上限。**桁の打ち間違いを止めるための幅**で、制度上の上限ではない ——
 * 桁を 1 つ多く打った値が増減の率を黙って変えるのを防ぐ。
 */
export const MAX_WATCH_METRIC = 100_000_000_000;

/** 週ごとに記録する数字。欄の名前は 3 つの先で重ならない。 */
export const WATCH_METRICS = [
  { key: 'xPosts', source: 'x', label: '投稿数', unit: '件' },
  { key: 'xImpressions', source: 'x', label: '表示回数', unit: '回' },
  { key: 'xEngagements', source: 'x', label: '反応数', unit: '件' },
  { key: 'xFollowers', source: 'x', label: 'フォロワー数', unit: '人' },
  { key: 'adCost', source: 'ads', label: '広告費', unit: '円' },
  { key: 'adImpressions', source: 'ads', label: '表示回数', unit: '回' },
  { key: 'adClicks', source: 'ads', label: 'クリック数', unit: '回' },
  { key: 'adConversions', source: 'ads', label: '成果数', unit: '件' },
  { key: 'gaUsers', source: 'analytics', label: '利用者数', unit: '人' },
  { key: 'gaSessions', source: 'analytics', label: '訪問数', unit: '回' },
  { key: 'gaPageviews', source: 'analytics', label: 'ページ表示数', unit: '回' },
  { key: 'gaConversions', source: 'analytics', label: '成果数', unit: '件' },
] as const;

export type WatchMetricKey = (typeof WATCH_METRICS)[number]['key'];
export const WATCH_METRIC_KEYS: readonly WatchMetricKey[] = WATCH_METRICS.map((m) => m.key);

/** 1 週間ぶんの記録。数字は入力した物だけを持つ。 */
export interface WatchWeekEntry extends Record<string, unknown> {
  /** その週の月曜日 (`YYYY-MM-DD`)。 */
  readonly week: string;
  readonly xPosts?: number;
  readonly xImpressions?: number;
  readonly xEngagements?: number;
  readonly xFollowers?: number;
  readonly adCost?: number;
  readonly adImpressions?: number;
  readonly adClicks?: number;
  readonly adConversions?: number;
  readonly gaUsers?: number;
  readonly gaSessions?: number;
  readonly gaPageviews?: number;
  readonly gaConversions?: number;
}

/** その日を含む週の月曜日。読めなければ null。 */
export function weekStartOf(iso: unknown): string | null {
  const weekday = isoWeekday(iso);
  if (weekday === null) return null;
  // 月曜 (1) なら 0 日・日曜 (0) なら 6 日戻る。
  return addIsoDays(iso, -((weekday + 6) % 7));
}

const metricRangeRefusal = (label: string): string =>
  `${label}は 0 以上 ${MAX_WATCH_METRIC.toLocaleString('ja-JP')} 以下の整数で入力してください`;

/**
 * 画面の入力を 1 週間ぶんの記録にする。直せる文を添えて断る。
 *
 * 日付はその週のどの日でもよい (月曜日にそろえて持つ)。数字は**入力した欄だけ**を持ち、
 * 空欄は 0 にしない。1 つも入っていなければ断る。
 */
export function parseWatchWeek(input: { week?: unknown } & Partial<Record<WatchMetricKey, unknown>>): WatchWeekEntry {
  const week = weekStartOf(input.week);
  if (week === null) throw new Error('週の日付は YYYY-MM-DD 形式で入力してください（その週のどの日でも構いません）');
  const values: Partial<Record<WatchMetricKey, number>> = {};
  for (const m of WATCH_METRICS) {
    const read = readEntryNumber(input[m.key]);
    if (read.kind === 'blank') continue;
    const label = `${WATCH_NUMBER_SOURCE_LABEL[m.source]}の${m.label}`;
    if (read.kind !== 'number' || !Number.isInteger(read.value) || read.value < 0 || read.value > MAX_WATCH_METRIC) {
      throw new Error(metricRangeRefusal(label));
    }
    values[m.key] = read.value;
  }
  if (Object.keys(values).length === 0) {
    throw new Error('数字が 1 つも入っていません（分かる数字だけで構いません。0 のときは 0 と入力してください）');
  }
  return { week, ...values };
}

/** 保管した数字を読む。数でない・負の値は読めない (null)。欄が無いのも null (未入力)。 */
export function watchMetricOf(v: unknown): number | null {
  const n = finiteNumberOf(v) ?? -1;
  return n >= 0 ? n : null;
}

/** 同じ週の記録が既に在るときの断り。 */
export function duplicateWatchWeekMessage(week: string): string {
  return `${week} の週は記録済みです。直すときは、下の一覧の × で消してから入れ直してください。`;
}

/** 同じ週の記録が既に在るか (判定は保管層から読み直した行に当てる)。 */
export function hasWatchWeek(rows: readonly WatchWeekEntry[], week: string): boolean {
  return rows.some((r) => r.week === week);
}

/* ───────────── 週次レポート ───────────── */

export interface WatchMetricRow {
  readonly key: WatchMetricKey;
  readonly source: WatchNumberSource;
  readonly label: string;
  readonly unit: string;
  /** その週の値 (未入力・読めないは null)。 */
  readonly current: number | null;
  /** 前の週の値。 */
  readonly previous: number | null;
  /** 増減の率 (%)。前の週が 0・未入力なら null。 */
  readonly changePct: number | null;
}

export interface WatchRateRow {
  readonly source: WatchNumberSource;
  readonly label: string;
  /** その週の値を文にした物 (「2.5%」「120 円」)。出せなければ「—」。 */
  readonly current: string;
  readonly previous: string;
}

export interface WatchWeeklyReport {
  /** レポートの週 (月曜日)。 */
  readonly week: string;
  /** 前の週 (月曜日)。 */
  readonly previousWeek: string;
  /** 前の週の記録が在るか。 */
  readonly hasPrevious: boolean;
  readonly rows: readonly WatchMetricRow[];
  readonly rates: readonly WatchRateRow[];
  /** 前の週から大きく動いた数字の文 (動きの大きい順)。 */
  readonly moves: readonly string[];
  /** 週の日付が読めず、レポートから外した記録の件数。 */
  readonly unreadable: number;
  /** そのまま読める・コピーできる全文。 */
  readonly text: string;
}

/** 「大きく動いた」と言う境目 (%)。 */
export const WATCH_MOVE_THRESHOLD_PCT = 10;
/** 「動き」に挙げる数の上限。 */
export const MAX_WATCH_MOVES = 5;

const num = (n: number): string => n.toLocaleString('ja-JP');

/** 増減の率を「+12.5%」「-3.0%」と書く。 */
function signedPct(n: number): string {
  return `${n >= 0 ? '+' : '-'}${Math.abs(n).toFixed(1)}%`;
}

function changePctOf(current: number | null, previous: number | null): number | null {
  if (current === null || previous === null || previous === 0) return null;
  return ((current - previous) / previous) * 100;
}

/** 割り算。分子・分母のどちらかが無い・分母が 0 なら null。 */
function ratio(numerator: number | null, denominator: number | null): number | null {
  if (numerator === null || denominator === null || denominator === 0) return null;
  return numerator / denominator;
}

const pctText = (r: number | null): string => (r === null ? DASH : `${(r * 100).toFixed(2)}%`);
const yenText = (r: number | null): string => (r === null ? DASH : `${num(Math.round(r))} 円`);

type Values = Readonly<Record<WatchMetricKey, number | null>>;

function valuesOf(row: WatchWeekEntry | undefined): Values {
  const out = {} as Record<WatchMetricKey, number | null>;
  for (const key of WATCH_METRIC_KEYS) out[key] = row === undefined ? null : watchMetricOf(row[key]);
  return out;
}

/** 数字から導く率。分母が無ければ「—」。 */
function ratesOf(cur: Values, prev: Values): WatchRateRow[] {
  return [
    {
      source: 'x',
      label: '反応率 (反応数 ÷ 表示回数)',
      current: pctText(ratio(cur.xEngagements, cur.xImpressions)),
      previous: pctText(ratio(prev.xEngagements, prev.xImpressions)),
    },
    {
      source: 'ads',
      label: 'クリック率 (クリック数 ÷ 表示回数)',
      current: pctText(ratio(cur.adClicks, cur.adImpressions)),
      previous: pctText(ratio(prev.adClicks, prev.adImpressions)),
    },
    {
      source: 'ads',
      label: 'クリック単価 (広告費 ÷ クリック数)',
      current: yenText(ratio(cur.adCost, cur.adClicks)),
      previous: yenText(ratio(prev.adCost, prev.adClicks)),
    },
    {
      source: 'ads',
      label: '成果単価 (広告費 ÷ 成果数)',
      current: yenText(ratio(cur.adCost, cur.adConversions)),
      previous: yenText(ratio(prev.adCost, prev.adConversions)),
    },
    {
      source: 'analytics',
      label: '成果率 (成果数 ÷ 訪問数)',
      current: pctText(ratio(cur.gaConversions, cur.gaSessions)),
      previous: pctText(ratio(prev.gaConversions, prev.gaSessions)),
    },
  ];
}

export const WATCH_REPORT_EMPTY_NOTE =
  'まだ週ごとの数字がありません。下の欄に、エックス・広告・アナリティクスの管理画面で見た数字を入力してください（分かる数字だけで構いません）。';

export const WATCH_NO_PREVIOUS_NOTE = '前の週の記録が無いため、増減は出していません。来週の数字を入れると比べられます。';
export const WATCH_NO_MOVES_NOTE = `前の週から ${WATCH_MOVE_THRESHOLD_PCT}% 以上動いた数字はありません。`;

/** 週の日付が読めない記録の件数 (レポートと画面の断りが同じ数を読む)。 */
export function countUnreadableWatchWeeks(rows: readonly WatchWeekEntry[]): number {
  return rows.filter((r) => !isCalendarDate(r.week)).length;
}

/** 週の日付が読めない記録が在るときの断り。無ければ null。 */
export function unreadableWatchWeeksNote(unreadable: number): string | null {
  if (!(unreadable > 0)) return null;
  return `週の日付が読めない記録が ${unreadable} 件あります。レポートには入れていません。その行も下の一覧に出ています —— 一覧の × で消して、入れ直してください。`;
}

/**
 * 週次レポートを作る。読める記録が 1 件も無ければ null。
 *
 * `week` を渡さなければ、読める記録のうちいちばん新しい週を使う。同じ週の記録が
 * 重なっていれば、先に並ぶ行 (新しく入れた行) を使う。
 */
export function buildWatchWeeklyReport(rows: readonly WatchWeekEntry[], week?: string): WatchWeeklyReport | null {
  const byWeek = new Map<string, WatchWeekEntry>();
  for (const row of rows) {
    if (isCalendarDate(row.week) && !byWeek.has(row.week)) byWeek.set(row.week, row);
  }
  const unreadable = countUnreadableWatchWeeks(rows);
  const latest = [...byWeek.keys()].sort().pop();
  const target = week ?? latest;
  if (target === undefined || !byWeek.has(target)) return null;
  // `target` は暦に在る日 (`byWeek` の鍵) なので、7 日前は必ず求まる。
  const previousWeek = addIsoDays(target, -7) as string;
  const hasPrevious = byWeek.has(previousWeek);
  const cur = valuesOf(byWeek.get(target));
  const prev = valuesOf(byWeek.get(previousWeek));

  const metricRows: WatchMetricRow[] = WATCH_METRICS.map((m) => ({
    key: m.key,
    source: m.source,
    label: m.label,
    unit: m.unit,
    current: cur[m.key],
    previous: prev[m.key],
    changePct: changePctOf(cur[m.key], prev[m.key]),
  }));
  const rates = ratesOf(cur, prev);

  const moves = metricRows
    .flatMap((r) =>
      r.changePct !== null && Math.abs(r.changePct) >= WATCH_MOVE_THRESHOLD_PCT
        ? [{ size: Math.abs(r.changePct), text: `${WATCH_NUMBER_SOURCE_LABEL[r.source]}の${r.label}が前の週より ${signedPct(r.changePct)} (${num(r.previous as number)} → ${num(r.current as number)} ${r.unit})` }]
        : [],
    )
    .sort((a, b) => b.size - a.size)
    .slice(0, MAX_WATCH_MOVES)
    .map((m) => m.text);

  const lines: string[] = [`【週次レポート】${target} の週 (月曜始まり)`];
  for (const source of WATCH_NUMBER_SOURCES) {
    const mine = metricRows.filter((r) => r.source === source && r.current !== null);
    if (mine.length === 0) continue;
    lines.push('');
    lines.push(`■ ${WATCH_NUMBER_SOURCE_LABEL[source]}`);
    for (const r of mine) {
      const before = r.previous === null ? '' : ` (前の週 ${num(r.previous)} ${r.unit}${r.changePct === null ? '' : ` / ${signedPct(r.changePct)}`})`;
      lines.push(`・${r.label}: ${num(r.current as number)} ${r.unit}${before}`);
    }
    for (const rate of rates.filter((x) => x.source === source && x.current !== DASH)) {
      lines.push(`・${rate.label}: ${rate.current}${rate.previous === DASH ? '' : ` (前の週 ${rate.previous})`}`);
    }
  }
  lines.push('');
  lines.push('■ 動き');
  if (!hasPrevious) lines.push(`・${WATCH_NO_PREVIOUS_NOTE}`);
  else if (moves.length === 0) lines.push(`・${WATCH_NO_MOVES_NOTE}`);
  else for (const m of moves) lines.push(`・${m}`);

  return { week: target, previousWeek, hasPrevious, rows: metricRows, rates, moves, unreadable, text: lines.join('\n') };
}
