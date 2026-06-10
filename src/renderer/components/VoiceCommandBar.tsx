/**
 * VoiceCommandBar (round 84) — 音声コマンドの最小 UI。
 *
 * App ヘッダに置くマイクボタン。Web Speech API (`../voice/speechAdapter.ts`)
 * で日本語発話を認識し、純粋ステートマシン (`../data/voiceSession.ts`) を介して
 *   認識テキスト → 解釈結果 → (破壊的なら) 確認ダイアログ → 実行
 * を進める。実行は既存の navigation CustomEvent / `window.serviceHub.invoke`
 * 経由で行う。破壊的操作は **必ず確認 UI を経由** する (核の不変条件)。
 *
 * このコンポーネントは I/O (マイク / serviceHub / DOM イベント) の配線だけを
 * 担い、判断ロジックは全て純粋核に委譲する。Web Speech 非対応環境では
 * graceful に「非対応」表示にフォールバックする。
 */
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import {
  INITIAL_VOICE_SESSION,
  reduceVoiceSession,
  type VoiceSessionEvent,
  type VoiceSessionState,
} from '../data/voiceSession';
import type { AvailableCapabilities, VoiceIntent } from '../data/voiceCommand';
import { SERVICE_IDS, type ServiceId } from '../../shared/serviceId';
import {
  isSpeechRecognitionSupported,
  startSpeechRecognition,
  type SpeechSessionHandle,
} from '../voice/speechAdapter';

// 音声からルーティング可能な write action を serviceId 別に宣言。
// (main の LIVE_ACTIONS は import 境界外なので renderer 側に最小の対応表を持つ。)
const VOICE_ACTIONS: AvailableCapabilities['actions'] = {
  github: ['create-issue'],
  slack: ['send-message'],
  calendar: ['create-event'],
  'uber-eats': ['record-entry'],
  'demae-can': ['record-entry'],
  'real-estate': ['record-entry'],
  'mutual-funds': ['record-entry'],
};

/** 音声/チャット共通の能力テーブル (ChatbotWidget も同じ表を参照する)。 */
export const CAPABILITIES: AvailableCapabilities = {
  serviceIds: SERVICE_IDS,
  actions: VOICE_ACTIONS,
};

/** intent の人間可読サマリ (UI 表示用)。 */
function describeIntent(intent: VoiceIntent): string {
  const svc = intent.serviceId ?? '（サービス未特定）';
  switch (intent.kind) {
    case 'navigate':
      return `${svc} を開く`;
    case 'action':
      return `${svc} で「${intent.action ?? ''}」を実行`;
    case 'query':
      return `${svc} の情報を確認`;
    default:
      return '解釈できません';
  }
}

/** serviceId へ画面遷移する (App.tsx が listen している CustomEvent)。 */
function navigateTo(serviceId: ServiceId): void {
  window.dispatchEvent(new CustomEvent('servicehub:navigate', { detail: serviceId }));
}

/**
 * executing 状態の intent を実際に実行する。
 * - navigate / query → 画面遷移
 * - action → serviceHub.invoke (失敗は呼び出し側でハンドルできるよう Promise を返す)
 */
async function performIntent(intent: VoiceIntent): Promise<void> {
  if (intent.serviceId === undefined) return;
  if (intent.kind === 'action' && intent.action !== undefined) {
    await window.serviceHub.invoke(intent.serviceId, intent.action, intent.params ?? {});
    // 実行後は対象サービスを開いて結果を確認できるようにする。
    navigateTo(intent.serviceId);
    return;
  }
  navigateTo(intent.serviceId);
}

