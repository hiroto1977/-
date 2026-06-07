/**
 * voiceSession.ts — 音声セッション純粋ステートマシンのテスト (round 84)。
 *
 * mutation 100% を目標に、全状態遷移・確認必須の不変条件・境界 (空 transcript /
 * 連続発話 / タイムアウト / 無効イベント) を撃墜する。
 *
 * **最重要不変条件:** 破壊的 (requiresConfirmation=true) なコマンドは
 * 必ず awaiting-confirmation を経由し、confirm 経由でしか executing に入らない。
 * 非破壊的コマンドは parsed (確認不要の待機状態) を経て confirm で executing へ。
 */
import { describe, expect, it } from 'vitest';
import {
  INITIAL_VOICE_SESSION,
  reduceVoiceSession,
  isAwaitingConfirmation,
  executableIntent,
  isListening,
  type VoiceSessionState,
  type VoiceSessionEvent,
  type VoiceSessionPhase,
} from '../voiceSession';
import { SERVICE_IDS } from '../../../shared/serviceId';
import type { AvailableCapabilities } from '../voiceCommand';

// 実在の能力テーブル (テスト用)。voiceCommand.test.ts と整合。
const CAP: AvailableCapabilities = {
  serviceIds: SERVICE_IDS,
  actions: {
    github: ['create-issue'],
    slack: ['send-message'],
    calendar: ['create-event'],
    'uber-eats': ['record-entry', 'advise'],
  },
};

/** イベントを順に流して最終状態を得るヘルパ。 */
function run(
  events: VoiceSessionEvent[],
  start: VoiceSessionState = INITIAL_VOICE_SESSION,
): VoiceSessionState {
  return events.reduce((s, e) => reduceVoiceSession(s, e, CAP), start);
}

/** listening + transcript の状態を作る。 */
function listeningWith(text: string): VoiceSessionState {
  return run([{ type: 'start' }, { type: 'transcript', text }]);
}

// 代表的な発話。
const NAV_UTTERANCE = 'githubを開いて'; // navigate — 確認不要
const QUERY_UTTERANCE = '売上はいくら'; // query — 確認不要
const DESTRUCTIVE_UTTERANCE = 'githubにイシューを作って'; // action create-issue — 確認必須
const SEND_UTTERANCE = 'slackにメッセージを送って'; // action send-message — 確認必須
const UNKNOWN_UTTERANCE = 'ほげほげぴよぴよ'; // 解釈不能

// ===== 初期状態 =============================================================

describe('INITIAL_VOICE_SESSION', () => {
  it('phase は idle', () => {
    expect(INITIAL_VOICE_SESSION.phase).toBe('idle');
  });
  it('needsConfirmation は false', () => {
    expect(INITIAL_VOICE_SESSION.needsConfirmation).toBe(false);
  });
  it('transcript / intent / error は未設定', () => {
    expect(INITIAL_VOICE_SESSION.transcript).toBeUndefined();
    expect(INITIAL_VOICE_SESSION.intent).toBeUndefined();
    expect(INITIAL_VOICE_SESSION.error).toBeUndefined();
  });
});

// ===== start ================================================================

