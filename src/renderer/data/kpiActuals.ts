/**
 * KPI actuals — real, user-entered monthly business figures persisted via
 * the local record store (`data/store.ts`). This is the first dashboard
 * feature backed by real data rather than the mock snapshot: the user enters
 * monthly 実績 and the KPI tiles recompute from them.
 *
 * The break-even formula here mirrors the canonical one in
 * `src/main/clients/kpi.ts` (`computeKpi`). It is re-stated rather than
 * imported because the renderer must not import from the main process
 * (enforced by `lint:imports`); both derive from docs/ARCHITECTURE.md §3.
 */

import { DASH } from '../../shared/formatters';
import { finiteOrNull } from '../../shared/num';
import { isCalendarMonth } from '../../shared/isoDate';
import { relationIssue } from './recordRelations';
import { moreThanChars } from '../../shared/inputCeiling';

export const KPI_ACTUALS_COLLECTION = 'kpi-actuals';

/** One month of raw business figures (JPY). */
export interface KpiActual extends Record<string, unknown> {
  /** Period label, `YYYY-MM`. */
  readonly period: string;
  /** Free-form business unit label (e.g. "EC", "全社"). */
  readonly unit: string;
  readonly revenue: number;
  readonly cogs: number;
  readonly advertising: number;
  readonly sga: number;
  readonly depreciation: number;
  /** 人件費 (販管費の内数。労働分配率・人件費率に使う)。任意。 */
  readonly laborCost?: number;
}

export interface KpiFundamentals {
  revenue: number;
  cogs: number;
  advertising: number;
  sga: number;
  depreciation: number;
}

export interface KpiMetrics {
  variableCost: number;
  fixedCost: number;
  contribution: number;
  /**
   * 限界利益率 (%) = (売上 − 変動費) ÷ 売上。**売上 0 なら null = 算定不能。**
   * 0 に倒すと「変動費が売上をすべて食っている」という主張になり、
   * 同じ入力から同じ比率を出す `financialStatements.ts` (null → 「—」) と
   * 食い違う。姉妹欄 `safetyMargin` と同じ答え方。
   */
  contributionRatio: number | null;
  bep: number;
  bepRatio: number;
  /**
   * 安全余裕率 (%)。**負になりうる** (損益分岐点を下回っている)。
   * `null` は算定不能 —— 限界利益が 0 以下で損益分岐点が存在しない。
   * 経緯と理由は `src/main/clients/kpi.ts` の同名の欄 (両ビルドで同じ規則)。
   */
  safetyMargin: number | null;
  operatingProfit: number;
}

/** `YYYY-MM`, months 01-12 (判定は `shared/isoDate.ts` の 1 か所 —— パス 115)。 */
export function isValidPeriod(s: unknown): s is string {
  return isCalendarMonth(s);
}

/**
 * 期の一覧が覆う**窓** —— 最初の期・最後の期・**月の異なり数**。
 *
 * 「この数字は何か月分か」を述べる所すべてが同じ答えを使うための 1 か所。
 * 読める期 (`isValidPeriod`) が 1 件も無ければ `null` —— 期間を測れないことと
 * 「0 か月」は別なので 0 に倒さない。
 *
 * **月数は必ず添える**: 範囲だけでは事業年度の端の 2 か月しか無い控えを
 * 「ちょうど 1 年」と読めてしまう (`bankSubmission.ts` の `periodScopeNote` の経緯)。
 */
export interface PeriodWindow {
  readonly from: string;
  readonly to: string;
  readonly months: number;
}

/** 期の一覧から窓を取る。読めない期は無視。同じ月の複数行は 1 か月。 */
export function periodWindow(periods: readonly string[]): PeriodWindow | null {
  const valid = periods.filter(isValidPeriod).sort();
  if (valid.length === 0) return null;
  return { from: valid[0]!, to: valid[valid.length - 1]!, months: new Set(valid).size };
}

/**
 * **期が読める行だけを通す漏斗** (パス 225)。落とした件数を添える。
 *
 * ## なぜ要るのか (2026-09-14 実測)
 *
 * 期の綴りは書き手 (`parseKpiActual`) が `YYYY-MM` を強制するが、**復元の入口は
 * 文字列であることだけを見る** (`collectionShapes.ts` の宣言どおり・パス 224 で
 * `per-field` と裁定した組)。だから古い版・手で直した JSON・別の道具が書いた控えは
 * `period: '全社'` のような行を持ち込める。
 *
 * そのとき **同じ関数の中で、期間は選別して金額は選別していなかった**:
 *
 * | | 素の 4 期 | + 期が読めない 1 行 (売上 900 万) |
 * | --- | ---: | ---: |
 * | 刷られる対象期間 | 2026-01〜2026-04・4 か月 | **同じ** (`periodWindow` は選別する) |
 * | 合計売上 | ¥4,600,000 | **¥13,600,000** (`summarizeFundamentals` は選別しない) |
 * | 着地見込み 対象年 | 2026 | **「全社」** |
 * | 年換算 | ¥13,800,000 | **¥108,000,000** |
 * | 前月比 / CAGR | 8.3% / 9.1% | **592.3% / 73.2%** |
 *
 * 月数は選別後の 4 で、分子は選別前の 1,360 万 —— 月商が ¥3,400,000 になる
 * (実際の 4 か月の月商は ¥1,150,000)。回転日数・借入金月商倍率・スコアカードの
 * 効率性がこの月商で決まるので、**パス 48 と同じ家系**である。
 *
 * **だから片側ではなく両側を選別する。** そして落としたことは言う ——
 * 黙って落とす防御は、落としたことを誰かが言わなければ嘘になる (パス 219 / 222)。
 */
export interface ReadablePeriodRows<T> {
  /** 期が `YYYY-MM` として読める行。 */
  readonly rows: readonly T[];
  /** 落とした行数。 */
  readonly dropped: number;
}

/** 期が読める行だけを返す。判定は `isValidPeriod` の 1 か所 (綴りを写さない)。 */
export function readablePeriodRows<T extends { readonly period: string }>(
  input: readonly T[],
): ReadablePeriodRows<T> {
  const rows = input.filter((r) => isValidPeriod(r.period));
  return { rows, dropped: input.length - rows.length };
}

