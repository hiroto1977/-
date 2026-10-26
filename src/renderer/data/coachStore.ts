/**
 * ゴールコーチの状態を端末に残す・読む・消す (localStorage の `coach-state` ただ 1 キー)。
 *
 * 中身は利用者の目標・その理由・障害・使える時間で、**漏れれば中身が読まれる**ので台帳では
 * `sensitive` に載せ、「すべてのデータを削除」の対象でもある。外へは 1 バイトも送らない
 * (AI を使わない純ロジック・`goalCoach.ts`)。
 *
 * - 書く: `localWrite` の入口を通す (容量超過・書き込み禁止を成否で返す。**投げない**)。
 *   「保存しました」と言う面ではないが、**保存できなかったらそう言う** —— 翌日の予定が消えるので。
 * - 読む: 検証 (`sanitizeCoachState`) を通った物だけ。**読めない保存値は捨てて始めから**
 *   (黙って別の値にしない)。保存領域そのものが読めないときは、その理由を返す。
 * - 消す: コーチの「コーチをやめる」と、会話履歴の消去 (`clearChatbotHistory`) の両方が使う
 *   (法則 `escape-hatch-stays-open`: 預かった目標を画面から消せること)。
 */

import { readLocalJson, writeLocalJson, type LocalWriteResult } from './localWrite';
import { sanitizeCoachState, type CoachState } from './goalCoach';

export const COACH_STATE_KEY = 'coach-state';

export interface LoadedCoach {
  readonly state: CoachState | null;
  /** 読めなかった理由 (保存領域を読めなかったときだけ。読めない値は理由を持たず null 状態になる)。 */
  readonly note: string | null;
}

export function loadCoachState(): LoadedCoach {
  const r = readLocalJson<CoachState | null>(COACH_STATE_KEY, (raw) => (raw === null ? null : sanitizeCoachState(raw)));
  return { state: r.value, note: r.readable ? null : r.message };
}

/** 状態を残す。`null` は消す (保存先から鍵ごと外す)。成否を返す。 */
export function saveCoachState(state: CoachState | null): LocalWriteResult {
  if (state === null) {
    return clearCoachState() ? { ok: true } : { ok: false, message: '端末に保存した目標を消せませんでした。ブラウザの設定から消してください。' };
  }
  return writeLocalJson(COACH_STATE_KEY, state);
}

/** 預かった目標と計画を端末から消す。**成否を返す** (ストレージが拒むと投げうる)。 */
export function clearCoachState(): boolean {
  try {
    localStorage.removeItem(COACH_STATE_KEY);
    return true;
  } catch {
    return false;
  }
}