export function VoiceCommandBar() {
  const supported = useMemo(() => isSpeechRecognitionSupported(), []);
  const [state, rawDispatch] = useReducer(
    (s: VoiceSessionState, e: VoiceSessionEvent) => reduceVoiceSession(s, e, CAPABILITIES),
    INITIAL_VOICE_SESSION,
  );
  const sessionRef = useRef<SpeechSessionHandle | null>(null);
  const [open, setOpen] = useState(false);

  const dispatch = useCallback((e: VoiceSessionEvent) => rawDispatch(e), []);

  // executing 状態になったら 1 度だけ副作用を実行し、完了で idle へ戻す。
  const executedKeyRef = useRef<string | null>(null);
  useEffect(() => {
    if (state.phase !== 'executing' || state.intent === undefined) {
      if (state.phase !== 'executing') executedKeyRef.current = null;
      return;
    }
    // 同一 executing 状態で二重実行しないためのガード。
    const key = JSON.stringify(state.intent);
    if (executedKeyRef.current === key) return;
    executedKeyRef.current = key;
    let cancelled = false;
    performIntent(state.intent)
      .then(() => {
        if (!cancelled) dispatch({ type: 'executed' });
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          dispatch({
            type: 'error',
            message: err instanceof Error ? err.message : '実行に失敗しました。',
          });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [state.phase, state.intent, dispatch]);

  // 非破壊コマンドは parsed (確認不要) で待機する。確認 UI は不要なので自動承認。
  // 破壊的コマンドは awaiting-confirmation に入り、ユーザーの明示承認を待つ。
  useEffect(() => {
    if (state.phase === 'parsed') {
      dispatch({ type: 'confirm' });
    }
  }, [state.phase, dispatch]);

  function stopSession() {
    sessionRef.current?.abort();
    sessionRef.current = null;
  }

  function handleMicClick() {
    if (!supported) return;
    setOpen(true);
    dispatch({ type: 'start' });
    stopSession();
    sessionRef.current = startSpeechRecognition({
      onTranscript: (text, isFinal) => {
        dispatch({ type: 'transcript', text });
        if (isFinal) dispatch({ type: 'parsed' });
      },
      onError: (message) => dispatch({ type: 'error', message }),
      onEnd: () => {
        sessionRef.current = null;
      },
    });
  }

  function handleCancel() {
    stopSession();
    dispatch({ type: 'cancel' });
    setOpen(false);
  }

  function handleConfirm() {
    dispatch({ type: 'confirm' });
  }

  // アンマウント時に認識を確実に止める。
  useEffect(() => () => stopSession(), []);

  if (!supported) {
    return (
      <span
        className="voice-unsupported"
        title="このブラウザは音声認識 (Web Speech API) に対応していません"
        aria-label="音声認識は非対応"
        style={{ fontSize: 12, color: 'var(--text-mute)' }}
      >
        🎙️ 音声非対応
      </span>
    );
  }

  return (
    <div className="voice-command-bar" style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
      <button
        type="button"
        className={`voice-mic ${state.phase === 'listening' ? 'listening' : ''}`}
        onClick={handleMicClick}
        aria-label="音声コマンドを開始"
        aria-pressed={state.phase === 'listening'}
        title="話しかけて操作 (日本語)"
        style={{
          border: '1px solid var(--border, #444)',
          borderRadius: 8,
          padding: '4px 10px',
          background: state.phase === 'listening' ? 'rgba(239,68,68,0.15)' : 'transparent',
          cursor: 'pointer',
        }}
      >
        {state.phase === 'listening' ? '🔴 聞き取り中…' : '🎙️ 音声'}
      </button>

      {open && state.phase !== 'idle' && (
        <div
          className="voice-panel"
          role="status"
          style={{
            fontSize: 12,
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
            padding: '2px 8px',
            borderRadius: 6,
            background: 'var(--panel, rgba(0,0,0,0.05))',
          }}
        >
          {state.transcript && (
            <span className="voice-transcript" aria-label="認識テキスト">
              「{state.transcript}」
            </span>
          )}

          {state.intent && (
            <span className="voice-interpretation" aria-label="解釈結果">
              → {describeIntent(state.intent)}
            </span>
          )}

          {state.phase === 'awaiting-confirmation' && (
            <span className="voice-confirm" role="alertdialog" aria-label="実行確認">
              <strong style={{ color: 'var(--danger, #ef4444)' }}>確認:</strong> 実行しますか？
              <button type="button" onClick={handleConfirm} aria-label="実行を承認" style={{ marginLeft: 6 }}>
                実行
              </button>
              <button type="button" onClick={handleCancel} aria-label="実行を取り消し" style={{ marginLeft: 4 }}>
                取消
              </button>
            </span>
          )}

          {state.phase === 'executing' && <span aria-label="実行中">実行中…</span>}

          {state.phase === 'error' && (
            <span className="voice-error" role="alert" style={{ color: 'var(--danger, #ef4444)' }}>
              {state.error}
            </span>
          )}

          {state.phase !== 'awaiting-confirmation' && (
            <button type="button" onClick={handleCancel} aria-label="音声パネルを閉じる" style={{ marginLeft: 4 }}>
              ✕
            </button>
          )}
        </div>
      )}
    </div>
  );
}