describe('start イベント', () => {
  it('idle → listening', () => {
    const s = reduceVoiceSession(INITIAL_VOICE_SESSION, { type: 'start' }, CAP);
    expect(s.phase).toBe('listening');
    expect(s.needsConfirmation).toBe(false);
  });

  it('error → listening (再試行できる)', () => {
    const err = run([{ type: 'error', message: 'x' }]);
    expect(err.phase).toBe('error');
    const s = reduceVoiceSession(err, { type: 'start' }, CAP);
    expect(s.phase).toBe('listening');
  });

  it('parsed からの start は listening を作り直す (transcript を捨てる)', () => {
    const parsed = run([{ type: 'start' }, { type: 'transcript', text: NAV_UTTERANCE }, { type: 'parsed' }]);
    expect(parsed.phase).toBe('parsed');
    expect(parsed.transcript).toBe(NAV_UTTERANCE);
    const s = reduceVoiceSession(parsed, { type: 'start' }, CAP);
    expect(s.phase).toBe('listening');
    expect(s.transcript).toBeUndefined();
  });

  it('listening からの start は listening を作り直す', () => {
    const l = listeningWith(NAV_UTTERANCE);
    expect(l.transcript).toBe(NAV_UTTERANCE);
    const s = reduceVoiceSession(l, { type: 'start' }, CAP);
    expect(s.phase).toBe('listening');
    expect(s.transcript).toBeUndefined();
  });

  it('executing 中の start は無視 (進行中の操作を守る)', () => {
    const exec = run([
      { type: 'start' },
      { type: 'transcript', text: NAV_UTTERANCE },
      { type: 'parsed' },
      { type: 'confirm' },
    ]);
    expect(exec.phase).toBe('executing');
    const s = reduceVoiceSession(exec, { type: 'start' }, CAP);
    expect(s).toBe(exec); // 同一参照を返す = 無視
    expect(s.phase).toBe('executing');
  });

  it('awaiting-confirmation 中の start は無視', () => {
    const await1 = run([
      { type: 'start' },
      { type: 'transcript', text: DESTRUCTIVE_UTTERANCE },
      { type: 'parsed' },
    ]);
    expect(await1.phase).toBe('awaiting-confirmation');
    const s = reduceVoiceSession(await1, { type: 'start' }, CAP);
    expect(s).toBe(await1);
    expect(s.phase).toBe('awaiting-confirmation');
  });
});

// ===== transcript ===========================================================

describe('transcript イベント', () => {
  it('listening 中はテキストを保持', () => {
    const s = run([{ type: 'start' }, { type: 'transcript', text: 'こんにちは' }]);
    expect(s.phase).toBe('listening');
    expect(s.transcript).toBe('こんにちは');
  });

  it('連続発話は最後のテキストで上書き', () => {
    const s = run([
      { type: 'start' },
      { type: 'transcript', text: '最初' },
      { type: 'transcript', text: '次' },
      { type: 'transcript', text: '最後' },
    ]);
    expect(s.transcript).toBe('最後');
    expect(s.phase).toBe('listening');
  });

  it('idle 中の transcript は無視 (listening 以外では受理しない)', () => {
    const s = reduceVoiceSession(INITIAL_VOICE_SESSION, { type: 'transcript', text: 'x' }, CAP);
    expect(s).toBe(INITIAL_VOICE_SESSION);
    expect(s.transcript).toBeUndefined();
  });

  it('executing 中の transcript は無視', () => {
    const exec = run([
      { type: 'start' },
      { type: 'transcript', text: NAV_UTTERANCE },
      { type: 'parsed' },
      { type: 'confirm' },
    ]);
    const s = reduceVoiceSession(exec, { type: 'transcript', text: 'よけいな発話' }, CAP);
    expect(s).toBe(exec);
  });

  it('transcript は needsConfirmation を false に保つ', () => {
    const s = run([{ type: 'start' }, { type: 'transcript', text: 'x' }]);
    expect(s.needsConfirmation).toBe(false);
  });
});

// ===== parsed: 非破壊 → parsed (確認不要の待機) ============================

describe('parsed イベント — 非破壊コマンド', () => {
  it('navigate は parsed (確認不要) で待機 (executing 直行しない)', () => {
    const s = run([{ type: 'start' }, { type: 'transcript', text: NAV_UTTERANCE }, { type: 'parsed' }]);
    expect(s.phase).toBe('parsed');
    expect(s.phase).not.toBe('executing');
    expect(s.needsConfirmation).toBe(false);
    expect(s.intent?.kind).toBe('navigate');
    expect(s.intent?.serviceId).toBe('github');
  });

  it('query も parsed (確認不要) で待機', () => {
    const s = run([{ type: 'start' }, { type: 'transcript', text: QUERY_UTTERANCE }, { type: 'parsed' }]);
    expect(s.phase).toBe('parsed');
    expect(s.needsConfirmation).toBe(false);
    expect(s.intent?.kind).toBe('query');
  });

  it('parsed 後も transcript を保持', () => {
    const s = run([{ type: 'start' }, { type: 'transcript', text: NAV_UTTERANCE }, { type: 'parsed' }]);
    expect(s.transcript).toBe(NAV_UTTERANCE);
  });
});