/**
 * 期が読めない行を落としたことを述べる 1 文。落としていなければ `null`。
 * 画面向け (`kind` = 実績 / 予算) —— 相手に渡る面は `unreadablePeriodSheetNote`。
 */
export function unreadablePeriodNote(kind: string, dropped: number): string | null {
  // **肯定形で書く。** `dropped <= 0` は `undefined <= 0` が false なので
  // **`undefined` を通してしまう** —— 2026-09-14 に実際にやり、`buildManagementReport` の
  // golden 検査が「読めない undefined 件」を突き返した (手で組んだ overview に新しい欄が
  // 無かった)。非有限・未定義は「言うことが無い」と同じ扱い (パス 98 / 201 / 203 の規則)。
  if (!(Number.isFinite(dropped) && dropped > 0)) return null;
  return `${kind}のうち ${dropped} 件は期 (YYYY-MM) が読めないため、集計・期間・成長率のすべてから除いています。バックアップの復元や古い版で入った控えの可能性があります（設定の「形式の合わない記録」から消せます）。`;
}

/** 同じことを、相手に渡る書面・レポート向けの 1 文で。 */
export function unreadablePeriodSheetNote(dropped: number): string | null {
  // 画面側と同じ肯定形 (`undefined` / NaN は言わない)。
  if (!(Number.isFinite(dropped) && dropped > 0)) return null;
  return `期 (YYYY-MM) が読めない ${dropped} 件は集計から除いています。`;
}

/** 窓を画面・レポート向けの 1 語にする (`2026-04〜2026-06・3 か月`)。 */
export function formatPeriodWindow(w: PeriodWindow): string {
  return `${w.from}〜${w.to}・${w.months} か月`;
}

/** Validate + coerce a partial input into a clean KpiActual, or throw with a
 *  user-facing message. Numbers must be finite and non-negative. */
/**
 * 事業名の天井 —— **単位は文字**。2026-09-23 (パス 422) まで裸の `64` を
 * `unit.length`(UTF-16 コード単位) と比べており、文面は「1〜64 文字」と言うのに
 * **絵文字 33 個 (= 33 文字 / 66 コード単位) を断って**いた (実測)。
 * 名前を付けたので `ceilingUnitCensus` (`MAX_*_CHARS` の走査) が自動で覆う ——
 * パス 196 がこの家系を閉じたときと同じ直し方で、**新しい規則を足さずに済む**。
 */
export const MAX_KPI_UNIT_CHARS = 64;

export function parseKpiActual(input: {
  period?: unknown;
  unit?: unknown;
  revenue?: unknown;
  cogs?: unknown;
  advertising?: unknown;
  sga?: unknown;
  depreciation?: unknown;
  laborCost?: unknown;
}): KpiActual {
  if (!isValidPeriod(input.period)) throw new Error('期間は YYYY-MM 形式で入力してください');
  const unit = typeof input.unit === 'string' ? input.unit.trim() : '';
  if (unit.length === 0 || moreThanChars(unit, MAX_KPI_UNIT_CHARS)) {
    throw new Error(`事業名は 1〜${MAX_KPI_UNIT_CHARS} 文字で入力してください`);
  }

  const num = (v: unknown, label: string): number => {
    // Number(number)===number なので typeof 分岐は不要 (equivalent mutant 排除)。
    const n = Number(v);
    if (!Number.isFinite(n) || n < 0) throw new Error(`${label}は 0 以上の数値で入力してください`);
    return n;
  };

  const sga = num(input.sga, '販管費');
  const base: KpiActual = {
    period: input.period,
    unit,
    revenue: num(input.revenue, '売上高'),
    cogs: num(input.cogs, '売上原価'),
    advertising: num(input.advertising, '広告費'),
    sga,
    depreciation: num(input.depreciation, '減価償却費'),
  };
  // 人件費は任意。未入力 ('' / null) のときはフィールド自体を持たせない。
  if (input.laborCost != null && input.laborCost !== '') {
    const laborCost = num(input.laborCost, '人件費');
    // 人件費 ≦ 販管費 は **台帳 1 つ** (`recordRelations.ts`) —— 復元の入口も同じ関係を
    // 見る (パス 224。それまでは復元が通し、計算書類の取り込みが「人件費以外の販管費は
    // 0 とした」と断りながら進んでいた)。実績と予算は同じ関係。
    const out = { ...base, laborCost };
    const issue = relationIssue(KPI_ACTUALS_COLLECTION, out);
    if (issue !== null) throw new Error(issue);
    return out;
  }
  return base;
}

/** Sum a set of actuals into a single Fundamentals roll-up. */
export function summarizeFundamentals(actuals: readonly KpiActual[]): KpiFundamentals {
  return actuals.reduce<KpiFundamentals>(
    (acc, a) => ({
      revenue: acc.revenue + a.revenue,
      cogs: acc.cogs + a.cogs,
      advertising: acc.advertising + a.advertising,
      sga: acc.sga + a.sga,
      depreciation: acc.depreciation + a.depreciation,
    }),
    { revenue: 0, cogs: 0, advertising: 0, sga: 0, depreciation: 0 },
  );
}

/** 1 期 (`period` = YYYY-MM) の合計売上。期の昇順。 */
export interface PeriodRevenue {
  readonly period: string;
  readonly revenue: number;
}

/**
 * 実績を期 (`period` = YYYY-MM) でグルーピングし、合計売上を期の昇順で返す。
 * 成長性系の指標 (前期比 / CAGR / トレンド) が共通で使う土台。
 */
export function groupRevenueByPeriod(actuals: readonly KpiActual[]): PeriodRevenue[] {
  const byPeriod = new Map<string, number>();
  // 期が読めない行は系列に入れない (パス 225 —— 入れると「対象年 全社」の
  // 着地見込みや 592.3% の前月比が出る)。
  for (const a of readablePeriodRows(actuals).rows) {
    byPeriod.set(a.period, (byPeriod.get(a.period) ?? 0) + a.revenue);
  }
  return [...byPeriod.entries()]
    .sort((x, y) => x[0].localeCompare(y[0]))
    .map(([period, revenue]) => ({ period, revenue }));
}

