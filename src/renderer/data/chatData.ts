/**
 * コンシェルジュが**利用者自身の記録**について聞かれたとき、数字で答える (2026-11-22)。
 *
 * それまでコンシェルジュは「売上集計は○○の画面です」と画面を**説明**するだけで、
 * 「今月の売上はいくら？」に数字で答えなかった (画面を開いて自分で探すしかなかった)。
 * ここは**純粋な関数だけ**を持つ —— 発話を問いに読む `parseDataQuestion` と、
 * 端末に保存された記録から答えを組む `answerDataQuestion`。記録を読むのは呼び手
 * (`ChatbotWidget`) で、**端末の外へは何も送らない** (答えは保存してある数字の足し算)。
 *
 * 規則:
 * - **集計は画面と同じ漏斗を通す** —— 売上は `readableSalesRows`、実績は `readableKpiRows`。
 *   チャットだけ別の数え方をすると、同じ問いに画面とチャットが別の答えを出す
 *   (法則 `one-subset-per-answer`)。
 * - **読めなかったことと 0 件は混ぜない** —— 保管層が読めなければ `null` が来るので、
 *   「記録がありません」ではなく「読めませんでした」と言う (法則 `blank-states-its-reason`)。
 * - **落とした行は名乗る** —— 日付や金額が読めない行を集計から除いたら、その件数を言う。
 */

import type { ServiceId } from '../../shared/serviceId';
import { jpy } from '../../shared/formatters';
import { isCalendarDate } from '../../shared/isoDate';
import { readableSalesRows, type SalesEntry } from './sales';
import {
  balanceSheetAsOfKey,
  currentBalanceSheet,
  normalizeBalanceSheet,
  unreadableBalanceSheetField,
  type BalanceSheetRecordLike,
} from './balanceSheet';
import type { Member } from './members';
import {
  computeKpiMetrics,
  readableKpiRows,
  summarizeFundamentals,
  type KpiActual,
} from './kpiActuals';

/** 聞かれている物。 */
export type DataTopic = 'sales' | 'profit' | 'cash' | 'members';

/** 聞かれている期間。`latest` は「記録の在る最後の月」(期間を言わなかったとき)。 */
export type DataSpan = 'this-month' | 'last-month' | 'this-year' | 'all' | 'latest';

export interface DataQuestion {
  readonly topic: DataTopic;
  readonly span: DataSpan;
}

/** 答えるために読む記録。読めなかった collection は `null` (0 件とは別)。 */
export interface DataSnapshot {
  readonly sales: readonly SalesEntry[] | null;
  readonly kpi: readonly KpiActual[] | null;
  /** 貸借対照表の控え (行ごと —— どれが「現在」かは基準日と入力した時刻で決まる)。 */
  readonly balanceSheets: readonly BalanceSheetRecordLike[] | null;
  readonly members: readonly Member[] | null;
  /** 今日 (`YYYY-MM-DD`・利用者の暦)。今月・先月はここから決める。 */
  readonly today: string;
}

export interface DataAnswer {
  readonly topic: DataTopic;
  readonly text: string;
  /** 詳しく見る画面。**勝手には開かない** —— 開くのは利用者がそう言ったとき。 */
  readonly screen: ServiceId;
}

// --- 発話を問いに読む --------------------------------------------------------

/** 売上の語。「売り上げ」「うりあげ」「ウリアゲ」も (カタカナは呼び手の正規化に依らず両方を見る)。 */
const SALES_WORDS: readonly string[] = ['売上', '売り上げ', 'うりあげ', 'ウリアゲ', '注文', '受注'];
/** 利益の語。 */
const PROFIT_WORDS: readonly string[] = ['利益', 'もうけ', '儲け', 'モウケ', '黒字', '赤字'];
/** 手元のお金の語 (貸借対照表の現預金)。「資金調達」は別の画面なので語に入れない。 */
const CASH_WORDS: readonly string[] = ['現預金', '現金', '預金', '手元資金', '手持ち'];
/** 人数の語 (チーム管理のメンバー)。 */
const MEMBER_WORDS: readonly string[] = ['メンバー', 'めんばー', '従業員', '社員', 'スタッフ', '何人', 'なんにん', '人数'];
/** 問いの印。これが無く、期間の語も無ければ問いとは読まない (「売上を開いて」は画面の案内のまま)。 */
const QUESTION_WORDS: readonly string[] = [
  'いくら', 'どれくらい', 'どのくらい', 'どれぐらい', '何件', 'なんけん', '何円', '何人', 'なんにん',
  '教えて', 'おしえて', '知りたい', 'しりたい', '?', '？', 'ですか', 'でしたか', 'どう',
];
/** 期間の語 (先に当たった物を採る —— 「先月」は「月」を含むので順序が要る)。 */
const SPAN_WORDS: readonly (readonly [DataSpan, readonly string[]])[] = [
  ['last-month', ['先月', 'せんげつ', '前月']],
  ['this-month', ['今月', 'こんげつ']],
  ['this-year', ['今年', 'ことし', '本年', '年間']],
  ['all', ['累計', '合計', '全部', 'ぜんぶ', 'これまで', '全期間']],
];