// ===== parsed: 破壊的 → awaiting-confirmation 必須 (不変条件) ==============

describe('parsed イベント — 破壊的コマンド (確認必須の不変条件)', () => {
  it('create-issue は parsed / executing を飛ばして awaiting-confirmation へ', () => {
    const s = run([
      { type: 'start' },
      { type: 'transcript', text: DESTRUCTIVE_UTTERANCE },
      { type: 'parsed' },
    ]);
    expect(s.phase).toBe('awaiting-confirmation');
    expect(s.phase).not.toBe('executing');
    expect(s.phase).not.toBe('parsed');
    expect(s.needsConfirmation).toBe(true);
    expect(s.intent?.kind).toBe('action');
    expect(s.intent?.action).toBe('create-issue');
  });

  it('send-message も awaiting-confirmation へ', () => {
    const s = run([{ type: 'start' }, { type: 'transcript', text: SEND_UTTERANCE }, { type: 'parsed' }]);
    expect(s.phase).toBe('awaiting-confirmation');
    expect(s.needsConfirmation).toBe(true);
    expect(s.intent?.action).toBe('send-message');
  });

  it('不変条件: 破壊的コマンドは parsed 直後に executing にも parsed にもならない', () => {
    const destructiveUtterances = [DESTRUCTIVE_UTTERANCE, SEND_UTTERANCE, 'カレンダーにイベントを作って'];
    for (const u of destructiveUtterances) {
      const s = run([{ type: 'start' }, { type: 'transcript', text: u }, { type: 'parsed' }]);
      expect(s.phase).toBe('awaiting-confirmation');
    }
  });

  it('awaiting-confirmation は intent / transcript を保持する', () => {
    const s = run([{ type: 'start' }, { type: 'transcript', text: DESTRUCTIVE_UTTERANCE }, { type: 'parsed' }]);
    expect(s.transcript).toBe(DESTRUCTIVE_UTTERANCE);
    expect(s.intent).toBeDefined();
  });
});

// ===== parsed: エラー系 =====================================================

describe('parsed イベント — エラー系', () => {
  it('空 transcript (start のみ) で parsed すると error', () => {
    const s = run([{ type: 'start' }, { type: 'parsed' }]);
    expect(s.phase).toBe('error');
    expect(s.error).toContain('聞き取れません');
    expect(s.needsConfirmation).toBe(false);
  });

  it('空白のみの transcript は error', () => {
    const s = run([{ type: 'start' }, { type: 'transcript', text: '   ' }, { type: 'parsed' }]);
    expect(s.phase).toBe('error');
    expect(s.error).toContain('聞き取れません');
  });

  it('解釈不能な発話は error (元テキストを含む)', () => {
    const s = run([{ type: 'start' }, { type: 'transcript', text: UNKNOWN_UTTERANCE }, { type: 'parsed' }]);
    expect(s.phase).toBe('error');
    expect(s.error).toContain(UNKNOWN_UTTERANCE);
    expect(s.error).toContain('解釈できません');
  });

  it('error 状態は transcript / intent を持たない (安全側へ倒す)', () => {
    const s = run([{ type: 'start' }, { type: 'transcript', text: UNKNOWN_UTTERANCE }, { type: 'parsed' }]);
    expect(s.transcript).toBeUndefined();
    expect(s.intent).toBeUndefined();
  });
});

// ===== parsed: listening 以外は無視 ========================================

