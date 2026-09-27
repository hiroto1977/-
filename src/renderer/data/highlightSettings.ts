/**
 * 経営ハイライトのしきい値設定 — 永続化レイヤ。
 *
 * `managementHighlights` の判定しきい値 (連続下落・労働分配率・単一チャネル依存・予算未達) を
 * ユーザーが調整して保存するための型と検証。値はローカルの record store に
 * 単一レコードで保存する (最新の 1 件を採用)。本モジュールは IO を持たない。
 */
import { DEFAULT_HIGHLIGHT_THRESHOLDS, type HighlightThresholds } from './managementHighlights';
import { relationIssue } from './recordRelations';
import { readEntryNumber } from '../../shared/readNumeric';

export const HIGHLIGHT_SETTINGS_COLLECTION = 'highlight-settings';

/** 保存用レコード (HighlightThresholds + record store 互換)。 */
export interface HighlightSettings extends Record<string, unknown>, HighlightThresholds {}

/**
 * 設定画面の入力欄 —— **しきい値 1 つにつき 1 行** (2026-09-27 · パス 493c)。
 *
 * 画面はこの表から欄を組む。それまで画面は 4 つの欄を手で並べ、業種プリセットを
 * 当てる関数の引数の型も 4 つを手で書いていた —— 5 つ目のしきい値を足した日に、
 * 判定は読むのに**画面からは設定できない**欄ができる (「設定できるのに効かない」の逆)。
 * 表としきい値の型の鍵が一致することは検査が両方向に見る。
 */
export const HIGHLIGHT_THRESHOLD_FIELDS: readonly { readonly key: keyof HighlightThresholds; readonly label: string }[] = [
  { key: 'declineWarnStreak', label: '連続下落 警告(期)' },
  { key: 'declineCriticalStreak', label: '連続下落 危険(期)' },
  { key: 'laborShareWarnPct', label: '労働分配率 警告(%)' },
  { key: 'singleChannelWarnPct', label: '単一チャネル依存(%)' },
  { key: 'budgetShortfallWarnPct', label: '予算未達 警告(達成率%)' },
];

/**
 * 入力を検証して clean な HighlightSettings に整える。未入力/空は既定値で補完。
 * - 連続下落の警告/危険期数は 1 以上の整数、危険 ≥ 警告。
 * - 各 % しきい値は 0..100 (予算未達も —— 100 を越えると達成済みの売上に「未達」と言う)。
 */
export function parseHighlightSettings(input: {
  declineWarnStreak?: unknown;
  declineCriticalStreak?: unknown;
  laborShareWarnPct?: unknown;
  singleChannelWarnPct?: unknown;
  budgetShortfallWarnPct?: unknown;
}): HighlightSettings {
  const d = DEFAULT_HIGHLIGHT_THRESHOLDS;
  /*
   * **読みは画面と同じ 1 つ** (`readEntryNumber` —— 2026-09-27 · パス 496)。それまでは
   * `Number()` で、全角の数字や `'60%'` を断り、`'1e1'` を 10 として黙って保存していた。
   * 期数は `Math.floor` で**黙って切り捨てて**おり、`'2.9'` は「1 以上の整数で入力して
   * ください」と言う欄に 2 として入った —— 整数の欄は、整数でなければ断る (パス 493p と同じ判断)。
   * 空欄は `''` だけが既定へ倒れ、**空白だけ (`'  '`) は `Number` が 0 と読んで断られていた** ——
   * 空欄の判定も共有の 1 つ (空白だけも空欄) にした。
   */
  const intMin1 = (v: unknown, fallback: number, label: string): number => {
    const read = readEntryNumber(v);
    if (read.kind === 'blank') return fallback;
    const refuse = (): Error => new Error(`${label}は 1 以上の整数で入力してください`);
    // 読めない入力の判定は**型の絞り込みのため**に要る (下の行で `read.value` を読む)。
    // 実行時には等価 —— 読めない結果は `value` を持たず `Number.isInteger(undefined)` は
    // false なので、消しても下の行が同じ文で断る (手で当てて related の 1,489 件が通る —— パス 496)。
    // 判定を 1 行に分けたのは、pragma が同じ行の本物の判定 (整数か・1 以上か) まで隠さないため。
    // Stryker disable next-line ConditionalExpression,StringLiteral: 等価 —— 消しても下の行が Number.isInteger(undefined) で同じ文を出す
    if (read.kind === 'unreadable') throw refuse();
    if (!Number.isInteger(read.value) || read.value < 1) throw refuse();
    return read.value;
  };
  const pct = (v: unknown, fallback: number, label: string): number => {
    const read = readEntryNumber(v);
    if (read.kind === 'blank') return fallback;
    if (read.kind === 'unreadable' || read.value < 0 || read.value > 100) {
      throw new Error(`${label}は 0〜100 の数値で入力してください`);
    }
    return Math.round(read.value * 10) / 10;
  };

  const declineWarnStreak = intMin1(input.declineWarnStreak, d.declineWarnStreak, '連続下落(警告)期数');
  const declineCriticalStreak = intMin1(input.declineCriticalStreak, d.declineCriticalStreak, '連続下落(危険)期数');
  const out: HighlightSettings = {
    declineWarnStreak,
    declineCriticalStreak,
    laborShareWarnPct: pct(input.laborShareWarnPct, d.laborShareWarnPct, '労働分配率の警告しきい値'),
    singleChannelWarnPct: pct(input.singleChannelWarnPct, d.singleChannelWarnPct, '単一チャネル依存の警告しきい値'),
    // 天井 100 は「達成率 102% に『予算未達です』と言わない」ため (型の docblock)。
    budgetShortfallWarnPct: pct(input.budgetShortfallWarnPct, d.budgetShortfallWarnPct, '予算未達の警告しきい値'),
  };
  /*
   * 危険 ≧ 警告 は **台帳 1 つ** (`recordRelations.ts`) —— 復元の入口も同じ関係を見る
   * (パス 224)。逆順の設定が復元で入ると `managementHighlights` の
   * `streak >= criticalStreak ? 'critical' : 'warning'` が常に前者へ倒れ、
   * **`warning` の枝が到達不能**になる (2 期の下落が「危険」として出る)。
   */
  const issue = relationIssue(HIGHLIGHT_SETTINGS_COLLECTION, out);
  if (issue !== null) throw new Error(issue);
  return out;
}