/** 1 期 (`period` = YYYY-MM) の営業利益。期の昇順。 */
export interface PeriodOperatingProfit {
  readonly period: string;
  readonly operatingProfit: number;
}

/**
 * 実績を期でグルーピングし、各期の営業利益を期の昇順で返す。
 * 期ごとに Fundamentals を合算してから `computeKpiMetrics` で営業利益を出す
 * (期内の複数事業を合算した上での営業利益)。
 */
export function groupOperatingProfitByPeriod(
  actuals: readonly KpiActual[],
): PeriodOperatingProfit[] {
  const byPeriod = new Map<string, KpiActual[]>();
  // 期が読めない行は系列に入れない (パス 225)。
  for (const a of readablePeriodRows(actuals).rows) {
    const list = byPeriod.get(a.period) ?? [];
    list.push(a);
    byPeriod.set(a.period, list);
  }
  return [...byPeriod.entries()]
    .sort((x, y) => x[0].localeCompare(y[0]))
    .map(([period, rows]) => ({
      period,
      operatingProfit: computeKpiMetrics(summarizeFundamentals(rows)).operatingProfit,
    }));
}

/** 月次推移サマリーの 1 期分 (期昇順)。 */
export interface MonthlyTrendRow {
  readonly period: string;
  readonly revenue: number;
  readonly operatingProfit: number;
  /** 営業利益率 (%)。売上 0 なら 0。 */
  /** 営業利益率 (%)。**その月の売上が 0 なら null = 算定不能** (0 に倒さない)。 */
  readonly operatingMarginPct: number | null;
  /** 前期比の売上成長率 (%)。先頭期や前期売上 0 なら null。 */
  readonly revenueGrowthPct: number | null;
}

/**
 * 期 (YYYY-MM) ごとに売上・営業利益・利益率・前期比成長率をまとめた月次推移を返す。
 * 期内の複数事業は合算。経営サマリーの「月次推移」テーブルやレポートに使う。
 */
export function monthlyTrendSeries(actuals: readonly KpiActual[]): MonthlyTrendRow[] {
  const byPeriod = new Map<string, KpiActual[]>();
  for (const a of actuals) {
    const list = byPeriod.get(a.period) ?? [];
    list.push(a);
    byPeriod.set(a.period, list);
  }
  const periods = [...byPeriod.keys()].sort((x, y) => x.localeCompare(y));
  const rows: MonthlyTrendRow[] = [];
  let prevRevenue: number | null = null;
  for (const period of periods) {
    const f = summarizeFundamentals(byPeriod.get(period)!);
    const m = computeKpiMetrics(f);
    // prevRevenue !== null は型を number に絞るため (> 0・減算に必要) だが、null は
    // `null > 0 === false` で右辺に弾かれ、2 期目以降は常に number のため、この左辺
    // ガードを true 固定する変異は実行時 equivalent。
    // Stryker disable next-line ConditionalExpression
    const revenueGrowthPct = prevRevenue !== null && prevRevenue > 0
      ? Math.round(((f.revenue - prevRevenue) / prevRevenue) * 1000) / 10
      : null;
    rows.push({
      period,
      revenue: f.revenue,
      operatingProfit: m.operatingProfit,
      operatingMarginPct: f.revenue > 0 ? Math.round((m.operatingProfit / f.revenue) * 1000) / 10 : null,
      revenueGrowthPct,
    });
    prevRevenue = f.revenue;
  }
  return rows;
}

/** 前年同月比 (YoY) の結果。 */
export interface YoYComparison {
  /** 比較対象の期 (最新期, YYYY-MM)。 */
  readonly period: string;
  /** 前年同月の期 (YYYY-MM)。 */
  readonly priorPeriod: string;
  /** 最新期の売上。 */
  readonly revenue: number;
  /** 前年同月の売上。 */
  readonly priorRevenue: number;
  /** 前年同月比の売上成長率 (%)。前年売上が 0 以下なら null。 */
  readonly revenueYoYPct: number | null;
}

/** 期ラベル YYYY-MM の 12 か月前を返す。 */
function yearEarlier(period: string): string | null {
  // 'YYYY-MM' 以外でも部分一致を防ぐアンカーだが、本関数は series 由来の期にのみ
  // 使われ、アンカー有無の差が出力に出ない (equivalent) ため Regex を無効化する。
  // Stryker disable next-line Regex
  const m = /^(\d{4})-(\d{2})$/.exec(period);
  if (!m) return null;
  const year = Number(m[1]) - 1;
  return `${year}-${m[2]}`;
}

/**
 * 最新期と「その前年同月」の売上を比較し前年同月比 (YoY) を返す。
 *
 * 期 (YYYY-MM) でグルーピングした合計売上を用い、最新期の 12 か月前の期が
 * データに存在するときのみ算定する。前年同月が無い、または前年売上が 0 以下なら
 * null (比較対象なし)。季節性を排した実質的な成長を見るのに使う。
 */
export function computeYoYGrowth(actuals: readonly KpiActual[]): YoYComparison | null {
  const series = groupRevenueByPeriod(actuals);
  if (series.length === 0) return null;
  const latest = series[series.length - 1]!;
  const priorPeriod = yearEarlier(latest.period);
  // priorPeriod===null のときも下の series.find(...===null) が見つからず null を返すため、
  // この早期 return の ConditionalExpression は equivalent。
  // Stryker disable next-line ConditionalExpression
  if (priorPeriod === null) return null;
  const prior = series.find((s) => s.period === priorPeriod);
  if (!prior) return null;
  const revenueYoYPct = prior.revenue > 0
    ? Math.round(((latest.revenue - prior.revenue) / prior.revenue) * 1000) / 10
    : null;
  return {
    period: latest.period,
    priorPeriod,
    revenue: latest.revenue,
    priorRevenue: prior.revenue,
    revenueYoYPct,
  };
}

/** 人件費の合計 (未入力の期は 0 として扱う)。 */
export function summarizeLaborCost(actuals: readonly KpiActual[]): number {
  return actuals.reduce((acc, a) => acc + (a.laborCost ?? 0), 0);
}