const hasAny = (text: string, words: readonly string[]): boolean => words.some((w) => text.includes(w));

/**
 * 発話を「記録についての問い」に読む。問いでなければ `null`。
 *
 * 問いと読むのは、**話題の語があり、かつ 問いの印か期間の語がある**とき。
 * 話題の語だけ (「売上を開いて」) は画面の案内として既存の経路へ回す。
 * 「開いて」「ひらいて」が在れば問いとは読まない —— 開けと言われたら開く。
 */
export function parseDataQuestion(raw: string): DataQuestion | null {
  const text = raw;
  if (hasAny(text, ['開いて', 'ひらいて', '開け', '移動'])) return null;
  const topic: DataTopic | null = hasAny(text, PROFIT_WORDS)
    ? 'profit'
    : hasAny(text, SALES_WORDS)
      ? 'sales'
      : hasAny(text, CASH_WORDS)
        ? 'cash'
        : hasAny(text, MEMBER_WORDS)
          ? 'members'
          : null;
  if (topic === null) return null;
  const found = SPAN_WORDS.find(([, words]) => hasAny(text, words));
  const span: DataSpan = found === undefined ? 'latest' : found[0];
  // 問いの印も期間の語も無い (「利益」の 1 語だけ) なら問いとは読まない。
  if (found === undefined && !hasAny(text, QUESTION_WORDS)) return null;
  return { topic, span };
}

// --- 記録から答えを組む ------------------------------------------------------

/** `YYYY-MM` → 「2026年11月」。 */
export function monthLabel(month: string): string {
  return `${Number(month.slice(0, 4))}年${Number(month.slice(5, 7))}月`;
}

/** 今日から、聞かれた期間の月の集合を決める判定。`latest` は呼び手が別に決める。 */
function monthOf(today: string, back: number): string {
  const y = Number(today.slice(0, 4));
  const m = Number(today.slice(5, 7)) - back;
  const yy = m <= 0 ? y - 1 : y;
  const mm = m <= 0 ? m + 12 : m;
  return `${yy}-${String(mm).padStart(2, '0')}`;
}

/**
 * 記録の在る最後の月 (`YYYY-MM` の綴りの最大)。呼び手は読める行が 1 件以上あるときだけ呼ぶ。
 * 同じ月が 2 度あっても答えは変わらないので、比べ方の `>` と `>=` は等価である。
 */
function latestMonth(months: readonly string[]): string {
  // Stryker disable next-line EqualityOperator: 同じ綴りの月どうしは、どちらを採っても同じ答え (等価変異)
  return months.reduce((a, b) => (b > a ? b : a));
}

/** 期間に入るかを `YYYY-MM` で決める述語と、その期間の名前。 */
function spanFilter(span: DataSpan, today: string, latest: string): { readonly inSpan: (month: string) => boolean; readonly label: string } {
  switch (span) {
    case 'this-month': {
      const m = monthOf(today, 0);
      return { inSpan: (x) => x === m, label: `今月 (${monthLabel(m)})` };
    }
    case 'last-month': {
      const m = monthOf(today, 1);
      return { inSpan: (x) => x === m, label: `先月 (${monthLabel(m)})` };
    }
    case 'this-year': {
      const y = today.slice(0, 4);
      return { inSpan: (x) => x.startsWith(`${y}-`), label: `今年 (${Number(y)}年)` };
    }
    case 'all':
      return { inSpan: () => true, label: 'これまでの合計' };
    case 'latest':
      return { inSpan: (x) => x === latest, label: `記録の在る最後の月 (${monthLabel(latest)})` };
  }
}

/** 問いに、端末の記録から答える。今日が暦に無い日付なら、期間の付かない形 (最後の月) で答える。 */
export function answerDataQuestion(q: DataQuestion, snap: DataSnapshot): DataAnswer {
  const today = isCalendarDate(snap.today) ? snap.today : null;
  // 今日が読めないときの期間は「最後の月」か「合計」だけ —— どちらも今日を読まないので、生の値を渡してよい。
  const span: DataSpan = today === null && q.span !== 'all' ? 'latest' : q.span;
  switch (q.topic) {
    case 'sales':
      return answerSales(span, snap.sales, snap.today);
    case 'profit':
      return answerProfit(span, snap.kpi, snap.today);
    case 'cash':
      return answerCash(snap.balanceSheets);
    case 'members':
      return answerMembers(snap.members);
  }
}

const UNREADABLE = (what: string): string =>
  `⚠ この端末に保存した${what}を読めませんでした。記録が 0 件という意味ではありません。画面を開き直してから、もう一度聞いてください。`;