describe('parsed イベント — listening 以外は無視', () => {
  it('idle からの parsed は無視', () => {
    const s = reduceVoiceSession(INITIAL_VOICE_SESSION, { type: 'parsed' }, CAP);
    expect(s).toBe(INITIAL_VOICE_SESSION);
  });

  it('executing からの parsed は無視', () => {
    const exec = run([
      { type: 'start' },
      { type: 'transcript', text: NAV_UTTERANCE },
      { type: 'parsed' },
      { type: 'confirm' },
    ]);
    const s = reduceVoiceSession(exec, { type: 'parsed' }, CAP);
    expect(s).toBe(exec);
  });

  it('awaiting-confirmation からの parsed は無視', () => {
    const await1 = run([{ type: 'start' }, { type: 'transcript', text: DESTRUCTIVE_UTTERANCE }, { type: 'parsed' }]);
    const s = reduceVoiceSession(await1, { type: 'parsed' }, CAP);
    expect(s).toBe(await1);
  });

  it('parsed (非破壊待機) からの再 parsed は無視', () => {
    const parsed = run([{ type: 'start' }, { type: 'transcript', text: NAV_UTTERANCE }, { type: 'parsed' }]);
    const s = reduceVoiceSession(parsed, { type: 'parsed' }, CAP);
    expect(s).toBe(parsed);
  });
});

// ===== confirm ==============================================================

describe('confirm イベント', () => {
  it('awaiting-confirmation (破壊的) → executing', () => {
    const await1 = run([{ type: 'start' }, { type: 'transcript', text: DESTRUCTIVE_UTTERANCE }, { type: 'parsed' }]);
    const s = reduceVoiceSession(await1, { type: 'confirm' }, CAP);
    expect(s.phase).toBe('executing');
    expect(s.intent?.action).toBe('create-issue');
    expect(s.needsConfirmation).toBe(true); // intent は確認必須のまま保持
  });

  it('parsed (非破壊的) → executing', () => {
    const parsed = run([{ type: 'start' }, { type: 'transcript', text: NAV_UTTERANCE }, { type: 'parsed' }]);
    const s = reduceVoiceSession(parsed, { type: 'confirm' }, CAP);
    expect(s.phase).toBe('executing');
    expect(s.intent?.kind).toBe('navigate');
    expect(s.needsConfirmation).toBe(false);
  });

  it('confirm 後の executing は同じ intent / transcript を保持', () => {
    const s = run([
      { type: 'start' },
      { type: 'transcript', text: SEND_UTTERANCE },
      { type: 'parsed' },
      { type: 'confirm' },
    ]);
    expect(s.phase).toBe('executing');
    expect(s.intent?.action).toBe('send-message');
    expect(s.transcript).toBe(SEND_UTTERANCE);
  });

  it('idle からの confirm は無視 (副作用直行を防ぐ)', () => {
    const s = reduceVoiceSession(INITIAL_VOICE_SESSION, { type: 'confirm' }, CAP);
    expect(s).toBe(INITIAL_VOICE_SESSION);
    expect(s.phase).toBe('idle');
  });

  it('listening からの confirm は無視', () => {
    const l = listeningWith(DESTRUCTIVE_UTTERANCE);
    const s = reduceVoiceSession(l, { type: 'confirm' }, CAP);
    expect(s).toBe(l);
    expect(s.phase).toBe('listening');
  });

  it('executing からの confirm は無視 (二重実行しない)', () => {
    const exec = run([
      { type: 'start' },
      { type: 'transcript', text: NAV_UTTERANCE },
      { type: 'parsed' },
      { type: 'confirm' },
    ]);
    const s = reduceVoiceSession(exec, { type: 'confirm' }, CAP);
    expect(s).toBe(exec);
  });

  it('error からの confirm は無視', () => {
    const err = run([{ type: 'start' }, { type: 'transcript', text: UNKNOWN_UTTERANCE }, { type: 'parsed' }]);
    const s = reduceVoiceSession(err, { type: 'confirm' }, CAP);
    expect(s).toBe(err);
  });
});

// ===== cancel ===============================================================