/** 労働生産性・人件費の効率指標。人件費が無ければ各値は null。 */
export interface LaborMetrics {
  /** 人件費合計。 */
  readonly laborCost: number;
  /** 労働分配率 (%) = 人件費 ÷ 粗利益 (付加価値の近似)。粗利が 0 以下なら null。 */
  readonly laborSharePct: number | null;
  /** 人件費率 (%) = 人件費 ÷ 売上。売上が 0 なら null。 */
  readonly laborToRevenuePct: number | null;
  /** 一人当たり人件費。メンバーが 0 なら null。 */
  readonly laborPerCapita: number | null;
}

/**
 * 人件費の効率指標 (労働分配率・人件費率・一人当たり人件費) を計算する。
 * 労働分配率は人件費 ÷ 粗利益 (= 売上 − 売上原価) を付加価値の簡便代理とする。
 * 人件費が 0 (未入力) のときは「データ無し」として全て null を返す。
 */
export function computeLaborMetrics(
  actuals: readonly KpiActual[],
  members: number,
): LaborMetrics {
  const laborCost = summarizeLaborCost(actuals);
  if (laborCost <= 0) {
    return { laborCost: 0, laborSharePct: null, laborToRevenuePct: null, laborPerCapita: null };
  }
  const f = summarizeFundamentals(actuals);
  const grossProfit = f.revenue - f.cogs;
  const pct = (numer: number, denom: number): number | null =>
    denom > 0 ? Math.round((numer / denom) * 1000) / 10 : null;
  return {
    laborCost,
    laborSharePct: pct(laborCost, grossProfit),
    laborToRevenuePct: pct(laborCost, f.revenue),
    laborPerCapita: members > 0 ? Math.round(laborCost / members) : null,
  };
}

/**
 * 売上高を分母にする比率がまとめて空欄になる理由の一文。
 *
 * 売上 0 のとき `pctOfRevenue` 由来の 6 欄と `contributionRatio` / `safetyMargin`
 * はすべて `null` (算定不能) になる。**空欄の理由を書かないと入力漏れと区別できない**
 * ので、金融機関等提出用の書面 §1 と経営レポートの損益節が**同じ文**を出す
 * (同じ数字を刷る面が 2 つあるなら断り書きも 2 つ要る — パス 50 の教訓)。
 */
export function zeroRevenueRatioNote(): string {
  return (
    '対象期間の売上高が 0 のため、売上高を分母とする比率（売上総利益率・営業利益率・EBITDA マージン・売上原価率・広告宣伝費率・販売費及び一般管理費率・限界利益率・安全余裕率）は算定していません。' +
    // ★ 2026-09-22 (パス 395) に足した 1 文。**この文は空欄を列挙するので、
    // 列挙から漏れた 1 つは「別の理由で空」と読める。** 実測 (売上 0 / 販管費 30 万で
    // 書面を組む) では §1 の空欄は 9 行で、上の括弧が名指しするのは 8 行 ——
    // 漏れていたのは `損益分岐点売上高` で、**限界利益率と安全余裕率の間に挟まった 1 行**
    // だった。同じ状態を画面は `ZERO_REVENUE_BEP_REASON` で 3 つとも名指しし、
    // 限界利益 ≤ 0 の側は `noBepSheetNote` が損益分岐点売上高を名指しする ——
    // **売上 0 のときだけ、この 1 行が紙の上で説明を持たなかった。**
    //
    // 比率の括弧には入れない —— 損益分岐点売上高は**比率ではなく金額**なので、
    // 「売上高を分母とする比率（…）」の列挙に混ぜると種類として誤りになる。
    // 別の文にして、**上で空と述べた限界利益率から導く** (割るべき率が無い)。
    '損益分岐点売上高（固定費 ÷ 限界利益率）も、限界利益率が算定できないため算定していません。'
  );
}

/**
 * **成長性の欄が空になる理由の一文** (2026-09-22 · パス 395)。
 *
 * 書面 §7「成長性」は 2026-09-22 まで `caption: has ? null : 'KPI 実績が未入力…'`
 * だったので、**実績が 1 期でも在れば caption は null** になり、
 * 4 行が理由なしで `―` のまま並んでいた。実測 (状態 7 通りで書面を組む) では
 * §7 は **7 状態のうち 6 つで「空欄が在るのに caption が無い」唯一の節**だった ——
 * 唯一の例外は実績 0 件のとき (そのときだけ上の枝が働く)。
 *
 * ## 3 つのしきい値が別々である (実測 2026-09-22)
 *
 * | 期の数 | 前期比 / CAGR | 売上トレンド | 前年同月比 |
 * | ---: | --- | --- | --- |
 * | 1 | ― | ― | ― |
 * | 2〜3 | 算定 | ― | ― |
 * | 4〜12 | 算定 | 算定 | ― |
 * | 13 | 算定 | 算定 | 算定 |
 *
 * トレンドは移動平均なので `window + 1` 期 (既定 4)、前年同月比は
 * **前年同月の実績そのもの**が要る。だから 1 つの数 (「2 期以上」等) では
 * 説明できない —— **文はしきい値を写さず、値から組む**。写すと
 * `computeRevenueTrend` の窓を変えた日に紙が嘘をつく。
 *
 * ## 画面とレポートは正しく黙っている (実測)
 *
 * 画面は成長の枠を `revenueGrowthPct !== null || revenueCagrPct !== null` で
 * 丸ごと隠し、前年同月比のタイルは `yoy &&` で隠す。レポートは
 * `if (k.revenueGrowthPct !== null)` の行だけを積む。**空欄を出さない面に
 * 理由は要らない** (パス 388 の `silent-but-correct`)。空欄を出すのは書面だけで、
 * その書面だけが黙っていた —— パス 387 とまったく同じ向きである。
 */
export function growthBlankSheetNote(m: {
  readonly revenueGrowthPct: number | null;
  readonly revenueCagrPct: number | null;
  readonly revenueTrend: RevenueTrend;
  readonly yoy: YoYComparison | null;
}): string | null {
  const needPeriods: string[] = [];
  if (m.revenueGrowthPct === null) needPeriods.push('前期比売上高成長率');
  if (m.revenueCagrPct === null) needPeriods.push('平均成長率（CAGR）');
  if (m.revenueTrend === null) needPeriods.push('売上トレンド');
  const parts: string[] = [];
  if (needPeriods.length > 0) {
    parts.push(`比べられる期がまだ揃っていないため、${needPeriods.join('・')}は算定していません（期を追加すると算定します）。`);
  }
  // 書面の行は `yoy === null ? BLANK : pct(yoy.revenueYoYPct)` で、`pct(null)` も
  // 空欄になる (パス 229) —— **空欄になる条件のほうを写す**。
  if (m.yoy === null || m.yoy.revenueYoYPct === null) {
    parts.push('前年同月の実績が無いため、前年同月比は算定していません。');
  }
  return parts.length === 0 ? null : parts.join('');
}


