/**
 * **免税事業者等からの課税仕入れに係る経過措置** —— 段階の表を 1 つだけ持つ (2026-09-10 · パス 142)。
 *
 * インボイス制度では、適格請求書発行事業者でない者 (免税事業者等) からの課税仕入れは
 * 原則として仕入税額控除ができない。ただし経過措置として、仕入税額相当額の一定割合を
 * 控除できる。その割合は**年月で段階的に縮小する**。
 *
 * ## なぜ表を 1 つにしたか
 *
 * 2026-09-10 の実測で、この 1 つの日程が**リポジトリの 6 か所に手で書かれ**、うち 2 か所が
 * 令和 8 年度税制改正の前の日程 (80% の次が 50%・2029 年 9 月で終了) のまま残っていた ——
 * 知識台帳の `tax-invoice` と `tax-invoice-input-credit` が**同じ期間について 70% と 50% を**
 * 言い、書類スタジオの経費精算テンプレートの注記も古い側だった。共有の定数は 1 つも無く、
 * 一致を見る物も無かったので、**どちらが今の法令かを機械が問えなかった**。
 *
 * ここが唯一の出所で、画面と書類の文面はこの表から組み、知識台帳の文は
 * `invoiceTransitionConsistency.test.ts` が表と突き合わせる。期限 (`INVOICE_TRANSITION_END`) は
 * `lint:rate-freshness` の台帳に載っているので、終わりの 180 日前から CI が促す。
 *
 * ## 出所と限界
 *
 * 令和 8 年度税制改正で、当初の日程 (80% → 50%・2029-09-30 終了) が
 * 70% → 50% → 30% (2031-09-30 終了) に緩和・延長された。**一次情報 (国税庁の
 * 令和 8 年度税制改正特集・財務省の大綱) はこの環境から届かない**ので、リポジトリが
 * 既に持っていた新しい側 (`complianceKnowledge.ts` の `tax-invoice`・asOf 2026-09・
 * 国税庁の改正特集を出典に持つ) を正とした。一次情報での照合は `docs/REMAINING_WORK.md`
 * のパス 142 に宿題として残してある。
 *
 * **この割合は計算に入っていない。** 本アプリの本則課税の概算 (`taxConsumptionBusiness.ts` /
 * `taxConsumptionSchedule.ts`) は課税仕入れの消費税を全額控除できる前提で、免税事業者等からの
 * 仕入れを区別しない。画面はその旨を書く (税務ページ ⑩-3)。
 */
import { isCalendarDate } from './isoDate';
import { localIsoDate } from './localDate';

/** 経過措置の 1 段階。`from` の日から `to` の日まで、仕入税額相当額の `rate` を控除できる。 */
export interface InvoiceTransitionStage {
  /** 段の初日 (`YYYY-MM-DD`)。 */
  readonly from: string;
  /** 段の末日 (`YYYY-MM-DD`)。 */
  readonly to: string;
  /** 控除できる割合 (0〜1)。 */
  readonly rate: number;
}

/**
 * 段階の表。**隣り合う段は途切れず重ならない** (`invoiceTransition.test.ts` が総当たりで留める)。
 * 令和 8 年度税制改正後の日程。
 */
export const INVOICE_TRANSITION_STAGES: readonly InvoiceTransitionStage[] = [
  { from: '2023-10-01', to: '2026-09-30', rate: 0.8 },
  { from: '2026-10-01', to: '2028-09-30', rate: 0.7 },
  { from: '2028-10-01', to: '2030-09-30', rate: 0.5 },
  { from: '2030-10-01', to: '2031-09-30', rate: 0.3 },
];

/** 経過措置の初日 (インボイス制度の開始日)。 */
export const INVOICE_TRANSITION_START = '2023-10-01';
/** 経過措置の末日。この日を過ぎると控除できない。`lint:rate-freshness` の台帳が 180 日前から鳴らす。 */
export const INVOICE_TRANSITION_END = '2031-09-30';
/** 同一の免税事業者等からの課税仕入れに係る、経過措置の年間の上限額。 */
export const INVOICE_TRANSITION_ANNUAL_CAP = 100_000_000;

