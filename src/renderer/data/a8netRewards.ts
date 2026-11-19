/**
 * A8.net の成果の記録 —— 利用者が自分で 1 件ずつ記録し、確定・未確定の合計を見る。
 *
 * A8.net にメディア会員向けの公開 API は無い (成果は管理画面と CSV だけ)。だからこのアプリは
 * A8.net へつながず、管理画面で見た成果を利用者が写す。記録は端末の record store
 * (collection `a8net-rewards`) に在り、ここは純関数だけを持つ (保存は `data/store.ts`、
 * 画面は `useCollection(A8NET_REWARDS_COLLECTION)` で読む)。
 *
 * 2026-11-19 まで、この画面は同梱の見本 3 件を「内蔵サンプル」として並べるだけだった。
 */

import { isCalendarMonth } from '../../shared/isoDate';
import { finiteNumberOf } from '../../shared/apiResponse';
import { moreThanChars } from '../../shared/inputCeiling';
import { readEntryNumber } from '../../shared/readNumeric';

export const A8NET_REWARDS_COLLECTION = 'a8net-rewards';

/** 成果の状態。A8.net の管理画面の区分に合わせる (未確定 → 確定 か 否認)。 */
export const A8NET_REWARD_STATUSES = ['pending', 'confirmed', 'rejected'] as const;
export type A8netRewardStatus = (typeof A8NET_REWARD_STATUSES)[number];

export const A8NET_REWARD_STATUS_LABEL: Readonly<Record<A8netRewardStatus, string>> = {
  pending: '未確定',
  confirmed: '確定',
  rejected: '否認',
};

/** プログラム名 (広告主・案件の名前) の上限。入口と表示の天井が同じこの数を読む。 */
export const MAX_A8NET_PROGRAM_CHARS = 60;

/**
 * 1 件の報酬額の上限 (円)。**桁の打ち間違いを止めるための幅**で、制度上の上限ではない ——
 * 1 件 1 億円を超える成果報酬は通常無く、桁を 1 つ多く打った値が合計を黙って変えるのを防ぐ。
 */
export const MAX_A8NET_REWARD_YEN = 100_000_000;

/** 成果 1 件。 */
export interface A8netRewardEntry extends Record<string, unknown> {
  /** 成果が発生した月 (`YYYY-MM`)。 */
  readonly month: string;
  /** プログラム名 (広告主・案件の名前)。 */
  readonly program: string;
  /** 報酬額 (円・0 以上の整数)。 */
  readonly amount: number;
  readonly status: A8netRewardStatus;
}

export function isA8netRewardStatus(v: unknown): v is A8netRewardStatus {
  return (A8NET_REWARD_STATUSES as readonly unknown[]).includes(v);
}

const AMOUNT_RANGE_REFUSAL = `報酬額は 0 以上 ${MAX_A8NET_REWARD_YEN.toLocaleString('ja-JP')} 円以下の整数で入力してください`;

/** 数として読めなかった理由ごとの断り。空欄と「読めない」は直す手が違うので文を分ける。 */
const AMOUNT_REFUSAL = {
  blank: '報酬額が未入力です（0 円なら 0 と入力してください）',
  unreadable: AMOUNT_RANGE_REFUSAL,
} as const;

/**
 * 画面の入力を成果 1 件にする。直せる文を添えて断る。
 *
 * 報酬額の読みは画面の他の欄と同じ 1 つ (`readEntryNumber` —— 全角・桁区切り・`¥` を読み、
 * `1e3` や単位語は読まない)。**空欄を 0 円として入れない** (0 と「未入力」は別の事実)。
 */
export function parseA8netReward(input: {
  month?: unknown;
  program?: unknown;
  amount?: unknown;
  status?: unknown;
}): A8netRewardEntry {
  if (!isCalendarMonth(input.month)) throw new Error('発生月は YYYY-MM 形式で入力してください（例: 2026-11）');
  const program = typeof input.program === 'string' ? input.program.trim() : '';
  if (program === '') throw new Error('プログラム名が未入力です');
  if (moreThanChars(program, MAX_A8NET_PROGRAM_CHARS)) {
    throw new Error(`プログラム名は ${MAX_A8NET_PROGRAM_CHARS} 文字以内で入力してください`);
  }
  const read = readEntryNumber(input.amount);
  if (read.kind !== 'number') throw new Error(AMOUNT_REFUSAL[read.kind]);
  if (!Number.isInteger(read.value) || read.value < 0 || read.value > MAX_A8NET_REWARD_YEN) {
    throw new Error(AMOUNT_RANGE_REFUSAL);
  }
  if (!isA8netRewardStatus(input.status)) throw new Error('状態を選んでください');
  return { month: input.month, program, amount: read.value, status: input.status };
}