function answerSales(span: DataSpan, rows: readonly SalesEntry[] | null, today: string): DataAnswer {
  const base = { topic: 'sales' as const, screen: 'sales' as ServiceId };
  if (rows === null) return { ...base, text: UNREADABLE('販売記録') };
  const readable = readableSalesRows(rows);
  if (readable.rows.length === 0) {
    const why = rows.length === 0
      ? '販売記録がまだ 1 件もありません。'
      : `販売記録は ${rows.length} 件ありますが、日付か金額が読めないため集計できません。`;
    return { ...base, text: `📊 ${why}「売上集計」の画面で記録を追加すると答えられます。` };
  }
  const months = readable.rows.map((e) => e.date.slice(0, 7));
  const latest = latestMonth(months);
  const filter = spanFilter(span, today, latest);
  const inSpan = readable.rows.filter((e) => filter.inSpan(e.date.slice(0, 7)));
  const dropped = readable.dropped > 0 ? `\n（日付か金額が読めない ${readable.dropped} 件は数えていません）` : '';
  if (inSpan.length === 0) {
    return {
      ...base,
      text: `📊 ${filter.label}の販売記録はありません。最後の記録は ${monthLabel(latest)} です。${dropped}`,
    };
  }
  const amount = inSpan.reduce((s, e) => s + e.amount, 0);
  const orders = inSpan.reduce((s, e) => s + e.orders, 0);
  return {
    ...base,
    text: `📊 ${filter.label}の売上は ${jpy(amount)}（記録 ${inSpan.length} 件・注文 ${orders} 件）です。${dropped}`,
  };
}

function answerProfit(span: DataSpan, rows: readonly KpiActual[] | null, today: string): DataAnswer {
  const base = { topic: 'profit' as const, screen: 'kpi' as ServiceId };
  if (rows === null) return { ...base, text: UNREADABLE('実績 (KPI) の記録') };
  const readable = readableKpiRows(rows);
  if (readable.rows.length === 0) {
    const why = rows.length === 0
      ? '実績 (売上・原価・経費) の記録がまだ 1 件もありません。'
      : `実績の記録は ${rows.length} 件ありますが、期か金額が読めないため集計できません。`;
    return { ...base, text: `📈 ${why}「経営指標・損益分岐点」の画面で月ごとの実績を入れると答えられます。` };
  }
  const latest = latestMonth(readable.rows.map((a) => a.period));
  const filter = spanFilter(span, today, latest);
  const inSpan = readable.rows.filter((a) => filter.inSpan(a.period));
  const dropped = readable.dropped > 0 ? `\n（期か金額が読めない ${readable.dropped} 件は数えていません）` : '';
  if (inSpan.length === 0) {
    return {
      ...base,
      text: `📈 ${filter.label}の実績の記録はありません。最後の記録は ${monthLabel(latest)} です。${dropped}`,
    };
  }
  const f = summarizeFundamentals(inSpan);
  const op = computeKpiMetrics(f).operatingProfit;
  const verdict = op < 0 ? '赤字です' : op > 0 ? '黒字です' : '収支はちょうど 0 円です';
  return {
    ...base,
    text: `📈 ${filter.label}の営業利益は ${jpy(op)} で、${verdict}（売上 ${jpy(f.revenue)}）。${dropped}`,
  };
}

/**
 * 手元の現預金。**期間は聞かれても使わない** —— 貸借対照表はある日の残高なので、
 * 「現在」として使う控え (基準日の新しい物) の値を、その基準日つきで言う。
 */
function answerCash(rows: DataSnapshot['balanceSheets']): DataAnswer {
  const base = { topic: 'cash' as const, screen: 'kpi' as ServiceId };
  if (rows === null) return { ...base, text: UNREADABLE('貸借対照表') };
  const current = currentBalanceSheet(rows);
  if (current === null) {
    return { ...base, text: '💴 貸借対照表がまだ 1 件もありません。「経営指標・損益分岐点」の画面で入力すると答えられます。' };
  }
  const bs = normalizeBalanceSheet(current.data);
  const asOf = balanceSheetAsOfKey(current.data.asOf);
  const when = asOf === '' ? '基準日の書かれていない控え' : `基準日 ${asOf} の控え`;
  if (bs.cash === undefined) {
    const why = unreadableBalanceSheetField('cash', bs.unreadableFields) ? '数として読めません' : 'まだ入力されていません';
    return { ...base, text: `💴 ${when}では、現預金が${why}。「経営指標・損益分岐点」の画面の貸借対照表で入れると答えられます。` };
  }
  return { ...base, text: `💴 手元の現預金は ${jpy(bs.cash)} です（${when}）。` };
}

/** チームの人数と、そのうちのオーナーの数。 */
function answerMembers(rows: readonly Member[] | null): DataAnswer {
  const base = { topic: 'members' as const, screen: 'team' as ServiceId };
  if (rows === null) return { ...base, text: UNREADABLE('チームのメンバー') };
  if (rows.length === 0) {
    return { ...base, text: '👥 チームのメンバーはまだ登録されていません。「チーム管理」の画面で招待すると答えられます。' };
  }
  const owners = rows.filter((m) => m.role === 'owner').length;
  return { ...base, text: `👥 チームのメンバーは ${rows.length} 人です（うちオーナー ${owners} 人）。` };
}
