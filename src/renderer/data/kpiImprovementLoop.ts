/**
 * 事業KPIの月次改善の輪 (Plan → Do → Check → Act) の**判断の核**。純関数だけで、画面も保管も持たない。
 *
 * ## 人と機械の分担
 *
 * - **ゴール (目標の営業利益率) と実行は人が決める。** 機械は目標を作らず、打ち手を実行もしない。
 * - 機械がするのは 3 つ: ① 差を測る ② 打ち手の候補を試算で順位づける ③ 翌月の実績で当たったかを決定論で判定する。
 * - **AI は使わない。** 計算は `computeKpiMetrics` と同じ式で、同じ入力は必ず同じ答えを返す (深掘りの AI は別の口・既存の関門を通る)。
 *
 * ## 止まる規則 (無限ループの防止)
 *
 * 連続して `miss` が `MAX_CONSECUTIVE_MISSES` 回続いたら**人へ戻す** (`stop-for-human`)。
 * 外した打ち手は候補から外す。候補が尽きたときも人へ戻す。回数ではなく**外れ方**で止まるのは、
 * 当たっている間は続けてよく、外れが重なったときだけ前提 (目標・打ち手の効き方) が間違っているからである。
 *
 * ## 試算であって予測ではない
 *
 * 打ち手の刻み (`LEVER_STEPS`) は**仮定**で、効果は「その刻みだけ動けば」という算術である。
 * 画面は必ずそう述べる (`LEVER_ASSUMPTION_NOTE`)。外れたら外れたと判定される。
 */
import {
  computeKpiMetrics,
  readableKpiRows,
  summarizeFundamentals,
  type KpiActual,
  type KpiFundamentals,
} from './kpiActuals';

export type LeverId = 'cogs' | 'advertising' | 'sga' | 'revenue';

/** 連続してこの回数外したら人へ戻す。 */
export const MAX_CONSECUTIVE_MISSES = 3;
/** 見込みの何割以上動けば当たり / 部分的に当たり。 */
export const HIT_RATIO = 0.8;
export const PARTIAL_RATIO = 0.3;

/** 打ち手ごとの刻み (%)。**仮定**であって予測ではない。 */
export const LEVER_STEPS: Readonly<Record<LeverId, { readonly label: string; readonly stepPct: number }>> = {
  cogs: { label: '仕入・原価を下げる', stepPct: 3 },
  advertising: { label: '広告宣伝費を絞る', stepPct: 10 },
  sga: { label: '販管費 (固定費) を削る', stepPct: 5 },
  revenue: { label: '売上を伸ばす (変動費は比例)', stepPct: 5 },
};

export const LEVER_ASSUMPTION_NOTE =
  '候補の効果は「その刻みだけ動けば」という試算で、予測ではありません。翌月の実績で当たったかを判定します。';

export interface MonthSnapshot {
  readonly period: string;
  readonly revenue: number;
  readonly operatingProfit: number;
  /** 営業利益率 (%)。売上 0 は算定不能で null (0 と混ぜない)。 */
  readonly marginPct: number | null;
  readonly fundamentals: KpiFundamentals;
}

export interface MonthSnapshots {
  readonly snapshots: readonly MonthSnapshot[];
  /** 読めなくて除いた行数 (期・金額)。 */
  readonly dropped: number;
}

/** 売上が正であることを呼び手が確かめた後の営業利益率 (%)。 */
function marginWithRevenue(f: KpiFundamentals): number {
  return (computeKpiMetrics(f).operatingProfit / f.revenue) * 100;
}

function marginOf(f: KpiFundamentals): number | null {
  return f.revenue > 0 ? marginWithRevenue(f) : null;
}

/** 期ごと (事業は合算) の月次スナップショット。読めない行は除いて件数を返す。期の昇順。 */
export function monthSnapshots(actuals: readonly KpiActual[]): MonthSnapshots {
  const readable = readableKpiRows(actuals);
  const byPeriod = new Map<string, KpiActual[]>();
  for (const r of readable.rows) {
    const list = byPeriod.get(r.period) ?? [];
    list.push(r);
    byPeriod.set(r.period, list);
  }
  const snapshots = [...byPeriod.keys()]
    .sort()
    .map((period) => {
      const f = summarizeFundamentals(byPeriod.get(period)!);
      return {
        period,
        revenue: f.revenue,
        operatingProfit: computeKpiMetrics(f).operatingProfit,
        marginPct: marginOf(f),
        fundamentals: f,
      };
    });
  return { snapshots, dropped: readable.dropped };
}

export interface Lever {
  readonly id: LeverId;
  readonly label: string;
  readonly stepPct: number;
  /** 刻みだけ動いたときの営業利益の増分 (円)。 */
  readonly expectedProfitGain: number;
  /** 同じく営業利益率の増分 (ポイント)。 */
  readonly expectedMarginGainPt: number;
}

function applyLever(f: KpiFundamentals, id: LeverId, stepPct: number): KpiFundamentals {
  const k = stepPct / 100;
  switch (id) {
    case 'cogs':
      return { ...f, cogs: f.cogs * (1 - k) };
    case 'advertising':
      return { ...f, advertising: f.advertising * (1 - k) };
    case 'sga':
      return { ...f, sga: f.sga * (1 - k) };
    case 'revenue':
      return { ...f, revenue: f.revenue * (1 + k), cogs: f.cogs * (1 + k), advertising: f.advertising * (1 + k) };
  }
}

