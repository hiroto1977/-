/**
 * 音声セッション・ステートマシン核 (round 84) — IO なしの純粋ロジック。
 *
 * round 83 の純粋コア `voiceCommand.ts` (parse/route/requiresConfirmation/
 * disambiguate) を「実際に動かす」ための状態遷移層。音声認識 (Web Speech API)
 * の薄いアダプタ (`../voice/speechAdapter.ts`) と最小 UI がこの reducer を介して
 * 状態を進める。本モジュール自身は副作用を一切持たない (テスト容易・mutation 対象)。
 *
 * 状態遷移図 (概略):
 *
 *   idle ──start──▶ listening ──transcript──▶ listening ──parsed──▶ …
 *                                                                   │
 *           非破壊的 ───────────────────────────────────────────── parsed ──confirm──▶ executing
 *           破壊的(確認必須) ───────────────────── awaiting-confirmation ──confirm──▶ executing
 *                                                            │ cancel/timeout ──▶ idle
 *                                                            │
 *                                                executing ──executed──▶ idle
 *
 * **不変条件 (最重要):** 破壊的 / 外部送信 / 課金系コマンド (requiresConfirmation
 * が true) は **必ず awaiting-confirmation を経由** してからでないと executing に
 * 入れない。parsed イベントで破壊的 intent が直接 parsed / executing へ落ちることは
 * 無い。非破壊的 intent は parsed (確認不要の待機状態) を経て confirm で executing へ。
 */

import {
  parseVoiceCommand,
  routeCommand,
  requiresConfirmation,
  type AvailableCapabilities,
  type VoiceIntent,
} from './voiceCommand';

// ---------------------------------------------------------------------------
// 型
// ---------------------------------------------------------------------------

/** セッションが取り得る状態。 */
export type VoiceSessionPhase =
  | 'idle'
  | 'listening'
  | 'parsed'
  | 'awaiting-confirmation'
  | 'executing'
  | 'error';

/** セッションの完全な状態 (イミュータブル)。 */
export interface VoiceSessionState {
  readonly phase: VoiceSessionPhase;
  /** 直近に認識された発話 (listening 以降)。 */
  readonly transcript?: string;
  /** parse + route 済みの意図 (parsed / awaiting-confirmation / executing)。 */
  readonly intent?: VoiceIntent;
  /** この intent が実行前に確認を要するか。awaiting-confirmation の前提条件。 */
  readonly needsConfirmation: boolean;
  /** error 状態の理由 (ユーザー向け文言)。 */
  readonly error?: string;
}

/** reducer が受け取るイベント。 */
export type VoiceSessionEvent =
  /** 認識を開始する (マイク ON)。 */
  | { readonly type: 'start' }
  /** 認識結果テキストが届いた。 */
  | { readonly type: 'transcript'; readonly text: string }
  /** 認識テキストを解析する (parse/route → parsed / awaiting-confirmation / error)。 */
  | { readonly type: 'parsed' }
  /** 実行を承認する (parsed の自動承認 / awaiting-confirmation のユーザー承認)。 */
  | { readonly type: 'confirm' }
  /** ユーザーが取り消した (どの段階からでも idle へ)。 */
  | { readonly type: 'cancel' }
  /** 実行が完了した (executing → idle)。 */
  | { readonly type: 'executed' }
  /** 認識・実行中にエラーが発生した。 */
  | { readonly type: 'error'; readonly message: string }
  /** タイムアウト (無音や応答なし)。 */
  | { readonly type: 'timeout' };

// ---------------------------------------------------------------------------
// 初期状態
// ---------------------------------------------------------------------------

/** セッションの初期状態 (アイドル)。 */
export const INITIAL_VOICE_SESSION: VoiceSessionState = {
  phase: 'idle',
  needsConfirmation: false,
};

// ---------------------------------------------------------------------------
// ヘルパ
// ---------------------------------------------------------------------------

/** error 状態を組み立てる (transcript / intent は捨てて安全側へ倒す)。 */
function toError(message: string): VoiceSessionState {
  return { phase: 'error', needsConfirmation: false, error: message };
}

/**
 * transcript を parse + route し、解析後状態を組み立てる純粋関数。
 * - 空 / 空白のみ / unknown 意図 → error (操作なし、ユーザーへ言い直しを促す)
 * - 破壊的 (確認必須) → awaiting-confirmation (確認 UI を必ず経由)
 * - それ以外 → parsed (確認不要の待機状態; confirm で executing へ)
 *
 * **不変条件:** 破壊的 intent は parsed を飛ばして直接 awaiting-confirmation へ。
 * executing へ落ちる経路はここには無い (confirm 経由でのみ executing になる)。
 */