/**
 * **損益分岐点が存在しないために欄が空になる理由の一文** (2026-09-22 · パス 387)。
 *
 * `bep` が非有限 = 限界利益 ≤ 0 = *どれだけ売っても固定費を回収できない*。
 * このとき書面の「損益分岐点売上高」と「安全余裕率」は 2 行まとめて `―` になる。
 *
 * ## なぜ書面に要るか (実測)
 *
 * 2026-09-22 に金融機関等提出用の書面を限界利益 ≤ 0 の実績で組むと:
 *
 * ```
 * 損益分岐点売上高 = ―   (注記「固定費 ÷ 限界利益率」)
 * 安全余裕率       = ―   (注記「(売上高 − 損益分岐点売上高) ÷ 売上高」)
 * ```
 *
 * **理由は書面のどこにも出ていなかった** —— 同じ状態を経営レポートは
 * 経営ハイライトの critical 所見として述べ (実測で在った)、画面は
 * `bepDisplay` が `—` + 理由で述べる (パス 386)。**相手に渡る書面だけが黙っていた。**
 *
 * しかも残る注記は**算式**なので、この状態では読み手に嘘を言う ——
 * 「固定費 ÷ 限界利益率」は*割った結果が空欄*だと読ませるが、実際は
 * **割るべき点が存在しない**。空欄の理由が書かれていなければ、読み手は
 * これを入力漏れと区別できない (`zeroRevenueRatioNote` と同じ論法。
 * 書面は「上記のとおり相違ありません。」で代表者名つきで終わる)。
 *
 * ## 売上 0 のときは出さない
 *
 * 売上高が 0 なら `bep` も非有限になるが、そのときは
 * `zeroRevenueRatioNote` のほうが情報量が多く、安全余裕率を二重に名指しする。
 * `managementHighlights` も同じ理由で `if (k.revenue > 0)` を門にしている ——
 * **同じ判断を同じ向きで揃える**。
 */
export function noBepSheetNote(bep: number): string | null {
  if (Number.isFinite(bep)) return null;
  return '限界利益が 0 以下のため、損益分岐点売上高と安全余裕率は算定していません（どれだけ売っても固定費を回収できない状態です）。';
}

/**
 * 一人当たりの金額がまとめて空欄になる理由の一文 (従業員が 1 名も登録されていない)。
 * 分母が 0 なので `revenuePerCapita` / `operatingProfitPerCapita` /
 * `labor.laborPerCapita` はすべて `null`。
 */
export function zeroMembersPerCapitaNote(): string {
  return '従業員が 1 名も登録されていないため、一人当たりの金額は算定していません。メンバーを登録すると算定します。';
}

/**
 * 直近期と前期の売上から売上高成長率 (%) を計算する。
 *
 * 期 (`period` = YYYY-MM) でグルーピングして合計売上を出し、最新月を前月と
 * 比較する。期が 2 つ未満なら null (成長率を算定できない)。前期売上が 0 の
 * ときも null (ゼロ除算回避)。
 */
export function computeRevenueGrowthPct(actuals: readonly KpiActual[]): number | null {
  const series = groupRevenueByPeriod(actuals);
  if (series.length < 2) return null;
  const latest = series[series.length - 1]!.revenue;
  const prior = series[series.length - 2]!.revenue;
  if (prior <= 0) return null;
  return Math.round(((latest - prior) / prior) * 1000) / 10;
}

/**
 * 期間全体の平均成長率 (CAGR 相当, 1 期あたり %) を計算する。
 *
 * 最初の期から最後の期までの複利成長率 = (最終売上 / 最初売上)^(1/(期数−1)) − 1。
 * 月次データなら「1 か月あたりの平均成長率」になる。期が 2 つ未満、または
 * 最初の期の売上が 0 以下なら null (算定不能 / 累乗の底が不正)。
 * 結果は 0.1% 単位に丸める。
 */
export function computeRevenueCagrPct(actuals: readonly KpiActual[]): number | null {
  const series = groupRevenueByPeriod(actuals);
  if (series.length < 2) return null;
  const first = series[0]!.revenue;
  const last = series[series.length - 1]!.revenue;
  const periods = series.length - 1;
  const rate = Math.pow(last / first, 1 / periods) - 1;
  // first===0 は last/first が ±Infinity、負の底 (実データ外) は NaN になり rate が
  // 非有限になる。この単一ガードが「最初の期が 0 → 算定不能 → null」を担う
  // (上流で売上は非負のため到達するのは first===0 のケースのみ)。
  if (!Number.isFinite(rate)) return null;
  return Math.round(rate * 1000) / 10;
}

/** 売上トレンドの方向。期が足りない場合は null。 */
export type RevenueTrend = 'up' | 'down' | 'flat' | null;

/**
 * 直近の売上トレンドを移動平均で判定する。
 *
 * 末尾 `window` 期の移動平均と、その 1 期前を末尾とする移動平均を比べ、
 * 上昇 / 下降 / 横ばい (±1% 未満) を返す。比較に必要な `window + 1` 期に満たな
 * ければ null。`window` は 1 以上 (既定 3)。
 */
export function computeRevenueTrend(actuals: readonly KpiActual[], window = 3): RevenueTrend {
  const w = Math.max(1, Math.floor(window));
  const series = groupRevenueByPeriod(actuals);
  if (series.length < w + 1) return null;
  const mean = (from: number): number => {
    let sum = 0;
    for (let i = from; i < from + w; i += 1) sum += series[i]!.revenue;
    // change = (recent-prior)/prior では 1/w の係数が約分で打ち消えるため、平均でも
    // 合計でもトレンド判定は同値 (sum*w 変異は equivalent)。可読性のため平均にする。
    // Stryker disable next-line ArithmeticOperator
    return sum / w;
  };
  const recent = mean(series.length - w);
  const prior = mean(series.length - w - 1);
  // prior===0 (直前窓の売上が全て 0) のとき change は recent>0 → +Infinity → 'up'、
  // recent===0 → NaN → どちらの閾値にも該当せず 'flat' となり、ゼロ除算でも正しい
  // 方向に落ちる。明示ガードは不要 (IEEE 演算が同値を与える)。
  const change = (recent - prior) / prior;
  if (change > 0.01) return 'up';
  if (change < -0.01) return 'down';
  return 'flat';
}