describe('cancel イベント — どの状態からでも idle へ', () => {
  const phases: { name: string; build: () => VoiceSessionState }[] = [
    { name: 'idle', build: () => INITIAL_VOICE_SESSION },
    { name: 'listening', build: () => listeningWith(NAV_UTTERANCE) },
    {
      name: 'parsed',
      build: () => run([{ type: 'start' }, { type: 'transcript', text: NAV_UTTERANCE }, { type: 'parsed' }]),
    },
    {
      name: 'executing',
      build: () =>
        run([
          { type: 'start' },
          { type: 'transcript', text: NAV_UTTERANCE },
          { type: 'parsed' },
          { type: 'confirm' },
        ]),
    },
    {
      name: 'awaiting-confirmation',
      build: () => run([{ type: 'start' }, { type: 'transcript', text: DESTRUCTIVE_UTTERANCE }, { type: 'parsed' }]),
    },
    {
      name: 'error',
      build: () => run([{ type: 'start' }, { type: 'transcript', text: UNKNOWN_UTTERANCE }, { type: 'parsed' }]),
    },
  ];

  for (const p of phases) {
    it(`${p.name} → cancel → idle (transcript/intent/error をクリア)`, () => {
      const s = reduceVoiceSession(p.build(), { type: 'cancel' }, CAP);
      expect(s).toEqual(INITIAL_VOICE_SESSION);
      expect(s.phase).toBe('idle');
      expect(s.transcript).toBeUndefined();
      expect(s.intent).toBeUndefined();
      expect(s.error).toBeUndefined();
    });
  }
});

// ===== executed =============================================================

describe('executed イベント', () => {
  it('executing → idle', () => {
    const exec = run([
      { type: 'start' },
      { type: 'transcript', text: NAV_UTTERANCE },
      { type: 'parsed' },
      { type: 'confirm' },
    ]);
    const s = reduceVoiceSession(exec, { type: 'executed' }, CAP);
    expect(s).toEqual(INITIAL_VOICE_SESSION);
    expect(s.phase).toBe('idle');
  });

  it('破壊的 confirm 経由の executing からも executed で idle', () => {
    const s = run([
      { type: 'start' },
      { type: 'transcript', text: DESTRUCTIVE_UTTERANCE },
      { type: 'parsed' },
      { type: 'confirm' },
      { type: 'executed' },
    ]);
    expect(s.phase).toBe('idle');
  });

  it('idle からの executed は無視', () => {
    const s = reduceVoiceSession(INITIAL_VOICE_SESSION, { type: 'executed' }, CAP);
    expect(s).toBe(INITIAL_VOICE_SESSION);
  });

  it('listening からの executed は無視', () => {
    const l = listeningWith(NAV_UTTERANCE);
    const s = reduceVoiceSession(l, { type: 'executed' }, CAP);
    expect(s).toBe(l);
  });

  it('parsed からの executed は無視 (確認/実行前に完了扱いしない)', () => {
    const parsed = run([{ type: 'start' }, { type: 'transcript', text: NAV_UTTERANCE }, { type: 'parsed' }]);
    const s = reduceVoiceSession(parsed, { type: 'executed' }, CAP);
    expect(s).toBe(parsed);
    expect(s.phase).toBe('parsed');
  });

  it('awaiting-confirmation からの executed は無視 (確認前に完了扱いしない)', () => {
    const await1 = run([{ type: 'start' }, { type: 'transcript', text: DESTRUCTIVE_UTTERANCE }, { type: 'parsed' }]);
    const s = reduceVoiceSession(await1, { type: 'executed' }, CAP);
    expect(s).toBe(await1);
    expect(s.phase).toBe('awaiting-confirmation');
  });
});

// ===== error ================================================================

