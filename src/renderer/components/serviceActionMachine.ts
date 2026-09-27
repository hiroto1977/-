import type { ServiceAdvisorResponse } from '../../shared/advisorTypes';

/**
 * ServiceActionPanel の結果ステートマシン (PR #4 R2-3、2026-09-13 · パス 192 で分離)。
 *
 * 旧実装 (PR #4 より前) は recBusy / advBusy / feedback / error / advice の 5 つの
 * useState を個別に出し入れしており、「busy 中に error と feedback が両立する」
 * 「advice が残ったまま error が出る」といった不整合状態を型で防げなかった。
 * PR #4 はそれを **1 つの** discriminated union (`phase` + `result`) に畳んだ。
 *
 * ## その畳み方は、2 つの操作を 1 つとして数えていた (2026-09-13 · パス 192 実測)
 *
 * このパネルには**独立した 2 つの操作**が在る —— 業務メモの記録 (`record-entry`) と
 * 改善提案 (`advise`)。1 つの `phase` と 1 つの `result` に畳むと、両方が同じ枠を
 * 取り合う。jsdom で実際に押して測った結果:
 *
 * ```
 *   [1] メモを記録            → 「⚠ メモを受け付けました」が出る
 *   [2] 続けて改善提案を押す   → ★ 記録の確認が消える (提案に置き換わる)
 *   [3] 提案の後にもう一度記録 → ★ 提案が消える (確認に置き換わる)
 * ```
 *
 * **どちらも成功しているのに、片方しか画面に残らない。** 記録の確認が消えた後、
 * メモが受け付けられたことを示す物は画面に何も無い。
 *
 * 飛行中の扱いはもっと悪かった:
 *
 * ```
 *   [4] メモを記録 (飛行中)        → 記録ボタンは「送信中…」で disabled (正しい)
 *   [5] その間に改善提案を押す      → ★ phase が 'advising' へ移るので recBusy が
 *                                    false になり、記録ボタンが「メモを記録」に戻って
 *                                    **押せる状態に復帰する**
 *   [6] もう一度押す               → ★ 同じメモで record-entry が 2 回飛ぶ
 * ```
 *
 * つまり `phase` を共有したことで、**隣のボタンが自分の関門を外す**形になっていた。
 * パス 124 が入れた `useSubmitGuard` はこのパネルに来ていない —— あの母集団は
 * 「record store に触るファイル」で数えており、このパネルは業務記録を
 * `serviceHub.invoke('record-entry')` で送るので、**仕組みで引いた線の外側**に在った
 * (`submitGuardCensus.test.ts` の注記がその carve-out を持っている)。
 *
 * ## 直した形 —— 操作ごとに 1 つの枠
 *
 * 押している間の守りは `useSubmitGuard` が持つ (ref で同じ tick の 2 度目も止める。
 * reducer の state では次の描画まで古い値なので止められない)。ここは**結果だけ**を
 * 持ち、記録と提案に**別々の枠**を与える:
 *
 * - `record`: none / feedback / error —— 記録の結果
 * - `advice`: none / advice / error —— 提案の結果
 *
 * 各枠は今も discriminated union なので、**1 つの操作の中では**不整合が起きない
 * (提案の error と古い提案は同じ枠なので両立しない)。一方で**別の操作の結果は
 * 消さない** —— 記録が失敗しても、読んでいる提案はそのまま残る。
 *
 * `error` イベントを `record/error` と `advise/error` に割ったのはこのため。
 * 1 つの `error` では、どちらの枠へ入れるべきか決められなかった。
 */

/** 記録 (`record-entry`) の結果。 */
export type RecordOutcome =
  | { readonly kind: 'none' }
  | { readonly kind: 'feedback'; readonly text: string }
  | { readonly kind: 'error'; readonly text: string };

/** 改善提案 (`advise`) の結果。 */
export type AdviceOutcome =
  | { readonly kind: 'none' }
  | { readonly kind: 'advice'; readonly advice: ServiceAdvisorResponse }
  | { readonly kind: 'error'; readonly text: string };

export interface ActionState {
  readonly record: RecordOutcome;
  readonly advice: AdviceOutcome;
}

export const INITIAL_ACTION_STATE: ActionState = {
  record: { kind: 'none' },
  advice: { kind: 'none' },
};

export type ActionEvent =
  | { readonly type: 'record/start' }
  | { readonly type: 'record/success'; readonly text: string }
  | { readonly type: 'record/error'; readonly text: string }
  | { readonly type: 'advise/start' }
  | { readonly type: 'advise/success'; readonly advice: ServiceAdvisorResponse }
  | { readonly type: 'advise/error'; readonly text: string };

/**
 * 純粋遷移関数。**各イベントは自分の枠だけを書き換える** —— 隣の操作の結果は
 * 触らない (パス 192。それまでは 1 つの枠を共有し、後の操作が前の結果を消していた)。
 */
export function actionReducer(state: ActionState, event: ActionEvent): ActionState {
  switch (event.type) {
    case 'record/start':
      return { ...state, record: { kind: 'none' } };
    case 'record/success':
      return { ...state, record: { kind: 'feedback', text: event.text } };
    case 'record/error':
      return { ...state, record: { kind: 'error', text: event.text } };
    case 'advise/start':
      return { ...state, advice: { kind: 'none' } };
    case 'advise/success':
      return { ...state, advice: { kind: 'advice', advice: event.advice } };
    case 'advise/error':
      return { ...state, advice: { kind: 'error', text: event.text } };
    // Stryker disable next-line all: 網羅性チェック用の到達不能 default (型で全
    // イベントを処理済み)。新イベント追加時に never 代入で型エラーになる安全網。
    default: {
      const _exhaustive: never = event;
      return _exhaustive;
    }
  }
}

/** 派生セレクタ — UI 表示用の小さなヘルパー群。枠ごとに 1 組。 */
export const recordFeedback = (s: ActionState): string | null =>
  s.record.kind === 'feedback' ? s.record.text : null;
export const recordError = (s: ActionState): string | null =>
  s.record.kind === 'error' ? s.record.text : null;
export const adviceResult = (s: ActionState): ServiceAdvisorResponse | null =>
  s.advice.kind === 'advice' ? s.advice.advice : null;
export const adviceError = (s: ActionState): string | null =>
  s.advice.kind === 'error' ? s.advice.text : null;