/** 打ち手の候補を、営業利益の増分が大きい順に返す。効果が 0 以下の打ち手と、除外した打ち手は出さない。 */
export function candidateLevers(base: KpiFundamentals, exclude: ReadonlySet<LeverId> = new Set()): Lever[] {
  // 売上 0 は利益率が算定できない。どの打ち手も売上を 0 のまま残すので、ここで全部を断つ。
  if (!(base.revenue > 0)) return [];
  const baseMargin = marginWithRevenue(base);
  const baseProfit = computeKpiMetrics(base).operatingProfit;
  const out: Lever[] = [];
  for (const id of Object.keys(LEVER_STEPS) as LeverId[]) {
    if (exclude.has(id)) continue;
    const { label, stepPct } = LEVER_STEPS[id];
    const after = applyLever(base, id, stepPct);
    const gain = computeKpiMetrics(after).operatingProfit - baseProfit;
    if (!(gain > 0)) continue;
    out.push({ id, label, stepPct, expectedProfitGain: gain, expectedMarginGainPt: marginWithRevenue(after) - baseMargin });
  }
  return out.sort((a, b) => b.expectedProfitGain - a.expectedProfitGain);
}

export type Verdict = 'hit' | 'partial' | 'miss' | 'unreadable';

/**
 * 翌月の実績で、打ち手が見込みどおり効いたかを決める。
 * どちらかの利益率が算定不能 (売上 0)・見込みが正でないときは `unreadable` —— **外れに数えない**
 * (測れなかったことを「外した」と言うと、人へ戻す止まりが誤って働く)。
 */
export function judgeCycle(expectedGainPt: number, before: number | null, after: number | null): Verdict {
  if (before === null || after === null || !Number.isFinite(expectedGainPt) || !(expectedGainPt > 0)) {
    return 'unreadable';
  }
  const ratio = (after - before) / expectedGainPt;
  if (ratio >= HIT_RATIO) return 'hit';
  if (ratio >= PARTIAL_RATIO) return 'partial';
  return 'miss';
}

/** 保管する 1 周の記録 (人が選んだ打ち手と、そのときの見込み)。 */
export interface CycleRecord {
  readonly leverId: LeverId;
  readonly expectedGainPt: number;
  /** 打ち手を選んだ時点の月。 */
  readonly beforePeriod: string;
  /** 効いたかを見る月 (翌月)。 */
  readonly afterPeriod: string;
}

export interface JudgedCycle extends CycleRecord {
  /** 検証する月の実績がまだ無ければ null (待ち)。 */
  readonly verdict: Verdict | null;
}

/** 記録ごとに、実績が届いていれば判定する。届いていなければ `verdict: null` (待ち)。 */
export function judgeCycles(cycles: readonly CycleRecord[], snapshots: readonly MonthSnapshot[]): JudgedCycle[] {
  const marginAt = new Map(snapshots.map((s) => [s.period, s.marginPct] as const));
  return cycles.map((c) => {
    if (!marginAt.has(c.afterPeriod) || !marginAt.has(c.beforePeriod)) return { ...c, verdict: null };
    return {
      ...c,
      verdict: judgeCycle(c.expectedGainPt, marginAt.get(c.beforePeriod)!, marginAt.get(c.afterPeriod)!),
    };
  });
}

export type NextStep =
  | { readonly kind: 'no-data' }
  | { readonly kind: 'blank'; readonly reason: string }
  | { readonly kind: 'goal-reached'; readonly marginPct: number }
  | { readonly kind: 'await-actuals'; readonly period: string }
  | { readonly kind: 'stop-for-human'; readonly reason: string }
  | { readonly kind: 'propose'; readonly gapPt: number; readonly levers: readonly Lever[] };

function trailingMisses(judged: readonly JudgedCycle[]): number {
  let n = 0;
  for (let i = judged.length - 1; i >= 0; i--) {
    const v = judged[i]!.verdict;
    if (v === 'miss') n += 1;
    else if (v === 'unreadable') continue; // 測れなかった周は数えず、連続も切らない
    else break; // hit / partial / 待ち
  }
  return n;
}

/** 目標・月次の実績・これまでの記録から、次に何をするかを決める (Act)。 */
export function nextStep(
  targetMarginPct: number,
  snapshots: readonly MonthSnapshot[],
  cycles: readonly CycleRecord[],
): NextStep {
  const latest = snapshots[snapshots.length - 1];
  if (latest === undefined) return { kind: 'no-data' };
  if (latest.marginPct === null) {
    return { kind: 'blank', reason: `${latest.period} は売上が 0 のため営業利益率を算定できません。` };
  }
  const judged = judgeCycles(cycles, snapshots);
  const waiting = judged.find((c) => c.verdict === null);
  if (waiting !== undefined) return { kind: 'await-actuals', period: waiting.afterPeriod };
  if (latest.marginPct >= targetMarginPct) return { kind: 'goal-reached', marginPct: latest.marginPct };
  if (trailingMisses(judged) >= MAX_CONSECUTIVE_MISSES) {
    return {
      kind: 'stop-for-human',
      reason: `見込みを外す周が連続 ${MAX_CONSECUTIVE_MISSES} 回に達しました。目標か打ち手の前提を見直してください。`,
    };
  }
  const missed = new Set(judged.filter((c) => c.verdict === 'miss').map((c) => c.leverId));
  const levers = candidateLevers(latest.fundamentals, missed);
  if (levers.length === 0) {
    return { kind: 'stop-for-human', reason: '試せる打ち手の候補が尽きました。人が新しい打ち手を考えてください。' };
  }
  return { kind: 'propose', gapPt: targetMarginPct - latest.marginPct, levers };
}
