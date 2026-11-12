/**
 * 月次KPI改善の輪の保管 —— 目標 (人が決める) と、人が選んだ打ち手の記録。
 *
 * 1 つの collection (`kpi-improvement-cycles`) に 2 種の行を置く: `kind: 'goal'` (目標の営業利益率) と
 * `kind: 'cycle'` (選んだ打ち手・見込み・選んだ月・検証する月)。**自由文は持たない**ので、保管値を画面に
 * 出す所に天井を掛ける欄が無い (打ち手は固定の一覧・月は `YYYY-MM`・数は有限)。
 *
 * ## 書き手と読み手
 * - 書き手 (`parseGoal` / `parseCycle`) は断る。数は画面と同じ読み (`readEntryNumber`) で読む。
 * - 読み手 (`improvementState`) は**行ごとに読めるものだけ**採り、使わなかった行の id を返す (画面が消す口を出す)。保管層は読みで
 *   行を落とさない設計 (点検・削除の逃げ口を開けておく) なので、壊れた行で画面が投げない。
 */
import { readEntryNumber } from '../../shared/readNumeric';
import { isValidPeriod } from './kpiActuals';
import { LEVER_STEPS, type CycleRecord, type LeverId } from './kpiImprovementLoop';
import type { StoredRecord } from './store';

export const KPI_IMPROVEMENT_COLLECTION = 'kpi-improvement-cycles';

/** 打ち手の一覧は `LEVER_STEPS` の鍵から導く (写さない)。 */
export const LEVER_IDS: readonly LeverId[] = Object.keys(LEVER_STEPS) as LeverId[];

export type ImprovementKind = 'goal' | 'cycle';
export const IMPROVEMENT_KINDS: readonly ImprovementKind[] = ['goal', 'cycle'];

export interface ImprovementRecord extends Record<string, unknown> {
  readonly kind: ImprovementKind;
  readonly targetMarginPct?: number;
  readonly leverId?: LeverId;
  readonly expectedGainPt?: number;
  readonly beforePeriod?: string;
  readonly afterPeriod?: string;
}

/** 目標の営業利益率 (%) の幅。0 以下は目標でなく、100 以上は売上より利益が大きい。 */
export const TARGET_MARGIN_MIN_EXCLUSIVE = 0;
export const TARGET_MARGIN_MAX_EXCLUSIVE = 100;

function isTarget(n: unknown): n is number {
  return Number.isFinite(n) && (n as number) > TARGET_MARGIN_MIN_EXCLUSIVE && (n as number) < TARGET_MARGIN_MAX_EXCLUSIVE;
}

export function parseGoal(input: { targetMarginPct?: unknown }): ImprovementRecord {
  const read = readEntryNumber(input.targetMarginPct);
  if (read.kind === 'blank') throw new Error('目標の営業利益率が未入力です');
  // 読めない値には `value` が無く、`isTarget(undefined)` は偽なので、種類を先に問わなくても同じ答えになる (等価)。
  // Stryker disable next-line ConditionalExpression,StringLiteral: 上の理由。`unreadable` の枝は `value` を持たない
  if (read.kind === 'unreadable' || !isTarget(read.value)) {
    throw new Error(`目標の営業利益率は ${TARGET_MARGIN_MIN_EXCLUSIVE}% より大きく ${TARGET_MARGIN_MAX_EXCLUSIVE}% 未満の数で入力してください`);
  }
  return { kind: 'goal', targetMarginPct: read.value };
}

export function parseCycle(input: {
  leverId?: unknown;
  expectedGainPt?: unknown;
  beforePeriod?: unknown;
  afterPeriod?: unknown;
}): ImprovementRecord {
  const { leverId, beforePeriod, afterPeriod } = input;
  if (!(LEVER_IDS as readonly unknown[]).includes(leverId)) {
    throw new Error('打ち手が選ばれていません');
  }
  // `Number.isFinite` は数でない値 (文字列を含む) に偽を返すので、型を先に問わない。
  const gain = input.expectedGainPt as number;
  if (!Number.isFinite(gain) || !(gain > 0)) {
    throw new Error('見込みの利益率の増分は 0 より大きい数にしてください');
  }
  if (!isValidPeriod(beforePeriod) || !isValidPeriod(afterPeriod)) {
    throw new Error('月は YYYY-MM 形式にしてください');
  }
  if (!(afterPeriod > beforePeriod)) throw new Error('検証する月は、打ち手を選んだ月より後にしてください');
  return { kind: 'cycle', leverId: leverId as LeverId, expectedGainPt: gain, beforePeriod, afterPeriod };
}

export interface ImprovementState {
  /** 最新の目標 (無ければ null)。 */
  readonly targetMarginPct: number | null;
  /** 記録 (選んだ月の昇順・同じ月は作成順)。 */
  readonly cycles: readonly CycleRecord[];
  /** 読めなくて使わなかった行の id (画面が消す口を出す)。 */
  readonly unreadableIds: readonly string[];
}

function cycleOf(d: ImprovementRecord): CycleRecord | null {
  const { leverId, expectedGainPt, beforePeriod, afterPeriod } = d;
  try {
    const c = parseCycle({ leverId, expectedGainPt, beforePeriod, afterPeriod });
    return {
      leverId: c.leverId as LeverId,
      expectedGainPt: c.expectedGainPt as number,
      beforePeriod: c.beforePeriod as string,
      afterPeriod: c.afterPeriod as string,
    };
  } catch {
    return null;
  }
}

/** 保管した行から、目標と記録を読む。読めない行は使わず件数を返す (行は消さない)。 */
export function improvementState(records: readonly StoredRecord<ImprovementRecord>[]): ImprovementState {
  let target: { at: number; value: number } | null = null;
  const cycles: { at: number; cycle: CycleRecord }[] = [];
  const unreadableIds: string[] = [];
  const seen = new Set<string>();
  for (const r of records) {
    const d = r.data;
    if (d.kind === 'goal' && isTarget(d.targetMarginPct)) {
      if (target === null || r.createdAt >= target.at) target = { at: r.createdAt, value: d.targetMarginPct };
    } else if (d.kind === 'cycle') {
      const cycle = cycleOf(d);
      if (cycle === null) unreadableIds.push(r.id);
      else cycles.push({ at: r.createdAt, cycle });
    } else {
      unreadableIds.push(r.id);
    }
  }
  cycles.sort((a, b) => a.cycle.beforePeriod.localeCompare(b.cycle.beforePeriod) || a.at - b.at);
  // 同じ打ち手を同じ月に 2 度選んだ行は 1 件に畳む (最初の 1 件を残す)。2 度数えると外れが重なって人へ戻す止まりが誤って働く。
  const unique = cycles.filter((c) => {
    const key = `${c.cycle.leverId}|${c.cycle.beforePeriod}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  return { targetMarginPct: target === null ? null : target.value, cycles: unique.map((c) => c.cycle), unreadableIds };
}