function analyze(
  transcript: string | undefined,
  capabilities: AvailableCapabilities,
): VoiceSessionState {
  const text = (transcript ?? '').trim();
  if (text.length === 0) {
    return toError('発話が聞き取れませんでした。もう一度お試しください。');
  }
  const parsed = parseVoiceCommand(text);
  const routed = routeCommand(parsed, capabilities);
  if (routed.kind === 'unknown') {
    return toError(`「${text}」を解釈できませんでした。`);
  }
  const needs = requiresConfirmation(routed);
  return {
    phase: needs ? 'awaiting-confirmation' : 'parsed',
    transcript: text,
    intent: routed,
    needsConfirmation: needs,
  };
}

// ---------------------------------------------------------------------------
// reducer
// ---------------------------------------------------------------------------

/**
 * 音声セッションの状態遷移を計算する純粋関数。
 *
 * capabilities は parse 結果を実在の serviceId / action へ解決するために使う
 * (parse イベントでのみ参照)。state も event もミューテートせず、新しい state を返す。
 *
 * **不変条件:** 確認必須 (needsConfirmation) な intent は parse 後に必ず
 * awaiting-confirmation へ入り、executing へは confirm 経由でしか到達しない。
 */
export function reduceVoiceSession(
  state: VoiceSessionState,
  event: VoiceSessionEvent,
  capabilities: AvailableCapabilities,
): VoiceSessionState {
  switch (event.type) {
    // cancel はどの状態からでも常に idle へ戻す (緊急停止)。
    case 'cancel':
      return INITIAL_VOICE_SESSION;

    // error はどの状態からでも error へ。
    case 'error':
      return toError(event.message);

    // start: idle / error / parsed からのみ listening へ。実行中 (executing /
    // awaiting-confirmation) の再 start は無視して進行中の操作を守る。
    case 'start':
      if (state.phase === 'executing' || state.phase === 'awaiting-confirmation') {
        return state;
      }
      return { phase: 'listening', needsConfirmation: false };

    // transcript: listening 中のみ受理し、テキストを保持。連続発話 (複数 transcript)
    // は最後のテキストで上書きする (途中経過の差し替え)。それ以外の状態では無視。
    case 'transcript':
      if (state.phase !== 'listening') {
        return state;
      }
      return { phase: 'listening', transcript: event.text, needsConfirmation: false };

    // parsed: listening 中に保持した transcript を解析する。
    // 結果は error / parsed (確認不要) / awaiting-confirmation (確認必須) の
    // いずれか。executing へはここでは決して落とさない (不変条件)。
    case 'parsed':
      if (state.phase !== 'listening') {
        return state;
      }
      return analyze(state.transcript, capabilities);

    // confirm: 実行を承認 → executing。
    // - awaiting-confirmation (破壊的): ユーザーの明示承認
    // - parsed (非破壊的): UI が自動承認
    // それ以外 (idle/listening/executing/error) からの confirm は副作用を防ぐため無視。
    case 'confirm':
      if (state.phase !== 'awaiting-confirmation' && state.phase !== 'parsed') {
        return state;
      }
      return { ...state, phase: 'executing' };

    // executed: executing 中のみ受理し idle へ戻す。それ以外は無視。
    case 'executed':
      if (state.phase !== 'executing') {
        return state;
      }
      return INITIAL_VOICE_SESSION;

    // timeout: 承認待ち (listening / parsed / awaiting-confirmation) の無応答を
    // idle へ畳む。既に確定し実行中の操作 (executing) は中断しない。
    case 'timeout':
      if (
        state.phase === 'listening' ||
        state.phase === 'parsed' ||
        state.phase === 'awaiting-confirmation'
      ) {
        return INITIAL_VOICE_SESSION;
      }
      return state;
  }
}

// ---------------------------------------------------------------------------
// セレクタ (UI 用の純粋ヘルパ)
// ---------------------------------------------------------------------------

/** 実行直前の確認ダイアログを今まさに出すべきか。 */
export function isAwaitingConfirmation(state: VoiceSessionState): boolean {
  return state.phase === 'awaiting-confirmation';
}

/** いま実行可能な intent (executing 状態でのみ存在)。 */
export function executableIntent(state: VoiceSessionState): VoiceIntent | null {
  return state.phase === 'executing' && state.intent !== undefined ? state.intent : null;
}

/** マイクが録音中か (listening)。 */
export function isListening(state: VoiceSessionState): boolean {
  return state.phase === 'listening';
}