describe('error イベント — どの状態からでも error へ', () => {
  it('listening 中のエラー (no-speech 等) で error', () => {
    const l = listeningWith(NAV_UTTERANCE);
    const s = reduceVoiceSession(l, { type: 'error', message: 'no-speech' }, CAP);
    expect(s.phase).toBe('error');
    expect(s.error).toBe('no-speech');
    expect(s.needsConfirmation).toBe(false);
  });

  it('executing 中のエラーで error', () => {
    const exec = run([
      { type: 'start' },
      { type: 'transcript', text: NAV_UTTERANCE },
      { type: 'parsed' },
      { type: 'confirm' },
    ]);
    const s = reduceVoiceSession(exec, { type: 'error', message: '実行に失敗' }, CAP);
    expect(s.phase).toBe('error');
    expect(s.error).toBe('実行に失敗');
  });

  it('error 状態は transcript / intent を持たない', () => {
    const exec = run([
      { type: 'start' },
      { type: 'transcript', text: NAV_UTTERANCE },
      { type: 'parsed' },
      { type: 'confirm' },
    ]);
    const s = reduceVoiceSession(exec, { type: 'error', message: 'x' }, CAP);
    expect(s.transcript).toBeUndefined();
    expect(s.intent).toBeUndefined();
  });
});

// ===== timeout ==============================================================

describe('timeout イベント', () => {
  it('listening → idle (無音タイムアウト)', () => {
    const l = listeningWith(NAV_UTTERANCE);
    const s = reduceVoiceSession(l, { type: 'timeout' }, CAP);
    expect(s).toEqual(INITIAL_VOICE_SESSION);
    expect(s.phase).toBe('idle');
  });

  it('parsed → idle (非破壊待機の無応答)', () => {
    const parsed = run([{ type: 'start' }, { type: 'transcript', text: NAV_UTTERANCE }, { type: 'parsed' }]);
    const s = reduceVoiceSession(parsed, { type: 'timeout' }, CAP);
    expect(s).toEqual(INITIAL_VOICE_SESSION);
    expect(s.phase).toBe('idle');
  });

  it('awaiting-confirmation → idle (確認の無応答)', () => {
    const await1 = run([{ type: 'start' }, { type: 'transcript', text: DESTRUCTIVE_UTTERANCE }, { type: 'parsed' }]);
    const s = reduceVoiceSession(await1, { type: 'timeout' }, CAP);
    expect(s).toEqual(INITIAL_VOICE_SESSION);
    expect(s.phase).toBe('idle');
  });

  it('executing 中の timeout は無視 (確定済み操作を中断しない)', () => {
    const exec = run([
      { type: 'start' },
      { type: 'transcript', text: NAV_UTTERANCE },
      { type: 'parsed' },
      { type: 'confirm' },
    ]);
    const s = reduceVoiceSession(exec, { type: 'timeout' }, CAP);
    expect(s).toBe(exec);
    expect(s.phase).toBe('executing');
  });

  it('idle 中の timeout は無視', () => {
    const s = reduceVoiceSession(INITIAL_VOICE_SESSION, { type: 'timeout' }, CAP);
    expect(s).toBe(INITIAL_VOICE_SESSION);
  });

  it('error 中の timeout は無視 (error を保持)', () => {
    const err = run([{ type: 'start' }, { type: 'transcript', text: UNKNOWN_UTTERANCE }, { type: 'parsed' }]);
    const s = reduceVoiceSession(err, { type: 'timeout' }, CAP);
    expect(s).toBe(err);
    expect(s.phase).toBe('error');
  });
});

// ===== 完全シナリオ (end-to-end の遷移列) ==================================