/** 当年度の売上着地見込み (年換算)。 */
export interface RevenueLandingForecast {
  /** 対象年 (最新の期の YYYY)。 */
  readonly year: string;
  /** その年のうちデータがある月数 (経過月)。 */
  readonly monthsElapsed: number;
  /** 経過月までの実績売上合計。 */
  readonly actualToDate: number;
  /** 着地見込み = 実績 ÷ 経過月 × 12 (ランレート年換算, 円単位に丸め)。 */
  readonly runRateForecast: number;
}

/**
 * 直近年の月次実績から、当年度の売上着地見込み (ランレート年換算) を計算する。
 *
 * 最新の期 (`period` = YYYY-MM) の年 (YYYY) を対象年とし、その年のデータがある
 * 月の実績を合計して「実績 ÷ 経過月 × 12」で 12 か月分に年換算する。対象年に
 * データが無ければ null。経営の着地予測の最も素朴な指標 (季節性は考慮しない)。
 */
export function computeRevenueLandingForecast(
  actuals: readonly KpiActual[],
): RevenueLandingForecast | null {
  const series = groupRevenueByPeriod(actuals);
  if (series.length === 0) return null;
  const year = series[series.length - 1]!.period.slice(0, 4);
  const inYear = series.filter((s) => s.period.slice(0, 4) === year);
  const monthsElapsed = inYear.length;
  // series 非空 (上で確認済) のとき最新期の年が year なので inYear は必ず最新期を含み
  // monthsElapsed >= 1。この防御 return は到達不能 (equivalent)。
  // Stryker disable next-line ConditionalExpression
  if (monthsElapsed === 0) return null;
  const actualToDate = inYear.reduce((sum, s) => sum + s.revenue, 0);
  const runRateForecast = Math.round((actualToDate / monthsElapsed) * 12);
  return { year, monthsElapsed, actualToDate, runRateForecast };
}

/** Pure break-even / KPI computation. Mirrors `computeKpi` in
 *  src/main/clients/kpi.ts (see module header). */
/**
 * 描画に渡せる損益分岐点売上高。**存在しない期は `null`。**
 *
 * `bep` の「無い」の印は `Infinity` である (限界利益が 0 以下 = **どんな売上でも
 * 固定費を回収できない**)。タイルは `safeYen` が「∞」と刷り、安全余裕率は
 * `pctOrDash` が「—」と刷る。ところが **2026-09-08 まで KPI 画面の 2 つのグラフが
 * これを `0` に倒していた**:
 *
 * | 面 | 「損益分岐点が無い」の表し方 |
 * | --- | --- |
 * | タイル (BEP) | `∞` |
 * | タイル (安全余裕率) | `—` |
 * | BEP 交点図 | マーカーを**出さない** (正しい) |
 * | **時系列グラフ** | **0** —— BEP 線を軸の一番下に引く |
 * | **事業別 棒グラフ** | **0** —— 高さ 0 の棒 |
 *
 * 0 は座標に入ると主張ではなく**幾何**になる。軸の底に引かれた BEP 線は
 * 「損益分岐点 0 円 = どんな売上でも黒字」と読め、**真実の正反対**である。
 * しかも 0 は y 軸の最大値の計算にも入るので縮尺まで動かす。
 *
 * **座標を作る側には `null` を渡して、点を打たせない。**
 */
export function finiteBep(bep: number): number | null {
  return Number.isFinite(bep) ? bep : null;
}

/**
 * **損益分岐点が存在しないときの理由。** 座標ではなく*文字*として出す側が使う。
 *
 * 文面をここに置くのは `noBreakEvenNote` と同じ理由 —— 画面が組み立てると、
 * 同じ状態の説明が画面ごとに言い換わる。実際に言い換わっていた (下参照)。
 */
export const NO_BEP_REASON = '限界利益が 0 以下です。どれだけ売っても固定費を回収できません。';

/**
 * **売上が 0 で損益分岐点が算定できないときの理由** (2026-09-22 · パス 388)。
 *
 * `NO_BEP_REASON` (「限界利益が 0 以下です。どれだけ売っても固定費を回収できません。」)
 * とは**別の原因**である。売上 0 で費用だけ入っている事業 (売上前・取り込み前) に
 * 前者を出すと、**変動費と単価を見直せ**と読める —— 実際の状態は
 * 「売上がまだ入っていない」で、直す所が違う。
 *
 * 実測 (2026-09-22 · jsdom): 売上 0 / 販管費 30 万の KPI 実績 1 件で経営サマリーを
 * 描くと、`限界利益率` / `安全余裕率` / `損益分岐点 (BEP)` が `—` になり、
 * **画面が出す唯一の理由が `NO_BEP_REASON`** だった (`hasBepReason=true` /
 * 売上 0 の断りは `false`)。同じ状態について**書面とレポートは
 * `zeroRevenueRatioNote` で正しい原因を言う** —— 画面だけが原因を取り違えていた。
 *
 * 文が 3 つの欄を名指しするのは、この 1 文でその 3 つの空欄すべてが説明されるため
 * (読み手が空欄ごとに理由を探し回らない)。
 */
export const ZERO_REVENUE_BEP_REASON =
  '対象期間の売上高が 0 のため、損益分岐点・限界利益率・安全余裕率は算定していません。';

/** {@link bepDisplay} と {@link noBepReason} が要る最小の入力。 */
export interface BepInputs {
  readonly bep: number;
  /**
   * 限界利益率。**`null` ⟺ 売上高が 0** (この欄の定義そのもの)。
   *
   * ここで `revenue` を取らないのは、`KpiMetrics` が売上高を持たないからでもあるが、
   * 主たる理由は**条件を値そのもので書く**ためである —— `revenue > 0` を写すと
   * 同じ規則が画面と書面に分かれる (`OverviewPage` のコスト構造の枠が
   * 2026-09-08 に同じ轍を踏んでいる)。
   */
  readonly contributionRatio: number | null;
}

