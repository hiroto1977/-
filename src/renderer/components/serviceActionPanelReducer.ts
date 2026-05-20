/**
 * `ServiceActionPanel` の状態管理 — useReducer に集約した state machine。
 *
 * 旧実装は 7 個の useState (`note` / `amount` / `recBusy` / `advBusy` /
 * `feedback` / `error` / `advice`) を並列で持ち、各 setter を順番に呼ぶ
 * 必要があった。これだと:
 * - 「成功 feedback と error が同時に表示される」など状態の組み合わせが
 *   論理的に不整合になり得る
 * - 「busy 中に再 submit を許す」競合状態を防ぐコードがロジックに散る
 * - テスト時に「現在の状態」を 1 つの値として assert できない
 *
 * 本 reducer では `status` を discriminated union に集約することで、
 * 「recording / recorded / advising / advised / error」が **排他的に**
 * 1 つだけ active になる構造を強制する (PR #4 R2-3)。
 */

import type { ServiceAdvisorResponse } from '../../shared/advisorTypes';

export type Status =
  | { readonly kind: 'idle' }
  | { readonly kind: 'recording' }
  | { readonly kind: 'recorded'; readonly message: string }
  | { readonly kind: 'advising' }
  | { readonly kind: 'advised'; readonly advice: ServiceAdvisorResponse }
  | { readonly kind: 'error'; readonly message: string };

export interface PanelState {
  readonly note: string;
  readonly amount: string;
  readonly status: Status;
}

export type PanelAction =
  | { readonly type: 'NOTE_CHANGED'; readonly value: string }
  | { readonly type: 'AMOUNT_CHANGED'; readonly value: string }
  | { readonly type: 'RECORD_START' }
  | { readonly type: 'RECORD_SUCCESS'; readonly message: string }
  | { readonly type: 'ADVISE_START' }
  | { readonly type: 'ADVISE_SUCCESS'; readonly advice: ServiceAdvisorResponse }
  | { readonly type: 'ERROR'; readonly message: string };

export const INITIAL_PANEL_STATE: PanelState = {
  note: '',
  amount: '',
  status: { kind: 'idle' },
};

export function panelReducer(state: PanelState, action: PanelAction): PanelState {
  switch (action.type) {
    case 'NOTE_CHANGED':
      return { ...state, note: action.value };
    case 'AMOUNT_CHANGED':
      return { ...state, amount: action.value };
    case 'RECORD_START':
      return { ...state, status: { kind: 'recording' } };
    case 'RECORD_SUCCESS':
      return { note: '', amount: '', status: { kind: 'recorded', message: action.message } };
    case 'ADVISE_START':
      return { ...state, status: { kind: 'advising' } };
    case 'ADVISE_SUCCESS':
      return { ...state, status: { kind: 'advised', advice: action.advice } };
    case 'ERROR':
      return { ...state, status: { kind: 'error', message: action.message } };
  }
}

/** UI が「現在処理中か」を 1 関数で判定できるよう抽出 (busy ボタンの disabled 判定用)。 */
export function isBusy(status: Status): boolean {
  return status.kind === 'recording' || status.kind === 'advising';
}