describe('完全シナリオ', () => {
  it('破壊的: start→transcript→parsed→confirm→executed の全段階を通過', () => {
    let s: VoiceSessionState = INITIAL_VOICE_SESSION;
    const seen: VoiceSessionPhase[] = [s.phase];

    s = reduceVoiceSession(s, { type: 'start' }, CAP);
    seen.push(s.phase);
    s = reduceVoiceSession(s, { type: 'transcript', text: DESTRUCTIVE_UTTERANCE }, CAP);
    seen.push(s.phase);
    s = reduceVoiceSession(s, { type: 'parsed' }, CAP);
    seen.push(s.phase);
    s = reduceVoiceSession(s, { type: 'confirm' }, CAP);
    seen.push(s.phase);
    s = reduceVoiceSession(s, { type: 'executed' }, CAP);
    seen.push(s.phase);

    expect(seen).toEqual([
      'idle',
      'listening',
      'listening',
      'awaiting-confirmation',
      'executing',
      'idle',
    ]);
  });

  it('非破壊: start→transcript→parsed→confirm→executed (parsed 経由)', () => {
    let s: VoiceSessionState = INITIAL_VOICE_SESSION;
    const seen: VoiceSessionPhase[] = [s.phase];
    s = reduceVoiceSession(s, { type: 'start' }, CAP);
    seen.push(s.phase);
    s = reduceVoiceSession(s, { type: 'transcript', text: NAV_UTTERANCE }, CAP);
    seen.push(s.phase);
    s = reduceVoiceSession(s, { type: 'parsed' }, CAP);
    seen.push(s.phase);
    s = reduceVoiceSession(s, { type: 'confirm' }, CAP);
    seen.push(s.phase);
    s = reduceVoiceSession(s, { type: 'executed' }, CAP);
    seen.push(s.phase);
    expect(seen).toEqual(['idle', 'listening', 'listening', 'parsed', 'executing', 'idle']);
  });

  it('破壊的コマンドを cancel で中断すると executing に到達しない', () => {
    const s = run([
      { type: 'start' },
      { type: 'transcript', text: DESTRUCTIVE_UTTERANCE },
      { type: 'parsed' },
      { type: 'cancel' },
    ]);
    expect(s.phase).toBe('idle');
    expect(s.phase).not.toBe('executing');
  });
});

// ===== セレクタ =============================================================

describe('セレクタ', () => {
  describe('isAwaitingConfirmation', () => {
    it('awaiting-confirmation で true', () => {
      const s = run([{ type: 'start' }, { type: 'transcript', text: DESTRUCTIVE_UTTERANCE }, { type: 'parsed' }]);
      expect(isAwaitingConfirmation(s)).toBe(true);
    });
    it('それ以外で false', () => {
      expect(isAwaitingConfirmation(INITIAL_VOICE_SESSION)).toBe(false);
      expect(isAwaitingConfirmation(listeningWith(NAV_UTTERANCE))).toBe(false);
      const parsed = run([{ type: 'start' }, { type: 'transcript', text: NAV_UTTERANCE }, { type: 'parsed' }]);
      expect(isAwaitingConfirmation(parsed)).toBe(false);
    });
  });

  describe('executableIntent', () => {
    it('executing 状態で intent を返す', () => {
      const exec = run([
        { type: 'start' },
        { type: 'transcript', text: NAV_UTTERANCE },
        { type: 'parsed' },
        { type: 'confirm' },
      ]);
      const intent = executableIntent(exec);
      expect(intent).not.toBeNull();
      expect(intent?.serviceId).toBe('github');
    });
    it('executing 以外では null', () => {
      expect(executableIntent(INITIAL_VOICE_SESSION)).toBeNull();
      const await1 = run([{ type: 'start' }, { type: 'transcript', text: DESTRUCTIVE_UTTERANCE }, { type: 'parsed' }]);
      expect(executableIntent(await1)).toBeNull();
      const parsed = run([{ type: 'start' }, { type: 'transcript', text: NAV_UTTERANCE }, { type: 'parsed' }]);
      expect(executableIntent(parsed)).toBeNull();
    });
    it('executing だが intent が無い人工状態では null', () => {
      const artificial: VoiceSessionState = { phase: 'executing', needsConfirmation: false };
      expect(executableIntent(artificial)).toBeNull();
    });
  });

  describe('isListening', () => {
    it('listening で true', () => {
      expect(isListening(listeningWith(NAV_UTTERANCE))).toBe(true);
      expect(isListening(reduceVoiceSession(INITIAL_VOICE_SESSION, { type: 'start' }, CAP))).toBe(true);
    });
    it('それ以外で false', () => {
      expect(isListening(INITIAL_VOICE_SESSION)).toBe(false);
      const parsed = run([{ type: 'start' }, { type: 'transcript', text: NAV_UTTERANCE }, { type: 'parsed' }]);
      expect(isListening(parsed)).toBe(false);
    });
  });
});