/**
 * **損益分岐点が空欄になる理由を 1 か所で選ぶ。**
 *
 * 算定できているなら `null` (理由は要らない)。算定できないなら原因は 2 つに分かれ、
 * **どちらを出すかをここだけが決める** —— 呼び手が分岐を写すと、面ごとに違う原因を
 * 言い始める (それがパス 388 で見つけた欠陥そのものである)。
 */
export function noBepReason(m: BepInputs): string | null {
  return Number.isFinite(m.bep) ? null : blankBepReason(m);
}

/**
 * 空欄の理由 (**必ず在る**)。`bep` が非有限であることは呼び手が確かめる。
 *
 * `noBepReason` と 2 つに分けているのは型のためだけではない —— `bepDisplay` は
 * 非有限の枝の中で呼ぶので `null` を受けられず、`?? 既定` と書くと**そこが
 * 2 つ目の選択**になる (面ごとに違う原因を言い始める元である)。
 */
function blankBepReason(m: BepInputs): string {
  return m.contributionRatio === null ? ZERO_REVENUE_BEP_REASON : NO_BEP_REASON;
}

/**
 * **損益分岐点のタイル 1 枚の「値」と「副文」を、1 つの判定から返す。**
 *
 * 別々に書くと「— なのに理由が出ない」「数が出ているのに理由が付く」形が
 * 型の上で開く (パス 57 と同じ轍)。
 *
 * ## なぜここに移したか (2026-09-21 · パス 386)
 *
 * **同じ状態を、2 つの画面が別々の形で答えていた。** 限界利益 ≤ 0 の期
 * (`bep = Infinity`) を入れて実測すると:
 *
 * | 画面 | 値 | 副文 |
 * | --- | --- | --- |
 * | 経営サマリー | `—` | 「限界利益が 0 以下です。…」 |
 * | **KPI 実績** | **`∞`** | **「比率 ∞」** (理由は 1 文も無い) |
 *
 * **`∞` は「無限に安全」と読めるが、これは最も危ない側である** (どれだけ売っても
 * 固定費を回収できない)。しかも `KpiPage.tsx` の `pctOrDash` の注記は**その規則を
 * 自分で述べていた** —— 適用されていたのは安全余裕率だけで、BEP の値と比率は
 * 素の `∞` のままだった。原因は写しで、`KpiPage` が `pct` / `safeYen` の局所の
 * 双子を持ち、どちらも非有限を `'∞'` へ倒していた (`shared/formatters.ts` の
 * `pct` / `jpy` には**どちらにも `—` の床が在る**)。
 *
 * ★ **`OverviewPage` の docblock は「`safeYen` — パス 198 で「—」に直した」と
 * 書いていたが、2026-09-21 の実測ではまだ `'∞'` を返していた** (散文が先に直り、
 * コードが残っていた)。
 *
 * ★ さらに `noBreakEvenOnScreen.test.ts` が
 * `expect(t).toContain('∞')` で**その弱さを仕様として留めていた** ——
 * 題名は「(値の側の答え方は変えていない)」とパス 59 の範囲を述べる印だったが、
 * 主張として置かれている限り**直すと落ちる門**になっていた
 * (法則 `no-weakness-as-spec`)。
 *
 * ## 整形は呼び手が持つ
 *
 * 金額の綴りは画面ごとに違う (経営サマリーと KPI は `Intl` の `￥`、
 * `shared/formatters` の `jpy` は `¥`) ので、**判定だけを共有して整形は渡す** ——
 * `demoMixNote(p, yen)` と同じ形である。
 *
 * @param bep   `computeKpiMetrics` の `bep` (存在しなければ `Infinity`)
 * @param money 金額 1 つの整形 (呼び手の画面の綴り)
 * @param sub   **算定できたときだけ**添える副文 (比率など)。算定できなければ理由が優先する
 */
export function bepDisplay(
  m: BepInputs,
  money: (n: number) => string,
  sub?: string,
): { value: string; sub?: string } {
  if (!Number.isFinite(m.bep)) return { value: DASH, sub: blankBepReason(m) };
  return { value: money(Math.round(m.bep)), sub };
}

/**
 * 損益分岐点が存在しない期が在るときの断り書き (無ければ `null`)。
 *
 * **線が途切れている理由を述べる。** 途切れだけを見せると「データが無い期」と
 * 読まれるが、実際は「**その期はどんな売上でも赤字**」という最も重い状態である。
 */
export function noBreakEvenNote(missing: number, total: number): string | null {
  // **NaN を文章に埋めない。** 直す前は `noBreakEvenNote(NaN, 10)` が
  // 「10 期のうち NaN 期は…」を返していた。`total` も埋め込まれるので
  // **走査が挙げなかった側 (`if` に出てこない `total`) も見る** —— パス 203。
  if (finiteOrNull(missing) === null || finiteOrNull(total) === null) return null;
  if (missing <= 0) return null;
  return `${total} 期のうち ${missing} 期は限界利益が 0 以下のため、損益分岐点が存在しません（どれだけ売っても固定費を回収できない状態）。その期はグラフに点を打っていません。`;
}

export function computeKpiMetrics(f: KpiFundamentals): KpiMetrics {
  const variableCost = f.cogs + f.advertising;
  const fixedCost = f.sga + f.depreciation;
  const contribution = f.revenue - variableCost;
  const contributionRatio = f.revenue > 0 ? (contribution / f.revenue) * 100 : null;
  const bep = contribution > 0 ? (fixedCost / contribution) * f.revenue : Infinity;
  // revenue===0 のとき bep は必ず Infinity (contribution<=0) で、Infinity/0*100 も
  // Infinity になるため三項の両枝が同値 → revenue>0 判定の変異は equivalent。
  // Stryker disable next-line ConditionalExpression,EqualityOperator
  const bepRatio = f.revenue > 0 ? (bep / f.revenue) * 100 : Infinity;
  const safetyMargin = Number.isFinite(bepRatio) ? 100 - bepRatio : null;
  const operatingProfit = contribution - fixedCost;
  return {
    variableCost,
    fixedCost,
    contribution,
    contributionRatio,
    bep,
    bepRatio,
    safetyMargin,
    operatingProfit,
  };
}

