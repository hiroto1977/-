import type { ServiceAdvisorResponse } from '../../shared/advisorTypes';

/**
 * ServiceActionPanel の非同期ステートマシン (PR #4 R2-3)。
 *
 * 旧実装は recBusy / advBusy / feedback / error / advice の 5 つの useState を
 * 個別に出し入れしており、「busy 中に error と feedback が両立する」「advice が
 * 残ったまま error が出る」といった不整合状態を型で防げなかった。
 *
 * ここでは進行状態 (`phase`) と結果 (`result`) を 1 つの discriminated union に
 * まとめ、純粋 reducer で遷移させることで不整合を構造的に排除し、UI から
 * 切り離して単体テストできるようにする。
 */

export type ActionPhase = 'idle' | 'recording' | 'advising';

export type ActionResult =
  | { readonly kind: 'none' }
  | { readonly kind: 'feedback'; readonly text: string }
  | { readonly kind: 'error'; readonly text: string }
  | { readonly kind: 'advice'; readonly advice: ServiceAdvisorResponse };

export interface ActionState {
  readonly phase: ActionPhase;
  readonly result: ActionResult;
}

export const INITIAL_ACTION_STATE: ActionState = {
  phase: 'idle',
  result: { kind: 'none' },
};

export type ActionEvent =
  | { readonly type: 'record/start' }
  | { readonly type: 'record/success'; readonly text: string }
  | { readonly type: 'advise/start' }
  | { readonly type: 'advise/success'; readonly advice: ServiceAdvisorResponse }
  | { readonly type: 'error'; readonly text: string };

/**
 * 純粋遷移関数。各イベントは関連する結果のみを残し、それ以外をクリアする
 * (例: advise 開始時は前回の advice / error を消す)。
 */
export function actionReducer(_state: ActionState, event: ActionEvent): ActionState {
  switch (event.type) {
    case 'record/start':
      return { phase: 'recording', result: { kind: 'none' } };
    case 'record/success':
      return { phase: 'idle', result: { kind: 'feedback', text: event.text } };
    case 'advise/start':
      return { phase: 'advising', result: { kind: 'none' } };
    case 'advise/success':
      return { phase: 'idle', result: { kind: 'advice', advice: event.advice } };
    case 'error':
      return { phase: 'idle', result: { kind: 'error', text: event.text } };
    // Stryker disable next-line all: 網羅性チェック用の到達不能 default (型で全
    // イベントを処理済み)。新イベント追加時に never 代入で型エラーになる安全網。
    default: {
      const _exhaustive: never = event;
      return _exhaustive;
    }
  }
}

/** 派生セレクタ — UI 表示用の小さなヘルパー群。 */
export const isRecording = (s: ActionState): boolean => s.phase === 'recording';
export const isAdvising = (s: ActionState): boolean => s.phase === 'advising';
export const feedbackText = (s: ActionState): string | null =>
  s.result.kind === 'feedback' ? s.result.text : null;
export const errorText = (s: ActionState): string | null =>
  s.result.kind === 'error' ? s.result.text : null;
export const adviceResult = (s: ActionState): ServiceAdvisorResponse | null =>
  s.result.kind === 'advice' ? s.result.advice : null;