/** 状態ごとの金額。 */
export type A8netRewardTotals = Readonly<Record<A8netRewardStatus, number>>;

export interface A8netMonthTotal extends A8netRewardTotals {
  readonly month: string;
}

export interface A8netRewardsSummary {
  /** 状態ごとの報酬額の合計 (円)。 */
  readonly totals: A8netRewardTotals;
  /** 状態ごとの件数。 */
  readonly counts: A8netRewardTotals;
  /** 合計に入れた件数。 */
  readonly readable: number;
  /** 発生月・報酬額・状態のどれかが読めず、合計から外した件数。 */
  readonly unreadable: number;
  /** 発生月ごとの合計。新しい月が先。 */
  readonly byMonth: readonly A8netMonthTotal[];
}

const zeroTotals = (): Record<A8netRewardStatus, number> => ({ pending: 0, confirmed: 0, rejected: 0 });

/** 保管した報酬額を数として読む。数でない・負の値は読めない (null)。 */
export function a8netRewardAmountOf(v: unknown): number | null {
  // 読めない値は負の印へ倒し、下の 1 つの比較で「数でない」と「負」を同じ null にする
  // (`n !== null && n >= 0` と書くと null の判定が等価になる —— `null >= 0` は真で、返すのも null)。
  const n = finiteNumberOf(v) ?? -1;
  return n >= 0 ? n : null;
}

/**
 * 成果の記録を集計する。
 *
 * **合計・件数・月ごとの表は、同じ「読める行」だけから取る** (法則 `one-subset-per-answer`)。
 * 保管層は読みで行を落とさない (復元や古い版の行がそのまま届く) ので、発生月・報酬額・状態の
 * どれかが読めない行はここで外し、**外した件数を返す** —— 黙って外すと合計が小さく出て、
 * 利用者は気づけない。外した行も一覧には出るので、× で消せる。
 */
export function summarizeA8netRewards(rows: readonly A8netRewardEntry[]): A8netRewardsSummary {
  const totals = zeroTotals();
  const counts = zeroTotals();
  const months = new Map<string, Record<A8netRewardStatus, number>>();
  let unreadable = 0;
  for (const row of rows) {
    const amount = a8netRewardAmountOf(row.amount);
    if (amount === null || !isCalendarMonth(row.month) || !isA8netRewardStatus(row.status)) {
      unreadable += 1;
      continue;
    }
    totals[row.status] += amount;
    counts[row.status] += 1;
    const month = months.get(row.month) ?? zeroTotals();
    month[row.status] += amount;
    months.set(row.month, month);
  }
  const byMonth = [...months.keys()]
    .sort()
    .reverse()
    .map((month) => ({ month, ...zeroTotals(), ...months.get(month) }));
  return { totals, counts, readable: rows.length - unreadable, unreadable, byMonth };
}

/**
 * 合計から外した行が在るときの断り。無ければ null。
 *
 * 逃げ口は**同じ画面の一覧の ×** —— 一覧は保管層の行をそのまま並べるので、読めない行も
 * そこに出ている (形の表は発生月と状態を文字列としか見ないので、復元でも落ちない)。
 */
export function unreadableA8netRewardsNote(unreadable: number): string | null {
  // 否定形で受ける —— 非有限 (NaN) も「外した行は無い」側へ落ち、文に NaN を刷らない。
  if (!(unreadable > 0)) return null;
  return `発生月・報酬額・状態のいずれかが読めない記録が ${unreadable} 件あります。合計には入れていません。その行も下の一覧に出ています —— 一覧の × で消して、入れ直してください。`;
}

/** 記録がまだ無いときの案内。 */
export const A8NET_EMPTY_NOTE =
  'A8.net の管理画面で確認した成果を、上の欄から 1 件ずつ記録してください。確定・未確定の合計と月ごとの推移を出します。記録はこの端末の中だけに保存され、A8.net へは何も送りません。';