// --- 同じ期・事業の重複 (パス 124) ----------------------------------------------

/**
 * **実績・予算は (期間, 事業) が 1 件の単位。** 同じ組を 2 件持つと `summarizeFundamentals` /
 * `groupRevenueByPeriod` / `monthlyTrendSeries` が**合算**し、訂正のつもりの入れ直しが
 * 「旧 + 新」の売上高になって経営サマリー・経営スコアカード・着地見込み・金融機関等提出用の
 * 書面 §1 まで届く (実績に「編集」は無く、訂正は × で消してから入れ直す)。
 *
 * 鍵は期と事業名 (前後の空白を落とす) をそのまま結ぶ。大文字小文字や全角半角は**別物**のまま
 * (「EC」と「ec」を同じとは言わない —— 同じかどうかは利用者の判断で、機械は完全一致しか見ない)。
 * 期は `isValidPeriod` の 7 文字なので区切りは要らないが、読めるように `|` を挟む。
 */
export function actualKey(a: Pick<KpiActual, 'period' | 'unit'>): string {
  return `${a.period}|${a.unit.trim()}`;
}

/** 同じ (期間, 事業) が既に在るか。画面が追加を断る判断。 */
export function hasSamePeriodUnit(existing: readonly KpiActual[], candidate: Pick<KpiActual, 'period' | 'unit'>): boolean {
  const key = actualKey(candidate);
  return existing.some((a) => actualKey(a) === key);
}

/** 同じ (期間, 事業) が 2 件以上ある組。 */
export interface DuplicateActualGroup {
  readonly period: string;
  readonly unit: string;
  /** その組の件数 (2 以上)。 */
  readonly count: number;
}

/** 既に在る重複 (件数 2 以上の組) を期・事業の昇順で返す。無ければ空。 */
export function findDuplicateActuals(actuals: readonly KpiActual[]): DuplicateActualGroup[] {
  const groups = new Map<string, DuplicateActualGroup>();
  for (const a of actuals) {
    const key = actualKey(a);
    const g = groups.get(key);
    groups.set(key, g ? { ...g, count: g.count + 1 } : { period: a.period, unit: a.unit.trim(), count: 1 });
  }
  return [...groups.values()]
    .filter((g) => g.count >= 2)
    .sort((x, y) => x.period.localeCompare(y.period) || x.unit.localeCompare(y.unit));
}

/** 「実績」「予算」—— 断りと警告の文に入る種別。 */
export type ActualKind = '実績' | '予算';

/** 同じ (期間, 事業) の追加を断るときの文。訂正の道 (× で消してから) を言う。 */
export function duplicateActualMessage(kind: ActualKind, c: Pick<KpiActual, 'period' | 'unit'>): string {
  return `${c.period} の「${c.unit.trim()}」の${kind}は既に入力されています。訂正するときは一覧の × で消してから入れ直してください（同じ期・事業を 2 件入れると合算されます）。`;
}

const listGroups = (groups: readonly DuplicateActualGroup[]): string =>
  groups.map((g) => `${g.period} ${g.unit} ×${g.count}`).join('、');

/** 一覧の上の警告 (既に重複が在るとき)。無ければ null。 */
export function duplicateActualsNote(kind: ActualKind, groups: readonly DuplicateActualGroup[]): string | null {
  if (groups.length === 0) return null;
  return `同じ期・事業の${kind}が ${groups.length} 組重複しており、合算されています（${listGroups(groups)}）。一覧の × で余分な行を消してください。`;
}

/**
 * **経営サマリーの但し書き** (2026-09-22 · パス 390)。無ければ null。
 *
 * ## なぜ 3 つ目の文が要るのか
 *
 * 同じ事実 (同じ期・事業が 2 件以上入っていて金額が合算されている) を、面ごとに
 * 言い方を変える必要がある —— **読み手が次に何をできるかが面ごとに違う**:
 *
 * | 面 | 文 | 直し方の案内 |
 * | --- | --- | --- |
 * | KPI 実績の画面 | `duplicateActualsNote` | **一覧の × で消せる** (一覧がその画面に在る) |
 * | 書面 / レポート | `duplicateActualsSheetNote` | 「本表の金額は合算値」(**表**なのでそう呼べる) |
 * | 経営サマリー | ここ | **一覧が無い**ので、どの画面で消すかを指さす |
 *
 * KPI 画面の文をそのまま出すと「一覧の ×」が**この画面に無い物**を指し、書面の文を
 * そのまま出すと「本表」が表でない物を指す。だから 3 つ目を置く。
 *
 * ## なぜ経営サマリーに要るのか (実測)
 *
 * 2026-09-22 に同じ (期, 事業) を 2 件入れて実測すると、`duplicateActuals` は
 * **1 組を検出しており** (`overview.kpi.duplicateActuals.length === 1`)、
 * `overview.kpi.revenue` は **2,000,000** (1 件なら 1,000,000) になった。
 * 書面とレポートはその旨を述べるのに、**経営サマリーは ￥2,000,000 を黙って刷っていた。**
 *
 * これは空欄より重い —— **空欄は読み手が気付くが、倍になった金額は正しく見える。**
 * 経営サマリーは「経営概況がまとまって表示されます」と自ら名乗る面である。
 */
export function duplicateActualsOverviewNote(groups: readonly DuplicateActualGroup[]): string | null {
  if (groups.length === 0) return null;
  return `同じ期・事業の実績が ${groups.length} 組重複しており（${listGroups(groups)}）、この画面の金額はその合算値です。「KPI 実績」の画面で余分な行を消してください。`;
}

/** 書面 §1 と経営レポートの但し書き (**相手に渡る面**)。無ければ null。 */
export function duplicateActualsSheetNote(groups: readonly DuplicateActualGroup[]): string | null {
  if (groups.length === 0) return null;
  return `KPI 実績に同じ期・事業の重複が ${groups.length} 組あり（${listGroups(groups)}）、本表の金額はその合算値です。`;
}