/**
 * 今日が属する段。措置の外 (開始前・終了後) と、時計が読めないときは `null`。
 *
 * 日付は**利用者の時計の暦日**で比べる (`localIsoDate`)。`toISOString()` の UTC 日付だと
 * 日本 (UTC+9) の 0〜9 時に前日として判定する (`taxConsumption.ts` と同じ理由)。
 */
export function invoiceTransitionStageOn(
  today: Date = new Date(),
  stages: readonly InvoiceTransitionStage[] = INVOICE_TRANSITION_STAGES,
): InvoiceTransitionStage | null {
  // **読めない時計を別に書かない。** `localIsoDate` は読めなければ `''` を返し、`''` は辞書順で
  // どの `from` より小さいので、下の `find` がそのまま undefined → null に落とす。専用の枝を置くと
  // 同じ答えを 2 通りに書くことになり、どちらを消しても結果が変わらない (変異検査の生存 1 件 · パス 142)。
  const t = localIsoDate(today);
  return stages.find((s) => s.from <= t && t <= s.to) ?? null;
}

/** 今日の控除割合 (0〜1)。措置の外・読めない時計は `null` (「0%」と混ぜない)。 */
export function invoiceTransitionRateOn(
  today: Date = new Date(),
  stages: readonly InvoiceTransitionStage[] = INVOICE_TRANSITION_STAGES,
): number | null {
  return invoiceTransitionStageOn(today, stages)?.rate ?? null;
}

/** 割合の百分率 (80 / 70 / 50 / 30)。丸めの揺れを 1 か所に閉じる。 */
export function invoiceTransitionPercent(rate: number): number {
  return Number((rate * 100).toPrecision(12));
}

/** 段の末日の「YYYY年M月」。文面が写す唯一の形。 */
export function invoiceTransitionStageMonth(stage: InvoiceTransitionStage): string {
  const [y, m] = stage.to.split('-');
  return `${Number(y)}年${Number(m)}月`;
}

/**
 * 日程の文面を表から組む ——
 * 「2026年9月30日まで80% → 70%（〜2028年9月）→50%（〜2030年9月）→30%（〜2031年9月）」。
 * 段が 1 つも無ければ空文字 (画面は空を刷らない)。
 */
export function invoiceTransitionScheduleLabel(
  stages: readonly InvoiceTransitionStage[] = INVOICE_TRANSITION_STAGES,
): string {
  if (stages.length === 0) return '';
  const [first, ...rest] = stages;
  const [y, m, d] = first!.to.split('-');
  const head = `${Number(y)}年${Number(m)}月${Number(d)}日まで${invoiceTransitionPercent(first!.rate)}%`;
  return [head, ...rest.map((s) => `${invoiceTransitionPercent(s.rate)}%（〜${invoiceTransitionStageMonth(s)}）`)].join(' → ');
}

/**
 * 今日の段の文面 —— 「70%（2028年9月まで）」。措置の外なら終わったと言い切る。
 * 時計が読めないときは日程だけを返す (**言い切らない**)。
 */
export function invoiceTransitionCurrentLabel(
  today: Date = new Date(),
  stages: readonly InvoiceTransitionStage[] = INVOICE_TRANSITION_STAGES,
): string {
  const t = localIsoDate(today);
  if (!isCalendarDate(t)) return '経過措置の割合は日程によります';
  const stage = invoiceTransitionStageOn(today, stages);
  if (stage !== null) return `${invoiceTransitionPercent(stage.rate)}%（${invoiceTransitionStageMonth(stage)}まで）`;
  const last = stages[stages.length - 1];
  // Stryker disable next-line EqualityOperator: 段は途切れないので `t === last.to` は必ず上の
  // `stage !== null` で返る (末日はその段の中)。ここに来る `t` は末日より後だけなので、
  // `>` を `>=` にしても観測できる差が無い (等価変異 · パス 142)。境目そのものは
  // `invoiceTransition.test.ts` の「2031-09-30 は 30%・翌日は null」が留めている。
  if (last !== undefined && t > last.to) return '経過措置は終了（控除できません）';
  return '経過措置はまだ始まっていません';
}
